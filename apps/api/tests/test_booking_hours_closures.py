"""Opening hours with a break, and days off (ALY-259, D-141, spec 043).

A shop's week may have several periods a day (a midday break is a gap between two), and the
shop, or one person or chair, may be closed on days: nobody can book them, the bookings already
there stay until the shop moves them, and the booking page and the day view say so. Through the
real routes, the engine and PostgreSQL.
"""

from datetime import UTC, datetime, timedelta, timezone

from alyr.modules.bookings import service
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_booking_resources import chairs, customers, who
from test_bookings import PAGE, a_working_day, book, service_id
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in

QATAR = timezone(timedelta(hours=3))


def weekday_of(day) -> int:
    """The week as the engine counts it: 0 is Sunday."""
    return (day.weekday() + 1) % 7


def local(moment: str) -> str:
    return (datetime.fromisoformat(moment).astimezone(UTC) + timedelta(hours=3)).strftime("%H:%M")


def free(client, sid, day, resource_id=None) -> list[str]:
    params = {"service_id": sid, "day": day.isoformat()} | (
        {"resource_id": resource_id} if resource_id else {})
    response = client.get(f"{PAGE}/times", params=params)
    assert response.status_code == 200, response.text
    return response.json()["times"]


def times_answer(client, sid, day) -> dict:
    return client.get(f"{PAGE}/times", params={"service_id": sid, "day": day.isoformat()}).json()


def close(client, first, last=None, **fields):
    return client.post("/api/closures", json={
        "first": first.isoformat(), "last": (last or first).isoformat()} | fields)


def second_working_day(first):
    day = first + timedelta(days=1)
    return day + timedelta(days=1) if day.weekday() == 4 else day


# ------------------------------------------------------------------------ opening hours

def test_a_break_in_the_middle_of_the_day_is_two_periods(client):
    sid = service_id(client)
    day = a_working_day()
    saved = client.put("/api/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "09:00", "closes": "12:00"},
        {"weekday": weekday_of(day), "opens": "15:00", "closes": "18:00"},
    ]})
    assert saved.status_code == 200
    shown = {local(t) for t in free(client, sid, day)}
    assert {"09:00", "15:00"} <= shown
    assert not shown & {"12:00", "12:30", "13:00", "14:00", "14:30"}, "nothing in the break"
    assert max(t for t in shown if t < "12:30") <= "11:30"


def test_two_periods_that_overlap_are_refused_and_the_old_week_stays(client):
    day = a_working_day()
    client.put("/api/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "10:00", "closes": "20:00"}]})
    before = client.get("/api/hours").json()
    overlapping = client.put("/api/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "09:00", "closes": "13:00"},
        {"weekday": weekday_of(day), "opens": "12:00", "closes": "18:00"},
    ]})
    assert overlapping.status_code == 422
    assert overlapping.json()["detail"]["code"] == "bad_hours_overlap"
    assert client.get("/api/hours").json() == before
    touching = client.put("/api/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "09:00", "closes": "13:00"},
        {"weekday": weekday_of(day), "opens": "13:00", "closes": "18:00"},
    ]})
    assert touching.status_code == 200


def test_a_person_can_keep_a_break_in_their_own_hours_too(client):
    one, two = chairs(client)
    sid = service_id(client)
    day = a_working_day()
    mine = client.put(f"/api/resources/{one}/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "09:00", "closes": "11:00"},
        {"weekday": weekday_of(day), "opens": "16:00", "closes": "18:00"},
    ]})
    assert mine.status_code == 200
    shown = {local(t) for t in free(client, sid, day, one)}
    assert "09:00" in shown and "16:00" in shown and "13:00" not in shown
    clash = client.put(f"/api/resources/{one}/hours", json={"periods": [
        {"weekday": weekday_of(day), "opens": "09:00", "closes": "13:00"},
        {"weekday": weekday_of(day), "opens": "10:00", "closes": "14:00"},
    ]})
    assert clash.status_code == 422 and clash.json()["detail"]["code"] == "bad_hours_overlap"
    assert "13:00" not in {local(t) for t in free(client, sid, day, one)}


# ----------------------------------------------------------------------- the whole shop

def test_a_closed_day_offers_no_times_and_says_why(client):
    sid = service_id(client)
    day = a_working_day()
    assert free(client, sid, day)
    made = close(client, day, reason="Eid al-Fitr", reason_ar="عيد الفطر")
    assert made.status_code == 200, made.text
    answer = times_answer(client, sid, day)
    assert answer["times"] == []
    assert answer["closed"] == {"reason": "Eid al-Fitr", "reason_ar": "عيد الفطر"}
    # The next day is as it was.
    other = second_working_day(day)
    assert free(client, sid, other)
    assert times_answer(client, sid, other)["closed"] is None


def test_nobody_can_book_a_closed_day_even_with_a_time_from_before(client):
    sid = service_id(client)
    day = a_working_day()
    slot = free(client, sid, day)[0]
    close(client, day)
    refused = book(client, sid, slot, customers(client, 1)[0])
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "not_free"


def test_a_range_of_days_and_taking_it_away(client):
    sid = service_id(client)
    first = a_working_day()
    last = first + timedelta(days=3)
    made = close(client, first, last, reason="Eid")
    assert made.status_code == 200
    for n in range(4):
        assert free(client, sid, first + timedelta(days=n)) == [], n
    assert free(client, sid, last + timedelta(days=1)) or (last + timedelta(days=1)).weekday() == 4
    gone = client.delete(f"/api/closures/{made.json()['closure']['id']}")
    assert gone.status_code == 200 and gone.json()["closures"] == []
    assert free(client, sid, first)


def test_a_closure_that_has_begun_still_closes_the_days_left(client):
    sid = service_id(client)
    day = a_working_day()
    began = close(client, datetime.now(QATAR).date() - timedelta(days=1), day)
    assert began.status_code == 200
    assert free(client, sid, day) == []


def test_a_booking_inside_a_closure_stays_and_is_counted(client):
    sid = service_id(client)
    day = a_working_day()
    taken = book(client, sid, free(client, sid, day)[0], customers(client, 1)[0])
    assert taken.status_code == 200
    made = close(client, day, reason="Closed for repairs")
    assert made.json()["closure"]["standing"] == 1
    assert client.get("/api/closures").json()["closures"][0]["standing"] == 1
    mine = {b["id"]: b for b in client.get("/api/bookings").json()["bookings"]}[taken.json()["id"]]
    assert mine["status"] == "booked", "a closure never cancels a booking"


def test_staff_can_still_write_a_visit_down_on_a_closed_day(client):
    sid = service_id(client)
    day = a_working_day()
    close(client, day)
    noon = datetime(day.year, day.month, day.day, 12, tzinfo=QATAR).isoformat()
    walk_in = client.post("/api/bookings", json={
        "service_id": sid, "starts_at": noon, "walk_in": False,
        "customer": {"name": "Regular Rana", "phone": "97455001122"}})
    assert walk_in.status_code == 200, walk_in.text


# ------------------------------------------------------------------- one person or chair

def test_a_person_on_leave_is_not_offered_and_the_other_chair_still_is(client):
    one, two = chairs(client)
    sid = service_id(client)
    day = a_working_day()
    slot = free(client, sid, day)[0]
    made = close(client, day, resource_id=one, reason="Leave")
    assert made.status_code == 200
    assert made.json()["closure"]["resource"]["name"] == "Chair 1"
    assert free(client, sid, day, one) == []
    assert slot in free(client, sid, day, two)
    assert slot in free(client, sid, day), "anyone: the other chair is working"
    refused = client.post(PAGE, json={
        "token": book_token(client), "service_id": sid, "starts_at": slot, "resource_id": one})
    assert refused.status_code == 409
    assert who(book(client, sid, slot, customers(client, 1)[0])) == "Chair 2"
    # The whole shop, closed on top of that, takes both.
    close(client, day)
    assert free(client, sid, day) == []


def book_token(client):
    from order_links import booking_token
    return booking_token(customers(client, 1)[0])


# --------------------------------------------------------------------------- the rules

def test_a_closure_is_refused_when_it_makes_no_sense(client, monkeypatch):
    day = a_working_day()
    backwards = close(client, day + timedelta(days=2), day)
    assert backwards.status_code == 422 and backwards.json()["detail"]["code"] == "bad_closure"
    too_long = close(client, day, day + timedelta(days=366))
    assert too_long.status_code == 422 and too_long.json()["detail"]["code"] == "bad_closure"
    over = close(client, datetime.now(QATAR).date() - timedelta(days=5),
                 datetime.now(QATAR).date() - timedelta(days=2))
    assert over.status_code == 422 and over.json()["detail"]["code"] == "closure_past"
    nobody = close(client, day, resource_id="0a1f0000-0000-4000-8000-00000000dead")
    assert nobody.status_code == 404 and nobody.json()["detail"]["code"] == "unknown_resource"
    assert client.get("/api/closures").json()["closures"] == []

    monkeypatch.setattr(service, "MAX_CLOSURES", 2)
    assert close(client, day).status_code == 200
    assert close(client, day + timedelta(days=5)).status_code == 200
    full = close(client, day + timedelta(days=9))
    assert full.status_code == 422 and full.json()["detail"]["code"] == "too_many_closures"


def test_only_days_off_still_to_come_are_listed_in_order(client):
    today = datetime.now(QATAR).date()
    owner_sql(
        "insert into booking_closures (tenant_id, first_day, last_day, reason) "
        "values ($1, $2, $3, 'Long past')", DEMO_TENANT_ID, today - timedelta(days=30),
        today - timedelta(days=28))
    close(client, today + timedelta(days=9), reason="Later")
    close(client, today + timedelta(days=3), today + timedelta(days=4), reason="Sooner")
    listed = client.get("/api/closures").json()
    assert listed["today"] == today.isoformat()
    assert [c["reason"] for c in listed["closures"]] == ["Sooner", "Later"]


def test_a_missing_day_off_is_not_found(client):
    gone = client.delete("/api/closures/0a1f0000-0000-4000-8000-00000000dead")
    assert gone.status_code == 404


# ------------------------------------------------------------------- what screens read

def test_the_day_view_says_the_shop_or_a_person_is_closed(client):
    one, two = chairs(client)
    day = a_working_day()
    close(client, day, resource_id=one, reason="Leave")
    view = client.get("/api/bookings/day", params={"day": day.isoformat()}).json()
    by_name = {r["name"]: r for r in view["resources"]}
    assert view["closed"] is None
    assert by_name["Chair 1"]["off"] and by_name["Chair 1"]["today"] == []
    assert by_name["Chair 1"]["leave"]["reason"] == "Leave"
    assert not by_name["Chair 2"]["off"] and by_name["Chair 2"]["leave"] is None

    close(client, day, reason="Eid", reason_ar="عيد")
    view = client.get("/api/bookings/day", params={"day": day.isoformat()}).json()
    assert view["closed"] == {"reason": "Eid", "reason_ar": "عيد"}
    assert all(r["off"] and r["today"] == [] for r in view["resources"])


def test_the_booking_page_lists_the_shops_closed_days_but_not_a_persons_leave(client):
    one, _ = chairs(client)
    day = a_working_day()
    close(client, day, day + timedelta(days=1), reason="Eid", reason_ar="عيد")
    close(client, day + timedelta(days=5), resource_id=one, reason="Private leave")
    page = client.get(PAGE).json()
    assert page["closed_days"] == [{
        "first": day.isoformat(), "last": (day + timedelta(days=1)).isoformat(),
        "reason": "Eid", "reason_ar": "عيد"}]
    assert "Private leave" not in str(page)


def test_a_closure_follows_the_shops_own_calendar_day(client):
    """A shop 14 hours ahead of UTC: its 9 am is the evening before in UTC. The closure is for the
    shop's day, so it closes the day its customers see, not the UTC day."""
    sid = service_id(client)
    day = a_working_day()
    other = second_working_day(day)
    owner_sql("update tenants set timezone = 'Pacific/Kiritimati' where id = $1", DEMO_TENANT_ID)
    try:
        owner_sql("delete from business_hours where tenant_id = $1", DEMO_TENANT_ID)
        for weekday in range(7):
            owner_sql(
                "insert into business_hours (tenant_id, weekday, opens, closes) "
                "values ($1, $2, '09:00', '17:00')", DEMO_TENANT_ID, weekday)
        assert free(client, sid, day) and free(client, sid, other)
        close(client, day)
        assert free(client, sid, day) == []
        assert free(client, sid, other), "the next shop day is open"
        # A booking on the open day goes through; its shop day is not the closed one.
        taken = book(client, sid, free(client, sid, other)[0], customers(client, 1)[0])
        assert taken.status_code == 200
    finally:
        owner_sql("update tenants set timezone = 'Asia/Qatar' where id = $1", DEMO_TENANT_ID)


# ------------------------------------------------------------------------ who may do this

def test_an_agent_can_see_the_days_off_but_not_change_them(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    day = a_working_day()
    made = close(owner, day, reason="Eid")
    assert made.status_code == 200

    assert [c["reason"] for c in agent.get("/api/closures").json()["closures"]] == ["Eid"]
    assert close(agent, day + timedelta(days=4)).status_code == 403
    assert agent.delete(f"/api/closures/{made.json()['closure']['id']}").status_code == 403
    assert len(owner.get("/api/closures").json()["closures"]) == 1


def test_another_shop_cannot_see_or_remove_this_shops_days_off(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    made = close(owner, a_working_day(), reason="Eid")

    assert stranger.get("/api/closures").json()["closures"] == []
    assert stranger.delete(f"/api/closures/{made.json()['closure']['id']}").status_code == 404
    assert len(owner.get("/api/closures").json()["closures"]) == 1
