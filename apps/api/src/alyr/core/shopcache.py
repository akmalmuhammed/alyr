"""A shop found by its address, and a signed-in person, remembered for a few seconds (D-132).

Every page a customer opens (the order page, a booking page, a document, tracking) is asked for
by the shop's address. Finding the shop and checking that its module is on took two database
connections before the page's own: three for one visit, and three connections are most of the work
of a cheap page. A shop's address and the modules it has on change
rarely and by a person's hand, so they are kept for `seconds` (3 by default in production, off on
a developer machine). An address that is not a shop is not kept: a stream of made-up addresses
cannot fill it.

The same goes for who a session cookie belongs to and which modules a shop has on, which every
signed-in request used to look up with a database connection of its own before the route took
its own: three connections for one request, with four to a process. They change rarely and by a
person's hand. A session that is signed out here is forgotten at once; one ended or changed
elsewhere (another instance, a person removed from the team) stops working within `seconds`.
"""

import hashlib
import time
from collections import OrderedDict
from collections.abc import Callable
from uuid import UUID

import asyncpg

from alyr.core import auth
from alyr.core.auth import Staff
from alyr.db import Database

MAX_SHOPS = 500
MAX_SESSIONS = 2000


class ShopCache:
    def __init__(self, seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.seconds = seconds
        self._clock = clock
        self._shops: OrderedDict[str, tuple[float, asyncpg.Record, frozenset[str]]] = OrderedDict()
        self._by_id: dict[UUID, tuple[float, frozenset[str]]] = {}

    async def find(self, db: Database, slug: str) -> tuple[asyncpg.Record | None, frozenset[str]]:
        """The shop with this address and the modules it has on; (None, empty) if there is none."""
        now = self._clock()
        found = self._shops.get(slug)
        if found is not None and found[0] > now:
            return found[1], found[2]
        async with db.unscoped() as conn:
            shop = await conn.fetchrow(
                "select id, name, name_ar, slug, timezone from tenants where slug = $1", slug
            )
        if shop is None:
            return None, frozenset()
        async with db.tenant(shop["id"], readonly=True) as conn:
            modules = frozenset(
                r["module_key"] for r in await conn.fetch(
                    "select module_key from tenant_modules where enabled")
            )
        if self.seconds > 0:
            self._shops[slug] = (now + self.seconds, shop, modules)
            self._shops.move_to_end(slug)
            while len(self._shops) > MAX_SHOPS:
                self._shops.popitem(last=False)
        return shop, modules

    def forget(self, slug: str | None = None) -> None:
        """Drop one shop (or all), after a change to its address or its modules."""
        if slug is None:
            self._shops.clear()
        else:
            self._shops.pop(slug, None)

    def forget_tenant(self, tenant_id: UUID) -> None:
        """Drop what is known of one shop by its ID: a person here just changed something."""
        self._by_id.pop(tenant_id, None)
        for slug in [s for s, found in self._shops.items() if found[1]["id"] == tenant_id]:
            del self._shops[slug]

    async def modules_of(self, db: Database, tenant_id: UUID) -> frozenset[str]:
        """The modules this shop has on, for a signed-in request (the shop is known)."""
        now = self._clock()
        found = self._by_id.get(tenant_id)
        if found is not None and found[0] > now:
            return found[1]
        async with db.tenant(tenant_id, readonly=True) as conn:
            modules = frozenset(
                r["module_key"] for r in await conn.fetch(
                    "select module_key from tenant_modules where enabled")
            )
        if self.seconds > 0:
            self._by_id[tenant_id] = (now + self.seconds, modules)
            while len(self._by_id) > MAX_SHOPS:
                self._by_id.pop(next(iter(self._by_id)))
        return modules


class SessionCache:
    """Who a session cookie belongs to. Only a person who was found is kept: a made-up cookie
    costs a lookup each time and fills nothing."""

    def __init__(self, seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.seconds = seconds
        self._clock = clock
        self._people: OrderedDict[str, tuple[float, Staff]] = OrderedDict()

    async def resolve(self, db: Database, token: str) -> Staff | None:
        key = hashlib.sha256(token.encode()).hexdigest()
        now = self._clock()
        found = self._people.get(key)
        if found is not None and found[0] > now:
            return found[1]
        staff = await auth.resolve(db, token)
        if staff is not None and self.seconds > 0:
            self._people[key] = (now + self.seconds, staff)
            self._people.move_to_end(key)
            while len(self._people) > MAX_SESSIONS:
                self._people.popitem(last=False)
        return staff

    def forget(self, token: str) -> None:
        """A session signed out through this process stops working at once."""
        self._people.pop(hashlib.sha256(token.encode()).hexdigest(), None)
