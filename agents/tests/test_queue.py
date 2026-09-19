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


if __name__ == "__main__":
    unittest.main()
