"""A salon starts as a salon (T9, D-196): the beauty-salon starting setup, several people to begin
with, Arabic names that do not go stale when a name is edited, and a business made in the back
office with its private test line (and, when it is given a salon template, the same starting setup
as one made at /start)."""

from uuid import UUID, uuid4

import pytest

from alyr import presets
from alyr.seed import ALYR_STAFF_EMAIL
from order_links import booking_token
from test_bookings import a_working_day
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_sign_in import code_for, sign_in

SALON = presets.PRESET_BY_KEY["salon"]
BARBER_WORDS = ("beard", "barber", "shave", "kids", "لحية", "حلاقة")


# ── the starting setup, as data ──────────────────────────────────────────────────────────

def test_the_salon_list_is_a_beauty_salons_not_a_barbers_and_is_bilingual():
    names = [s.name for s in SALON.services]
    assert len(names) == len(set(names))
    for trade in ("Hair colour", "Manicure", "Pedicure", "Facial", "Eyelash extensions", "Makeup"):
        assert trade in names
    for s in SALON.services:
        assert s.name_ar.strip() and s.name != s.name_ar
        assert s.minutes % 5 == 0 and 15 <= s.minutes <= 180
        assert 2000 <= s.price <= 40000  # QAR 20 to 400: examples, in dirhams
        assert not any(w in (s.name + s.name_ar).lower() for w in BARBER_WORDS)


def test_a_salon_has_several_people_with_both_names_and_the_hours_of_a_week():
    assert len(SALON.people) >= 2
    for person in SALON.people:
        assert person.name.strip() and person.name_ar.strip() and person.kind == "person"
    assert {day for day, _, _ in SALON.hours} == {0, 1, 2, 3, 4, 5, 6}


def test_the_retail_samples_suit_a_salon_and_have_both_names():
    setup = SALON.catalog
    assert setup is not None and setup.optional
    assert len(setup.samples) >= 3
    assert not any("beard" in s.name.lower() for s in setup.samples)
    assert all(s.name_ar.strip() for s in setup.samples)


@pytest.mark.parametrize(("old", "old_ar", "new", "expected"), [
    # a sample's Arabic describes the sample: gone on a rename
    ("Hair colour", "صبغ الشعر", "Balayage", ""),
    ("Team member 1", "عضو الفريق 1", "Noor", ""),
    # another trade's sample name, with its own Arabic, is recognised too
    ("Facial", "تنظيف بشرة", "Deep facial", ""),
    # an Arabic name the owner wrote, or one for a name that was never a sample, stays
    ("Hair colour", "تلوين الشعر", "Balayage", None),
    ("Lash lift", "رفع الرموش", "Lash lift & tint", None),
    # no real rename, nothing to say
    ("Hair colour", "صبغ الشعر", "Hair colour", None),
    ("Hair colour", "صبغ الشعر", "  Hair colour ", None),
    ("Hair colour", "صبغ الشعر", "   ", None),
    ("Hair colour", "", "Balayage", None),
])
def test_the_arabic_of_a_sample_is_dropped_only_when_its_name_is_changed(
    old, old_ar, new, expected
):
    assert presets.kept_arabic(old, old_ar, new) == expected


# ── a new salon, through /start ──────────────────────────────────────────────────────────

def test_a_new_salon_starts_with_its_services_its_people_and_the_arabic_of_both(client):
    new_business(client)
    state = client.get(f"{BASE}/state").json()
    assert [s["name"] for s in state["services"]] == [s.name for s in SALON.services]
    assert all(s["name_ar"] for s in state["services"])
    assert [p["name"] for p in state["people"]] == [p.name for p in SALON.people]
    assert all(p["name_ar"] for p in state["people"])
    resources = client.get("/api/resources").json()["resources"]
    assert [r["name"] for r in resources if r["active"]] == [p.name for p in SALON.people]
    assert {r["kind"] for r in resources} == {"person"}


def test_a_new_salons_booking_page_offers_the_people_and_both_languages(client):
    _, slug, _ = new_business(client)
    page = client.get(f"/api/book/{slug}").json()
    assert len(page["resources"]) == len(SALON.people)
    assert all(r["name_ar"] for r in page["resources"])
    assert all(s["name_ar"] for s in page["services"])
    # Each service is done by all of them, so the customer may choose, or take anyone.
    assert all(len(s["doers"]) == len(SALON.people) for s in page["services"])


def test_a_new_salon_takes_as_many_customers_at_one_time_as_it_has_people(client):
    tenant, slug, _ = new_business(client)
    page = client.get(f"/api/book/{slug}").json()
    service = page["services"][0]["id"]
    day = a_working_day().isoformat()
    slots = client.get(f"/api/book/{slug}/times", params={"service_id": service, "day": day})
    assert slots.status_code == 200 and slots.json()["times"]
    first = slots.json()["times"][0]
    people = len(SALON.people)
    results = []
    for n in range(people + 1):
        contact = owner_sql(
            "insert into contacts (tenant_id, phone, name) values ($1, $2, $3) returning id",
            tenant, f"+9745550{n:04d}", f"Guest {n}",
        )[0]["id"]
        results.append(client.post(f"/api/book/{slug}", json={
            "token": booking_token(contact, UUID(str(tenant))), "service_id": service,
            "starts_at": first,
        }).status_code)
    # One chair would have refused the second; a team of three takes three, and the fourth waits.
    assert results == [200] * people + [409]


# ── editing names ────────────────────────────────────────────────────────────────────────

def first_service(client):
    return client.get(f"{BASE}/state").json()["services"][0]


def test_renaming_a_sample_service_drops_its_old_arabic_name(client):
    new_business(client)
    service = first_service(client)
    assert service["name_ar"] == "قص وتصفيف الشعر"
    changed = client.patch(f"/api/services/{service['id']}", json={"name": "Cut & style"})
    assert changed.status_code == 200, changed.text
    after = first_service(client)
    assert (after["name"], after["name_ar"]) == ("Cut & style", "")


def test_renaming_a_service_with_its_arabic_name_keeps_the_arabic_given(client):
    new_business(client)
    service = first_service(client)
    client.patch(
        f"/api/services/{service['id']}", json={"name": "Cut & style", "name_ar": "قص وتسريح"}
    )
    after = first_service(client)
    assert (after["name"], after["name_ar"]) == ("Cut & style", "قص وتسريح")


def test_an_arabic_name_the_owner_wrote_survives_an_english_rename(client):
    new_business(client)
    service = first_service(client)
    client.patch(f"/api/services/{service['id']}", json={"name_ar": "قص وتسريح الشعر"})
    client.patch(f"/api/services/{service['id']}", json={"name": "Cut and style"})
    after = first_service(client)
    assert (after["name"], after["name_ar"]) == ("Cut and style", "قص وتسريح الشعر")


def test_the_arabic_name_can_be_cleared_and_a_price_change_leaves_both_names(client):
    new_business(client)
    service = first_service(client)
    client.patch(f"/api/services/{service['id']}", json={"price": 15000})
    after = first_service(client)
    assert (after["name"], after["name_ar"], after["price"]) == (
        service["name"], service["name_ar"], 15000)
    client.patch(f"/api/services/{service['id']}", json={"name_ar": ""})
    assert first_service(client)["name_ar"] == ""


def test_a_service_added_with_both_names_shows_both_on_the_booking_page(client):
    _, slug, _ = new_business(client)
    added = client.post("/api/services", json={
        "name": "Lash lift", "name_ar": "رفع الرموش", "duration_minutes": 45, "price": 15000,
    })
    assert added.status_code == 200, added.text
    page = client.get(f"/api/book/{slug}").json()
    lift = next(s for s in page["services"] if s["name"] == "Lash lift")
    assert lift["name_ar"] == "رفع الرموش"


def test_renaming_a_person_drops_the_placeholder_arabic_name(client):
    new_business(client)
    first = client.get("/api/resources").json()["resources"][0]
    assert first["name_ar"] == "عضو الفريق 1"
    client.patch(f"/api/resources/{first['id']}", json={"name": "Noor"})
    after = client.get("/api/resources").json()["resources"][0]
    assert (after["name"], after["name_ar"]) == ("Noor", "")
    client.patch(f"/api/resources/{first['id']}", json={"name_ar": "نور"})
    client.patch(f"/api/resources/{first['id']}", json={"name": "Noor A."})
    after = client.get("/api/resources").json()["resources"][0]
    assert (after["name"], after["name_ar"]) == ("Noor A.", "نور")


def test_the_owner_can_remove_the_people_they_do_not_have_but_not_the_last(client):
    new_business(client)
    people = client.get(f"{BASE}/state").json()["people"]
    for person in people[1:]:
        done = client.post(f"/api/resources/{person['id']}/active", json={"active": False})
        assert done.status_code == 200
    assert [p["id"] for p in client.get(f"{BASE}/state").json()["people"]] == [people[0]["id"]]
    last = client.post(f"/api/resources/{people[0]['id']}/active", json={"active": False})
    assert last.status_code == 409


def test_a_business_of_a_type_with_no_people_still_has_none(client):
    new_business(client, kind="clinic")
    assert client.get(f"{BASE}/state").json()["people"] == []


# ── a business made in the back office ───────────────────────────────────────────────────

def make_in_back_office(client, **more):
    slug = f"fc-{uuid4().hex[:8]}"
    created = client.post("/api/admin/businesses", json={
        "name": "Back office salon", "name_ar": "صالون المكتب", "slug": slug,
        "owner_email": f"owner-{slug}@shop.example", "owner_name": "Reem", **more,
    })
    assert created.status_code == 200, created.text
    return slug, created.json()["id"]


def numbers(tenant):
    return [dict(r) for r in owner_sql(
        "select number_id, channel from channel_numbers where tenant_id = $1", tenant)]


def owner_of(client_factory, slug):
    owner = client_factory()
    email = f"owner-{slug}@shop.example"
    verified = owner.post("/api/auth/verify", json={"email": email, "code": code_for(owner, email)})
    assert verified.status_code == 200
    return owner


@pytest.fixture
def office(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client, ALYR_STAFF_EMAIL)
    return client


def test_a_business_made_in_the_back_office_has_a_private_test_line(office):
    slug, tenant = make_in_back_office(office, products=["bookings"])
    assert numbers(tenant) == [{"number_id": f"sim-{slug}", "channel": "simulator"}]


def test_the_owner_of_a_back_office_business_can_use_its_test_line(office, client_factory):
    slug, _ = make_in_back_office(office, products=["bookings"], template="salon")
    owner = owner_of(client_factory, slug)
    hello = owner.post(f"{BASE}/test-chat", json={"text": "hello"})
    assert hello.status_code == 200, hello.text
    assert hello.json()["messages"][-1]["body"].startswith("Welcome to Back office salon")
    prices = owner.post(f"{BASE}/test-chat", json={"reply_id": "prices"}).json()["messages"][-1]
    assert "Haircut & blow-dry: QAR 120 (60 min)" in prices["body"]


def test_a_salon_template_in_the_back_office_gives_the_same_start_as_sign_up(
    office, client_factory
):
    slug, _ = make_in_back_office(office, products=["bookings"], template="salon")
    state = owner_of(client_factory, slug).get(f"{BASE}/state").json()
    assert [s["name"] for s in state["services"]] == [s.name for s in SALON.services]
    assert [p["name"] for p in state["people"]] == [p.name for p in SALON.people]
    assert len(state["hours"]) == len(SALON.hours)


def test_a_back_office_business_without_a_template_is_empty_as_before(office, client_factory):
    slug, _ = make_in_back_office(office, products=["bookings"])
    state = owner_of(client_factory, slug).get(f"{BASE}/state").json()
    assert state["services"] == [] and state["people"] == [] and state["hours"] == []


def test_a_template_without_bookings_does_not_seed_a_booking_setup(office):
    _, tenant = make_in_back_office(office, products=["chat"], template="salon")
    assert owner_sql("select count(*) as n from services where tenant_id = $1", tenant)[0]["n"] == 0
    assert numbers(tenant)[0]["channel"] == "simulator"
