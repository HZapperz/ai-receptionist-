from typing import Any

from pydantic import BaseModel, Field

from agents.outbound.prompt import system_prompt
from agents.runtime.ctx import Ctx
from agents.runtime.shared_tools import SHARED_TOOLS
from agents.runtime.tools import AgentSpec, Tool


class GetLeadArgs(BaseModel):
    lead_id: str


class SaveDraftArgs(BaseModel):
    lead_id: str
    subject: str = Field(max_length=90)
    body: str


def _extract_snippet(raw: Any) -> str:
    if not raw:
        return ""
    if isinstance(raw, str):
        return raw[:300].strip()
    if isinstance(raw, dict):
        text = raw.get("description") or raw.get("about")
        if not text and isinstance(raw.get("reviews"), list) and raw["reviews"]:
            first = raw["reviews"][0]
            if isinstance(first, dict):
                text = first.get("text")
        if not text:
            text = raw.get("snippet") or raw.get("overview")
        if not text:
            text = raw.get("categoryName") or raw.get("category") or ""
        return str(text)[:300].strip()
    return str(raw)[:300].strip()


async def get_lead(ctx: Ctx, args: GetLeadArgs | dict | None = None, **kwargs) -> dict:
    if args is None:
        args = kwargs
    if isinstance(args, dict):
        args = GetLeadArgs(**args)

    lead_id = args.lead_id
    rows = ctx.db.table("leads").select("*").eq("id", lead_id).limit(1).execute().data
    if not rows:
        return {"error": f"Lead {lead_id} not found"}

    lead = rows[0]
    rating_val = lead.get("rating")
    try:
        rating = float(rating_val) if rating_val is not None else None
    except (ValueError, TypeError):
        rating = None

    snippet = _extract_snippet(lead.get("raw"))

    return {
        "lead_id": str(lead.get("id") or lead_id),
        "name": lead.get("name") or "",
        "address": lead.get("address") or "",
        "rating": rating,
        "website": lead.get("website"),
        "phone": lead.get("phone"),
        "email": lead.get("email"),
        "status": lead.get("status") or "new",
        "snippet": snippet,
    }


async def save_draft(ctx: Ctx, args: SaveDraftArgs | dict | None = None, **kwargs) -> dict:
    if args is None:
        args = kwargs
    if isinstance(args, dict):
        args = SaveDraftArgs(**args)

    lead_id = args.lead_id
    rows = ctx.db.table("leads").select("id").eq("id", lead_id).limit(1).execute().data
    if not rows:
        return {"error": f"Lead {lead_id} not found"}

    ctx.db.table("leads").update({
        "draft_subject": args.subject,
        "draft_body": args.body,
        "status": "drafted",
    }).eq("id", lead_id).execute()

    return {"ok": True, "lead_id": lead_id, "status": "drafted"}

OUTBOUND_DRAFTER = AgentSpec(
    name="outbound",
    system_prompt=system_prompt,
    tools=[
        Tool("get_lead", "Read one lead: name, address, rating, website and a short snippet.", GetLeadArgs, get_lead),
        Tool("save_draft", "Save the email subject and body for a lead.", SaveDraftArgs, save_draft),
        *SHARED_TOOLS,
    ],
)
