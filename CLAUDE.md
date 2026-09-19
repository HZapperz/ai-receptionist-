# Royal Pawz AI employee: hackathon repo

Three agents (inbound SMS, outbound prospecting, manager chat) share one Supabase database. The demo is due tonight. Read docs/ARCHITECTURE.md for the why and docs/CONTRACTS.md for the interfaces.

Three people build in parallel, one per lane. ARCHITECTURE.md describes four lanes; here lane 2 (data) is a **shared area** with no owner, so wherever it says "lane 2", read "shared".

## Rules
- Read docs/CONTRACTS.md before writing code. Never change table names, tool signatures, task kinds, routes or env var names without the team agreeing first.
- Stay inside your lane's folders. The nested CLAUDE.md where you are working says what you own. Only the inbound lane edits agents/runtime.
- Shared area (supabase/, agents/db.py, agents/booking.py, deploy config): say so in the team chat before editing, keep the change small, pull right before and push right after. A schema change is a new numbered migration plus a CONTRACTS.md edit in the same commit; never edit a migration that has been applied.
- Python 3.12, FastAPI, pydantic v2, openai AsyncOpenAI, supabase-py. No agent frameworks, queues, cron, auth or payments.
- A tool handler validates with its pydantic model, does the work in code, and returns a small JSON-serializable dict. run_tool() logs it to agent_events; do not log it again.
- Prices, slots and sends are computed in code. The model never states a price or a time that did not come from a tool result.
- The model never sends email. Only POST /outbound/send does, after a person clicks, and only to SEND_ALLOWLIST.
- Agents never call each other. Hand off work with a row in tasks; share knowledge with remember() and recall().
- Keep it small. No abstraction that is not used twice today.

## The 833 line carries real customers
The demo borrows Royal Pawz's live toll-free number behind a code word (docs/CONTRACTS.md, "833 gate"). These hold no matter which lane you are in:
- A text from a phone without an active AI session is forwarded to production. Never store it, log its body, or show it on the dashboard.
- Never text a phone that has no active AI session (OWNER_PHONE excepted). send_sms enforces this; do not route around it.
- Never change the Twilio number's webhook. Only the owner does, following docs/TWILIO-833-CUTOVER.md.
- This repo is public. Secrets, the gate code and the production webhook URL live only in .env files, never in git.

## Git
- Everyone works on main. `git pull --rebase` before you start and before every push.
- Run the smoke test before pushing. Commit small and often.
- Each lane mounts its own FastAPI router, so agents/main.py rarely needs an edit.

## Commands
- Python env: `uv venv --python 3.12 && source .venv/bin/activate && uv pip install -r agents/requirements.txt`
- Agents: `uvicorn agents.main:app --reload --port 8000`
- Dashboard: `npm run dev`
- Smoke test: `python -m agents.tests.smoke` (with the agents service running)
- Gate test: `python -m agents.tests.test_gate` (runs in-process; needs the Supabase vars in .env)
- To-do list for your lane: `grep -rn "STUB: <lane>"`, where lane is inbound, outbound, manager or shared

## Lanes
| Lane | Owns |
| --- | --- |
| Inbound | agents/runtime, agents/inbound (including the 833 gate) |
| Outbound | agents/outbound, agents/tasks.py |
| Manager | agents/manager, app/, components/, lib/ |
| Shared, no owner | supabase/, agents/db.py, agents/booking.py, deploys |
