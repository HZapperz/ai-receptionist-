import os
import shutil
import uuid
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Every env var from .env.example. Names are frozen in docs/CONTRACTS.md."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # model
    LLM_BASE_URL: str = "https://api.featherless.ai/v1"
    LLM_API_KEY: str = ""
    FEATHERLESS_API: str = ""
    LLM_MODEL: str = "Qwen/Qwen3.8-27B"
    LLM_MAX_CONCURRENCY: int = 6
    LLM_DISABLE_THINKING: bool = False  # on: with it off, Qwen skipped tools and made up prices
    LLM_FAKE: bool = False

    # supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    NEXT_PUBLIC_SUPABASE_URL: str = ""
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str = ""
    SUPABASE_KEY: str = ""

    # manager & omp runtime
    MANAGER_SESSION_ID: str = "00000000-0000-0000-0000-000000000001"
    MANAGER_MODEL: str = ""
    MANAGER_RUNTIME_DIR: str = str(Path.home() / ".local/share/ai-receptionist")
    OMP_BINARY: str = "omp"

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
    APIFY_ACTOR_ID: str = "compass/crawler-google-places"

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

    def effective_llm_api_key(self) -> str:
        return self.LLM_API_KEY or self.FEATHERLESS_API

    def effective_service_role_key(self) -> str:
        return self.SUPABASE_SERVICE_ROLE_KEY or self.SUPABASE_KEY

    def manager_session_uuid(self) -> uuid.UUID:
        return uuid.UUID(self.MANAGER_SESSION_ID)

    def receptionist_root(self) -> Path:
        return Path(__file__).resolve().parent.parent

    def runtime_dir(self) -> Path:
        path = Path(self.MANAGER_RUNTIME_DIR)
        if not path.is_absolute():
            path = self.receptionist_root() / path
        return path

    def workspace_dir(self) -> Path:
        return self.runtime_dir() / "workspace"

    def sessions_dir(self) -> Path:
        return self.runtime_dir() / "sessions"

    def lock_path(self) -> Path:
        return self.runtime_dir() / "manager.lock"

    def effective_omp_binary(self) -> str:
        if self.OMP_BINARY and self.OMP_BINARY != "omp":
            return self.OMP_BINARY
        repo_bin = self.receptionist_root() / "node_modules" / ".bin" / "omp"
        if repo_bin.is_file() and os.access(repo_bin, os.X_OK):
            return str(repo_bin)
        system_omp = shutil.which("omp")
        if system_omp:
            return system_omp
        return self.OMP_BINARY


settings = Settings()
