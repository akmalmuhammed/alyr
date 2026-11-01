"""The people and chairs screen (ALY-259, D-143, spec 043): what each does and how many bookings
they have ahead, retiring someone without leaving a service with nobody, the order they are
listed in (which is also who "anyone" takes first), and what the first one added takes over.
Through the real routes and PostgreSQL."""

from alyr.modules.bookings import service
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_booking_hours_closures import free
from test_booking_resources import add, chairs, customers, who
from test_bookings import PAGE, a_working_day, book, service_id
from test_bookings_services import made
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in


def people(client):
    return {r["name"]: r for r in client.get("/api/resources").json()["resources"]}


# --------------------------------------------------------------------- what each one does

def test_each_person_says_what_they_do_and_how_many_bookings_they_have_ahead(client):
    one, two = chairs(client)
    sid = service_id(client)
    only_two = made(client, resource_ids=[two])
    everyone = people(client)
    listed_now = client.get("/api/services").json()["services"]
    assert only_two not in everyone["Chair 1"]["does"] and only_two in everyone["Chair 2"]["does"]
    assert everyone["Chair 2"]["does_all"] is True and everyone["Chair 1"]["does_all"] is False
    assert len(everyone["Chair 2"]["does"]) == len(listed_now)
    assert everyone["Chair 1"]["upcoming"] == 0

    taken = book(client, sid, free(client, sid, a_working_day())[0], customers(client, 1)[0])
    assert taken.status_code == 200
    ahead = {r["name"]: r["upcoming"] for r in people(client).values()}
    assert sorted(ahead.values()) == [0, 1]


def test_a_hidden_service_is_not_counted_in_what_a_person_does(client):
    one, two = chairs(client)
    hidden = made(client)
    client.post(f"/api/services/{hidden}/active", json={"active": False})
    assert hidden not in people(client)["Chair 1"]["does"]
    assert people(client)["Chair 1"]["does_all"] is True


# ----------------------------------------------------------------------------- retiring

def test_nobody_can_be_retired_who_is_the_only_one_for_a_service(client):
    one, two = chairs(client)
    only_two = made(client, name="Chair-two only", resource_ids=[two])
    refused = client.post(f"/api/resources/{two}/active", json={"active": False})
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail["code"] == "service_needs_someone" and detail["services"] == ["Chair-two only"]
    assert people(client)["Chair 2"]["active"] is True
    # The other chair is not the only one for anything, so it can go (and come back).
    assert client.post(f"/api/resources/{one}/active", json={"active": False}).status_code == 200
    client.post(f"/api/resources/{one}/active", json={"active": True})
    # Open the service to everyone, and the second chair may go too.
    assert client.patch(f"/api/services/{only_two}", json={"resource_ids": []}).status_code == 200
    assert client.post(f"/api/resources/{two}/active", json={"active": False}).status_code == 200


def test_the_last_active_one_still_cannot_be_retired(client):
    one, two = chairs(client)
    client.post(f"/api/resources/{one}/active", json={"active": False})
    last = client.post(f"/api/resources/{two}/active", json={"active": False})
    assert last.status_code == 409 and last.json()["detail"]["code"] == "last_resource"


def test_retiring_someone_keeps_their_bookings_and_stops_new_ones(client):
    one, two = chairs(client)
    sid = service_id(client)
    a, b = customers(client, 2)
    first = book(client, sid, free(client, sid, a_working_day())[0], a)
    assert who(first) == "Chair 1"
    assert client.post(f"/api/resources/{one}/active", json={"active": False}).status_code == 200
    assert people(client)["Chair 1"]["upcoming"] == 1, "the booking stays with them"
    mine = {x["id"]: x for x in client.get("/api/bookings").json()["bookings"]}[first.json()["id"]]
    assert mine["status"] == "booked"
    second = book(client, sid, free(client, sid, a_working_day())[0], b)
    assert who(second) == "Chair 2", "new bookings go to someone still taking them"


# -------------------------------------------------------------------------------- adding

def test_the_first_person_added_takes_over_the_bookings_still_to_come_and_says_how_many(client):
    sid = service_id(client)
    a, b = customers(client, 2)
    slots = free(client, sid, a_working_day())
    # This shop's own: the database also holds other shops' bookings from earlier tests.
    already = owner_sql(
        "select count(*)::int as n from bookings where tenant_id = $1 and status = 'booked' "
        "and ends_at > now()", DEMO_TENANT_ID
    )[0]["n"]
    assert book(client, sid, slots[0], a).status_code == 200
    assert book(client, sid, slots[4], b).status_code == 200
    first = client.post("/api/resources", json={"name": "Reem"})
    assert first.status_code == 200 and first.json()["adopted"] == already + 2
    second = client.post("/api/resources", json={"name": "Huda"})
    assert second.json()["adopted"] == 0
    assert people(client)["Reem"]["upcoming"] == already + 2


def test_a_person_needs_a_name_and_a_shop_has_a_limit(client, monkeypatch):
    blank = client.post("/api/resources", json={"name": "   "})
    assert blank.status_code == 422 and blank.json()["detail"]["code"] == "bad_name"
    monkeypatch.setattr(service, "MAX_RESOURCES", 2)
    add(client, "One")
    add(client, "Two")
    full = client.post("/api/resources", json={"name": "Three"})
    assert full.status_code == 422 and full.json()["detail"]["code"] == "too_many_resources"


# ------------------------------------------------------------------------------- the order

def test_people_are_put_in_order_and_anyone_takes_the_first(client):
    one, two = chairs(client)
    sid = service_id(client)
    slot = free(client, sid, a_working_day())[0]
    assert [r["name"] for r in client.get("/api/resources").json()["resources"]] == [
        "Chair 1", "Chair 2"]
    moved = client.put("/api/resources/order", json={"ids": [two, one]})
    assert moved.status_code == 200
    assert [r["name"] for r in moved.json()["resources"]] == ["Chair 2", "Chair 1"]
    assert [r["name"] for r in client.get(PAGE).json()["resources"]] == ["Chair 2", "Chair 1"]
    assert who(book(client, sid, slot, customers(client, 1)[0])) == "Chair 2"


def test_an_order_must_name_every_one_once(client):
    one, two = chairs(client)
    stranger = "0a1f0000-0000-4000-8000-00000000dead"
    for ids in ([one], [one, one], [one, two, two], [one, stranger], []):
        bad = client.put("/api/resources/order", json={"ids": ids})
        assert bad.status_code == 422 and bad.json()["detail"]["code"] == "bad_order", ids
    assert [r["name"] for r in client.get("/api/resources").json()["resources"]] == [
        "Chair 1", "Chair 2"]


def test_services_are_put_in_order_hidden_ones_too(client):
    everything = client.get("/api/services").json()["services"]
    ids = [s["id"] for s in everything]
    client.post(f"/api/services/{ids[0]}/active", json={"active": False})
    reversed_ids = list(reversed(ids))
    moved = client.put("/api/services/order", json={"ids": reversed_ids})
    assert moved.status_code == 200
    assert [s["id"] for s in moved.json()["services"]] == reversed_ids
    shown = [s["id"] for s in client.get(PAGE).json()["services"]]
    assert shown == [i for i in reversed_ids if i != ids[0]], "the page follows it, minus hidden"
    short = client.put("/api/services/order", json={"ids": ids[:-1]})
    assert short.status_code == 422 and short.json()["detail"]["code"] == "bad_order"


# ------------------------------------------------------------------------ who may do this

def test_an_agent_can_read_the_people_but_not_change_the_order_or_who_is_retired(
    client_factory, monkeypatch
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    one, two = chairs(owner)
    assert agent.get("/api/resources").status_code == 200
    assert agent.put("/api/resources/order", json={"ids": [two, one]}).status_code == 403
    assert agent.put("/api/services/order", json={"ids": []}).status_code == 403
    assert agent.post("/api/resources", json={"name": "Mine"}).status_code == 403
    assert [r["name"] for r in owner.get("/api/resources").json()["resources"]] == [
        "Chair 1", "Chair 2"]


def test_another_shop_cannot_reorder_this_shops_people(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    one, two = chairs(owner)
    refused = stranger.put("/api/resources/order", json={"ids": [two, one]})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "bad_order"
    assert [r["name"] for r in owner.get("/api/resources").json()["resources"]] == [
        "Chair 1", "Chair 2"]
