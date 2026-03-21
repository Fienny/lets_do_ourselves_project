from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Auth
    secret_key: str = "dev-insecure-key-change-in-prod"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""

    # Quotas
    free_requests_per_month: int = 30
    paid_requests_per_month: int = 999_999

    # Server
    allowed_origins: str = "vscode-webview://,http://localhost:3000"
    database_url: str = "sqlite:///./ldo.db"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
