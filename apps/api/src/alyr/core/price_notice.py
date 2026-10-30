"""Telling an owner their price is ready (ALY-274, CJ-14).

A new client's first price is prepared by ALYR, and the workspace used to say "you can close this
page" without anything calling them back. When ALYR publishes the quote, the owner is emailed
once, in the language they signed up in, with a link to the workspace where they read and accept
it. A price that is published at sign-up (a business type whose price shows at once) is on their
screen already, and is not emailed.

The send is claimed on the quote before it goes out (`quotes.owner_notified_at`), so publishing
twice, unpublishing and publishing again, or two requests at once never send a second email.
If the provider refuses the message the claim is released and the next publish tries again.
Nothing is sent where mail is not set up or the address could not be a real person's.
"""

import logging
from uuid import UUID

from alyr.config import get_settings
from alyr.core import access, mail, pricing
from alyr.db import Database

log = logging.getLogger("alyr.price_notice")


async def send_ready(db: Database, quote_id: UUID) -> bool:
    """Email the owner that this quote is ready, unless they were already told. Answers whether
    an email went out. Call it after the publishing has been committed."""
    if not mail.configured():
        return False
    async with access.office(db) as conn:
        row = await conn.fetchrow(
            "select q.*, c.name as client_name, c.contact_name, c.contact_email, "
            "  (select t.owner_lang from tenants t where t.client_id = c.id "
            "   order by t.created_at limit 1) as lang "
            "from quotes q join clients c on c.id = q.client_id "
            "where q.id = $1 and q.status = 'published'",
            quote_id,
        )
        if row is None or not mail.deliverable(row["contact_email"]):
            return False
        claimed = await conn.fetchval(
            "update quotes set owner_notified_at = now() "
            "where id = $1 and status = 'published' and owner_notified_at is null "
            "returning true",
            quote_id,
        )
        if not claimed:
            return False
        view = await pricing.quote_view(conn, row)
    link = f"{get_settings().public_web_url.rstrip('/')}/app"
    subject, text, html = mail.price_ready_message(
        row["lang"] or "en", row["contact_name"], row["client_name"],
        view["totals"]["monthly_total"], link,
    )
    try:
        await mail.send(row["contact_email"], subject, text, html)
    except mail.MailError as error:
        log.warning("the price-ready email to a client was not sent: %s", error)
        async with access.office(db) as conn:
            await conn.execute(
                "update quotes set owner_notified_at = null where id = $1", quote_id
            )
        return False
    return True
