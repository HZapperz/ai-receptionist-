from agents.settings import settings


async def find_leads(term: str, area: str, limit: int) -> list[dict]:
    # STUB: outbound. Run settings.APIFY_ACTOR_ID with apify-client (check the
    # actor's input schema on its Apify page first) and normalize each place to
    # {"place_id", "name", "address", "phone", "email", "website", "rating", "raw"}.
    _ = settings.APIFY_TOKEN
    return []
