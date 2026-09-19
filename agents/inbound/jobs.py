"""Inbound's task handlers, called by agents/tasks.py."""


async def follow_up(task: dict) -> dict:
    # STUB: inbound. payload {"phone", "reason"}: run the inbound agent with the
    # reason as context and send_sms the result. send_sms refuses phones without
    # an active AI session, so a follow-up can never reach a real customer.
    return {"ok": True, "stub": True}
