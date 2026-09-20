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

# str() on a phone drops the "+", and a de-plussed number still looks right while matching
# nothing: gate.active_session compares exactly, and create_booking would store it. Refusing
# it outright is worse -- the model resends the same number rather than quoting it, and the
# turn dies -- so put the number back into the E.164 form it plainly meant, or leave the
# error standing. A name is never a number, so that one stays the model's job.
PHONE_FIELDS = {"phone"}
NEVER_COERCE = {"customer_name"}


def _as_e164(n: int) -> str | None:
    digits = str(n)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None


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
    fixes: dict[str, str] = {}
    for err in e.errors():
        name = err["loc"][0] if err["loc"] else None
        if err["type"] != "string_type" or len(err["loc"]) != 1 or not isinstance(name, str):
            continue
        if name in NEVER_COERCE:
            continue
        if type(err["input"]) is not int:  # `type(...) is` excludes bool, which subclasses int
            continue
        fixed = _as_e164(err["input"]) if name in PHONE_FIELDS else str(err["input"])
        if fixed is not None:
            fixes[name] = fixed
    if not fixes:
        return None
    data = json.loads(raw)
    if not isinstance(data, dict):
        return None
    return {**data, **fixes}


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
