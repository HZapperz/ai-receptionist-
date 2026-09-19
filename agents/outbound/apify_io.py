import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import ipaddress
import logging
import math
import os
import socket
from typing import Any
from urllib.parse import urlparse

from apify_client import ApifyClientAsync

from agents.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_ACTOR_ID = "compass/crawler-google-places"
WEBSITE_CRAWLER_ACTOR_ID = "apify/website-content-crawler"

ALLOWED_ACTORS: set[str] = {
    "compass/crawler-google-places",
    "apify/website-content-crawler",
}

BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal", "instance-data"}


def is_safe_public_url(url: str) -> bool:
    """Validate that a URL is a public, routable http/https URL and does not target private or local networks (SSRF defense)."""
    if not url or not isinstance(url, str):
        return False
    trimmed = url.strip()
    if not trimmed:
        return False
    try:
        parsed = urlparse(trimmed)
    except Exception:
        return False

    if parsed.scheme not in ("http", "https"):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    hostname = hostname.lower().strip(".")
    if not hostname:
        return False

    if hostname in BLOCKED_HOSTNAMES or hostname.endswith((".local", ".localhost", ".internal", ".arpa", ".lan")):
        return False

    try:
        ip = ipaddress.ip_address(hostname)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
        return True
    except ValueError:
        pass

    try:
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        return True
    except (socket.gaierror, socket.error, ValueError):
        return False
async def is_safe_public_url_async(url: str) -> bool:
    """Validate URL in thread pool so synchronous DNS lookups do not block the asyncio event loop."""
    return await asyncio.to_thread(is_safe_public_url, url)


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
    if actor_id not in ALLOWED_ACTORS:
        raise ValueError(f"Apify actor '{actor_id}' is not in allowlist {sorted(ALLOWED_ACTORS)}")

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
async def crawl_business_websites(urls: list[str], max_pages_per_site: int = 2) -> dict[str, Any]:
    """Crawl supporting public business website content for extra evidence using allowlisted Apify actor.

    Returns dict:
    {
        "pages": dict[url, cleaned_text],
        "sources": {"actor_id", "run_id", "dataset_id", "fetched_at"},
        "error": str | None,
        "limitations": list[str],
    }
    """
    token = os.environ.get("APIFY_TOKEN") or getattr(settings, "APIFY_TOKEN", "")
    if not token or not str(token).strip():
        logger.warning("APIFY_TOKEN missing; skipping supporting website crawl")
        return {"pages": {}, "sources": {}, "error": "APIFY_TOKEN missing", "limitations": ["Website content crawl skipped because APIFY_TOKEN is missing"]}

    safe_urls = []
    for u in urls:
        if await is_safe_public_url_async(u):
            safe_urls.append(u)

    if not safe_urls:
        return {"pages": {}, "sources": {}, "error": None, "limitations": []}

    safe_urls = safe_urls[:3]
    actor_id = WEBSITE_CRAWLER_ACTOR_ID
    if actor_id not in ALLOWED_ACTORS:
        raise ValueError(f"Apify actor '{actor_id}' is not in allowlist {sorted(ALLOWED_ACTORS)}")

    total_max_pages = max(1, min(len(safe_urls) * max_pages_per_site, 6))
    include_globs = []
    for u in safe_urls:
        parsed_host = (urlparse(u).hostname or "").lower()
        if parsed_host:
            dom = parsed_host.removeprefix("www.")
            if dom:
                include_globs.extend([
                    {"glob": f"http://{dom}/**"},
                    {"glob": f"https://{dom}/**"},
                    {"glob": f"http://www.{dom}/**"},
                    {"glob": f"https://www.{dom}/**"},
                ])

    actor_input: dict[str, Any] = {
        "startUrls": [{"url": u} for u in safe_urls],
        "maxCrawlPages": total_max_pages,
        "maxCrawlDepth": 1,
        "crawlerType": "cheerio",
        "saveMarkdown": True,
        "saveFiles": False,
        "includeGlobs": include_globs,
        "excludeGlobs": [
            {"glob": "https://{facebook.com,twitter.com,x.com,instagram.com,linkedin.com,youtube.com,tiktok.com}/**"}
        ],
    }

    client = ApifyClientAsync(token=token.strip())
    run = None
    try:
        run = await client.actor(actor_id).call(
            run_input=actor_input,
            max_items=total_max_pages,
            max_total_charge_usd=Decimal("0.50"),
            run_timeout=timedelta(seconds=60),
            wait_duration=timedelta(seconds=60),
        )
    except Exception as exc:
        safe_msg = str(exc).replace(token, "[REDACTED]")
        logger.warning("Supporting website crawl failed for %s: %s", actor_id, safe_msg)
        return {
            "pages": {},
            "sources": {"actor_id": actor_id, "run_id": "", "dataset_id": "", "fetched_at": ""},
            "error": safe_msg,
            "limitations": [f"Supporting website crawl failed for {actor_id}: {safe_msg}"],
        }

    if run is None or run.status != "SUCCEEDED":
        status_str = getattr(run, "status", "TIMED_OUT")
        if run and hasattr(run, "id"):
            try:
                await client.run(run.id).abort()
            except Exception:
                pass
        logger.warning("Supporting website crawl %s finished with non-success status %s", actor_id, status_str)
        return {
            "pages": {},
            "sources": {
                "actor_id": actor_id,
                "run_id": getattr(run, "id", ""),
                "dataset_id": getattr(run, "default_dataset_id", ""),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            "error": f"Status {status_str}",
            "limitations": [f"Supporting website crawl finished with non-success status '{status_str}'"],
        }

    results: dict[str, str] = {}
    dataset_id = run.default_dataset_id
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        dataset_client = client.dataset(dataset_id)
        page = await dataset_client.list_items(limit=total_max_pages)
        items = page.items if hasattr(page, "items") else list(page)
        for item in items:
            crawl_obj = item.get("crawl") if isinstance(item.get("crawl"), dict) else {}
            item_url = item.get("url") or item.get("loadedUrl") or crawl_obj.get("loadedUrl") or ""
            text_content = item.get("markdown") or item.get("text") or ""
            if item_url and text_content and is_safe_public_url(item_url):
                clean_text = " ".join(text_content.split())[:1500]
                results[item_url] = clean_text
    except Exception as exc:
        safe_msg = str(exc).replace(token, "[REDACTED]")
        logger.warning("Failed extracting dataset items for website crawl: %s", safe_msg)
        return {
            "pages": results,
            "sources": {"actor_id": actor_id, "run_id": run.id, "dataset_id": dataset_id, "fetched_at": fetched_at},
            "error": safe_msg,
            "limitations": [f"Failed reading website crawler dataset: {safe_msg}"],
        }

    limitations = []
    if not results:
        limitations.append("Website content crawler completed but found no extractable public content from candidate sites.")

    return {
        "pages": results,
        "sources": {"actor_id": actor_id, "run_id": run.id, "dataset_id": dataset_id, "fetched_at": fetched_at},
        "error": None,
        "limitations": limitations,
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
