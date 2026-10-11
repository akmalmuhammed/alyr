"""What bookings say in a chat: the booking link, the customer's next booking, cancel."""

from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.modules.bookings import service

# Checked before "book": a customer asking about a booking they have must not be sent
# the link to make a new one.
MINE_WORDS = ("my booking", "my appointment", "cancel booking", "cancel my",
              "حجزي", "موعدي", "الغاء الحجز", "إلغاء الحجز")
BOOK_WORDS = ("book", "appointment", "reserve", "reservation", "schedule",
              "حجز", "احجز", "أحجز", "موعد")
CANCEL_PREFIX = "booking_cancel:"


def booking_link(web_url: str, slug: str, contact_id: UUID) -> str:
    # Like the order link: the random contact ID says who is booking.
    return f"{web_url}/b/{slug}?c={contact_id}"


async def maybe_handle(
    conn: asyncpg.Connection,
    tenant_id: UUID,
    contact: asyncpg.Record,
    message: InboundMessage,
    web_url: str,
    outbound: Outbound,
) -> list[OutboundMessage] | None:
    """Answer if this message is about a booking; otherwise return None."""
    if contact["role"] == "staff":
        return None
    arabic = contact["lang"] == "ar" or has_arabic(message.text)

    if message.reply_id.startswith(CANCEL_PREFIX):
        try:
            booking_id = UUID(message.reply_id.removeprefix(CANCEL_PREFIX))
        except ValueError:
            return None
        mine = await conn.fetchval(
            "select true from bookings where id = $1 and contact_id = $2",
            booking_id, contact["id"],
        )
        # The customer is in the chat right now, so the answer is a plain reply and the
        # separate cancellation notice is not needed.
        if mine and await service.cancel(conn, outbound, booking_id, notify=False):
            body = "تم إلغاء حجزك." if arabic else "Your booking has been cancelled."
        else:
            body = (
                "لم نجد حجزاً قائماً لإلغائه." if arabic
                else "There is no active booking to cancel."
            )
        return [OutboundMessage(to=contact["id"], body=body)]

    if message.reply_id and message.reply_id != "book":
        return None
    text = message.text.lower()

    if not message.reply_id and any(word in text for word in MINE_WORDS):
        upcoming = await service.next_booking(conn, contact["id"])
        if upcoming is None:
            body = (
                "لا يوجد لديك حجز قادم. أرسل «حجز» لحجز موعد." if arabic
                else "You have no upcoming booking. Send \"book\" to make one."
            )
            return [OutboundMessage(to=contact["id"], body=body)]
        when = await service._when_text(conn, upcoming["starts_at"], arabic)
        body = (
            f"حجزك رقم {upcoming['number']}: {upcoming['service_name']}، {when}." if arabic
            else f"Booking {upcoming['number']}: {upcoming['service_name']}, {when}."
        )
        return [OutboundMessage(
            to=contact["id"], kind="buttons", body=body,
            choices=(Choice(
                f"{CANCEL_PREFIX}{upcoming['id']}",
                "إلغاء الحجز" if arabic else "Cancel booking",
            ),),
        )]

    if message.reply_id == "book" or any(word in text for word in BOOK_WORDS):
        slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
        if not slug or not await service.list_services(conn, only_active=True):
            return None
        link = booking_link(web_url, slug, contact["id"])
        body = (
            f"اختر الخدمة والوقت المناسب من هنا: {link}" if arabic
            else f"Pick a service and a time that suits you: {link}"
        )
        return [OutboundMessage(to=contact["id"], body=body)]
    return None
