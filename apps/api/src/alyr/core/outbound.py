import asyncpg

from alyr.channels.base import Channel, OutboundMessage


class Outbound:
    """The only way a message leaves Alyr. Modules hand messages here; they never call a
    channel themselves. Consent, the 24-hour window and messaging limits are enforced
    here when they are built (ALY-40, ALY-41)."""

    def __init__(self, channels: dict[str, Channel]) -> None:
        self.channels = channels

    async def send(self, conn: asyncpg.Connection, message: OutboundMessage) -> None:
        """Send on the current tenant's number. `conn` must be tenant-scoped."""
        # Use the number this contact already talks to; otherwise the tenant's first number.
        row = await conn.fetchrow(
            "select n.number_id, n.channel from channel_numbers n "
            "where n.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
            "order by (n.number_id = (select number_id from contacts where phone = $1)) "
            "desc nulls last, n.channel limit 1",
            message.to_number,
        )
        if row is None:
            raise RuntimeError("tenant has no connected number")
        payload: dict = {}
        if message.choices:
            payload["choices"] = [{"id": c.id, "title": c.title} for c in message.choices]
        if message.kind == "template":
            payload["template"] = message.template_name
            payload["category"] = message.template_category
        await conn.execute(
            "insert into messages (phone, direction, kind, body, payload) "
            "values ($1, 'out', $2, $3, $4)",
            message.to_number, message.kind, message.body, payload,
        )
        await self.channels[row["channel"]].send(row["number_id"], message)
