"""
Billing router — Stripe integration.

Routes:
  POST /billing/subscribe      Create a Stripe checkout session
  GET  /billing/portal         Customer portal (manage subscription)
  POST /billing/webhook        Stripe webhook — handle subscription events
"""

from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from ..routers.auth import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = settings.stripe_secret_key


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create_customer(user: User, db: Session) -> str:
    """Return existing Stripe customer ID or create a new one."""
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
    user.stripe_customer_id = customer.id
    db.commit()
    return customer.id


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/subscribe", response_model=CheckoutResponse)
def create_checkout_session(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """
    Creates a Stripe Checkout session for the paid plan.
    The client redirects the user to checkout_url.
    """
    if not settings.stripe_secret_key or not settings.stripe_price_id:
        raise HTTPException(status_code=503, detail="Billing not configured")

    if current_user.is_paid:
        raise HTTPException(status_code=400, detail="Already subscribed")

    customer_id = _get_or_create_customer(current_user, db)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        mode="subscription",
        success_url="https://lets-code-ourselves.com/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url="https://lets-code-ourselves.com/pricing",
        metadata={"user_id": str(current_user.id)},
    )

    return CheckoutResponse(checkout_url=session.url)


@router.get("/portal", response_model=PortalResponse)
def customer_portal(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """Returns a URL for the Stripe customer portal (cancel, update card, etc.)."""
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=current_user.stripe_customer_id,
        return_url="https://lets-code-ourselves.com/settings",
    )
    return PortalResponse(portal_url=session.url)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receives events from Stripe and updates user subscription status.

    Events handled:
      checkout.session.completed     → activate subscription
      customer.subscription.updated  → sync status
      customer.subscription.deleted  → downgrade to free
    """
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    match event["type"]:
        case "checkout.session.completed":
            _handle_checkout_completed(event["data"]["object"], db)
        case "customer.subscription.updated":
            _handle_subscription_updated(event["data"]["object"], db)
        case "customer.subscription.deleted":
            _handle_subscription_deleted(event["data"]["object"], db)

    return {"received": True}


# ─── Event handlers ───────────────────────────────────────────────────────────

def _find_user_by_customer(customer_id: str, db: Session) -> User | None:
    return db.query(User).filter(User.stripe_customer_id == customer_id).first()


def _handle_checkout_completed(session: dict, db: Session) -> None:
    user_id = session.get("metadata", {}).get("user_id")
    if not user_id:
        return

    user = db.get(User, int(user_id))
    if not user:
        return

    user.is_paid = True
    user.stripe_subscription_id = session.get("subscription")
    user.subscription_status = "active"
    db.commit()


def _handle_subscription_updated(subscription: dict, db: Session) -> None:
    user = _find_user_by_customer(subscription["customer"], db)
    if not user:
        return

    sub_status = subscription.get("status", "unknown")
    user.subscription_status = sub_status
    user.is_paid = sub_status in ("active", "trialing")
    db.commit()


def _handle_subscription_deleted(subscription: dict, db: Session) -> None:
    user = _find_user_by_customer(subscription["customer"], db)
    if not user:
        return

    user.is_paid = False
    user.subscription_status = "canceled"
    user.stripe_subscription_id = None
    db.commit()
