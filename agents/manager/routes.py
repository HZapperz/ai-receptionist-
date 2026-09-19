import asyncio
import logging
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Response
from pydantic import BaseModel, Field

from agents.db import get_db
from agents.manager.queue import QueueError, queue
from agents.runtime.manager_py_runner import runner

logger = logging.getLogger(__name__)
router = APIRouter()


class ManagerPostPayload(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    client_id: UUID | None = None


class DecisionPostPayload(BaseModel):
    decision: Literal["approve", "reject"]


@router.get("/manager")
async def get_manager():
    runtime_status = runner.status_summary()
    try:
        data = await asyncio.to_thread(queue.snapshot)
        data["runtime"] = runtime_status
        return data
    except QueueError as exc:
        logger.warning("Queue snapshot unavailable: %s", exc)
        return {
            "session": {"id": str(queue.session_id), "session_file": None},
            "messages": [],
            "events": [],
            "tasks": [],
            "approvals": [],
            "runtime": {
                "status": "unavailable",
                "error": f"Manager database tables or migration missing: {exc}",
            },
        }


@router.post("/manager")
async def post_manager(payload: ManagerPostPayload, response: Response):
    message = payload.message.strip()
    if not message:
        response.status_code = 400
        return {"error": "message required"}

    client_id = payload.client_id or uuid4()
    dedupe_key = f"chat:{client_id}"

    try:
        event = await asyncio.to_thread(
            queue.enqueue_event,
            "chat",
            {"message": message},
            dedupe_key,
            message,
        )
        response.status_code = 202
        return {"event_id": event["id"], "status": event["status"]}
    except QueueError as exc:
        response.status_code = 503
        return {
            "error": f"Manager event enqueue unavailable: {exc}",
            "runtime": runner.status_summary(),
        }


@router.post("/manager/approvals/{approval_id}")
async def post_approval(approval_id: UUID, payload: DecisionPostPayload, response: Response):
    approval_id = str(approval_id)
    try:
        app_row = await asyncio.to_thread(queue.get_approval, approval_id)
        if not app_row:
            response.status_code = 404
            return {"error": f"Approval {approval_id} not found"}

        from agents.manager.tools import decide_approval

        updated = await decide_approval(approval_id, payload.decision)
        if "error" in updated:
            response.status_code = 409
        return updated
    except QueueError as exc:
        response.status_code = 503
        return {"error": f"Approval processing failed: {exc}"}


@router.get("/business/{table}")
async def get_business_rows(
    table: Literal["messages", "bookings"], response: Response,
    limit: int = Query(default=50, ge=1, le=200),
):
    def read_rows():
        return get_db().table(table).select("*").order("created_at", desc=True).limit(limit).execute().data

    try:
        return {"rows": await asyncio.to_thread(read_rows)}
    except Exception as exc:
        response.status_code = 503
        return {"error": f"Business data unavailable: {exc}"}
