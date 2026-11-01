"""The desk: walk-ins and moving a booking from the day view (ALY-259, D-142, spec 043).

Staff add a visit at any minute, choose a customer the shop already has, move a booking to a time
they are shown, and cancel one. The customer is told by the notice paths that already exist
(`booking_moved`, `booking_cancelled`, `booking_confirmed`), and when ALYR may not message them
(they never wrote, said stop, or the shop's sending is paused) the answer says so and where to
reach them, so staff do it themselves. Through the real routes and PostgreSQL.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_booking_hours_closures import close, free
from test_booking_resources import chairs, customers
from test_bookings import a_working_day, book, service_id
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in

QATAR = timezone(timedelta(hours=3))


def consent(contact_id, state):
    owner_sql("update contacts set consent_service = $2 where id = $1", UUID(contact_id), state)


def notices(contact_id, template):
    return owner_sql(
        "select status, payload->>'template' as template from messages "
        "where contact_id = $1 and direction = 'out' and payload->>'template' = $2 "
        "order by created_at", UUID(contact_id), template)


def booked(client, contact_id, nth=0, sid=None):
    sid = sid or service_id(client)
    made = book(client, sid, free(client, sid, a_working_day())[nth], contact_id)
    assert made.status_code == 200, made.text
    return made.json()["id"], sid


def move_to(client, booking_id, starts_at, **fields):
    return client.post(f"/api/bookings/{booking_id}/move", json={"starts_at": starts_at} | fields)


# ------------------------------------------------------------ was the customer told

def test_moving_a_booking_says_the_customer_was_told(client):
    contact = customers(client, 1)[0]
    consent(contact, "granted")
    booking, sid = booked(client, contact)
    later = free(client, sid, a_working_day())[4]
    moved = move_to(client, booking, later)
    assert moved.status_code == 200, moved.text
    assert moved.json()["told"] == {"sent": True, "reason": None, "phone": None}
    assert [n["template"] for n in notices(contact, "booking_moved")] == ["booking_moved"]


def test_moving_says_so_when_the_customer_never_agreed_to_messages(client):
    contact = customers(client, 1)[0]
    consent(contact, "unknown")
    booking, sid = booked(client, contact)
    moved = move_to(client, booking, free(client, sid, a_working_day())[4])
    assert moved.status_code == 200
    told = moved.json()["told"]
    assert (told["sent"], told["reason"]) == (False, "no_consent")
    assert told["phone"], "staff are given the number to tell them themselves"
    blocked = notices(contact, "booking_moved")
    assert [n["status"] for n in blocked] == ["blocked"]
    # The booking moved all the same: a message that cannot go never holds the shop up.
    row = {b["id"]: b for b in client.get("/api/bookings").json()["bookings"]}[booking]
    assert row["starts_at"] == moved.json()["starts_at"] and row["status"] == "booked"


def test_a_customer_who_said_stop_is_not_messaged_about_a_move(client):
    contact = customers(client, 1)[0]
    booking, sid = booked(client, contact)
    consent(contact, "revoked")
    moved = move_to(client, booking, free(client, sid, a_working_day())[4])
    assert moved.json()["told"]["reason"] == "opted_out"
    assert [n["status"] for n in notices(contact, "booking_moved")] == ["blocked"]


def test_cancelling_says_whether_the_customer_was_told(client):
    told_one, quiet_one = customers(client, 2)
    consent(told_one, "granted")
    consent(quiet_one, "unknown")
    sid = service_id(client)
    slots = free(client, sid, a_working_day())
    first = book(client, sid, slots[0], told_one).json()["id"]
    second = book(client, sid, slots[3], quiet_one).json()["id"]

    one = client.post(f"/api/bookings/{first}/cancel")
    assert one.status_code == 200
    assert one.json()["told"] == {"sent": True, "reason": None, "phone": None}
    assert one.json()["deposit_state"] == "none"
    two = client.post(f"/api/bookings/{second}/cancel")
    assert two.json()["told"]["reason"] == "no_consent" and two.json()["told"]["phone"]
    assert client.post(f"/api/bookings/{second}/cancel").status_code == 404, "once only"


def test_a_phone_booking_for_a_new_customer_sends_no_confirmation_and_says_so(client):
    sid = service_id(client)
    slot = free(client, sid, a_working_day())[2]
    new = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": slot, "walk_in": False,
        "customer": {"name": "Sara Newcomer", "phone": "97455550123"}})
    assert new.status_code == 200, new.text
    assert (new.json()["told"]["sent"], new.json()["told"]["reason"]) == (False, "no_consent")
    assert new.json()["told"]["phone"] == "97455550123"

    # A customer the shop has, who wrote to it, is told.
    known = customers(client, 1)[0]
    consent(known, "granted")
    again = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": free(client, sid, a_working_day())[5],
        "walk_in": False, "contact_id": known})
    assert again.status_code == 200
    assert again.json()["told"]["sent"] is True


def test_a_walk_in_is_not_messaged_and_says_nothing_about_it(client):
    sid = service_id(client)
    made = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": free(client, sid, a_working_day())[1], "walk_in": True,
        "customer": {"name": "Walk Inn", "phone": "97455550124"}})
    assert made.status_code == 200 and made.json()["told"] is None
    assert made.json()["walk_in"] is True
    assert notices(
        str(owner_sql("select id from contacts where phone = '97455550124'")[0]["id"]),
        "booking_confirmed") == []


def test_the_bookings_list_says_where_a_customers_consent_stands(client):
    contact = customers(client, 1)[0]
    consent(contact, "granted")
    booking, _ = booked(client, contact)
    row = {b["id"]: b for b in client.get("/api/bookings").json()["bookings"]}[booking]
    assert row["consent"] == "granted"
    consent(contact, "revoked")
    row = {b["id"]: b for b in client.get("/api/bookings").json()["bookings"]}[booking]
    assert row["consent"] == "revoked"


# ----------------------------------------------------------- the times a move is shown

def test_a_booking_being_moved_does_not_block_its_own_time(client):
    sid = service_id(client)
    day = a_working_day()
    slot = free(client, sid, day)[0]
    booking, _ = booked(client, customers(client, 1)[0])
    assert slot not in free(client, sid, day), "taken for everyone else"
    mine = client.get(f"/api/bookings/{booking}/times", params={"day": day.isoformat()})
    assert mine.status_code == 200
    assert slot in mine.json()["times"], "but offered to the booking itself"
    assert mine.json()["closed"] is None


def test_the_times_for_a_move_follow_the_person_asked_for(client):
    one, two = chairs(client)
    sid = service_id(client)
    day = a_working_day()
    a, b = customers(client, 2)
    slots = free(client, sid, day)
    first = book(client, sid, slots[0], a).json()
    second = book(client, sid, slots[0], b).json()
    assert (first["resource"], second["resource"]) == ("Chair 1", "Chair 2")

    def offered(booking, chair):
        answer = client.get(f"/api/bookings/{booking['id']}/times",
                            params={"day": day.isoformat(), "resource_id": chair})
        assert answer.status_code == 200
        return answer.json()["times"]

    # The second booking is on Chair 2: its own time is offered there, since it is its own.
    assert slots[0] in offered(second, two)
    # Chair 1 is busy at that time with the first booking, so it is not offered there...
    assert slots[0] not in offered(second, one)
    # ...but a time after that visit is.
    assert slots[4] in offered(second, one)


def test_a_closed_day_is_said_in_the_times_for_a_move(client):
    booking, _ = booked(client, customers(client, 1)[0])
    day = a_working_day() + timedelta(days=3)
    close(client, day, reason="Eid", reason_ar="عيد")
    answer = client.get(f"/api/bookings/{booking}/times", params={"day": day.isoformat()}).json()
    assert answer["times"] == [] and answer["closed"] == {"reason": "Eid", "reason_ar": "عيد"}


def test_the_times_for_a_move_of_a_missing_booking_are_not_found(client):
    gone = "0a1f0000-0000-4000-8000-00000000dead"
    answer = client.get(f"/api/bookings/{gone}/times", params={"day": a_working_day().isoformat()})
    assert answer.status_code == 404


def test_a_moved_booking_can_take_a_time_the_screen_offered(client):
    contact = customers(client, 1)[0]
    consent(contact, "granted")
    booking, sid = booked(client, contact)
    day = a_working_day()
    offered = client.get(f"/api/bookings/{booking}/times", params={"day": day.isoformat()}).json()
    pick = offered["times"][6]
    moved = move_to(client, booking, pick)
    assert moved.status_code == 200 and moved.json()["starts_at"] == pick


def test_staff_can_move_a_booking_to_a_minute_the_page_would_not_offer(client):
    contact = customers(client, 1)[0]
    booking, _ = booked(client, contact)
    day = a_working_day()
    odd = datetime(day.year, day.month, day.day, 17, 10, tzinfo=QATAR).isoformat()
    moved = move_to(client, booking, odd)
    assert moved.status_code == 200, moved.text


# ------------------------------------------------------------- finding a customer

def test_the_desk_finds_a_customer_by_name_or_by_part_of_the_number(client):
    people = client.get("/api/ledger/summary").json()["customers"]
    target = people[0]
    by_name = client.get("/api/bookings/customers", params={"q": target["name"][:3].lower()})
    assert by_name.status_code == 200
    assert target["id"] in [c["id"] for c in by_name.json()["customers"]]
    phone = owner_sql("select phone from contacts where id = $1", UUID(target["id"]))[0]["phone"]
    by_phone = client.get("/api/bookings/customers", params={"q": phone[-6:]}).json()["customers"]
    assert target["id"] in [c["id"] for c in by_phone]
    found = {c["id"]: c for c in by_phone}[target["id"]]
    assert set(found) == {"id", "name", "phone", "lang", "consent"}


def test_the_desk_finds_nobody_for_one_character_and_wildcards_are_plain_text(client):
    assert client.get("/api/bookings/customers", params={"q": "a"}).json() == {"customers": []}
    assert client.get("/api/bookings/customers", params={"q": "  "}).json() == {"customers": []}
    assert client.get("/api/bookings/customers", params={"q": "%%"}).json() == {"customers": []}
    assert client.get("/api/bookings/customers", params={"q": "zzzzqq"}).json() == {"customers": []}


def test_the_desk_does_not_offer_the_owners_test_customers(client):
    owner_sql(
        "insert into contacts (tenant_id, phone, name, wa_user_id) "
        "values ($1, '97455550199', 'Zed Tester', 'TEST.abc')", DEMO_TENANT_ID)
    owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, '97455550198', 'Zed Real')",
        DEMO_TENANT_ID)
    found = client.get("/api/bookings/customers", params={"q": "Zed"}).json()["customers"]
    assert [c["name"] for c in found] == ["Zed Real"]


# ------------------------------------------------------------------------ who may do this

def test_an_agent_can_add_a_walk_in_move_and_cancel_and_find_customers(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    agent = client_factory()
    sign_in(agent, AGENT_EMAIL)
    sid = service_id(agent)
    slots = free(agent, sid, a_working_day())
    made = agent.post("/api/bookings", json={
        "service_id": sid, "starts_at": slots[0], "walk_in": True,
        "customer": {"name": "Walk Inn", "phone": "97455550125"}})
    assert made.status_code == 200
    booking = made.json()["id"]
    times = agent.get(f"/api/bookings/{booking}/times", params={"day": a_working_day().isoformat()})
    assert times.status_code == 200
    assert move_to(agent, booking, slots[3]).status_code == 200
    assert agent.get("/api/bookings/customers", params={"q": "Walk"}).status_code == 200
    assert agent.post(f"/api/bookings/{booking}/cancel").status_code == 200


def test_another_shop_does_not_see_this_shops_customers_or_times(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    booking, _ = booked(owner, customers(owner, 1)[0])
    day = a_working_day().isoformat()

    assert stranger.get("/api/bookings/customers", params={"q": "Ahmed"}).json() == {
        "customers": []}
    assert stranger.get(f"/api/bookings/{booking}/times", params={"day": day}).status_code == 404
    assert move_to(stranger, booking, free(owner, service_id(owner), a_working_day())[5]
                   ).status_code == 404
    assert stranger.post(f"/api/bookings/{booking}/cancel").status_code == 404
