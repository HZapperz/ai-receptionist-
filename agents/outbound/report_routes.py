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
    objective: Optional[str] = Field(default=None, max_length=2000)
    research_type: Optional[str] = None
    term: Optional[str] = None
    area: Optional[str] = None
    limit: Optional[int] = Field(default=None, ge=1, le=50)
    cadence: Optional[str] = None
    time: Optional[str] = None
    timezone: Optional[str] = None
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    enabled: Optional[bool] = None


class TriggerRunBody(BaseModel):
    objective: Optional[str] = Field(default=None, max_length=2000)
    research_type: Optional[str] = None
    term: Optional[str] = None
    area: Optional[str] = None
    limit: Optional[int] = Field(default=None, ge=1, le=50)

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
    req_obj = body.objective
    if req_obj is None and body.term is not None and body.term.strip():
        req_obj = f"Discover market leads for {body.term.strip()}"
    elif req_obj is None:
        req_obj = existing.get("objective")

    merged_input = {
        "objective": req_obj,
        "research_type": body.research_type if body.research_type is not None else existing.get("research_type"),
        "term": body.term if body.term is not None else existing.get("term"),
        "area": body.area if body.area is not None else existing.get("area"),
        "limit": body.limit if body.limit is not None else existing.get("limit"),
        "cadence": body.cadence if body.cadence is not None else existing.get("cadence"),
        "time": body.time if body.time is not None else existing.get("time"),
        "timezone": body.timezone if body.timezone is not None else existing.get("timezone"),
        "weekday": body.weekday if body.weekday is not None else existing.get("weekday"),
        "enabled": body.enabled if body.enabled is not None else existing.get("enabled"),
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
async def trigger_run(background: BackgroundTasks, body: Optional[TriggerRunBody] = None):
    sched = get_schedule()
    defaults = get_defaults()

    if body:
        if body.objective is not None and not body.objective.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="objective cannot be empty")
        if body.research_type is not None and body.research_type.strip() not in ("lead_discovery", "competitor_analysis", "custom"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="research_type must be 'lead_discovery', 'competitor_analysis', or 'custom'",
            )
        if body.term is not None and not body.term.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="term cannot be empty")
        if body.area is not None and not body.area.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="area cannot be empty")

    body_obj = body.objective.strip() if body and body.objective is not None else None
    body_res_type = body.research_type.strip() if body and body.research_type is not None else None
    body_term = body.term.strip() if body and body.term is not None else None
    body_area = body.area.strip() if body and body.area is not None else None
    body_limit = body.limit if body and body.limit is not None else None

    term = body_term or (sched.get("term") if sched else None) or defaults["term"]
    area = body_area or (sched.get("area") if sched else None) or defaults["area"]
    limit = body_limit or (sched.get("limit") if sched else DEFAULT_LIMIT)

    if body_obj is not None:
        objective = body_obj
    elif body_term is not None:
        objective = f"Discover market leads for {body_term}"
    else:
        objective = (sched.get("objective") if sched else None) or f"Discover market leads for {term}"

    research_type = body_res_type or (sched.get("research_type") if sched else None) or "lead_discovery"

    if not objective or not objective.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="objective cannot be empty")
    if len(objective) > 2000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="objective cannot exceed 2000 characters")
    if research_type not in ("lead_discovery", "competitor_analysis", "custom"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="research_type must be 'lead_discovery', 'competitor_analysis', or 'custom'",
        )
    if has_active_report_run():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Active report run already in progress",
        )

    try:
        task_row = reserve_and_create_manual_run(
            term=term,
            area=area,
            limit=limit,
            objective=objective,
            research_type=research_type,
        )
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
