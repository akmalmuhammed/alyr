"""Limits on the doors anyone can knock on: sign-in codes, sign-up, orders and bookings from a
customer page (ALY-116).

A request is counted in `rate_hits` before it is served, by a hash of what is being counted (an
address, an email), and refused with 429 and a Retry-After once the count in the window is over
the limit. A refused request is not counted again, so a visitor who stops is let back in when the
window passes. The count is kept in PostgreSQL so it holds across restarts and across servers.

Cloudflare rules in front of the site are the first layer (docs/runbooks); this is the second,
because it knows an email and a business and Cloudflare does not.
"""

import hashlib
import logging
from dataclasses import dataclass

from fastapi import HTTPException, Request

from alyr.config import Settings, get_settings
from alyr.db import Database

log = logging.getLogger("alyr.ratelimit")

HOUR = 3600
TEN_MINUTES = 600


@dataclass(frozen=True)
class Limit:
    """At most `count` requests in `seconds`."""

    count: int
    seconds: int


# Sign-in and sign-up codes asked for from one address; unknown emails count like known ones.
CODES_PER_ADDRESS = Limit(20, HOUR)
# Codes asked for one email, whether or not it has an account.
CODES_PER_EMAIL = Limit(5, HOUR)
# Code guesses from one address (each code also allows five guesses on its own).
GUESSES_PER_ADDRESS = Limit(30, HOUR)
# New businesses created from one address.
SIGNUPS_PER_ADDRESS = Limit(10, HOUR)
# Orders and bookings placed from one address on customers' pages.
PLACED_PER_ADDRESS = Limit(30, TEN_MINUTES)


class TooManyRequests(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("too many requests")
        self.retry_after = retry_after


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def client_address(request: Request, settings: Settings | None = None) -> str:
    """The visitor's address. Only a header the settings name is read, and from the right of a
    list header, so a visitor cannot choose the answer by writing one themselves."""
    settings = settings or get_settings()
    header = settings.client_ip_header.strip().lower()
    if header:
        parts = [p.strip() for p in request.headers.get(header, "").split(",") if p.strip()]
        if parts:
            return parts[max(len(parts) - max(settings.client_ip_proxies, 1), 0)]
    return request.client.host if request.client else "unknown"


def address_limits_on(settings: Settings | None = None) -> bool:
    """Whether the per-address limits are counted. Behind our own proxies every visitor can look
    like one address (the web app's server, a Worker), and then twenty sign-in codes in an hour
    would be the whole country's allowance. So outside a developer machine they count only once
    `ALYR_CLIENT_IP_HEADER` says where the real address is read from. The per-email limits do
    not depend on it and are always on."""
    settings = settings or get_settings()
    return settings.env == "local" or bool(settings.client_ip_header.strip())


async def hit(db: Database, bucket: str, subject: str, limit: Limit) -> None:
    """Count one request. Raises TooManyRequests when `subject` is over `limit` in this bucket."""
    key = _digest(subject)
    async with db.unscoped() as conn, conn.transaction():
        seen, oldest = await conn.fetchrow(
            "select count(*), min(at) from rate_hits "
            "where bucket = $1 and key = $2 and at > now() - make_interval(secs => $3)",
            bucket, key, float(limit.seconds),
        )
        if seen >= limit.count:
            wait = await conn.fetchval(
                "select ceil(extract(epoch from $1::timestamptz "
                "+ make_interval(secs => $2) - now()))::int",
                oldest, float(limit.seconds),
            )
            raise TooManyRequests(max(int(wait), 1))
        await conn.execute(
            "insert into rate_hits (bucket, key) values ($1, $2)", bucket, key
        )
        await conn.execute("delete from rate_hits where at < now() - interval '1 day'")


def refuse(error: TooManyRequests) -> HTTPException:
    return HTTPException(
        status_code=429, detail="too many requests; try again later",
        headers={"Retry-After": str(error.retry_after)},
    )


async def check(request: Request, bucket: str, limit: Limit, subject: str | None = None) -> None:
    """Count this request against `limit` for the visitor's address (or `subject`) and answer
    429 with Retry-After when it is over."""
    if subject is None:
        if not address_limits_on():
            return
        who = client_address(request)
    else:
        who = subject
    try:
        await hit(request.app.state.db, bucket, who, limit)
    except TooManyRequests as error:
        log.warning("rate limit: %s", bucket)
        raise refuse(error) from error


def per_address(bucket: str, limit_name: str):
    """A route dependency: `dependencies=[Depends(per_address("order", "PLACED_PER_ADDRESS"))]`.
    The limit is looked up by name when a request arrives, so a test can lift it for itself."""

    async def dependency(request: Request) -> None:
        await check(request, bucket, globals()[limit_name])

    return dependency
