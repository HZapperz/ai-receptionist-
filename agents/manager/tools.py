from typing import Literal

from pydantic import BaseModel

from agents.manager.prompt import system_prompt
from agents.runtime.ctx import Ctx
from agents.runtime.shared_tools import SHARED_TOOLS
from agents.runtime.tools import AgentSpec, Tool


class GetSummaryArgs(BaseModel):
    since_minutes: int = 60


class ListLeadsArgs(BaseModel):
    status: Literal["new", "drafted", "sent", "replied"] | None = None
    limit: int = 10


class ListBookingsArgs(BaseModel):
    status: Literal["confirmed", "cancelled"] | None = None
    limit: int = 10


class GetConversationArgs(BaseModel):
    phone_or_name: str


class CreateTaskArgs(BaseModel):
    for_agent: Literal["outbound", "inbound"]
    kind: Literal["find_leads", "draft_emails", "follow_up"]
    payload: dict


async def get_summary(ctx: Ctx, args: GetSummaryArgs) -> dict:
    # STUB: manager. Count rows created in the last args.since_minutes.
    return {"texts_in": 0, "texts_out": 0, "bookings": 0, "leads_new": 0, "leads_drafted": 0,
            "emails_sent": 0, "lead_replies": 0, "escalations": 0, "notable": []}


async def list_leads(ctx: Ctx, args: ListLeadsArgs) -> dict:
    # STUB: manager. Select from leads, filtered by status, newest first.
    return {"rows": []}


async def list_bookings(ctx: Ctx, args: ListBookingsArgs) -> dict:
    # STUB: manager. Select from bookings, filtered by status, newest first.
    return {"rows": []}


async def get_conversation(ctx: Ctx, args: GetConversationArgs) -> dict:
    # STUB: manager. Find the customer by phone or name; last 20 messages.
    return {"phone": None, "name": None, "messages": []}


async def create_task(ctx: Ctx, args: CreateTaskArgs) -> dict:
    # STUB: manager. Insert into tasks (created_by "manager"). Add this tool last;
    # the /manager route already starts any pending task this run created.
    return {"task_id": None, "status": "pending"}


MANAGER = AgentSpec(
    name="manager",
    system_prompt=system_prompt,
    tools=[
        Tool("get_summary", "Counts and notable events since N minutes ago.", GetSummaryArgs, get_summary),
        Tool("list_leads", "Partner leads, optionally filtered by status.", ListLeadsArgs, list_leads),
        Tool("list_bookings", "Bookings, optionally filtered by status.", ListBookingsArgs, list_bookings),
        Tool("get_conversation", "The last 20 texts with a customer, by phone or name.",
             GetConversationArgs, get_conversation),
        Tool("create_task", "Hand work to the outbound or inbound agent.", CreateTaskArgs, create_task),
        *SHARED_TOOLS,
    ],
)
