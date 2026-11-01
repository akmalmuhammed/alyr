import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
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


# Set by a request that must not be turned away while others queue for a connection: Meta's webhook
# (it only writes a row, and Meta would only send it again). It joins the queue whatever its
# length and waits three times as long.
patient: ContextVar[bool] = ContextVar("alyr_db_patient", default=False)
PATIENCE = 3


class PoolBusy(Exception):
    """Every database connection of this process is in use and a request cannot wait any
    longer for one. The API answers 503 with Retry-After (D-132): a spike is refused in seconds
    instead of queueing until the caller gives up."""

    def __init__(self, waited: float, waiting: int) -> None:
        super().__init__(f"no database connection free after {waited:.1f}s ({waiting} waiting)")
        self.waited, self.waiting = waited, waiting


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
        # The connection budget (D-132). The defaults are the old behaviour: ten connections, no
        # limit on the wait, no limit on a statement. `configure` sets them before `connect`.
        self._pool_max = 10
        self._acquire_timeout: float | None = None
        self._max_waiting: int | None = None
        self._server_settings: dict[str, str] = {}
        self._waiting = 0
        self.refused = 0  # requests turned away because no connection came free
        # Called after each tenant transaction commits. The app uses it to run the
        # jobs that transaction queued, when jobs run in-process.
        self.after_commit = None

    def use_single_connections(self, **connect_kwargs) -> None:
        """Switch to one connection per use, with these asyncpg.connect arguments."""
        self._connect_kwargs = connect_kwargs

    def configure(
        self, *, pool_max: int, acquire_timeout: float | None = None,
        max_waiting: int | None = None, statement_timeout_ms: int = 0,
        idle_in_transaction_ms: int = 0,
    ) -> None:
        """How many connections this process may hold, how long a caller waits for one, how
        many may wait at once, and how long PostgreSQL lets one statement (or one transaction
        sitting idle) run before it stops it. Zero means no limit."""
        self._pool_max = pool_max
        self._acquire_timeout = acquire_timeout or None
        self._max_waiting = max_waiting
        self._server_settings = {}
        if statement_timeout_ms:
            self._server_settings["statement_timeout"] = str(statement_timeout_ms)
        if idle_in_transaction_ms:
            self._server_settings["idle_in_transaction_session_timeout"] = str(
                idle_in_transaction_ms)

    async def connect(self) -> None:
        if self._connect_kwargs is None:
            self.pool = await asyncpg.create_pool(
                self._dsn, min_size=1, max_size=self._pool_max, init=_init,
                server_settings=self._server_settings or None,
            )

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    async def _acquire(self) -> asyncpg.Connection:
        """A connection from the pool, or `PoolBusy` when none comes free in time. A caller
        that would join a queue already as long as `max_waiting` is refused at once: waiting
        behind a full queue only moves the failure to later."""
        waiting = self._waiting
        patient_request = patient.get()
        if not patient_request and self._max_waiting is not None and waiting >= self._max_waiting:
            self.refused += 1
            raise PoolBusy(0.0, waiting)
        loop = asyncio.get_running_loop()
        started = loop.time()
        timeout = self._acquire_timeout
        if patient_request and timeout:
            timeout *= PATIENCE
        self._waiting += 1
        try:
            return await self.pool.acquire(timeout=timeout)
        except TimeoutError as error:
            self.refused += 1
            raise PoolBusy(loop.time() - started, self._waiting) from error
        finally:
            self._waiting -= 1

    @asynccontextmanager
    async def _connection(self) -> AsyncIterator[asyncpg.Connection]:
        if self._connect_kwargs is None:
            conn = await self._acquire()
            try:
                yield conn
            finally:
                await self.pool.release(conn)
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
