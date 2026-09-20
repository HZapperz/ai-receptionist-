import json
import re
import uuid
from types import SimpleNamespace

from agents.runtime import llm
from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event
from agents.runtime.tools import AgentSpec, run_tool

GIVE_UP = "Let me get a person to help with this. Someone from the team will text you shortly."
_TOOL_CALL = re.compile(r"<tool_call>\s*(.*?)\s*(?:</tool_call>|\Z)", re.DOTALL)


def parse_tool_calls(text: str) -> list:
    """Some providers hand back Qwen's tool calls as text:
    <tool_call>{"name": ..., "arguments": {...}}</tool_call>. Turn them into
    objects shaped like the SDK's tool calls so run_tool() can run them.
    A reply that is only such a JSON object (no tags) counts too."""
    blobs = [m.group(1) for m in _TOOL_CALL.finditer(text)]
    if not blobs and text.lstrip().startswith("{"):
        blobs = [text]
    calls = []
    for blob in blobs:
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict) or not data.get("name"):
            continue
        args = data.get("arguments", data.get("parameters", {}))
        calls.append(SimpleNamespace(
            id=f"call_{uuid.uuid4().hex[:12]}", type="function",
            function=SimpleNamespace(name=data["name"],
                                     arguments=args if isinstance(args, str) else json.dumps(args)),
        ))
    return calls


def _unsendable(text: str) -> bool:
    """Empty, raw tool markup or raw JSON must never reach a customer."""
    return not text or "tool_call>" in text or text.lstrip().startswith(("{", "["))


async def run_agent(spec: AgentSpec, messages: list[dict], ctx: Ctx, max_steps: int = 6) -> str:
    # Which concurrency budget this turn draws from, so the 833 line never waits behind
    # the dashboard. Each task carries its own copy, so this does not leak across turns.
    llm.current_lane.set(ctx.agent or "other")
    msgs: list[dict] = [{"role": "system", "content": spec.system_prompt(ctx)}, *messages]
    schemas = [t.schema() for t in spec.tools]
    # A call pydantic rejected will be rejected identically forever, and the model answers a
    # rejection by resending it -- one question burned all ten steps that way. Say so once,
    # so the remaining steps go somewhere. Only argument errors: a tool that failed on a
    # dropped connection or a busy table can well succeed on the very next try.
    rejected: dict[str, str] = {}
    for _ in range(max_steps):
        kwargs = {}
        if spec.max_tokens is not None:
            kwargs["max_tokens"] = spec.max_tokens
        resp = await llm.chat(msgs, tools=schemas, **kwargs)
        msg = resp.choices[0].message
        text = llm.strip_think(msg.content)
        calls = msg.tool_calls or parse_tool_calls(text)
        if not calls:
            if _unsendable(text):
                finish_reason = getattr(resp.choices[0], "finish_reason", None) if getattr(resp, "choices", None) else None
                await log_event(ctx, kind="error", name="bad_reply", result={
                    "text": (msg.content or "")[:500],
                    "finish_reason": finish_reason,
                })
                return GIVE_UP
            await log_event(ctx, kind="message", name="reply", result={"text": text})
            return text
        if msg.tool_calls:
            msgs.append(msg.model_dump(exclude_none=True))
        else:
            msgs.append({"role": "assistant", "content": "", "tool_calls": [
                {"id": c.id, "type": "function",
                 "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in calls]})
        for call in calls:
            key = f"{call.function.name}:{call.function.arguments}"
            if key in rejected:
                result = {"error": "already rejected", "detail":
                          f"{call.function.name} was already rejected with these exact "
                          f"arguments: {rejected[key]}. Sending it again will fail again. "
                          "Correct the arguments, try another tool, or answer with what "
                          "you already have."}
                await log_event(ctx, kind="error", name="repeat_call",
                                input={"tool": call.function.name}, result=result)
            else:
                result = await run_tool(spec, call, ctx)
                if result.get("error") == "invalid arguments":
                    rejected[key] = result.get("detail", "")
            msgs.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)})
    await log_event(ctx, kind="error", name="max_steps", result={"steps": max_steps})
    return GIVE_UP
