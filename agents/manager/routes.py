from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from agents.db import get_db, load_config
from agents.manager.tools import MANAGER
from agents.runtime.ctx import Ctx
from agents.runtime.loop import run_agent
from agents.tasks import run_task

router = APIRouter()


class Turn(BaseModel):
    role: str
    content: str


class ManagerBody(BaseModel):
    message: str
    history: list[Turn] = []


@router.post("/manager")
async def manager(body: ManagerBody, background: BackgroundTasks):
    db = get_db()
    started = datetime.now(timezone.utc).isoformat()
    ctx = Ctx(db=db, config=load_config(db), agent="manager", ref="dashboard")
    messages = [t.model_dump() for t in body.history] + [{"role": "user", "content": body.message}]
    reply = await run_agent(MANAGER, messages, ctx)
    # Start whatever this run handed off (create_task inserts pending rows).
    new = (db.table("tasks").select("id").eq("status", "pending").eq("created_by", "manager")
           .gte("created_at", started).order("created_at").execute().data)
    for row in new:
        background.add_task(run_task, row["id"])
    return {"reply": reply}
