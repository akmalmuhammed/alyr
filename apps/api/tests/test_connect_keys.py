"""API keys: a machine proves it speaks for one shop, and for nothing else (ALY-142, spec 016).

A key is shown once and stored as a hash; it is found by a visible prefix; it carries scopes; it
can be revoked and then it is dead at once; it has a rate limit of its own; it never opens the
workspace, another module or another shop. Everything goes through the real path: PostgreSQL, the
HTTP API, row-level security.
"""

import asyncio
import hashlib
import inspect
import re
from uuid import UUID

import asyncpg
import pytest

from alyr.db import Database
from alyr.modules.connect import keys as keys_module
from conftest import APP_DSN
from connect_support import (
    SCOPES_ALL,
    connected_shop,
    make_key,
    rows,
    sale_body,
)
from documents_sales_support import activity
from documents_support import as_app


@pytest.fixture
def shop(client_factory, monkeypatch):
    return connected_shop(client_factory, monkeypatch)


def ping(shop, secret=None, **headers):
    auth = {"Authorization": f"Bearer {secret or shop.secret}"} if secret != "" else {}
    return shop.machine.get("/api/connect/ping", headers={**auth, **headers})


# ── making a key ─────────────────────────────────────────────────────────────────────────


def test_a_key_is_shown_once_and_only_its_hash_is_kept(shop):
    made = make_key(shop.shop, SCOPES_ALL, name="Back counter")
    secret = made["secret"]
    assert re.fullmatch(r"alyr_k1_[a-z0-9]{8}_[A-Za-z0-9_-]{43}", secret)
    # The list never shows it again: only the prefix, which is how a shop tells its keys apart.
    listed = shop.owner.get("/api/connect-setup/overview").json()["keys"]
    mine = next(k for k in listed if k["id"] == made["key"]["id"])
    assert mine["prefix"] == secret.split("_")[2]
    assert "secret" not in mine and "secret_hash" not in mine
    assert secret not in shop.owner.get("/api/connect-setup/overview").text
    # In the database: a SHA-256, nothing that could be turned back into the key.
    [row] = rows("select prefix, secret_hash from api_keys where id = $1",
                 UUID(made["key"]["id"]))
    assert row["secret_hash"] == hashlib.sha256(secret.rsplit("_", 1)[0].encode()).hexdigest() \
        or row["secret_hash"] == hashlib.sha256(secret.split("_", 3)[3].encode()).hexdigest()
    assert secret not in str(rows("select * from api_keys where tenant_id = $1", shop.tenant_id))


def test_a_key_is_compared_in_constant_time():
    """The check that proves a key is `authenticate`; it compares hashes only with
    `hmac.compare_digest`, never with `==` or `in`."""
    source = inspect.getsource(keys_module.authenticate)
    assert "hmac.compare_digest(stored" in source
    assert "stored ==" not in source and "== stored" not in source
    assert 'secret_hash"] ==' not in source


def test_making_a_key_needs_the_terms_accepted_first(client_factory, monkeypatch):
    fresh = connected_shop(client_factory, monkeypatch, accept_terms=False)
    refused = fresh.owner.post("/api/connect-setup/keys",
                               json={"name": "Till", "scopes": ["sales:write"]})
    assert refused.status_code == 409
    assert refused.json()["code"] == "terms_not_accepted"
    assert "message_ar" in refused.json()
    fresh.owner.post("/api/connect-setup/terms/accept")
    assert fresh.owner.post("/api/connect-setup/keys",
                            json={"name": "Till", "scopes": ["sales:write"]}).status_code == 201


def test_only_owners_and_admins_manage_keys(shop):
    body = {"name": "Sneaky", "scopes": ["sales:write"]}
    assert shop.shop.agent.post("/api/connect-setup/keys", json=body).status_code == 403
    assert shop.shop.agent.get("/api/connect-setup/overview").status_code == 403
    assert shop.shop.admin.post("/api/connect-setup/keys", json=body).status_code == 201
    first = shop.owner.get("/api/connect-setup/overview").json()["keys"][0]["id"]
    assert shop.shop.agent.post(f"/api/connect-setup/keys/{first}/revoke").status_code == 403


def test_a_key_needs_a_name_and_a_known_scope(shop):
    bad_scope = shop.owner.post("/api/connect-setup/keys",
                                json={"name": "x", "scopes": ["everything"]})
    assert bad_scope.status_code == 422
    assert shop.owner.post("/api/connect-setup/keys",
                           json={"name": " ", "scopes": ["sales:write"]}).status_code in (
        422, 400)
    assert shop.owner.post("/api/connect-setup/keys", json={
        "name": "x", "scopes": ["sales:write"], "rate_limit_per_minute": 5000}).status_code == 422


def test_a_shop_has_at_most_ten_active_keys(shop):
    for number in range(9):
        make_key(shop.shop, ["documents:read"], name=f"Key {number}")
    refused = shop.owner.post("/api/connect-setup/keys",
                              json={"name": "11th", "scopes": ["documents:read"]})
    assert refused.status_code == 409 and refused.json()["code"] == "too_many_keys"
    # Revoking one makes room.
    first = shop.owner.get("/api/connect-setup/overview").json()["keys"][-1]["id"]
    shop.owner.post(f"/api/connect-setup/keys/{first}/revoke")
    assert shop.owner.post("/api/connect-setup/keys",
                           json={"name": "11th", "scopes": ["documents:read"]}).status_code == 201


# ── using it ─────────────────────────────────────────────────────────────────────────────


def test_a_good_key_is_known(shop):
    answer = ping(shop)
    assert answer.status_code == 200
    assert answer.json()["key"]["name"] == "Till 1"
    assert answer.json()["key"]["scopes"] == SCOPES_ALL


def test_a_missing_malformed_unknown_or_wrong_key_is_refused_in_the_same_words(shop):
    prefix = shop.secret.split("_")[2]
    wrong_secret = f"alyr_k1_{prefix}_" + "A" * 43
    unknown_prefix = "alyr_k1_zzzzzzzz_" + "A" * 43
    codes = set()
    for secret in ("", "not-a-key", wrong_secret, unknown_prefix):
        answer = ping(shop, secret)
        assert answer.status_code == 401, secret
        codes.add(answer.json()["code"])
        assert answer.headers["www-authenticate"] == "Bearer"
    # No answer says which prefixes exist: a wrong secret and an unknown prefix read the same.
    assert ping(shop, wrong_secret).json() == ping(shop, unknown_prefix).json()
    assert codes <= {"key_missing", "key_invalid"}


def test_a_key_in_the_wrong_scheme_is_refused(shop):
    answer = shop.machine.get("/api/connect/ping", headers={"Authorization": shop.secret})
    assert answer.status_code == 401


def test_a_revoked_key_is_dead_at_once(shop):
    assert ping(shop).status_code == 200
    done = shop.owner.post(f"/api/connect-setup/keys/{shop.key['id']}/revoke")
    assert done.status_code == 200 and done.json()["key"]["active"] is False
    answer = ping(shop)
    assert answer.status_code == 401 and answer.json()["code"] == "key_revoked"
    sale = shop.post_sale(sale_body())
    assert sale.status_code == 401
    # Revoking twice changes nothing and says nothing new.
    assert shop.owner.post(f"/api/connect-setup/keys/{shop.key['id']}/revoke").status_code == 200


def test_a_revoked_key_does_not_tell_a_stranger_it_ever_existed(shop):
    shop.owner.post(f"/api/connect-setup/keys/{shop.key['id']}/revoke")
    prefix = shop.secret.split("_")[2]
    guess = ping(shop, f"alyr_k1_{prefix}_" + "B" * 43)
    assert guess.json()["code"] == "key_invalid"  # only the real holder hears "revoked"


def test_scopes_decide_what_a_key_may_do(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch, scopes=["documents:read"])
    assert shop.post_sale(sale_body()).status_code == 403
    assert shop.post_sale(sale_body()).json()["code"] == "scope_missing"
    assert shop.machine.get("/api/connect/webhooks", headers=shop.headers()).status_code == 403
    only_sales = make_key(shop.shop, ["sales:write"])
    seller = {"Authorization": f"Bearer {only_sales['secret']}"}
    sold = shop.machine.post("/api/connect/sales", json=sale_body(),
                             headers={**seller, "Idempotency-Key": "scope-test-1"})
    assert sold.status_code == 201, sold.text
    looked = shop.machine.get(f"/api/connect/sales/{sold.json()['sale']['external_sale_id']}",
                              headers=seller)
    assert looked.status_code == 403 and looked.json()["code"] == "scope_missing"


# ── what a key can never reach ───────────────────────────────────────────────────────────


def test_a_key_never_opens_the_workspace_or_other_modules(shop):
    for path in ("/api/documents", "/api/documents/settings", "/api/items", "/api/orders",
                 "/api/connect-setup/overview", "/api/workspace/home"):
        answer = shop.machine.get(path, headers=shop.headers())
        assert answer.status_code in (401, 403, 404), (path, answer.status_code)
        assert answer.status_code != 200, path


def test_a_signed_in_person_is_not_a_machine(shop):
    answer = shop.owner.get("/api/connect/ping")
    assert answer.status_code == 401 and answer.json()["code"] == "key_missing"
    assert shop.owner.post("/api/connect/sales", json=sale_body(),
                           headers={"Idempotency-Key": "owner-tries-it"}).status_code == 401


def test_a_key_of_one_shop_cannot_see_the_documents_of_another(client_factory, monkeypatch):
    mine = connected_shop(client_factory, monkeypatch)
    theirs = connected_shop(client_factory, monkeypatch)
    made = theirs.sale(sale_body("THEIRS-1"))
    document_id = made["document"]["id"]
    # The other shop's document is simply not found, however it is asked for.
    looked = mine.machine.get(f"/api/connect/documents/{document_id}", headers=mine.headers())
    assert looked.status_code == 404
    pdf = mine.machine.get(f"/api/connect/documents/{document_id}/pdf", headers=mine.headers())
    assert pdf.status_code == 404
    sale = mine.machine.get("/api/connect/sales/THEIRS-1", headers=mine.headers())
    assert sale.status_code == 404
    # And the other shop's key reads it.
    assert theirs.machine.get(f"/api/connect/documents/{document_id}",
                              headers=theirs.headers()).status_code == 200


def test_the_database_hides_one_shops_keys_from_another(client_factory, monkeypatch):
    a = connected_shop(client_factory, monkeypatch)
    b = connected_shop(client_factory, monkeypatch)

    async def count(conn):
        return await conn.fetchval("select count(*) from api_keys")

    assert as_app(a.tenant_id, count) == 1
    assert as_app(b.tenant_id, count) == 1
    # With the lookup setting alone (no shop) exactly that one key can be read: the way sign-in
    # finds a person's shops. Without it nothing can.
    prefix_of_a = a.secret.split("_")[2]

    async def unscoped():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.unscoped() as conn:
                nothing = await conn.fetchval("select count(*) from api_keys")
            async with db.unscoped() as conn, conn.transaction():
                await conn.execute("select set_config('app.api_key_prefix', $1, true)",
                                   prefix_of_a)
                one = await conn.fetchval("select count(*) from api_keys")
            try:
                # Reading by prefix is all it allows: it cannot write another shop's key.
                async with db.unscoped() as conn, conn.transaction():
                    await conn.execute("select set_config('app.api_key_prefix', $1, true)",
                                       prefix_of_a)
                    await conn.execute("update api_keys set name = 'x'")
                changed = "allowed"
            except asyncpg.InsufficientPrivilegeError:
                changed = "refused"
            return nothing, one, changed
        finally:
            await db.close()

    nothing, one, changed = asyncio.run(unscoped())
    assert (nothing, one, changed) == (0, 1, "refused")


def test_the_module_off_stops_a_key(shop):
    from test_consent import owner_sql

    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'documents'",
              shop.tenant_id)
    answer = ping(shop)
    assert answer.status_code == 403 and answer.json()["code"] == "module_off"


# ── the rate limit ───────────────────────────────────────────────────────────────────────


def test_a_key_over_its_limit_gets_429_and_retry_after(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch, rate=3)
    for _ in range(3):
        assert ping(shop).status_code == 200
    over = ping(shop)
    assert over.status_code == 429
    assert over.json()["code"] == "rate_limited"
    assert 1 <= int(over.headers["retry-after"]) <= 60
    assert over.json()["retry_after"] == int(over.headers["retry-after"])
    # A refused call still counts, so hammering the closed door does not open it.
    assert ping(shop).status_code == 429
    # The window passes: the count starts again.
    from test_consent import owner_sql

    owner_sql("update api_keys set window_start = window_start - interval '2 minutes' "
              "where id = $1", UUID(shop.key["id"]))
    assert ping(shop).status_code == 200


def test_the_limit_is_each_keys_own(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch, rate=2)
    other = make_key(shop.shop, SCOPES_ALL, name="Till 2", rate=50)["secret"]
    for _ in range(3):
        ping(shop)
    assert ping(shop).status_code == 429
    assert ping(shop, other).status_code == 200


def test_every_answer_says_how_many_calls_are_left(client_factory, monkeypatch):
    shop = connected_shop(client_factory, monkeypatch, rate=10)
    answer = ping(shop)
    assert answer.headers["x-ratelimit-limit"] == "10"
    assert answer.headers["x-ratelimit-remaining"] == "9"
    assert int(answer.headers["x-ratelimit-reset"]) >= 1


def test_the_use_of_a_key_is_noted(shop):
    assert rows("select last_used_at from api_keys where id = $1",
                UUID(shop.key["id"]))[0]["last_used_at"] is None
    ping(shop)
    assert rows("select last_used_at from api_keys where id = $1",
                UUID(shop.key["id"]))[0]["last_used_at"] is not None
    listed = shop.owner.get("/api/connect-setup/overview").json()["keys"][0]
    assert listed["last_used_at"]


# ── the record ───────────────────────────────────────────────────────────────────────────


def test_making_and_revoking_a_key_are_on_the_record(shop):
    shop_id = shop.tenant_id
    made = activity(shop.shop, "document", shop_id, "api_key_created")
    assert made and made[0]["detail"]["name"] == "Till 1"
    assert made[0]["detail"]["scopes"] == SCOPES_ALL
    assert shop.secret not in str(made)
    shop.owner.post(f"/api/connect-setup/keys/{shop.key['id']}/revoke")
    assert activity(shop.shop, "document", shop_id, "api_key_revoked")


def test_what_a_key_does_to_webhooks_is_on_the_record_under_its_name(client_factory,
                                                                     monkeypatch):
    monkeypatch.setenv("ALYR_WEBHOOK_ALLOW_LOCAL", "true")
    shop = connected_shop(client_factory, monkeypatch)
    from connect_support import Receiver

    receiver = Receiver()
    try:
        added = shop.machine.post("/api/connect/webhooks", headers=shop.headers(), json={
            "url": receiver.url, "events": ["document.issued"]})
        assert added.status_code == 201, added.text
        webhook_id = added.json()["webhook"]["id"]
        shop.machine.delete(f"/api/connect/webhooks/{webhook_id}", headers=shop.headers())
    finally:
        receiver.stop()
    seen = activity(shop.shop, "document", shop.tenant_id)
    actions = {a["action"]: a for a in seen if a["action"].startswith("webhook_")}
    assert {"webhook_added", "webhook_removed"} <= set(actions)
    assert actions["webhook_added"]["actor_name"] == "API key Till 1"
