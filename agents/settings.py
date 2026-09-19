from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Every env var from .env.example. Names are frozen in docs/CONTRACTS.md."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # model
    LLM_BASE_URL: str = "https://api.featherless.ai/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "Qwen/Qwen3.8-27B"
    LLM_MAX_CONCURRENCY: int = 6
    LLM_DISABLE_THINKING: bool = False  # on: with it off, Qwen skipped tools and made up prices
    LLM_FAKE: bool = False

    # supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    NEXT_PUBLIC_SUPABASE_URL: str = ""
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str = ""

    # dashboard -> agents service
    AGENTS_URL: str = "http://localhost:8000"

    # twilio
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""
    TWILIO_VALIDATE_SIGNATURE: bool = True
    PUBLIC_AGENTS_URL: str = ""
    OWNER_PHONE: str = ""

    # apify
    APIFY_TOKEN: str = ""
    APIFY_ACTOR_ID: str = "lukaskrivka/google-maps-with-contact-details"

    # email
    EMAIL_PROVIDER: str = "resend"
    EMAIL_API_KEY: str = ""
    EMAIL_FROM: str = ""
    SEND_ALLOWLIST: str = ""

    # 833 gate
    AI_GATE_CODE: str = ""
    AI_GATE_TTL_HOURS: int = 24
    PROD_SMS_WEBHOOK_URL: str = ""

    def send_allowlist(self) -> set[str]:
        return {a.strip().lower() for a in self.SEND_ALLOWLIST.split(",") if a.strip()}


settings = Settings()
