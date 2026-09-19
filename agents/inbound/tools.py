from datetime import date
from typing import Literal

from pydantic import BaseModel

from agents.inbound.prompt import system_prompt
from agents.runtime.ctx import Ctx
from agents.runtime.shared_tools import SHARED_TOOLS
from agents.runtime.tools import AgentSpec, Tool

Size = Literal["small", "medium", "large", "xl"]
Coat = Literal["short", "medium", "long", "double"]


class GetInfoArgs(BaseModel):
    topic: Literal["hours", "area", "services", "policies"]


class QuoteArgs(BaseModel):
    service: str                      # a key from business_config.data.services
    size: Size
    coat: Coat = "short"
    addons: list[str] = []            # keys from business_config.data.addons


class FindSlotsArgs(BaseModel):
    date_from: date
    date_to: date


class BookArgs(QuoteArgs):
    slot_id: str
    pet_name: str
    customer_name: str | None = None


class LookupLeadArgs(BaseModel):
    property_name: str


class EscalateArgs(BaseModel):
    reason: Literal["refund", "complaint", "medical", "aggressive_pet",
                    "off_menu", "partner_lead", "other"]
    summary: str


async def get_info(ctx: Ctx, args: GetInfoArgs) -> dict:
    # STUB: inbound. Read hours / service_area_zips / services / policies from ctx.config.
    return {"text": "Mon-Sat 8am-6pm"}


async def quote(ctx: Ctx, args: QuoteArgs) -> dict:
    # STUB: inbound. Call agents.booking.quote(ctx.config, args).
    return {"line_items": [{"label": "Full groom (medium)", "cents": 10500}], "total_cents": 10500}


async def find_slots(ctx: Ctx, args: FindSlotsArgs) -> dict:
    # STUB: inbound. Up to 3 slots between the dates where booked < capacity.
    return {"slots": [{"slot_id": "00000000-0000-0000-0000-000000000000",
                       "starts_at": "2026-09-21T09:00:00-05:00"}]}


async def book(ctx: Ctx, args: BookArgs) -> dict:
    # STUB: inbound. Recompute the price with agents.booking.quote(), take_slot(),
    # then create_booking(). Return {"error": "slot_taken"} when the slot is gone.
    return {"booking_id": "00000000-0000-0000-0000-000000000000", "starts_at": "2026-09-21T09:00:00-05:00",
            "total_cents": 10500, "status": "confirmed"}


async def lookup_lead(ctx: Ctx, args: LookupLeadArgs) -> dict:
    # STUB: inbound. Match args.property_name against leads.name; set status replied when found.
    return {"found": False, "lead_id": None, "name": None, "status": None}


async def escalate(ctx: Ctx, args: EscalateArgs) -> dict:
    # STUB: inbound. Text OWNER_PHONE the summary with agents.inbound.twilio_io.send_sms.
    return {"ok": True}


INBOUND = AgentSpec(
    name="inbound",
    system_prompt=system_prompt,
    tools=[
        Tool("get_info", "Business hours, service area, services or policies.", GetInfoArgs, get_info),
        Tool("quote", "Price a service for a pet's size and coat, with optional add-ons.", QuoteArgs, quote),
        Tool("find_slots", "Up to three open appointment slots between two dates.", FindSlotsArgs, find_slots),
        Tool("book", "Book a slot the customer picked. Creates a confirmed booking.", BookArgs, book),
        Tool("lookup_lead", "Check whether a property the customer named is one of our partner leads.",
             LookupLeadArgs, lookup_lead),
        Tool("escalate", "Text the owner a summary when a person needs to step in.", EscalateArgs, escalate),
        *SHARED_TOOLS,
    ],
)
