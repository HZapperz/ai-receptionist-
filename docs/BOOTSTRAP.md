# BOOTSTRAP.md: repo setup brief for Claude Code

> Audience: the Claude Code session that scaffolds this repo. Humans should read `docs/ARCHITECTURE.md` instead.

## 0. Your job

Scaffold this repository so four developers can each open a Claude Code session in their own folder and build in parallel within 20 minutes of cloning.

You create the structure, the contracts, the context files, and **running stubs**. You do not implement real business logic. Lane owners do that, and they need stable interfaces more than they need your guesses.

Work through the sections in order. Commit after each numbered section with a clear message. When the checks in section 9 pass, stop and print the hand-off note in section 10. If something here conflicts with a tool's current defaults (for example the Next.js scaffolder's flags), adapt and note what you changed in the README.

## 1. What we are building

A hackathon demo due tonight. One "AI employee" for one business, **Royal Pawz** (a mobile pet grooming company in Houston), made of three agents that share one Supabase database:

| Agent | What it does | Triggered by |
| --- | --- | --- |
| Inbound | Answers texts on the business number. Gives info, quotes, offers slots, books, recognizes partner leads who text in. | Twilio webhook, `follow_up` tasks |
| Outbound | Finds partner leads (Houston apartment communities) with an Apify Google Maps actor, drafts one personal email per lead. A person clicks Send. | `find_leads` and `draft_emails` tasks, the Send button |
| Manager | A chat box on the dashboard. The owner asks what happened and tells it what to do next. It hands work to the other two by writing tasks. | Dashboard chat |

The demo has to show three things: an outbound email landing in an inbox, a text conversation that ends in a confirmed booking, and the manager handing a task to the outbound agent while the owner watches new leads appear.

**Hard scope limits. Do not build any of these:** payments, signup or login, queues or cron, agent frameworks (LangChain, CrewAI and so on), voice, multi-tenant anything. One business lives in one config row. Swapping that row for another business is the whole product story tonight.

## 2. Stack

- **Dashboard:** Next.js (App Router, TypeScript, Tailwind) with `@supabase/supabase-js`. Deployed on Vercel.
- **Agents service:** Python 3.11+, FastAPI, pydantic v2, the `openai` package (`AsyncOpenAI`) pointed at Featherless, `supabase` (supabase-py), `twilio`, `apify-client`. It runs as **one always-on uvicorn process**, never as serverless functions. Twilio waits about 15 seconds for a webhook, so `/sms` answers at once and finishes the agent run in a background task. That, a per-phone lock and a process-wide concurrency cap all need a long-lived process.
- **Database:** Supabase Postgres with Realtime. RLS is on. The `anon` role can only select. The agents service writes with the service role key.
- **Model:** `Qwen/Qwen3-32B` on Featherless (OpenAI-compatible, native tool calling), set by env so the provider can be swapped without code changes.

## 3. Repo tree to create

```text
/
  app/                     Next.js App Router: one dashboard page
    CLAUDE.md              lane 4 context
  components/              ManagerChat, LeadsPanel, InboxPanel, TracePanel, BookingsPanel
  lib/                     TS only: supabase.ts, agents.ts, useTable.ts
  next.config.*            rewrite /agents/:path* -> AGENTS_URL/:path*
  agents/                  Python package (FastAPI service)
    __init__.py
    main.py                app + routes
    settings.py            env vars (pydantic-settings)
    db.py                  Supabase client (service role) + small query helpers
    booking.py             quote(), take_slot(), create_booking()   [stubs]
    tasks.py               run_task(): routes a task row to its agent   [stub]
    runtime/
      __init__.py
      ctx.py               Ctx dataclass
      llm.py               model client: retry, concurrency cap, think stripping, fake mode
      tools.py             Tool, AgentSpec, run_tool()
      loop.py              run_agent()
      events.py            log_event()
      shared_tools.py      remember / recall, available to every agent
    inbound/
      CLAUDE.md            lane 1 context
      __init__.py  prompt.py  tools.py  twilio_io.py
    outbound/
      CLAUDE.md            lane 3 context
      __init__.py  prompt.py  tools.py  apify_io.py  email_io.py
    manager/
      CLAUDE.md            lane 4 context (agent half)
      __init__.py  prompt.py  tools.py
    tests/
      __init__.py  smoke.py
    requirements.txt
  supabase/
    migrations/0001_init.sql
    seed.sql
  docs/
    ARCHITECTURE.md        already written by a human; do not edit
    CONTRACTS.md
  CLAUDE.md
  README.md
  .env.example
  .gitignore
```

Run the Next.js scaffolder first, in the empty repo root, then add everything else. Suggested: `npx create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*"`. Then `npm i @supabase/supabase-js`.

## 4. Shared state: the database is how agents share information

Agents never call each other. They hand off work through the `tasks` table and share knowledge through `business_config`, `customers`, `leads` and `shared_notes`. Everything any agent does is logged to `agent_events`, which is also the dashboard's trace panel.

| Table | Inbound | Outbound | Manager | Dashboard |
| --- | --- | --- | --- | --- |
| `business_config` | read | read | read | read |
| `customers` | read, write | none | read | read |
| `messages` | read, write | none | read | read |
| `slots` | read, take via `take_slot()` | none | read | read |
| `bookings` | read, write | none | read | read |
| `leads` | read, set status `replied` | read, write | read | read |
| `tasks` | read own, update status | read own, update status | write | read |
| `shared_notes` | read, write | read, write | read, write | read |
| `agent_events` | write | write | write | read |

`shared_notes` is the explicit shared memory. Any agent can `remember(about, note)` and any agent can `recall(about)`. Example: the inbound agent notes that a dog is nervous around dryers, and the manager can answer "anything I should know about Bella?" later. Keys look like `customer:+17135550100`, `lead:<uuid>` or `business`.

The browser never writes to the database. Every write goes through the agents service.

## 5. Files to write verbatim

### 5.1 `supabase/migrations/0001_init.sql`

```sql
create extension if not exists pgcrypto;

create table business_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

create table customers (
  phone text primary key,
  name text,
  pets jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now()
);

create table messages (
  id bigint generated always as identity primary key,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  body text not null,
  twilio_sid text unique,
  created_at timestamptz not null default now()
);
create index messages_phone_idx on messages (phone, created_at);

create table slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  capacity int not null default 1,
  booked int not null default 0
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  phone text references customers(phone),
  service text not null,
  pet_name text,
  details jsonb not null default '{}',
  slot_id uuid references slots(id),
  total_cents int not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  place_id text unique,
  name text not null,
  address text,
  phone text,
  email text,
  website text,
  rating numeric,
  raw jsonb,
  status text not null default 'new' check (status in ('new','drafted','sent','replied')),
  draft_subject text,
  draft_body text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  for_agent text not null check (for_agent in ('inbound','outbound')),
  kind text not null check (kind in ('find_leads','draft_emails','follow_up')),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  created_by text not null default 'manager',
  result jsonb,
  created_at timestamptz not null default now()
);

create table shared_notes (
  id bigint generated always as identity primary key,
  about text not null,
  note text not null,
  written_by text not null,
  created_at timestamptz not null default now()
);
create index shared_notes_about_idx on shared_notes (about, created_at);

create table agent_events (
  id bigint generated always as identity primary key,
  agent text not null,
  kind text not null check (kind in ('tool','message','error')),
  name text,
  input jsonb,
  result jsonb,
  latency_ms int,
  ref text,
  created_at timestamptz not null default now()
);

-- take a slot without double booking; returns true when the slot was taken
create or replace function take_slot(p_slot uuid) returns boolean
language sql as $$
  with u as (
    update slots set booked = booked + 1
    where id = p_slot and booked < capacity
    returning 1
  )
  select exists (select 1 from u);
$$;

-- RLS: the browser (anon) can read everything and write nothing.
-- The agents service uses the service role key, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['business_config','customers','messages','slots','bookings',
                           'leads','tasks','shared_notes','agent_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy anon_read on %I for select to anon using (true)', t);
  end loop;
end $$;

alter publication supabase_realtime
  add table messages, bookings, leads, tasks, shared_notes, agent_events;
```

### 5.2 `supabase/seed.sql`

All prices below are placeholders so quotes work before the real numbers arrive. Keep the `_placeholder` flag so nobody mistakes them for real prices.

```sql
insert into business_config (id, data) values (1, '{
  "_placeholder": true,
  "name": "Royal Pawz",
  "phone": "TODO",
  "mailing_address": "TODO",
  "hours": "Mon-Sat 8am-6pm",
  "service_area_zips": ["TODO"],
  "services": [
    {"key": "full_groom", "label": "Full groom",
     "base_cents": {"small": 8500, "medium": 10500, "large": 13000, "xl": 16000}},
    {"key": "bath_brush", "label": "Bath and brush",
     "base_cents": {"small": 6000, "medium": 7500, "large": 9500, "xl": 12000}}
  ],
  "coat_surcharge_cents": {"short": 0, "medium": 1000, "long": 2000, "double": 2500},
  "addons": [
    {"key": "nail_grind", "label": "Nail grind", "cents": 1500},
    {"key": "teeth", "label": "Teeth brushing", "cents": 1000},
    {"key": "deshed", "label": "De-shed treatment", "cents": 2500}
  ],
  "policies": "TODO: cancellation, late, aggressive pets, vaccines",
  "tone": "Warm, brief, plain words, no emojis.",
  "outbound": {
    "audience": "pet-friendly apartment communities in Houston",
    "offer": "A monthly on-site grooming day for residents, at no cost to the property.",
    "cta": "Text us at the number below to pick a date.",
    "sender_name": "TODO"
  }
}'::jsonb)
on conflict (id) do update set data = excluded.data;

-- two weeks of slots, three a day, capacity 2 (two vans), Houston time
insert into slots (starts_at, capacity)
select (d + t) at time zone 'America/Chicago', 2
from generate_series(current_date + 1, current_date + 14, interval '1 day') as d,
     unnest(array[interval '9 hours', interval '12 hours', interval '15 hours']) as t;
```

### 5.3 `docs/CONTRACTS.md`

````markdown
# CONTRACTS: frozen interfaces

Change anything here only after telling the whole team. Schema source of truth: `supabase/migrations/0001_init.sql`.

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
| POST /sms | Twilio | Verify signature, insert the message (dedupe on MessageSid), return `<Response/>` at once, run the inbound agent in a background task, reply through the Twilio REST API |
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
| APIFY_TOKEN, APIFY_ACTOR_ID | agents/outbound/apify_io.py |
| EMAIL_PROVIDER, EMAIL_API_KEY, EMAIL_FROM, SEND_ALLOWLIST | agents/outbound/email_io.py |
````

### 5.4 Root `CLAUDE.md`

Keep this file short. Claude Code loads it in every session, and nested `CLAUDE.md` files load on demand when a session reads files in that folder.

```markdown
# Royal Pawz AI employee: hackathon repo

Three agents (inbound SMS, outbound prospecting, manager chat) share one Supabase database. The demo is due tonight. Read docs/ARCHITECTURE.md for the why and docs/CONTRACTS.md for the interfaces.

## Rules
- Read docs/CONTRACTS.md before writing code. Never change table names, tool signatures, task kinds, routes or env var names without the team agreeing first.
- Stay inside your lane's folders. The nested CLAUDE.md where you are working says what you own. Only lane 1 edits agents/runtime. Only lane 2 edits supabase/ and agents/booking.py.
- Python 3.11+, FastAPI, pydantic v2, openai AsyncOpenAI, supabase-py. No agent frameworks, queues, cron, auth or payments.
- A tool handler validates with its pydantic model, does the work in code, and returns a small JSON-serializable dict. run_tool() logs it to agent_events; do not log it again.
- Prices, slots and sends are computed in code. The model never states a price or a time that did not come from a tool result.
- The model never sends email. Only POST /outbound/send does, after a person clicks, and only to SEND_ALLOWLIST.
- Agents never call each other. Hand off work with a row in tasks; share knowledge with remember() and recall().
- Keep it small. No abstraction that is not used twice today.

## Commands
- Agents: `uvicorn agents.main:app --reload --port 8000`
- Dashboard: `npm run dev`
- Smoke test: `python -m agents.tests.smoke`
- Tunnel: `ngrok http 8000`, then point the Twilio number's messaging webhook at `<ngrok-url>/sms`

## Lanes
| Lane | Owns |
| --- | --- |
| 1. Inbound | agents/runtime, agents/inbound |
| 2. Data | supabase/, agents/db.py, agents/booking.py, deploys |
| 3. Outbound | agents/outbound, agents/tasks.py |
| 4. Manager and dashboard | app/, components/, lib/, agents/manager |
```

### 5.5 `agents/inbound/CLAUDE.md`

```markdown
# Lane 1: inbound agent and the shared runtime

You own agents/runtime and agents/inbound. Everyone else imports the runtime and never edits it, so keep its interfaces exactly as docs/CONTRACTS.md and the existing code define them.

## What this agent is
The texting front desk for Royal Pawz. A customer or a partner lead texts the business number. The agent answers questions, quotes, offers slots, books, and recognizes leads who mention their property.

## Flow
POST /sms verifies the Twilio signature, inserts the message (unique twilio_sid dedupes retries), and returns `<Response/>` immediately. A background task takes the per-phone lock, loads the last 20 messages, the customer row and business_config, runs the agent, sends the reply with the Twilio REST API, and stores it as an outbound message.

## Tools
get_info, quote, find_slots, book, lookup_lead, escalate, plus remember and recall from runtime/shared_tools.py. quote and book call agents/booking.py (lane 2). Until lane 2 lands them, the stubs there return fixed values.

## Prompt rules
- First reply in a conversation says it is Royal Pawz's AI assistant.
- Under 320 characters per reply. Match the customer's language.
- Never state a price or a time that did not come from a tool result.
- To book you need: service, size, coat, pet name and a slot the customer picked.
- If the text names an apartment community or mentions our email, call lookup_lead, then escalate with reason partner_lead.
- Refunds, complaints, medical or aggressive-pet issues and off-menu asks: escalate.
- When you learn something worth keeping about a pet or customer, call remember.

## Done when
python -m agents.tests.smoke passes against the real model, and a real text to the Twilio number ends in a confirmed row in bookings.
```

### 5.6 `agents/outbound/CLAUDE.md`

```markdown
# Lane 3: outbound agent and task routing

You own agents/outbound and agents/tasks.py.

## What this agent is
Prospecting for Royal Pawz. It finds partner leads (default: pet-friendly apartment communities in Houston), drafts one personal email per lead, and sends only when a person clicks Send.

## Flow
- find_leads task: apify_io.find_leads(term, area, limit) calls the actor in APIFY_ACTOR_ID, normalizes results, upserts into leads on place_id, then creates a draft_emails task for the new rows. This is plain code; the model is not involved. Check the actor's input schema on its Apify page before wiring fields.
- draft_emails task: one short run_agent() call per lead, one after another, never in parallel, because the model has a concurrency cap. Tools: get_lead, save_draft, remember, recall.
- POST /outbound/send: email_io.send() checks SEND_ALLOWLIST, sends the saved draft, sets status sent. The model never calls this.

## Prompt rules for drafts
- 120 words or fewer, plain text, no markdown.
- Name the property. Use one detail from the lead record if there is a real one; never invent details.
- One offer and one call to action, both from business_config.data.outbound.
- Footer: business name, mailing address, and "Reply STOP and we will not email again."

## Tonight's safety rules
- Email only. No texts to leads.
- SEND_ALLOWLIST holds the team's and judges' addresses. Any other recipient is refused with {"error": "not_allowlisted"}.
- An Apify run can take a minute or more. run_task() marks the task running, then done or failed with a result.

## Done when
POST /outbound/find lands 20 leads, every new lead gets a draft, and Send delivers one email to an allowlisted inbox.
```

### 5.7 `agents/manager/CLAUDE.md`

```markdown
# Lane 4 (agent half): manager agent

You own agents/manager, plus app/, components/ and lib/ (see app/CLAUDE.md).

## What this agent is
The owner's chief of staff on the dashboard. It answers questions about the business from real data and hands work to the other two agents by writing tasks.

## Flow
POST /manager receives {"message", "history"}, runs the agent synchronously (expect 5 to 20 seconds) and returns {"reply"}. When a run calls create_task, the route starts run_task(task_id) as a background task after the run. The dashboard's trace panel fills live from agent_events while the owner waits.

## Tools
get_summary, list_leads, list_bookings, get_conversation, create_task, plus remember and recall. Narrow tools only. No free-form SQL, ever.

## Prompt rules
- Answer from tool results only, with numbers.
- When asked to do work, create the task, then say what will appear and in which panel.
- If a request is outside find_leads, draft_emails or follow_up, say so plainly.

## Build order
Ship read-only first (every tool except create_task). Add create_task last. If time runs out, the read-only manager still demos.

## Done when
"What happened in the last hour?" returns real counts, and "find ten more communities in the Heights and draft emails" makes new rows appear in the Leads panel.
```

### 5.8 `app/CLAUDE.md`

```markdown
# Lane 4 (dashboard half)

One page, four panels, all reading Supabase directly with the anon key and Realtime: ManagerChat, LeadsPanel (table, draft preview, Send button), InboxPanel (threads by phone) with TracePanel beside it (agent_events, newest first), BookingsPanel.

- The browser never writes to Supabase. RLS gives anon select only.
- Actions go through fetch("/agents/<route>"); next.config rewrites that to AGENTS_URL. Use lib/agents.ts.
- Use lib/useTable.ts for "load rows, then subscribe to inserts and updates".
- Desktop first. It runs on a projector. No auth, no routing beyond the one page.
```

### 5.9 `.env.example`

```bash
# model
LLM_BASE_URL=https://api.featherless.ai/v1
LLM_API_KEY=
LLM_MODEL=Qwen/Qwen3-32B
LLM_MAX_CONCURRENCY=2
LLM_DISABLE_THINKING=true
LLM_FAKE=false

# supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# dashboard -> agents service
AGENTS_URL=http://localhost:8000

# twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_VALIDATE_SIGNATURE=true
PUBLIC_AGENTS_URL=
OWNER_PHONE=

# apify
APIFY_TOKEN=
APIFY_ACTOR_ID=lukaskrivka/google-maps-with-contact-details

# email
EMAIL_PROVIDER=resend
EMAIL_API_KEY=
EMAIL_FROM=
SEND_ALLOWLIST=
```

### 5.10 `agents/requirements.txt`

```text
fastapi
uvicorn[standard]
pydantic>=2
pydantic-settings
openai>=1.40
supabase>=2
twilio
apify-client
python-multipart
httpx
resend
```

### 5.11 Next.js rewrite

Put this in whichever `next.config` file the scaffolder created, adapting the syntax if it is `.ts` or `.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target = process.env.AGENTS_URL || "http://localhost:8000";
    return [{ source: "/agents/:path*", destination: `${target}/:path*` }];
  },
};
module.exports = nextConfig;
```

## 6. Python scaffolding

The runtime below is real code. Everything outside `agents/runtime` is a stub that returns a fixed value matching its contract, so the whole system runs end to end on day zero.

### 6.1 `agents/runtime/ctx.py`

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class Ctx:
    db: Any                      # supabase client, service role
    config: dict                 # business_config.data
    agent: str                   # "inbound" | "outbound" | "manager"
    ref: str | None = None       # phone, lead id or task id, for agent_events.ref
    phone: str | None = None
    customer: dict | None = None
    task: dict | None = None
```

### 6.2 `agents/runtime/llm.py`

```python
import asyncio
import random
import re
from types import SimpleNamespace

from openai import APITimeoutError, AsyncOpenAI, RateLimitError

from agents.settings import settings

_client = AsyncOpenAI(base_url=settings.LLM_BASE_URL, api_key=settings.LLM_API_KEY or "x", timeout=45)
# A 24B-34B model costs 2 concurrency units per in-flight call on Featherless,
# so a 4-unit plan allows 2 at once. Confirm with GET /v1/plan.
_sem = asyncio.Semaphore(settings.LLM_MAX_CONCURRENCY)
_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_think(text: str | None) -> str:
    """Reasoning must never reach a customer."""
    return _THINK.sub("", text or "").strip()


def _fake_response():
    msg = SimpleNamespace(content="(stub reply: LLM_FAKE is on)", tool_calls=None)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


async def chat(messages: list[dict], tools: list[dict] | None = None):
    if settings.LLM_FAKE:
        return _fake_response()
    kwargs: dict = dict(model=settings.LLM_MODEL, messages=messages, temperature=0.2, max_tokens=800)
    if tools:
        kwargs["tools"] = tools
    if settings.LLM_DISABLE_THINKING:
        # Qwen3 thinking switch. Verify the key on the provider's docs;
        # the fallback is to append "/no_think" to the system prompt.
        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
    for attempt in range(4):
        try:
            async with _sem:
                return await _client.chat.completions.create(**kwargs)
        except (RateLimitError, APITimeoutError):
            if attempt == 3:
                raise
            await asyncio.sleep(1.5 * (attempt + 1) + random.random())
```

### 6.3 `agents/runtime/events.py`

```python
from agents.runtime.ctx import Ctx


async def log_event(ctx: Ctx, *, kind: str, name: str | None = None, input=None,
                    result=None, latency_ms: int | None = None) -> None:
    try:
        ctx.db.table("agent_events").insert({
            "agent": ctx.agent, "kind": kind, "name": name, "input": input,
            "result": result, "latency_ms": latency_ms, "ref": ctx.ref,
        }).execute()
    except Exception:
        pass  # logging must never break a run
```

### 6.4 `agents/runtime/tools.py`

```python
import json
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import BaseModel, ValidationError

from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    handler: Callable[[Ctx, BaseModel], Awaitable[dict]]

    def schema(self) -> dict:
        return {"type": "function", "function": {
            "name": self.name,
            "description": self.description,
            "parameters": self.args.model_json_schema(),
        }}


@dataclass
class AgentSpec:
    name: str
    system_prompt: Callable[[Ctx], str]
    tools: list[Tool]


async def run_tool(spec: AgentSpec, call, ctx: Ctx) -> dict:
    tool = next((t for t in spec.tools if t.name == call.function.name), None)
    if tool is None:
        return {"error": f"unknown tool {call.function.name}"}
    started = time.monotonic()
    raw = call.function.arguments or "{}"
    try:
        args = tool.args.model_validate_json(raw)
        result = await tool.handler(ctx, args)
    except ValidationError as e:
        result = {"error": "invalid arguments", "detail": str(e)[:500]}
    except Exception as e:  # tools never raise to the model
        result = {"error": str(e)[:500]}
    try:
        logged_input = json.loads(raw)
    except Exception:
        logged_input = {"raw": raw[:500]}
    await log_event(ctx, kind="tool", name=tool.name, input=logged_input, result=result,
                    latency_ms=int((time.monotonic() - started) * 1000))
    return result
```

### 6.5 `agents/runtime/loop.py`

```python
import json

from agents.runtime import llm
from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event
from agents.runtime.tools import AgentSpec, run_tool

GIVE_UP = "Let me get a person to help with this. Someone from the team will text you shortly."


async def run_agent(spec: AgentSpec, messages: list[dict], ctx: Ctx, max_steps: int = 6) -> str:
    msgs: list[dict] = [{"role": "system", "content": spec.system_prompt(ctx)}, *messages]
    schemas = [t.schema() for t in spec.tools]
    for _ in range(max_steps):
        resp = await llm.chat(msgs, tools=schemas)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            text = llm.strip_think(msg.content)
            await log_event(ctx, kind="message", name="reply", result={"text": text})
            return text
        msgs.append(msg.model_dump(exclude_none=True))
        for call in msg.tool_calls:
            result = await run_tool(spec, call, ctx)
            msgs.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)})
    await log_event(ctx, kind="error", name="max_steps", result={"steps": max_steps})
    return GIVE_UP
```

### 6.6 `agents/runtime/shared_tools.py`

Implement `remember` and `recall` for real (they are ten lines each) using `RememberArgs` and `RecallArgs` from the contracts, writing `written_by = ctx.agent`. Export `SHARED_TOOLS: list[Tool]` and have every agent's spec include it.

### 6.7 Everything else

- `agents/settings.py`: a `pydantic_settings.BaseSettings` class with every var from `.env.example`, reading `.env`. Types: `LLM_MAX_CONCURRENCY: int = 2`; the three flags are `bool`; `SEND_ALLOWLIST: str = ""` with a helper that returns a lowercased set.
- `agents/db.py`: `get_db()` returns a cached supabase client built from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Add `load_config(db) -> dict` that reads `business_config.data`. supabase-py calls are synchronous; that is fine for tonight.
- `agents/booking.py` (stubs for lane 2): `quote(config, args) -> dict` returns a fixed quote in the contract shape; `take_slot(db, slot_id) -> bool` calls the `take_slot` RPC; `create_booking(...)` inserts a row. Mark each with `# STUB: lane 2`.
- `agents/inbound/tools.py`, `agents/outbound/tools.py`, `agents/manager/tools.py`: define the pydantic arg models exactly as in `docs/CONTRACTS.md`, one `Tool` per contract entry, and handlers that return fixed dicts in the contract's return shape, each marked `# STUB: lane N`. Export `INBOUND`, `OUTBOUND_DRAFTER` and `MANAGER` as `AgentSpec` objects that include `SHARED_TOOLS`.
- `agents/*/prompt.py`: a `system_prompt(ctx) -> str` that renders the business name, tone, today's date in America/Chicago, and the prompt rules from that lane's `CLAUDE.md`.
- `agents/inbound/twilio_io.py`: `valid_signature(request, form) -> bool` using `twilio.request_validator.RequestValidator`, building the URL from `PUBLIC_AGENTS_URL + request.url.path` because proxies and ngrok change the host; `send_sms(to, body)` using the Twilio REST client. When `TWILIO_VALIDATE_SIGNATURE` is false, skip validation (local smoke tests).
- `agents/outbound/apify_io.py` and `email_io.py`: function signatures from `agents/outbound/CLAUDE.md`, bodies stubbed. `email_io.send` must already enforce `SEND_ALLOWLIST`, even as a stub.
- `agents/tasks.py`: `run_task(task_id)` loads the row, sets `running`, dispatches on `kind` to stub functions, then sets `done` or `failed` with a `result`. `run_pending()` runs all pending rows in order.
- `agents/main.py`: FastAPI app with every route in the contracts table. `/sms` must parse the Twilio form, dedupe on `MessageSid`, return `Response(content="<Response/>", media_type="application/xml")` immediately, and schedule `handle_inbound(phone)` with `BackgroundTasks`. Keep a module-level `dict[str, asyncio.Lock]` keyed by phone so two quick texts do not start overlapping runs. Add permissive CORS for localhost only; production traffic arrives through the Next.js rewrite.
- `agents/tests/smoke.py`: posts five form-encoded texts to `http://localhost:8000/sms` (a greeting, a quote request, a booking, a Spanish message, a refund demand) with `TWILIO_VALIDATE_SIGNATURE=false`, asserts HTTP 200 and the `<Response/>` body for each, then waits briefly and asserts that `agent_events` gained rows. It must pass with `LLM_FAKE=true`.

## 7. Dashboard scaffolding

- `lib/supabase.ts`: a browser client from the two `NEXT_PUBLIC_` vars.
- `lib/agents.ts`: `postAgents<T>(path: string, body: unknown): Promise<T>` that calls `fetch("/agents" + path)`.
- `lib/useTable.ts`: a hook that loads the latest N rows of a table, then subscribes to inserts and updates through Supabase Realtime and keeps the list fresh.
- `app/page.tsx`: a two-by-two grid of the four panels. Each panel renders its rows plainly (a list is fine). `ManagerChat` posts to `/manager` and shows the reply. `LeadsPanel` has a Find partners button (`/outbound/find` with the default audience from config) and a Send button per drafted lead (`/outbound/send`).
- No component library, no auth, no extra routes. Lane 4 will restyle.

## 8. `README.md`

Write a quickstart a teammate can follow in five minutes: clone, copy `.env.example` to `.env` and `.env.local`, apply `0001_init.sql` and `seed.sql` in the Supabase SQL editor, `pip install -r agents/requirements.txt`, `npm install`, start both servers, run the smoke test, start ngrok and set the Twilio webhook. End with a "Which folder is mine?" table copied from the root `CLAUDE.md`, and a deploy note: dashboard on Vercel with `AGENTS_URL` set; agents service on an always-on host with start command `uvicorn agents.main:app --host 0.0.0.0 --port $PORT` from the repo root.

## 9. Done when

1. `uvicorn agents.main:app --port 8000` starts with only `LLM_FAKE=true` and the Supabase vars set.
2. `GET /health` returns `{"ok": true}`.
3. `python -m agents.tests.smoke` passes with `LLM_FAKE=true` and `TWILIO_VALIDATE_SIGNATURE=false`.
4. `POST /manager` with `{"message": "hi", "history": []}` returns a reply.
5. `npm run dev` renders four panels, and a row inserted into `leads` by hand appears without a refresh.
6. Every stub is marked `# STUB: lane N` so `grep -rn "STUB: lane"` is each lane's to-do list.
7. `docs/CONTRACTS.md`, the root `CLAUDE.md` and the four nested `CLAUDE.md` files match section 5 exactly.
8. Everything is committed and pushed to `main`.

## 10. Hand-off note to print when finished

Print this, filled in:

```text
Repo is scaffolded. Pull main, copy .env.example, then open Claude Code in your folder:
  Lane 1 inbound + runtime   -> agents/inbound   (first: real prompt, wire tools to booking.py)
  Lane 2 data                -> supabase/ + agents/booking.py   (first: apply migration + seed, real quote())
  Lane 3 outbound            -> agents/outbound  (first: Apify actor input schema, find_leads)
  Lane 4 manager + dashboard -> agents/manager and app/   (first: read-only manager tools)
Your to-do list: grep -rn "STUB: lane <your number>"
Contracts are frozen in docs/CONTRACTS.md. Tell the team before changing them.
```

## 11. Do not

- Add payments, auth, queues, cron, an ORM, or any agent framework.
- Edit `docs/ARCHITECTURE.md` or change anything in section 5 beyond filling syntax gaps.
- Implement real tool logic. Stubs only, in the exact contract shapes.
- Send a real email or text to anyone during setup.
