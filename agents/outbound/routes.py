from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from agents.db import get_db
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
    db = get_db()
    rows = db.table("leads").select("*").eq("id", body.lead_id).limit(1).execute().data
    if not rows:
        return {"error": "lead not found"}
    lead = rows[0]
    if not lead.get("draft_subject") or not lead.get("draft_body"):
        return {"error": "no draft"}
    result = email_io.send(lead.get("email") or "", lead["draft_subject"], lead["draft_body"])
    if "error" not in result:
        # STUB: outbound. Set sent_at too once the real send is wired.
        db.table("leads").update({"status": "sent"}).eq("id", body.lead_id).execute()
    return result
