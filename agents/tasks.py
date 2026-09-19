"""Routes a tasks row to the agent that owns its kind. Outbound lane owns this file."""
from agents.db import get_db
from agents.inbound.jobs import follow_up
from agents.outbound.jobs import draft_emails, find_leads

HANDLERS = {
    "find_leads": find_leads,      # outbound
    "draft_emails": draft_emails,  # outbound
    "follow_up": follow_up,        # inbound
}


async def run_task(task_id: str) -> dict:
    db = get_db()
    rows = db.table("tasks").select("*").eq("id", task_id).limit(1).execute().data
    if not rows:
        return {"error": "task not found"}
    task = rows[0]
    if task["status"] != "pending":
        return {"error": f"task is {task['status']}"}
    db.table("tasks").update({"status": "running"}).eq("id", task_id).execute()
    try:
        result = await HANDLERS[task["kind"]](task)
        status = "failed" if isinstance(result, dict) and "error" in result else "done"
    except Exception as e:  # a failed task must never take the service down
        result, status = {"error": str(e)[:500]}, "failed"
    db.table("tasks").update({"status": status, "result": result}).eq("id", task_id).execute()
    return result


async def run_pending() -> int:
    db = get_db()
    rows = db.table("tasks").select("id").eq("status", "pending").order("created_at").execute().data
    for row in rows:
        await run_task(row["id"])
    return len(rows)
