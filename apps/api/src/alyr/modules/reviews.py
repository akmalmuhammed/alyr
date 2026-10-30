"""The review request (ALY-27, D-084, spec 033).

When a booking is marked "came" or an order is marked done (collected or delivered), the
customer gets one WhatsApp message in their language: thanks for that visit or order, and the
shop's review link. Only for a shop that has turned it on and given its link; at most one per
customer every 30 days; through the outbound layer, which checks consent and stop and uses the
`review_request` template outside the 24-hour window.

**No review gating.** Everyone is asked the same way. ALYR never asks first whether the
customer was happy and sends only the happy ones to the review site: Google's policy forbids
selectively asking for positive reviews. Anyone can reply in the chat, and the owner reads the
reply in the inbox.
"""

from datetime import timedelta
from uuid import UUID

import asyncpg

from alyr.core import identity, team, templates
from alyr.core.outbound import Outbound

EVERY = timedelta(days=30)


async def settings(conn: asyncpg.Connection) -> dict:
    row = await conn.fetchrow("select review_requests, review_link from shop_settings")
    return {"on": bool(row and row["review_requests"]), "link": row["review_link"] if row else ""}


def _what(subject: str, number: int | None, day: str, arabic: bool) -> str:
    """What the thanks is for: "your visit on 30/10", "order 1001"."""
    if subject == "order":
        return f"طلبك رقم {number}" if arabic else f"order {number}"
    return f"زيارتك يوم {day}" if arabic else f"your visit on {day}"


async def after_visit(
    conn: asyncpg.Connection, outbound: Outbound, subject: str, subject_id: UUID,
    contact_id: UUID,
) -> str | None:
    """Ask for a review after this booking or order, if the shop asks and the customer has not
    been asked in the last 30 days. Returns "sent", the outbound layer's refusal, or None when
    nothing was sent. Called in the transaction that marked the visit or the order."""
    shop = await settings(conn)
    if not shop["on"] or not shop["link"]:
        return None
    contact = await conn.fetchrow(
        "select id, lang, role, wa_user_id from contacts where id = $1", contact_id
    )
    if contact is None or contact["role"] != "customer" or identity.is_test_user(
        contact["wa_user_id"]
    ):
        return None  # staff, and the owner's own test chat, are never asked
    # One decision per customer at a time, so two visits marked together send one message.
    await conn.execute("select pg_advisory_xact_lock(hashtext($1))", f"review:{contact_id}")
    if await conn.fetchval(
        "select exists (select 1 from review_requests where contact_id = $1 "
        "and blocked is null and sent_at > now() - $2::interval)",
        contact_id, EVERY,
    ):
        return None
    arabic = contact["lang"] == "ar"
    if subject == "order":
        number = await conn.fetchval(
            "select number from orders where id = $1 and not is_test", subject_id
        )
        day = ""
    else:
        number, day = await conn.fetchrow(
            "select number, to_char(starts_at at time zone (select timezone from tenants "
            "where id = nullif(current_setting('app.tenant_id', true), '')::uuid), $2) "
            "from bookings where id = $1",
            subject_id, "DD/MM" if arabic else "FMDy FMDD Mon",
        )
    name = await conn.fetchrow(
        "select name, name_ar from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    shop_name = name["name_ar"] if arabic and name["name_ar"] else name["name"]
    what = _what(subject, number, day, arabic)
    link = shop["link"]
    body = (
        f"شكراً لك على {what} لدى {shop_name}. إن كان لديك دقيقة، يمكنك كتابة تقييم من هنا: "
        f"{link} . ويمكنك أيضاً الرد على هذه الرسالة." if arabic
        else f"Thank you for {what} at {shop_name}. If you have a minute, you can leave a "
             f"review here: {link} . You can also reply to this message."
    )
    result = await outbound.send(conn, templates.notice(
        contact_id, "review_request", contact["lang"], body, what, shop_name, link,
    ))
    await conn.execute(
        "insert into review_requests (contact_id, subject, subject_id, message_id, blocked) "
        "values ($1, $2, $3, $4, $5)",
        contact_id, subject, subject_id, result.message_id, result.blocked,
    )
    await team.record(
        conn, subject, subject_id, "review_requested", team.ASSISTANT, contact_id,
        {"number": number, "blocked": result.blocked},
    )
    return result.blocked or "sent"
