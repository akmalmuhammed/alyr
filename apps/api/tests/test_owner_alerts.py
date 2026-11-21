"""The owner is told (D-193, specs/069-owner-alerts): the weekly report reaches the owner because
linking an owner's or an admin's phone, and registering a staff number on purpose, switch it on;
the Team screen's switches change it (and the booking alerts and email); and a person taken off the
team, or made an agent, stops receiving it. Through the real routes, the simulator and
PostgreSQL."""

import re
from pathlib import Path
from uuid import uuid4

import pytest

from alyr.modules import report
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID, OWNER_EMAIL, STAFF_PHONE
from test_consent import conversation, owner_sql, say
from test_owner_actions import ( 
    AGENT_PHONE_NEW,
    OWNER_PHONE_NEW,
    SPARE_PHONE,
    link,
)
from test_reports import future_week, send_week
from test_sign_in import sign_in


@pytest.fixture
def two_people(client_factory, monkeypatch):
    """The shop's owner and its agent, each signed in on their own session."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    return owner, agent, sign_in(owner, OWNER_EMAIL), sign_in(agent, AGENT_EMAIL)


def row(phone: str) -> dict:
    return dict(owner_sql(
        "select id, role, user_id, weekly_report, booking_alerts, order_alerts, catalog_manager, "
        "consent_service from contacts where phone = $1 and tenant_id = $2",
        phone, DEMO_TENANT_ID)[0])


def consents(contact_id) -> list[tuple[str, str]]:
    return [(r["status"], r["source"]) for r in owner_sql(
        "select status, source from consents where contact_id = $1 and purpose = 'service' "
        "order by created_at", contact_id)]


# --------------------------------------------------------------------------- T3: on link

def test_an_owner_who_links_a_phone_is_sent_the_weekly_report(two_people):
    owner, _, owner_me, _ = two_people
    assert owner.get("/api/owner/whatsapp").json()["weekly_report"] is None
    link(owner, OWNER_PHONE_NEW)
    me = row(OWNER_PHONE_NEW)
    assert me["role"] == "staff" and me["weekly_report"] and me["booking_alerts"]
    assert me["consent_service"] == "granted"
    # Writing to the shop's number is the agreement already (customer_initiated).
    assert consents(me["id"])[-1][0] == "granted"
    # The number shows on the report's list and the report goes to it, and to nobody who was
    # not chosen.
    listed = {r["phone"]: r["receives"] for r in owner.get("/api/reports/settings").json()[
        "recipients"]}
    assert listed[OWNER_PHONE_NEW] is True and listed[STAFF_PHONE] is False
    send_week(owner, future_week())
    thread = conversation(owner, OWNER_PHONE_NEW)
    assert any(m["direction"] == "out" and "weekly report" in m["body"].lower() for m in thread)
    assert not [m for m in conversation(owner, SPARE_PHONE) if m["direction"] == "out"]
    # What the Team screen reads.
    status = owner.get("/api/owner/whatsapp").json()
    assert (status["weekly_report"], status["booking_alerts"], status["booking_email"]) == (
        True, True, True)
    assert owner_me["name"]


def test_an_agent_who_links_a_phone_is_not_sent_the_shops_money(two_people):
    _, agent, *_ = two_people
    link(agent, AGENT_PHONE_NEW)
    me = row(AGENT_PHONE_NEW)
    assert me["role"] == "staff" and me["user_id"] is not None
    assert me["weekly_report"] is False and me["booking_alerts"] is False
    status = agent.get("/api/owner/whatsapp").json()
    assert (status["weekly_report"], status["booking_alerts"], status["booking_email"]) == (
        False, False, True)


def test_a_number_the_shop_already_listed_keeps_the_settings_the_owner_gave_it(two_people):
    owner, *_ = two_people
    made = owner.post("/api/staff-numbers", json={
        "name": "Fatima", "phone": OWNER_PHONE_NEW, "booking_alerts": False,
        "weekly_report": False})
    assert made.status_code == 200
    link(owner, OWNER_PHONE_NEW)
    me = row(OWNER_PHONE_NEW)
    assert me["user_id"] is not None and not me["weekly_report"] and not me["booking_alerts"]


def test_a_number_that_said_stop_is_not_made_to_agree_by_linking(two_people):
    owner, *_ = two_people
    say(owner, OWNER_PHONE_NEW, "STOP")
    assert row(OWNER_PHONE_NEW)["consent_service"] == "revoked"
    link(owner, OWNER_PHONE_NEW)
    me = row(OWNER_PHONE_NEW)
    assert me["weekly_report"] and me["consent_service"] == "revoked"


# --------------------------------------------------------------- T3: the switches (Team screen)

def test_the_owner_switches_the_report_and_the_alerts_on_and_off(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    off = owner.put("/api/owner/alerts", json={"weekly_report": False, "booking_alerts": False})
    assert off.status_code == 200
    assert (off.json()["weekly_report"], off.json()["booking_alerts"]) == (False, False)
    me = row(OWNER_PHONE_NEW)
    assert not me["weekly_report"] and not me["booking_alerts"]
    send_week(owner, future_week())
    assert not [m for m in conversation(owner, OWNER_PHONE_NEW)
                if m["direction"] == "out" and "weekly report" in m["body"].lower()]
    on = owner.put("/api/owner/alerts", json={"weekly_report": True})
    assert on.json()["weekly_report"] is True and on.json()["booking_alerts"] is False


def test_turning_a_message_on_is_the_agreement_to_receive_it(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    owner_sql("update contacts set consent_service = 'unknown' where phone = $1", OWNER_PHONE_NEW)
    owner.put("/api/owner/alerts", json={"weekly_report": True})
    me = row(OWNER_PHONE_NEW)
    assert me["consent_service"] == "granted"
    assert consents(me["id"])[-1] == ("granted", "alert_setting")


def test_an_agent_can_switch_on_booking_alerts_but_never_the_report(two_people):
    _, agent, *_ = two_people
    refused = agent.put("/api/owner/alerts", json={"booking_alerts": True})
    assert refused.status_code == 409  # link a phone first
    link(agent, AGENT_PHONE_NEW)
    assert agent.put("/api/owner/alerts", json={"booking_alerts": True}).status_code == 200
    assert row(AGENT_PHONE_NEW)["booking_alerts"] is True
    money = agent.put("/api/owner/alerts", json={"weekly_report": True})
    assert money.status_code == 403
    assert row(AGENT_PHONE_NEW)["weekly_report"] is False


def test_the_staff_numbers_screen_switches_the_report_and_the_booking_alerts(client):
    people = {n["phone"]: n for n in client.get("/api/staff-numbers").json()["numbers"]}
    counter = people[STAFF_PHONE]
    assert counter["weekly_report"] is False and counter["booking_alerts"] is False
    changed = client.put(f"/api/staff-numbers/{counter['id']}",
                         json={"weekly_report": True, "booking_alerts": True})
    assert changed.json()["weekly_report"] and changed.json()["booking_alerts"]
    assert row(STAFF_PHONE)["weekly_report"] and row(STAFF_PHONE)["booking_alerts"]
    # Saving another setting leaves them as they are.
    kept = client.put(f"/api/staff-numbers/{counter['id']}", json={"order_alerts": True})
    assert kept.json()["weekly_report"] and kept.json()["booking_alerts"]


# ------------------------------------------------------------- T3: on staff registration

def test_registering_a_number_can_send_it_the_report_and_says_what_it_agreed_to(client):
    made = client.post("/api/staff-numbers", json={
        "name": "Reem", "phone": "974 5550 0777", "weekly_report": True, "booking_alerts": True})
    assert made.status_code == 200
    me = row("97455500777")
    assert me["weekly_report"] and me["booking_alerts"] and me["consent_service"] == "granted"
    assert consents(me["id"]) == [("granted", "staff_registration")]


def test_a_number_registered_with_nothing_said_gets_no_report(client):
    client.post("/api/staff-numbers", json={"name": "Dina", "phone": "97455500778"})
    me = row("97455500778")
    assert not me["weekly_report"] and not me["booking_alerts"]


def test_registering_a_number_again_keeps_its_report_unless_told_otherwise(client):
    client.post("/api/staff-numbers", json={
        "name": "Reem", "phone": "97455500777", "weekly_report": True})
    client.post("/api/staff-numbers", json={"name": "Reem A.", "phone": "97455500777"})
    assert row("97455500777")["weekly_report"] is True
    client.post("/api/staff-numbers", json={
        "name": "Reem A.", "phone": "97455500777", "weekly_report": False})
    assert row("97455500777")["weekly_report"] is False


def test_the_database_refuses_an_alert_for_a_customers_number(client):
    owner_sql("insert into contacts (tenant_id, phone, name) values ($1, '97455500790', 'Walk-in')",
              DEMO_TENANT_ID)
    with pytest.raises(Exception, match="contacts_booking_alerts_staff"):
        owner_sql("update contacts set booking_alerts = true where phone = '97455500790'")


# --------------------------------------------------------------------------------- T27

def a_colleague(role: str, phone: str) -> dict:
    """A person on the team with their own linked staff phone, the report and alerts all on."""
    email = f"colleague-{uuid4().hex[:6]}@alerts-team.example"
    user = owner_sql("insert into users (email, name) values ($1, 'Nada') returning id",
                     email)[0]["id"]
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
              DEMO_TENANT_ID, user, role)
    owner_sql(
        "insert into contacts (tenant_id, phone, name, role, user_id, verified_at, weekly_report, "
        "booking_alerts, order_alerts, catalog_manager, consent_service) "
        "values ($1, $2, 'Nada', 'staff', $3, now(), true, true, true, true, 'granted')",
        DEMO_TENANT_ID, phone, user)
    return {"user_id": user, "phone": phone}


def test_a_person_taken_off_the_team_loses_the_report_the_alerts_and_the_commands(two_people):
    owner, *_ = two_people
    nada = a_colleague("admin", "97455500791")
    removed = owner.delete(f"/api/team/{nada['user_id']}")
    assert removed.status_code == 200
    me = row(nada["phone"])
    assert me["role"] == "customer" and me["user_id"] is None
    assert not (me["weekly_report"] or me["booking_alerts"] or me["order_alerts"]
                or me["catalog_manager"])
    # Her phone is not on the report's list any more, and the report is not sent to it.
    assert nada["phone"] not in {r["phone"] for r in owner.get("/api/reports/settings").json()[
        "recipients"]}
    send_week(owner, future_week())
    assert not [m for m in conversation(owner, nada["phone"])
                if m["direction"] == "out" and "weekly report" in m["body"].lower()]


def test_taking_a_number_off_the_staff_list_clears_the_same_things(client):
    people = {n["phone"]: n for n in client.get("/api/staff-numbers").json()["numbers"]}
    counter = people[STAFF_PHONE]
    client.put(f"/api/staff-numbers/{counter['id']}", json={
        "weekly_report": True, "booking_alerts": True, "order_alerts": True, "manager": True})
    assert client.delete(f"/api/staff-numbers/{counter['id']}").status_code == 200
    me = row(STAFF_PHONE)
    assert me["role"] == "customer"
    assert not (me["weekly_report"] or me["booking_alerts"] or me["order_alerts"]
                or me["catalog_manager"])


def test_an_admin_made_an_agent_stops_receiving_the_report_but_keeps_the_booking_alerts(
        two_people):
    owner, *_ = two_people
    nada = a_colleague("admin", "97455500792")
    changed = owner.post(f"/api/team/{nada['user_id']}/role", json={"role": "agent"})
    assert changed.status_code == 200
    me = row(nada["phone"])
    assert me["weekly_report"] is False and me["booking_alerts"] is True
    assert me["role"] == "staff" and me["user_id"] == nada["user_id"]


# ----------------------------------------------------------------------------------- T4

REPO = Path(__file__).resolve().parents[3]
# Where the report's day is named in what an owner reads: the card, its text, the Agent's line,
# the template, the workspace's labels. Sunday, as the code runs it (`report.SEND_WEEKDAY`).
READS = (
    "apps/api/src/alyr/modules/report.py",
    "apps/api/src/alyr/modules/agent/week.py",
    "apps/api/src/alyr/modules/agent/card.py",
    "apps/api/src/alyr/modules/agent/view.py",
    "apps/api/src/alyr/modules/agent/facts.py",
    "apps/api/src/alyr/core/templates.py",
    "apps/api/src/alyr/catalog.py",
    "apps/web/app/_agent/labels.ts",
)
MONDAY_WORDS = re.compile(
    r"(every|each|on|next|this|by|until)\s+monday|monday\s+(morning|at|9)|"
    r"(كل|يوم|صباح)\s+الاثنين", re.IGNORECASE)


def test_the_report_goes_out_on_sunday_and_nothing_it_says_names_another_day():
    # The day is fixed in code (the founder decides whether it moves): Sunday, nine o'clock.
    assert (report.SEND_WEEKDAY, report.SEND_HOUR) == (6, 9)
    for name in READS:
        text = (REPO / name).read_text(encoding="utf-8")
        assert not MONDAY_WORDS.search(text), f"{name} names Monday as the report's day"


def test_the_agents_report_line_says_sunday_in_both_languages(client):
    home_en = client.get("/api/agent?lang=en").json()
    home_ar = client.get("/api/agent?lang=ar").json()
    text_en, text_ar = str(home_en), str(home_ar)
    assert "Sunday" in text_en and "الأحد" in text_ar
    for text in (text_en, text_ar):
        assert not MONDAY_WORDS.search(text)
