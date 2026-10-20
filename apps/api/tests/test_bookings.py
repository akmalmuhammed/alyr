"""Bookings: services, free times, booking, cancelling, moving and reminders (ALY-27)."""

from datetime import UTC, date, datetime, timedelta

import asyncpg
import pytest

from alyr.core import links
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from order_links import booking_token
from test_consent import ahmed, conversation, owner_sql, say
from test_sign_in import other_shop_with_owner

PAGE = f"/api/book/{DEMO_SLUG}"


def a_working_day() -> date:
    """A day soon that is not Friday, when the demo shop only opens in the evening."""
    day = date.today() + timedelta(days=2)
    return day + timedelta(days=1) if day.weekday() == 4 else day


def service_id(client, name="Electrician site visit"):
    services = client.get(PAGE).json()["services"]
    return next(s["id"] for s in services if s["name"] == name)


def times(client, sid, day=None):
    day = day or a_working_day()
    response = client.get(f"{PAGE}/times", params={"service_id": sid, "day": day.isoformat()})
    assert response.status_code == 200
    return response.json()["times"]


def book(client, sid=None, starts_at=None, contact_id=None):
    """Book as a customer, the way their booking link lets them (a signed token; the page
    takes no bare contact ID, test_booking_links.py)."""
    sid = sid or service_id(client)
    return client.post(PAGE, json={
        "token": booking_token(contact_id or ahmed(client)["id"]), "service_id": sid,
        "starts_at": starts_at or times(client, sid)[0],
    })


def test_the_booking_page_lists_services_and_greets_the_customer(client):
    page = client.get(PAGE, headers={"x-order-link": booking_token(ahmed(client)["id"])}).json()
    assert [s["name"] for s in page["services"]] == [
        "Electrician site visit", "Lighting consultation", "Generator service"
    ]
    assert page["services"][0]["price_text"] == "QAR 150"
    assert page["services"][1]["price_text"] == ""
    assert page["customer"] == {"name": "Ahmed Al-Kuwari", "lang": "en"}
    assert page["shop"]["timezone"] == "Asia/Qatar"


def test_free_times_follow_opening_hours_in_the_shops_own_time_zone(client):
    free = [datetime.fromisoformat(t) for t in times(client, service_id(client))]
    # Qatar is three hours ahead of UTC: the shop opens 08:00 to 12:00 and 16:00 to 21:00.
    local = [(t + timedelta(hours=3)).strftime("%H:%M") for t in free]
    assert local[0] == "08:00"
    assert "11:00" in local and "11:30" not in local  # an hour's visit must end by noon
    assert "12:00" not in local and "16:00" in local
    assert local[-1] == "20:00"


def test_friday_has_only_evening_times(client):
    day = date.today() + timedelta(days=2)
    while day.weekday() != 4:
        day += timedelta(days=1)
    free = [datetime.fromisoformat(t) for t in times(client, service_id(client), day)]
    assert (free[0] + timedelta(hours=3)).strftime("%H:%M") == "16:00"


def test_a_booking_is_confirmed_in_the_chat_and_takes_the_time(client):
    sid = service_id(client)
    start = times(client, sid)[0]
    made = book(client, sid, start)
    assert made.status_code == 200
    assert made.json()["number"] == 101

    last = conversation(client)[-1]
    assert "Booking 101 is confirmed at Al Noor Electricals" in last["body"]
    assert (last["kind"], last["status"]) == ("template", "sent")

    left = times(client, sid)
    assert start not in left
    # The visit lasts an hour, so the half-hour after its start is taken too.
    half_past = (datetime.fromisoformat(start) + timedelta(minutes=30)).isoformat()
    assert half_past not in [datetime.fromisoformat(t).isoformat() for t in left]

    listed = client.get(
        "/api/bookings", params={"first": a_working_day().isoformat()}
    ).json()["bookings"]
    assert [(b["number"], b["customer"], b["status"]) for b in listed] == [
        (101, "Ahmed Al-Kuwari", "booked")
    ]


def test_the_same_time_cannot_be_booked_twice(client):
    sid = service_id(client)
    start = times(client, sid)[0]
    assert book(client, sid, start).status_code == 200
    bilal = next(
        c for c in client.get("/api/ledger/summary").json()["customers"]
        if c["name"] == "Bilal Contracting"
    )
    second = book(client, sid, start, bilal["id"])
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "not_free"


def test_the_database_itself_refuses_overlapping_bookings(client):
    """The backstop for two customers confirming in the same instant."""
    sid = service_id(client)
    assert book(client, sid).status_code == 200
    with pytest.raises(asyncpg.ExclusionViolationError):
        owner_sql(
            "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
            "                      starts_at, ends_at) "
            "select tenant_id, 999, contact_id, service_id, service_name, "
            "       starts_at + interval '15 minutes', ends_at + interval '15 minutes' "
            "from bookings where tenant_id = $1",
            DEMO_TENANT_ID,
        )


def test_times_outside_opening_hours_or_in_the_past_are_refused(client):
    sid = service_id(client)
    midnight = datetime.combine(a_working_day(), datetime.min.time(), tzinfo=UTC)
    assert book(client, sid, midnight.isoformat()).status_code == 409
    yesterday = datetime.now(UTC) - timedelta(days=1)
    assert book(client, sid, yesterday.isoformat()).status_code == 409
    no_zone = book(client, sid, "2030-01-01T09:00:00")
    assert no_zone.status_code == 422


def test_unknown_customer_service_or_shop_is_refused(client):
    sid = service_id(client)
    start = times(client, sid)[0]
    stranger = "00000000-0000-4000-8000-000000000001"
    assert book(client, sid, start, stranger).status_code == 404
    assert book(client, stranger, start).status_code == 404
    assert client.get("/api/book/no-such-shop").status_code == 404


def test_the_shop_can_cancel_and_the_time_becomes_free_again(client):
    sid = service_id(client)
    start = times(client, sid)[0]
    booking = book(client, sid, start).json()
    assert client.post(f"/api/bookings/{booking['id']}/cancel").status_code == 200
    assert "has been cancelled" in conversation(client)[-1]["body"]
    assert start in times(client, sid)
    assert client.post(f"/api/bookings/{booking['id']}/cancel").status_code == 404


def test_the_customer_can_see_and_cancel_their_booking_in_the_chat(client):
    sid = service_id(client)
    start = times(client, sid)[0]
    booking = book(client, sid, start).json()
    shown = say(client, AHMED_PHONE, "my booking")[-1]
    assert "Booking 101: Electrician site visit" in shown["body"]
    button = shown["payload"]["choices"][0]
    assert button["title"] == "Cancel booking"
    answer = say(client, AHMED_PHONE, reply_id=button["id"])[-1]
    assert answer["body"] == "Your booking has been cancelled."
    assert start in times(client, sid)
    assert "no upcoming booking" in say(client, AHMED_PHONE, "my booking")[-1]["body"]
    assert booking["id"] in button["id"]


def test_a_customer_cannot_cancel_someone_elses_booking(client):
    booking = book(client).json()
    answer = say(client, "97455500002", reply_id=f"booking_cancel:{booking['id']}")[-1]
    assert "no active booking" in answer["body"]
    listed = client.get(
        "/api/bookings", params={"first": a_working_day().isoformat()}
    ).json()["bookings"]
    assert listed[0]["status"] == "booked"


def test_asking_to_book_in_the_chat_returns_the_booking_link(client):
    reply = say(client, AHMED_PHONE, "can I book an appointment?")[-1]
    # The link carries a signed token made for booking, never the contact's ID.
    assert f"/b/{DEMO_SLUG}?t=" in reply["body"] and ahmed(client)["id"] not in reply["body"]
    token = reply["body"].split("?t=")[1].split()[0]
    link = links.read(token, DEMO_TENANT_ID, purpose=links.BOOKING)
    assert str(link.contact_id) == ahmed(client)["id"]
    arabic = say(client, AHMED_PHONE, "أريد حجز موعد")[-1]
    assert "اختر الخدمة" in arabic["body"]


def test_a_booking_can_be_moved_and_the_old_time_is_freed(client):
    sid = service_id(client)
    free = times(client, sid)
    booking = book(client, sid, free[0]).json()
    moved = client.post(f"/api/bookings/{booking['id']}/move", json={"starts_at": free[4]})
    assert moved.status_code == 200
    assert "has been moved to" in conversation(client)[-1]["body"]
    left = times(client, sid)
    assert free[0] in left and free[4] not in left
    # Moving onto a time that is not free is refused and changes nothing.
    other = book(client, sid, free[0], next(
        c["id"] for c in client.get("/api/ledger/summary").json()["customers"]
        if c["name"] == "Bilal Contracting"
    )).json()
    clash = client.post(f"/api/bookings/{other['id']}/move", json={"starts_at": free[4]})
    assert clash.status_code == 409
    assert free[0] not in times(client, sid)


def test_the_shop_records_whether_the_customer_came(client):
    booking = book(client).json()
    url = f"/api/bookings/{booking['id']}/outcome"
    assert client.post(url, json={"status": "paid"}).status_code == 422
    assert client.post(url, json={"status": "no_show"}).status_code == 200
    assert client.post(url, json={"status": "completed"}).status_code == 404


def test_a_reminder_goes_out_before_the_booking_and_only_once(client):
    booking = book(client).json()
    before = len(conversation(client))
    due = "update jobs set run_at = now() where kind = 'booking_reminder'"
    owner_sql(due)
    client.get("/api/services")  # any request lets the in-process job runner work
    reminder = conversation(client)[-1]
    assert len(conversation(client)) == before + 1
    assert f"Reminder: booking {booking['number']}" in reminder["body"]
    assert reminder["kind"] == "template"
    assert owner_sql("select count(*) as n from jobs where status = 'queued'")[0]["n"] == 0


def test_a_cancelled_booking_gets_no_reminder(client):
    booking = book(client).json()
    client.post(f"/api/bookings/{booking['id']}/cancel")
    before = len(conversation(client))
    owner_sql("update jobs set run_at = now() where kind = 'booking_reminder'")
    client.get("/api/services")
    assert len(conversation(client)) == before


def test_the_shop_manages_its_services_and_hours(client):
    added = client.post("/api/services", json={
        "name": "Panel inspection", "name_ar": "فحص لوحة", "duration_minutes": 45,
        "price": 20000,
    })
    assert added.status_code == 200
    new_id = added.json()["id"]
    assert "Panel inspection" in [s["name"] for s in client.get(PAGE).json()["services"]]
    client.post(f"/api/services/{new_id}/active", json={"active": False})
    assert "Panel inspection" not in [s["name"] for s in client.get(PAGE).json()["services"]]
    assert "Panel inspection" in [
        s["name"] for s in client.get("/api/services").json()["services"]
    ]

    day = a_working_day()
    weekday = (day.weekday() + 1) % 7  # Python counts from Monday, PostgreSQL from Sunday
    changed = client.put("/api/hours", json={
        "periods": [{"weekday": weekday, "opens": "10:00", "closes": "11:00"}]
    })
    assert changed.status_code == 200
    free = times(client, service_id(client), day)
    assert [(datetime.fromisoformat(t) + timedelta(hours=3)).strftime("%H:%M")
            for t in free] == ["10:00"]
    backwards = client.put("/api/hours", json={
        "periods": [{"weekday": 1, "opens": "12:00", "closes": "09:00"}]
    })
    assert backwards.status_code == 422


def test_another_shop_sees_none_of_this_shops_bookings_or_services(client):
    book(client)
    other = other_shop_with_owner("rana@other.example")

    async def look():
        async with client.app.state.db.tenant(other) as conn:
            return (
                await conn.fetchval("select count(*) from bookings"),
                await conn.fetchval("select count(*) from services"),
                await conn.fetchval("select count(*) from business_hours"),
            )

    assert client.portal.call(look) == (0, 0, 0)
