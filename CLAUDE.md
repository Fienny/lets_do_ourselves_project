# CLAUDE.md — Agent Action Log

This file is maintained by Claude Code and records every significant action taken on this codebase.

---

## Session 1 — Initial build (VS Code Extension MVP)

### Philosophy rewrite
Received the full business plan. Identified that the existing implementation was a one-way code analyzer, not a Socratic mentor. Rewrote the entire core.

### `src/openaiClient.ts`
- Replaced single analysis prompt with three distinct system prompts:
  - **Learn Mode** — pure Socratic method, never answers, always questions
  - **Hint Mode** — smallest nudge to unblock, no code
  - **Emergency Mode** — full conceptual walkthrough, plain English only
- Added `MentorMode` type and `getSystemPrompt()` helper
- Added `getModeLabel()` for UI display
- Added `getApiKey()` / `setApiKey()` using VS Code secret storage
- Replaced one-shot `analyzeCode()` with `streamChat()` using OpenAI streaming API
- Added `ChatMessage` and `StreamChunk` types
- History passed on every request (up to 20 turns)
- `max_tokens: 1024` intentionally capped — mentors are concise

### `src/webviewPanel.ts`
- Replaced results-dump panel with a full **chat UI**
- Mode switcher in header (Learn / Hint / Emergency pill buttons)
- Streaming message bubbles: user messages right-aligned, mentor left-aligned
- Blinking cursor during streaming
- Context bar: shows attached file/selection, dismissible
- Action row: Attach current file, Attach selection, Clear chat, API Key
- Minimal markdown renderer (headings, bold, lists) — intentionally no code block rendering
- Empty state with product tagline
- `onMessage` handler dispatches to extension commands

### `src/analysisEngine.ts`
- Replaced prompt-building functions with **context payload builders**
- `buildFileContext()` — wraps a file for chat context injection
- `buildSelectionContext()` — wraps a code selection
- `buildProjectContext()` — folder tree + key file contents (budget: 12,000 chars)
- `buildUserMessage()` — merges user text + attached context
- Context injected into first message only, then cleared (prevents token bloat)

### `src/extension.ts`
- Added `SessionState` interface: `mode`, `history`, `attachedContext`
- Mode switch resets history (fresh mental model per mode)
- History bounded to last 20 messages
- Commands registered:
  - `ldo.setApiKey` — prompts for OpenAI key, stores in secrets
  - `ldo.attachFile` — scans current editor file
  - `ldo.attachSelection` — grabs editor selection
  - `ldo.attachProject` — scans entire workspace
- Prompt for API key on first activation

### `package.json`
- Renamed display name to `"Let's Code Ourselves"`
- Added `ldo.openaiModel`, `ldo.defaultMode`, `ldo.maxFileSizeKb`, `ldo.excludePatterns` settings
- Added sidebar view container + webview view
- Added editor context menu items (Attach file, Attach selection)

---

## Session 2 — FastAPI backend (Weeks 2–4 of roadmap)

### New: `backend/` directory

#### `backend/requirements.txt`
FastAPI, uvicorn, SQLAlchemy, Alembic, python-jose, passlib, httpx, openai, stripe, pydantic-settings.

#### `backend/.env.example`
Template for all required env vars with inline documentation.

#### `backend/app/config.py`
- `pydantic-settings` `Settings` class
- Reads from `.env` file
- Exposes: `openai_api_key`, `openai_model`, `secret_key`, `algorithm`, `access_token_expire_minutes`, `stripe_*`, `free_requests_per_month`, `paid_requests_per_month`, `allowed_origins`, `database_url`
- `origins_list` property splits comma-separated origins

#### `backend/app/database.py`
- SQLAlchemy engine + `SessionLocal`
- `get_db()` FastAPI dependency (yields session, closes on exit)
- `create_tables()` called at app startup via lifespan
- SQLite by default; swap `DATABASE_URL` to `postgresql://` for production

#### `backend/app/models/user.py`
`User` table:
- `id`, `email` (unique, indexed), `hashed_password`
- `is_active`, `is_paid`
- `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` (free/active/canceled/past_due)
- `created_at`, `updated_at`

#### `backend/app/models/usage.py`
`UsageRecord` table:
- `id`, `user_id` (FK → users), `mode`, `tokens_used`
- `created_at`, `month_bucket` (e.g. `"2026-03"`) — indexed for fast quota queries

#### `backend/app/routers/auth.py`
- `POST /auth/register` — creates user, returns JWT
- `POST /auth/login` — OAuth2 password form, returns JWT
- `GET  /auth/me` — returns current user info
- `get_current_user()` FastAPI dependency — validates JWT, used by all protected routes
- Passwords hashed with bcrypt via passlib
- JWT signed with HS256, 7-day expiry by default

#### `backend/app/routers/chat.py`
- `POST /chat/stream` — protected, checks quota, streams SSE response
  - Records usage **before** streaming (prevents abuse on disconnect)
  - Calls `stream_mentor_response()` from AI service
  - Returns `StreamingResponse` with `text/event-stream`
- `GET /chat/quota` — returns `{used, limit, remaining, tier, month}`
- Quota check: free = 30 req/month, paid = unlimited (configurable in env)

#### `backend/app/routers/billing.py`
- `POST /billing/subscribe` — creates Stripe Checkout session, returns `checkout_url`
- `GET  /billing/portal` — creates Stripe Customer Portal session, returns `portal_url`
- `POST /billing/webhook` — handles Stripe events:
  - `checkout.session.completed` → set `is_paid=True`, save subscription ID
  - `customer.subscription.updated` → sync `subscription_status`
  - `customer.subscription.deleted` → set `is_paid=False`, `status=canceled`
- Webhook signature verified with `stripe.Webhook.construct_event`

#### `backend/app/services/ai.py`
- `stream_mentor_response()` async generator
- Calls OpenAI with system prompt + history
- Emits SSE events: `chunk` (delta text), `replace` (after rule engine redaction), `done` (full text), `error`
- Post-stream: applies rule engine to full response; emits `replace` if redacted

#### `backend/app/services/rule_engine.py`
**The core philosophy enforcer.** Validates responses before they reach the user:

| Rule | Mode | Severity | Action |
|---|---|---|---|
| Contains code block (` ``` `) | All | block | Redact — replace with "I'm here to help you think" |
| Missing `?` | Learn | warn | Log violation |
| Starts with direct answer phrase | Learn | warn | Log violation |
| Response > 1200 chars | Learn/Hint | warn | Log violation |

- `apply_rules()` returns `(cleaned_text, violations)`
- `redact_code_blocks()` strips fenced code blocks and inserts redirect message
- System prompts for all three modes also live here (single source of truth for backend)

#### `backend/app/main.py`
- FastAPI app with `lifespan` (creates tables on startup)
- CORS middleware configured from `settings.origins_list`
- Routers mounted: auth, chat, billing
- `GET /health` endpoint

---

### Extension updates (Session 2)

#### `src/openaiClient.ts`
- Added `StreamCallbacks` interface: `onChunk`, `onReplace`, `onDone`, `onError`
- Added `getBackendToken()` / `setBackendToken()` for JWT storage in VS Code secrets
- `streamChat()` now routes based on `ldo.backendUrl` setting:
  - **Backend mode** — calls `/chat/stream`, parses SSE, handles quota errors with friendly message
  - **Direct mode** — calls OpenAI directly (development / no backend)
- SSE parser in `streamFromBackend()` handles `chunk`, `replace`, `done`, `error` events
- Unescapes `\n` in SSE data back to real newlines

#### `src/extension.ts`
- Added `ldo.login` command — fetches JWT from backend, stores in secrets
- Added `ldo.register` command — creates account + stores JWT
- Updated `handleUserMessage()` to use new `StreamCallbacks` interface
- Added `onReplace` callback → calls `panel.replaceLastMessage()` when rule engine redacts

#### `src/webviewPanel.ts`
- Added `replaceMessage` to `WebviewOutgoingMessage` type
- Added `replaceLastMessage()` method on `AdvisorPanel`
- Added `replaceMessage` case in webview JS message handler — replaces full streaming bubble content

#### `package.json`
- Added `ldo.backendUrl` setting
- Added `ldo.login` and `ldo.register` commands
