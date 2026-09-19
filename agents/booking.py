# Shared area: announce in the team chat before editing (see CLAUDE.md).
# The inbound lane is the main caller: quote() and book() in agents/inbound/tools.py.
import uuid


def quote(config: dict, args) -> dict:
    """Price a groom from business_config alone. Never trust a total from the model."""
    services = {s.get("key"): s for s in config.get("services") or [] if isinstance(s, dict)}
    service = services.get(args.service)
    if not service:
        return {"error": f"unknown service '{args.service}'; choose one of: {', '.join(services)}"}
    base = (service.get("base_cents") or {}).get(args.size)
    if base is None:
        return {"error": f"no price for size '{args.size}' on {args.service}"}
    items = [{"label": f"{service.get('label') or args.service} ({args.size})", "cents": int(base)}]

    coat = int((config.get("coat_surcharge_cents") or {}).get(args.coat) or 0)
    if coat > 0:
        items.append({"label": f"{args.coat.capitalize()} coat", "cents": coat})

    addons = {a.get("key"): a for a in config.get("addons") or [] if isinstance(a, dict)}
    for key in dict.fromkeys(args.addons):  # dedupe, keep order
        addon = addons.get(key)
        if not addon:
            return {"error": f"unknown add-on '{key}'; choose one of: {', '.join(addons) or 'none'}"}
        items.append({"label": addon.get("label") or key, "cents": int(addon.get("cents") or 0)})
    return {"line_items": items, "total_cents": sum(i["cents"] for i in items)}


def _is_uuid(value) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def take_slot(db, slot_id: str) -> bool:
    """Atomic: the take_slot() SQL function only takes a slot that has room."""
    if not _is_uuid(slot_id):
        return False
    return bool(db.rpc("take_slot", {"p_slot": slot_id}).execute().data)


def release_slot(db, slot_id: str) -> None:
    """Undo a take_slot() when the booking insert fails after it."""
    rows = db.table("slots").select("booked").eq("id", slot_id).limit(1).execute().data
    if rows and rows[0]["booked"] > 0:
        db.table("slots").update({"booked": rows[0]["booked"] - 1}).eq("id", slot_id).execute()


def find_booking(db, phone: str, slot_id: str, pet_name: str) -> dict | None:
    """The confirmed booking for this phone, slot and pet, if the model already made it."""
    if not _is_uuid(slot_id):
        return None
    rows = (db.table("bookings").select("*").eq("phone", phone).eq("slot_id", slot_id)
            .eq("status", "confirmed").execute().data)
    return next((r for r in rows if (r.get("pet_name") or "").lower() == pet_name.lower()), None)


def create_booking(db, *, phone: str, service: str, pet_name: str, details: dict,
                   slot_id: str, total_cents: int, customer_name: str | None = None) -> dict:
    """Upsert the customer (name, and the pet in pets), then insert a confirmed
    booking. The caller has already priced it with quote() and taken the slot.
    A repeated call for the same phone, slot and pet returns the first booking."""
    existing = find_booking(db, phone, slot_id, pet_name)
    if existing:
        return existing

    rows = db.table("customers").select("pets").eq("phone", phone).limit(1).execute().data
    pets = list((rows[0].get("pets") if rows else None) or [])
    if not any(isinstance(p, dict) and (p.get("name") or "").lower() == pet_name.lower() for p in pets):
        pets.append({"name": pet_name, **{k: details[k] for k in ("size", "coat") if details.get(k)}})
    customer = {"phone": phone, "pets": pets}
    if customer_name:
        customer["name"] = customer_name
    db.table("customers").upsert(customer, on_conflict="phone").execute()

    return db.table("bookings").insert({
        "phone": phone, "service": service, "pet_name": pet_name, "details": details,
        "slot_id": slot_id, "total_cents": total_cents, "status": "confirmed",
    }).execute().data[0]
