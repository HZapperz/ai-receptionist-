"""Outbound's task handlers, called by agents/tasks.py."""


async def find_leads(task: dict) -> dict:
    # STUB: outbound. payload {"term", "area", "limit"}: apify_io.find_leads(),
    # upsert into leads on place_id, then insert a draft_emails task for the new rows.
    return {"found": 0, "stub": True}


async def draft_emails(task: dict) -> dict:
    # STUB: outbound. payload {"lead_ids": [...] | "all_new"}: one run_agent(OUTBOUND_DRAFTER)
    # per lead, one after another, never in parallel (the model has a concurrency cap).
    return {"drafted": 0, "stub": True}
