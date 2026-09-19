from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import logging
import math
import os
from typing import Any

from apify_client import ApifyClientAsync

from agents.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_ACTOR_ID = "compass/crawler-google-places"


def normalize_place(item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a place item returned from Google Places scrapers to standard schema."""
    place_id = (
        item.get("placeId")
        or item.get("place_id")
        or item.get("cid")
        or item.get("id")
        or item.get("googlePlaceId")
    )
    if not place_id:
        title_part = item.get("title") or item.get("name") or ""
        addr_part = item.get("address") or item.get("url") or ""
        unique_key = f"{title_part}:{addr_part}"
        place_id = f"gen_{hashlib.sha256(unique_key.encode('utf-8')).hexdigest()[:16]}"
    else:
        place_id = str(place_id).strip()

    name = str(item.get("title") or item.get("name") or "Unnamed Place").strip()

    address = item.get("address")
    if not address and (item.get("street") or item.get("city")):
        parts = [item.get("street"), item.get("city"), item.get("state"), item.get("postalCode")]
        address = ", ".join(str(p) for p in parts if p)
    address = str(address).strip() if address else None

    phone = item.get("phone") or item.get("phoneUnformatted") or item.get("internationalPhoneNumber")
    phone = str(phone).strip() if phone else None

    email = item.get("email")
    if not email and isinstance(item.get("emails"), list) and item.get("emails"):
        email = item["emails"][0]
    elif not email and isinstance(item.get("contactInfo"), dict):
        c_emails = item["contactInfo"].get("emails")
        if isinstance(c_emails, list) and c_emails:
            email = c_emails[0]
    email = str(email).strip().lower() if email else None

    website = item.get("website")
    if not website and item.get("url") and "google.com" not in str(item.get("url")):
        website = item.get("url")
    if website and ("google.com/maps" in str(website) or "goo.gl" in str(website)):
        alt_web = item.get("website")
        website = alt_web if alt_web and "google.com" not in str(alt_web) else None
    website = str(website).strip() if website else None

    raw_rating = item.get("totalScore") if item.get("totalScore") is not None else item.get("rating")
    if raw_rating is None:
        raw_rating = item.get("stars")
    try:
        val = float(raw_rating) if raw_rating is not None else None
        if val is not None and (math.isnan(val) or math.isinf(val) or val < 1.0 or val > 5.0):
            rating = None
        elif val is not None:
            rating = round(val, 1)
        else:
            rating = None
    except (ValueError, TypeError):
        rating = None

    category = item.get("categoryName")
    if not category and isinstance(item.get("categories"), list) and item.get("categories"):
        category = item["categories"][0]
    elif not category:
        category = item.get("category")
    category = str(category).strip() if category else "General"

    source_url = item.get("url") or item.get("placeUrl") or item.get("googleMapsUrl")
    if not source_url or "google.com" not in str(source_url):
        if place_id and not place_id.startswith("gen_"):
            source_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        else:
            source_url = ""
    source_url = str(source_url).strip()

    return {
        "place_id": place_id,
        "name": name,
        "address": address,
        "phone": phone,
        "email": email,
        "website": website,
        "rating": rating,
        "category": category,
        "source_url": source_url,
        "raw": item,
    }


async def scrape_places(term: str, area: str, limit: int = 20) -> dict[str, Any]:
    """Run real Apify actor to scrape Google places with bounded cost, time, and privacy rules."""
    token = os.environ.get("APIFY_TOKEN") or getattr(settings, "APIFY_TOKEN", "")
    if not token or not str(token).strip():
        raise ValueError("APIFY_TOKEN is required for Apify scraping. Set APIFY_TOKEN in the environment or .env.")

    token = str(token).strip()
    bounded_limit = min(max(1, int(limit)), 50)
    actor_id = getattr(settings, "APIFY_ACTOR_ID", "") or DEFAULT_ACTOR_ID

    clean_term = term.strip() if term else ""
    clean_area = area.strip() if area else ""

    # Verified compass/crawler-google-places schema fields:
    # - searchStringsArray: [clean_term]
    # - locationQuery: clean_area
    # - maxCrawledPlacesPerSearch: bounded_limit
    # - scrapeContacts: True
    # - maximumLeadsEnrichmentRecords: 0
    # - maxReviews: 0, maxImages: 0, scrapeReviewsPersonalData: False
    actor_input: dict[str, Any] = {
        "searchStringsArray": [clean_term] if clean_term else [],
        "locationQuery": clean_area,
        "maxCrawledPlacesPerSearch": bounded_limit,
        "scrapeContacts": True,
        "maximumLeadsEnrichmentRecords": 0,
        "maxReviews": 0,
        "maxImages": 0,
        "scrapeReviewsPersonalData": False,
        "language": "en",
    }

    # Client passes token via Authorization header (never in URLs)
    # max_total_charge_usd caps PPE cost per run at $0.50
    client = ApifyClientAsync(token=token)
    run = None
    try:
        run = await client.actor(actor_id).call(
            run_input=actor_input,
            max_items=bounded_limit,
            max_total_charge_usd=Decimal("0.50"),
            run_timeout=timedelta(seconds=180),
            wait_duration=timedelta(seconds=180),
        )
    except Exception as exc:
        safe_msg = str(exc).replace(token, "[REDACTED]")
        logger.error("Apify actor %s call failed: %s", actor_id, safe_msg)
        raise RuntimeError(f"Apify actor {actor_id} execution failed: {safe_msg}") from None

    if run is None:
        raise RuntimeError(f"Apify actor {actor_id} timed out without returning a run object")

    if run.status != "SUCCEEDED":
        # Abort unfinished or hung run if needed
        try:
            await client.run(run.id).abort()
        except Exception:
            pass
        raise RuntimeError(f"Apify actor {actor_id} finished with non-success status: {run.status}")

    dataset_id = run.default_dataset_id
    try:
        dataset_client = client.dataset(dataset_id)
        page = await dataset_client.list_items(limit=bounded_limit)
        raw_items = page.items if hasattr(page, "items") else list(page)
    except Exception as exc:
        safe_msg = str(exc).replace(token, "[REDACTED]")
        logger.error("Failed fetching Apify dataset %s: %s", dataset_id, safe_msg)
        raise RuntimeError(f"Failed fetching Apify dataset {dataset_id}: {safe_msg}") from None

    # Deduplicate places on place_id
    seen_ids: set[str] = set()
    places: list[dict[str, Any]] = []
    for item in raw_items:
        norm = normalize_place(item)
        pid = norm["place_id"]
        if pid not in seen_ids:
            seen_ids.add(pid)
            places.append(norm)
            if len(places) >= bounded_limit:
                break

    fetched_at = datetime.now(timezone.utc).isoformat()

    return {
        "places": places,
        "actor_id": actor_id,
        "run_id": run.id,
        "dataset_id": dataset_id,
        "fetched_at": fetched_at,
    }


async def find_leads(term: str, area: str, limit: int) -> list[dict[str, Any]]:
    """Exact signature for find_leads task.

    Normalizes results to:
    {"place_id", "name", "address", "phone", "email", "website", "rating", "raw"}.
    """
    result = await scrape_places(term=term, area=area, limit=limit)
    places = result.get("places", [])

    return [
        {
            "place_id": p["place_id"],
            "name": p["name"],
            "address": p["address"],
            "phone": p["phone"],
            "email": p["email"],
            "website": p["website"],
            "rating": p["rating"],
            "raw": p.get("raw", {}),
        }
        for p in places
    ]
