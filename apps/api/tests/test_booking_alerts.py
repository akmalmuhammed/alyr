"""The owner is told about bookings (D-192, specs/069-owner-alerts): a staff number marked for it
is told about each new booking and each cancellation by the customer, as text inside its 24-hour
window; outside it the templates, which are written and held, so nothing is sent; each owner who
wants it is emailed instead, with no customer name or number in the email. Through the real
routes, the simulator and PostgreSQL, with Resend stood in by a transport."""

import asyncio
import dataclasses
import json
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import mail, templates
from alyr.db import Database
from alyr.modules.bookings import staff_alert
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL, OWNER_PHONE, STAFF_PHONE
from conftest import APP_DSN
from test_booking_resources import customers
from test_bookings import book, service_id, times
from test_consent import owner_sql, say
from test_sign_in import sign_in

DOMAIN = "booking-alerts-test.com"
# The customer's second tap: "Cancel booking" only asks, "Yes, cancel it" cancels (audit T10).
BOOKING = "booking_cancel_yes:"


def staff_id(client, phone: str) -> str:
    numbers = client.get("/api/staff-numbers").json()["numbers"]
    return next(n["id"] for n in numbers if n["phone"] == phone)


def tell_bookings(client, phone: str, on: bool = True) -> dict:
    changed = client.put(f"/api/staff-numbers/{staff_id(client, phone)}",
                         json={"booking_alerts": on})
    assert changed.status_code == 200, changed.text
    return changed.json()


def open_window(phone: str) -> None:
    owner_sql("update contacts set last_inbound_at = now() where phone = $1", phone)


def close_window(phone: str) -> None:
    owner_sql("update contacts set last_inbound_at = now() - interval '3 days' "
              "where phone = $1", phone)


def alerts_to(phone: str) -> list[dict]:
    """What the shop sent this phone about a booking alert, oldest first."""
    rows = owner_sql(
        "select m.kind, m.body, m.status, m.payload from messages m "
        "join contacts c on c.id = m.contact_id where c.phone = $1 and c.tenant_id = $2 "
        "and m.direction = 'out' and (m.body like 'New booking%' or m.body like 'Booking%' "
        "  or m.body like 'حجز جديد%' or m.body like '%ألغى العميل%' "
        "  or m.payload->>'template' in ('booking_new_staff', 'booking_cancelled_staff')) "
        "order by m.created_at", phone, DEMO_TENANT_ID)
    return [dict(r) | {"payload": json.loads(r["payload"])} for r in rows]


def jobs_of(kind: str) -> int:
    return owner_sql("select count(*) as n from jobs where kind = $1 and tenant_id = $2",
                     kind, DEMO_TENANT_ID)[0]["n"]


def make(client, nth: int = 0, who: str | None = None) -> dict:
    sid = service_id(client)
    made = book(client, sid, times(client, sid)[nth], who)
    assert made.status_code == 200, made.text
    return made.json()


@pytest.fixture
def letters(monkeypatch):
    """Mail on, and what Resend was given (the sign-in codes left out)."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            sent.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    yield sent
    # The owner's address goes back to the seed's, which no mail is ever sent to.
    owner_sql("update users set email = $1 where email like $2", OWNER_EMAIL, f"%@{DOMAIN}")


def owner_address() -> str:
    """The shop's owner gets an address that could be real, so the email is sent to it."""
    address = f"fatima-{uuid4().hex[:6]}@{DOMAIN}"
    owner_sql("update users set email = $1 where email = $2", address, OWNER_EMAIL)
    return address


# ------------------------------------------------------------------ WhatsApp, inside the window

def test_nobody_is_told_until_a_number_is_marked(client):
    open_window(OWNER_PHONE)
    make(client)
    assert alerts_to(OWNER_PHONE) == alerts_to(STAFF_PHONE) == []
    assert jobs_of(staff_alert.JOB) == 0


def test_a_marked_number_is_told_what_was_booked_and_when(client):
    assert tell_bookings(client, STAFF_PHONE)["booking_alerts"] is True
    open_window(STAFF_PHONE)
    made = make(client)
    [alert] = alerts_to(STAFF_PHONE)
    assert alert["kind"] == "text"
    lines = alert["body"].split("\n")
    assert lines[0] == f"New booking {made['number']}"
    assert lines[1] == "Electrician site visit"
    assert lines[2] == made["when_text"]
    assert lines[3] == "From Ahmed Al-Kuwari"
    assert lines[-1] == "See it in ALYR: http://web.test/app/bookings"
    # A number that was not marked is told nothing, however recently it wrote.
    open_window(OWNER_PHONE)
    assert alerts_to(OWNER_PHONE) == []


def test_in_arabic_when_the_number_reads_arabic_with_a_mark_on_every_line(client):
    tell_bookings(client, STAFF_PHONE)
    owner_sql("update contacts set lang = 'ar' where phone = $1", STAFF_PHONE)
    open_window(STAFF_PHONE)
    made = make(client)
    [alert] = alerts_to(STAFF_PHONE)
    lines = alert["body"].split("\n")
    assert lines[0] == f"‏حجز جديد رقم {made['number']}"
    assert lines[3] == "‏من Ahmed Al-Kuwari"
    assert lines[-1].startswith("‏افتحه في ALYR: ")
    assert all(line.startswith("‏") for line in lines if line)


def test_a_cancellation_by_the_customer_is_told_and_by_staff_is_not(client):
    tell_bookings(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    first, second = make(client, 0), make(client, 3)
    # The customer cancels in the chat.
    say(client, AHMED_PHONE, reply_id=f"{BOOKING}{first['id']}")
    # A member of staff cancels the other from the workspace: they know, so no alert.
    assert client.post(f"/api/bookings/{second['id']}/cancel").status_code == 200
    told = alerts_to(STAFF_PHONE)
    assert len(told) == 3  # two new bookings, one cancellation
    cancelled = [a for a in told if a["body"].startswith("Booking")]
    assert len(cancelled) == 1
    lines = cancelled[0]["body"].split("\n")
    assert lines[0] == f"Booking {first['number']} cancelled by the customer"
    assert "The time is free again." in lines
    assert str(second["number"]) not in cancelled[0]["body"]


def test_switching_it_off_stops_the_messages(client):
    tell_bookings(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    make(client, 0)
    assert tell_bookings(client, STAFF_PHONE, on=False)["booking_alerts"] is False
    make(client, 2)
    assert len(alerts_to(STAFF_PHONE)) == 1


def test_the_owners_own_test_booking_tells_nobody(client):
    tell_bookings(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    tester = customers(client, 1)[0]
    owner_sql("update contacts set wa_user_id = 'TEST.' || id::text where id = $1", UUID(tester))
    sid = service_id(client)
    assert book(client, sid, times(client, sid)[0], tester).status_code == 200
    assert alerts_to(STAFF_PHONE) == []
    assert jobs_of(staff_alert.JOB) == 0


def test_a_booking_cancelled_before_the_job_ran_is_not_announced_as_new(client):
    tell_bookings(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    made = make(client)

    owner_sql("update bookings set status = 'cancelled' where id = $1", UUID(made["id"]))

    async def read():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(DEMO_TENANT_ID) as conn:
                return (await staff_alert.read(conn, UUID(made["id"]), staff_alert.NEW),
                        await staff_alert.read(conn, UUID(made["id"]), staff_alert.CANCELLED))
        finally:
            await db.close()

    new, cancelled = asyncio.run(read())
    assert new is None and cancelled is not None


# --------------------------------------------------- outside the window: the templates are held

def test_both_templates_are_written_held_and_follow_the_blanks():
    for name in staff_alert.TEMPLATES.values():
        template = templates.CATALOGUE[name]
        assert template.held == templates.HELD and template.category == "utility"
        assert len(template.samples) == len(template.samples_ar) == 4
        rendered = templates.render(name, "en", template.samples)
        assert "{{" not in rendered and "Sky Studio" in rendered and "104" in rendered
        assert "{{" not in templates.render(name, "ar", template.samples_ar)


def test_outside_the_window_nothing_is_sent_while_the_template_is_held(client):
    tell_bookings(client, STAFF_PHONE)
    close_window(STAFF_PHONE)
    made = make(client)
    assert alerts_to(STAFF_PHONE) == []
    # The booking itself was not held up by it.
    assert made["number"]
    # And a message that arrives later (the number writes in) does not bring it back.
    say(client, STAFF_PHONE, "hello")
    assert alerts_to(STAFF_PHONE) == []


def test_once_the_hold_is_lifted_the_template_goes_outside_the_window(client, monkeypatch):
    for name in staff_alert.TEMPLATES.values():
        monkeypatch.setitem(templates.CATALOGUE, name,
                            dataclasses.replace(templates.CATALOGUE[name], held=""))
    tell_bookings(client, STAFF_PHONE)
    owner_sql("update contacts set lang = 'ar' where phone = $1", STAFF_PHONE)
    close_window(STAFF_PHONE)
    made = make(client)
    [alert] = alerts_to(STAFF_PHONE)
    assert alert["kind"] == "template"
    assert (alert["payload"]["template"], alert["payload"]["category"]) == (
        "booking_new_staff", "utility")
    shop, number, what, when = alert["payload"]["params"]
    assert number == str(made["number"]) and what == "زيارة كهربائي للموقع"
    assert alert["body"].startswith("حجز جديد في ")


# --------------------------------------------------------------------------------------- email

def test_an_owner_is_emailed_for_each_booking_without_the_customers_name(client, letters):
    owner = owner_address()
    made = make(client)
    [letter] = [m for m in letters if m["to"] == [owner]]
    assert letter["subject"] == f"New booking {made['number']}: {made['when_text']}"
    for words in (f"booking {made['number']}", "Electrician site visit", made["when_text"],
                  "http://web.test/app/bookings", "switch"):
        assert words in letter["text"], words
    # The customer's name and number are not in it: Resend is in the EU.
    for private in ("Ahmed", "Kuwari", AHMED_PHONE, "974"):
        assert private not in letter["text"] and private not in letter["html"], private
    # It reads in the language the owner signed up in, and is sent with the plain-text twin.
    assert letter["html"].startswith("<!doctype html>") and "Open your bookings" in letter["html"]


def test_a_cancellation_is_emailed_too_and_an_arabic_owner_reads_arabic(client, letters):
    owner = owner_address()
    owner_sql("update tenants set owner_lang = 'ar' where id = $1", DEMO_TENANT_ID)
    made = make(client)
    say(client, AHMED_PHONE, reply_id=f"{BOOKING}{made['id']}")
    mine = [m for m in letters if m["to"] == [owner]]
    assert [m["subject"].startswith(("حجز جديد", "أُلغي الحجز")) for m in mine] == [True, True]
    assert 'dir="rtl"' in mine[1]["html"] and "ألغى عميل الحجز" in mine[1]["text"]
    assert "Ahmed" not in mine[1]["text"]
    owner_sql("update tenants set owner_lang = 'en' where id = $1", DEMO_TENANT_ID)


def test_an_owner_can_switch_the_email_off_and_only_owners_are_emailed(client_factory, letters):
    owner_client, agent_client = client_factory(), client_factory()
    owner = owner_address()
    sign_in(owner_client, owner)
    sign_in(agent_client, "yusuf@alnoor.example")
    # The agent's address could be real too, to prove they are not written to.
    agent = f"yusuf-{uuid4().hex[:6]}@{DOMAIN}"
    owner_sql("update users set email = $1 where email = 'yusuf@alnoor.example'", agent)
    try:
        make(owner_client, 0)
        assert [m["to"] for m in letters] == [[owner]]
        off = owner_client.put("/api/owner/alerts", json={"booking_email": False})
        assert off.status_code == 200 and off.json()["booking_email"] is False
        make(owner_client, 2)
        assert [m["to"] for m in letters] == [[owner]]
        # An agent cannot turn an owner's email on or off.
        refused = agent_client.put("/api/owner/alerts", json={"booking_email": True})
        assert refused.status_code == 403
    finally:
        owner_sql("update users set email = 'yusuf@alnoor.example' where email = $1", agent)


def test_nothing_is_emailed_to_an_example_address_or_while_mail_is_off(client, letters):
    make(client)  # the seed's owner address ends .example
    assert letters == []


def test_a_refused_email_is_tried_again_and_sends_no_second_whatsapp(client, letters,
                                                                      monkeypatch):
    owner_address()
    tell_bookings(client, STAFF_PHONE)
    open_window(STAFF_PHONE)
    monkeypatch.setattr(mail, "transport", httpx.MockTransport(lambda r: httpx.Response(500)))
    make(client)
    assert len(alerts_to(STAFF_PHONE)) == 1
    [job] = owner_sql("select status, attempts from jobs where kind = $1 and tenant_id = $2",
                      staff_alert.EMAIL_JOB, DEMO_TENANT_ID)
    assert job["status"] != "done" and job["attempts"] >= 1
