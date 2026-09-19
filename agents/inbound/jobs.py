"""Inbound's task handlers, called by agents/tasks.py."""
from agents.db import get_db, load_config
from agents.inbound import gate
from agents.inbound.routes import load_customer, load_history, phone_lock, send_and_store, trim_reply
from agents.inbound.tools import INBOUND
from agents.runtime.ctx import Ctx
from agents.runtime.loop import GIVE_UP, run_agent

NUDGE = "(internal note, not from the customer) Write the follow-up text now."


async def follow_up(task: dict) -> dict:
    """payload {"phone", "reason"}: the inbound agent writes one proactive text.
    Only phones in an AI session: a follow-up can never reach a real customer
    (send_sms refuses them too; this just skips the model call)."""
    payload = task.get("payload") or {}
    phone = payload.get("phone")
    if not phone:
        return {"error": "payload.phone is required"}
    db = get_db()
    if not gate.active_session(db, phone):
        return {"error": "not_in_ai_session"}

    async with phone_lock(phone):
        ctx = Ctx(db=db, config=load_config(db), agent="inbound", ref=phone, phone=phone,
                  customer=load_customer(db, phone), task=task)
        messages = [*load_history(db, phone), {"role": "user", "content": NUDGE}]
        reply = trim_reply(await run_agent(INBOUND, messages, ctx))
        if reply == GIVE_UP:
            return {"error": "the agent could not write a follow-up; nothing was sent"}
        sent = await send_and_store(ctx, reply)
    if "error" in sent:
        return sent
    return {"ok": True, "sent": not sent.get("dry_run"), "text": reply}
