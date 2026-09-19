from pydantic import BaseModel, Field

from agents.runtime.ctx import Ctx
from agents.runtime.tools import Tool


class RememberArgs(BaseModel):
    about: str = Field(description='Key such as "customer:+17135550100", "lead:<uuid>" or "business"')
    note: str


class RecallArgs(BaseModel):
    about: str


async def remember(ctx: Ctx, args: RememberArgs) -> dict:
    ctx.db.table("shared_notes").insert({
        "about": args.about, "note": args.note, "written_by": ctx.agent,
    }).execute()
    return {"ok": True}


async def recall(ctx: Ctx, args: RecallArgs) -> dict:
    rows = (ctx.db.table("shared_notes").select("note,written_by,created_at")
            .eq("about", args.about).order("created_at", desc=True).limit(10).execute().data)
    return {"notes": rows}


SHARED_TOOLS: list[Tool] = [
    Tool("remember", "Save a short note other agents can read later.", RememberArgs, remember),
    Tool("recall", "Read the latest notes saved about a customer, lead or the business.", RecallArgs, recall),
]
