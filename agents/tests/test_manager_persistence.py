"""Regression coverage for ephemeral-disk recovery and checkpoint failure."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from agents.manager.queue import QueueError
from agents.runtime.manager_runner import ManagerRunner
from agents.runtime.manager_session import checkpoint_session, restore_session


TRANSCRIPT = '\n'.join(json.dumps(row) for row in [
    {"type": "title", "v": 1, "title": "", "updatedAt": "2026-09-19T00:00:00Z"},
    {"type": "session", "id": "preserved-session", "version": 3, "cwd": "/app"},
    {"type": "message", "id": "reply", "message": {"role": "assistant", "content": "Remember blue heron"}},
]) + '\n'


class SessionRecoveryTests(unittest.TestCase):
    def test_transcript_survives_loss_of_original_filesystem(self):
        queue = MagicMock()
        queue.get_session_checkpoint.return_value = None
        with tempfile.TemporaryDirectory() as old:
            source = Path(old) / "manager.jsonl"
            source.write_text(TRANSCRIPT)
            checkpoint_session(queue, source, required=True)
            name, content = queue.save_session_checkpoint.call_args.args
        queue.get_session_checkpoint.return_value = {"file_name": name, "content": content}
        with tempfile.TemporaryDirectory() as new:
            restored = restore_session(queue, Path(new), {"session_file": str(source)})
            header = next(row for row in map(json.loads, restored.read_text().splitlines()) if row["type"] == "session")
            self.assertEqual(header["id"], "preserved-session")
            self.assertEqual(restored.read_text(), TRANSCRIPT)

    def test_unused_new_session_does_not_create_broken_resume_mapping(self):
        queue = MagicMock()
        queue.get_session_checkpoint.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "not-created-yet.jsonl"
            checkpoint_session(queue, path)
            queue.set_session_file.assert_not_called()
            self.assertIsNone(restore_session(queue, Path(directory), {"session_file": None}))
            with self.assertRaisesRegex(RuntimeError, "cannot durably complete"):
                checkpoint_session(queue, path, required=True)

    def test_lost_legacy_history_is_not_silently_replaced(self):
        queue = MagicMock()
        queue.get_session_checkpoint.return_value = None
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "no durable checkpoint"):
                restore_session(queue, Path(directory), {"session_file": str(Path(directory) / "lost.jsonl")})

    def test_invalid_backup_cannot_overwrite_files_or_resume_partial_json(self):
        queue = MagicMock()
        with tempfile.TemporaryDirectory() as directory:
            for name, content in [("../escape.jsonl", TRANSCRIPT), ("safe.jsonl", TRANSCRIPT[:-2])]:
                queue.get_session_checkpoint.return_value = {"file_name": name, "content": content}
                with self.assertRaises(ValueError):
                    restore_session(queue, Path(directory), {})
            self.assertEqual(list(Path(directory).iterdir()), [])


class CompletionDurabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_checkpoint_failure_cannot_complete_an_event(self):
        runner = ManagerRunner()
        runner.running = True
        runner._process_event = AsyncMock()
        queue = MagicMock()
        queue.claim_next_event.return_value = {"id": "event", "source": "chat", "payload": {}}
        with patch("agents.runtime.manager_runner.queue", queue), patch(
            "agents.runtime.manager_runner.checkpoint_session", side_effect=QueueError("storage unavailable")
        ):
            await runner._worker_loop()
        queue.mark_event_completed.assert_not_called()
        self.assertEqual(queue.mark_event_failed.call_args.args[0], "event")
        self.assertEqual(runner.status_summary()["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
