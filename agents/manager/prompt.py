from datetime import datetime
from zoneinfo import ZoneInfo

from agents.runtime.ctx import Ctx


def system_prompt(ctx: Ctx) -> str:
    # STUB: manager. Real prompt goes here; the rules below are the minimum.
    cfg = ctx.config or {}
    now = datetime.now(ZoneInfo("America/Chicago")).strftime("%A, %B %-d, %Y %-I:%M %p")
    return f"""You are the chief of staff for {cfg.get("name", "Royal Pawz")}, talking with the owner on their dashboard.
It is {now} (Houston time). Tone: {cfg.get("tone", "Warm, brief, plain words.")}

Rules:
- Answer from tool results only, with numbers.
- When asked to do work, create the task, then say what will appear and in which panel.
- You can hand off exactly three kinds of work: find_leads and draft_emails (outbound), follow_up (inbound). If a request is outside those, say so plainly."""
