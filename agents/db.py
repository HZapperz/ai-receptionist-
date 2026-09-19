# Shared area: announce in the team chat before editing (see CLAUDE.md).
import logging
from functools import lru_cache

import httpx
from supabase import Client, create_client

from agents.settings import settings

logger = logging.getLogger(__name__)

# postgrest hardcodes http2=True on its pooled httpx client. Supabase closes idle HTTP/2
# connections, httpx does not reconnect by itself, and the next call fails with
# RemoteProtocolError("Server disconnected"), which a route turns into a 500. postgrest's
# own retry only looks at Cloudflare status codes, so a transport error never reaches it.
_DROPPED = (httpx.RemoteProtocolError, httpx.ReadError)
# These fail before the server sees anything, so they are safe to retry on any method.
_NOT_SENT = (httpx.ConnectError, httpx.ConnectTimeout, httpx.WriteError)
_IDEMPOTENT = {"GET", "HEAD", "OPTIONS"}


def _retry_dropped_connection(client: Client) -> Client:
    """Stop pooled connections going stale, and retry the ones that still do.

    The real fix is dropping to HTTP/1.1: httpx can tell a closed HTTP/1.1 socket is dead
    before it reuses it, which it cannot do for an HTTP/2 connection the server has already
    gone away on. That is what turned an inbound text into a 500. The short keepalive
    retires idle connections before Supabase does.

    The retry is then only a backstop, and a read that dies mid-flight is replayed only for
    GET/HEAD: an insert could have been applied before the connection dropped, and
    replaying it would duplicate the row.
    """
    old = client.postgrest.session
    client.postgrest.session = httpx.Client(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        follow_redirects=True,
        http2=False,
        limits=httpx.Limits(max_keepalive_connections=10, keepalive_expiry=15.0),
    )
    session = client.postgrest.session
    send = session.request

    def request(method, *args, **kwargs):
        try:
            return send(method, *args, **kwargs)
        except _NOT_SENT as exc:
            logger.warning("Supabase connection failed (%s); retrying %s", exc, method)
            return send(method, *args, **kwargs)
        except _DROPPED as exc:
            if str(method).upper() not in _IDEMPOTENT:
                raise
            logger.warning("Supabase dropped an idle connection (%s); retrying %s", exc, method)
            return send(method, *args, **kwargs)

    session.request = request
    return client


@lru_cache
def get_db() -> Client:
    """Service-role client. Fail closed rather than lose queued work on dyno restart."""
    key = settings.effective_service_role_key()
    if not settings.SUPABASE_URL or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY)")
    return _retry_dropped_connection(create_client(settings.SUPABASE_URL, key))


def load_config(db) -> dict:
    rows = db.table("business_config").select("data").eq("id", 1).limit(1).execute().data
    return rows[0]["data"] if rows else {}
