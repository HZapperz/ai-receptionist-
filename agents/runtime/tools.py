import json
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

from pydantic import BaseModel, ValidationError

from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event


@dataclass
class Tool:
    name: str
    description: str
    args: type[BaseModel]
    handler: Callable[[Ctx, BaseModel], Awaitable[dict]]

    def schema(self) -> dict:
        return {"type": "function", "function": {
            "name": self.name,
            "description": self.description,
            "parameters": self.args.model_json_schema(),
        }}


@dataclass
class AgentSpec:
    name: str
    system_prompt: Callable[[Ctx], str]
    tools: list[Tool]
    max_tokens: int | None = None

async def run_tool(spec: AgentSpec, call, ctx: Ctx) -> dict:
    tool = next((t for t in spec.tools if t.name == call.function.name), None)
    if tool is None:
        return {"error": f"unknown tool {call.function.name}"}
    started = time.monotonic()
    raw = call.function.arguments or "{}"
    try:
        args = tool.args.model_validate_json(raw)
        result = await tool.handler(ctx, args)
    except ValidationError as e:
        result = {"error": "invalid arguments", "detail": str(e)[:500]}
    except Exception as e:  # tools never raise to the model
        result = {"error": str(e)[:500]}
    try:
        logged_input = json.loads(raw)
    except Exception:
        logged_input = {"raw": raw[:500]}
    await log_event(ctx, kind="tool", name=tool.name, input=logged_input, result=result,
                    latency_ms=int((time.monotonic() - started) * 1000))
    return result
