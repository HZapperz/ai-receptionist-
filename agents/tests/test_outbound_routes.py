"""Tests for outbound read routes:
- GET /outbound/leads (bounded limit, newest-first order)
- GET /outbound/tasks/{task_id} (returns dashboard-safe fields only, 404 on missing task)
"""
import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agents.outbound.routes import router


class TestOutboundReadRoutes(unittest.TestCase):

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def test_get_leads_default_limit_and_ordering(self):
        mock_db = MagicMock()
        mock_query = MagicMock()
        mock_db.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.limit.return_value = mock_query

        sample_leads = [
            {"id": "lead-2", "name": "Community B", "created_at": "2026-09-19T10:00:00Z"},
            {"id": "lead-1", "name": "Community A", "created_at": "2026-09-19T09:00:00Z"},
        ]
        mock_query.execute.return_value.data = sample_leads

        with patch("agents.outbound.routes.get_db", return_value=mock_db), patch(
            "agents.outbound.routes.load_config", return_value={}
        ):
            res = self.client.get("/outbound/leads")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {"leads": sample_leads, "audience": "pet-friendly apartment communities"},
        )
        mock_db.table.assert_called_once_with("leads")
        mock_query.select.assert_called_once_with("*")
        mock_query.order.assert_called_once_with("created_at", desc=True)
        mock_query.limit.assert_called_once_with(50)

    def test_get_leads_custom_limit(self):
        mock_db = MagicMock()
        mock_query = MagicMock()
        mock_db.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.execute.return_value.data = []

        with patch("agents.outbound.routes.get_db", return_value=mock_db), patch(
            "agents.outbound.routes.load_config",
            return_value={"outbound": {"audience": "dog daycares"}},
        ):
            res = self.client.get("/outbound/leads?limit=10")

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["audience"], "dog daycares")
        mock_query.limit.assert_called_once_with(10)

    def test_get_leads_limit_validation(self):
        with patch("agents.outbound.routes.get_db"):
            res_zero = self.client.get("/outbound/leads?limit=0")
            res_too_large = self.client.get("/outbound/leads?limit=150")

        self.assertEqual(res_zero.status_code, 422)
        self.assertEqual(res_too_large.status_code, 422)

    def test_get_task_success(self):
        mock_db = MagicMock()
        mock_query = MagicMock()
        mock_db.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.limit.return_value = mock_query

        raw_task_row = {
            "id": "task-123",
            "kind": "find_leads",
            "status": "done",
            "result": {"leads_count": 5},
            "payload": {"term": "pet-friendly", "secret": "internal_value"},
            "created_by": "dashboard",
            "for_agent": "outbound",
        }
        mock_query.execute.return_value.data = [raw_task_row]

        with patch("agents.outbound.routes.get_db", return_value=mock_db):
            res = self.client.get("/outbound/tasks/task-123")

        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(
            body,
            {
                "id": "task-123",
                "kind": "find_leads",
                "status": "done",
                "result": {"leads_count": 5},
            },
        )
        self.assertNotIn("payload", body)
        self.assertNotIn("created_by", body)
        self.assertNotIn("for_agent", body)

        mock_db.table.assert_called_once_with("tasks")
        mock_query.select.assert_called_once_with("id,kind,status,result")
        mock_query.eq.assert_called_once_with("id", "task-123")
        mock_query.limit.assert_called_once_with(1)

    def test_get_task_not_found(self):
        mock_db = MagicMock()
        mock_query = MagicMock()
        mock_db.table.return_value = mock_query
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.execute.return_value.data = []

        with patch("agents.outbound.routes.get_db", return_value=mock_db):
            res = self.client.get("/outbound/tasks/nonexistent-id")

        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.json(), {"detail": "Task not found"})


if __name__ == "__main__":
    unittest.main()
