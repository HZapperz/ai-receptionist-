"""Schedule management, timezone calendar calculations, background worker, and persistence for report runs."""
import asyncio
import copy
import fcntl
import json
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Any

from agents.db import get_db, load_config
from agents.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_TERM = "pet-friendly apartment communities"
DEFAULT_AREA = "Houston, TX"
DEFAULT_LIMIT = 20

TIME_REGEX = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def compute_next_run_at(schedule_input: dict[str, Any], now_utc: datetime | None = None) -> str | None:
    """Calculate the next run timestamp in ISO UTC format handling timezones, daily/weekly cadence, and DST transitions."""
    if not schedule_input.get("enabled", True):
        return None

    tz_str = schedule_input.get("timezone", "America/Chicago")
    try:
        tz = ZoneInfo(tz_str)
    except Exception as exc:
        raise ValueError(f"Invalid timezone: '{tz_str}'") from exc

    time_str = schedule_input.get("time", "09:00")
    if not TIME_REGEX.match(time_str):
        raise ValueError(f"Invalid time format: '{time_str}', expected 'HH:MM'")

    parts = time_str.split(":")
    hour, minute = int(parts[0]), int(parts[1])

    if now_utc is None:
        now_utc = datetime.now(timezone.utc)
    elif now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    local_now = now_utc.astimezone(tz)
    cadence = schedule_input.get("cadence", "daily")

    if cadence == "daily":
        target_local = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target_local <= local_now:
            target_local += timedelta(days=1)
    elif cadence == "weekly":
        target_weekday = int(schedule_input.get("weekday", 0))  # 0=Monday, 6=Sunday
        if not (0 <= target_weekday <= 6):
            raise ValueError("weekday must be between 0 (Monday) and 6 (Sunday)")
        
        current_weekday = local_now.weekday()
        days_ahead = (target_weekday - current_weekday) % 7
        target_local = local_now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
        if target_local <= local_now:
            target_local += timedelta(days=7)
    else:
        raise ValueError(f"Invalid cadence: '{cadence}', expected 'daily' or 'weekly'")

    utc_target = target_local.astimezone(timezone.utc)
    return utc_target.strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_schedule_input(data: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize user-submitted schedule configuration."""
    cadence = data.get("cadence", "daily")
    if cadence not in ("daily", "weekly"):
        raise ValueError("cadence must be 'daily' or 'weekly'")

    try:
        limit = int(data.get("limit", DEFAULT_LIMIT))
    except (ValueError, TypeError) as exc:
        raise ValueError("limit must be an integer between 1 and 50") from exc
    if not (1 <= limit <= 50):
        raise ValueError("limit must be between 1 and 50")

    tz_str = data.get("timezone", "America/Chicago")
    try:
        ZoneInfo(tz_str)
    except Exception as exc:
        raise ValueError(f"Invalid timezone: '{tz_str}'") from exc

    time_str = str(data.get("time", "09:00")).strip()
    if not TIME_REGEX.match(time_str):
        raise ValueError("time must be in HH:MM 24-hour format")

    try:
        weekday = int(data.get("weekday", 0))
    except (ValueError, TypeError) as exc:
        raise ValueError("weekday must be an integer between 0 and 6") from exc
    if not (0 <= weekday <= 6):
        raise ValueError("weekday must be between 0 (Monday) and 6 (Sunday)")

    enabled_val = data.get("enabled", True)
    if not isinstance(enabled_val, bool):
        raise ValueError("enabled must be a boolean (true or false)")

    if "research_type" in data and data["research_type"] is not None:
        research_type = str(data["research_type"]).strip()
        if research_type not in ("lead_discovery", "competitor_analysis", "custom"):
            raise ValueError("research_type must be 'lead_discovery', 'competitor_analysis', or 'custom'")
    else:
        research_type = "lead_discovery"

    term_raw = str(data.get("term") or "").strip()

    if "objective" in data and data["objective"] is not None:
        obj_raw = str(data["objective"]).strip()
        if not obj_raw:
            raise ValueError("objective cannot be empty")
    else:
        if term_raw:
            obj_raw = f"Discover market leads for {term_raw}"
        else:
            raise ValueError("objective cannot be empty")

    if len(obj_raw) > 2000:
        raise ValueError("objective cannot exceed 2000 characters")

    term = term_raw if term_raw else obj_raw[:120]
    area = str(data.get("area") or "").strip()
    if not area:
        raise ValueError("area cannot be empty")

    return {
        "objective": obj_raw,
        "research_type": research_type,
        "term": term,
        "area": area,
        "limit": limit,
        "cadence": cadence,
        "time": time_str,
        "timezone": tz_str,
        "weekday": weekday,
        "enabled": enabled_val,
    }

def get_schedule(db=None) -> dict[str, Any] | None:
    if db is None:
        db = get_db()
    config = load_config(db)
    sched = config.get("lead_report_schedule")
    if isinstance(sched, dict):
        res = dict(sched)
        if not res.get("objective"):
            term = res.get("term", DEFAULT_TERM)
            res["objective"] = f"Discover market leads for {term}"
        if not res.get("research_type"):
            res["research_type"] = "lead_discovery"
        return res
    return None

def save_schedule(schedule_dict: dict[str, Any], db=None) -> dict[str, Any]:
    """Atomic CAS update of schedule configuration preserving runtime-owned fields and business_config."""
    if db is None:
        db = get_db()
    for _ in range(5):
        rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
        if not rows or not isinstance(rows[0].get("data"), dict):
            raise RuntimeError("business_config database record not found")
        orig_data = rows[0]["data"]
        snapshot = copy.deepcopy(orig_data)
        serialized_orig = json.dumps(snapshot)

        existing_sched = snapshot.get("lead_report_schedule") if isinstance(snapshot.get("lead_report_schedule"), dict) else {}
        merged_sched = {**existing_sched, **schedule_dict}
        new_data = dict(snapshot)
        new_data["lead_report_schedule"] = merged_sched

        res = db.table("business_config").update({"data": new_data}).eq("id", 1).eq("data", serialized_orig).execute()
        if res.data:
            return merged_sched

    raise RuntimeError("Failed to persist schedule configuration due to write contention")


def get_defaults(db=None) -> dict[str, str]:
    if db is None:
        db = get_db()
    config = load_config(db)
    outbound = config.get("outbound") or {}
    term = (outbound.get("audience") or DEFAULT_TERM).strip()

    cities = config.get("service_area_cities") or []
    if isinstance(cities, list) and cities and isinstance(cities[0], str) and cities[0].strip():
        c = cities[0].strip()
        area = f"{c}, TX" if not ("," in c or "TX" in c) else c
    else:
        area = DEFAULT_AREA

    return {"objective": term, "term": term, "area": area}

def is_report_task(task: dict[str, Any]) -> bool:
    if task.get("kind") != "find_leads":
        return False
    payload = task.get("payload")
    if isinstance(payload, dict):
        val = payload.get("report_mode")
        return val is True or str(val).lower() == "true"
    return False


def _format_report_run(task: dict[str, Any]) -> dict[str, Any]:
    payload = task.get("payload") or {}
    status = task.get("status", "pending")
    result = task.get("result")
    
    report = None
    error = None

    if isinstance(result, dict):
        if "error" in result:
            error = str(result["error"])
        elif status == "done":
            report = result

    if status == "failed" and not error:
        error = "Report generation failed"

    target_term = payload.get("term", DEFAULT_TERM)
    target_obj = payload.get("objective")
    if not target_obj:
        target_obj = f"Discover market leads for {target_term}"

    return {
        "id": str(task["id"]),
        "status": status,
        "created_at": task.get("created_at"),
        "target": {
            "objective": target_obj,
            "research_type": payload.get("research_type", "lead_discovery"),
            "term": target_term,
            "area": payload.get("area", DEFAULT_AREA),
            "limit": payload.get("limit", DEFAULT_LIMIT),
        },
        "report": report,
        "error": error,
    }

def list_report_runs(db=None, limit: int = 20) -> list[dict[str, Any]]:
    """Return latest report runs scanning find_leads tasks without hiding reports behind non-report runs."""
    if db is None:
        db = get_db()
    rows = db.table("tasks").select("*").eq("kind", "find_leads").order("created_at", desc=True).execute().data
    report_runs = []
    for row in rows:
        if is_report_task(row):
            report_runs.append(_format_report_run(row))
            if len(report_runs) >= limit:
                break
    return report_runs


def get_report_run(task_id: str, db=None) -> dict[str, Any] | None:
    if db is None:
        db = get_db()
    rows = db.table("tasks").select("*").eq("id", task_id).limit(1).execute().data
    if not rows:
        return None
    task = rows[0]
    if not is_report_task(task):
        return None
    return _format_report_run(task)


def has_active_report_run(db=None, ignore_task_id: str | None = None) -> bool:
    if db is None:
        db = get_db()
    rows = db.table("tasks").select("*").eq("kind", "find_leads").in_("status", ["pending", "running"]).execute().data
    for row in rows:
        if ignore_task_id and str(row.get("id")) == str(ignore_task_id):
            continue
        if is_report_task(row):
            return True
    sched = get_schedule(db)
    if sched and sched.get("pending_run_id"):
        if not ignore_task_id or str(sched["pending_run_id"]) != str(ignore_task_id):
            return True
    return False


def create_report_task(term: str, area: str, limit: int, created_by: str = "scheduler", task_id: str | None = None, objective: str | None = None, research_type: str = "lead_discovery", db=None) -> dict[str, Any]:
    if db is None:
        db = get_db()
    tid = task_id or str(uuid.uuid4())
    if has_active_report_run(db, ignore_task_id=tid):
        raise RuntimeError("Active report run already in progress")

    obj = objective or (f"Discover market leads for {term}" if term else DEFAULT_TERM)

    payload = {
        "report_mode": True,
        "objective": obj,
        "research_type": research_type or "lead_discovery",
        "term": term,
        "area": area,
        "limit": limit,
    }
    inserted = db.table("tasks").insert({
        "id": tid,
        "for_agent": "outbound",
        "kind": "find_leads",
        "status": "pending",
        "payload": payload,
        "created_by": created_by,
    }).execute().data[0]
    return inserted


def reserve_and_create_manual_run(term: str, area: str, limit: int, objective: str | None = None, research_type: str = "lead_discovery", db=None) -> dict[str, Any]:
    """Atomic cross-process CAS reservation and task creation for manual report run."""
    if db is None:
        db = get_db()
    task_id = str(uuid.uuid4())

    obj = objective or (f"Discover market leads for {term}" if term else DEFAULT_TERM)

    for _ in range(5):
        if has_active_report_run(db, ignore_task_id=task_id):
            raise RuntimeError("Active report run already in progress")

        rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
        if not rows or not isinstance(rows[0].get("data"), dict):
            raise RuntimeError("business_config database record not found")

        orig_data = rows[0]["data"]
        snapshot = copy.deepcopy(orig_data)
        serialized_orig = json.dumps(snapshot)

        curr_sched = snapshot.get("lead_report_schedule") if isinstance(snapshot.get("lead_report_schedule"), dict) else {}
        if curr_sched.get("pending_run_id"):
            raise RuntimeError("Active report run already in progress")

        new_data = dict(snapshot)
        updated_sched = dict(curr_sched)
        updated_sched["pending_run_id"] = task_id
        updated_sched["pending_run_target"] = {
            "objective": obj,
            "research_type": research_type or "lead_discovery",
            "term": term,
            "area": area,
            "limit": limit,
        }
        new_data["lead_report_schedule"] = updated_sched

        res = db.table("business_config").update({"data": new_data}).eq("id", 1).eq("data", serialized_orig).execute()
        if res.data:
            inserted = create_report_task(term, area, limit, created_by="manual", task_id=task_id, objective=obj, research_type=research_type, db=db)
            return inserted

    raise RuntimeError("Failed to persist report run reservation due to write contention")

def reserve_and_create_scheduled_run(db=None) -> tuple[str, dict[str, Any]] | None:
    """Atomic cross-process CAS reservation of a due schedule run."""
    if db is None:
        db = get_db()
    task_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)

    for _ in range(5):
        rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
        if not rows or not isinstance(rows[0].get("data"), dict):
            return None
        
        orig_data = rows[0]["data"]
        snapshot = copy.deepcopy(orig_data)
        serialized_orig = json.dumps(snapshot)

        curr_sched = snapshot.get("lead_report_schedule")
        if not isinstance(curr_sched, dict) or not curr_sched.get("enabled"):
            return None

        next_run_at = curr_sched.get("next_run_at")
        if not next_run_at:
            return None

        try:
            next_run_dt = datetime.fromisoformat(next_run_at.replace("Z", "+00:00"))
        except Exception:
            return None

        if now_utc < next_run_dt:
            return None

        if curr_sched.get("pending_run_id"):
            return None

        if has_active_report_run(db, ignore_task_id=task_id):
            logger.info("Report schedule tick: active report run in progress; skipping tick")
            return None

        term = curr_sched.get("term", DEFAULT_TERM)
        obj = curr_sched.get("objective") or f"Discover market leads for {term}"
        res_type = curr_sched.get("research_type", "lead_discovery")
        area = curr_sched.get("area", DEFAULT_AREA)
        limit = curr_sched.get("limit", DEFAULT_LIMIT)
        next_next_run_at = compute_next_run_at(curr_sched, now_utc)

        new_data = dict(snapshot)
        updated_sched = dict(curr_sched)
        updated_sched["next_run_at"] = next_next_run_at
        updated_sched["pending_run_id"] = task_id
        updated_sched["pending_run_target"] = {
            "objective": obj,
            "research_type": res_type,
            "term": term,
            "area": area,
            "limit": limit,
        }
        new_data["lead_report_schedule"] = updated_sched

        res = db.table("business_config").update({"data": new_data}).eq("id", 1).eq("data", serialized_orig).execute()
        if res.data:
            try:
                task_row = create_report_task(term, area, limit, created_by="scheduler", task_id=task_id, objective=obj, research_type=res_type, db=db)
                return task_id, task_row
            except Exception as exc:
                logger.error("Failed to insert scheduled task row after CAS reservation: %s", exc)
                return None

    return None


def complete_scheduled_reservation(task_id: str, db=None):
    """Clear reservation and record last_run_at while preserving concurrent user edits using CAS."""
    if db is None:
        db = get_db()
    for _ in range(5):
        rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
        if not rows or not isinstance(rows[0].get("data"), dict):
            return
        orig_data = rows[0]["data"]
        snapshot = copy.deepcopy(orig_data)
        serialized_orig = json.dumps(snapshot)

        sched = snapshot.get("lead_report_schedule")
        if isinstance(sched, dict):
            updated_sched = dict(sched)
            if updated_sched.get("pending_run_id") == task_id:
                updated_sched["pending_run_id"] = None
                updated_sched["pending_run_target"] = None
            updated_sched["last_run_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            new_data = dict(snapshot)
            new_data["lead_report_schedule"] = updated_sched
            res = db.table("business_config").update({"data": new_data}).eq("id", 1).eq("data", serialized_orig).execute()
            if res.data:
                return


def recover_pending_reservation(db=None) -> str | None:
    """Recover a reserved schedule run if task row creation was interrupted or lost."""
    if db is None:
        db = get_db()
    sched = get_schedule(db)
    if not sched or not sched.get("pending_run_id"):
        return None

    pid = str(sched["pending_run_id"])
    ptarget = sched.get("pending_run_target") or {}
    term = ptarget.get("term") or sched.get("term", DEFAULT_TERM)
    res_type = ptarget.get("research_type") or "lead_discovery"
    if ptarget.get("objective"):
        obj = ptarget["objective"]
    elif ptarget.get("term"):
        obj = f"Discover market leads for {ptarget['term']}"
    else:
        obj = sched.get("objective") or f"Discover market leads for {term}"
    area = ptarget.get("area") or sched.get("area", DEFAULT_AREA)
    limit = ptarget.get("limit") or sched.get("limit", DEFAULT_LIMIT)

    rows = db.table("tasks").select("*").eq("id", pid).execute().data
    if not rows:
        logger.info("Recovering missing scheduled task row for reserved run %s", pid)
        try:
            create_report_task(term, area, limit, created_by="scheduler", task_id=pid, objective=obj, research_type=res_type, db=db)
        except Exception as exc:
            logger.error("Failed to recreate task row for reserved run %s: %s", pid, exc)
            return None
        return pid
    task = rows[0]
    status = task.get("status")
    if status == "running":
        # Task is currently active/running; preserve reservation and do not attempt claim or clear
        return None
    elif status in ("done", "failed"):
        complete_scheduled_reservation(pid, db=db)
        return None
    elif status == "pending":
        return pid

    return None


def cleanup_interrupted_tasks(db=None) -> int:
    """Interrupted run cleanup on startup: fail any report_mode find_leads tasks stuck in running status."""
    if db is None:
        db = get_db()
    rows = db.table("tasks").select("*").eq("kind", "find_leads").eq("status", "running").execute().data
    cleaned = 0
    for row in rows:
        if is_report_task(row):
            db.table("tasks").update({
                "status": "failed",
                "result": {"error": "Interrupted by server restart"},
            }).eq("id", row["id"]).execute()
            cleaned += 1

    # Attempt to recover any pending reservation
    recover_pending_reservation(db=db)

    if cleaned > 0:
        logger.info("Cleaned up %d interrupted report task(s)", cleaned)
    return cleaned


class ReportScheduleWorker:
    """Background worker that ticks every 30s to trigger scheduled lead research reports."""

    def __init__(self, check_interval: int = 30):
        self.check_interval = check_interval
        self._task: asyncio.Task | None = None
        self._running = False
        self.last_error: str | None = None
        self.lock_file = None
        self.lock_held = False

    def _acquire_lock(self) -> bool:
        if self.lock_file:
            try:
                self.lock_file.close()
            except Exception:
                pass
            self.lock_file = None

        lock_dir = settings.runtime_dir()
        lock_dir.mkdir(parents=True, exist_ok=True)
        lock_path = lock_dir / "report_worker.lock"
        try:
            self.lock_file = open(lock_path, "a+")
            fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_held = True
            return True
        except (BlockingIOError, OSError):
            self.lock_held = False
            if self.lock_file:
                try:
                    self.lock_file.close()
                except Exception:
                    pass
                self.lock_file = None
            return False

    def _release_lock(self) -> None:
        if self.lock_file and self.lock_held:
            try:
                fcntl.flock(self.lock_file.fileno(), fcntl.LOCK_UN)
                self.lock_file.close()
            except Exception:
                pass
        self.lock_held = False
        self.lock_file = None

    def status_summary(self) -> dict[str, Any]:
        return {
            "running": self._running and (self._task is not None and not self._task.done()),
            "lock_held": self.lock_held,
            "error": self.last_error,
        }

    async def start(self):
        if self._running:
            return
        self._running = True
        self.last_error = None
        self._acquire_lock()
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._release_lock()

    async def resume_pending_report_tasks(self):
        """Resume any pending report tasks after server restart even if schedule is paused."""
        db = get_db()
        rows = db.table("tasks").select("*").eq("kind", "find_leads").eq("status", "pending").execute().data
        for row in rows:
            if is_report_task(row):
                tid = str(row["id"])
                logger.info("Resuming pending report task %s", tid)
                try:
                    from agents.tasks import run_task
                    await run_task(tid)
                finally:
                    complete_scheduled_reservation(tid, db=db)

    async def _loop(self):
        if self.lock_held:
            try:
                cleanup_interrupted_tasks()
                await self.resume_pending_report_tasks()
                self.last_error = None
            except Exception as exc:
                logger.error("Report worker startup cleanup/resume error: %s", exc)
                self.last_error = str(exc)

        while self._running:
            try:
                await self.tick()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Report schedule worker tick error: %s", exc)
                self.last_error = str(exc)
            await asyncio.sleep(self.check_interval)

    async def tick(self):
        if not self.lock_held:
            if not self._acquire_lock():
                return
            logger.info("Report schedule worker acquired process lock and took over scheduler ownership")
            try:
                cleanup_interrupted_tasks()
                await self.resume_pending_report_tasks()
                self.last_error = None
            except Exception as exc:
                logger.error("Report worker failover cleanup error: %s", exc)
                self.last_error = str(exc)

        db = get_db()
        recovered_id = recover_pending_reservation(db=db)
        if recovered_id:
            logger.info("Report schedule tick: executing recovered reservation %s", recovered_id)
            try:
                from agents.tasks import run_task
                await run_task(recovered_id)
                self.last_error = None
            finally:
                complete_scheduled_reservation(recovered_id, db=db)
            return

        reserved = reserve_and_create_scheduled_run(db=db)
        if not reserved:
            return

        task_id, _ = reserved
        logger.info("Report schedule tick: executing reserved task %s", task_id)

        try:
            from agents.tasks import run_task
            await run_task(task_id)
            self.last_error = None
        finally:
            complete_scheduled_reservation(task_id, db=db)


worker = ReportScheduleWorker()
