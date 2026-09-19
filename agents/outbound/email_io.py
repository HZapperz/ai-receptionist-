from agents.settings import settings


def send(to: str, subject: str, body: str) -> dict:
    """Only POST /outbound/send calls this, after a person clicks Send."""
    if not to or to.strip().lower() not in settings.send_allowlist():
        return {"error": "not_allowlisted"}
    # STUB: outbound. Send with EMAIL_PROVIDER (resend) from EMAIL_FROM.
    return {"ok": True, "stub": True}
