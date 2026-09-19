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


async def get_lead(ctx: Ctx, args: GetLeadArgs) -> dict:
    # STUB: outbound. Read the lead row; snippet is 300 characters or fewer from raw.
    return {"lead_id": args.lead_id, "name": "Example Apartments", "address": "Houston, TX",
            "rating": 4.5, "website": None, "snippet": ""}


async def save_draft(ctx: Ctx, args: SaveDraftArgs) -> dict:
    # STUB: outbound. Save draft_subject and draft_body, set status drafted.
    return {"ok": True}


OUTBOUND_DRAFTER = AgentSpec(
    name="outbound",
    system_prompt=system_prompt,
    tools=[
        Tool("get_lead", "Read one lead: name, address, rating, website and a short snippet.", GetLeadArgs, get_lead),
        Tool("save_draft", "Save the email subject and body for a lead.", SaveDraftArgs, save_draft),
        *SHARED_TOOLS,
    ],
)
