# Inbound lane: inbound agent, the shared runtime, and the 833 gate

You own agents/runtime and agents/inbound. Everyone else imports the runtime and never edits it, so keep its interfaces exactly as docs/CONTRACTS.md and the existing code define them. agents/booking.py is in the shared area: you are its main user, so you will usually be the one filling in quote(), take_slot() and create_booking(). Announce it in the team chat first.

## What this agent is
The texting front desk for Royal Pawz. A customer or a partner lead texts the business number. The agent answers questions, quotes, offers slots, books, and recognizes leads who mention their property.

## Flow
POST /sms (agents/inbound/routes.py) verifies the Twilio signature, then asks the gate (agents/inbound/gate.py) what to do:
- Forward: the text goes to production untouched. Nothing is stored. This is most real traffic.
- AI: insert the message (unique twilio_sid dedupes retries) and return `<Response/>` immediately. A background task takes the per-phone lock, loads the last 20 messages, the customer row and business_config, runs the agent, sends the reply with send_sms, and stores it as an outbound message.

## The 833 gate
The real logic is already written and tested (`python -m agents.tests.test_gate`). Change it only to fix a bug, and rerun the test after. The rules are in docs/CONTRACTS.md. The invariants:
- A text from a phone without an active session is forwarded and never stored.
- send_sms never texts a phone without an active session, except OWNER_PHONE.
- STOP, START and HELP always reach production.

## Tools
get_info, quote, find_slots, book, lookup_lead, escalate, plus remember and recall from runtime/shared_tools.py. quote and book call agents/booking.py. Until someone fills those in, the stubs there return fixed values.

## Real conversations (local only)
If `data/sms-export/` exists on your machine, it holds Royal Pawz's real SMS history, anonymized: 3,162 texts, and `reply_pairs.jsonl` with what customers asked and how staff answered. Read its README first. Use it for tone and example replies. It is gitignored; never copy its contents into committed files.

## Prompt rules
- First reply in a conversation says it is Royal Pawz's AI assistant.
- Under 320 characters per reply. Match the customer's language.
- Never state a price or a time that did not come from a tool result.
- To book you need: service, size, coat, pet name and a slot the customer picked.
- If the text names an apartment community or mentions our email, call lookup_lead, then escalate with reason partner_lead.
- Refunds, complaints, medical or aggressive-pet issues and off-menu asks: escalate.
- When you learn something worth keeping about a pet or customer, call remember.

## Done when
python -m agents.tests.smoke passes against the real model, and a real text to the Twilio number (after the owner's cutover, starting with the gate code) ends in a confirmed row in bookings.
