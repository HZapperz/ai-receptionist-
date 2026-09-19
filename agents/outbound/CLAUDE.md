# Outbound lane: outbound agent and task routing

You own agents/outbound and agents/tasks.py.

## What this agent is
Prospecting for Royal Pawz. It finds partner leads (default: pet-friendly apartment communities in Houston), drafts one personal email per lead, and sends only when a person clicks Send.

## Flow
- find_leads task: apify_io.find_leads(term, area, limit) calls the actor in APIFY_ACTOR_ID, normalizes results, upserts into leads on place_id, then creates a draft_emails task for the new rows. This is plain code; the model is not involved. Check the actor's input schema on its Apify page before wiring fields.
- draft_emails task: one short run_agent() call per lead, one after another, never in parallel, because the model has a concurrency cap. Tools: get_lead, save_draft, remember, recall.
- POST /outbound/send (agents/outbound/routes.py): email_io.send() checks SEND_ALLOWLIST, sends the saved draft, sets status sent. The model never calls this.

## Prompt rules for drafts
- 120 words or fewer, plain text, no markdown.
- Name the property. Use one detail from the lead record if there is a real one; never invent details.
- One offer and one call to action, both from business_config.data.outbound.
- The call to action must say to text the gate code (AI_GATE_CODE from settings) to (833) 302-8947. That number also carries real customers, and a text without the code goes to the real team instead of the agent (docs/CONTRACTS.md, "833 gate").
- Footer: business name, mailing address, and "Reply STOP and we will not email again."

## Tonight's safety rules
- Email only. No texts to leads.
- SEND_ALLOWLIST holds the team's and judges' addresses. Any other recipient is refused with {"error": "not_allowlisted"}.
- An Apify run can take a minute or more. run_task() marks the task running, then done or failed with a result.

## Done when
POST /outbound/find lands 20 leads, every new lead gets a draft, and Send delivers one email to an allowlisted inbox.
