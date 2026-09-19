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
   - For local work set `LLM_FAKE=true` (no model key needed), `TWILIO_VALIDATE_SIGNATURE=false`, and any `AI_GATE_CODE`.
   - Leave `TWILIO_AUTH_TOKEN` empty: texts are then logged instead of sent.
   - **Never commit a real value.** This repo is public.
3. **Database:** 0001, 0002 and the first seed were applied to the team's Supabase project (AITX-hackathon) on 2026-09-19; `0003_auth_read.sql`, `0004_manager.sql` and the new seed still have to be run there. For a fresh project, run `supabase/migrations/0001_init.sql`, then `0002_ai_gate.sql`, then `0003_auth_read.sql`, then `0004_manager.sql`, then `supabase/seed.sql` in the SQL editor. The seed is safe to re-run, and its `business_config` statement can be run alone to refresh the business facts.
4. **Python 3.12:** `uv venv --python 3.12 && source .venv/bin/activate && uv pip install -r agents/requirements.txt`
5. **Node:** `npm install`
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
2. Set the business search term, location, and result limit (1–50). Choose daily or weekly, local time, and timezone; weekly schedules also select a weekday.
3. **Save Schedule** saves the current enabled/paused state; **Enable Schedule** starts recurring runs. **Pause Schedule** stops future runs without cancelling research already in progress. **Run Research Now** uses the saved target, even while paused.
4. Select a run in history to view its condensed AI summary, contact-coverage metrics, category bars, business/source links, recommendations, and limitations. **Permalink** opens `/dashboard/leads/reports/[id]`; append `?embed=1` for the compact report view. Both follow the existing dashboard login setting, not a separate public-sharing mechanism.

The existing outbound `run_agent` foundation synthesizes reports from Apify results. Report jobs never draft or send outreach and do not add records to the separate Saved Leads list. Metrics are calculated from scraped records; AI assessments remain suggestions to verify.

Keep one always-on agents-service instance running. Its lifespan worker checks schedules every 30 seconds; no browser needs to remain open. The local `report_worker.lock` is not a distributed-host lease. Schedule configuration lives in `business_config.data.lead_report_schedule`; run state and reports live in existing `tasks` rows, with no new migration. Interrupted running jobs become failed on restart rather than automatically repeating paid research.

Use `APIFY_TOKEN` and `APIFY_ACTOR_ID=compass/crawler-google-places`, plus the existing database and model credentials (`LLM_FAKE=false` for real reports). Each Actor run has a $0.50 charge cap and 180-second runtime limit; model charges are separate. Failed research remains visible in history with its error.

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
- **Agents service:** an always-on host, never serverless. The demo runs on Heroku, app `aitx-royalpawz-agents` (one `basic` web dyno, which never sleeps): `Procfile` and the root `requirements.txt` are for it, and the app's buildpack must be set to `heroku/python` because the root `package.json` would otherwise make Heroku build the dashboard. Deploy with `git push heroku-agents main`. Elsewhere, the start command from the repo root is `uvicorn agents.main:app --host 0.0.0.0 --port $PORT`.
  - Set every var from `.env.example`.
  - `PUBLIC_AGENTS_URL` must be the host's public URL, or Twilio signatures will not validate.
  - Only this host holds the production Twilio token.

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
