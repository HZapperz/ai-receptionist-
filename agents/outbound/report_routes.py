"""API routes for report schedule management and report execution history."""
from typing import Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from agents.outbound.report_scheduler import (
    compute_next_run_at,
    get_defaults,
    get_report_run,
    get_schedule,
    has_active_report_run,
    list_report_runs,
    reserve_and_create_manual_run,
    save_schedule,
    validate_schedule_input,
    worker,
    DEFAULT_LIMIT,
)
from agents.tasks import run_task

router = APIRouter(prefix="/outbound/reports", tags=["reports"])


class ScheduleUpdateBody(BaseModel):
    term: Optional[str] = None
    area: Optional[str] = None
    limit: Optional[int] = Field(default=None, ge=1, le=50)
    cadence: Optional[str] = None
    time: Optional[str] = None
    timezone: Optional[str] = None
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    enabled: Optional[bool] = None


@router.get("")
async def get_reports():
    sched = get_schedule()
    runs = list_report_runs()
    defaults = get_defaults()
    worker_status = worker.status_summary()
    return {
        "schedule": sched,
        "runs": runs,
        "defaults": defaults,
        "worker": worker_status,
    }


@router.put("/schedule")
async def update_schedule(body: ScheduleUpdateBody):
    existing = get_schedule() or {}
    defaults = get_defaults()
    
    # Merge existing values with update body and defaults
    merged_input = {
        "term": body.term if body.term is not None else existing.get("term", defaults["term"]),
        "area": body.area if body.area is not None else existing.get("area", defaults["area"]),
        "limit": body.limit if body.limit is not None else existing.get("limit", DEFAULT_LIMIT),
        "cadence": body.cadence if body.cadence is not None else existing.get("cadence", "daily"),
        "time": body.time if body.time is not None else existing.get("time", "09:00"),
        "timezone": body.timezone if body.timezone is not None else existing.get("timezone", "America/Chicago"),
        "weekday": body.weekday if body.weekday is not None else existing.get("weekday", 0),
        "enabled": body.enabled if body.enabled is not None else existing.get("enabled", True),
    }

    try:
        validated = validate_schedule_input(merged_input)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    now_utc = datetime.now(timezone.utc)
    next_run_at = compute_next_run_at(validated, now_utc)

    # Only pass schedule config fields + next_run_at.
    # Runtime-owned fields (pending_run_id, pending_run_target, last_run_at) are preserved by save_schedule from DB snapshot.
    schedule_data = {
        **validated,
        "next_run_at": next_run_at,
    }

    try:
        saved = save_schedule(schedule_data)
        return saved
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/run")
async def trigger_run(background: BackgroundTasks):
    sched = get_schedule()
    if not sched or not sched.get("term") or not sched.get("area"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No report schedule configured. Please set schedule first.",
        )

    if has_active_report_run():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active report run already in progress",
        )

    term = sched["term"]
    area = sched["area"]
    limit = sched.get("limit", DEFAULT_LIMIT)

    try:
        task_row = reserve_and_create_manual_run(term, area, limit)
    except RuntimeError as exc:
        msg = str(exc)
        if "already in progress" in msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=msg) from exc
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=msg) from exc

    task_id = str(task_row["id"])
    background.add_task(run_task, task_id)
    return {"task_id": task_id}


@router.get("/{task_id}")
async def get_report(task_id: str):
    report_run = get_report_run(task_id)
    if not report_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report run not found",
        )
    return report_run
