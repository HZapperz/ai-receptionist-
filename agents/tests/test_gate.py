"""Tests for the 833 gate. Runs in-process (no uvicorn needed) against the
Supabase project in .env, with a fake "production" webhook on localhost.

    python -m agents.tests.test_gate

It overrides settings in memory: LLM_FAKE on, signature checks off, a test
gate code and Twilio token, and a fake production URL. Nothing is sent to
Twilio; delivery is replaced with a recorder.
"""
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qsl

from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from agents.db import get_db
from agents.inbound import twilio_io
from agents.settings import settings

TOKEN = "test-token"
CODE = "PAWZTEST"
OWNER = "+15550009999"
A, B, C, D = "+15550001001", "+15550001002", "+15550001003", "+15550001004"
PROD_REPLY = b"<Response><Message>production got it</Message></Response>"

received: list[dict] = []
sent: list[tuple[str, str]] = []


class FakeProd(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        params = dict(parse_qsl(self.rfile.read(length).decode()))
        received.append({"params": params, "signature": self.headers.get("X-Twilio-Signature", "")})
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.end_headers()
        self.wfile.write(PROD_REPLY)

    def log_message(self, *args):
        pass


def cleanup(db):
    for phone in (A, B, C, D, OWNER):
        db.table("messages").delete().eq("phone", phone).execute()
        db.table("ai_sessions").delete().eq("phone", phone).execute()
        db.table("agent_events").delete().eq("ref", phone).execute()
        db.table("customers").delete().eq("phone", phone).execute()


def text(client, phone, body, n=[0]):
    n[0] += 1
    return client.post("/sms", data={"From": phone, "To": "+18333028947", "Body": body,
                                     "MessageSid": f"SMgatetest{n[0]}"})


def count(db, table, phone):
    return len(db.table(table).select("phone").eq("phone", phone).execute().data)


def main():
    server = HTTPServer(("127.0.0.1", 0), FakeProd)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    prod_url = f"http://127.0.0.1:{server.server_port}/webhooks/twilio/incoming"

    settings.LLM_FAKE = True
    settings.TWILIO_VALIDATE_SIGNATURE = False
    settings.TWILIO_AUTH_TOKEN = TOKEN
    settings.AI_GATE_CODE = CODE
    settings.OWNER_PHONE = OWNER
    settings.PROD_SMS_WEBHOOK_URL = prod_url
    twilio_io._deliver = lambda to, body: sent.append((to, body)) or "SMfake"

    from agents.inbound import gate
    from agents.main import app

    db = get_db()
    cleanup(db)
    client = TestClient(app)
    try:
        # 1. A real customer (no session) is forwarded, re-signed, and never stored.
        r = text(client, A, "Hi, can I get a groom Tuesday?")
        assert r.status_code == 200 and r.content == PROD_REPLY, (r.status_code, r.text)
        assert len(received) == 1
        fwd = received[0]
        assert fwd["params"]["Body"] == "Hi, can I get a groom Tuesday?"
        assert RequestValidator(TOKEN).validate(prod_url, fwd["params"], fwd["signature"]), "bad signature"
        assert count(db, "messages", A) == 0 and count(db, "customers", A) == 0
        print("ok  no session: forwarded with a valid signature, nothing stored")

        # 2. The code opens a session; the code is stripped; the agent runs and replies.
        r = text(client, B, f"{CODE.lower()} hi, I got your email")
        assert r.status_code == 200 and r.text == "<Response/>", r.text
        assert gate.active_session(db, B)
        bodies = [m["body"] for m in db.table("messages").select("body,direction").eq("phone", B)
                  .eq("direction", "in").execute().data]
        assert bodies == ["hi, I got your email"], bodies
        assert len(received) == 1, "a code text must not reach production"
        assert any(to == B for to, _ in sent), "the agent's reply was not delivered"
        print("ok  code: session opened, code stripped, agent replied")

        # 3. Later texts in the session go to the agent, not production.
        text(client, B, "How much for a small dog?")
        assert len(received) == 1 and count(db, "messages", B) >= 4
        print("ok  session: texts stay with the agent")

        # 4. EXIT ends the session; the next text goes to production.
        r = text(client, B, "exit")
        assert gate.EXIT_REPLY in r.text and not gate.active_session(db, B)
        text(client, B, "hello again")
        assert len(received) == 2 and received[-1]["params"]["Body"] == "hello again"
        print("ok  EXIT: session ended, next text forwarded")

        # 5. STOP always reaches production and ends the session.
        text(client, C, f"{CODE} hello")
        assert gate.active_session(db, C)
        r = text(client, C, "STOP")
        assert r.content == PROD_REPLY and received[-1]["params"]["Body"] == "STOP"
        assert not gate.active_session(db, C)
        text(client, D, "HELP")
        assert received[-1]["params"]["Body"] == "HELP"
        print("ok  STOP/HELP: forwarded, STOP ends the session")

        # 6. send_sms refuses anyone without a session, except the owner; no token means dry run.
        import asyncio
        sent.clear()
        assert asyncio.run(twilio_io.send_sms(D, "hi")) == {"error": "not_in_ai_session"}
        assert asyncio.run(twilio_io.send_sms(OWNER, "escalation"))["ok"] and sent == [(OWNER, "escalation")]
        settings.TWILIO_AUTH_TOKEN = ""
        assert asyncio.run(twilio_io.send_sms(OWNER, "x")) == {"ok": True, "dry_run": True}
        assert len(sent) == 1
        print("ok  send_sms: refuses non-session phones, owner allowed, dry-runs without a token")

        # 7. Can't forward safely -> 503 (no token or URL); production down -> 502.
        #    Both make Twilio fall back to production directly.
        assert text(client, A, "anyone there?").status_code == 503
        settings.TWILIO_AUTH_TOKEN = TOKEN
        settings.PROD_SMS_WEBHOOK_URL = ""
        assert text(client, A, "anyone there?").status_code == 503
        settings.PROD_SMS_WEBHOOK_URL = "http://127.0.0.1:9/nothing-listens-here"
        assert text(client, A, "anyone there?").status_code == 502
        assert count(db, "messages", A) == 0
        print("ok  forward failures: 503 when unconfigured, 502 when production is down, nothing stored")

        print("GATE TESTS PASSED")
    finally:
        cleanup(db)
        server.shutdown()


if __name__ == "__main__":
    main()
