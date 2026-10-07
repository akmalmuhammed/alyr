import asyncpg

from alyr.channels.base import Address, Channel, OutboundMessage


class Outbound:
    """The only way a message leaves Alyr. Modules hand messages here; they never call a
    channel themselves. Consent, the 24-hour window and messaging limits are enforced
    here when they are built (ALY-40, ALY-41)."""

    def __init__(self, channels: dict[str, Channel]) -> None:
        self.channels = channels

    async def send(self, conn: asyncpg.Connection, message: OutboundMessage) -> None:
        """Send to a contact on the current tenant's number. `conn` must be tenant-scoped."""
        contact = await conn.fetchrow(
            "select phone, wa_user_id, number_id from contacts where id = $1", message.to
        )
        if contact is None:
            raise LookupError("no such contact for this tenant")
        # Use the number this contact already talks to; otherwise the tenant's first number.
        number = await conn.fetchrow(
            "select number_id, channel from channel_numbers "
            "where tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
            "order by (number_id = $1) desc nulls last, channel limit 1",
            contact["number_id"],
        )
        if number is None:
            raise RuntimeError("tenant has no connected number")
        payload: dict = {}
        if message.choices:
            payload["choices"] = [{"id": c.id, "title": c.title} for c in message.choices]
        if message.kind == "template":
            payload["template"] = message.template_name
            payload["category"] = message.template_category
        await conn.execute(
            "insert into messages (contact_id, direction, kind, body, payload) "
            "values ($1, 'out', $2, $3, $4)",
            message.to, message.kind, message.body, payload,
        )
        await self.channels[number["channel"]].send(
            number["number_id"], message,
            Address(phone=contact["phone"], user_id=contact["wa_user_id"]),
        )
