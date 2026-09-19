"""End-to-end smoke test against a running agents service.

Run with the service up (`uvicorn agents.main:app --port 8000`) and, in .env,
LLM_FAKE=true (or a real model key), TWILIO_VALIDATE_SIGNATURE=false and any
AI_GATE_CODE. The first text carries the gate code, so this phone gets an AI
session like a demo tester would; texts without it are forwarded to production.
"""
import sys
import time

import httpx

from agents.db import get_db
from agents.settings import settings

BASE = "http://localhost:8000"
PHONE = "+15555550100"
TEXTS = [
    "{code} Hi there!",
    "How much is a full groom for a medium doodle with a long coat?",
    "Can I book Saturday morning for Bella?",
    "Hola, ¿cuánto cuesta un baño para un perro pequeño?",
    "Your groomer cut my dog's ear. I want a refund.",
]


def count_events(db) -> int:
    return db.table("agent_events").select("id", count="exact").limit(1).execute().count or 0


def main() -> None:
    if not settings.AI_GATE_CODE:
        sys.exit("Set AI_GATE_CODE in .env (any value) so the smoke test can open an AI session.")
    if settings.TWILIO_VALIDATE_SIGNATURE:
        sys.exit("Set TWILIO_VALIDATE_SIGNATURE=false in .env for the smoke test.")
    db = get_db()
    before = count_events(db)
    with httpx.Client(base_url=BASE, timeout=30) as client:
        health = client.get("/health").json()
        assert health.get("ok") is True, f"GET /health failed: {health}"
        # Verify manager endpoint is reachable
        mgr = client.get("/manager")
        assert mgr.status_code == 200, f"GET /manager failed: {mgr.status_code}"
        for i, text in enumerate(TEXTS):
            r = client.post("/sms", data={"From": PHONE, "To": "+18333028947",
                                          "Body": text.format(code=settings.AI_GATE_CODE),
                                          "MessageSid": f"SMsmoke{int(time.time() * 1000)}{i}"})
            assert r.status_code == 200, f"text {i}: HTTP {r.status_code} {r.text[:200]}"
            assert r.text.strip() == "<Response/>", f"text {i}: unexpected body {r.text[:200]}"
            print(f"ok  /sms {i + 1}/{len(TEXTS)}")
    deadline = time.time() + 30
    while time.time() < deadline and count_events(db) <= before:
        time.sleep(1)
    after = count_events(db)
    assert after > before, "agent_events gained no rows; is the background run failing? Check the uvicorn log."
    print(f"ok  agent_events +{after - before}")
    print("SMOKE PASSED")


if __name__ == "__main__":
    main()
