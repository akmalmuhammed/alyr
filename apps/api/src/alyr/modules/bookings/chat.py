"""What bookings say in a chat: the booking link, the customer's next booking, cancel."""

from uuid import UUID

import asyncpg

from alyr.channels.base import Choice, InboundMessage, OutboundMessage
from alyr.core import links, team
from alyr.core.normalise import has_arabic
from alyr.core.outbound import Outbound
from alyr.modules.bookings import intent, service, words

# The buttons. Cancelling takes two taps: the first asks, the second does it (T10 of the first
# client's audit): a customer who touches "Cancel booking" by mistake keeps the booking.
CANCEL_PREFIX = "booking_cancel:"
CANCEL_YES = "booking_cancel_yes:"
KEEP_PREFIX = "booking_keep:"
# "What are your prices?" gets the price list, as the Prices button does (ALY-273: the sign-up
# page suggests it on the test line). Only once nothing else took the message, so an item the
# shop sells, named with its price, still finds the item.
PRICE_WORDS = ("price", "how much", "cost", "سعر", "اسعار", "أسعار", "بكم")


def booking_link(web_url: str, slug: str, contact_id: UUID, tenant_id: UUID) -> str:
    """The booking page link for ONE customer: a signed token made for booking
    (`core/links.py`), not the bare contact ID. Whoever holds it is that customer on the
    booking page until it runs out, and nowhere else; an order link does not open it."""
    return links.booking_url(web_url, slug, tenant_id, contact_id)


async def _arabic(
    conn: asyncpg.Connection, contact: asyncpg.Record, message: InboundMessage
) -> bool:
    """Arabic once the customer writes in Arabic, and remembered, so the confirmation and
    the reminder that come later are in Arabic too (the ledger chat does the same)."""
    if contact["lang"] == "ar":
        return True
    if has_arabic(message.text):
        await conn.execute("update contacts set lang = 'ar' where id = $1", contact["id"])
        return True
    return False


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
    arabic = await _arabic(conn, contact, message)

    if message.reply_id.startswith(CANCEL_YES):
        try:
            booking_id = UUID(message.reply_id.removeprefix(CANCEL_YES))
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
            # What became of a paid deposit, by the rule the customer was shown (D-084).
            deposit = await conn.fetchrow(
                "select deposit, deposit_state from bookings where id = $1", booking_id
            )
            outcome = words.deposit_outcome(deposit["deposit_state"], deposit["deposit"], arabic)
            if outcome:
                body += " " + outcome
        else:
            body = _none_to_cancel(arabic)
        return [OutboundMessage(to=contact["id"], body=body)]

    if message.reply_id.startswith((CANCEL_PREFIX, KEEP_PREFIX)):
        keeping = message.reply_id.startswith(KEEP_PREFIX)
        try:
            booking_id = UUID(message.reply_id.removeprefix(
                KEEP_PREFIX if keeping else CANCEL_PREFIX))
        except ValueError:
            return None
        booking = await service.booking_of(conn, contact["id"], booking_id)
        if booking is None:
            return [OutboundMessage(to=contact["id"], body=_none_to_cancel(arabic))]
        if keeping:
            return [await _kept(conn, contact, booking, arabic)]
        return [await _confirm_cancel(conn, contact, booking, arabic)]

    if message.reply_id == "prices":
        return [await _prices(conn, contact, arabic)]
    if message.reply_id and message.reply_id not in ("book", "my_booking"):
        return None
    tokens = intent.words(message.text) if not message.reply_id else []

    if intent.cancel(tokens):
        # "cancel my appointment": not a new booking link. Ask once before anything is cancelled.
        upcoming = await service.next_booking(conn, contact["id"])
        if upcoming is None:
            return [OutboundMessage(to=contact["id"], body=_no_upcoming(arabic))]
        return [await _confirm_cancel(conn, contact, upcoming, arabic)]

    if intent.change(tokens):
        upcoming = await service.next_booking(conn, contact["id"])
        if upcoming is None:
            return [OutboundMessage(to=contact["id"], body=_no_upcoming(arabic))]
        return [await _change_help(conn, tenant_id, contact, upcoming, arabic)]

    if message.reply_id == "my_booking" or intent.mine(tokens):
        upcoming = await service.next_booking(conn, contact["id"])
        if upcoming is None:
            return [OutboundMessage(to=contact["id"], body=_no_upcoming(arabic))]
        when = await service.when_text(conn, upcoming["starts_at"], arabic)
        # "Blow-dry with Reem": the service and who it is with (D-084).
        what = await service.service_words(conn, upcoming["id"], arabic)
        body = (
            f"حجزك رقم {upcoming['number']}: {what}، {when}." if arabic
            else f"Booking {upcoming['number']}: {what}, {when}."
        )
        return [OutboundMessage(
            to=contact["id"], kind="buttons", body=body,
            choices=(Choice(
                f"{CANCEL_PREFIX}{upcoming['id']}",
                "إلغاء الحجز" if arabic else "Cancel booking",
            ),),
        )]

    if message.reply_id == "book" or intent.book(tokens):
        slug = await conn.fetchval("select slug from tenants where id = $1", tenant_id)
        if not slug or not await service.list_services(conn, only_active=True):
            return None
        link = booking_link(web_url, slug, contact["id"], tenant_id)
        body = (
            f"اختر الخدمة والوقت المناسب من هنا: {link}" if arabic
            else f"Pick a service and a time that suits you: {link}"
        )
        return [OutboundMessage(to=contact["id"], body=body)]
    return None


def _no_upcoming(arabic: bool) -> str:
    return (
        "لا يوجد لديك حجز قادم. أرسل «حجز» لحجز موعد." if arabic
        else "You have no upcoming booking. Send \"book\" to make one."
    )


def _none_to_cancel(arabic: bool) -> str:
    return "لم نجد حجزاً قائماً لإلغائه." if arabic else "There is no active booking to cancel."


async def _described(
    conn: asyncpg.Connection, booking: asyncpg.Record, arabic: bool
) -> tuple[str, str]:
    """What a booking is and when, as the customer is told: ("Blow-dry with Reem", "Tue 13 Oct,
    8:30 AM")."""
    return (await service.service_words(conn, booking["id"], arabic),
            await service.when_text(conn, booking["starts_at"], arabic))


async def _confirm_cancel(
    conn: asyncpg.Connection, contact: asyncpg.Record, booking: asyncpg.Record, arabic: bool
) -> OutboundMessage:
    """The question before a cancellation: which booking, and what the shop's deposit rule
    says when one was paid, with two buttons. Nothing is cancelled until "Yes" is pressed."""
    what, when = await _described(conn, booking, arabic)
    number = booking["number"]
    body = (
        f"هل تريد إلغاء الحجز رقم {number}: {what}، {when}؟" if arabic
        else f"Cancel booking {number}: {what}, {when}?"
    )
    if booking["deposit_state"] == "paid":
        body += " " + words.terms_sentence(booking["deposit_terms"] or {}, arabic)
    return OutboundMessage(
        to=contact["id"], kind="buttons", body=body,
        choices=(
            Choice(f"{CANCEL_YES}{booking['id']}",
                   "نعم، ألغِ الحجز" if arabic else "Yes, cancel it"),
            Choice(f"{KEEP_PREFIX}{booking['id']}",
                   "أبقِ الحجز" if arabic else "Keep my booking"),
        ),
    )


async def _kept(
    conn: asyncpg.Connection, contact: asyncpg.Record, booking: asyncpg.Record, arabic: bool
) -> OutboundMessage:
    what, when = await _described(conn, booking, arabic)
    number = booking["number"]
    body = (
        f"حجزك رقم {number} باقٍ كما هو: {what}، {when}." if arabic
        else f"Your booking {number} stays as it is: {what}, {when}."
    )
    return OutboundMessage(to=contact["id"], body=body)


async def _change_help(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record,
    booking: asyncpg.Record, arabic: bool,
) -> OutboundMessage:
    """A customer who wants to change a booking: there is no way to move it from the chat, so
    a person is asked, the booking is named, and cancelling and booking again stays one tap away.
    Said once in ten minutes, as the other hand-offs are."""
    what, when = await _described(conn, booking, arabic)
    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    name = shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]
    recent = await conn.fetchval(
        "select true from activity where subject = 'conversation' and subject_id = $1 "
        "and action = 'asked_person' and created_at > now() - interval '10 minutes'",
        contact["id"],
    )
    if not recent:
        await team.record(
            conn, "conversation", contact["id"], "asked_person", team.CUSTOMER, contact["id"],
            {"why": "change_booking", "number": booking["number"]},
        )
    number = booking["number"]
    body = (
        f"الحجز رقم {number}: {what}، {when}. لتغييره، سيرد عليك أحد موظفي {name} هنا. "
        "ويمكنك أيضاً إلغاؤه وحجز وقت جديد." if arabic
        else f"Booking {number}: {what}, {when}. To change it, a person from {name} will reply "
             "here. You can also cancel it and book a new time."
    )
    return OutboundMessage(
        to=contact["id"], kind="buttons", body=body,
        choices=(
            Choice(f"{CANCEL_PREFIX}{booking['id']}",
                   "إلغاء الحجز" if arabic else "Cancel booking"),
            Choice("book", "احجز موعداً" if arabic else "Book a visit"),
        ),
    )


async def _prices(
    conn: asyncpg.Connection, contact: asyncpg.Record, arabic: bool
) -> OutboundMessage:
    services = await service.list_services(conn, only_active=True)
    lines = []
    for s in services:
        name = s["name_ar"] if arabic and s["name_ar"] else s["name"]
        minutes = f"{s['duration_minutes']} دقيقة" if arabic else f"{s['duration_minutes']} min"
        price = f": {s['price_text']}" if s["price_text"] else ""
        lines.append(f"{name}{price} ({minutes})")
    head = "خدماتنا:" if arabic else "Our services:"
    return OutboundMessage(
        to=contact["id"], kind="buttons", body="\n".join([head, *lines]),
        choices=(Choice("book", "احجز موعداً" if arabic else "Book a visit"),),
    )


async def greeting(
    conn: asyncpg.Connection, tenant_id: UUID, contact: asyncpg.Record, message: InboundMessage
) -> list[OutboundMessage]:
    """The menu a booking business answers with when nothing more specific applies, or its
    price list when the message asks for prices."""
    arabic = await _arabic(conn, contact, message)
    if not message.reply_id and any(word in message.text.lower() for word in PRICE_WORDS):
        return [await _prices(conn, contact, arabic)]
    shop = await conn.fetchrow("select name, name_ar from tenants where id = $1", tenant_id)
    name = shop["name_ar"] if arabic and shop["name_ar"] else shop["name"]
    if arabic:
        body = f"أهلاً بك في {name}. كيف نقدر نخدمك؟"
        titles = ("احجز موعداً", "حجزي", "الأسعار")
    else:
        body = f"Welcome to {name}. How can we help?"
        titles = ("Book a visit", "My booking", "Prices")
    keys = ("book", "my_booking", "prices")
    return [OutboundMessage(
        to=contact["id"], kind="buttons", body=body,
        choices=tuple(Choice(k, t) for k, t in zip(keys, titles, strict=True)),
    )]
