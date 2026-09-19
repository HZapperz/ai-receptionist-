# Shared area: announce in the team chat before editing (see CLAUDE.md).
from functools import lru_cache

from supabase import Client, create_client

from agents.settings import settings


@lru_cache
def get_db() -> Client:
    """Service-role client. Bypasses RLS, so it stays in this process."""
    key = settings.effective_service_role_key()
    if not settings.SUPABASE_URL or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY)")
    return create_client(settings.SUPABASE_URL, key)


def load_config(db) -> dict:
    rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
    return rows[0]["data"] if rows else {}
