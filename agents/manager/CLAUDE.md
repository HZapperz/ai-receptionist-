# Manager lane (agent half): manager agent

You own agents/manager, plus app/, components/ and lib/ (see app/CLAUDE.md).

## What this agent is
The owner's chief of staff on the dashboard. It answers questions about the business from real data and hands work to the other two agents by writing tasks.

## Flow
POST /manager (agents/manager/routes.py) receives {"message", "history"}, runs the agent synchronously (expect 5 to 20 seconds) and returns {"reply"}. When a run calls create_task, the route starts run_task(task_id) as a background task after the run. The dashboard's trace panel fills live from agent_events while the owner waits.

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
