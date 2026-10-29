"""The customer's link to their order's tracking page (SEC-8, D-080).

Every message about an order inside the 24-hour window ends with it, and the order page's answer
to a placed order carries it. It is signed for the tracking page and that order only, and runs
out (`core/links.py`); a later message about the order carries a fresh one.

Needs a tenant-scoped connection.
"""

from uuid import UUID

import asyncpg

from alyr.core import links


async def url(conn: asyncpg.Connection, web_url: str, order_id: UUID) -> str:
    shop = await conn.fetchrow(
        "select id, slug from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return links.track_url(web_url, shop["slug"], shop["id"], order_id)
