"""More than one customer at a time: bookable resources (ALY-258, D-069, spec 026).

A shop that lists no resources is exactly as before (every test in test_bookings.py
covers that and passes untouched). A shop that lists chairs, people or rooms takes one
customer at a time per resource."""

import asyncio
import json
from datetime import datetime
from uuid import UUID, uuid4

import asyncpg
import pytest

from alyr.modules.bookings import service
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_bookings import book, service_id, times
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in


def customers(client, how_many=4):
    people = client.get("/api/ledger/summary").json()["customers"]
    return [p["id"] for p in people[:how_many]]


def add(client, name):
    response = client.post("/api/resources", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def chairs(client, how_many=2):
    return [add(client, f"Chair {n}") for n in range(1, how_many + 1)]


def who(response):
    assert response.status_code == 200, response.text
    return response.json()["resource"]


def listed(client):
    return {b["id"]: b for b in client.get("/api/bookings").json()["bookings"]}


def day_slots(client, sid):
    free = times(client, sid)
    return free[0], free[-1]


# ----------------------------------------------------------- a shop with none is unchanged

def test_a_shop_with_no_resources_still_takes_one_customer_at_a_time(client):
    sid = service_id(client)
    first, _ = day_slots(client, sid)
    a, b = customers(client, 2)
    made = book(client, sid, first, a)
    assert made.status_code == 200 and made.json()["resource"] is None
    assert book(client, sid, first, b).status_code == 409
    assert client.get("/api/resources").json() == {"resources": []}
    assert listed(client)[made.json()["id"]]["resource"] is None


# -------------------------------------------------------------------- two chairs, two customers

def test_two_customers_can_have_the_same_time_on_two_resources_and_a_third_cannot(client):
    sid = service_id(client)
    chairs(client)
    first, _ = day_slots(client, sid)
    a, b, c = customers(client, 3)

    assert first in times(client, sid)
    assert who(book(client, sid, first, a)) == "Chair 1"
    assert first in times(client, sid)              # still free on the second chair
    assert who(book(client, sid, first, b)) == "Chair 2"
    assert first not in times(client, sid)          # now it is not
    refused = book(client, sid, first, c)
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "not_free"


def test_cancelling_frees_exactly_that_resource(client):
    sid = service_id(client)
    chairs(client)
    first, _ = day_slots(client, sid)
    a, b, c = customers(client, 3)
    made_a = book(client, sid, first, a).json()
    book(client, sid, first, b)
    assert client.post(f"/api/bookings/{made_a['id']}/cancel").status_code == 200

    assert first in times(client, sid)
    assert who(book(client, sid, first, c)) == "Chair 1"     # the one A gave back
    assert first not in times(client, sid)


def test_the_listing_and_the_record_say_which_resource(client):
    sid = service_id(client)
    chairs(client)
    first, _ = day_slots(client, sid)
    a, = customers(client, 1)
    made = book(client, sid, first, a).json()
    row = listed(client)[made["id"]]
    assert row["resource"]["name"] == "Chair 1"
    entry = owner_sql(
        "select detail from activity where action = 'booked' and subject_id = $1::uuid",
        made["id"],
    )[0]
    assert json.loads(entry["detail"])["resource"] == "Chair 1"


# ------------------------------------------------------------------ which resource does what

def test_a_service_can_be_limited_to_some_resources(client):
    one, other = service_id(client), service_id(client, "Lighting consultation")
    chair1, chair2 = chairs(client)
    done = client.put(f"/api/services/{one}/resources", json={"resource_ids": [chair2]})
    assert done.status_code == 200
    first, _ = day_slots(client, one)
    a, b, c = customers(client, 3)

    assert who(book(client, one, first, a)) == "Chair 2"
    # Chair 1 is free but does not do this service, so a second customer for it is refused...
    assert book(client, one, first, b).status_code == 409
    # ...while a service nobody narrowed still uses it.
    free_other = times(client, other)
    assert free_other
    assert who(book(client, other, free_other[0], c)) in ("Chair 1", "Chair 2")


def test_an_empty_list_means_every_resource_again(client):
    sid = service_id(client)
    chair1, chair2 = chairs(client)
    client.put(f"/api/services/{sid}/resources", json={"resource_ids": [chair2]})
    client.put(f"/api/services/{sid}/resources", json={"resource_ids": []})
    first, _ = day_slots(client, sid)
    a, b = customers(client, 2)
    assert who(book(client, sid, first, a)) == "Chair 1"
    assert who(book(client, sid, first, b)) == "Chair 2"


def test_a_switched_off_resource_takes_no_new_bookings_but_keeps_its_own(client):
    sid = service_id(client)
    chair1, chair2 = chairs(client)
    first, _ = day_slots(client, sid)
    a, b, c = customers(client, 3)
    made = book(client, sid, first, a).json()                       # Chair 1
    assert client.post(f"/api/resources/{chair1}/active", json={"active": False}).status_code == 200

    assert listed(client)[made["id"]]["resource"]["name"] == "Chair 1"   # it stays
    assert who(book(client, sid, first, b)) == "Chair 2"
    assert book(client, sid, first, c).status_code == 409                 # no third


def test_the_last_active_resource_cannot_be_switched_off(client):
    chair1, chair2 = chairs(client)
    assert client.post(f"/api/resources/{chair1}/active", json={"active": False}).status_code == 200
    last = client.post(f"/api/resources/{chair2}/active", json={"active": False})
    assert last.status_code == 409 and last.json()["detail"]["code"] == "last_resource"


# ------------------------------------------------------------------- the first resource

def test_the_first_resource_takes_over_the_bookings_to_come(client):
    sid = service_id(client)
    first, _ = day_slots(client, sid)
    a, b, c = customers(client, 3)
    made = book(client, sid, first, a).json()                        # made before any resource
    assert listed(client)[made["id"]]["resource"] is None

    chairs(client)                                                  # Chair 1 holds A's visit
    assert listed(client)[made["id"]]["resource"]["name"] == "Chair 1"
    assert who(book(client, sid, first, b)) == "Chair 2"            # not on top of A
    assert book(client, sid, first, c).status_code == 409


# ----------------------------------------------------------------------------- moving

def test_a_move_keeps_the_same_chair_when_it_is_free_and_takes_another_when_it_is_not(client):
    sid = service_id(client)
    chairs(client)
    first, last = day_slots(client, sid)
    a, c = customers(client, 2)
    made_a = book(client, sid, first, a).json()                      # Chair 1 at the start
    assert who(book(client, sid, last, c)) == "Chair 1"              # Chair 1 again, later

    moved = client.post(f"/api/bookings/{made_a['id']}/move", json={"starts_at": last})
    assert moved.status_code == 200, moved.text
    # Chair 1 is taken at that time, so A goes to Chair 2 rather than being refused.
    assert listed(client)[made_a["id"]]["resource"]["name"] == "Chair 2"


def test_a_move_to_a_time_nothing_is_free_leaves_the_booking_where_it_was(client):
    sid = service_id(client)
    chairs(client)
    first, last = day_slots(client, sid)
    a, b, c = customers(client, 3)
    made = book(client, sid, first, a).json()
    book(client, sid, last, b)
    book(client, sid, last, c)                                       # both chairs busy at `last`
    refused = client.post(f"/api/bookings/{made['id']}/move", json={"starts_at": last})
    assert refused.status_code == 409
    row = listed(client)[made["id"]]
    assert datetime.fromisoformat(row["starts_at"]) == datetime.fromisoformat(first)
    assert row["status"] == "booked" and row["resource"]["name"] == "Chair 1"


# ---------------------------------------------------- the same moment, in the database

def test_four_customers_taking_the_same_time_at_once_share_two_resources_and_no_more(client):
    sid = service_id(client)
    chairs(client)
    first, _ = day_slots(client, sid)
    people = customers(client, 4)
    starts = datetime.fromisoformat(first)

    async def go():
        async def one(contact):
            async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
                return await service.create_booking(
                    conn, DEMO_TENANT_ID, client.app.state.outbound, UUID(contact),
                    UUID(sid), starts,
                )
        return await asyncio.gather(*(one(p) for p in people), return_exceptions=True)

    outcomes = client.portal.call(go)
    won = [o for o in outcomes if isinstance(o, dict)]
    lost = [o for o in outcomes if isinstance(o, service.BookingError)]
    assert len(won) == 2 and len(lost) == 2, outcomes
    assert {o["resource"] for o in won} == {"Chair 1", "Chair 2"}
    assert all(o.code == "not_free" for o in lost)


def test_the_database_itself_refuses_two_bookings_on_one_resource():
    """Even code that forgot to look cannot put two customers on one chair."""
    resource = owner_sql(
        "insert into booking_resources (tenant_id, name) values ($1, 'Chair X') returning id",
        DEMO_TENANT_ID,
    )[0]["id"]
    contact = owner_sql(
        "select id from contacts where tenant_id = $1 and role = 'customer' limit 1",
        DEMO_TENANT_ID,
    )[0]["id"]
    svc = owner_sql("select id from services where tenant_id = $1 limit 1", DEMO_TENANT_ID)[0]["id"]
    row = (
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at, resource_id) values ($1, $2, $3, $4, 'x', "
        "'2031-05-05 10:00+00', '2031-05-05 11:00+00', $5)"
    )
    owner_sql(row, DEMO_TENANT_ID, 9001, contact, svc, resource)
    with pytest.raises(asyncpg.ExclusionViolationError):
        owner_sql(row, DEMO_TENANT_ID, 9002, contact, svc, resource)
    # A different resource at the same time is fine; so is the shop's one lane beside it.
    other = owner_sql(
        "insert into booking_resources (tenant_id, name) values ($1, 'Chair Y') returning id",
        DEMO_TENANT_ID,
    )[0]["id"]
    owner_sql(row, DEMO_TENANT_ID, 9003, contact, svc, other)
    owner_sql(row.replace("$5)", "null)"), DEMO_TENANT_ID, 9004, contact, svc)
    with pytest.raises(asyncpg.ExclusionViolationError):
        owner_sql(row.replace("$5)", "null)"), DEMO_TENANT_ID, 9005, contact, svc)


# ------------------------------------------------------------------- who may change them

def test_an_agent_can_see_the_resources_but_not_change_them(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    chair = add(owner, "Chair 1")

    assert [r["name"] for r in agent.get("/api/resources").json()["resources"]] == ["Chair 1"]
    assert agent.post("/api/resources", json={"name": "Mine"}).status_code == 403
    assert agent.patch(f"/api/resources/{chair}", json={"name": "Mine"}).status_code == 403
    assert agent.post(f"/api/resources/{chair}/active", json={"active": False}).status_code == 403
    sid = service_id(owner)
    assert agent.put(f"/api/services/{sid}/resources", json={"resource_ids": []}).status_code == 403
    assert [r["name"] for r in owner.get("/api/resources").json()["resources"]] == ["Chair 1"]


def test_one_shops_resources_are_not_another_shops(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    # Building a client resets the demo shop, so both exist before anyone signs in.
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    chair = add(owner, "Chair 1")

    assert stranger.get("/api/resources").json() == {"resources": []}
    # The other shop can neither rename the demo shop's chair nor switch it off.
    assert stranger.patch(f"/api/resources/{chair}", json={"name": "Taken"}).status_code == 404
    assert [r["name"] for r in owner.get("/api/resources").json()["resources"]] == ["Chair 1"]


def test_choosing_a_resource_that_is_not_the_shops_is_refused(client):
    sid = service_id(client)
    chairs(client)
    first, _ = day_slots(client, sid)
    a, = customers(client, 1)
    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await service.create_booking(
                conn, DEMO_TENANT_ID, client.app.state.outbound, UUID(a), UUID(sid),
                datetime.fromisoformat(first), resource_id=uuid4(),
            )

    with pytest.raises(service.BookingError) as refused:
        client.portal.call(go)
    assert refused.value.code == "unknown_resource"
