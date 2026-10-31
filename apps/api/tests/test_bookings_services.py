"""The services an owner manages from the workspace (ALY-259, D-140, spec 043): add one with its
length, price, deposit and the people or chairs that do it; change it; hide it and show it again.

Through the real routes and PostgreSQL. The price is kept on each booking when it is made
(migration 0100), so changing a service's price never changes a booking already taken.
"""

from alyr.modules.bookings import service
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from test_booking_resources import chairs, customers, who
from test_bookings import PAGE, a_working_day, book, service_id, times
from test_consent import owner_sql
from test_sign_in import other_shop_with_owner, sign_in


def listed(client):
    return {s["name"]: s for s in client.get("/api/services").json()["services"]}


def made(client, **fields):
    body = {"name": "Eyebrow threading", "name_ar": "تشذيب الحاجبين", "duration_minutes": 20,
            "price": 3000} | fields
    response = client.post("/api/services", json=body)
    assert response.status_code == 200, response.text
    return response.json()["id"]


# ------------------------------------------------------------------------------- adding

def test_a_service_is_added_whole_with_its_deposit_and_the_chairs_that_do_it(client):
    one, two = chairs(client)
    new_id = made(client, price=20000, deposit_kind="percent", deposit_value=25,
                  resource_ids=[one])

    mine = listed(client)["Eyebrow threading"]
    assert mine["id"] == new_id and mine["active"] is True
    assert (mine["duration_minutes"], mine["price"]) == (20, 20000)
    assert mine["name_ar"] == "تشذيب الحاجبين"
    assert (mine["deposit_kind"], mine["deposit_value"], mine["deposit"]) == ("percent", 25, 5000)
    assert mine["resource_ids"] == [one] and mine["upcoming"] == 0
    # The customer's page shows it, with the deposit, and nothing only the shop needs.
    page = {s["name"]: s for s in client.get(PAGE).json()["services"]}["Eyebrow threading"]
    assert page["deposit"] == 5000 and "resource_ids" not in page and "upcoming" not in page
    assert two not in mine["resource_ids"]


def test_a_service_for_everyone_lists_nobody_in_particular(client):
    chairs(client)
    made(client)
    assert listed(client)["Eyebrow threading"]["resource_ids"] == []


def test_a_service_with_no_name_or_a_deposit_over_its_price_is_refused_and_nothing_is_made(client):
    before = len(client.get("/api/services").json()["services"])
    blank = client.post("/api/services", json={"name": "   ", "duration_minutes": 20})
    assert blank.status_code == 422 and blank.json()["detail"]["code"] == "bad_name"
    over = client.post("/api/services", json={
        "name": "Too much", "duration_minutes": 20, "price": 3000,
        "deposit_kind": "fixed", "deposit_value": 5000})
    assert over.status_code == 422 and over.json()["detail"]["code"] == "bad_deposit"
    shy = client.post("/api/services", json={
        "name": "Too little", "duration_minutes": 20, "deposit_kind": "fixed",
        "deposit_value": 50})
    assert shy.status_code == 422 and shy.json()["detail"]["code"] == "bad_deposit"
    assert len(client.get("/api/services").json()["services"]) == before


def test_a_share_of_the_price_needs_a_price(client):
    no_price = client.post("/api/services", json={
        "name": "Consultation", "duration_minutes": 20, "price": 0,
        "deposit_kind": "percent", "deposit_value": 20})
    assert no_price.status_code == 422
    assert no_price.json()["detail"]["code"] == "deposit_needs_price"
    sid = made(client, price=10000, deposit_kind="percent", deposit_value=20)
    zero = client.patch(f"/api/services/{sid}", json={"price": 0})
    assert zero.status_code == 422 and zero.json()["detail"]["code"] == "deposit_needs_price"
    assert listed(client)["Eyebrow threading"]["price"] == 10000


def test_a_bad_chair_leaves_no_half_made_service(client):
    chairs(client)
    stranger = other_shop_with_owner("rana@other.example")
    other_chair = owner_sql(
        "insert into booking_resources (tenant_id, name) values ($1, 'Theirs') returning id",
        stranger)[0]["id"]
    refused = client.post("/api/services", json={
        "name": "Ghost", "duration_minutes": 30, "resource_ids": [str(other_chair)]})
    assert refused.status_code == 404 and refused.json()["detail"]["code"] == "unknown_resource"
    assert "Ghost" not in listed(client)


def test_a_shop_cannot_list_more_than_a_hundred_services(client, monkeypatch):
    monkeypatch.setattr(service, "MAX_SERVICES", len(listed(client)) + 1)
    made(client, name="The last one")
    full = client.post("/api/services", json={"name": "One too many", "duration_minutes": 30})
    assert full.status_code == 422 and full.json()["detail"]["code"] == "too_many_services"


# ------------------------------------------------------------------------------ changing

def test_a_service_is_renamed_in_both_languages_and_repriced(client):
    sid = service_id(client)
    changed = client.patch(f"/api/services/{sid}", json={
        "name": "Site visit", "name_ar": "زيارة موقع", "duration_minutes": 90, "price": 18000})
    assert changed.status_code == 200
    mine = {s["id"]: s for s in changed.json()["services"]}[sid]
    assert (mine["name"], mine["name_ar"], mine["duration_minutes"], mine["price"]) == (
        "Site visit", "زيارة موقع", 90, 18000)
    blank = client.patch(f"/api/services/{sid}", json={"name": "  "})
    assert blank.status_code == 422 and blank.json()["detail"]["code"] == "bad_name"
    assert listed(client)["Site visit"]["price"] == 18000


def test_a_price_cannot_go_under_a_fixed_deposit_but_both_can_change_together(client):
    sid = made(client, price=20000, deposit_kind="fixed", deposit_value=5000)
    lower = client.patch(f"/api/services/{sid}", json={"price": 4000})
    assert lower.status_code == 422 and lower.json()["detail"]["code"] == "bad_deposit"
    assert listed(client)["Eyebrow threading"]["price"] == 20000
    both = client.patch(f"/api/services/{sid}", json={
        "price": 4000, "deposit_kind": "fixed", "deposit_value": 1000})
    assert both.status_code == 200
    assert listed(client)["Eyebrow threading"]["deposit"] == 1000
    none = client.patch(f"/api/services/{sid}", json={"deposit_kind": "none"})
    mine = {s["id"]: s for s in none.json()["services"]}[sid]
    assert (mine["deposit_kind"], mine["deposit_value"], mine["deposit"]) == ("none", 0, 0)


def test_who_does_a_service_is_changed_with_the_rest_and_empty_means_everyone(client):
    one, two = chairs(client)
    sid = made(client)
    client.patch(f"/api/services/{sid}", json={"resource_ids": [two]})
    assert listed(client)["Eyebrow threading"]["resource_ids"] == [two]
    # Leaving it out leaves it as it was; an empty list opens it to everyone again.
    client.patch(f"/api/services/{sid}", json={"price": 3500})
    assert listed(client)["Eyebrow threading"]["resource_ids"] == [two]
    client.patch(f"/api/services/{sid}", json={"resource_ids": []})
    assert listed(client)["Eyebrow threading"]["resource_ids"] == []
    assert one not in listed(client)["Eyebrow threading"]["resource_ids"]


def test_only_the_chosen_chair_takes_the_service(client):
    one, two = chairs(client)
    sid = made(client, duration_minutes=30, resource_ids=[two])
    a, = customers(client, 1)
    first = times(client, sid)[0]
    assert who(book(client, sid, first, a)) == "Chair 2"


def test_the_booking_page_says_who_does_each_service(client):
    """A chair with nothing chosen for it does every service only while no service is narrowed, so
    the page is told who does each one and offers exactly them."""
    one, two = chairs(client)
    made(client, resource_ids=[two])
    by_name = {s["name"]: s for s in client.get(PAGE).json()["services"]}
    assert by_name["Eyebrow threading"]["doers"] == [two]
    assert by_name["Electrician site visit"]["doers"] == [one, two]
    # A chair switched off is not offered for anything.
    client.post(f"/api/resources/{one}/active", json={"active": False})
    by_name = {s["name"]: s for s in client.get(PAGE).json()["services"]}
    assert by_name["Electrician site visit"]["doers"] == [two]
    assert client.get(PAGE).json()["services"][0]["doers"] == [two]


def test_a_missing_service_is_not_found(client):
    gone = "0a1f0000-0000-4000-8000-00000000dead"
    assert client.patch(f"/api/services/{gone}", json={"price": 1}).status_code == 404
    assert client.post(f"/api/services/{gone}/active", json={"active": False}).status_code == 404


# ---------------------------------------------------------------------- hiding and showing

def test_a_hidden_service_leaves_the_booking_page_but_keeps_its_bookings(client):
    sid = service_id(client)
    a, = customers(client, 1)
    taken = book(client, sid, times(client, sid)[0], a)
    assert taken.status_code == 200
    assert listed(client)["Electrician site visit"]["upcoming"] == 1

    hidden = client.post(f"/api/services/{sid}/active", json={"active": False})
    assert hidden.status_code == 200
    assert not {s["id"]: s for s in hidden.json()["services"]}[sid]["active"]
    assert "Electrician site visit" not in [s["name"] for s in client.get(PAGE).json()["services"]]
    mine = listed(client)["Electrician site visit"]
    assert mine["active"] is False and mine["upcoming"] == 1   # the visit is still on the books
    ahead = client.get("/api/bookings").json()["bookings"]
    assert any(b["id"] == taken.json()["id"] for b in ahead)
    # Nobody can book it while it is hidden, from the page or from the desk.
    day = a_working_day().isoformat()
    assert client.get(f"{PAGE}/times", params={"service_id": sid, "day": day}).status_code == 404

    client.post(f"/api/services/{sid}/active", json={"active": True})
    assert "Electrician site visit" in [s["name"] for s in client.get(PAGE).json()["services"]]


# ----------------------------------------------------- the price a booking was made at

def test_a_price_change_does_not_change_a_booking_already_made(client):
    sid = made(client, name="Blow-dry", price=10000, deposit_kind="percent", deposit_value=30,
               duration_minutes=30)
    a, b = customers(client, 2)
    slots = times(client, sid)
    # A deposit holds the time until it is paid, so the second one is a plain booking.
    first = book(client, sid, slots[0], a)
    assert first.status_code == 200, first.text
    row = {r["id"]: r for r in client.get("/api/bookings").json()["bookings"]}[first.json()["id"]]
    assert (row["price"], row["deposit"], row["left_to_pay"]) == (10000, 3000, 10000)

    client.patch(f"/api/services/{sid}", json={"price": 15000})

    row = {r["id"]: r for r in client.get("/api/bookings").json()["bookings"]}[first.json()["id"]]
    assert (row["price"], row["deposit"], row["left_to_pay"]) == (10000, 3000, 10000)
    second = book(client, sid, slots[2], b)
    assert second.status_code == 200, second.text
    row = {r["id"]: r for r in client.get("/api/bookings").json()["bookings"]}[second.json()["id"]]
    assert (row["price"], row["deposit"]) == (15000, 4500)


def test_a_booking_inserted_without_a_price_takes_its_services_price(client):
    sid = service_id(client)
    owner_sql("update services set price = 12300 where id = $1", sid)
    contact, = customers(client, 1)
    booking = owner_sql(
        "insert into bookings (tenant_id, number, contact_id, service_id, service_name, "
        "starts_at, ends_at) values ($1, 9100, $2, $3, 'x', now() + interval '1 day', "
        "now() + interval '1 day 1 hour') returning price", DEMO_TENANT_ID, contact, sid)
    assert booking[0]["price"] == 12300
    owner_sql("update services set price = 1 where id = $1", sid)
    assert owner_sql("select price from bookings where number = 9100")[0]["price"] == 12300


# ------------------------------------------------------------------------ who may do this

def test_an_agent_can_read_the_services_but_not_change_them(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    sign_in(owner)
    sign_in(agent, AGENT_EMAIL)
    sid = service_id(owner)

    assert agent.get("/api/services").status_code == 200
    mine = {"name": "Mine", "duration_minutes": 30}
    assert agent.post("/api/services", json=mine).status_code == 403
    assert agent.patch(f"/api/services/{sid}", json={"price": 1}).status_code == 403
    assert agent.post(f"/api/services/{sid}/active", json={"active": False}).status_code == 403
    assert "Mine" not in listed(owner)


def test_another_shop_cannot_touch_this_shops_services(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, stranger = client_factory(), client_factory()
    other = other_shop_with_owner()
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", other)
    sign_in(owner)
    sign_in(stranger, "omar@other.example")
    sid = service_id(owner)

    assert stranger.get("/api/services").json() == {"services": []}
    assert stranger.patch(f"/api/services/{sid}", json={"price": 1}).status_code == 404
    assert stranger.post(f"/api/services/{sid}/active", json={"active": False}).status_code == 404
    assert listed(owner)["Electrician site visit"]["active"] is True
