import asyncio

from twilio.request_validator import RequestValidator
from twilio.rest import Client

from agents.db import get_db
from agents.inbound import gate
from agents.settings import settings

_client: Client | None = None


def valid_signature(request, form: dict) -> bool:
    """Twilio signs the URL it called. Proxies and ngrok change the host, so the
    URL is rebuilt from PUBLIC_AGENTS_URL, not taken from the request."""
    if not settings.TWILIO_VALIDATE_SIGNATURE:
        return True
    if not settings.TWILIO_AUTH_TOKEN:
        return False
    url = settings.PUBLIC_AGENTS_URL.rstrip("/") + request.url.path
    signature = request.headers.get("X-Twilio-Signature", "")
    return RequestValidator(settings.TWILIO_AUTH_TOKEN).validate(url, form, signature)


def sign_for(url: str, params: dict) -> str:
    """A valid X-Twilio-Signature for forwarding a webhook to another URL."""
    return RequestValidator(settings.TWILIO_AUTH_TOKEN).compute_signature(url, params)


def _deliver(to: str, body: str) -> str:
    global _client
    if _client is None:
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client.messages.create(to=to, from_=settings.TWILIO_FROM_NUMBER, body=body).sid


async def send_sms(to: str, body: str) -> dict:
    """The only way this service texts anyone. The 833 line carries real
    customers, so it refuses any phone without an active AI session."""
    db = get_db()
    if to != settings.OWNER_PHONE and not gate.active_session(db, to):
        return {"error": "not_in_ai_session"}
    if not settings.TWILIO_AUTH_TOKEN:
        # Teammates develop without the production Twilio token: log, don't send.
        try:
            db.table("agent_events").insert({
                "agent": "inbound", "kind": "message", "name": "sms_dry_run",
                "input": {"to": to}, "result": {"text": body}, "ref": to,
            }).execute()
        except Exception:
            pass
        return {"ok": True, "dry_run": True}
    sid = await asyncio.to_thread(_deliver, to, body)
    return {"ok": True, "sid": sid}
