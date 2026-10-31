"""The message templates on a business's WhatsApp account (ALY-172, specs/061-whatsapp-templates):
what Meta has, what ALYR needs, the status of each, submitting (off until the founder allows it),
and Meta's status notices by webhook. Meta is the fake in `fake_meta.py`; nothing reaches the
network."""

import asyncio
import json

import pytest

from alyr import templates_sync
from alyr.config import get_settings
from alyr.core import whatsapp_templates
from alyr.core.templates import CATALOGUE
from alyr.db import Database
from conftest import APP_DSN
from fake_meta import FakeMeta
from test_consent import owner_sql
from test_onboarding import new_business
from test_whatsapp_line import WABA, at, attach, audit, number_id, trail
from test_whatsapp_webhook import signed_post

HELD = sorted(name for name, t in CATALOGUE.items() if t.held)
SAMPLES = [name for name, t in CATALOGUE.items() if t.header]


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def meta(monkeypatch):
    return FakeMeta().install(monkeypatch)


def allow_submitting(monkeypatch, app_id=""):
    monkeypatch.setenv("ALYR_TEMPLATE_SUBMIT", "true")
    if app_id:
        monkeypatch.setenv("ALYR_META_APP_ID", app_id)
    get_settings.cache_clear()


def view(office, tenant):
    answer = office.get(at(tenant, "templates"))
    assert answer.status_code == 200, answer.text
    return answer.json()


def row(data, name, language="en"):
    return next(r for r in data["rows"] if r["name"] == name and r["language"] == language)


def sync(office, tenant):
    answer = office.post(at(tenant, "templates/sync"))
    assert answer.status_code == 200, answer.text
    return answer.json()


def submit(office, tenant, names=None):
    return office.post(at(tenant, "templates/submit"), json={"names": names or []})


def status_notice(waba, name, event, language="en", **more):
    return {"object": "whatsapp_business_account", "entry": [{"id": waba, "time": 1790000000,
        "changes": [{"field": "message_template_status_update", "value": {
            "event": event, "message_template_id": 123, "message_template_name": name,
            "message_template_language": language, "reason": "NONE",
            "message_template_category": "UTILITY", **more}}]}]}


def rows_of(tenant):
    return {(r["name"], r["language"]): r for r in owner_sql(
        "select * from whatsapp_templates where tenant_id = $1", tenant)}


# ── what ALYR needs ────────────────────────────────────────────────────────────────────────


def test_the_templates_waiting_for_the_founders_go_are_marked_and_nothing_else():
    assert HELD == sorted([
        "booking_cancelled_deposit", "booking_deposit_due", "booking_deposit_paid",
        "booking_released", "document_credit_note", "document_invoice", "document_receipt",
        "review_request"])
    # A template with a sample header is the one the Meta app's ID is needed for.
    assert "weekly_report_card" in SAMPLES


def test_a_new_line_needs_every_template_in_both_languages_and_none_is_on_meta_yet(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    data = view(office, tenant)
    assert data["counts"]["wanted"] == len(CATALOGUE) * 2 == len(data["rows"])
    assert data["counts"]["by_status"] == {"draft": len(CATALOGUE) * 2}
    assert data["counts"]["held"] == len(HELD) * 2
    assert row(data, "order_confirmed")["status"] == "draft"
    assert row(data, "document_receipt", "ar")["held"]
    assert row(data, "weekly_report_card")["needs_sample"] is True
    # Reading what ALYR has asked Meta nothing.
    assert [p for p in meta.paths() if "message_templates" in p] == []
    assert data["submit_on"] is False


# ── reading from Meta ──────────────────────────────────────────────────────────────────────


def test_sync_keeps_what_meta_says_with_its_reasons_and_marks_extras(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.add_template(WABA, "order_confirmed", "en", "APPROVED")
    meta.add_template(WABA, "order_confirmed", "ar", "PENDING")
    meta.add_template(WABA, "order_ready", "en", "REJECTED", reason="INCORRECT_CATEGORY")
    meta.add_template(WABA, "booking_reminder", "en", "PAUSED")
    meta.add_template(WABA, "order_done", "en", "FLAGGED")
    meta.add_template(WABA, "stock_low", "en", "DISABLED")
    meta.add_template(WABA, "hello_world", "en_US", "APPROVED")

    data = sync(office, tenant)
    assert row(data, "order_confirmed")["status"] == "approved"
    assert row(data, "order_confirmed", "ar")["status"] == "submitted"
    assert row(data, "order_confirmed", "ar")["meta_status"] == "PENDING"
    rejected = row(data, "order_ready")
    assert rejected["status"] == "rejected" and rejected["reason"] == "INCORRECT_CATEGORY"
    assert row(data, "booking_reminder")["status"] == "paused"
    assert row(data, "order_done")["status"] == "flagged"
    assert row(data, "stock_low")["status"] == "disabled"
    assert row(data, "order_ready_delivery")["status"] == "draft"
    extra = row(data, "hello_world", "en_US")
    assert extra["in_catalogue"] is False and extra["status"] == "approved"
    assert data["counts"]["extra"] == 1
    assert data["counts"]["by_status"]["approved"] == 1
    # On the trail and the audit log, with counts only.
    assert trail(tenant)[-1][0] == "templates_synced"
    assert audit(tenant, "whatsapp.templates_synced")
    assert owner_sql("select detail from whatsapp_line_events where kind = 'templates_synced' "
                     "and tenant_id = $1", tenant)


def test_sync_follows_meta_paging_and_forgets_a_template_meta_no_longer_has(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.page_size = 2
    for name in ("order_confirmed", "order_ready", "order_done", "order_cancelled", "stock_low"):
        meta.add_template(WABA, name, "en")
    data = sync(office, tenant)
    assert data["counts"]["by_status"]["approved"] == 5
    meta.templates[WABA] = [t for t in meta.templates[WABA] if t["name"] != "stock_low"]
    again = sync(office, tenant)
    assert row(again, "stock_low")["status"] == "draft"
    assert again["counts"]["by_status"]["approved"] == 4


def test_a_refused_token_or_a_missing_account_id_is_said_in_words_and_nothing_changes(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.add_template(WABA, "order_confirmed")
    sync(office, tenant)
    meta.token_ok = False
    answer = office.post(at(tenant, "templates/sync"))
    assert answer.status_code == 422 and "access token" in answer.json()["detail"]
    assert row(view(office, tenant), "order_confirmed")["status"] == "approved"

    other, _, _ = new_business(client)
    nid = number_id()
    meta.token_ok = True
    meta.add_number(nid)
    assert office.post(at(other, "number"), json={"number_id": nid}).status_code == 200
    missing = office.post(at(other, "templates/sync"))
    assert missing.status_code == 422 and "Account ID" in missing.json()["detail"]


# ── submitting: off until the founder allows it ────────────────────────────────────────────


def test_submitting_is_off_by_default_and_nothing_goes_to_meta(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.calls.clear()
    answer = submit(office, tenant)
    assert answer.status_code == 409 and "switched off" in answer.json()["detail"]
    assert meta.calls == [] and meta.created == []
    # What would be sent is still on show: everything but the held ones and the sample header.
    plan = view(office, tenant)["plan"]
    assert {p["action"] for p in plan} == {"create", "held", "needs_app_id"}
    assert sum(p["action"] == "create" for p in plan) == (
        (len(CATALOGUE) - len(HELD) - 1) * 2)


def test_submitting_when_allowed_sends_what_meta_lacks_and_never_a_held_template(
    client, office, meta, monkeypatch
):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.add_template(WABA, "order_confirmed", "en", "APPROVED")
    sync(office, tenant)

    answer = submit(office, tenant)
    assert answer.status_code == 200, answer.text
    sent = {(b["name"], b["language"]) for b in meta.created}
    assert len(sent) == (len(CATALOGUE) - len(HELD) - 1) * 2 - 1
    assert not {n for n, _ in sent} & set(HELD)
    assert "weekly_report_card" not in {n for n, _ in sent}
    assert ("order_confirmed", "en") not in sent
    # What went was ALYR's own wording, with its sample values, as Meta's page asks.
    body = next(b for b in meta.created if b["name"] == "order_confirmed")
    assert body["category"] == "UTILITY" and body["language"] == "ar"
    [component] = body["components"]
    assert component["type"] == "BODY" and "{{1}}" in component["text"]
    assert component["example"]["body_text"] == [["1001"]]
    # Meta's answer is recorded: in review, until Meta says more.
    data = answer.json()
    assert row(data, "order_confirmed", "ar")["status"] == "submitted"
    assert row(data, "order_confirmed", "ar")["submitted_at"]
    assert row(data, "document_receipt")["status"] == "draft"
    assert all(r["result"] == "submitted" for r in data["results"])
    assert trail(tenant)[-1][0] == "templates_submitted"
    assert audit(tenant, "whatsapp.templates_submitted")
    # Doing it again sends nothing: Meta has them all now.
    meta.created.clear()
    assert submit(office, tenant).json()["results"] == []
    assert meta.created == []


def test_a_held_template_is_not_sent_even_when_it_is_named(client, office, meta, monkeypatch):
    allow_submitting(monkeypatch, app_id="1071845795713841")
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    answer = submit(office, tenant, ["document_receipt", "review_request:ar"])
    assert answer.status_code == 200 and answer.json()["results"] == []
    assert meta.created == [] and meta.uploads == []


def test_a_template_with_a_sample_header_is_uploaded_first_when_the_app_id_is_set(
    client, office, meta, monkeypatch
):
    allow_submitting(monkeypatch, app_id="1071845795713841")
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    answer = submit(office, tenant, ["weekly_report_card"])
    assert answer.status_code == 200, answer.text
    assert sorted(meta.uploads) == ["bakery.ar.png", "bakery.en.png"]
    header = meta.created[0]["components"][0]
    assert header["type"] == "HEADER" and header["format"] == "IMAGE"
    assert header["example"]["header_handle"][0].startswith("handle-for-upload:")


def test_a_template_meta_refused_is_sent_again_as_now_worded_and_not_as_a_new_one(
    client, office, meta, monkeypatch
):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    template_id = meta.add_template(WABA, "order_ready", "en", "REJECTED", reason="INVALID_FORMAT")
    sync(office, tenant)
    assert [p["action"] for p in view(office, tenant)["plan"]
            if p["name"] == "order_ready" and p["language"] == "en"] == ["edit"]
    answer = submit(office, tenant, ["order_ready:en"])
    assert answer.json()["results"][0]["result"] == "resubmitted"
    assert [t for t, _ in meta.edited] == [template_id] and meta.created == []
    assert row(answer.json(), "order_ready")["status"] == "submitted"
    assert row(answer.json(), "order_ready")["reason"] == ""


def test_a_refusal_by_meta_is_reported_and_the_rest_still_go(client, office, meta, monkeypatch):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.refuse_template[("order_done", "en")] = (400, 100, "Invalid parameter: body text")
    answer = submit(office, tenant, ["order_done", "order_cancelled"])
    results = {(r["name"], r["language"]): r for r in answer.json()["results"]}
    assert results[("order_done", "en")]["result"] == "refused"
    assert "Invalid parameter" in results[("order_done", "en")]["note"]
    assert results[("order_done", "ar")]["result"] == "submitted"
    assert row(answer.json(), "order_done")["status"] == "draft"
    assert trail(tenant)[-1][:2] == ("templates_submitted", True)


def test_a_long_list_stops_when_meta_says_too_many_requests(client, office, meta, monkeypatch):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.rate_limit_after = 3
    answer = submit(office, tenant)
    results = answer.json()["results"]
    assert len(meta.created) == 3 and len(results) == 4
    assert results[-1]["result"] == "refused" and "too many requests" in results[-1]["note"]


# ── what Meta tells us by webhook ──────────────────────────────────────────────────────────


def test_meta_saying_a_template_was_approved_or_refused_reaches_the_shops_inventory(
    client, office, meta, monkeypatch
):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    submit(office, tenant, ["order_confirmed", "order_ready"])

    approved = signed_post(client, status_notice(WABA, "order_confirmed", "APPROVED"))
    assert approved.status_code == 200
    refusal = status_notice(WABA, "order_ready", "REJECTED", reason="INVALID_FORMAT", **{
        "rejection_info": {"reason": "Parameters sit next to each other.",
                           "recommendation": "Separate parameters with text."}})
    assert signed_post(client, refusal).status_code == 200
    data = view(office, tenant)
    assert row(data, "order_confirmed")["status"] == "approved"
    assert row(data, "order_ready")["status"] == "rejected"
    assert row(data, "order_ready")["reason"] == "INVALID_FORMAT"
    assert row(data, "order_ready")["advice"] == "Separate parameters with text."
    assert [t for t in trail(tenant) if t[0] == "template"] == [
        ("template", True, "ALYR"), ("template", False, "ALYR")]

    # Paused, then reinstated.
    pause = status_notice(WABA, "order_confirmed", "PAUSED", **{
        "other_info": {"title": "FIRST_PAUSE", "description": "Paused after low quality."}})
    signed_post(client, pause)
    paused = row(view(office, tenant), "order_confirmed")
    assert paused["status"] == "paused" and paused["reason"] == "FIRST_PAUSE"
    signed_post(client, status_notice(WABA, "order_confirmed", "REINSTATED"))
    back = row(view(office, tenant), "order_confirmed")
    assert back["status"] == "approved" and back["reason"] == ""


def test_a_notice_reaches_every_shop_on_the_account_and_no_other(
    client, client_factory, office, meta
):
    first, _, _ = new_business(client)
    second, _, _ = new_business(client_factory())
    third, _, _ = new_business(client_factory())
    attach(office, meta, first)
    attach(office, meta, second)
    attach(office, meta, third, waba="999900001111")
    signed_post(client, status_notice(WABA, "order_done", "APPROVED"))
    assert ("order_done", "en") in rows_of(first) and ("order_done", "en") in rows_of(second)
    assert rows_of(third) == {}


def test_a_notice_must_be_signed_and_one_for_an_unknown_account_is_dropped(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    assert signed_post(client, status_notice(WABA, "order_done", "APPROVED"),
                       secret="wrong").status_code == 401
    assert rows_of(tenant) == {}
    assert signed_post(client, status_notice("555", "order_done", "APPROVED")).status_code == 200
    assert rows_of(tenant) == {}


def test_a_notice_that_cannot_be_applied_never_fails_the_webhook(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    for value in ({}, {"event": "APPROVED"}, {"event": "NOT_A_STATUS", "message_template_name": "x",
                                              "message_template_language": "en"}):
        notice = {"object": "whatsapp_business_account", "entry": [{"id": WABA, "changes": [
            {"field": "message_template_status_update", "value": value}]}]}
        assert signed_post(client, notice).status_code == 200
    assert rows_of(tenant) == {}


def test_meta_changing_a_templates_category_is_recorded_and_flagged_on_the_trail(
    client, office, meta
):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.add_template(WABA, "back_in_stock", "en", "APPROVED")
    sync(office, tenant)
    notice = {"object": "whatsapp_business_account", "entry": [{"id": WABA, "changes": [
        {"field": "template_category_update", "value": {
            "message_template_id": 1, "message_template_name": "back_in_stock",
            "message_template_language": "en", "previous_category": "UTILITY",
            "new_category": "MARKETING"}}]}]}
    assert signed_post(client, notice).status_code == 200
    assert row(view(office, tenant), "back_in_stock")["category"] == "marketing"
    last = owner_sql("select ok, detail::text as d from whatsapp_line_events "
                     "where tenant_id = $1 and kind = 'template' order by id desc", tenant)[0]
    assert last["ok"] is False and "marketing" in last["d"]
    # An announcement of a change about to happen changes nothing yet, and says so.
    coming = json.loads(json.dumps(notice))
    value = coming["entry"][0]["changes"][0]["value"]
    value.update({"new_category": "UTILITY", "correct_category": "MARKETING"})
    value.pop("previous_category")
    signed_post(client, coming)
    assert row(view(office, tenant), "back_in_stock")["category"] == "marketing"


# ── the list, isolation, staff ─────────────────────────────────────────────────────────────


def test_the_list_of_lines_counts_each_shops_templates(client, office, meta):
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    meta.add_template(WABA, "order_confirmed", "en", "APPROVED")
    meta.add_template(WABA, "order_ready", "en", "REJECTED", reason="INCORRECT_CATEGORY")
    sync(office, tenant)
    mine = next(line for line in office.get("/api/admin/whatsapp/lines").json()["lines"]
                if line["business_id"] == tenant)
    assert mine["templates"]["wanted"] == len(CATALOGUE) * 2
    assert mine["templates"]["by_status"] == {"approved": 1, "rejected": 1}
    assert mine["templates"]["problems"] == 1


def test_one_business_cannot_read_anothers_templates(client, client_factory, office, meta):
    first, _, _ = new_business(client)
    second, _, _ = new_business(client_factory())
    attach(office, meta, first)
    meta.add_template(WABA, "order_confirmed")
    sync(office, first)

    async def as_second():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(second) as conn:
                return await conn.fetchval("select count(*) from whatsapp_templates")
        finally:
            await db.close()

    assert asyncio.run(as_second()) == 0


def test_only_alyr_staff_can_read_sync_or_submit_templates(client, meta, monkeypatch):
    allow_submitting(monkeypatch)
    tenant, _, _ = new_business(client)
    assert client.get(at(tenant, "templates")).status_code == 403
    assert client.post(at(tenant, "templates/sync")).status_code == 403
    assert client.post(at(tenant, "templates/submit"), json={"names": []}).status_code == 403
    assert meta.calls == []


# ── the older command-line tool honours the hold too ───────────────────────────────────────


def test_the_command_line_tool_does_not_submit_a_held_template(meta, monkeypatch, capsys):
    monkeypatch.setenv("ALYR_META_ACCESS_TOKEN", "t")
    monkeypatch.setenv("ALYR_META_WABA_ID", WABA)
    get_settings.cache_clear()
    meta.wabas[WABA] = {"numbers": [], "apps": []}
    asyncio.run(templates_sync.main(create=True))
    get_settings.cache_clear()
    sent = {b["name"] for b in meta.created}
    assert sent and not sent & set(HELD)
    assert "HELD" in capsys.readouterr().out
    assert whatsapp_templates.WANTED


# ── the API's image holds only apps/api ────────────────────────────────────────────────────


def test_the_command_line_tool_imports_where_there_is_no_repository_around_it(monkeypatch):
    """In the API's container the file is /app/src/alyr/templates_sync.py: no fifth parent.
    Importing it crashed the container at start-up (CI's image check, 31 Oct 2026); now ROOT is
    None and the templates with a sample picture say so."""
    path = templates_sync.__file__
    source = open(path, encoding="utf-8").read()
    namespace = {"__file__": "/app/src/alyr/templates_sync.py", "__name__": "image_check"}
    exec(compile(source, path, "exec"), namespace)  # noqa: S102 - the module's own source
    assert namespace["ROOT"] is None
    card = CATALOGUE["weekly_report_card"]
    assert namespace["sample_available"](card, "en") is False
    assert namespace["sample_available"](CATALOGUE["document_receipt"], "en") is True


def test_a_template_whose_sample_picture_is_not_in_the_build_is_not_sent_from_here(
    client, office, meta, monkeypatch
):
    allow_submitting(monkeypatch, app_id="1071845795713841")
    monkeypatch.setattr(templates_sync, "ROOT", None)
    tenant, _, _ = new_business(client)
    attach(office, meta, tenant)
    plan = {(p["name"], p["language"]): p["action"] for p in view(office, tenant)["plan"]}
    assert plan[("weekly_report_card", "en")] == "needs_sample"
    answer = submit(office, tenant, ["weekly_report_card"])
    assert answer.status_code == 200 and answer.json()["results"] == []
    assert meta.created == [] and meta.uploads == []
