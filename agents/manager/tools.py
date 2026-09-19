"""Trusted domain operations exposed to the manager OMP session.

All writes that can affect a customer (SMS and bookings) are proposals. The
runtime is the only caller allowed to decide or execute those proposals.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from agents import booking
from agents.db import get_db, load_config
from agents.inbound.twilio_io import send_sms
from agents.manager.prompt import system_prompt
from agents.runtime.ctx import Ctx
from agents.runtime.shared_tools import SHARED_TOOLS
from agents.runtime.tools import AgentSpec, Tool
from agents.settings import settings

DEFAULT_SESSION_ID = "00000000-0000-0000-0000-000000000001"


def _session_id(ctx: Ctx) -> str:
    value = getattr(ctx, "session_id", None) or os.getenv("MANAGER_SESSION_ID", DEFAULT_SESSION_ID)
    try:
        return str(uuid.UUID(str(value)))
    except ValueError as exc:
        raise ValueError("invalid manager session id") from exc


def _ensure_session(db, session_id: str) -> dict:
    rows = db.table("manager_sessions").select("*").eq("id", session_id).limit(1).execute().data
    if rows:
        return rows[0]
    row = db.table("manager_sessions").insert({"id": session_id}).execute().data
    if not row:
        raise RuntimeError("manager session could not be created")
    return row[0]


def _insert_approval_event(db, approval: dict, decision: str) -> dict:
    approval_id = approval["id"]
    key = f"approval:{approval_id}:{decision}"
    existing = db.table("manager_events").select("*").eq("dedupe_key", key).limit(1).execute().data
    if existing:
        return existing[0]
    event = db.table("manager_events").insert({
        "session_id": approval["session_id"],
        "source": "approval",
        "dedupe_key": key,
        "payload": {"approval_id": approval_id, "decision": decision},
        "status": "queued",
    }).execute().data
    if not event:
        raise RuntimeError("approval event could not be enqueued")
    return event[0]


class GetInfoArgs(BaseModel):
    topic: Literal["hours", "area", "services", "policies"]


class QuoteArgs(BaseModel):
    service: str
    size: Literal["small", "medium", "large", "xl"]
    coat: Literal["short", "medium", "long", "double"] = "short"
    addons: list[str] = Field(default_factory=list)


class FindSlotsArgs(BaseModel):
    date_from: str = Field(description="Start ISO date YYYY-MM-DD")
    date_to: str = Field(description="End ISO date YYYY-MM-DD")


class LookupLeadArgs(BaseModel):
    property_name: str = Field(min_length=1, max_length=200)


class EscalateArgs(BaseModel):
    reason: Literal["refund", "complaint", "medical", "aggressive_pet", "off_menu", "partner_lead", "other"]
    summary: str = Field(min_length=1, max_length=1000)


class GetSummaryArgs(BaseModel):
    since_minutes: int = Field(default=60, ge=1, le=10080)


class ListLeadsArgs(BaseModel):
    status: Literal["new", "drafted", "sent", "replied"] | None = None
    limit: int = Field(default=10, ge=1, le=100)


class ListBookingsArgs(BaseModel):
    status: Literal["confirmed", "cancelled"] | None = None
    limit: int = Field(default=10, ge=1, le=100)


class GetConversationArgs(BaseModel):
    phone_or_name: str = Field(min_length=1, max_length=100)


class SearchMessagesArgs(BaseModel):
    query: str = Field(min_length=2, max_length=100)
    limit: int = Field(default=15, ge=1, le=40)


class ListTasksArgs(BaseModel):
    status: Literal["working", "waiting", "needs_approval", "done"] | None = None
    limit: int = Field(default=20, ge=1, le=100)


class CreateTaskArgs(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=4000)
    status: Literal["working", "waiting", "needs_approval"] = "waiting"


class UpdateTaskArgs(BaseModel):
    task_id: str
    status: Literal["working", "waiting", "needs_approval", "done"] | None = None
    detail: str | None = Field(default=None, max_length=4000)


class ProposeSmsArgs(BaseModel):
    phone: str = Field(min_length=3, max_length=32)
    body: str = Field(min_length=1, max_length=320)


class ProposeBookArgs(BaseModel):
    phone: str = Field(min_length=3, max_length=32)
    service: str = Field(min_length=1, max_length=100)
    size: Literal["small", "medium", "large", "xl"]
    coat: Literal["short", "medium", "long", "double"] = "short"
    addons: list[str] = Field(default_factory=list)
    slot_id: str
    pet_name: str = Field(min_length=1, max_length=100)
    customer_name: str | None = Field(default=None, max_length=200)
    details: dict[str, Any] = Field(default_factory=dict)


async def get_info(ctx: Ctx, args: GetInfoArgs) -> dict:
    cfg = load_config(ctx.db)
    if args.topic == "hours":
        return {"hours": cfg.get("hours", "")}
    if args.topic == "area":
        return {"service_area_zips": cfg.get("service_area_zips", [])}
    if args.topic == "services":
        return {
            "services": cfg.get("services", []),
            "addons": cfg.get("addons", []),
            "coat_surcharge_cents": cfg.get("coat_surcharge_cents", {}),
        }
    if args.topic == "policies":
        return {"policies": cfg.get("policies", "")}
    return {"error": f"unknown topic '{args.topic}'"}


async def quote_service(ctx: Ctx, args: QuoteArgs) -> dict:
    return booking.quote(load_config(ctx.db), args)


async def find_slots(ctx: Ctx, args: FindSlotsArgs) -> dict:
    try:
        from_str = f"{args.date_from}T00:00:00Z"
        to_str = f"{args.date_to}T23:59:59Z"
        rows = (
            ctx.db.table("slots")
            .select("*")
            .gte("starts_at", from_str)
            .lte("starts_at", to_str)
            .order("starts_at")
            .execute()
            .data
        )
        open_slots = [r for r in (rows or []) if r.get("booked", 0) < r.get("capacity", 1)]
        return {
            "slots": [
                {
                    "slot_id": s["id"],
                    "starts_at": s["starts_at"],
                    "capacity": s["capacity"],
                    "booked": s["booked"],
                }
                for s in open_slots[:3]
            ]
        }
    except Exception as exc:
        return {"error": f"find_slots failed: {str(exc)[:300]}"}


async def lookup_lead(ctx: Ctx, args: LookupLeadArgs) -> dict:
    term = args.property_name.strip()
    if not term:
        return {"found": False, "lead": None}
    rows = ctx.db.table("leads").select("*").ilike("name", f"%{term}%").limit(1).execute().data
    if rows:
        lead = rows[0]
        return {
            "found": True,
            "lead_id": lead.get("id"),
            "name": lead.get("name"),
            "status": lead.get("status"),
        }
    return {"found": False, "lead_id": None, "name": None, "status": None}


async def escalate(ctx: Ctx, args: EscalateArgs) -> dict:
    session_id = _session_id(ctx)
    _ensure_session(ctx.db, session_id)
    task_row = (
        ctx.db.table("manager_tasks")
        .insert({
            "session_id": session_id,
            "title": f"Escalation ({args.reason}): {args.summary[:50]}",
            "detail": args.summary,
            "status": "needs_approval",
        })
        .execute()
        .data
    )
    task = task_row[0] if task_row else None

    proposal = None
    if settings.OWNER_PHONE:
        prop_rows = (
            ctx.db.table("manager_approvals")
            .insert({
                "session_id": session_id,
                "kind": "send_sms",
                "payload": {"phone": settings.OWNER_PHONE, "body": f"ESCALATION [{args.reason}]: {args.summary}"},
                "status": "pending",
            })
            .execute()
            .data
        )
        proposal = prop_rows[0] if prop_rows else None

    return {
        "ok": True,
        "task_id": task.get("id") if task else None,
        "proposal_id": proposal.get("id") if proposal else None,
    }


async def get_summary(ctx: Ctx, args: GetSummaryArgs) -> dict:
    db = ctx.db
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=args.since_minutes)).isoformat()

    def count(table: str, column: str = "created_at") -> int:
        response = db.table(table).select("id").gte(column, cutoff).execute()
        return len(response.data or [])

    try:
        messages = (
            db.table("messages")
            .select("direction,body,created_at")
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
        bookings = count("bookings")
        leads = db.table("leads").select("status").gte("created_at", cutoff).execute().data
        events = (
            db.table("manager_events")
            .select("source,status,payload,error,created_at")
            .gte("created_at", cutoff)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
        )
        return {
            "texts_in": sum(row.get("direction") == "in" for row in messages),
            "texts_out": sum(row.get("direction") == "out" for row in messages),
            "bookings": bookings,
            "leads_new": sum(row.get("status") == "new" for row in leads),
            "leads_drafted": sum(row.get("status") == "drafted" for row in leads),
            "emails_sent": sum(row.get("status") == "sent" for row in leads),
            "lead_replies": sum(row.get("status") == "replied" for row in leads),
            "escalations": sum(row.get("source") == "approval" for row in events),
            "notable": events[:10],
        }
    except Exception as exc:
        return {"error": f"summary unavailable: {str(exc)[:300]}"}


async def list_leads(ctx: Ctx, args: ListLeadsArgs) -> dict:
    query = ctx.db.table("leads").select("*").order("created_at", desc=True).limit(args.limit)
    if args.status:
        query = query.eq("status", args.status)
    return {"rows": query.execute().data or []}


async def list_bookings(ctx: Ctx, args: ListBookingsArgs) -> dict:
    query = ctx.db.table("bookings").select("*").order("created_at", desc=True).limit(args.limit)
    if args.status:
        query = query.eq("status", args.status)
    return {"rows": query.execute().data or []}


async def get_conversation(ctx: Ctx, args: GetConversationArgs) -> dict:
    """Find a thread by phone, customer name or pet name.

    The owner types what they see -- "346-804-8886", or the pet's name -- while phones are
    stored E.164 and a texting customer often has no name on file, so an exact match on
    either field finds nothing. Fall through the plausible readings before giving up.
    """
    term = args.phone_or_name.strip()
    tail = "".join(c for c in term if c.isdigit())[-10:]

    by_phone = ctx.db.table("customers").select("*").eq("phone", term).limit(1).execute().data
    customer = by_phone[0] if by_phone else None
    if customer is None and len(tail) == 10:
        by_tail = ctx.db.table("customers").select("*").like("phone", f"%{tail}").limit(1).execute().data
        customer = by_tail[0] if by_tail else None
    if customer is None:
        matches = ctx.db.table("customers").select("*").ilike("name", f"%{term}%").limit(1).execute().data
        customer = matches[0] if matches else None

    phone = customer.get("phone") if customer else None
    if phone is None and len(tail) == 10:
        # Someone who texted but was never named still has a thread worth reading.
        row = ctx.db.table("messages").select("phone").like("phone", f"%{tail}").limit(1).execute().data
        phone = row[0]["phone"] if row else None
    if phone is None and term:
        # Owners refer to a thread by the pet, which lives on the booking, not the customer.
        pet = ctx.db.table("bookings").select("phone,pet_name").ilike("pet_name", f"%{term}%").limit(1).execute().data
        phone = pet[0]["phone"] if pet else None
    if phone is None:
        return {"phone": None, "name": None, "messages": []}

    rows = (
        ctx.db.table("messages")
        .select("direction,body,created_at")
        .eq("phone", phone)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
    )
    return {"phone": phone, "name": (customer or {}).get("name"), "messages": list(reversed(rows or []))}


async def search_messages(ctx: Ctx, args: SearchMessagesArgs) -> dict:
    """Find threads by what was actually said in them.

    The owner asks about a pet, a service or a street by name, and usually does not know
    the phone number. Matching happens in the database against a parameterized term, so
    this stays a narrow tool: it answers "which threads mention this", and the model then
    calls get_conversation for the one it wants.
    """
    rows = (
        ctx.db.table("messages")
        .select("phone,direction,body,created_at")
        .ilike("body", f"%{args.query}%")
        .order("created_at", desc=True)
        .limit(args.limit)
        .execute()
        .data
    ) or []
    threads: dict[str, dict] = {}
    for r in rows:
        thread = threads.setdefault(
            r["phone"],
            {"phone": r["phone"], "mentions": 0, "latest": r["created_at"], "example": ""},
        )
        thread["mentions"] += 1
        if not thread["example"]:
            thread["example"] = (r.get("body") or "")[:200]
    return {"query": args.query, "threads": list(threads.values())}


async def list_tasks(ctx: Ctx, args: ListTasksArgs) -> dict:
    query = (
        ctx.db.table("manager_tasks")
        .select("*")
        .eq("session_id", _session_id(ctx))
        .order("updated_at", desc=True)
        .limit(args.limit)
    )
    if args.status:
        query = query.eq("status", args.status)
    return {"rows": query.execute().data or []}


async def create_task(ctx: Ctx, args: CreateTaskArgs) -> dict:
    session_id = _session_id(ctx)
    _ensure_session(ctx.db, session_id)
    rows = (
        ctx.db.table("manager_tasks")
        .insert({
            "session_id": session_id,
            "title": args.title,
            "detail": args.detail,
            "status": args.status,
        })
        .execute()
        .data
    )
    return rows[0] if rows else {"error": "task could not be created"}


async def update_task(ctx: Ctx, args: UpdateTaskArgs) -> dict:
    try:
        task_id = str(uuid.UUID(args.task_id))
    except ValueError:
        return {"error": "invalid task id"}
    changes = {}
    if args.status is not None:
        changes["status"] = args.status
    if args.detail is not None:
        changes["detail"] = args.detail
    if not changes:
        return {"error": "no task changes supplied"}
    rows = (
        ctx.db.table("manager_tasks")
        .update(changes)
        .eq("id", task_id)
        .eq("session_id", _session_id(ctx))
        .execute()
        .data
    )
    return rows[0] if rows else {"error": "task not found"}


async def propose_send_sms(ctx: Ctx, args: ProposeSmsArgs) -> dict:
    session_id = _session_id(ctx)
    _ensure_session(ctx.db, session_id)
    rows = (
        ctx.db.table("manager_approvals")
        .insert({
            "session_id": session_id,
            "kind": "send_sms",
            "payload": {"phone": args.phone, "body": args.body},
            "status": "pending",
        })
        .execute()
        .data
    )
    return rows[0] if rows else {"error": "SMS approval could not be created"}


async def propose_book(ctx: Ctx, args: ProposeBookArgs) -> dict:
    config = load_config(ctx.db)
    if config.get("_placeholder"):
        return {"error": "business config is incomplete placeholder; booking disabled"}
    session_id = _session_id(ctx)
    try:
        quote_result = booking.quote(config, args)
        if "error" in quote_result:
            return quote_result
        uuid.UUID(args.slot_id)
    except ValueError as exc:
        return {"error": str(exc)}
    slots = ctx.db.table("slots").select("*").eq("id", args.slot_id).limit(1).execute().data
    if not slots:
        return {"error": "slot not found"}
    slot = slots[0]
    if slot["booked"] >= slot["capacity"] or datetime.fromisoformat(slot["starts_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        return {"error": "slot is no longer available"}
    _ensure_session(ctx.db, session_id)
    payload = args.model_dump()
    payload.update({"total_cents": quote_result["total_cents"], "line_items": quote_result["line_items"]})
    payload["starts_at"] = slot["starts_at"]
    rows = (
        ctx.db.table("manager_approvals")
        .insert({
            "session_id": session_id,
            "kind": "book",
            "payload": payload,
            "status": "pending",
        })
        .execute()
        .data
    )
    return rows[0] if rows else {"error": "booking approval could not be created"}


async def decide_approval(approval_id: str, decision: str) -> dict:
    """CAS a pending approval and enqueue exactly one durable approval event atomically via SQL RPC."""
    if decision not in {"approve", "reject"}:
        return {"error": "decision must be approve or reject"}
    try:
        approval_uuid = str(uuid.UUID(approval_id))
    except ValueError:
        return {"error": "invalid approval id"}
    db = get_db()

    try:
        rpc_res = db.rpc("manager_decide_approval", {
            "p_approval_id": approval_uuid,
            "p_decision": decision,
        }).execute().data
        if rpc_res:
            res_row = rpc_res[0] if isinstance(rpc_res, list) else rpc_res
            return res_row
    except Exception as exc:
        return {"error": f"manager_decide_approval RPC failed or missing migration: {str(exc)[:300]}"}

    return {"error": "manager_decide_approval RPC returned empty result"}

async def execute_approval(approval_id: str) -> dict:
    """Execute a previously approved proposal exactly once in the queue worker."""
    try:
        approval_uuid = str(uuid.UUID(approval_id))
    except ValueError:
        return {"error": "invalid approval id"}
    db = get_db()
    rows = (
        db.table("manager_approvals")
        .update({"status": "executing"})
        .eq("id", approval_uuid)
        .eq("status", "approved")
        .execute()
        .data
    )
    if not rows:
        current = db.table("manager_approvals").select("*").eq("id", approval_uuid).limit(1).execute().data
        return {"error": "approval is not executable", "approval": current[0] if current else None}
    approval = rows[0]
    payload = approval.get("payload") or {}
    try:
        if approval["kind"] == "send_sms":
            if not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_FROM_NUMBER:
                raise RuntimeError("Twilio SMS configuration is incomplete")
            to_phone = payload.get("phone", "")
            sms_body = payload.get("body", "")
            result = await send_sms(to_phone, sms_body)
            if "error" in result or not result.get("ok"):
                raise RuntimeError(result.get("error", "SMS send failed"))
            db.table("messages").insert({
                "phone": to_phone,
                "direction": "out",
                "body": sms_body,
                "twilio_sid": result.get("sid"),
            }).execute()
        elif approval["kind"] == "book":
            config = load_config(db)
            quote_result = booking.quote(config, payload)
            if "error" in quote_result:
                raise RuntimeError(f"quote calculation failed during execution: {quote_result['error']}")
            if quote_result["total_cents"] != payload.get("total_cents"):
                raise RuntimeError(
                    f"frozen approved total_cents ({payload.get('total_cents')}) does not match current quote ({quote_result['total_cents']})"
                )
            if not booking.take_slot(db, str(payload["slot_id"])):
                raise RuntimeError("slot is already full or invalid")
            result = booking.create_booking(
                db,
                phone=payload["phone"],
                service=payload["service"],
                pet_name=payload["pet_name"],
                details={
                    **payload.get("details", {}),
                    "size": payload["size"],
                    "coat": payload["coat"],
                    "addons": payload.get("addons", []),
                    "customer_name": payload.get("customer_name"),
                    "starts_at": payload["starts_at"],
                },
                slot_id=payload["slot_id"],
                total_cents=payload["total_cents"],
                config=config,
            )
        else:
            raise RuntimeError(f"unsupported approval kind: {approval['kind']}")
        final = (
            db.table("manager_approvals")
            .update({"status": "executed", "result": result})
            .eq("id", approval_uuid)
            .eq("status", "executing")
            .execute()
            .data
        )
        return final[0] if final else {"error": "approval result could not be saved"}
    except Exception as exc:
        status = "interrupted" if approval["kind"] == "send_sms" else "failed"
        final = (
            db.table("manager_approvals")
            .update({"status": status, "result": {"error": str(exc)[:500]}})
            .eq("id", approval_uuid)
            .eq("status", "executing")
            .execute()
            .data
        )
        return final[0] if final else {"error": str(exc)[:500], "status": status}


MANAGER = AgentSpec(
    name="manager",
    system_prompt=system_prompt,
    tools=[
        Tool("get_info", "Read business hours, service area, services or policies.", GetInfoArgs, get_info),
        Tool("quote", "Price a service for a pet's size and coat, with optional add-ons.", QuoteArgs, quote_service),
        Tool("find_slots", "Find open appointment slots between two dates.", FindSlotsArgs, find_slots),
        Tool("lookup_lead", "Check whether a property name is a partner lead.", LookupLeadArgs, lookup_lead),
        Tool("escalate", "Escalate a customer issue by creating a task and owner proposal.", EscalateArgs, escalate),
        Tool("get_summary", "Summarize recent business activity.", GetSummaryArgs, get_summary),
        Tool("list_leads", "Read partner leads, optionally filtered by status.", ListLeadsArgs, list_leads),
        Tool("list_bookings", "Read bookings, optionally filtered by status.", ListBookingsArgs, list_bookings),
        Tool("get_conversation", "Read the latest customer conversation by phone, customer name or pet name.", GetConversationArgs, get_conversation),
        Tool("search_messages", "Search what customers actually texted, to find which thread mentions a pet, service or place. Returns matching threads; read one with get_conversation.", SearchMessagesArgs, search_messages),
        Tool("list_tasks", "Read manager tasks.", ListTasksArgs, list_tasks),
        Tool("create_task", "Create a visible manager task.", CreateTaskArgs, create_task),
        Tool("update_task", "Update a manager task status or detail.", UpdateTaskArgs, update_task),
        Tool("propose_send_sms", "Propose an SMS for human approval; does not send it.", ProposeSmsArgs, propose_send_sms),
        Tool("propose_book", "Propose a booking for human approval; does not reserve it.", ProposeBookArgs, propose_book),
        *SHARED_TOOLS,
    ],
)
