"""The owner is told about each new booking and each cancellation (D-192, specs/069-owner-alerts).

Until now a salon's owner learned of a booking only by opening the Bookings tab, typing BOOKINGS
to the linked number, or reading the weekly report: at 11 pm nothing reached any phone. This is
the twin of `modules/orders/staff_alert.py` (D-079) for bookings, with two doors:

* **WhatsApp**, to the staff numbers marked for it (`contacts.booking_alerts`, switched in the
  workspace; an owner's or an admin's own phone is marked when they link it). A booking a customer
  makes, and one a customer cancels (a staff member cancelling is not told to anyone: they did it).
  Inside a number's 24-hour window it is an ordinary message. Outside it, the templates
  `booking_new_staff` and `booking_cancelled_staff`, which are written and **held** (not submitted
  to Meta; the founder's go). While a template is held, a number whose window is closed is simply
  not sent anything over WhatsApp: the email below is how that owner learns. Nothing leaves outside
  the window until the hold is lifted and Meta has approved the wording.
* **Email**, one per booking event to each owner who has not switched it off
  (`memberships.booking_emails`), so an owner learns of a booking with no WhatsApp at all. It
  holds the booking's number, the service, the time and who does it, and never the customer's
  name or phone number (docs/data-residency.md: Resend is in the EU).

Nobody is told about the owner's own test booking (D-064) or until someone is marked. Both are
jobs, so a customer's booking never waits for WhatsApp or the mail provider, and an email that
Resend refuses is tried again without sending a second WhatsApp message.

Every function that takes a connection needs a tenant-scoped one.
"""

import logging
from uuid import UUID

import asyncpg

from alyr.config import get_settings
from alyr.core import identity, jobs, mail, templates
from alyr.core.outbound import Outbound
from alyr.db import Database
from alyr.modules.bookings import words
from alyr.modules.items import staff

log = logging.getLogger("alyr.bookings.alert")

JOB = "bookings.staff_alert"
EMAIL_JOB = "bookings.owner_email"
NEW = "new"
CANCELLED = "cancelled"
TEMPLATES = {NEW: "booking_new_staff", CANCELLED: "booking_cancelled_staff"}
RLM = "‏"

_WORDS = {
    NEW: {
        "title": ("New booking {number}", "حجز جديد رقم {number}"),
        "closing": ("", ""),
    },
    CANCELLED: {
        "title": ("Booking {number} cancelled by the customer",
                  "ألغى العميل الحجز رقم {number}"),
        "closing": ("The time is free again.", "أصبح الوقت متاحاً من جديد."),
    },
}
_LINES = {
    "from": ("From {name}", "من {name}"),
    "deposit": ("Deposit {amount}, not paid yet", "العربون {amount}، لم يُدفع بعد"),
    "open": ("See it in ALYR: {url}", "افتحه في ALYR: {url}"),
}


def _say(key: str, lang: str, **details: object) -> str:
    english, arabic = _LINES[key]
    return (arabic if lang == "ar" else english).format(**details)


def message(
    event: str, facts: dict, shop: str, lang: str, url: str
) -> tuple[str, tuple[str, str, str, str]]:
    """The text sent inside a number's window, and the template's four values for outside it:
    the shop, the booking's number, the service with who does it, and the time. `facts` is
    `read()`'s answer, with `what` and `when` already worded in `lang`."""
    arabic = lang == "ar"
    title_en, title_ar = _WORDS[event]["title"]
    closing_en, closing_ar = _WORDS[event]["closing"]
    lines = [
        (title_ar if arabic else title_en).format(number=facts["number"]),
        facts["what"],
        facts["when"],
    ]
    if facts["customer"]:
        lines.append(_say("from", lang, name=facts["customer"]))
    if event == NEW and facts["deposit_due"]:
        lines.append(_say("deposit", lang, amount=words.money(facts["deposit"], arabic)))
    if closing_en:
        lines.append(closing_ar if arabic else closing_en)
    lines += ["", _say("open", lang, url=url)]
    if arabic:
        lines = [f"{RLM}{line}" if line else line for line in lines]
    return "\n".join(lines), (shop, str(facts["number"]), facts["what"], facts["when"])


async def read(conn: asyncpg.Connection, booking_id: UUID, event: str) -> dict | None:
    """What an alert says about one booking, or None when there is nothing to say: no such
    booking, the owner's own test booking, or a booking that is no longer in the state the alert
    is about (a new one cancelled or never confirmed before the job ran; a cancellation that was
    undone). The service and the time are not worded here: they depend on who is told."""
    row = await conn.fetchrow(
        "select b.number, b.starts_at, b.status, b.deposit, b.deposit_state, c.name, c.phone, "
        "c.wa_user_id from bookings b join contacts c on c.id = b.contact_id where b.id = $1",
        booking_id,
    )
    if row is None or identity.is_test_user(row["wa_user_id"]):
        return None
    if row["status"] != ("booked" if event == NEW else "cancelled"):
        return None
    # A contact with no WhatsApp name is stored under its number: no name, then.
    name = "" if (row["name"] or "") in ("", row["phone"]) else row["name"]
    return {"number": row["number"], "starts_at": row["starts_at"], "customer": name,
            "deposit": row["deposit"], "deposit_due": bool(row["deposit"])
            and row["deposit_state"] == "due"}


async def _worded(conn: asyncpg.Connection, booking_id: UUID, facts: dict, lang: str) -> dict:
    from alyr.modules.bookings import service  # service queues alerts, so it is read late

    arabic = lang == "ar"
    return facts | {
        "what": await service.service_words(conn, booking_id, arabic),
        "when": await service.when_text(conn, facts["starts_at"], arabic),
    }


async def queue(conn: asyncpg.Connection, booking_id: UUID, event: str) -> None:
    """Called when a customer makes or cancels a booking, in its transaction: queue the
    WhatsApp alert if a number is marked for it, and one email for each owner who wants it. The
    owner's own test booking and a shop nobody is marked in queue nothing."""
    wa_user_id = await conn.fetchval(
        "select c.wa_user_id from bookings b join contacts c on c.id = b.contact_id "
        "where b.id = $1", booking_id,
    )
    if identity.is_test_user(wa_user_id):
        return
    payload = {"booking_id": str(booking_id), "event": event}
    if await conn.fetchval(
        "select true from contacts where role = 'staff' and booking_alerts limit 1"
    ):
        await jobs.enqueue(conn, JOB, payload)
    if mail.configured():
        for owner in await conn.fetch(
            "select user_id from memberships where role = 'owner' and booking_emails"
        ):
            await jobs.enqueue(conn, EMAIL_JOB, payload | {"user_id": str(owner["user_id"])})


def may_send(template: str, window_open: bool) -> bool:
    """Whether a number is sent this alert now: always inside its window, and outside it only
    once the founder has lifted the hold on the template. A held template is never sent."""
    return window_open or not templates.CATALOGUE[template].held


class StaffAlerts:
    """Job handler for `bookings.staff_alert`: one booking event, every number marked for it."""

    def __init__(self, db: Database, outbound: Outbound, web_url: str) -> None:
        self._db = db
        self._outbound = outbound
        self._url = f"{web_url.rstrip('/')}/app/bookings"

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        booking_id, event = UUID(payload["booking_id"]), payload["event"]
        template = TEMPLATES[event]
        async with self._db.tenant(tenant_id) as conn:
            facts = await read(conn, booking_id, event)
            if facts is None:
                return
            shop = await conn.fetchrow(
                "select name, name_ar from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid")
            worded: dict[str, dict] = {}
            for person in await staff.booking_watchers(conn):
                if not may_send(template, person["window_open"]):
                    continue
                lang = "ar" if person["lang"] == "ar" else "en"
                if lang not in worded:
                    worded[lang] = await _worded(conn, booking_id, facts, lang)
                title = (shop["name_ar"] or shop["name"]) if lang == "ar" else shop["name"]
                body, params = message(event, worded[lang], title, lang, self._url)
                await self._outbound.send(
                    conn, templates.notice(person["id"], template, lang, body, *params)
                )


class OwnerEmails:
    """Job handler for `bookings.owner_email`: one booking event, one owner. What the owner reads
    is worked out when the job runs, so an owner who switched the email off, or left the team, in
    the meantime is not written to. A refusal by the provider raises, and the job is tried again."""

    def __init__(self, db: Database) -> None:
        self._db = db

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        if not mail.configured():
            return
        booking_id, event = UUID(payload["booking_id"]), payload["event"]
        async with self._db.tenant(tenant_id) as conn:
            owner = await conn.fetchrow(
                "select u.email, u.name from memberships m join users u on u.id = m.user_id "
                "where m.user_id = $1 and m.role = 'owner' and m.booking_emails",
                UUID(payload["user_id"]),
            )
            if owner is None or not mail.deliverable(owner["email"]):
                return
            facts = await read(conn, booking_id, event)
            if facts is None:
                return
            shop = await conn.fetchrow(
                "select name, name_ar, owner_lang from tenants where id = $1", tenant_id)
            lang = "ar" if shop["owner_lang"] == "ar" else "en"
            facts = await _worded(conn, booking_id, facts, lang)
        link = f"{get_settings().public_web_url.rstrip('/')}/app/bookings"
        subject, text, html = mail.booking_alert_message(
            lang, owner["name"], (shop["name_ar"] or shop["name"]) if lang == "ar"
            else shop["name"], event, facts["number"], facts["what"], facts["when"], link,
        )
        await mail.send(owner["email"], subject, text, html)
