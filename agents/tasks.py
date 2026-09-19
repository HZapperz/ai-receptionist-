"""Routes a tasks row to the agent that owns its kind. Outbound lane owns this file."""
from agents.db import get_db
from agents.inbound.jobs import follow_up
from agents.outbound.jobs import draft_emails, find_leads


async def handle_find_leads(task: dict) -> dict:
    payload = task.get("payload") or {}
    task_id = str(task["id"])
    if payload.get("report_mode") is True or str(payload.get("report_mode")).lower() == "true":
        try:
            from agents.outbound.reports import generate_report
            res = await generate_report(task)
            if hasattr(res, "model_dump"):
                return res.model_dump()
            return res
        finally:
            from agents.outbound.report_scheduler import complete_scheduled_reservation
            complete_scheduled_reservation(task_id)
    return await find_leads(task)


HANDLERS = {
    "find_leads": handle_find_leads, # outbound (normal find or report_mode)
    "draft_emails": draft_emails,    # outbound
    "follow_up": follow_up,          # inbound
}


async def run_task(task_id: str) -> dict:
    db = get_db()
    rows = db.table("tasks").select("*").eq("id", task_id).limit(1).execute().data
    if not rows:
        return {"error": "task not found"}
    task = rows[0]
    res = db.table("tasks").update({"status": "running"}).eq("id", task_id).eq("status", "pending").execute()
    if not res.data:
        return {"error": f"task {task_id} is not pending or claimed by another worker"}
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
