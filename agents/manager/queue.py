"""Synchronous service-role persistence for the single manager session.

The queue deliberately keeps database calls synchronous.  FastAPI handlers and
runtime workers call these functions through ``asyncio.to_thread`` so a slow
Supabase request cannot block the event loop.
"""
from __future__ import annotations

from typing import Any

from agents.db import get_db
from agents.settings import settings


class QueueError(RuntimeError):
    """A durable queue operation could not be completed."""


class Queue:
    def __init__(self, db: Any | None = None) -> None:
        self._db = db
        self.session_id = settings.manager_session_uuid()

    @property
    def db(self):
        if self._db is None:
            self._db = get_db()
        return self._db

    @staticmethod
    def _one(data: Any) -> dict | None:
        if isinstance(data, list):
            return data[0] if data else None
        return data if isinstance(data, dict) else None

    def ensure_session(self) -> dict:
        try:
            self.db.table("manager_sessions").upsert(
                {"id": str(self.session_id)}, on_conflict="id", ignore_duplicates=True
            ).execute()
            row = (
                self.db.table("manager_sessions")
                .select("id,session_file,created_at")
                .eq("id", str(self.session_id))
                .limit(1)
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"manager session unavailable: {exc}") from exc
        result = self._one(row)
        if result is None:
            raise QueueError("manager session was not created")
        return result

    def set_session_file(self, session_file: str) -> dict:
        try:
            row = (
                self.db.table("manager_sessions")
                .update({"session_file": session_file})
                .eq("id", str(self.session_id))
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not persist manager session file: {exc}") from exc
        result = self._one(row)
        if result is not None:
            return result
        return self.ensure_session()

    def enqueue_event(
        self,
        source: str,
        payload: dict,
        dedupe_key: str | None = None,
        user_message: str | None = None,
    ) -> dict:
        if source not in {"chat", "twilio", "approval", "worker"}:
            raise ValueError(f"invalid manager event source: {source}")
        args = {
            "p_session_id": str(self.session_id),
            "p_source": source,
            "p_payload": payload,
            "p_dedupe_key": dedupe_key,
            "p_user_message": user_message,
        }
        try:
            result = self.db.rpc("manager_enqueue_event", args).execute().data
        except Exception as exc:
            raise QueueError(f"could not enqueue manager event: {exc}") from exc
        event = self._one(result)
        if event is None:
            raise QueueError("manager event enqueue returned no row")
        return event

    def claim_next_event(self) -> dict | None:
        try:
            result = self.db.rpc(
                "manager_claim_event", {"p_session_id": str(self.session_id)}
            ).execute().data
        except Exception as exc:
            raise QueueError(f"could not claim manager event: {exc}") from exc
        event = self._one(result)
        # PostgREST represents a NULL composite return as an all-null object.
        return event if event and event.get("id") else None

    def mark_event_completed(self, event_id: str, payload: dict | None = None) -> dict | None:
        values: dict[str, Any] = {
            "status": "completed",
            "completed_at": "now()",
        }
        if payload is not None:
            values["payload"] = payload
        try:
            result = (
                self.db.table("manager_events")
                .update(values)
                .eq("id", event_id)
                .eq("status", "running")
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not complete manager event: {exc}") from exc
        return self._one(result)

    def mark_event_failed(self, event_id: str, error: str) -> dict | None:
        try:
            result = (
                self.db.table("manager_events")
                .update({"status": "failed", "error": error[:2000], "completed_at": "now()"})
                .eq("id", event_id)
                .eq("status", "running")
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not fail manager event: {exc}") from exc
        return self._one(result)

    def mark_event_interrupted(self, event_id: str, error: str = "interrupted") -> dict | None:
        try:
            result = (
                self.db.table("manager_events")
                .update(
                    {
                        "status": "interrupted",
                        "error": error[:2000],
                        "completed_at": "now()",
                    }
                )
                .eq("id", event_id)
                .eq("status", "running")
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not interrupt manager event: {exc}") from exc
        return self._one(result)

    def recover_running(self) -> int:
        """Make prior in-flight work visible; never requeue it after restart."""
        try:
            result = self.db.rpc(
                "manager_recover_running", {"p_session_id": str(self.session_id)}
            ).execute().data
        except Exception as exc:
            raise QueueError(f"could not recover manager events: {exc}") from exc
        row = self._one(result) or {}
        return int(row.get("events_count", 0))

    def insert_message(
        self,
        role: str,
        content: str,
        event_id: str | None = None,
    ) -> dict:
        if role not in {"user", "assistant", "system"}:
            raise ValueError(f"invalid manager message role: {role}")
        try:
            result = (
                self.db.table("manager_messages")
                .insert(
                    {
                        "session_id": str(self.session_id),
                        "event_id": event_id,
                        "role": role,
                        "content": content,
                    }
                )
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not persist manager message: {exc}") from exc
        message = self._one(result)
        if message is None:
            raise QueueError("manager message insert returned no row")
        return message

    def get_approval(self, approval_id: str) -> dict | None:
        try:
            rows = (
                self.db.table("manager_approvals")
                .select("*")
                .eq("id", approval_id)
                .eq("session_id", str(self.session_id))
                .limit(1)
                .execute()
            ).data
        except Exception as exc:
            raise QueueError(f"could not read manager approval: {exc}") from exc
        return self._one(rows)

    def snapshot(self) -> dict:
        session = self.ensure_session()
        try:
            messages = (
                self.db.table("manager_messages")
                .select("*")
                .eq("session_id", str(self.session_id))
                .order("created_at")
                .execute()
            ).data or []
            events = (
                self.db.table("manager_events")
                .select("*")
                .eq("session_id", str(self.session_id))
                .order("created_at", desc=True)
                .limit(500)
                .execute()
            ).data or []
            tasks = (
                self.db.table("manager_tasks")
                .select("*")
                .eq("session_id", str(self.session_id))
                .order("updated_at", desc=True)
                .limit(500)
                .execute()
            ).data or []
            approvals = (
                self.db.table("manager_approvals")
                .select("*")
                .eq("session_id", str(self.session_id))
                .order("created_at", desc=True)
                .limit(500)
                .execute()
            ).data or []
        except Exception as exc:
            raise QueueError(f"could not read manager state: {exc}") from exc
        return {
            "session": {"id": session["id"], "session_file": session.get("session_file")},
            "messages": messages,
            "events": events,
            "tasks": tasks,
            "approvals": approvals,
        }


queue = Queue()


def ensure_session() -> dict:
    return queue.ensure_session()


def enqueue_event(
    source: str,
    payload: dict,
    dedupe_key: str | None = None,
    user_message: str | None = None,
) -> dict:
    return queue.enqueue_event(source, payload, dedupe_key, user_message)
