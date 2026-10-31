"""The health of a business's WhatsApp number (ALY-166, specs/062-whatsapp-health): what Meta says
about a number's quality, status and limit and about the account it is on, read and by webhook; what
ALYR makes of it; the Today list and the alert. Meta is the fake in `fake_meta.py`."""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from alyr.channels.meta import MetaChannel
from alyr.core import alerts, whatsapp_health
from alyr.db import Database
from conftest import APP_DSN
from fake_meta import FakeMeta
from test_consent import owner_sql
from test_onboarding import new_business
from test_whatsapp_line import at, attach, audit, check, the_line, trail
from test_whatsapp_webhook import signed_post

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def meta(monkeypatch):
    return FakeMeta().install(monkeypatch)


def waba():
    return str(uuid.uuid4().int)[:15]


_next = iter(range(1000, 9999))


def number_of(tenant):
    return owner_sql("select number_id from channel_numbers where tenant_id = $1 "
                     "and channel = 'meta'", tenant)[0]["number_id"]


def shop_on(client, office, meta, account, *, display=None, quality=None, status=None):
    """A business with a number on `account`, with a display number of its own. It is attached as
    Meta shows it connected; `quality` and `status` are what Meta says afterwards."""
    tenant, _, _ = new_business(client)
    shown = display or f"+974 5000 {next(_next)}"
    attach(office, meta, tenant, waba=account, display=shown)
    if quality:
        meta.numbers[number_of(tenant)]["quality_rating"] = quality
    if status:
        meta.numbers[number_of(tenant)]["status"] = status
    return tenant, shown


def notice(account, field, value):
    return {"object": "whatsapp_business_account", "entry": [{
        "id": account, "time": 1790000000, "changes": [{"field": field, "value": value}]}]}


def health(office, tenant):
    return the_line(office, tenant)["line"]["health"]


def codes(office, tenant):
    return {r["code"] for r in health(office, tenant)["reasons"]}


def evaluated(number=None, account=None, heard=True, now=NOW):
    base = {"quality_rating": "", "number_status": "", "name_status": "", "name_decision": "",
            "name_reason": "", "messaging_limit": "", "throughput": "", "health": ""}
    return whatsapp_health.evaluate(base | (number or {}), account or {}, now, heard)


# ── what ALYR makes of it ──────────────────────────────────────────────────────────────────


def test_a_line_meta_has_said_nothing_about_is_unknown_and_a_healthy_one_is_ok():
    assert evaluated(heard=False)[0] == "unknown"
    ok = evaluated({"number_status": "CONNECTED", "quality_rating": "GREEN",
                    "health": "AVAILABLE", "messaging_limit": "TIER_250"})
    assert ok[0] == "ok" and ok[1] == []


@pytest.mark.parametrize("number, code, level", [
    ({"number_status": "FLAGGED"}, "number_flagged", "critical"),
    ({"number_status": "RESTRICTED"}, "number_restricted", "critical"),
    ({"number_status": "BANNED"}, "number_banned", "critical"),
    ({"number_status": "PENDING"}, "number_status", "attention"),
    ({"quality_rating": "RED"}, "quality_red", "critical"),
    ({"quality_rating": "YELLOW"}, "quality_yellow", "attention"),
    ({"health": "BLOCKED"}, "sending_blocked", "critical"),
    ({"health": "LIMITED"}, "sending_limited", "attention"),
    ({"name_decision": "REJECTED", "name_reason": "NAME_NOT_CONSISTENT"}, "name_rejected",
     "attention"),
])
def test_what_meta_says_about_a_number_and_how_serious_it_is(number, code, level):
    severity, reasons, _ = evaluated(number)
    assert severity == level and reasons[0]["code"] == code and reasons[0]["scope"] == "number"


def test_a_restriction_is_critical_until_it_runs_out_and_says_when_to_look_again():
    soon = (NOW + timedelta(days=3)).isoformat()
    account = {"restrictions": [{"type": "RESTRICTED_BIZ_INITIATED_MESSAGING", "expires": soon}]}
    severity, reasons, recheck = evaluated(account=account)
    assert severity == "critical" and reasons[0] == {
        "code": "restricted", "level": "critical", "scope": "account",
        "value": "RESTRICTED_BIZ_INITIATED_MESSAGING"}
    assert recheck == NOW + timedelta(days=3)
    assert evaluated(account=account, now=NOW + timedelta(days=4))[0] == "ok"
    # No end date: until Meta lifts it.
    assert evaluated(account={"restrictions": [{"type": "X", "expires": None}]})[0] == "critical"


def test_the_accounts_other_troubles():
    def level(account):
        return evaluated(account=account)[0]

    assert level({"ban": {"state": "DISABLE"}}) == "critical"
    assert level({"ban": {"state": "SCHEDULE_FOR_DISABLE", "date": "2026-11-05"}}) == "critical"
    assert level({"ban": {}}) == "ok"
    assert level({"state": "partner_removed"}) == "critical"
    assert level({"state": "deleted"}) == "critical"
    assert level({"review": "REJECTED"}) == "critical"
    assert level({"review": "PENDING"}) == "attention"
    assert level({"review": "APPROVED"}) == "ok"
    recent = {"violation": {"type": "ADULT", "at": (NOW - timedelta(days=3)).isoformat()}}
    old = {"violation": {"type": "ADULT", "at": (NOW - timedelta(days=40)).isoformat()}}
    assert level(recent) == "attention" and level(old) == "ok"
    active = {"alerts": [{"type": "OBA_REJECTED", "severity": "CRITICAL", "status": "ACTIVE"}]}
    assert level(active) == "attention"
    quiet = {"alerts": [{"type": "OBA_APPROVED", "severity": "INFORMATIONAL", "status": "ACTIVE"},
                        {"type": "X", "severity": "WARNING", "status": "NONE"}]}
    assert level(quiet) == "ok"


# ── reading it from Meta ───────────────────────────────────────────────────────────────────


def test_a_check_reads_the_numbers_health_from_meta_and_keeps_it(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    assert health(office, tenant)["severity"] == "unknown"
    check(office, tenant)
    seen = health(office, tenant)
    assert seen["severity"] == "ok" and seen["quality_rating"] == "GREEN"
    assert seen["number_status"] == "CONNECTED" and seen["messaging_limit"] == "TIER_250"
    assert seen["throughput"] == "STANDARD" and seen["health"] == "AVAILABLE"
    assert seen["polled_at"] and seen["reasons"] == []
    # The extended fields were asked for in one read.
    asked = [q["fields"] for m, p, q, _ in meta.calls if m == "GET" and "fields" in q]
    assert any("whatsapp_business_manager_messaging_limit" in f for f in asked)


def test_when_meta_refuses_the_extended_fields_the_basics_still_answer(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    meta.reject_extended = True
    check(office, tenant)
    seen = health(office, tenant)
    assert seen["quality_rating"] == "GREEN" and seen["severity"] == "ok"
    assert seen["messaging_limit"] == ""


def test_a_quality_change_and_a_flag_are_seen_on_the_next_check_and_the_trail(
    client, office, meta
):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    check(office, tenant)
    nid = number_of(tenant)
    meta.numbers[nid]["quality_rating"] = "YELLOW"
    check(office, tenant)
    assert health(office, tenant)["severity"] == "attention"
    meta.numbers[nid]["status"] = "FLAGGED"
    meta.numbers[nid]["quality_rating"] = "RED"
    check(office, tenant)
    assert health(office, tenant)["severity"] == "critical"
    assert the_line(office, tenant)["line"]["state"] == "problem"
    kinds = [(k, ok) for k, ok, _ in trail(tenant)]
    assert ("quality", False) in kinds and ("health", False) in kinds
    # Back to green: the trail says it recovered.
    meta.numbers[nid]["status"] = "CONNECTED"
    meta.numbers[nid]["quality_rating"] = "GREEN"
    check(office, tenant)
    assert health(office, tenant)["severity"] == "ok"
    assert ("health", True) in [(k, ok) for k, ok, _ in trail(tenant)]


# ── what Meta tells us by webhook ──────────────────────────────────────────────────────────


def test_a_quality_notice_updates_the_limit_of_the_number_it_names_and_no_other(
    client, client_factory, office, meta
):
    account = waba()
    first, shown = shop_on(client, office, meta, account, display="+974 5111 2222")
    second, _ = shop_on(client_factory(), office, meta, account, display="+974 5333 4444")
    value = {"display_phone_number": "97451112222", "event": "THROUGHPUT_UPGRADE",
             "max_daily_conversations_per_business": "TIER_2K", "current_limit": "TIER_UNLIMITED"}
    assert signed_post(client, notice(account, "phone_number_quality_update", value)
                       ).status_code == 200
    assert health(office, first)["messaging_limit"] == "TIER_2K"
    assert health(office, second)["messaging_limit"] == ""
    # Meta's deprecated field is read when the new one is missing.
    value = {"display_phone_number": "97451112222", "event": "ONBOARDING",
             "current_limit": "TIER_250"}
    signed_post(client, notice(account, "phone_number_quality_update", value))
    assert health(office, first)["messaging_limit"] == "TIER_250"
    assert [t for t in trail(first) if t[0] == "limit"]


def test_a_notice_naming_a_number_alyr_has_not_attached_changes_nothing(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account, display="+974 5111 2222")
    value = {"display_phone_number": "97450009999", "event": "ONBOARDING",
             "max_daily_conversations_per_business": "TIER_50"}
    assert signed_post(client, notice(account, "phone_number_quality_update", value)
                       ).status_code == 200
    assert health(office, tenant)["messaging_limit"] == ""


def test_a_rejected_display_name_is_kept_with_meta_reason_and_an_approval_clears_it(
    client, office, meta
):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account, display="+974 5111 2222")
    reject = {"display_phone_number": "97451112222", "decision": "REJECTED",
              "requested_verified_name": "Shop", "rejection_reason": "NAME_NOT_CONSISTENT"}
    signed_post(client, notice(account, "phone_number_name_update", reject))
    seen = health(office, tenant)
    assert seen["name_decision"] == "REJECTED" and seen["name_reason"] == "NAME_NOT_CONSISTENT"
    assert "name_rejected" in codes(office, tenant) and seen["severity"] == "attention"
    approve = {"display_phone_number": "97451112222", "decision": "APPROVED",
               "requested_verified_name": "Shop", "rejection_reason": None}
    signed_post(client, notice(account, "phone_number_name_update", approve))
    assert "name_rejected" not in codes(office, tenant)


def test_an_account_restriction_reaches_every_shop_on_the_account_and_no_other(
    client, client_factory, office, meta
):
    account, other = waba(), waba()
    first, _ = shop_on(client, office, meta, account)
    second, _ = shop_on(client_factory(), office, meta, account)
    third, _ = shop_on(client_factory(), office, meta, other)
    until = int((datetime.now(UTC) + timedelta(days=2)).timestamp())
    value = {"event": "ACCOUNT_RESTRICTION", "restriction_info": [
        {"restriction_type": "RESTRICTED_BIZ_INITIATED_MESSAGING", "expiration": until}]}
    assert signed_post(client, notice(account, "account_update", value)).status_code == 200
    for tenant in (first, second):
        seen = health(office, tenant)
        assert seen["severity"] == "critical" and "restricted" in codes(office, tenant)
        assert seen["restrictions"][0]["type"] == "RESTRICTED_BIZ_INITIATED_MESSAGING"
        assert the_line(office, tenant)["line"]["state"] == "problem"
    assert health(office, third)["severity"] == "unknown"
    assert ("account", None, "ALYR") in trail(first)


def test_a_restriction_that_ran_out_stops_showing_without_a_new_notice(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    owner_sql(
        "insert into whatsapp_line_health (tenant_id, number_id, account, severity, event_at) "
        "select tenant_id, number_id, $2::jsonb, 'critical', now() from channel_numbers "
        "where tenant_id = $1 and channel = 'meta'", tenant,
        json.dumps({"restrictions": [{"type": "X", "expires": past}]}))
    seen = health(office, tenant)
    assert seen["restrictions"] == [] and seen["severity"] == "ok"


def test_a_disable_scheduled_then_lifted_and_the_business_removing_alyr(
    client, office, meta
):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    scheduled = {"event": "DISABLED_UPDATE", "ban_info": {
        "waba_ban_state": "SCHEDULE_FOR_DISABLE", "waba_ban_date": "2026-11-05"}}
    signed_post(client, notice(account, "account_update", scheduled))
    assert "disable_scheduled" in codes(office, tenant)
    lifted = {"event": "DISABLED_UPDATE", "ban_info": {
        "waba_ban_state": "REINSTATE", "waba_ban_date": "2026-11-06"}}
    signed_post(client, notice(account, "account_update", lifted))
    assert health(office, tenant)["severity"] == "ok"
    signed_post(client, notice(account, "account_update", {"event": "PARTNER_REMOVED"}))
    assert "account_partner_removed" in codes(office, tenant)
    # Events that are not about health change nothing.
    before = health(office, tenant)["event_at"]
    signed_post(client, notice(account, "account_update", {"event": "PARTNER_ADDED"}))
    assert health(office, tenant)["event_at"] == before


def test_a_policy_violation_a_review_and_an_alert_are_kept_and_an_alert_can_end(
    client, office, meta
):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    signed_post(client, notice(account, "account_update", {
        "event": "ACCOUNT_VIOLATION", "violation_info": {"violation_type": "ADULT"}}))
    assert "policy_violation" in codes(office, tenant)
    signed_post(client, notice(account, "account_review_update", {"decision": "REJECTED"}))
    seen = health(office, tenant)
    assert seen["review"] == "REJECTED" and seen["severity"] == "critical"
    signed_post(client, notice(account, "account_review_update", {"decision": "APPROVED"}))
    assert "account_review_rejected" not in codes(office, tenant)

    alert = {"entity_type": "BUSINESS", "entity_id": "506914307656634", "alert_info": {
        "alert_severity": "WARNING", "alert_status": "ACTIVE",
        "alert_type": "INCREASED_CAPABILITIES_ELIGIBILITY_DEFERRED",
        "alert_description": "Limits cannot be increased."}}
    signed_post(client, notice(account, "account_alerts", alert))
    assert health(office, tenant)["alerts"][0]["type"] == (
        "INCREASED_CAPABILITIES_ELIGIBILITY_DEFERRED")
    alert["alert_info"]["alert_status"] = "NONE"
    signed_post(client, notice(account, "account_alerts", alert))
    assert health(office, tenant)["alerts"] == []


def test_an_alert_about_one_number_reaches_that_number_only(client, client_factory, office, meta):
    account = waba()
    first, _ = shop_on(client, office, meta, account)
    second, _ = shop_on(client_factory(), office, meta, account)
    nid = number_of(first)
    alert = {"entity_type": "PHONE_NUMBER", "entity_id": nid, "alert_info": {
        "alert_severity": "CRITICAL", "alert_status": "ACTIVE", "alert_type": "OBA_REJECTED",
        "alert_description": "Official business account was denied."}}
    signed_post(client, notice(account, "account_alerts", alert))
    assert len(health(office, first)["alerts"]) == 1
    assert health(office, second)["alerts"] == []


def test_a_notice_for_an_unknown_account_or_without_a_signature_is_dropped(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    body = notice(account, "account_update", {"event": "ACCOUNT_DELETED"})
    assert signed_post(client, body, secret="wrong").status_code == 401
    assert signed_post(client, notice("555", "account_update", {"event": "ACCOUNT_DELETED"})
                       ).status_code == 200
    assert health(office, tenant)["severity"] == "unknown"


def test_detaching_the_number_forgets_its_health(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    check(office, tenant)
    assert owner_sql("select 1 from whatsapp_line_health where tenant_id = $1", tenant)
    assert office.delete(at(tenant, "number")).status_code == 200
    assert owner_sql("select 1 from whatsapp_line_health where tenant_id = $1", tenant) == []


# ── what the founder sees ──────────────────────────────────────────────────────────────────


def today(office):
    return {i["key"]: i for i in office.get("/api/admin/today").json()["items"]}


def test_a_number_in_trouble_is_one_urgent_item_for_that_shop_and_a_quiet_one_is_none(
    client, client_factory, office, meta
):
    account = waba()
    bad, _ = shop_on(client, office, meta, account, quality="RED", status="FLAGGED")
    odd, _ = shop_on(client_factory(), office, meta, account, quality="YELLOW")
    good, _ = shop_on(client_factory(), office, meta, account)
    for tenant in (bad, odd, good):
        check(office, tenant)
    items = today(office)
    assert items[f"line:{bad}"]["urgent"] is True
    assert "flagged" in items[f"line:{bad}"]["detail"] and items[f"line:{bad}"]["kind"] == "line"
    assert items[f"line:{odd}"]["urgent"] is False
    assert f"line:{good}" not in items


def test_a_restricted_shared_account_is_one_item_saying_how_many_shops_it_reaches(
    client, client_factory, office, meta
):
    account = waba()
    shops = [shop_on(c, office, meta, account)[0] for c in (client, client_factory(),
                                                            client_factory())]
    until = int((datetime.now(UTC) + timedelta(days=2)).timestamp())
    signed_post(client, notice(account, "account_update", {
        "event": "ACCOUNT_RESTRICTION", "restriction_info": [
            {"restriction_type": "RESTRICTED_BIZ_INITIATED_MESSAGING", "expiration": until}]}))
    items = today(office)
    assert items[f"account:{account}"]["urgent"] is True
    assert "Reaches 3 shops" in items[f"account:{account}"]["detail"]
    # Not one per shop.
    assert not [k for k in items if k.startswith("line:") and k.split(":")[1] in shops]


def test_templates_that_meta_refused_are_one_quiet_item_for_the_account(
    client, client_factory, office, meta
):
    account = waba()
    first, _ = shop_on(client, office, meta, account)
    second, _ = shop_on(client_factory(), office, meta, account)
    meta.add_template(account, "order_ready", "en", "REJECTED", reason="INCORRECT_CATEGORY")
    meta.add_template(account, "order_done", "en", "PAUSED")
    for tenant in (first, second):
        assert office.post(at(tenant, "templates/sync")).status_code == 200
    item = today(office)[f"templates:{account}"]
    assert item["urgent"] is False and item["title"].startswith("2 message templates")
    assert "Reaches 2 shops" in item["detail"]


def test_the_alert_that_reaches_the_phone_counts_and_names_nothing(client, office, meta):
    owner_sql("delete from whatsapp_line_health")

    async def evaluate():
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await alerts.evaluate(db, datetime.now(UTC))
        finally:
            await db.close()

    assert asyncio.run(evaluate())["line_health"] is None
    account = waba()
    tenant, shown = shop_on(client, office, meta, account, status="RESTRICTED")
    check(office, tenant)
    alert = asyncio.run(evaluate())["line_health"]
    assert alert is not None and alert.urgent is True
    assert "1 number(s)" in alert.detail
    assert shown.replace("+", "").replace(" ", "")[-4:] not in alert.detail
    assert "whatsapp-line.md" in alert.first_step


# ── polling Meta for every line ────────────────────────────────────────────────────────────


def test_polling_reads_every_line_and_one_that_cannot_be_read_does_not_stop_the_rest(
    client, client_factory, office, meta
):
    account = waba()
    first, _ = shop_on(client, office, meta, account, quality="YELLOW")
    second, _ = shop_on(client_factory(), office, meta, account)
    del meta.numbers[number_of(first)]

    async def poll():
        db = Database(APP_DSN)
        await db.connect()
        channel = MetaChannel("token", "v21.0")
        try:
            return await whatsapp_health.poll_all(db, channel)
        finally:
            await channel.close()
            await db.close()

    done = asyncio.run(poll())
    assert done["failed"] >= 1 and done["asked"] >= 1
    assert health(office, second)["severity"] == "ok" and health(office, second)["polled_at"]


def test_the_hourly_pass_makes_severities_again_without_asking_meta(client, office, meta):
    account = waba()
    tenant, _ = shop_on(client, office, meta, account)
    check(office, tenant)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    owner_sql("update whatsapp_line_health set account = $2::jsonb, severity = 'critical' "
              "where tenant_id = $1", tenant,
              json.dumps({"restrictions": [{"type": "X", "expires": past}]}))
    meta.calls.clear()

    async def recompute():
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await whatsapp_health.poll_all(db, MetaChannel("t", "v21.0"), ask_meta=False)
        finally:
            await db.close()

    asyncio.run(recompute())
    assert meta.calls == []
    stored = owner_sql("select severity from whatsapp_line_health where tenant_id = $1", tenant)
    assert stored[0]["severity"] == "ok"


# ── isolation and staff ────────────────────────────────────────────────────────────────────


def test_one_business_cannot_read_anothers_health(client, client_factory, office, meta):
    account = waba()
    first, _ = shop_on(client, office, meta, account)
    second, _, _ = new_business(client_factory())
    check(office, first)

    async def as_second():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(second) as conn:
                return await conn.fetchval("select count(*) from whatsapp_line_health")
        finally:
            await db.close()

    assert asyncio.run(as_second()) == 0


def test_nothing_personal_or_secret_is_kept_in_the_health_row(client, office, meta):
    account = waba()
    tenant, shown = shop_on(client, office, meta, account, display="+974 5777 8888")
    check(office, tenant)
    signed_post(client, notice(account, "phone_number_quality_update", {
        "display_phone_number": "97457778888", "event": "ONBOARDING",
        "max_daily_conversations_per_business": "TIER_50"}))
    stored = json.dumps([dict(r) for r in owner_sql(
        "select quality_rating, number_status, messaging_limit, account::text as account, "
        "reasons::text as reasons from whatsapp_line_health where tenant_id = $1", tenant)])
    assert "57778888" not in stored and "Bearer" not in stored
    assert audit(tenant, "whatsapp.checked")
