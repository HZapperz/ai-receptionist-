import asyncio
import logging

from agents.db import get_db, load_config
from agents.outbound import apify_io
from agents.outbound.tools import OUTBOUND_DRAFTER
from agents.runtime.ctx import Ctx
from agents.runtime.loop import run_agent

logger = logging.getLogger(__name__)


async def find_leads(task: dict) -> dict:
    payload = task.get("payload") if isinstance(task, dict) and "payload" in task else task
    if not isinstance(payload, dict):
        payload = {}

    term = str(payload.get("term") or "pet-friendly apartment communities").strip()
    area = str(payload.get("area") or "Houston, TX").strip()
    raw_limit = payload.get("limit", 20)
    try:
        limit = min(max(1, int(raw_limit)), 50)
    except (ValueError, TypeError):
        limit = 20

    raw_places = await apify_io.find_leads(term=term, area=area, limit=limit)
    if not raw_places:
        return {"found": 0, "new": 0, "draft_task_id": None}

    unique_places: dict[str, dict] = {}
    for p in raw_places:
        pid = p.get("place_id")
        if pid and isinstance(pid, str) and pid.strip():
            pid = pid.strip()
            if pid not in unique_places:
                p["place_id"] = pid
                unique_places[pid] = p

    if not unique_places:
        return {"found": len(raw_places), "new": 0, "draft_task_id": None}

    place_ids = list(unique_places.keys())
    db = get_db()

    existing_rows = db.table("leads").select("id, place_id, status").in_("place_id", place_ids).execute().data
    existing_map = {row["place_id"]: row for row in (existing_rows or [])}

    new_lead_ids: list[str] = []

    for pid, p in unique_places.items():
        record = {
            "place_id": pid,
            "name": p.get("name") or "Unnamed Place",
            "address": p.get("address"),
            "phone": p.get("phone"),
            "email": p.get("email"),
            "website": p.get("website"),
            "rating": p.get("rating"),
            "raw": p.get("raw") or {},
        }
        if pid in existing_map:
            db.table("leads").update(record).eq("place_id", pid).execute()
        else:
            record["status"] = "new"
            res = db.table("leads").insert(record).execute()
            if res.data:
                new_id = res.data[0]["id"]
                new_lead_ids.append(str(new_id))

    draft_task_id = None
    if new_lead_ids:
        task_row = db.table("tasks").insert({
            "for_agent": "outbound",
            "kind": "draft_emails",
            "payload": {"lead_ids": new_lead_ids},
            "created_by": "find_leads",
        }).execute().data[0]
        draft_task_id = str(task_row["id"])

        from agents.tasks import run_task
        try:
            asyncio.create_task(run_task(draft_task_id))
        except Exception as exc:
            logger.warning("Could not trigger draft_emails task in background: %s", exc)

    return {
        "found": len(raw_places),
        "new": len(new_lead_ids),
        "draft_task_id": draft_task_id,
    }


async def draft_emails(task: dict) -> dict:
    payload = task.get("payload") if isinstance(task, dict) and "payload" in task else task
    if not isinstance(payload, dict):
        payload = {}

    db = get_db()
    lead_ids_input = payload.get("lead_ids", "all_new")

    lead_ids: list[str] = []
    if lead_ids_input == "all_new" or str(lead_ids_input).lower() == "all_new":
        rows = db.table("leads").select("id").eq("status", "new").execute().data
        lead_ids = [str(r["id"]) for r in (rows or []) if r.get("id")]
    elif isinstance(lead_ids_input, list):
        lead_ids = [str(i) for i in lead_ids_input if i]
    elif isinstance(lead_ids_input, str) and lead_ids_input.strip():
        lead_ids = [lead_ids_input.strip()]

    seen = set()
    deduped_lead_ids = []
    for lid in lead_ids:
        if lid not in seen:
            seen.add(lid)
            deduped_lead_ids.append(lid)

    if not deduped_lead_ids:
        return {"drafted": 0, "total": 0, "errors": 0}

    cfg = load_config(db)
    drafted_count = 0
    errors = []

    for lead_id in deduped_lead_ids:
        rows = db.table("leads").select("*").eq("id", lead_id).limit(1).execute().data
        if not rows:
            errors.append(f"Lead {lead_id} not found")
            continue

        lead = rows[0]
        if lead.get("status") == "sent":
            continue

        ctx = Ctx(db=db, config=cfg, agent="outbound", ref=lead_id, task=task)
        messages = [
            {
                "role": "user",
                "content": f"Draft a partnership email for lead_id '{lead_id}' (name: {lead.get('name')}). Call get_lead, write the email, then call save_draft once.",
            }
        ]

        try:
            await run_agent(OUTBOUND_DRAFTER, messages, ctx)
            updated_rows = db.table("leads").select("status, draft_subject, draft_body").eq("id", lead_id).limit(1).execute().data
            if updated_rows and updated_rows[0].get("status") == "drafted" and updated_rows[0].get("draft_subject"):
                drafted_count += 1
            else:
                errors.append(f"Lead {lead_id} was not drafted successfully")
        except Exception as exc:
            logger.error("Failed to draft email for lead %s: %s", lead_id, exc)
            errors.append(f"Lead {lead_id}: {str(exc)[:200]}")

    result = {
        "drafted": drafted_count,
        "total": len(deduped_lead_ids),
        "errors": len(errors),
    }
    if errors:
        result["error_details"] = errors[:10]
    return result
