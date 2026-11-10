"""Discovery Phase 2, the brief line and the Agent's item (spec 066, D-166): the one thing a
morning brief may ask Discovery, and the same count on the workspace home today."""

import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from alyr.core import actions
from alyr.core.actions import Caller
from alyr.modules.agent.words import plain
from alyr.modules.discovery import brief
from alyr.modules.discovery import proposal_words as pw
from discovery_proposals_support import (
    BASE,
    approve,
    branch_manager,
    find,
    prepared_shop,
    proposals,
)
from discovery_support import discovery_shop
from test_consent import owner_sql


@pytest.fixture
def shop(client_factory, monkeypatch):
    return prepared_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))


def line(shop, caller: Caller, lang: str = "en"):
    async def go():
        async with shop.owner.app.state.db.tenant(shop.tenant_id) as conn:
            return await brief.brief_line(conn, caller, lang)

    return shop.owner.portal.call(go)


def person(shop, role: str, channel: str = "portal") -> Caller:
    email = shop.emails[role]
    uid = owner_sql("select id from users where email = $1", email)[0]["id"]
    return Caller(uid, role.title(), role, channel)


def test_the_line_counts_what_the_caller_may_approve_in_both_languages(shop):
    owner = line(shop, person(shop, "owner"))
    assert owner == {"key": "discovery_proposals", "count": 10, "oldest_days": 0,
                     "text": "10 changes waiting for your approval",
                     "href": "/app/discovery?view=proposals"}
    ar = line(shop, person(shop, "admin"), "ar")
    assert ar["text"] == "10 تعديلات بانتظار موافقتك" and ar["count"] == 10


def test_one_two_and_three_changes_agree_in_english_and_arabic():
    for n, en, ar in ((1, "1 change waiting for your approval", "تعديل واحد بانتظار موافقتك"),
                      (2, "2 changes waiting for your approval", "تعديلان بانتظار موافقتك"),
                      (3, "3 changes waiting for your approval", "3 تعديلات بانتظار موافقتك"),
                      (11, "11 changes waiting for your approval", "11 تعديلاً بانتظار موافقتك")):
        assert pw.waiting_text(n, "en") == en and pw.waiting_text(n, "ar") == ar


def test_it_says_how_long_the_oldest_has_waited(shop):
    owner_sql("update discovery_proposals set proposed_at = now() - interval '4 days' "
              "where tenant_id = $1", shop.tenant_id)
    assert line(shop, person(shop, "owner"))["oldest_days"] == 4


def test_the_line_is_the_same_whether_or_not_an_ask_was_sent(shop):
    before = line(shop, person(shop, "owner"))["count"]
    owner_sql("insert into discovery_asks (tenant_id, proposal_id, contact_id, change_hash, "
              "sent_as) select p.tenant_id, p.id, c.id, p.change_hash, 'buttons' from "
              "discovery_proposals p, contacts c where p.tenant_id = $1 and false", shop.tenant_id)
    assert line(shop, person(shop, "owner"))["count"] == before == 10


def test_none_when_nothing_waits_when_the_caller_may_approve_nothing_or_discovery_is_off(
        client_factory, monkeypatch, shop):
    assert line(shop, person(shop, "agent")) is None  # staff with no place approves nothing
    assert line(shop, Caller(None, "ALYR", actions.ENGINE, "system")) is None
    assert line(shop, Caller(None, "x", "owner", "portal")) is None  # no login
    for p in proposals(shop.owner, "live"):
        shop.owner.post(f"{BASE}/proposals/{p['id']}/decline")
    assert line(shop, person(shop, "owner")) is None
    off = discovery_shop(client_factory, monkeypatch, module=False)
    uid = owner_sql("select id from users where email = $1", off.emails["owner"])[0]["id"]
    assert line(off, Caller(uid, "Owner", "owner", "portal")) is None


def test_a_branch_manager_is_counted_for_their_own_place_only(client_factory, shop):
    manager, uid = branch_manager(client_factory, shop, "Al Sadd", name="Reem")
    mine = len([p for p in proposals(shop.owner, "live") if p["location"]["name"].endswith(
        "Al Sadd")])
    assert line(shop, Caller(UUID(uid), "Reem", "agent", "portal"))["count"] == mine
    # approving one lowers it
    approve(manager, find(shop.owner, "hours_missing", "Al Sadd"))
    assert line(shop, Caller(UUID(uid), "Reem", "agent", "portal"))["count"] == mine - 1


def test_an_expired_change_is_not_counted(shop):
    owner_sql("update discovery_proposals set proposed_at = now() - interval '15 days', "
              "expires_at = now() - interval '1 day' where id = (select id from "
              "discovery_proposals where tenant_id = $1 limit 1)", shop.tenant_id)
    assert line(shop, person(shop, "owner"))["count"] == 9


# ── the Agent's Needs you now, on the workspace home ────────────────────────────────────


def needs(client, lang: str = "en") -> dict:
    home = client.get("/api/agent", params={"lang": lang}).json()
    return {i["key"]: i for i in home["needs"]["items"]}


def test_the_agents_needs_you_now_lists_the_item_for_an_owner_or_admin_only(shop):
    for client in (shop.owner, shop.admin):
        item = needs(client)["discovery_proposals"]
        assert item["count"] == 10 and item["href"] == "/app/discovery?view=proposals"
        assert plain(item["words"]) == "10 changes waiting for your approval"
        assert plain(item["detail"]) == "Nothing is applied without your tap."
        assert item["rule"] == (
            "RULE · a proposed change is waiting for your approval, not older than 14 days · "
            "10 changes")
    assert "discovery_proposals" not in needs(shop.agent)


def test_the_agents_item_is_in_arabic_too_and_leaves_when_nothing_waits(shop):
    item = needs(shop.owner, "ar")["discovery_proposals"]
    assert plain(item["words"]) == "10 تعديلات بانتظار موافقتك"
    assert plain(item["detail"]) == "لا يُطبَّق شيء قبل أن تضغط."
    assert re.search(r"[؀-ۿ]", item["rule"])
    for p in proposals(shop.owner, "live"):
        shop.owner.post(f"{BASE}/proposals/{p['id']}/decline")
    assert "discovery_proposals" not in needs(shop.owner)


def test_a_shop_without_discovery_never_sees_the_item(client_factory, monkeypatch):
    off = discovery_shop(client_factory, monkeypatch, module=False)
    assert "discovery_proposals" not in needs(off.owner)
    assert datetime.now(UTC) - timedelta(days=1) < datetime.now(UTC)
