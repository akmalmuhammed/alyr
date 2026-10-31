"""A business connects its own WhatsApp account through Meta's Embedded Signup (ALY-39,
specs/063-embedded-signup): the flag, what the browser is told, what the server does with the code
and the session message, the sealed token, and the shop's own token used afterwards. Meta is the
fake in `fake_meta.py`; nothing reaches the network."""

import asyncio
import base64
import json
import uuid
from datetime import UTC, datetime, timedelta

import asyncpg
import pytest

from alyr.channels.meta import MetaChannel
from alyr.channels.simulator import SimulatorChannel
from alyr.config import Settings, get_settings
from alyr.core import channel_keys, whatsapp_health
from alyr.db import Database
from alyr.seed import AGENT_EMAIL
from conftest import APP_DSN
from fake_meta import FakeMeta
from test_consent import owner_sql
from test_onboarding import new_business
from test_sign_in import sign_in
from test_whatsapp_line import at, the_line, trail

APP_ID = "1071845795713841"
SHARED = "shared-test-token"
SIGNUP = "/api/whatsapp/signup"


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def es(monkeypatch):
    """Embedded Signup switched on and configured, and the fake Meta. Request this before `client`:
    the app reads its settings when it is built."""
    monkeypatch.setenv("ALYR_EMBEDDED_SIGNUP", "true")
    monkeypatch.setenv("ALYR_META_APP_ID", APP_ID)
    monkeypatch.setenv("ALYR_META_ES_CONFIG_ID", "1234567890")
    monkeypatch.setenv("ALYR_META_ACCESS_TOKEN", SHARED)
    get_settings.cache_clear()
    fake = FakeMeta(app_id=APP_ID)
    fake.labels[SHARED] = "shared"
    return fake.install(monkeypatch)


@pytest.fixture(autouse=True)
def _clean():
    yield
    owner_sql("delete from whatsapp_line_health")


def digits():
    return str(uuid.uuid4().int)[:15]


def grant(es, label="shop1", *, status="PENDING", lasts=5184000, code=None):
    """A shop's own account and number at Meta, owned by its own token, and a code that exchanges
    for that token once. Returns the body the browser would send."""
    waba, nid = digits(), digits()
    token = f"tok-{label}-{uuid.uuid4().hex[:8]}"
    es.labels[token] = label
    es.add_number(nid, waba, status=status, subscribed=False)
    es.owned[nid] = es.owned[waba] = label
    code = code or f"code-{uuid.uuid4().hex[:8]}"
    es.codes[code] = {"token": token, "expires_in": lasts}
    return {"code": code, "event": "FINISH", "waba_id": waba, "phone_number_id": nid,
            "business_id": "999000111"}, token


def choose(client, way="own_account"):
    assert client.patch("/api/onboarding/whatsapp", json={"way": way}).status_code == 200


def connect(client, body):
    return client.post(f"{SIGNUP}/complete", json=body)


def rows(tenant):
    return owner_sql("select number_id, waba_id, display_phone, attached_by from channel_numbers "
                     "where tenant_id = $1 and channel = 'meta'", tenant)


def credentials(tenant):
    return owner_sql("select number_id, sealed, hint, expires_at from channel_credentials "
                     "where tenant_id = $1", tenant)


# ── the flag, and what the browser is told ─────────────────────────────────────────────────


def test_it_is_off_by_default_and_a_missing_piece_keeps_it_off():
    base = {"env": "production", "meta_app_id": "1", "meta_app_secret": "s",
            "meta_es_config_id": "2", "channel_keys_key": base64.b64encode(b"k" * 32).decode()}
    from alyr.core import whatsapp_signup as signup

    assert signup.available(Settings(**base)) == (False, "off")
    assert signup.available(Settings(**base, embedded_signup=True)) == (True, "")
    for missing in ("meta_app_id", "meta_app_secret", "meta_es_config_id"):
        assert signup.available(Settings(**(base | {missing: ""}), embedded_signup=True)) == (
            False, "not_configured")
    # Nowhere to seal a token outside a developer machine: nothing is offered.
    assert signup.available(Settings(**(base | {"channel_keys_key": ""}), embedded_signup=True)
                            ) == (False, "no_key")


def test_nothing_is_offered_or_accepted_while_it_is_off(client, office):
    tenant, _, _ = new_business(client)
    choose(client)
    assert client.get(f"{SIGNUP}/config").json() == {"available": False, "reason": "off"}
    answer = connect(client, {"code": "x", "event": "FINISH", "waba_id": "12345678",
                              "phone_number_id": "87654321"})
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "off"
    assert rows(tenant) == []


def test_the_owner_is_given_the_public_values_for_the_way_they_chose_and_no_secret(
    client, es
):
    new_business(client)
    assert client.get(f"{SIGNUP}/config").json() == {"available": False, "reason": "way"}
    choose(client, "own_account")
    own = client.get(f"{SIGNUP}/config").json()
    assert own["available"] and own["app_id"] == APP_ID and own["config_id"] == "1234567890"
    assert own["extras"] == {"setup": {}, "sessionInfoVersion": "3"}
    choose(client, "move_number")
    moved = client.get(f"{SIGNUP}/config").json()
    assert moved["extras"] == {"setup": {}, "sessionInfoVersion": "3",
                               "featureType": "whatsapp_business_app_onboarding"}
    assert "test-app-secret" not in json.dumps(moved) and SHARED not in json.dumps(moved)
    # The setup the owner's screen reads says whether to show Connect, and nothing more.
    state = client.get("/api/onboarding/readiness").json()
    whatsapp = next(c for c in state["checks"] if c["key"] == "whatsapp")
    assert whatsapp["setup"]["connect"] == {"available": True}


def test_a_number_on_alyrs_account_is_not_connected_this_way(client, es):
    new_business(client)
    choose(client, "new_number")
    assert client.get(f"{SIGNUP}/config").json() == {"available": False, "reason": "way"}


def test_only_the_owner_or_an_admin_may_ask_connect_or_cancel(client, es):
    # The demo shop's agent is a member of staff, not its owner.
    sign_in(client, AGENT_EMAIL)
    assert client.get(f"{SIGNUP}/config").status_code == 403
    assert connect(client, {"code": "x", "event": "FINISH", "waba_id": "12345678",
                            "phone_number_id": "87654321"}).status_code == 403
    assert client.post(f"{SIGNUP}/cancel", json={"event": "CANCEL"}).status_code == 403
    assert es.calls == []


# ── connecting ─────────────────────────────────────────────────────────────────────────────


def test_a_business_connects_its_own_account_and_everything_is_checked_with_its_own_token(
    es, client, office
):
    tenant, _, _ = new_business(client)
    choose(client)
    body, token = grant(es)
    answer = connect(client, body)
    assert answer.status_code == 200, answer.text
    # The code was exchanged, the claims read back with the shop's own token, the number
    # registered with a six-digit PIN, and the app subscribed to the account.
    paths = es.paths()
    assert paths[0] == "oauth/access_token"
    assert es.registered[0][0] == body["phone_number_id"] and len(es.registered[0][1]) == 6
    assert APP_ID in es.wabas[body["waba_id"]]["apps"]
    assert set(es.who[1:]) == {"shop1"}
    # The number is attached, by the sign-up, and the go-live list says WhatsApp is done.
    [row] = rows(tenant)
    assert row["number_id"] == body["phone_number_id"] and row["waba_id"] == body["waba_id"]
    assert row["attached_by"].startswith("Embedded Signup (")
    whatsapp = next(c for c in answer.json()["checks"] if c["key"] == "whatsapp")
    assert whatsapp["status"] == "done"
    # On the line's trail, and its health was read at once.
    assert ("signup", True) in [(k, ok) for k, ok, _ in trail(tenant)]
    health = the_line(office, tenant)["line"]
    assert health["health"]["number_status"] == "CONNECTED"
    assert health["credential"]["kind"] == "own"


def test_the_token_is_sealed_bound_to_its_business_and_number_and_never_returned(
    es, client, office
):
    tenant, _, _ = new_business(client)
    choose(client)
    body, token = grant(es)
    answer = connect(client, body)
    [stored] = credentials(tenant)
    sealed = bytes(stored["sealed"])
    assert token.encode() not in sealed and stored["hint"] == token[-4:]
    opened = channel_keys.unseal(uuid.UUID(str(tenant)), body["phone_number_id"], sealed)
    assert opened["token"] == token and len(opened["pin"]) == 6
    # Copied to another number or another business, it does not open.
    with pytest.raises(channel_keys.Unreadable):
        channel_keys.unseal(uuid.UUID(str(tenant)), digits(), sealed)
    with pytest.raises(channel_keys.Unreadable):
        channel_keys.unseal(uuid.uuid4(), body["phone_number_id"], sealed)
    # Nowhere is it shown: not in the answer, the line, the trail or the audit log.
    everything = json.dumps([answer.json(), the_line(office, tenant), [
        dict(r) for r in owner_sql("select detail::text from whatsapp_line_events "
                                   "where tenant_id = $1", tenant)]])
    assert token not in everything and opened["pin"] not in everything


def test_a_number_moved_from_the_whatsapp_business_app_is_not_registered_again(
    es, client
):
    tenant, _, _ = new_business(client)
    choose(client, "move_number")
    body, _ = grant(es, status="CONNECTED")
    body["event"] = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
    assert connect(client, body).status_code == 200
    assert es.registered == [] and rows(tenant)
    [stored] = credentials(tenant)
    assert "pin" not in channel_keys.unseal(uuid.UUID(str(tenant)), body["phone_number_id"],
                                            bytes(stored["sealed"]))
    last = [d for d in owner_sql("select detail::text as d from whatsapp_line_events "
                                 "where tenant_id = $1 and kind = 'signup'", tenant)][-1]["d"]
    assert '"coexistence": true' in last and '"registered": false' in last


def test_later_calls_about_the_number_go_with_the_shops_own_token_and_other_shops_with_alyrs(
    es, client, client_factory, office
):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    connect(client, body)
    nid = body["phone_number_id"]
    # A shop on ALYR's own account, attached by staff, beside it.
    other, _, _ = new_business(client_factory())
    shared_nid, shared_waba = digits(), digits()
    es.add_number(shared_nid, shared_waba)
    assert office.post(at(other, "number"), json={
        "number_id": shared_nid, "waba_id": shared_waba}).status_code == 200
    es.who.clear()
    es.calls.clear()
    assert office.post(at(tenant, "line/check")).status_code == 200
    assert office.post(at(tenant, "templates/sync")).status_code == 200
    assert set(es.who) == {"shop1"}
    es.who.clear()
    assert office.post(at(other, "line/check")).status_code == 200
    assert set(es.who) == {"shared"}
    # A send from the shop's own number is made with its own token.
    owner_sql(
        "insert into contacts (tenant_id, phone, name, role, number_id, last_inbound_at) "
        "values ($1, '97455550199', 'Hamad', 'staff', $2, now())", tenant, nid)
    person = owner_sql("select id from contacts where tenant_id = $1 and role = 'staff'",
                       tenant)[0]["id"]
    es.who.clear()
    sent = office.post(at(tenant, "line/test"), json={"contact_id": str(person)})
    assert sent.status_code == 200 and es.who[-1] == "shop1" and es.sent
    # The lines list says whose token each line is sent with.
    lines = {x["business_id"]: x for x in office.get("/api/admin/whatsapp/lines").json()["lines"]}
    assert lines[tenant]["credential"]["kind"] == "own"
    assert lines[tenant]["credential"]["expires_at"]
    assert lines[other]["credential"] == {"kind": "shared", "expires_at": None}


# ── what is refused ────────────────────────────────────────────────────────────────────────


def test_a_session_message_naming_assets_the_token_cannot_see_attaches_nothing(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    # A number that belongs to somebody else's account at Meta.
    stranger, stranger_waba = digits(), digits()
    es.add_number(stranger, stranger_waba)
    es.owned[stranger] = es.owned[stranger_waba] = "shop2"
    forged = body | {"phone_number_id": stranger, "waba_id": stranger_waba}
    answer = connect(client, forged)
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "not_shown"
    assert rows(tenant) == [] and credentials(tenant) == [] and es.registered == []
    assert ("signup", False) in [(k, ok) for k, ok, _ in trail(tenant)]
    # A real number named with another account's ID is refused the same way.
    mixed = connect(client, body | {"waba_id": stranger_waba})
    assert mixed.status_code == 422 and rows(tenant) == []


def test_a_code_that_expired_or_was_used_is_refused_in_words(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    assert connect(client, body | {"code": "never-issued"}).status_code == 422
    assert connect(client, body).status_code == 200
    again = connect(client, body)
    assert again.status_code == 422 and again.json()["detail"]["code"] == "code"
    assert len(rows(tenant)) == 1


def test_meta_refusing_to_register_or_to_subscribe_attaches_nothing(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    es.refuse_register = (400, 133016, "Account registration limit reached")
    answer = connect(client, body)
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "register"
    assert rows(tenant) == [] and credentials(tenant) == []
    es.refuse_register = None
    es.refuse_subscribe = (400, 100, "Webhook subscription failed")
    fresh, _ = grant(es)
    answer = connect(client, fresh)
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "subscribe"
    assert rows(tenant) == [] and credentials(tenant) == []
    reasons = owner_sql("select detail::text as d from whatsapp_line_events where tenant_id = $1 "
                        "and kind = 'signup' and ok is false", tenant)
    assert any("registration limit" in r["d"] for r in reasons)


def test_a_number_that_is_not_connected_even_after_registering_is_refused(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es, status="PENDING")
    es.numbers[body["phone_number_id"]]["status"] = "PENDING"

    # Meta registers it and still shows it as pending.
    original = es.route

    def route(method, parts, query, request_body):
        answer = original(method, parts, query, request_body)
        if method == "POST" and parts[-1] == "register":
            es.numbers[body["phone_number_id"]]["status"] = "PENDING"
        return answer

    es.route = route
    answer = connect(client, body)
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "not_connected"
    assert rows(tenant) == [] and credentials(tenant) == []


def test_a_finish_that_chose_no_number_is_refused_before_anything_is_asked(es, client):
    new_business(client)
    choose(client)
    body, _ = grant(es)
    es.calls.clear()
    answer = connect(client, body | {"event": "FINISH_ONLY_WABA"})
    assert answer.status_code == 422 and answer.json()["detail"]["code"] == "no_number"
    assert connect(client, body | {"phone_number_id": "abc"}).status_code == 422
    assert es.calls == []


def test_a_number_already_on_another_business_or_a_second_number_is_refused_and_leaves_nothing(
    es, client, client_factory, office
):
    first, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    assert connect(client, body).status_code == 200
    # The same number claimed by another business.
    other_client = client_factory()
    second, _, _ = new_business(other_client)
    choose(other_client)
    again = grant(es, "shop1", code="second-code")[0] | {
        "waba_id": body["waba_id"], "phone_number_id": body["phone_number_id"]}
    taken = connect(other_client, again)
    assert taken.status_code == 422 and taken.json()["detail"]["code"] == "taken"
    assert rows(second) == [] and credentials(second) == []
    # A second number for the first business: detach the first one before changing.
    more, _ = grant(es)
    extra = connect(client, more)
    assert extra.status_code == 422 and extra.json()["detail"]["code"] == "has_number"
    assert len(rows(first)) == 1 and len(credentials(first)) == 1


def test_detaching_the_number_takes_its_credentials_with_it(es, client, office):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es)
    connect(client, body)
    assert office.delete(at(tenant, "number")).status_code == 200
    assert credentials(tenant) == [] and rows(tenant) == []


def test_closing_the_pop_up_or_an_error_in_it_is_noted_on_the_trail(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    assert client.post(f"{SIGNUP}/cancel", json={
        "event": "CANCEL", "step": "PHONE_NUMBER_SETUP"}).status_code == 200
    assert client.post(f"{SIGNUP}/cancel", json={
        "event": "ERROR", "error_message": "Something went wrong", "error_code": "1001"}
    ).status_code == 200
    kinds = [(k, ok) for k, ok, _ in trail(tenant)]
    assert kinds == [("signup", None), ("signup", False)]
    assert client.post(f"{SIGNUP}/cancel", json={"event": "FINISH"}).status_code == 422


# ── the database's part ────────────────────────────────────────────────────────────────────


def test_the_app_role_attaches_a_number_only_through_the_sign_up_and_for_its_own_business(
    es, client, client_factory
):
    tenant, _, _ = new_business(client)
    other, _, _ = new_business(client_factory())

    async def poke():
        db = Database(APP_DSN)
        await db.connect()
        outcomes = {}
        try:
            async with db.tenant(tenant) as conn:
                try:
                    await conn.execute(
                        "select signup_attach_whatsapp_number('12345678', '87654321', '', 'x')")
                except asyncpg.InsufficientPrivilegeError as error:
                    outcomes["no signal"] = str(error)
            try:
                async with db.tenant(tenant) as conn:
                    await conn.execute("select set_config('app.whatsapp_signup', 'on', true)")
                    await conn.execute(
                        "select signup_attach_whatsapp_number('12345678', '87654321', '', 'x')")
            except asyncpg.InsufficientPrivilegeError as error:
                outcomes["no credentials"] = str(error)
            # Another business's credentials are not this business's.
            async with db.tenant(other) as conn:
                await conn.execute(
                    "insert into channel_credentials (number_id, waba_id, sealed) "
                    "values ('12345678', '87654321', $1)", b"\x01" + b"0" * 40)
            try:
                async with db.tenant(tenant) as conn:
                    await conn.execute("select set_config('app.whatsapp_signup', 'on', true)")
                    await conn.execute(
                        "select signup_attach_whatsapp_number('12345678', '87654321', '', 'x')")
            except asyncpg.InsufficientPrivilegeError as error:
                outcomes["someone else's"] = str(error)
            async with db.tenant(tenant) as conn:
                outcomes["seen"] = await conn.fetchval("select count(*) from channel_credentials")
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                async with db.tenant(tenant) as conn:
                    await conn.execute(
                        "insert into channel_numbers (number_id, tenant_id, channel) "
                        "values ('99999999', $1, 'meta')", uuid.UUID(str(tenant)))
        finally:
            await db.close()
        return outcomes

    outcomes = asyncio.run(poke())
    assert set(outcomes) == {"no signal", "no credentials", "someone else's", "seen"}
    assert outcomes["seen"] == 0
    assert rows(tenant) == [] and rows(other) == []


def test_the_lookup_the_channel_uses_answers_ciphertext_never_the_token(es, client):
    tenant, _, _ = new_business(client)
    choose(client)
    body, token = grant(es)
    connect(client, body)
    found = owner_sql("select * from channel_credential_for($1)", body["waba_id"])
    assert len(found) == 1 and str(found[0]["tenant_id"]) == tenant
    assert token.encode() not in bytes(found[0]["sealed"])
    assert owner_sql("select * from channel_credential_for($1)", digits()) == []


# ── the token's own life, the channel's hook ───────────────────────────────────────────────


def test_a_token_that_ends_soon_is_a_look_and_one_that_ended_is_an_emergency(es, client, office):
    tenant, _, _ = new_business(client)
    choose(client)
    body, _ = grant(es, lasts=86400 * 10)
    connect(client, body)
    seen = the_line(office, tenant)["line"]["health"]
    assert seen["severity"] == "attention"
    assert "token_expiring" in {r["code"] for r in seen["reasons"]}
    owner_sql("update channel_credentials set expires_at = $2 where tenant_id = $1", tenant,
              datetime.now(UTC) - timedelta(hours=1))
    ended = the_line(office, tenant)["line"]["health"]
    assert ended["severity"] == "critical"
    assert "token_expired" in {r["code"] for r in ended["reasons"]}
    # Evaluated on its own, too.
    now = datetime(2026, 10, 31, tzinfo=UTC)
    quiet = whatsapp_health.evaluate({"number_status": "CONNECTED"}, {}, now, True,
                                     now + timedelta(days=60))
    assert quiet[0] == "ok" and quiet[2] == now + timedelta(days=46)


def test_the_meta_channel_sends_with_the_token_it_is_told_to_and_alyrs_otherwise():
    seen: list[str] = []

    async def credentials(ident: str):
        return "shop-token" if ident == "111" else None

    fake = FakeMeta()
    fake.labels.update({"shop-token": "shop-x", "alyr-token": "shared"})
    fake.add_number("111", "5000")
    fake.add_number("222", "5001")
    fake.owned["111"] = "shop-x"

    async def go():
        import httpx

        channel = MetaChannel("alyr-token", "v21.0", httpx.MockTransport(fake.handle), credentials)
        try:
            await channel.number_details("111", "status")
            await channel.number_details("222", "status")
            await channel.number_details("222", "status", token="shop-token")
        finally:
            await channel.close()

    try:
        asyncio.run(go())
    except Exception as error:  # the last call is a shop's token on an asset it does not own
        seen.append(type(error).__name__)
    assert fake.who[:2] == ["shop-x", "shared"] and seen == ["HTTPStatusError"]


def test_the_simulator_and_the_channel_protocol_take_the_number_a_file_was_sent_to():
    channel = SimulatorChannel()
    channel.keep("m1", b"abc", "image/png")
    assert asyncio.run(channel.download_media("m1", 10, number_id="sim-x")) == (b"abc", "image/png")
