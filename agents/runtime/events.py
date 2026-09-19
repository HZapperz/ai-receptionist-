from agents.runtime.ctx import Ctx


async def log_event(ctx: Ctx, *, kind: str, name: str | None = None, input=None,
                    result=None, latency_ms: int | None = None) -> None:
    try:
        ctx.db.table("agent_events").insert({
            "agent": ctx.agent, "kind": kind, "name": name, "input": input,
            "result": result, "latency_ms": latency_ms, "ref": ctx.ref,
        }).execute()
    except Exception:
        pass  # logging must never break a run
