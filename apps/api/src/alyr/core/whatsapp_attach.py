"""Attaching a business's Meta number from the back office (ALY-166, spec 023).

ALYR staff add a business's number to ALYR's own WhatsApp account in Meta (the "new number"
way, D-050), then attach it here. The number is asked of Meta first: if Meta does not know
it, or it is not connected, nothing is written. The row in `channel_numbers` is what the
inbound path, the outbound layer and the go-live check already read, so nothing else changes.

One token serves every number on ALYR's account (`Settings.meta_access_token`). A business
with its own account, and so its own token, comes with Embedded Signup (ALY-39).

Every function takes a connection with the back office declared (`app.platform_admin`).
"""

import re

import asyncpg
import httpx

from alyr.channels.meta import MetaChannel

NUMBER_ID = re.compile(r"[0-9]{5,20}")
WABA_ID = re.compile(r"([0-9]{5,20})?")


class AttachError(Exception):
    """A number that cannot be attached; the message is safe to show to staff."""


async def attach(
    conn: asyncpg.Connection, channel: MetaChannel, tenant_id, number_id: str, waba_id: str,
    by: str,
) -> dict:
    number_id, waba_id = number_id.strip(), waba_id.strip()
    if not NUMBER_ID.fullmatch(number_id):
        raise AttachError("The number ID is the long number Meta shows as Phone number ID.")
    if not WABA_ID.fullmatch(waba_id):
        raise AttachError("The account ID is the long number Meta shows as WhatsApp Business "
                          "Account ID.")
    try:
        info = await channel.number_info(number_id)
    except httpx.HTTPStatusError as error:
        raise AttachError(f"Meta does not accept that number ID ({_why(error)}).") from error
    except httpx.HTTPError as error:
        raise AttachError("Meta did not answer. Try again in a minute.") from error
    status = info.get("status", "")
    if status != "CONNECTED":
        raise AttachError(
            f"Meta shows this number as {status or 'not connected'}. Finish registering it in "
            "WhatsApp Manager first."
        )
    shown = info.get("display_phone_number", "")
    try:
        await conn.execute(
            "select admin_attach_whatsapp_number($1, $2, $3, $4, $5)",
            tenant_id, number_id, waba_id, shown, by,
        )
    except asyncpg.UniqueViolationError as error:
        raise AttachError(error.message) from error
    return {"number_id": number_id, "waba_id": waba_id, "display_phone": shown,
            "verified_name": info.get("verified_name", "")}


async def detach(conn: asyncpg.Connection, tenant_id) -> str | None:
    """Take the business's Meta number off. Its messages stop reaching it and nothing is sent
    from the number; the private test line stays. Returns the number ID that was removed."""
    return await conn.fetchval("select admin_detach_whatsapp_number($1)", tenant_id)


def _why(error: httpx.HTTPStatusError) -> str:
    try:
        return str(error.response.json()["error"]["message"])[:200]
    except (ValueError, KeyError, TypeError):
        return f"error {error.response.status_code}"
