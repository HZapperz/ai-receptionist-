"""Regression coverage for idle queues and unavailable database connections."""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from agents.manager.queue import Queue, QueueError


class QueueRegressionTests(unittest.TestCase):
    def test_null_composite_does_not_start_a_turn(self):
        db = MagicMock()
        # A PostgreSQL NULL composite is an object, not JSON null, in PostgREST.
        db.rpc.return_value.execute.return_value = SimpleNamespace(
            data={"id": None, "session_id": None, "source": None, "status": None}
        )
        self.assertIsNone(Queue(db=db).claim_next_event())

    def test_database_failure_is_not_reported_as_an_idle_queue(self):
        db = MagicMock()
        db.rpc.side_effect = ConnectionError("connection refused")
        with self.assertRaises(QueueError):
            Queue(db=db).claim_next_event()

    def test_sqlite_fallback_queue_operations(self):
        from agents.db import get_manager_sqlite_conn, ManagerClientWrapper
        class FakeSupabase:
            def table(self, name):
                raise RuntimeError("table not found")
            def rpc(self, name, args):
                raise RuntimeError("rpc not found")
        wrapper = ManagerClientWrapper(FakeSupabase())
        q = Queue(db=wrapper)
        session = q.ensure_session()
        self.assertIsNotNone(session.get("id"))
        ev = q.enqueue_event(source="chat", payload={"test": True}, user_message="hello")
        self.assertEqual(ev["source"], "chat")
        claimed = q.claim_next_event()
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["id"], ev["id"])
        comp = q.mark_event_completed(claimed["id"], payload={"reply": "ok"})
        self.assertEqual(comp["status"], "completed")
        snap = q.snapshot()
        self.assertGreaterEqual(len(snap["events"]), 1)
        self.assertGreaterEqual(len(snap["messages"]), 1)

if __name__ == "__main__":
    unittest.main()
