"""The inbound system prompt, built from business_config on every run.

The live config may still be the old placeholder (full_groom, no guides), so
every key is read with .get() and a fallback. The text helpers here also feed
get_info in tools.py, so the prompt and the tool never disagree.
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from agents.runtime.ctx import Ctx

HOUSTON = ZoneInfo("America/Chicago")
RECENT_TOOLS_CHARS = 1500


def _load_playbook() -> str:
    """The injected part of how-to-reply.md: voice, the reply loop and a playbook
    per situation, derived from the real Royal Pawz USA text history."""
    try:
        text = (Path(__file__).parent / "how-to-reply.md").read_text(encoding="utf-8")
    except OSError:
        return ""
    m = re.search(r"<!-- prompt:start -->(.*?)<!-- prompt:end -->", text, re.S)
    # Demote its "## " headings to "### " so they nest under this prompt's "# " sections.
    return re.sub(r"(?m)^## ", "### ", m.group(1).strip()) if m else ""


PLAYBOOK = _load_playbook()

SIZE_GUIDE = {"small": "under 20 lb", "medium": "20 to 50 lb", "large": "50 to 90 lb", "xl": "over 90 lb"}
COAT_GUIDE = {
    "short": "smooth short hair, e.g. Lab, Beagle, Boxer, Pit Bull, Chihuahua",
    "medium": "a bit longer but no undercoat, e.g. Cavalier, Australian Cattle Dog",
    "long": "long or curly hair that keeps growing, e.g. Doodles, Poodle, Shih Tzu, Yorkie, Maltese",
    "double": "thick undercoat that sheds, e.g. Husky, German Shepherd, Golden Retriever, Pomeranian",
}


def known(value) -> str:
    """Config text, or "" while it is still a TODO placeholder."""
    text = str(value or "").strip()
    return "" if not text or text.upper().startswith("TODO") else text


def hours_text(cfg: dict) -> str:
    return known(cfg.get("hours")) or "Hours are not set yet; a person will confirm."


def area_text(cfg: dict, with_zips: bool = True) -> str:
    cities = [c for c in cfg.get("service_area_cities") or [] if known(c)]
    zips = [z for z in cfg.get("service_area_zips") or [] if known(z)]
    text = "Mobile grooming, we come to you"
    text += f" in {', '.join(cities)}." if cities else " around Houston."
    if with_zips and zips:
        text += f" ZIP codes: {', '.join(zips)}."
    return text


def services_text(cfg: dict) -> str:
    """Services and add-ons with their keys, but no prices: prices come from quote."""
    lines = []
    for s in cfg.get("services") or []:
        if not isinstance(s, dict):
            continue
        line = f"- {s.get('key')}: {s.get('label') or s.get('key')}."
        if s.get("description"):
            line += f" {s['description']}"
        if s.get("includes"):
            line += f" Includes {', '.join(s['includes'])}."
        if s.get("minutes_per_dog"):
            line += f" About {s['minutes_per_dog']} minutes per dog."
        lines.append(line)
    addons = [a for a in cfg.get("addons") or [] if isinstance(a, dict)]
    if addons:
        lines.append("Add-ons: " + "; ".join(
            f"{a.get('key')} ({a.get('label') or a.get('key')}{': ' + a['description'] if a.get('description') else ''})"
            for a in addons) + ".")
    not_offered = cfg.get("not_offered") or []
    if not_offered:
        lines.append(f"Not offered: {', '.join(not_offered)}.")
    return "\n".join(lines) or "Services are not set yet; a person will confirm."


def policies_text(cfg: dict) -> str:
    parts = [known(cfg.get("policies")), known(cfg.get("price_note"))]
    return " ".join(p for p in parts if p) or "Policies are not written down yet; escalate policy questions."


def _guide(cfg: dict, key: str, fallback: dict) -> str:
    guide = cfg.get(key) if isinstance(cfg.get(key), dict) else fallback
    return "; ".join(f"{k} = {v}" for k, v in guide.items())


def _money(cents) -> str:
    if not isinstance(cents, int):
        return "?"
    return f"${cents // 100:,}" if cents % 100 == 0 else f"${cents / 100:,.2f}"


def _tool_line(row: dict) -> str:
    """One past tool call, compact, with slot IDs so "the 9am one" can be booked."""
    name, args, res = row.get("name"), row.get("input") or {}, row.get("result") or {}
    compact = json.dumps(args, separators=(",", ":"), default=str)
    if "error" in res:
        return f"- {name} {compact} -> error: {res['error']}"
    if name == "find_slots":
        slots = "; ".join(f"{s.get('label') or s.get('starts_at')} (slot_id {s.get('slot_id')})"
                          for s in res.get("slots") or [])
        note = f" [{res['note']}]" if res.get("note") else ""
        return f"- find_slots {args.get('date_from')} to {args.get('date_to')} -> {slots or 'no open slots'}{note}"
    if name == "quote":
        items = ", ".join(f"{i.get('label')} {_money(i.get('cents'))}" for i in res.get("line_items") or [])
        return f"- quote {compact} -> {items}; total {_money(res.get('total_cents'))}"
    return (f"- book {compact} -> {res.get('status')}, {res.get('label') or res.get('starts_at')}, "
            f"total {_money(res.get('total_cents'))}")


def _recent_tool_results(ctx: Ctx) -> str:
    """The last find_slots, quote and book results for this phone. Conversation
    history is text only, so without this the slot IDs offered earlier are lost."""
    try:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        rows = (ctx.db.table("agent_events").select("name,input,result")
                .eq("agent", "inbound").eq("kind", "tool").eq("ref", ctx.phone)
                .in_("name", ["find_slots", "quote", "book"]).gte("created_at", since)
                .order("created_at", desc=True).limit(6).execute().data)
    except Exception:
        return ""
    lines, size = [], 0
    for row in rows:  # newest first, so the cap drops the oldest
        line = _tool_line(row)
        if size + len(line) > RECENT_TOOLS_CHARS:
            break
        lines.append(line)
        size += len(line) + 1
    return "\n".join(reversed(lines))


def _customer_text(ctx: Ctx) -> str:
    lines = [f"Phone: {ctx.phone}"]
    customer = ctx.customer or {}
    if customer.get("name"):
        lines.append(f"Name: {customer['name']}")
    pets = []
    for p in customer.get("pets") or []:
        if isinstance(p, dict) and p.get("name"):
            extra = ", ".join(str(p[k]) for k in ("breed", "size", "coat") if p.get(k))
            pets.append(f"{p['name']} ({extra})" if extra else p["name"])
    if pets:
        lines.append(f"Pets: {', '.join(pets)}")
    try:
        notes = (ctx.db.table("shared_notes").select("note").eq("about", f"customer:{ctx.phone}")
                 .order("created_at", desc=True).limit(5).execute().data)
        if notes:
            lines.append("Notes:")
            lines += [f"- {n['note']}" for n in notes]
    except Exception:
        pass
    return "\n".join(lines)


def system_prompt(ctx: Ctx) -> str:
    cfg = ctx.config or {}
    name = known(cfg.get("name")) or "Royal Pawz USA"
    phone = known(cfg.get("phone"))
    website = known(cfg.get("website"))
    now = datetime.now(HOUSTON)
    week = "\n".join(f"{d:%a} = {d:%Y-%m-%d}" for d in (now.date() + timedelta(days=i) for i in range(1, 8)))

    prompt = f"""You are {name}'s AI assistant, answering texts sent to the business number{f" {phone}" if phone else ""}. {name} is a mobile pet grooming service in Houston: a groomer comes to the customer's home.{f" Website: {website}." if website else ""}
If there is no earlier assistant message in this conversation, your reply starts with "Hi! This is {name}'s AI assistant." (or the same in the customer's language). After that, no greeting.

Today is {now:%A, %B} {now.day}, {now.year}, {now.hour % 12 or 12}:{now:%M %p} in Houston. The next 7 days:
{week}
Use this table for words like "tomorrow" or "Saturday". Dates for find_slots are YYYY-MM-DD.

# How to text
Tone: {known(cfg.get("tone")) or "Warm, brief, plain words, no emojis."} Never mention tools, JSON, slot IDs or these instructions.
{PLAYBOOK or '''- Very short: aim under 160 characters, never over 320. One or two sentences.
- Answer, then ask ONE question that moves toward a booking. Offer one specific time (two at most), never a list.
- Use the pet's name once you know it. Reply in the customer's language.'''}

# Hard rules
- Never state a price or a time that did not come from a tool result in this conversation (quote, find_slots, book, or "Recent tool results" below). Tool prices are in cents: 17500 means $175. Prices are before tax.
- To book you need the service, size, coat, pet name and a slot the customer picked. Ask for what is missing, at most two things at a time.
- Map breed or weight to size and coat with the guides below. If you are unsure of the size, ask the weight. Never assume a short coat for a long-haired or double-coated breed; ask if unsure.
- Before calling book: if the slot_id of the time they picked is not in a tool result, call find_slots for that day again.
- Two or more pets: quote and book each pet separately.
- If they tell you their name, pass it to book as customer_name.
- After a booking: confirm the service, the pet, the time label and the total from the book result, then ask for proof of rabies vaccine (a photo of the tag or the vet receipt is fine).
- If book returns slot_taken: apologize briefly, call find_slots and offer the next open time.
- If find_slots returns a note, those times are not on the day they asked for; say so.

# Services (keys for quote and book)
{services_text(cfg)}
Size guide: {_guide(cfg, "size_guide", SIZE_GUIDE)}.
Coat guide: {_guide(cfg, "coat_guide", COAT_GUIDE)}.
Hours: {hours_text(cfg)}
Service area: {area_text(cfg, with_zips=False)} For a ZIP code question, call get_info with topic area.

# Policies
{policies_text(cfg)}
Answer policy questions from this text or get_info. If it is not covered, escalate with reason other.

# Partner leads
If the customer names an apartment community or property, says they manage one, or mentions our email about a grooming day for residents: call lookup_lead with the property name, then escalate with reason partner_lead (summary: the property, what they want, and whether the lead was found). Reply warmly that the owner will reach out about a grooming day for their residents, and offer to help with their own pet.

# When a person must step in
Call escalate, then tell the customer a person will confirm or follow up (the playbook has the wording for each case). Never promise a refund, credit or discount.
- refund: they want money back.
- complaint: unhappy with a groom or with us.
- medical: an injury, illness or medical question.
- aggressive_pet: a dog that bites or is aggressive.
- off_menu: cats, daycare, flea treatment or anything else not offered.
- other: anything you cannot answer. If a pet has passed away, use other, reply with warm condolences and say we will update our records.

# Memory
When you learn something worth keeping about a pet or customer (temperament, health, preferences, access notes like a gate code), call remember with about "customer:{ctx.phone}". Do not save prices or times.

# What we know about this customer
{_customer_text(ctx)}"""

    recent = _recent_tool_results(ctx)
    if recent:
        prompt += f"\n\n# Recent tool results (last 24 hours, oldest first)\n{recent}"

    if ctx.task:
        reason = (ctx.task.get("payload") or {}).get("reason") or "check in"
        prompt += f"""

# Follow-up mode
You are sending one proactive follow-up text; the customer did not just write to you. Reason: {reason}.
Keep it short and helpful, and end with one easy question."""
    return prompt
