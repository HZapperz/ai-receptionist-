"""The 833 gate: keeps real Royal Pawz customers away from the demo agent.

The demo borrows the live toll-free number. A phone that texts AI_GATE_CODE gets
an AI session; every other text is forwarded untouched to the production SMS
service and never stored here. Rules: docs/CONTRACTS.md, "833 gate".
"""
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import Response

from agents.settings import settings

log = logging.getLogger("gate")

# Twilio's opt-out keywords. A bare one opts the phone out at Twilio itself,
# so production must hear it and the AI session ends.
STOP_WORDS = {"stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"}
# Opt-in and help keywords always belong to production too.
PROD_WORDS = {"start", "unstop", "help", "info"}
EXIT_WORD = "exit"
EXIT_REPLY = "You're back with the Royal Pawz team. Someone will reply here soon."
FORWARD_TIMEOUT_S = 8


def _keyword(body: str) -> str:
    return re.sub(r"[^\w]", "", (body or "").strip().lower())


def _code_re() -> re.Pattern | None:
    code = settings.AI_GATE_CODE.strip()
    if not code:
        return None
    return re.compile(rf"(?<![A-Za-z0-9]){re.escape(code)}(?![A-Za-z0-9])", re.I)


def decide(body: str, has_session: bool) -> str:
    """One of: forward, forward_end, open, exit, ai."""
    word = _keyword(body)
    if word in STOP_WORDS:
        return "forward_end" if has_session else "forward"
    if word in PROD_WORDS:
        return "forward"
    code = _code_re()
    if code and code.search(body or ""):
        return "open"
    if has_session and word == EXIT_WORD:
        return "exit"
    return "ai" if has_session else "forward"


def strip_code(body: str) -> str:
    code = _code_re()
    text = code.sub(" ", body or "") if code else (body or "")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.!?;:])", r"\1", text)      # "Hi , there" -> "Hi, there"
    text = re.sub(r"([!?.])[,;:]", r"\1", text)        # "Hi!, there" -> "Hi! there"
    text = text.lstrip(" \t\n,.:;-!?").rstrip(" \t\n,:;-")
    return text if re.search(r"\w", text) else "Hi"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def active_session(db, phone: str) -> bool:
    rows = (db.table("ai_sessions").select("phone").eq("phone", phone).is_("ended_at", "null")
            .gt("expires_at", _now().isoformat()).limit(1).execute().data)
    return bool(rows)


def open_session(db, phone: str) -> None:
    now = _now()
    db.table("ai_sessions").upsert({
        "phone": phone, "started_at": now.isoformat(), "ended_at": None,
        "expires_at": (now + timedelta(hours=settings.AI_GATE_TTL_HOURS)).isoformat(),
    }).execute()


def end_session(db, phone: str) -> None:
    db.table("ai_sessions").update({"ended_at": _now().isoformat()}).eq("phone", phone).execute()


async def forward(form: dict) -> Response:
    """Hand a text to production exactly as Twilio sent it, re-signed for
    production's URL. Returns production's answer to Twilio. Nothing is stored,
    and the body is never logged: these are real customers' texts."""
    from agents.inbound.twilio_io import sign_for

    url = settings.PROD_SMS_WEBHOOK_URL
    if not url or not settings.TWILIO_AUTH_TOKEN:
        # 503 makes Twilio use the number's fallback URL, which is production.
        log.warning("gate: cannot forward (PROD_SMS_WEBHOOK_URL or TWILIO_AUTH_TOKEN unset)")
        return Response(status_code=503)
    try:
        async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT_S) as client:
            r = await client.post(url, data=form, headers={"X-Twilio-Signature": sign_for(url, form)})
    except httpx.HTTPError as e:
        log.warning("gate: forward failed: %s", type(e).__name__)
        return Response(status_code=502)
    log.info("gate: forwarded, production answered %s", r.status_code)
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "application/xml"))
