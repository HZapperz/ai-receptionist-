from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from agents.db import get_db, load_config
from agents.outbound import email_io
from agents.tasks import run_task

router = APIRouter(prefix="/outbound")


class FindBody(BaseModel):
    term: str = "pet-friendly apartment communities"
    area: str = "Houston, TX"
    limit: int = 20


class DraftBody(BaseModel):
    lead_ids: list[str] | str = "all_new"


class SendBody(BaseModel):
    lead_id: str


def _start(kind: str, payload: dict, background: BackgroundTasks) -> dict:
    row = get_db().table("tasks").insert({
        "for_agent": "outbound", "kind": kind, "payload": payload, "created_by": "dashboard",
    }).execute().data[0]
    background.add_task(run_task, row["id"])
    return {"task_id": row["id"], "status": "pending"}


@router.post("/find")
async def find(body: FindBody, background: BackgroundTasks):
    return _start("find_leads", body.model_dump(), background)


@router.post("/draft")
async def draft(body: DraftBody, background: BackgroundTasks):
    return _start("draft_emails", body.model_dump(), background)


@router.post("/send")
async def send(body: SendBody):
    from datetime import datetime, timezone
    db = get_db()
    rows = db.table("leads").select("*").eq("id", body.lead_id).limit(1).execute().data
    if not rows:
        return {"error": "lead not found"}
    lead = rows[0]
    if not lead.get("draft_subject") or not lead.get("draft_body"):
        return {"error": "no draft"}
    result = email_io.send(lead.get("email") or "", lead["draft_subject"], lead["draft_body"])
    if "error" not in result:
        now_str = datetime.now(timezone.utc).isoformat()
        db.table("leads").update({"status": "sent", "sent_at": now_str}).eq("id", body.lead_id).execute()
    return result


@router.get("/leads")
async def get_leads(limit: int = Query(default=50, ge=1, le=100)):
    db = get_db()
    rows = db.table("leads").select("*").order("created_at", desc=True).limit(limit).execute().data or []
    config = load_config(db)
    outbound = config.get("outbound") if isinstance(config.get("outbound"), dict) else {}
    audience = outbound.get("audience") or "pet-friendly apartment communities"
    return {"leads": rows, "audience": audience}


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    db = get_db()
    rows = db.table("tasks").select("id,kind,status,result").eq("id", task_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    task = rows[0]
    return {
        "id": task["id"],
        "kind": task["kind"],
        "status": task["status"],
        "result": task.get("result"),
    }
