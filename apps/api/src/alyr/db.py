from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg

from alyr.modules.items import qty


async def _init(conn: asyncpg.Connection) -> None:
    import json

    # A quantity may be a Decimal; it is a JSON number in a jsonb value (qty.dumps).
    await conn.set_type_codec(
        "jsonb", encoder=qty.dumps, decoder=json.loads, schema="pg_catalog"
    )
    # Every numeric is read as an int when it is whole and a Decimal otherwise, so a stock of 3
    # is the Python 3 it was when stock was an integer (ALY-149, qty.py).
    await conn.set_type_codec(
        "numeric", encoder=qty.encode_numeric, decoder=qty.decode_numeric,
        schema="pg_catalog", format="text",
    )


class Database:
    """Access to PostgreSQL, always through `tenant()` or `unscoped()`.

    Two ways of connecting:
    - a pool held for the life of the process (a normal server), or
    - one connection per use (`connect_kwargs`), for serverless runtimes such as
      Cloudflare Workers where a connection cannot outlive the request and an outside
      pooler (Hyperdrive) does the pooling.
    """

    def __init__(self, dsn: str = "", connect_kwargs: dict | None = None) -> None:
        self._dsn = dsn
        self._connect_kwargs = connect_kwargs
        self.pool: asyncpg.Pool | None = None
        # Called after each tenant transaction commits. The app uses it to run the
        # jobs that transaction queued, when jobs run in-process.
        self.after_commit = None

    def use_single_connections(self, **connect_kwargs) -> None:
        """Switch to one connection per use, with these asyncpg.connect arguments."""
        self._connect_kwargs = connect_kwargs

    async def connect(self) -> None:
        if self._connect_kwargs is None:
            self.pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=10, init=_init)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def _connection(self) -> AsyncIterator[asyncpg.Connection]:
        if self._connect_kwargs is None:
            async with self.pool.acquire() as conn:
                yield conn
            return
        conn = await asyncpg.connect(**self._connect_kwargs)
        try:
            await _init(conn)
            yield conn
        finally:
            await conn.close()

    @asynccontextmanager
    async def tenant(
        self, tenant_id: UUID | str, readonly: bool = False
    ) -> AsyncIterator[asyncpg.Connection]:
        """One transaction scoped to one tenant. RLS hides every other tenant's rows.

        The tenant is set with a transaction-local setting, so it cannot leak to the
        next user of a pooled connection. `readonly` makes PostgreSQL refuse any write: what
        a customer's page reads must never write (ALY-275), and a write that crept in fails
        its tests instead of slowing every page.
        """
        async with self._connection() as conn, conn.transaction(readonly=readonly):
            await conn.execute("select set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn
        # Only reached when the transaction committed; an exception skips it. A read-only one
        # queued nothing.
        if self.after_commit is not None and not readonly:
            await self.after_commit()

    @asynccontextmanager
    async def unscoped(self) -> AsyncIterator[asyncpg.Connection]:
        """No tenant set: only the global tables (tenants, channel_numbers) return rows."""
        async with self._connection() as conn:
            yield conn
