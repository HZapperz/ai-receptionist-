import asyncio
from xml.sax.saxutils import escape

from fastapi import APIRouter, BackgroundTasks, Request, Response

from agents.db import get_db, load_config
from agents.inbound import gate
from agents.inbound.tools import INBOUND
from agents.inbound.twilio_io import send_sms, valid_signature
from agents.runtime.ctx import Ctx
from agents.runtime.loop import run_agent

router = APIRouter()
EMPTY_TWIML = "<Response/>"
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


async def handle_inbound(phone: str) -> None:
    lock = _locks.setdefault(phone, asyncio.Lock())
    async with lock:
        db = get_db()
        rows = (db.table("messages").select("direction,body,created_at").eq("phone", phone)
                .order("created_at", desc=True).limit(20).execute().data)
        if not rows or rows[0]["direction"] == "out":
            return  # an earlier run already answered everything
        customer = (db.table("customers").select("*").eq("phone", phone).limit(1).execute().data or [None])[0]
        ctx = Ctx(db=db, config=load_config(db), agent="inbound", ref=phone, phone=phone, customer=customer)
        history = [{"role": "user" if r["direction"] == "in" else "assistant", "content": r["body"]}
                   for r in reversed(rows)]
        reply = await run_agent(INBOUND, history, ctx)
        await send_sms(phone, reply)
        db.table("messages").insert({"phone": phone, "direction": "out", "body": reply}).execute()
