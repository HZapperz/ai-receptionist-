"""Structured stdin/stdout CLI for executing domain tools from OMP TypeScript extension.

Commands:
- `list`: Emits JSON list of registered tools with name, description, and JSON schema.
- `call`: Reads `{name: str, args: dict}` from stdin JSON, executes handler, emits JSON result.
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

from agents.db import get_db, load_config
from agents.manager.tools import MANAGER
from agents.runtime.ctx import Ctx
from agents.runtime.tools import run_tool
from agents.runtime.shared_tools import SHARED_TOOLS


def _tools_dict() -> dict[str, Any]:
    return {tool.name: tool for tool in MANAGER.tools}


def do_list() -> None:
    tools_payload = []
    for tool in MANAGER.tools:
        tools_payload.append({
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.args.model_json_schema(),
        })
    json.dump({"tools": tools_payload}, sys.stdout)
    sys.stdout.flush()


def do_call(raw_input: str) -> None:
    try:
        data = json.loads(raw_input or "{}")
    except Exception as exc:
        json.dump({"error": f"invalid JSON stdin: {str(exc)[:200]}"}, sys.stdout)
        sys.stdout.flush()
        return

    name = data.get("name")
    args = data.get("args") or {}
    tool = _tools_dict().get(name)
    if tool is None:
        json.dump({"error": f"unknown tool '{name}'"}, sys.stdout)
        sys.stdout.flush()
        return

    db = get_db()
    ctx = Ctx(
        db=db,
        config=load_config(db),
        agent="manager",
        ref=os.getenv("MANAGER_SESSION_ID"),
    )

    try:
        validated_args = tool.args.model_validate(args)
        import asyncio
        result = asyncio.run(tool.handler(ctx, validated_args))
    except Exception as exc:
        result = {"error": f"tool execution error: {str(exc)[:300]}"}

    json.dump(result, sys.stdout)
    sys.stdout.flush()


def main() -> None:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "list":
            do_list()
            return
        raw = sys.stdin.read()
        do_call(raw)
    except Exception as exc:
        json.dump({"error": f"tool_cli error: {str(exc)[:300]}"}, sys.stdout)
        sys.stdout.flush()

if __name__ == "__main__":
    main()
