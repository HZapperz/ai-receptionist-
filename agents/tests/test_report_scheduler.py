"""Unit tests for report scheduler timezone calculation, validation, DST transitions, and race/restart behavior."""
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from agents.outbound.report_scheduler import (
    compute_next_run_at,
    validate_schedule_input,
    is_report_task,
    _format_report_run,
    has_active_report_run,
    cleanup_interrupted_tasks,
    create_report_task,
    reserve_and_create_scheduled_run,
    recover_pending_reservation,
)


class TestReportSchedulerValidation(unittest.TestCase):
    def test_validate_schedule_input_valid(self):
        inp = {
            "objective": " Identify high-end apartment partners ",
            "research_type": "competitor_analysis",
            "term": " luxury apartments ",
            "area": " Austin, TX ",
            "limit": 15,
            "cadence": "weekly",
            "time": "14:30",
            "timezone": "America/Chicago",
            "weekday": 2,
            "enabled": True,
        }
        val = validate_schedule_input(inp)
        self.assertEqual(val["objective"], "Identify high-end apartment partners")
        self.assertEqual(val["research_type"], "competitor_analysis")
        self.assertEqual(val["term"], "luxury apartments")
        self.assertEqual(val["area"], "Austin, TX")
        self.assertEqual(val["limit"], 15)
        self.assertEqual(val["cadence"], "weekly")
        self.assertEqual(val["time"], "14:30")
        self.assertEqual(val["timezone"], "America/Chicago")
        self.assertEqual(val["weekday"], 2)
        self.assertTrue(val["enabled"])

    def test_validate_schedule_input_legacy_fallback(self):
        inp = {
            "term": "pet grooming",
            "area": "Houston, TX",
        }
        val = validate_schedule_input(inp)
        self.assertEqual(val["objective"], "Discover market leads for pet grooming")
        self.assertEqual(val["research_type"], "lead_discovery")
        self.assertEqual(val["term"], "pet grooming")

    def test_validate_schedule_input_rejects_overlong_objective(self):
        with self.assertRaisesRegex(ValueError, "objective cannot exceed 2000 characters"):
            validate_schedule_input({"objective": "a" * 2001, "area": "Houston, TX"})

    def test_validate_schedule_input_rejects_invalid_research_type(self):
        with self.assertRaisesRegex(ValueError, "research_type must be"):
            validate_schedule_input({"objective": "valid objective", "research_type": "invalid_type", "area": "Houston, TX"})
    def test_validate_schedule_input_rejects_malformed_time(self):
        with self.assertRaisesRegex(ValueError, "time must be in HH:MM"):
            validate_schedule_input({"time": "09:30:junk"})

        with self.assertRaisesRegex(ValueError, "time must be in HH:MM"):
            validate_schedule_input({"time": "25:00"})

    def test_validate_schedule_input_rejects_non_boolean_enabled(self):
        with self.assertRaisesRegex(ValueError, "enabled must be a boolean"):
            validate_schedule_input({"enabled": "true"})

    def test_validate_schedule_input_rejects_empty_term_or_area(self):
        with self.assertRaisesRegex(ValueError, "objective cannot be empty"):
            validate_schedule_input({"objective": "   ", "area": "Houston, TX"})

        with self.assertRaisesRegex(ValueError, "objective cannot be empty"):
            validate_schedule_input({"objective": "", "term": "pet grooming", "area": "Houston, TX"})

        with self.assertRaisesRegex(ValueError, "area cannot be empty"):
            validate_schedule_input({"objective": "apartments", "area": "   "})
class TestReportSchedulerTimezoneDST(unittest.TestCase):
    def test_compute_next_run_at_spring_forward(self):
        # US CDT Spring forward date: March 8, 2026.
        # At 02:00 local time, clocks spring forward to 03:00.
        # Set now_utc to March 7, 2026 at 18:00 UTC = 12:00 CST (America/Chicago UTC-6).
        now_utc = datetime(2026, 3, 7, 18, 0, 0, tzinfo=timezone.utc)
        schedule = {
            "cadence": "daily",
            "time": "09:00",
            "timezone": "America/Chicago",
            "enabled": True,
        }
        # Next 09:00 local time is March 8, 2026 09:00 CDT (UTC-5 after spring forward).
        # 09:00 CDT = 14:00 UTC.
        next_run = compute_next_run_at(schedule, now_utc=now_utc)
        self.assertEqual(next_run, "2026-03-08T14:00:00Z")

    def test_compute_next_run_at_fall_back(self):
        # US Fall back date: November 1, 2026.
        # Set now_utc to October 31, 2026 at 18:00 UTC = 13:00 CDT (America/Chicago UTC-5).
        now_utc = datetime(2026, 10, 31, 18, 0, 0, tzinfo=timezone.utc)
        schedule = {
            "cadence": "daily",
            "time": "09:00",
            "timezone": "America/Chicago",
            "enabled": True,
        }
        # Next 09:00 local time is November 1, 2026 09:00 CST (UTC-6 after fall back).
        # 09:00 CST = 15:00 UTC.
        next_run = compute_next_run_at(schedule, now_utc=now_utc)
        self.assertEqual(next_run, "2026-11-01T15:00:00Z")

    def test_compute_next_run_at_weekly(self):
        # 2026-09-19 is a Saturday (weekday 5)
        now_utc = datetime(2026, 9, 19, 12, 0, 0, tzinfo=timezone.utc)
        # Target weekday 0 (Monday). Next Monday is 2026-09-21.
        schedule = {
            "cadence": "weekly",
            "weekday": 0,
            "time": "10:00",
            "timezone": "UTC",
            "enabled": True,
        }
        next_run = compute_next_run_at(schedule, now_utc=now_utc)
        self.assertEqual(next_run, "2026-09-21T10:00:00Z")


class TestReportSchedulerConflictAndRecovery(unittest.TestCase):
    def test_is_report_task(self):
        self.assertTrue(is_report_task({"kind": "find_leads", "payload": {"report_mode": True}}))
        self.assertTrue(is_report_task({"kind": "find_leads", "payload": {"report_mode": "true"}}))
        self.assertFalse(is_report_task({"kind": "find_leads", "payload": False}))
        self.assertFalse(is_report_task({"kind": "find_leads", "payload": {}}))
        self.assertFalse(is_report_task({"kind": "draft_emails", "payload": {"report_mode": True}}))

    def test_has_active_report_run_detects_pending_or_running(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().in_().execute().data = [
            {"id": "t1", "kind": "find_leads", "status": "running", "payload": {"report_mode": True}}
        ]
        with patch("agents.outbound.report_scheduler.get_schedule", return_value=None):
            self.assertTrue(has_active_report_run(db=mock_db))

    def test_has_active_report_run_ignores_specified_task_id(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().in_().execute().data = [
            {"id": "t-own", "kind": "find_leads", "status": "pending", "payload": {"report_mode": True}}
        ]
        with patch("agents.outbound.report_scheduler.get_schedule", return_value=None):
            self.assertFalse(has_active_report_run(db=mock_db, ignore_task_id="t-own"))

    def test_manual_claim_conflict(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().in_().execute().data = [
            {"id": "t-active", "kind": "find_leads", "status": "running", "payload": {"report_mode": True}}
        ]
        with self.assertRaisesRegex(RuntimeError, "Active report run already in progress"):
            create_report_task("term", "area", 10, created_by="manual", db=mock_db)

    def test_duplicate_scheduled_reserve_conflict(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().in_().execute().data = [
            {"id": "t-active", "kind": "find_leads", "status": "running", "payload": {"report_mode": True}}
        ]
        schedule_data = {
            "enabled": True,
            "next_run_at": "2026-01-01T00:00:00Z",
            "term": "apartments",
            "area": "Houston",
            "limit": 10,
        }
        mock_db.table().select().eq().limit().execute().data = [{"data": {"lead_report_schedule": schedule_data}}]
        res = reserve_and_create_scheduled_run(db=mock_db)
        self.assertIsNone(res)

    def test_cleanup_interrupted_tasks_fails_stuck_running(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().eq().execute().data = [
            {"id": "t-running", "kind": "find_leads", "status": "running", "payload": {"report_mode": True}}
        ]
        with patch("agents.outbound.report_scheduler.get_schedule", return_value=None):
            cleaned = cleanup_interrupted_tasks(db=mock_db)
            self.assertEqual(cleaned, 1)
            mock_db.table().update.assert_called_with({
                "status": "failed",
                "result": {"error": "Interrupted by server restart"},
            })

    def test_recover_pending_reservation_preserves_running_status(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().execute().data = [
            {"id": "t-running", "kind": "find_leads", "status": "running", "payload": {"report_mode": True}}
        ]
        sched = {"pending_run_id": "t-running", "pending_run_target": {"term": "a", "area": "b", "limit": 5}}
        with patch("agents.outbound.report_scheduler.get_schedule", return_value=sched), \
             patch("agents.outbound.report_scheduler.complete_scheduled_reservation") as mock_complete:
            res = recover_pending_reservation(db=mock_db)
            self.assertIsNone(res)
            mock_complete.assert_not_called()

    def test_recover_pending_reservation_uses_target_snapshot_on_midflight_edit(self):
        mock_db = MagicMock()
        mock_db.table().select().eq().execute().data = []
        sched = {
            "pending_run_id": "t-lost",
            "pending_run_target": {"term": "old term", "area": "Austin, TX", "limit": 5},
            "term": "new term",
            "objective": "Discover market leads for new term",
        }
        with patch("agents.outbound.report_scheduler.get_schedule", return_value=sched), \
             patch("agents.outbound.report_scheduler.create_report_task") as mock_create:
            mock_create.return_value = {"id": "t-lost"}
            res = recover_pending_reservation(db=mock_db)
            self.assertEqual(res, "t-lost")
            mock_create.assert_called_once_with(
                "old term",
                "Austin, TX",
                5,
                created_by="scheduler",
                task_id="t-lost",
                objective="Discover market leads for old term",
                research_type="lead_discovery",
                db=mock_db,
            )

if __name__ == "__main__":
    unittest.main()
