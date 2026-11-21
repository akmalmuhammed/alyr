"""Whether Meta has approved a template on the account a customer is written to (T6 of the first
client's audit, D-194).

A message ALYR starts outside the customer's 24-hour window can only go as a template Meta has
approved on that WhatsApp Business Account. Without this check the message was queued, tried six
times in about two and a half minutes, and then marked failed: the reminder had been stamped as
sent and the review request had used up the customer's 30 days long before anyone could see it
had not gone. Now `Outbound.send` asks here first and records the message as blocked, with
`template_not_approved`, so the "Not sent" screen names the reason on the day it happens.

What counts as known (`whatsapp_templates`, spec 061: what Meta said, per business):

* a row for this template in this language: it is sent only when it is `approved`;
* no row, but the account's templates have been read from Meta in full (any row carries
  `synced_at`): Meta has no such template on the account, so it cannot go;
* no row and no full read yet, or a number that is the simulator's or has no account ID saved:
  nothing is known, and the message goes as it did before. Refusing on a guess would stop every
  message of a shop whose templates nobody has read yet.

A function here takes a connection scoped to the business.
"""

import asyncpg

REASON = "template_not_approved"


async def refusal(
    conn: asyncpg.Connection, number_id: str | None, name: str, language: str
) -> str | None:
    """`template_not_approved` when this template is known not to be sendable on the account of
    the number the customer talks to (or the business's first number), else None."""
    line = await conn.fetchrow(
        "select channel, waba_id from channel_numbers "
        "where tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid "
        "order by (number_id = $1) desc nulls last, channel limit 1",
        number_id,
    )
    if line is None or line["channel"] != "meta" or not line["waba_id"]:
        return None
    standing = await conn.fetchrow(
        "select (select status from whatsapp_templates where waba_id = $1 and name = $2 "
        "        and language = $3) as status, "
        "       exists (select 1 from whatsapp_templates where waba_id = $1 "
        "               and synced_at is not null) as read_in_full",
        line["waba_id"], name, language,
    )
    if standing["status"] is not None:
        return None if standing["status"] == "approved" else REASON
    return REASON if standing["read_in_full"] else None
