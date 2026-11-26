"""The Answers check, version 2, through the real path (DECISIONS 6 and 7, research R4): pooled runs
shared by every business of a trade, city, area and language and scored for each by its own name;
counts per tool and per language with a range; a change named only from 30 answers on both sides
with ranges that do not overlap; cited sources and searches; the area as the asker's location; the
method line with numbered tools; the pool's own row-level security; and another shop's rows."""

import asyncio
import json

import asyncpg
import pytest

from alyr.modules.discovery.answers import engines, questions, sources
from alyr.modules.discovery.answers import service as answers_service
from alyr.modules.discovery.answers.engines import RawAnswer, Source
from discovery_support import discovery_shop, run_check_up, turn_on_sample
from test_consent import owner_sql

BASE = "/api/discovery"


@pytest.fixture(autouse=True)
def fresh_pool():
    owner_sql("delete from discovery_answer_pool_runs")


def switch_on(client, **more):
    answer = client.put(f"{BASE}/answers/settings", json={"enabled": True} | more)
    assert answer.status_code == 200, answer.text
    return answer.json()


def answers_of(client, lang: str = "en") -> dict:
    answer = client.get(f"{BASE}/answers?lang={lang}")
    assert answer.status_code == 200, answer.text
    return answer.json()


def sample_shop(client_factory, monkeypatch, roles=("owner",)):
    shop = discovery_shop(client_factory, monkeypatch, roles=roles)
    turn_on_sample(shop)
    return shop


def pool_runs() -> list:
    return owner_sql("select * from discovery_answer_pool_runs order by started_at, lang desc")


def age_pool():
    owner_sql("update discovery_answer_pool_runs set started_at = now() - interval '7 days'")


class Scripted:
    kind = "fake"
    live = False
    cost_per_call = 0

    def __init__(self, behave):
        self.behave = behave
        self.seen = []

    async def ask(self, request, ctx):
        self.seen.append(request)
        return self.behave(request, len(self.seen))


def install(monkeypatch, engine):
    monkeypatch.setattr(engines, "AVAILABLE", ("sample", "fake"))
    monkeypatch.setattr(engines, "get", lambda kind, settings=None: engine)


# ── pooled runs ─────────────────────────────────────────────────────────────────────────


def test_two_businesses_of_the_same_cell_share_one_asking_each_counted_by_its_own_name(
        client_factory, monkeypatch):
    a = sample_shop(client_factory, monkeypatch)
    switch_on(a.owner)
    run_check_up(a.owner)
    first = pool_runs()
    assert [(r["trade"], r["city"], r["area"], r["lang"], r["engine"], r["variant"], r["complete"])
            for r in first] == [("car_care", "doha", "", "en", "sample", "stage0", True),
                                ("car_care", "doha", "", "ar", "sample", "stage0", True)]
    b = sample_shop(client_factory, monkeypatch)
    # B is another (made-up) business that the sample's answers list as a competitor.
    owner_sql("update tenants set name = 'Sahm Auto Spa', name_ar = 'سهم أوتو سبا' where id = $1",
              b.tenant_id)
    owner_sql("update discovery_locations set name = 'Sahm Auto Spa', name_ar = 'سهم أوتو سبا' "
              "where tenant_id = $1", b.tenant_id)
    switch_on(b.owner)
    run_check_up(b.owner)
    assert len(pool_runs()) == 2  # nothing new was asked
    rows_a = owner_sql("select pool_answer_id, named, cost_units from discovery_answers "
                       "where tenant_id = $1", a.tenant_id)
    rows_b = owner_sql("select pool_answer_id, named, cost_units from discovery_answers "
                       "where tenant_id = $1", b.tenant_id)
    assert {r["pool_answer_id"] for r in rows_a} == {r["pool_answer_id"] for r in rows_b}
    assert None not in {r["pool_answer_id"] for r in rows_a}
    assert sum(r["named"] for r in rows_a) == 1 and sum(r["named"] for r in rows_b) == 6
    assert answers_of(b.owner)["headline"] == "Named in 6 of 6 answers."
    assert all(a["shared"] for a in answers_of(b.owner)["last"]["answers"])


def test_a_new_stage_area_or_week_asks_again_and_an_incomplete_run_is_never_shared(
        client_factory, monkeypatch):
    shop = sample_shop(client_factory, monkeypatch)
    switch_on(shop.owner)
    run_check_up(shop.owner)
    run_check_up(shop.owner)  # the sample's next stage is another variant
    assert [r["variant"] for r in pool_runs()] == ["stage0", "stage0", "stage1", "stage1"]
    other = sample_shop(client_factory, monkeypatch)  # stage 0, another area: another cell
    switch_on(other.owner, area="west_bay")
    run_check_up(other.owner)
    assert [(r["area"], r["variant"]) for r in pool_runs()][-2:] == [("west_bay", "stage0")] * 2
    count = len(pool_runs())
    age_pool()
    late = sample_shop(client_factory, monkeypatch)
    switch_on(late.owner, area="west_bay")
    run_check_up(late.owner)
    assert len(pool_runs()) == count + 2  # older than six days: asked again

    def half(request, n):
        if request.lang == "ar":
            raise engines.EngineError("engine_timeout", "slow", "بطيء")
        return RawAnswer("1. **Somewhere** - x")

    engine = Scripted(half)
    install(monkeypatch, engine)
    switch_on(shop.owner, engines=["fake"], trade="car_care", city="doha", area="")
    run_check_up(shop.owner)
    run_check_up(shop.owner)
    fake = [r for r in pool_runs() if r["engine"] == "fake"]
    assert [(r["lang"], r["complete"]) for r in fake] == [("en", True), ("ar", False)] * 1 + [
        ("ar", False)]
    assert len(engine.seen) == 9  # 3 + 3 the first time, then only Arabic again


# ── counts per tool and language, the range, the change ─────────────────────────────────


def test_a_change_is_named_only_from_30_answers_a_side_with_ranges_apart(shop_fake):
    shop, set_answer = shop_fake
    set_answer("1. **Somewhere** - x")
    run_check_up(shop.owner)
    first = answers_of(shop.owner)["last"]["groups"]
    assert [(g["lang"], g["named"], g["counted"], g["range"], g["share"], g["change"]["state"])
            for g in first] == [("en", 0, 30, {"low": 0, "high": 11}, 0, "first"),
                                ("ar", 0, 30, {"low": 0, "high": 11}, 0, "first")]
    age_pool()
    set_answer("1. **Nuqta Car Care** - y")
    run_check_up(shop.owner)
    body = answers_of(shop.owner)
    en = body["last"]["groups"][0]
    assert (en["named"], en["counted"], en["share"], en["change"]["state"]) == (30, 30, 100, "up")
    assert en["change"]["reason"] == (
        "More answers named you than at the check-up before (0 to 11% before, 89 to 100% now), "
        "and the ranges do not overlap.")
    assert en["change"]["since"] == {"named": 0, "counted": 30, "range": {"low": 0, "high": 11}}
    age_pool()
    set_answer("1. **Nuqta Car Care** - y", every=30)  # 29 of 30
    run_check_up(shop.owner)
    en = answers_of(shop.owner)["last"]["groups"][0]
    assert (en["named"], en["change"]["state"]) == (29, "no_change")
    ar = answers_of(shop.owner, "ar")["last"]["groups"][1]
    assert ar["lang_label"] == "العربية" and ar["change"]["reason"].startswith("لا تغيير")


@pytest.fixture
def shop_fake(client_factory, monkeypatch):
    """A shop with a scripted tool asked ten times a question (30 answers a language)."""
    shop = discovery_shop(client_factory, monkeypatch)
    turn_on_sample(shop)
    monkeypatch.setattr(answers_service, "ASKS_PER_QUESTION", 10)
    monkeypatch.setattr(answers_service, "MAX_ASKS_PER_RUN", 60)
    script = {"text": "", "every": 0}

    def behave(request, n):
        if script["every"] and n % script["every"] == 0:
            return RawAnswer("1. **Somewhere** - x")
        return RawAnswer(script["text"])

    install(monkeypatch, Scripted(behave))
    switch_on(shop.owner, engines=["fake"], trade="car_care", city="doha")

    def set_answer(text, every=0):
        script.update(text=text, every=every)

    return shop, set_answer


# ── sources, searches, the quote, the method line ───────────────────────────────────────


def test_where_the_answers_got_their_facts_is_counted_per_host_and_checked(
        client_factory, monkeypatch):
    shop = sample_shop(client_factory, monkeypatch)
    switch_on(shop.owner)
    run_check_up(shop.owner)
    body = answers_of(shop.owner)
    hosts = {h["host"]: h for h in body["last"]["sources"]}
    assert (hosts["doha-car-guide.example"]["answers"],
            hosts["doha-car-guide.example"]["answers_without_you"]) == (6, 5)
    assert hosts["gulf-listings.example"]["check"] == "matches"
    assert hosts["nuqta-carcare.example"]["check"] == "differs"
    assert hosts["nuqta-carcare.example"]["check_label"] == "Differs from what you confirmed"
    assert body["last"]["sources"][0]["host"] == "doha-car-guide.example"  # most cited first
    assert body["last"]["searches"][0]["answers"] >= 1
    named = next(a for a in body["last"]["answers"] if a["named"])
    assert {s["host"] for s in named["sources"]} == set(hosts) and named["searches"]
    assert body["sources_title"] == "Where the answers got their facts"
    assert body["quote_note"].startswith("Answers are shown as the answer tools gave them.")
    assert "Wilson" in body["range_note"]
    # The owner fixes the number on the website (the sample's next stage): the check follows.
    run_check_up(shop.owner)
    hosts = {h["host"]: h for h in answers_of(shop.owner)["last"]["sources"]}
    assert hosts["nuqta-carcare.example"]["check"] == "matches"
    ar = answers_of(shop.owner, "ar")
    assert ar["sources_title"] == "من أين أخذت الإجابات معلوماتها"
    assert {h["check_label"] for h in ar["last"]["sources"]} <= {
        "يطابق ما أكّدته", "يختلف عمّا أكّدته", "لا شيء فيها للمقارنة"}


def test_a_tools_sources_are_kept_as_host_and_title_only_and_its_odd_addresses_dropped(
        client_factory, monkeypatch):
    shop = sample_shop(client_factory, monkeypatch)

    def answer(request, n):
        return RawAnswer(
            "1. **Nuqta Car Care** - y",
            (Source("javascript:alert(1)", "x"),
             Source("https://WWW.Guide.example/p?q=1", "<b>Guide</b>",
                    "Nuqta Car Care +97455550199")),
            ("car care Doha",) * 3, "model-1")

    install(monkeypatch, Scripted(answer))
    switch_on(shop.owner, engines=["fake"], trade="car_care", city="doha")
    run_check_up(shop.owner)
    row = owner_sql("select sources, searches from discovery_answers where tenant_id = $1 "
                    "limit 1", shop.tenant_id)[0]
    assert json.loads(row["sources"]) == [{"host": "guide.example", "title": "<b>Guide</b>",
                                           "check": "differs"}]
    assert json.loads(row["searches"]) == ["car care Doha"]
    shared = owner_sql("select sources, model from discovery_answer_pool limit 1")[0]
    assert json.loads(shared["sources"])[0]["snippet"] == "Nuqta Car Care +97455550199"
    assert shared["model"] == "model-1"


def test_the_method_line_numbers_the_tools_until_naming_is_switched_on(
        client_factory, monkeypatch):
    shop = sample_shop(client_factory, monkeypatch, roles=("owner",))
    install(monkeypatch, Scripted(lambda request, n: RawAnswer("1. **Somewhere** - x")))
    switch_on(shop.owner, engines=["fake"], trade="car_care", city="doha", area="west_bay")
    run_check_up(shop.owner)
    body = answers_of(shop.owner)
    assert body["method"].startswith(
        "ALYR asked the same public questions through the developer interfaces of Answer tool 1, "
        "as if the asker were in West Bay, Doha.")
    assert body["engines"] == [{"kind": "fake", "label": "Answer tool 1", "sample": False,
                                "live": True}]
    assert body["settings"]["area_label"] == "West Bay"
    assert "Fake Tool" not in json.dumps(body)
    monkeypatch.setitem(engines.NAMES, "fake", ("Fake Tool", "أداة مزيفة"))
    assert "Fake Tool" not in json.dumps(answers_of(shop.owner))  # named only with the switch
    monkeypatch.setenv("ALYR_DISCOVERY_ANSWERS_NAME_TOOLS", "true")
    from alyr.config import get_settings

    get_settings.cache_clear()
    named = answers_of(shop.owner)
    assert "developer interfaces of Fake Tool" in named["method"]
    assert named["last"]["groups"][0]["engine_label"] == "Fake Tool"
    assert "أداة مزيفة" in answers_of(shop.owner, "ar")["method"]


# ── the area ────────────────────────────────────────────────────────────────────────────


def test_the_area_is_a_key_of_the_citys_list_sent_as_the_location_not_in_the_question(
        client_factory, monkeypatch):
    shop = sample_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    for body in ({"area": "West Bay"}, {"area": "nowhere"}, {"area": "the_pearl; drop"}):
        answer = shop.owner.put(f"{BASE}/answers/settings", json=body | {"enabled": True})
        assert (answer.status_code, answer.json()["code"]) == (422, "bad_area")
        assert answer.json()["message_ar"]
    refused = shop.agent.put(f"{BASE}/answers/settings", json={"area": "west_bay"})
    assert refused.status_code == 403
    assert switch_on(shop.admin, area="the_pearl")["settings"]["area"] == "the_pearl"
    engine = Scripted(lambda request, n: RawAnswer("1. **Somewhere** - x"))
    install(monkeypatch, engine)
    switch_on(shop.owner, engines=["fake"], trade="car_care", city="doha")
    run_check_up(shop.owner)
    assert {r.location for r in engine.seen} == {questions.Location("QA", "Doha", "The Pearl")}
    assert all("Pearl" not in r.text for r in engine.seen)
    assert switch_on(shop.owner, area="")["settings"]["area"] is None
    options = answers_of(shop.agent)["options"]["areas"]
    assert {"key": "west_bay", "label": "West Bay"} in options["doha"]


# ── the pool holds nothing of a business, and its rows cannot be changed ────────────────


def test_the_pool_holds_no_business_and_another_shop_sees_only_its_own_counts(
        client_factory, monkeypatch):
    a = sample_shop(client_factory, monkeypatch)
    owner_sql("update tenants set name = 'Zanzibar Zephyr Garage' where id = $1", a.tenant_id)
    switch_on(a.owner)
    run_check_up(a.owner)
    columns = {r["column_name"] for r in owner_sql(
        "select column_name from information_schema.columns where table_name in "
        "('discovery_answer_pool_runs', 'discovery_answer_pool')")}
    assert not {c for c in columns if "tenant" in c or "business" in c}
    dump = json.dumps([dict(r) for r in owner_sql("select * from discovery_answer_pool")],
                      default=str)
    assert "Zanzibar" not in dump and str(a.tenant_id) not in dump
    b = discovery_shop(client_factory, monkeypatch, roles=("owner", "admin", "agent"))
    for role in ("owner", "admin", "agent"):
        body = answers_of(getattr(b, role))
        assert body["last"] is None and body["history"] == []


def test_the_app_role_may_read_and_add_to_the_pool_but_never_change_or_delete_it(
        client_factory, monkeypatch):
    from alyr.db import Database
    from conftest import APP_DSN

    a = sample_shop(client_factory, monkeypatch)
    switch_on(a.owner)
    run_check_up(a.owner)

    async def scenario():
        db = Database(APP_DSN)
        await db.connect()
        out = {}
        try:
            async with db.tenant(a.tenant_id) as conn:
                out["read"] = await conn.fetchval("select count(*) from discovery_answer_pool")
            for name, sql in (
                ("update", "update discovery_answer_pool set answer = 'x'"),
                ("delete", "delete from discovery_answer_pool_runs"),
            ):
                try:
                    async with db.tenant(a.tenant_id) as conn:
                        await conn.execute(sql)
                    out[name] = "allowed"
                except asyncpg.InsufficientPrivilegeError:
                    out[name] = "refused"
            try:  # outside a business's transaction nothing may be added
                async with db.unscoped() as conn:
                    await conn.execute(
                        "insert into discovery_answer_pool_runs (trade, city, lang, engine) "
                        "values ('car_care', 'doha', 'en', 'sample')")
                out["insert"] = "allowed"
            except asyncpg.PostgresError:
                out["insert"] = "refused"
        finally:
            await db.close()
        return out

    assert asyncio.run(scenario()) == {
        "read": 6, "update": "refused", "delete": "refused", "insert": "refused"}


def test_a_whole_check_up_with_a_tool_switched_on_makes_no_outside_call(
        client_factory, monkeypatch):
    import socket

    import httpx

    def refuse(*args, **kwargs):
        raise AssertionError("the Answers check made an outside call")

    async def refuse_async(*args, **kwargs):
        raise AssertionError("the Answers check made an outside call")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", refuse_async)
    monkeypatch.setattr(socket, "create_connection", refuse)
    monkeypatch.setenv("ALYR_DISCOVERY_AI_LIVE", "true")
    monkeypatch.setenv("ALYR_DISCOVERY_ANSWERS_NAME_TOOLS", "true")
    shop = sample_shop(client_factory, monkeypatch)
    switch_on(shop.owner, area="west_bay")
    for _ in range(2):
        assert run_check_up(shop.owner)["status"] == "done"
    assert answers_of(shop.owner)["last"]["counted"] == 6
    assert sources.MAX_SOURCES == 10
