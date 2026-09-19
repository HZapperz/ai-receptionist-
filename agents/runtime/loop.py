import json

from agents.runtime import llm
from agents.runtime.ctx import Ctx
from agents.runtime.events import log_event
from agents.runtime.tools import AgentSpec, run_tool

GIVE_UP = "Let me get a person to help with this. Someone from the team will text you shortly."


async def run_agent(spec: AgentSpec, messages: list[dict], ctx: Ctx, max_steps: int = 6) -> str:
    msgs: list[dict] = [{"role": "system", "content": spec.system_prompt(ctx)}, *messages]
    schemas = [t.schema() for t in spec.tools]
    for _ in range(max_steps):
        resp = await llm.chat(msgs, tools=schemas)
        msg = resp.choices[0].message
        if not msg.tool_calls:
            text = llm.strip_think(msg.content)
            await log_event(ctx, kind="message", name="reply", result={"text": text})
            return text
        msgs.append(msg.model_dump(exclude_none=True))
        for call in msg.tool_calls:
            result = await run_tool(spec, call, ctx)
            msgs.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, default=str)})
    await log_event(ctx, kind="error", name="max_steps", result={"steps": max_steps})
    return GIVE_UP
