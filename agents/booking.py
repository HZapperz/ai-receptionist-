# Shared area: announce in the team chat before editing (see CLAUDE.md).
# The inbound lane is the main caller: quote() and book() in agents/inbound/tools.py.


def quote(config: dict, args) -> dict:
    # STUB: shared. Real version: base_cents[size] for args.service, plus
    # coat_surcharge_cents[coat], plus each addon's cents, all from config.
    return {"line_items": [{"label": "Full groom (medium)", "cents": 10500}], "total_cents": 10500}


def take_slot(db, slot_id: str) -> bool:
    # STUB: shared. Calls the atomic take_slot() function from 0001_init.sql.
    return bool(db.rpc("take_slot", {"p_slot": slot_id}).execute().data)


def create_booking(db, *, phone: str, service: str, pet_name: str, details: dict,
                   slot_id: str, total_cents: int) -> dict:
    # STUB: shared. Real version: upsert the customer, recompute the price with
    # quote(), take_slot(), then insert. Never trust a total from the model.
    row = db.table("bookings").insert({
        "phone": phone, "service": service, "pet_name": pet_name, "details": details,
        "slot_id": slot_id, "total_cents": total_cents, "status": "confirmed",
    }).execute().data[0]
    return row
