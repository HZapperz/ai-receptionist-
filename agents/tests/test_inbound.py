"""Tests for the inbound agent's code: prices, slots, booking, lead matching,
the prompt, and the runtime's reply cleanup. No model is called and nothing
is texted.

    python -m agents.tests.test_inbound

The pure part needs nothing. The DB part runs against the Supabase project in
.env with the test phone below, and cleans up after itself: its bookings,
customer, messages, notes, events and session, the temporary lead, and the
slot it filled. It is skipped when the database is unreachable.
"""
import asyncio
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

from agents.booking import quote
from agents.inbound.prompt import HOUSTON, system_prompt
from agents.inbound.routes import disclose, trim_reply
from agents.inbound.tools import (INBOUND, BookArgs, FindSlotsArgs, LookupLeadArgs, QuoteArgs, _norm, book,
                                  find_slots, lookup_lead)
from agents.runtime import llm
from agents.runtime.ctx import Ctx
from agents.runtime.llm import strip_think
from agents.runtime.loop import GIVE_UP, parse_tool_calls, run_agent
from agents.runtime.tools import run_tool

PHONE = "+15550002001"
LEAD_PLACE_ID = "test-inbound-lead"

# The shape supabase/seed.sql writes (trimmed).
NEW_CONFIG = {
    "name": "Royal Pawz", "phone": "(833) 302-8947", "website": "royalpawzusa.com",
    "hours": "7 days a week, 8am to 6pm",
    "service_area_cities": ["Houston", "Pearland"], "service_area_zips": ["77082"],
    "services": [
        {"key": "royal_groom", "label": "Royal Groom", "description": "Our full groom.",
         "includes": ["bath and brush", "haircut"], "minutes_per_dog": 75,
         "base_cents": {"small": 13000, "medium": 16000, "large": 19000, "xl": 23000}},
        {"key": "royal_bath", "label": "Royal Bath", "includes": ["bath and brush"], "minutes_per_dog": 60,
         "base_cents": {"small": 8000, "medium": 10900, "large": 12400, "xl": 15000}},
    ],
    "coat_surcharge_cents": {"short": 0, "medium": 0, "long": 1500, "double": 2000},
    "addons": [{"key": "de_shed", "label": "De-shed treatment", "cents": 3000, "description": "Less shedding."}],
    "size_guide": {"small": "under 20 lb", "medium": "20 to 50 lb", "large": "50 to 90 lb", "xl": "over 90 lb"},
    "coat_guide": {"short": "labs", "medium": "spaniels", "long": "doodles", "double": "huskies"},
    "not_offered": ["cats", "daycare", "flea treatment"],
    "price_note": "Prices are before tax.",
    "policies": "Proof of rabies vaccination is required.",
    "tone": "Warm, brief, plain words, no emojis.",
}

# The placeholder the live DB held before the new seed.
OLD_CONFIG = {
    "_placeholder": True, "name": "Royal Pawz", "phone": "TODO", "hours": "Mon-Sat 8am-6pm",
    "service_area_zips": ["TODO"],
    "services": [{"key": "full_groom", "label": "Full groom",
                  "base_cents": {"small": 8500, "medium": 10500, "large": 13000, "xl": 16000}}],
    "coat_surcharge_cents": {"short": 0, "medium": 1000, "long": 2000, "double": 2500},
    "addons": [{"key": "deshed", "label": "De-shed treatment", "cents": 2500}],
    "policies": "TODO: cancellation, late, aggressive pets, vaccines",
}


def pure_tests():
    q = quote(NEW_CONFIG, QuoteArgs(service="royal_groom", size="medium", coat="long"))
    assert q["total_cents"] == 17500 and [i["cents"] for i in q["line_items"]] == [16000, 1500], q
    assert q["line_items"][1]["label"] == "Long coat", q
    q = quote(NEW_CONFIG, QuoteArgs(service="royal_bath", size="small", coat="double", addons=["de_shed", "de_shed"]))
    assert q["total_cents"] == 8000 + 2000 + 3000 and len(q["line_items"]) == 3, q
    q = quote(NEW_CONFIG, QuoteArgs(service="full_groom", size="small"))
    assert "royal_groom, royal_bath" in q["error"], q
    assert "de_shed" in quote(NEW_CONFIG, QuoteArgs(service="royal_groom", size="small", addons=["teeth"]))["error"]
    assert quote(OLD_CONFIG, QuoteArgs(service="full_groom", size="medium"))["total_cents"] == 10500
    print("ok  quote: base + coat line + add-ons; unknown keys list the real ones")

    assert strip_think("<think>plan</think>Hi there") == "Hi there"
    assert strip_think("<think>cut off by max_tokens") == ""
    assert strip_think("</think>\n\nHi there") == "Hi there"
    assert strip_think("reasoning</think>Hi there") == "Hi there"
    assert strip_think("<think>a</think>Hi<think>b") == "Hi"
    assert strip_think(None) == "" and strip_think("Hi") == "Hi"
    print("ok  strip_think: closed, unclosed and stray tags")

    calls = parse_tool_calls('Let me check.<tool_call>\n{"name": "find_slots", "arguments": '
                             '{"date_from": "2026-09-26", "date_to": "2026-09-26"}}\n</tool_call>')
    assert len(calls) == 1 and calls[0].function.name == "find_slots", calls
    assert json.loads(calls[0].function.arguments) == {"date_from": "2026-09-26", "date_to": "2026-09-26"}
    assert len(parse_tool_calls('<tool_call>{"name": "a", "arguments": {}}</tool_call>'
                                '<tool_call>{"name": "b", "arguments": "{}"}</tool_call>')) == 2
    assert parse_tool_calls('{"name": "quote", "arguments": {"service": "royal_groom"}}')[0].function.name == "quote"
    assert parse_tool_calls("Sounds good!") == [] and parse_tool_calls("<tool_call>{broken") == []
    print("ok  parse_tool_calls: tagged, several, bare JSON, plain text")

    long = "Absolutely, we can do that. " * 20
    assert len(trim_reply(long)) <= 320 and trim_reply(long).endswith("that.")
    words = "word " * 100
    assert len(trim_reply(words)) <= 320 and trim_reply(words).endswith("word...")
    assert trim_reply("  Short one.  ") == "Short one."
    print("ok  trim_reply: sentence boundary, then word boundary")

    dctx = Ctx(db=None, config={"name": "Royal Pawz"}, agent="inbound", ref=PHONE, phone=PHONE)
    assert disclose("A Royal Groom is $175.", dctx) == "Hi! This is Royal Pawz's AI assistant. A Royal Groom is $175."
    assert disclose("Hi! This is Royal Pawz's AI assistant. Sure.", dctx).count("AI assistant") == 1
    assert disclose("Hola, soy la asistente de IA.", dctx).startswith("Hola")
    print("ok  disclose: first reply always says it is an AI assistant")

    tomorrow = datetime.now(HOUSTON).date() + timedelta(days=1)
    for cfg in (NEW_CONFIG, OLD_CONFIG, {}):
        prompt = system_prompt(Ctx(db=None, config=cfg, agent="inbound", ref=PHONE, phone=PHONE))
        assert isinstance(prompt, str) and f"{tomorrow:%a} = {tomorrow:%Y-%m-%d}" in prompt, prompt[:600]
        assert "AI assistant" in prompt and "customer:" + PHONE in prompt
    prompt = system_prompt(Ctx(db=None, config=NEW_CONFIG, agent="inbound", ref=PHONE, phone=PHONE))
    assert "royal_groom" in prompt and "de_shed" in prompt and "16000" not in prompt
    assert "### Playbook" in prompt and "### Never" in prompt and "prompt:start" not in prompt, "how-to-reply.md not injected"
    assert "Follow-up mode" not in prompt
    prompt = system_prompt(Ctx(db=None, config=NEW_CONFIG, agent="inbound", ref=PHONE, phone=PHONE,
                               task={"payload": {"phone": PHONE, "reason": "got a quote, did not book"}}))
    assert "Follow-up mode" in prompt and "got a quote, did not book" in prompt
    print("ok  system_prompt: new, old and empty config; weekday table; playbook; follow-up section")

    assert _norm("The Pines Apartments!") == "pines" and _norm("Test Pines Apts.") == "test pines"
    print("ok  lead names normalize")

    # The loop runs text tool calls and never lets markup or JSON reach a customer.
    def fake_chat(replies: list[str], seen: list):
        async def chat(messages, tools=None, max_tokens=None):
            seen.append(list(messages))
            msg = SimpleNamespace(content=replies.pop(0), tool_calls=None)
            return SimpleNamespace(choices=[SimpleNamespace(message=msg)])
        return chat

    real_chat = llm.chat
    ctx = Ctx(db=None, config=NEW_CONFIG, agent="inbound", ref=PHONE, phone=PHONE)
    hi = [{"role": "user", "content": "What are your hours?"}]
    try:
        seen: list = []
        llm.chat = fake_chat(['<tool_call>{"name": "get_info", "arguments": {"topic": "hours"}}</tool_call>',
                              "<think>ok</think>We're open 7 days a week, 8am to 6pm."], seen)
        assert asyncio.run(run_agent(INBOUND, hi, ctx)) == "We're open 7 days a week, 8am to 6pm."
        assistant, tool = seen[1][-2], seen[1][-1]
        assert assistant["tool_calls"][0]["function"]["name"] == "get_info", assistant
        assert tool["role"] == "tool" and tool["tool_call_id"] == assistant["tool_calls"][0]["id"]
        assert "7 days a week" in tool["content"], tool
        for bad in ['{"text": "hi"}', "<tool_call>{broken", "<think>only thinking", ""]:
            llm.chat = fake_chat([bad], [])
            assert asyncio.run(run_agent(INBOUND, hi, ctx)) == GIVE_UP, bad
    finally:
        llm.chat = real_chat
    print("ok  run_agent: runs text tool calls; JSON, markup or empty replies give up")


def cleanup(db):
    db.table("bookings").delete().eq("phone", PHONE).execute()
    for table in ("messages", "ai_sessions", "customers"):
        db.table(table).delete().eq("phone", PHONE).execute()
    db.table("agent_events").delete().eq("ref", PHONE).execute()
    db.table("shared_notes").delete().eq("about", f"customer:{PHONE}").execute()
    for lead in db.table("leads").select("id").eq("place_id", LEAD_PLACE_ID).execute().data:
        db.table("shared_notes").delete().eq("about", f"lead:{lead['id']}").execute()
        db.table("leads").delete().eq("id", lead["id"]).execute()


def db_tests():
    try:
        from agents.db import get_db, load_config
        db = get_db()
        config = load_config(db)
    except Exception as e:
        print(f"skip DB tests: the database is unreachable ({type(e).__name__}); "
              "set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        return
    ctx = Ctx(db=db, config=config, agent="inbound", ref=PHONE, phone=PHONE)
    today = datetime.now(HOUSTON).date()
    filled = None  # (slot_id, booked before the test), restored in finally
    cleanup(db)
    try:
        res = asyncio.run(find_slots(ctx, FindSlotsArgs(date_from=today + timedelta(days=14), date_to=today)))
        assert len(res["slots"]) <= 3 and all(s["slot_id"] and s["label"] for s in res["slots"]), res
        assert all(datetime.fromisoformat(s["starts_at"]) > datetime.now(HOUSTON) for s in res["slots"]), res
        print(f"ok  find_slots: {len(res['slots'])} open slots with labels, reversed range handled")

        if not res["slots"] or not config.get("services"):
            print("skip booking tests: no open slots or no services (run supabase/seed.sql)")
        else:
            first = res["slots"][0]
            slot = db.table("slots").select("booked,capacity").eq("id", first["slot_id"]).execute().data[0]
            filled = (first["slot_id"], slot["booked"])
            service = config["services"][0]["key"]
            args = dict(service=service, size="medium", coat="long", slot_id=first["slot_id"],
                        pet_name="Testy", customer_name="Test Person")
            done = asyncio.run(book(ctx, BookArgs(**args)))
            assert done["status"] == "confirmed" and done["label"] == first["label"], done
            priced = quote(config, QuoteArgs(service=service, size="medium", coat="long"))
            assert done["total_cents"] == priced["total_cents"], (done, priced)
            again = asyncio.run(book(ctx, BookArgs(**args)))
            assert again["booking_id"] == done["booking_id"], again
            booked = db.table("slots").select("booked").eq("id", first["slot_id"]).execute().data[0]["booked"]
            assert booked == filled[1] + 1, "a repeated book took a second place"
            customer = db.table("customers").select("name,pets").eq("phone", PHONE).execute().data[0]
            assert customer["name"] == "Test Person" and customer["pets"][0]["name"] == "Testy", customer
            print("ok  book: confirmed at the quoted price, repeat is idempotent, pet saved")

            db.table("slots").update({"booked": slot["capacity"]}).eq("id", first["slot_id"]).execute()
            assert asyncio.run(book(ctx, BookArgs(**{**args, "pet_name": "Second"}))) == {"error": "slot_taken"}
            assert "error" in asyncio.run(book(ctx, BookArgs(**{**args, "slot_id": "not-a-uuid"})))
            print("ok  book: a full slot is refused with slot_taken")

        # run_tool logs to agent_events, and the next prompt shows the result with its slot IDs.
        call = SimpleNamespace(id="t1", function=SimpleNamespace(name="find_slots", arguments=json.dumps(
            {"date_from": str(today), "date_to": str(today + timedelta(days=3))})))
        found = asyncio.run(run_tool(INBOUND, call, ctx))
        prompt = system_prompt(ctx)
        assert "Recent tool results" in prompt, prompt[-800:]
        assert all(s["slot_id"] in prompt for s in found.get("slots", [])), prompt[-800:]
        print("ok  prompt: recent tool results carry slot IDs")

        # A real lead with "pines" in its name would win "the pines"; then use a narrower text.
        others = db.table("leads").select("id").ilike("name", "%pines%").execute().data
        text = "test pines apts" if others else "the pines"
        lead = db.table("leads").insert({"name": "Test Pines Apartments", "place_id": LEAD_PLACE_ID}).execute().data[0]
        res = asyncio.run(lookup_lead(ctx, LookupLeadArgs(property_name=text)))
        assert res == {"found": True, "lead_id": lead["id"], "name": "Test Pines Apartments",
                       "status": "replied"}, res
        assert db.table("leads").select("status").eq("id", lead["id"]).execute().data[0]["status"] == "replied"
        assert db.table("shared_notes").select("note").eq("about", f"lead:{lead['id']}").execute().data
        print(f"ok  lookup_lead: \"{text}\" found the lead, set it replied and left a note")
    finally:
        cleanup(db)
        if filled:
            db.table("slots").update({"booked": filled[1]}).eq("id", filled[0]).execute()


def main():
    pure_tests()
    db_tests()
    print("INBOUND TESTS PASSED")


if __name__ == "__main__":
    main()
