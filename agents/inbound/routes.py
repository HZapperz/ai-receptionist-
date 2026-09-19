import asyncio
import re
from xml.sax.saxutils import escape

from fastapi import APIRouter, BackgroundTasks, Request, Response

from agents.db import get_db, load_config
from agents.inbound import gate
from agents.inbound.tools import INBOUND
from agents.inbound.twilio_io import send_sms, valid_signature
from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event
from agents.runtime.loop import GIVE_UP, run_agent
from agents.settings import settings

router = APIRouter()
EMPTY_TWIML = "<Response/>"
MAX_REPLY_CHARS = 320
_locks: dict[str, asyncio.Lock] = {}


def _twiml(text: str | None = None) -> Response:
    body = f"<Response><Message>{escape(text)}</Message></Response>" if text else EMPTY_TWIML
    return Response(content=body, media_type="application/xml")


@router.post("/sms")
async def sms(request: Request, background: BackgroundTasks):
    form = dict(await request.form())
    if not valid_signature(request, form):
        return Response(status_code=403)
    phone, body = form.get("From", ""), form.get("Body", "") or ""
    db = get_db()

    action = gate.decide(body, gate.active_session(db, phone))
    if action in ("forward", "forward_end"):
        if action == "forward_end":
            gate.end_session(db, phone)
        return await gate.forward(form)
    if action == "exit":
        gate.end_session(db, phone)
        db.table("messages").insert([
            {"phone": phone, "direction": "in", "body": body, "twilio_sid": form.get("MessageSid")},
            {"phone": phone, "direction": "out", "body": gate.EXIT_REPLY},
        ]).execute()
        return _twiml(gate.EXIT_REPLY)
    if action == "open":
        gate.open_session(db, phone)
        body = gate.strip_code(body)

    # AI session: store (unique twilio_sid dedupes Twilio retries), answer now, work later.
    db.table("customers").upsert({"phone": phone}, on_conflict="phone", ignore_duplicates=True).execute()
    inserted = db.table("messages").upsert(
        {"phone": phone, "direction": "in", "body": body, "twilio_sid": form.get("MessageSid")},
        on_conflict="twilio_sid", ignore_duplicates=True,
    ).execute().data
    if inserted:
        background.add_task(handle_inbound, phone)
    return _twiml()


def phone_lock(phone: str) -> asyncio.Lock:
    """One run per phone at a time, so two quick texts don't get two answers."""
    return _locks.setdefault(phone, asyncio.Lock())


def load_history(db, phone: str) -> list[dict]:
    """The last 20 texts with this phone, oldest first, as chat messages."""
    rows = (db.table("messages").select("direction,body,created_at").eq("phone", phone)
            .order("created_at", desc=True).limit(20).execute().data)
    return [{"role": "user" if r["direction"] == "in" else "assistant", "content": r["body"]}
            for r in reversed(rows)]


def load_customer(db, phone: str) -> dict | None:
    return (db.table("customers").select("*").eq("phone", phone).limit(1).execute().data or [None])[0]


def trim_reply(text: str) -> str:
    """At most MAX_REPLY_CHARS, cut at the last sentence end (or word) that fits."""
    text = (text or "").strip()
    if len(text) <= MAX_REPLY_CHARS:
        return text
    ends = [m.end() for m in re.finditer(r"[.!?](?=\s|$)", text) if m.end() <= MAX_REPLY_CHARS]
    if ends and ends[-1] >= MAX_REPLY_CHARS // 3:
        return text[:ends[-1]]
    return text[:MAX_REPLY_CHARS - 3].rsplit(" ", 1)[0].rstrip(" ,;:-") + "..."


async def send_and_store(ctx: Ctx, reply: str) -> dict:
    """Text the reply, and store it only when it was sent (or dry-run)."""
    try:
        sent = await send_sms(ctx.phone, reply)
    except Exception as e:  # a Twilio failure must not vanish in a background task
        sent = {"error": str(e)[:500]}
    if "error" in sent:
        await log_event(ctx, kind="error", name="sms_send", result=sent)
        return sent
    ctx.db.table("messages").insert({"phone": ctx.phone, "direction": "out", "body": reply}).execute()
    return sent


async def handle_inbound(phone: str) -> None:
    async with phone_lock(phone):
        db = get_db()
        history = load_history(db, phone)
        if not history or history[-1]["role"] == "assistant":
            return  # an earlier run already answered everything
        ctx = Ctx(db=db, config=load_config(db), agent="inbound", ref=phone, phone=phone,
                  customer=load_customer(db, phone))
        try:
            reply = await run_agent(INBOUND, history, ctx)
        except Exception as e:  # the model or a provider failed: the customer still hears back
            await log_event(ctx, kind="error", name="inbound_run", result={"error": str(e)[:500]})
            reply = GIVE_UP
        await send_and_store(ctx, trim_reply(reply))
        if reply == GIVE_UP:
            await alert_owner(ctx)


async def alert_owner(ctx: Ctx) -> None:
    """GIVE_UP promises the customer a person, so make sure the owner hears about it."""
    if not settings.OWNER_PHONE:
        return
    try:
        await send_sms(settings.OWNER_PHONE, f"[needs a person] The AI could not answer {ctx.phone}. See the Inbox.")
    except Exception as e:
        await log_event(ctx, kind="error", name="owner_alert", result={"error": str(e)[:500]})
