import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import asyncpg


async def _init(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


class Database:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self.pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=10, init=_init)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def tenant(self, tenant_id: UUID | str) -> AsyncIterator[asyncpg.Connection]:
        """One transaction scoped to one tenant. RLS hides every other tenant's rows."""
        async with self.pool.acquire() as conn, conn.transaction():
            await conn.execute("select set_config('app.tenant_id', $1, true)", str(tenant_id))
            yield conn

    @asynccontextmanager
    async def unscoped(self) -> AsyncIterator[asyncpg.Connection]:
        """No tenant set: only the global tables (tenants, channel_numbers) return rows."""
        async with self.pool.acquire() as conn:
            yield conn
