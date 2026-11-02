"""The outreach engine's back-office routes (ALY-310, specs/065): staff only, every change on the
audit log, the shapes the screens read (ALY-311), imports, discovery and the connection tests."""

# The fixtures `office` and `outreach_env` come from outreach_support and are named here as
# arguments, which ruff reads as a redefinition.
# ruff: noqa: F811

import json
from uuid import uuid4

import pytest

from alyr.outreach.providers.search import Found, Place
from outreach_support import (
    ADMIN,
    add,
    approve,
    detail,
    engine,
    office,  # noqa: F401
    osql,
    outreach_env,  # noqa: F401
    researched,
)
from test_onboarding import new_business

ROUTES = [
    ("get", "/overview", None), ("get", "/connections", None),
    ("post", "/connections/model/test", None), ("get", "/settings", None),
    ("put", "/settings", {"global_daily_cap": 5}), ("post", "/kill-switch", {"on": False}),
    ("post", "/mailbox/resume", None), ("get", "/prospects", None),
    ("post", "/prospects", {"company": "X", "country": "QA"}),
    ("post", "/prospects/import", {"csv": "company,country\nX,QA\n"}),
    ("post", "/discover", {"query": "bakeries in Doha", "country": "QA"}),
    ("get", "/prospects/{id}", None), ("patch", "/prospects/{id}", {"notes": "x"}),
    ("post", "/prospects/{id}/research", None), ("post", "/prospects/{id}/pause", None),
    ("post", "/prospects/{id}/resume", None), ("get", "/review", None),
    ("post", "/drafts/{id}/approve", {"body_hash": "0" * 64}),
    ("post", "/drafts/{id}/edit", {"subject": "x", "body": "y"}),
    ("post", "/drafts/{id}/reject", {"reason": "x"}), ("get", "/replies", None),
    ("post", "/replies/{id}/handled", {}), ("get", "/activity", None),
]


@pytest.mark.parametrize("method,path,body", ROUTES, ids=[f"{m} {p}" for m, p, _ in ROUTES])
def test_every_route_refuses_a_caller_who_is_not_alyr_staff(outreach_env, client, method, path,
                                                            body):
    new_business(client)  # `client` is now a shop's owner, signed in, not ALYR staff
    kwargs = {"json": body} if body is not None else {}
    answer = getattr(client, method)(ADMIN + path.replace("{id}", str(uuid4())), **kwargs)
    assert answer.status_code == 403, answer.text
    assert osql("select count(*) as n from outreach_prospects")[0]["n"] == 0
    assert osql("select count(*) as n from outreach_connection_tests")[0]["n"] == 0


def test_every_change_is_on_the_audit_log(office):
    pid = add(office)
    office.patch(f"{ADMIN}/prospects/{pid}", json={"notes": "met at the expo"})
    office.post(f"{ADMIN}/kill-switch", json={"on": True, "reason": "testing"})
    office.put(f"{ADMIN}/settings", json={"global_daily_cap": 20})
    actions = [r["action"] for r in osql(
        "select action from platform_audit where action like 'outreach.%' order by id")]
    assert actions[-4:] == ["outreach.prospect_added", "outreach.prospect_changed",
                            "outreach.kill_switch", "outreach.settings"]


def test_the_overview_and_settings_have_the_screens_shapes(office):
    researched(office)
    seen = office.get(f"{ADMIN}/overview").json()
    assert seen["enabled"] is True and seen["kill_switch"]["on"] is False
    assert seen["stages"] == {"in_review": 1} and seen["review_waiting"] == 3
    assert seen["today"] == {"sent": 0, "global_cap": 50, "mailbox_cap": 10, "ramp_week": 1,
                             "queued": 0}
    assert {c["key"] for c in seen["connections"]} >= {"model", "discovery", "email_finder",
                                                       "smtp", "imap", "page_reader", "places"}
    settings = office.get(f"{ADMIN}/settings").json()
    assert settings["global_daily_cap"] == 50
    assert settings["booking_url"] == "" and settings["booking_url_default"]
    qa = next(row for row in settings["policy"] if row["country"] == "QA")
    assert qa == {"country": "QA", "lane": "allowed", "bases": [
        "published_business_contact", "existing_relationship", "referral", "opt_in", "inbound"],
        "cap": 1, "time_zone": "Asia/Qatar", "working_days": "Sun to Thu",
        "hours": "08:30 to 16:30", "free_mail_refused": True, "note": ""}
    changed = office.put(f"{ADMIN}/settings", json={
        "global_daily_cap": 20, "honeytokens": ["Trap@Example.qa", "not an address"],
        "booking_url": "https://cal.example/x"}).json()
    assert changed["global_daily_cap"] == 20 and changed["honeytokens"] == ["trap@example.qa"]
    assert office.put(f"{ADMIN}/settings", json={"booking_url": "http://x"}).status_code == 422


def test_the_kill_switch_needs_a_reason_and_says_who(office):
    assert office.post(f"{ADMIN}/kill-switch", json={"on": True}).status_code == 422
    on = office.post(f"{ADMIN}/kill-switch", json={"on": True, "reason": "pause week"}).json()
    assert on["on"] is True and on["reason"] == "pause week" and on["by"]


def test_connection_tests_never_send_and_say_which_settings_are_missing(office):
    e = engine(office)
    listed = office.get(f"{ADMIN}/connections").json()["connections"]
    smtp = next(c for c in listed if c["key"] == "smtp")
    assert smtp["configured"] is False
    assert {"name": "ALYR_OUTREACH_SMTP_PASSWORD", "present": False} in smtp["settings"]
    assert all("value" not in s for c in listed for s in c["settings"])
    for key in ("model", "discovery", "places", "email_finder", "smtp", "imap"):
        answer = office.post(f"{ADMIN}/connections/{key}/test")
        assert answer.status_code == 200 and answer.json()["ok"], (key, answer.text)
    page_reader = office.post(f"{ADMIN}/connections/page_reader/test").json()
    assert page_reader["ok"] is False and "FIRECRAWL" in page_reader["message"]
    assert e.providers.mailbox.sent == [] and e.providers.mailbox.logins == 2
    assert not any("@" in c["user"] for c in e.providers.llm.calls)
    after = office.get(f"{ADMIN}/connections").json()["connections"]
    assert next(c for c in after if c["key"] == "model")["last_test"]["ok"] is True
    assert office.post(f"{ADMIN}/connections/nothing/test").status_code == 404


def test_a_csv_import_adds_what_it_can_and_says_why_for_the_rest(office):
    csv = ("company,website,country,first_name,last_name,role,email,basis,language,notes\n"
           "Rose Salon,rose.example,QA,Mona,,Owner,mona@rose.example,referral,ar,met in person\n"
           "No Basis,nobasis.example,QA,,,,a@nobasis.example,,en,\n"
           "Nowhere,nowhere.example,ZZ,,,,,,,\n"
           "Rose Again,rose.example,QA,,,,,,,\n")
    answer = office.post(f"{ADMIN}/prospects/import", json={"csv": csv})
    assert answer.status_code == 200, answer.text
    result = answer.json()
    assert result["added"] == 1 and result["source"] == "import"
    assert [s["row"] for s in result["skipped"]] == [2, 3, 4]
    assert "basis" in result["skipped"][0]["reason"]
    rows = office.get(f"{ADMIN}/prospects", params={"q": "rose"}).json()["prospects"]
    assert rows[0]["contact_first_name"] == "Mona" and rows[0]["source"] == "import"
    assert office.post(f"{ADMIN}/prospects/import", json={"csv": "name\nx\n"}).status_code == 422


OVERTURE = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [51.5, 25.3]},
     "properties": {"id": "08f-1", "names": {"primary": "Karak House"}, "confidence": 0.93,
                    "websites": ["https://karak.example"], "emails": ["hello@karak.example"],
                    "phones": ["+97444001122"], "taxonomy": {"primary": "cafe"},
                    "addresses": [{"country": "QA", "freeform": "Street 1"}]}},
    {"type": "Feature", "properties": {"id": "08f-2", "names": {"primary": "Low"},
                                       "confidence": 0.4, "websites": ["https://low.example"]}},
    {"type": "Feature", "properties": {"id": "08f-3", "names": "{\"primary\": \"Nothing\"}",
                                       "confidence": 0.9}},
    # The DuckDB export writes its nested fields as JSON text.
    {"type": "Feature", "properties": {"id": "08f-4", "names": "{\"primary\": \"Tea Spot\"}",
                                       "confidence": 0.8, "websites": "[\"tea.example\"]",
                                       "categories": "{\"primary\": \"tea_room\"}"}},
]}


def test_an_overture_places_file_is_imported_without_phones_or_places(office):
    answer = office.post(f"{ADMIN}/prospects/import",
                         json={"geojson": OVERTURE, "release": "2026-10-21.0"})
    assert answer.status_code == 200, answer.text
    result = answer.json()
    assert result["source"] == "overture" and result["added"] == 2
    assert [(s["row"], s["reason"]) for s in result["skipped"]] == [
        (2, "confidence under 0.7"), (3, "no website and no email")]
    karak = detail(office, result["ids"][0])
    assert karak["source"] == "overture" and karak["source_url"] == "overture 2026-10-21.0"
    assert karak["source_ref"] == "08f-1" and karak["business_type"] == "cafe"
    assert karak["contact_email"] == "hello@karak.example"
    assert "4400" not in json.dumps(karak) and "Street 1" not in json.dumps(karak)
    tea = detail(office, result["ids"][1])
    assert tea["website"] == "https://tea.example/" and tea["business_type"] == "tea_room"
    # The same file sent in the csv field is recognised as GeoJSON too.
    again = office.post(f"{ADMIN}/prospects/import", json={"csv": json.dumps(OVERTURE)})
    assert again.json()["source"] == "overture" and again.json()["added"] == 0


def test_discovery_by_web_search_keeps_only_sites_our_fetcher_read(office):
    e = engine(office)
    e.providers.search.results = [
        Found("https://bakery-21.example/menu", "Bakery 21", "Cakes in Doha"),
        Found("https://gone.example/", "Gone", "Closed"),
    ]
    e.providers.web.pages = {"https://bakery-21.example/": "<p>Cakes made in Doha every day "
                             "of the week by hand.</p><p>We deliver birthday cakes across "
                             "the city all week.</p>"}
    answer = office.post(f"{ADMIN}/discover", json={"query": "bakeries in Doha",
                                                    "country": "QA", "limit": 5})
    assert answer.status_code == 200 and answer.json()["job_id"]
    rows = office.get(f"{ADMIN}/prospects").json()["prospects"]
    assert [r["domain"] for r in rows] == ["bakery-21.example"]
    assert rows[0]["source"] == "discovery"
    scout = next(c for c in e.providers.llm.calls if c["role"] == "scout")
    assert "Bakery 21" in scout["user"]


def test_discovery_by_google_places_keeps_the_place_id_and_name_only(office):
    e = engine(office)
    e.providers.places.results = [
        Place("ChIJ-one", "Saffron Kitchen", "https://saffron.example"),
        Place("ChIJ-two", "No Site", ""),
        Place("ChIJ-three", "Dead Site", "https://dead.example/"),
    ]
    e.providers.web.pages = {"https://saffron.example/": "<p>Home cooked Indian food in Doha "
                             "for offices and families.</p><p>Order lunch boxes for your team "
                             "every weekday.</p>"}
    office.post(f"{ADMIN}/discover", json={"query": "restaurants in Doha", "country": "QA",
                                           "provider": "places"})
    rows = office.get(f"{ADMIN}/prospects").json()["prospects"]
    assert [r["company"] for r in rows] == ["Saffron Kitchen"]
    seen = detail(office, rows[0]["id"])
    assert seen["source"] == "places" and seen["source_ref"] == "ChIJ-one"
    assert seen["source_url"] == "" and seen["website"] == "https://saffron.example/"
    assert e.providers.places.queries == ["restaurants in Doha"]


def test_activity_shows_sends_and_gateway_refusals_with_their_check(office):
    from outreach_support import SUNDAY_10

    pid, seen = researched(office)
    engine(office).clock = lambda: SUNDAY_10.replace(hour=22)
    approve(office, seen)
    activity = office.get(f"{ADMIN}/activity").json()
    refusal = activity["items"][0]
    assert refusal["kind"] == "refusal" and refusal["check"] == 10
    assert refusal["outcome"] == "rescheduled" and refusal["company"] == "Demo Bakery 1"
    assert activity["counts"] == {"refusal": 1}
    assert office.get(f"{ADMIN}/activity", params={"kind": "send"}).json()["items"] == []
    assert "@" not in json.dumps(activity)


def test_the_review_queue_shows_what_the_founder_needs(office):
    pid, _ = researched(office)
    [item] = office.get(f"{ADMIN}/review").json()["items"]
    assert item["draft"]["step"] == 1 and len(item["follow_ups"]) == 2
    assert item["prospect"]["id"] == pid and item["prospect"]["lane"] == "allowed"
    assert all(c["kept"] for c in item["claims"]) and item["dropped_claims"] >= 0
    assert item["draft"]["lint"]["ok"] and item["waiting_since"]


def test_a_prospect_with_an_email_needs_a_basis(office):
    answer = office.post(f"{ADMIN}/prospects", json={
        "company": "X", "country": "QA", "contact_email": "x@x-shop.example"})
    assert answer.status_code == 422 and "basis" in answer.text
    assert office.post(f"{ADMIN}/prospects", json={
        "company": "X", "country": "ZZ", "contact_email": "x@x-shop.example",
        "basis": "opt_in"}).status_code == 422


def test_a_basis_the_country_does_not_allow_is_refused_when_it_is_typed(office):
    answer = office.post(f"{ADMIN}/prospects", json={
        "company": "X", "country": "QA", "contact_email": "x@x-shop.example",
        "basis": "legitimate_interest"})
    assert answer.status_code == 422 and "QA allows only" in answer.text
    assert office.post(f"{ADMIN}/prospects", json={
        "company": "X", "country": "GB", "contact_email": "x@x-shop.example",
        "basis": "legitimate_interest"}).status_code == 200
