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

# A phone is the one identifier str() quietly corrupts: 17132089751 loses its "+", still
# looks right, and propose_book writes it straight into bookings and customers with no gate
# in front of it. customer_name rides along because create_booking upserts on phone and
# would overwrite a real customer's name. Getting these exactly right stays the model's job.
NEVER_COERCE = {"phone", "customer_name"}


def _explain(e: ValidationError) -> str:
    """str(e) is a class name, prose and a docs URL, and the model answers it by resending
    the same call. One line per bad field is what it can act on."""
    return "; ".join(
        f"{'.'.join(str(p) for p in err['loc']) or 'arguments'}: {err['msg']}"
        for err in e.errors(include_url=False)[:3]
    )[:300]


def _ints_as_strings(raw: str, e: ValidationError) -> dict | None:
    """The one model mistake worth repairing: a field typed as a JSON number where the tool
    wants a string, as in {"phone_or_name": 17132089751}. Only the fields pydantic itself
    flagged, only at the top level, and only int -- a float arrives as "17132089751.0",
    which is wrong and still looks right. None leaves the original error standing."""
    names = {
        err["loc"][0]
        for err in e.errors()
        if err["type"] == "string_type"
        and len(err["loc"]) == 1
        and isinstance(err["loc"][0], str)
        and type(err["input"]) is int  # `type(...) is` excludes bool, which subclasses int
        and err["loc"][0] not in NEVER_COERCE
    }
    if not names:
        return None
    data = json.loads(raw)
    if not isinstance(data, dict):
        return None
    return {k: (str(v) if k in names else v) for k, v in data.items()}


async def run_tool(spec: AgentSpec, call, ctx: Ctx) -> dict:
    tool = next((t for t in spec.tools if t.name == call.function.name), None)
    if tool is None:
        return {"error": f"unknown tool {call.function.name}"}
    started = time.monotonic()
    raw = call.function.arguments or "{}"
    try:
        try:
            args = tool.args.model_validate_json(raw)
        except ValidationError as first:
            # Only a call that already failed reaches Python-mode validation, so a call
            # that works today keeps the exact path it has on the live SMS line.
            repaired = _ints_as_strings(raw, first)
            if repaired is None:
                raise
            args = tool.args.model_validate(repaired)
        result = await tool.handler(ctx, args)
    except ValidationError as e:
        result = {"error": "invalid arguments", "detail": _explain(e)}
    except Exception as e:  # tools never raise to the model
        result = {"error": str(e)[:500]}
    try:
        logged_input = json.loads(raw)
    except Exception:
        logged_input = {"raw": raw[:500]}
    await log_event(ctx, kind="tool", name=tool.name, input=logged_input, result=result,
                    latency_ms=int((time.monotonic() - started) * 1000))
    return result
