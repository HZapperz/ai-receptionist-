# CONTRACTS: frozen interfaces

Change anything here only after telling the whole team. Schema source of truth: `supabase/migrations/` (0001_init, 0002_ai_gate; a schema change is a new numbered file).

## Shared state

Agents never call each other. They hand off work through `tasks` and share knowledge through `business_config`, `customers`, `leads` and `shared_notes`. The browser never writes. Every tool call is logged to `agent_events` by `run_tool()`.

| Table | Inbound | Outbound | Manager | Dashboard |
| --- | --- | --- | --- | --- |
| business_config | read | read | read | read |
| customers | read, write | none | read | read |
| messages | read, write | none | read | read |
| slots | read, take_slot() | none | read | read |
| bookings | read, write | none | read | read |
| leads | read, set status replied | read, write | read | read |
| tasks | read own, update status | read own, update status | write | read |
| shared_notes | read, write | read, write | read, write | read |
| agent_events | write | write | write | read |

## Status values

- bookings.status: `confirmed`, `cancelled`
- leads.status: `new`, `drafted`, `sent`, `replied`
- tasks.status: `pending`, `running`, `done`, `failed`
- agent_events.kind: `tool`, `message`, `error`. `ref` holds the phone, lead id or task id the row belongs to.

## Tool argument models

```python
from datetime import date
from typing import Literal
from pydantic import BaseModel, Field

Size = Literal["small", "medium", "large", "xl"]
Coat = Literal["short", "medium", "long", "double"]

# shared by all three agents (agents/runtime/shared_tools.py)
class RememberArgs(BaseModel):
    about: str = Field(description='Key such as "customer:+17135550100", "lead:<uuid>" or "business"')
    note: str

class RecallArgs(BaseModel):
    about: str

# inbound (agents/inbound/tools.py)
class GetInfoArgs(BaseModel):
    topic: Literal["hours", "area", "services", "policies"]

class QuoteArgs(BaseModel):
    service: str                      # a key from business_config.data.services
    size: Size
    coat: Coat = "short"
    addons: list[str] = []            # keys from business_config.data.addons

class FindSlotsArgs(BaseModel):
    date_from: date
    date_to: date

class BookArgs(QuoteArgs):
    slot_id: str
    pet_name: str
    customer_name: str | None = None

class LookupLeadArgs(BaseModel):
    property_name: str

class EscalateArgs(BaseModel):
    reason: Literal["refund", "complaint", "medical", "aggressive_pet",
                    "off_menu", "partner_lead", "other"]
    summary: str

# outbound, drafting run only (agents/outbound/tools.py)
class GetLeadArgs(BaseModel):
    lead_id: str

class SaveDraftArgs(BaseModel):
    lead_id: str
    subject: str = Field(max_length=90)
    body: str

# manager (agents/manager/tools.py)
class GetSummaryArgs(BaseModel):
    since_minutes: int = 60

class ListLeadsArgs(BaseModel):
    status: Literal["new", "drafted", "sent", "replied"] | None = None
    limit: int = 10

class ListBookingsArgs(BaseModel):
    status: Literal["confirmed", "cancelled"] | None = None
    limit: int = 10

class GetConversationArgs(BaseModel):
    phone_or_name: str

class CreateTaskArgs(BaseModel):
    for_agent: Literal["outbound", "inbound"]
    kind: Literal["find_leads", "draft_emails", "follow_up"]
    payload: dict
```

## Tool return shapes

| Tool | Returns |
| --- | --- |
| remember | `{"ok": true}` |
| recall | `{"notes": [{"note", "written_by", "created_at"}]}` newest first, max 10 |
| get_info | `{"text": str}` |
| quote | `{"line_items": [{"label", "cents"}], "total_cents": int}` |
| find_slots | `{"slots": [{"slot_id", "starts_at"}]}` max 3, only slots with room |
| book | `{"booking_id", "starts_at", "total_cents", "status": "confirmed"}` or `{"error": "slot_taken"}`. Recomputes the price in code; never trusts a total from the model. |
| lookup_lead | `{"found": bool, "lead_id", "name", "status"}`. Sets the lead to `replied` when found. |
| escalate | `{"ok": true}`. Texts OWNER_PHONE with the summary. |
| get_lead | `{"lead_id", "name", "address", "rating", "website", "snippet"}` with snippet 300 characters or fewer |
| save_draft | `{"ok": true}`. Sets the lead to `drafted`. |
| get_summary | `{"texts_in", "texts_out", "bookings", "leads_new", "leads_drafted", "emails_sent", "lead_replies", "escalations", "notable": [str]}` |
| list_leads, list_bookings | `{"rows": [...]}` |
| get_conversation | `{"phone", "name", "messages": [{"direction", "body", "created_at"}]}` last 20 |
| create_task | `{"task_id", "status": "pending"}`. The `/manager` route then starts `run_task(task_id)` in the background. |

An error is always `{"error": str}`. Tools never raise to the model.

## Tasks

| kind | for_agent | payload | Effect |
| --- | --- | --- | --- |
| find_leads | outbound | `{"term": str, "area": str, "limit": int}` | Apify run, leads upserted on place_id, then a draft_emails task for the new rows |
| draft_emails | outbound | `{"lead_ids": [str]}` or `{"lead_ids": "all_new"}` | One drafting run per lead, one after another |
| follow_up | inbound | `{"phone": str, "reason": str}` | Inbound agent texts a follow-up, for example to someone who got a quote and did not book |

## HTTP routes (agents service)

| Route | Caller | Does |
| --- | --- | --- |
| GET /health | anyone | `{"ok": true}` |
| POST /sms | Twilio | Verify signature, then the 833 gate (below). For a phone in an AI session: insert the message (dedupe on MessageSid), return `<Response/>` at once, run the inbound agent in a background task, reply through the Twilio REST API. Anything else is forwarded to production |
| POST /manager | dashboard | Body `{"message": str, "history": [{"role", "content"}]}`. Runs the manager agent synchronously, returns `{"reply": str}` |
| POST /outbound/find | dashboard | Body `{"term", "area", "limit"}`. Creates and starts a find_leads task |
| POST /outbound/draft | dashboard | Body `{"lead_ids"}`. Creates and starts a draft_emails task |
| POST /outbound/send | dashboard | Body `{"lead_id"}`. Checks SEND_ALLOWLIST, sends the saved draft, sets status `sent` |
| POST /tasks/run | dashboard | Runs any pending tasks. The manual kick |

The dashboard calls these as `/agents/<route>` on its own origin. Next.js rewrites to `AGENTS_URL`.

## Env vars

| Var | Used by |
| --- | --- |
| LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_MAX_CONCURRENCY, LLM_DISABLE_THINKING, LLM_FAKE | agents/runtime/llm.py |
| SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | agents/db.py |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | lib/supabase.ts |
| AGENTS_URL | next.config rewrite |
| TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_VALIDATE_SIGNATURE, PUBLIC_AGENTS_URL, OWNER_PHONE | agents/inbound/twilio_io.py |
| AI_GATE_CODE, AI_GATE_TTL_HOURS, PROD_SMS_WEBHOOK_URL | agents/inbound/gate.py |
| APIFY_TOKEN, APIFY_ACTOR_ID | agents/outbound/apify_io.py |
| EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM, SEND_ALLOWLIST | agents/outbound/email_io.py |

## 833 gate

The demo borrows Royal Pawz's verified toll-free number, (833) 302-8947, which also carries real customers. The gate keeps them apart. It lives in `agents/inbound/gate.py` and every `/sms` request passes through it first.

| Inbound text | What happens |
| --- | --- |
| Contains `AI_GATE_CODE` (any case) | Opens or renews an `ai_sessions` row for `AI_GATE_TTL_HOURS`. The code is stripped and the rest goes to the inbound agent; a bare code gets the agent's greeting |
| From a phone with an active session | Normal inbound flow: store, `<Response/>` at once, agent in the background |
| `EXIT` from a phone with a session | Ends the session, replies once that the team will take it from here |
| `STOP`, `START`, `HELP` (and variants) | Always forwarded to production. `STOP` also ends the session |
| Anything else | Forwarded to `PROD_SMS_WEBHOOK_URL` with the original form params and a fresh `X-Twilio-Signature` for that URL. Production's status, body and content type go back to Twilio. **Never stored, never logged with its body.** 8-second timeout, then 502. If `PROD_SMS_WEBHOOK_URL` is unset, 503. Both make Twilio use the number's fallback URL, which during the demo is production |

Table `ai_sessions`: `phone` (primary key), `started_at`, `expires_at`, `ended_at`. Active means `ended_at is null and expires_at > now()`.

`twilio_io.send_sms(to, body)` refuses any `to` that is not `OWNER_PHONE` and has no active session: `{"error": "not_in_ai_session"}`. With no `TWILIO_AUTH_TOKEN` it sends nothing and returns `{"ok": true, "dry_run": true}`, logging the text to `agent_events`. A `follow_up` task can therefore never text a real customer.

Only the owner changes the number's webhook, and only by following `docs/TWILIO-833-CUTOVER.md`.
