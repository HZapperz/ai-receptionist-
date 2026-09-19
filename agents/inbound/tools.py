import difflib
import re
import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal

from pydantic import BaseModel

from agents import booking
from agents.inbound.prompt import (HOUSTON, area_text, hours_text, policies_text, services_text,
                                   system_prompt)
from agents.inbound.twilio_io import send_sms
from agents.runtime.ctx import Ctx
from agents.runtime.shared_tools import SHARED_TOOLS
from agents.runtime.tools import AgentSpec, Tool
from agents.settings import settings

Size = Literal["small", "medium", "large", "xl"]
Coat = Literal["short", "medium", "long", "double"]

BOOK_AHEAD_DAYS = 14
MIN_LEAD_TIME = timedelta(hours=1)
# Words that differ between how a property is written and how people say it.
LEAD_FILLER = {"apartments", "apartment", "apts", "apt", "the", "at", "of", "homes",
               "residences", "community"}


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


def slot_label(starts: datetime) -> str:
    """Houston time, like "Sat Sep 26, 9:00 AM"."""
    s = starts.astimezone(HOUSTON)
    return f"{s:%a %b} {s.day}, {s.hour % 12 or 12}:{s:%M %p}"


def _slot(starts: datetime, slot_id: str) -> dict:
    return {"slot_id": slot_id, "starts_at": starts.isoformat(), "label": slot_label(starts)}


def _day_start(d: date) -> str:
    return datetime.combine(d, time.min, tzinfo=HOUSTON).isoformat()


def _spread(open_slots: list[tuple[datetime, str]], n: int = 3) -> list[tuple[datetime, str]]:
    """Up to n slots, one per day first, so a week-long range doesn't return one morning."""
    picked, days = [], set()
    for s in open_slots:
        if len(picked) < n and s[0].date() not in days:
            picked.append(s)
            days.add(s[0].date())
    for s in open_slots:
        if len(picked) < n and s not in picked:
            picked.append(s)
    return sorted(picked)


async def get_info(ctx: Ctx, args: GetInfoArgs) -> dict:
    cfg = ctx.config or {}
    texts = {
        "hours": hours_text(cfg),
        "area": area_text(cfg),
        "services": services_text(cfg) + "\nPrices depend on size and coat; use quote.",
        "policies": policies_text(cfg),
    }
    return {"text": texts[args.topic]}


async def quote(ctx: Ctx, args: QuoteArgs) -> dict:
    return booking.quote(ctx.config or {}, args)


async def find_slots(ctx: Ctx, args: FindSlotsArgs) -> dict:
    now = datetime.now(HOUSTON)
    today, last = now.date(), now.date() + timedelta(days=BOOK_AHEAD_DAYS)
    lo, hi = sorted((args.date_from, args.date_to))
    lo, hi = max(lo, today), min(hi, last)
    rows = (ctx.db.table("slots").select("id,starts_at,capacity,booked")
            .gte("starts_at", _day_start(today)).lt("starts_at", _day_start(last + timedelta(days=1)))
            .order("starts_at").execute().data)
    # PostgREST can't compare two columns, so "has room" is checked here.
    open_slots = []
    for r in rows:
        starts = datetime.fromisoformat(r["starts_at"]).astimezone(HOUSTON)
        if r["booked"] < r["capacity"] and starts > now + MIN_LEAD_TIME:
            open_slots.append((starts, r["id"]))

    in_range = [s for s in open_slots if lo <= s[0].date() <= hi]
    if in_range:
        return {"slots": [_slot(*s) for s in _spread(in_range)]}
    later = [s for s in open_slots if s[0].date() >= lo] or open_slots
    if not later:
        return {"slots": [], "note": f"no open slots in the next {BOOK_AHEAD_DAYS} days"}
    note = ("we book up to 14 days ahead; these are the next open slots" if lo > last
            else "none open in that range; these are the next open slots")
    return {"slots": [_slot(*s) for s in later[:3]], "note": note}


async def book(ctx: Ctx, args: BookArgs) -> dict:
    if not ctx.phone:
        return {"error": "no customer phone in this conversation"}
    priced = booking.quote(ctx.config or {}, args)
    if "error" in priced:
        return priced
    try:
        uuid.UUID(args.slot_id)
    except ValueError:
        return {"error": "unknown slot_id; call find_slots for that day"}
    slots = ctx.db.table("slots").select("starts_at").eq("id", args.slot_id).limit(1).execute().data
    if not slots:
        return {"error": "unknown slot_id; call find_slots for that day"}
    starts = datetime.fromisoformat(slots[0]["starts_at"]).astimezone(HOUSTON)
    if starts <= datetime.now(HOUSTON) + MIN_LEAD_TIME:
        return {"error": "that time is too soon or has passed; call find_slots"}

    # A repeated book call must not take a second place in the same slot.
    row = booking.find_booking(ctx.db, ctx.phone, args.slot_id, args.pet_name)
    if not row:
        if not booking.take_slot(ctx.db, args.slot_id):
            return {"error": "slot_taken"}
        details = {"size": args.size, "coat": args.coat, "addons": list(dict.fromkeys(args.addons)),
                   "line_items": priced["line_items"]}
        try:
            row = booking.create_booking(
                ctx.db, phone=ctx.phone, service=args.service, pet_name=args.pet_name, details=details,
                slot_id=args.slot_id, total_cents=priced["total_cents"], customer_name=args.customer_name)
        except Exception as e:
            booking.release_slot(ctx.db, args.slot_id)
            return {"error": f"could not save the booking: {str(e)[:200]}"}
    return {"booking_id": row["id"], "starts_at": starts.isoformat(), "label": slot_label(starts),
            "total_cents": row["total_cents"], "status": "confirmed"}


def _norm(name: str) -> str:
    words = re.sub(r"[^\w\s]", " ", (name or "").lower()).split()
    return " ".join(w for w in words if w not in LEAD_FILLER)


async def lookup_lead(ctx: Ctx, args: LookupLeadArgs) -> dict:
    want = _norm(args.property_name)
    not_found = {"found": False, "lead_id": None, "name": None, "status": None}
    if not want:
        return not_found
    best, best_score = None, None
    for lead in ctx.db.table("leads").select("id,name,status").limit(500).execute().data:
        have = _norm(lead["name"])
        if not have:
            continue
        contains = f" {want} " in f" {have} " or f" {have} " in f" {want} "
        ratio = difflib.SequenceMatcher(None, want, have).ratio()
        if not contains and ratio < 0.6:
            continue
        score = (contains, ratio)
        if best_score is None or score > best_score:
            best, best_score = lead, score
    if not best:
        return not_found

    ctx.db.table("leads").update({"status": "replied"}).eq("id", best["id"]).execute()
    ctx.db.table("shared_notes").insert({
        "about": f"lead:{best['id']}", "written_by": ctx.agent,
        "note": f"Texted the business number from {ctx.phone} and named the property as "
                f"\"{args.property_name}\".",
    }).execute()
    return {"found": True, "lead_id": best["id"], "name": best["name"], "status": "replied"}


async def escalate(ctx: Ctx, args: EscalateArgs) -> dict:
    if not settings.OWNER_PHONE:
        return {"ok": True, "note": "no OWNER_PHONE"}
    suffix = f" (from {ctx.phone})"
    head = f"[{args.reason}] {args.summary.strip()}"
    if len(head) + len(suffix) > 300:
        head = head[:300 - len(suffix) - 3].rstrip() + "..."
    sent = await send_sms(settings.OWNER_PHONE, head + suffix)
    return sent if "error" in sent else {"ok": True}


INBOUND = AgentSpec(
    name="inbound",
    system_prompt=system_prompt,
    tools=[
        Tool("get_info", "Business hours, service area (cities and ZIP codes), services or policies.",
             GetInfoArgs, get_info),
        Tool("quote", "Price a service for a pet's size and coat, with optional add-ons. Prices are in cents.",
             QuoteArgs, quote),
        Tool("find_slots", "Up to three open appointment times between two dates (YYYY-MM-DD).",
             FindSlotsArgs, find_slots),
        Tool("book", "Book a slot the customer picked. Creates a confirmed booking.", BookArgs, book),
        Tool("lookup_lead", "Check whether a property the customer named is one of our partner leads.",
             LookupLeadArgs, lookup_lead),
        Tool("escalate", "Text the owner a summary when a person needs to step in.", EscalateArgs, escalate),
        *SHARED_TOOLS,
    ],
)
