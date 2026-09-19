"""Durable text-only Manager transcripts; local disk is a disposable cache."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from agents.manager.queue import Queue


def _validate(file_name: str, content: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+\.jsonl", file_name):
        raise ValueError("Invalid Manager checkpoint filename")
    lines = content.splitlines()
    if not lines or not content.endswith("\n"):
        raise ValueError("Incomplete Manager session checkpoint")
    entries = [json.loads(line) for line in lines]
    # OMP 18 writes a title preamble before the session header.
    header = next(
        (entry for entry in entries if isinstance(entry, dict) and entry.get("type") == "session"),
        None,
    )
    if not header or not header.get("id"):
        raise ValueError("Invalid OMP session header")


def restore_session(queue: Queue, directory: Path, session_info: dict) -> Path | None:
    checkpoint = queue.get_session_checkpoint()
    if checkpoint:
        name, content = checkpoint["file_name"], checkpoint["content"]
        _validate(name, content)
        path = directory / name
        directory.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        try:
            with temporary.open("w", encoding="utf-8") as stream:
                os.chmod(temporary, 0o600)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        return path
    mapped = session_info.get("session_file")
    if not mapped:
        return None
    path = Path(mapped)
    if not path.is_file():
        raise RuntimeError(
            "Mapped Manager session is missing and has no durable checkpoint; "
            "restore the original JSONL before starting (do not discard its history)"
        )
    checkpoint_session(queue, path, required=True)
    return path


def checkpoint_session(queue: Queue, path: Path | None, *, required: bool = False) -> None:
    # OMP allocates a path at startup but writes only after its first assistant turn.
    if path is None or not path.is_file():
        if required:
            raise RuntimeError("OMP session missing; cannot durably complete this turn")
        return
    content = path.read_text(encoding="utf-8")
    _validate(path.name, content)
    queue.save_session_checkpoint(path.name, content)
    # Backup comes first: recovery can relocate it even if this update fails.
    queue.set_session_file(str(path))
