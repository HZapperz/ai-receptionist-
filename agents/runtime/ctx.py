from dataclasses import dataclass
from typing import Any

@dataclass
class Ctx:
    db: Any                      # supabase client, service role
    config: dict                 # business_config.data
    agent: str                   # "inbound" | "outbound" | "manager"
    ref: str | None = None       # phone, lead id or task id, for agent_events.ref
    phone: str | None = None
    customer: dict | None = None
    task: dict | None = None
