from datetime import datetime
from zoneinfo import ZoneInfo

from agents.runtime.ctx import Ctx
from agents.settings import settings


def system_prompt(ctx: Ctx) -> str:
    # STUB: outbound. Real drafting prompt goes here; the rules below are the minimum.
    cfg = ctx.config or {}
    out = cfg.get("outbound", {})
    today = datetime.now(ZoneInfo("America/Chicago")).strftime("%A, %B %-d, %Y")
    return f"""You draft one short partnership email for {cfg.get("name", "Royal Pawz")}, a mobile dog grooming company in Houston.
Today is {today}. Tone: {cfg.get("tone", "Warm, brief, plain words.")}
Audience: {out.get("audience", "")}. Offer: {out.get("offer", "")}

Rules:
- Call get_lead, write the email, then call save_draft once.
- 120 words or fewer, plain text, no markdown.
- Name the property. Use one detail from the lead record if there is a real one; never invent details.
- One offer and one call to action. The call to action: text {settings.AI_GATE_CODE or "<the gate code>"} to (833) 302-8947.
- Footer: {cfg.get("name", "Royal Pawz")}, {cfg.get("mailing_address", "")}, and "Reply STOP and we will not email again." """
