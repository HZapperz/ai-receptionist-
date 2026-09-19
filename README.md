# Royal Pawz AI employee

Three agents share one Supabase database:

- **Inbound** answers texts on the business number, quotes, offers slots and books.
- **Outbound** finds partner leads with Apify, drafts outreach emails, and executes automated market research report schedules.
- **Manager** is a persistent OMP chief of staff and chat box on the dashboard with durable queues and human-in-the-loop approvals.

The dashboard has a public landing page, email/password login, a demo onboarding and the live dashboard pages.

Why it looks this way: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The frozen interfaces: [docs/CONTRACTS.md](docs/CONTRACTS.md).

## Quickstart (about 5 minutes)

1. **Clone:** `git clone https://github.com/HZapperz/ai-receptionist-.git && cd ai-receptionist-`
2. **Env:** `cp .env.example .env && cp .env.example .env.local`, then fill both with the values the team shared privately.
   - For local Python-agent work set `LLM_FAKE=true`, `TWILIO_VALIDATE_SIGNATURE=false`, and any `AI_GATE_CODE`. The OMP Manager still needs real model credentials; it does not use `LLM_FAKE`.
   - Leave `TWILIO_AUTH_TOKEN` empty: texts are then logged instead of sent.
   - **Never commit a real value.** This repo is public.
3. **Database:** apply the missing numbered migrations in `supabase/migrations/` through `0005_manager_checkpoints.sql`, in order. Manager requires `0004` and `0005`; there is no local SQLite fallback. On a fresh project, apply all five before initializing `supabase/seed.sql`. Do not reseed or blindly rerun initial migrations on a live business. See [the hosting handoff](docs/HOSTED-DEPLOYMENT.md).
4. **Python 3.12:** `uv venv --python 3.12 && source .venv/bin/activate && uv pip install -r agents/requirements.txt`
5. **Node and Bun:** `npm ci`; install Bun 1.3.14 or newer for the OMP Manager.
6. **Run:**
   - Agents: `uvicorn agents.main:app --reload --port 8000`
   - Dashboard: `npm run dev`, then open http://localhost:3000 and sign in (see Dashboard login)
7. **Check:**
   - `python -m agents.tests.smoke` (needs the agents service running)
   - `python -m agents.tests.test_gate` (runs in-process)

### Dashboard login
The dashboard uses Supabase email/password login; `/` is public. `/dashboard` and `/onboarding` stay open until the dashboard server has `REQUIRE_LOGIN=true`. Set up once per Supabase project:
1. **SQL editor:** run `supabase/migrations/0003_auth_read.sql`. A signed-in browser reads as `authenticated`, and without this every panel is empty.
2. **Dashboard server env:** set `SUPABASE_SERVICE_ROLE_KEY` (in `.env.local` locally, and on Vercel). Signup then creates the account already confirmed and signs straight in, with no email, whether "Confirm email" is on or off. Without it, signup falls back to Supabase's confirmation email, which only reaches the project's team members. An empty `SUPABASE_SERVICE_ROLE_KEY=` line in `.env.local` hides the value in `.env`.
3. **Auth > URL Configuration:** set the Site URL to the Vercel URL, and add `http://localhost:3000/**` and `https://<vercel-url>/**` to the redirect URLs. Only the fallback's confirmation link (to `/auth/confirm`) needs them.
4. **Auth > Users > Add user:** create the demo login with auto-confirm on. Share it privately, never in git.

The agents service has no login; its `/agents/*` routes also stay open through the Next.js rewrite. Use trusted network access or an authenticated gateway before exposing these APIs publicly. `REQUIRE_LOGIN=true` protects dashboard pages, not the agents APIs.

### Scheduled lead research
1. Open **Leads → Automated Market Research & Reports**.
2. Set the owner research objective (up to 2000 characters) and research type (`lead_discovery`, `competitor_analysis`, or `custom`), along with location and result limit (1–50). Choose daily or weekly, local time, and timezone; weekly schedules also select a weekday.
3. **Save Schedule** saves the current enabled/paused state; **Enable Schedule** starts recurring runs. **Pause Schedule** stops future runs without cancelling research already in progress. **Run Research Now** uses the saved target, even while paused.
4. Select a run in history to view its executive summary, research approach, source-backed findings, competitor comparisons, and sources reviewed. Business contacts and coverage metrics are expandable. **Permalink** opens `/dashboard/leads/reports/[id]`; append `?embed=1` for the compact report view. Both follow the existing dashboard login setting, not a separate public-sharing mechanism.

The existing outbound `run_agent` foundation synthesizes reports from Apify results via a two-stage agent loop (`research_planner` and `report_synthesizer`). Report jobs never draft or send outreach and do not add records to the separate Saved Leads list. Metrics are calculated from scraped records; AI assessments remain suggestions to verify. Competitor comparisons use 'unknown' when competitor offerings or pricing are missing from retrieved evidence. Website crawler failures or timeouts are captured in report limitations and partial evidence sources without failing the underlying research run.

Keep one always-on agents-service instance running. Its lifespan worker checks schedules every 30 seconds; no browser needs to remain open. The local `report_worker.lock` is not a distributed-host lease. Schedule configuration lives in `business_config.data.lead_report_schedule`; run state and reports live in existing `tasks` rows, with no new migration. Interrupted running jobs become failed on restart rather than automatically repeating paid research.

Use `APIFY_TOKEN` and allowlisted actors (`compass/crawler-google-places` for places, `apify/website-content-crawler` for supporting website content), plus the existing database and model credentials (`LLM_FAKE=false` for real reports). Places scraper runs are capped at $0.50 event charge per run (`max_total_charge_usd=0.50`); supporting website extraction usage is billed per Apify platform pay-per-usage rates (bounded to max 60s runtime, max 6 total pages across max 3 candidate sites). Model charges are separate. Failed research remains visible in history with its error.

### Texting the agent
The Twilio number is Royal Pawz's **live** toll-free line, (833) 302-8947, and it also carries real customers. **Do not point its webhook anywhere.**
- **In development**, test `/sms` with the smoke test or curl.
- **For the demo**, the owner switches the webhook to this service by following [docs/TWILIO-833-CUTOVER.md](docs/TWILIO-833-CUTOVER.md).
- **Once live**, a phone that texts the gate code talks to the agent, and every other text goes on to the real team untouched.

## Which folder is mine?

| Lane | Owns | First job |
| --- | --- | --- |
| Inbound | `agents/runtime`, `agents/inbound` (including the 833 gate), plus the dashboard shell: `app/`, `components/` (except `ManagerChat.tsx`), `lib/`, `proxy.ts` | Real prompt, wire the tools to `agents/booking.py`; landing page, login and dashboard pages |
| Outbound | `agents/outbound`, `agents/tasks.py` | Check the Apify actor's input schema, real `find_leads` |
| Manager | `agents/manager`, `agents/runtime/manager_runner.py`, `components/ManagerChat.tsx`, `lib/manager.ts` | Persistent OMP manager, durable queue, proposals & approvals |
| Shared, no owner | `supabase/`, `agents/db.py`, `agents/booking.py`, deploys | Announce in the team chat before editing |

Open Claude Code in your lane's folder; it loads the root `CLAUDE.md` plus your lane's. Your to-do list is `grep -rn "STUB: inbound"` (or `outbound`, `manager`, `shared`).

**Git:** everyone works on `main`. Run `git pull --rebase` before you start and before each push, and run the smoke test before you push.

## Deploy
- **Dashboard:** Vercel project `ai-receptionist-` (https://ai-receptionist-kappa-one.vercel.app), which redeploys on every push to main. It needs `AGENTS_URL` set to the agents host, the two `NEXT_PUBLIC_SUPABASE_*` vars, `SUPABASE_SERVICE_ROLE_KEY` (for signup; server only, never `NEXT_PUBLIC_`) and, to require the login, `REQUIRE_LOGIN=true`. Add the Vercel URL to Supabase's Auth redirect URLs (see Dashboard login).
- **Agents service:** Heroku app `aitx-royalpawz-agents`, using the backend `Dockerfile` with Python, Bun, and OMP, one always-on web dyno and one Uvicorn worker. Python-only buildpack deployment does not install the Manager runtime. Supabase stores both the event queue and private OMP session checkpoints; local disk is disposable. Do not enable overlapping deploys or multiple backend instances.
- **Publishing is manual:** GitHub CI is currently Gitleaks only. Follow [docs/HOSTED-DEPLOYMENT.md](docs/HOSTED-DEPLOYMENT.md) from a credentialed machine for migration checks, Config Vars, container publishing, restart verification, and rollback. This repository change does not establish that the live app has been migrated or released.
- Keep `PUBLIC_AGENTS_URL` equal to the public backend URL for Twilio signature validation. Production Twilio credentials belong only on the backend. The existing unauthenticated agents APIs need a trusted-access/authenticated gateway boundary; dashboard login alone does not protect them.

## Changes from BOOTSTRAP.md
- **Three lanes, not four.** Lane 2 (data) is a shared area with no owner. Stub markers are `# STUB: inbound / outbound / manager / shared`, not lane numbers.
- **Per-lane routers.** Each lane mounts its own FastAPI router (`agents/<lane>/routes.py`), and `agents/main.py` only includes them. Task handlers live in `agents/inbound/jobs.py` and `agents/outbound/jobs.py`; `agents/tasks.py` only routes. This keeps three people out of the same files.
- **The 833 gate.** `/sms` runs through the gate (`agents/inbound/gate.py`, `supabase/migrations/0002_ai_gate.sql`, the "833 gate" section of CONTRACTS.md), because the demo borrows the live number.
  - `send_sms` refuses phones without an AI session, and it dry-runs when no Twilio token is set.
  - New env vars: `AI_GATE_CODE`, `AI_GATE_TTL_HOURS`, `PROD_SMS_WEBHOOK_URL`.
- **No ngrok step.** Nobody repoints the Twilio number except the owner, through the cutover runbook.
- **Next.js 16.** create-next-app wrote `AGENTS.md` (Next's agent rules), which `app/CLAUDE.md` imports. `.gitignore` ignores every `.env*` except `.env.example`.
- **Dashboard login.** BOOTSTRAP had no auth. The dashboard now has Supabase email/password login (`proxy.ts`), and `0003_auth_read.sql` gives signed-in browsers the same select-only access as anon. The agents service still has no auth.
- **Seed fix.** `supabase/seed.sql` casts `d::date` before converting to Houston time. The BOOTSTRAP version shifted the zone twice, so slots landed at 11pm, 2am and 5am instead of 9am, noon and 3pm.
- **Python 3.12,** pinned in `.python-version`.
- **Extras:** `.claude/settings.json` allowlists the common dev commands for Claude Code, and a gitleaks GitHub Action scans every push for secrets.
