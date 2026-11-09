"""The connector's sign-in (spec 067, ALY-288): an app registers, a person signs in with the email
code and says yes, and the app gets tokens that are random, kept only as hashes, short-lived,
rotated, tied to one business and to the person's role as it is on every call.

A test client completes the whole flow the way Claude and ChatGPT do: metadata, registration (or a
client-ID document), authorization with PKCE, the page, the code, the business, the opt-in, the
token, the refresh. Through the real path: PostgreSQL, HTTP, row-level security.
"""

import hashlib
import json
from urllib.parse import parse_qs, urlsplit

import pytest

from alyr.modules.mcp import clients
from conftest import APP_DSN
from mcp_support import (
    CLAUDE,
    ISSUER,
    RESOURCE,
    App,
    environment,
    hidden,
    new_shop,
    person,
    pkce,
    sql,
)


@pytest.fixture
def world(client_factory, monkeypatch):
    environment(monkeypatch)
    shop = new_shop()
    return shop, App(client_factory())


# ── The documents an app reads first ───────────────────────────────────────────────────────────


def test_the_two_metadata_documents_say_what_the_standards_ask(world):
    _, app = world
    resource = app.http.get("/.well-known/oauth-protected-resource/mcp").json()
    assert resource["resource"] == RESOURCE
    assert resource["authorization_servers"] == [ISSUER]
    assert resource["scopes_supported"] == ["read"]
    assert app.http.get("/.well-known/oauth-protected-resource").json() == resource

    server = app.http.get("/.well-known/oauth-authorization-server").json()
    assert server["issuer"] == ISSUER
    assert server["authorization_endpoint"] == f"{ISSUER}/oauth/authorize"
    assert server["token_endpoint"] == f"{ISSUER}/oauth/token"
    assert server["registration_endpoint"] == f"{ISSUER}/oauth/register"
    assert server["code_challenge_methods_supported"] == ["S256"]
    assert server["token_endpoint_auth_methods_supported"] == ["none"]
    assert server["authorization_response_iss_parameter_supported"] is True
    assert server["client_id_metadata_document_supported"] is True
    assert set(server["grant_types_supported"]) == {"authorization_code", "refresh_token"}


def test_everything_answers_404_when_the_connector_is_switched_off(client_factory, monkeypatch):
    environment(monkeypatch, mcp_enabled="false")
    http = client_factory()
    for method, path in (
        ("get", "/.well-known/oauth-protected-resource"),
        ("get", "/.well-known/oauth-authorization-server"),
        ("post", "/oauth/register"), ("get", "/oauth/authorize"), ("post", "/oauth/token"),
        ("post", "/oauth/revoke"), ("post", "/mcp"), ("get", "/api/mcp"),
    ):
        assert getattr(http, method)(path).status_code == 404, path


def test_without_a_token_the_answer_points_at_the_metadata(world):
    _, app = world
    answer = app.rpc(None, "tools/list")
    assert answer.status_code == 401
    challenge = answer.headers["www-authenticate"]
    assert f'resource_metadata="{ISSUER}/.well-known/oauth-protected-resource/mcp"' in challenge
    # No token was judged, so no error is named (RFC 6750).
    assert "error=" not in challenge
    bad = app.rpc("not-a-token", "tools/list")
    assert bad.status_code == 401 and 'error="invalid_token"' in bad.headers["www-authenticate"]


# ── Registration ───────────────────────────────────────────────────────────────────────────────


def test_registration_makes_a_public_client_and_never_a_secret(world):
    _, app = world
    answer = app.http.post("/oauth/register", json={
        "client_name": "Claude", "redirect_uris": [CLAUDE], "token_endpoint_auth_method": "none"})
    assert answer.status_code == 201
    body = answer.json()
    assert body["client_id"].startswith("alyr_mcp_c_")
    assert "client_secret" not in body and body["token_endpoint_auth_method"] == "none"
    assert answer.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("body", [
    {"client_name": "x", "redirect_uris": ["http://evil.example/cb"]},
    {"client_name": "x", "redirect_uris": ["https://ok.example/cb#frag"]},
    {"client_name": "x", "redirect_uris": ["https://user:pw@ok.example/cb"]},
    {"client_name": "x", "redirect_uris": ["javascript:alert(1)"]},
    {"client_name": "x", "redirect_uris": []},
    {"client_name": "x", "redirect_uris": [CLAUDE], "token_endpoint_auth_method": "client_secret_post"},
    {"client_name": "x", "redirect_uris": [CLAUDE], "grant_types": ["client_credentials"]},
])
def test_registration_refuses_what_it_should(world, body):
    _, app = world
    answer = app.http.post("/oauth/register", json=body)
    assert answer.status_code == 400
    assert answer.json()["error"] in ("invalid_redirect_uri", "invalid_client_metadata")


def test_registration_may_use_a_loopback_redirect_and_matches_any_port(world):
    shop, app = world
    app.redirect = "http://127.0.0.1/callback"
    app.register()
    # The port a native app picks changes each time (RFC 8252); the rest must still match.
    app.redirect = "http://127.0.0.1:53211/callback"
    tokens = app.connect(person(shop), scope="read")
    assert tokens.access
    app.redirect = "http://127.0.0.1:53211/other"
    page = app.start(pkce()[1])
    assert page.status_code == 400  # a page, not a redirect


# ── A client whose ID is an address (CIMD) ─────────────────────────────────────────────────────


DOC_URL = "https://chatgpt.example/oauth/client.json"


def serve(monkeypatch, document, status=200, content_type="application/json"):
    import httpx

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status, content=json.dumps(document).encode(),
                              headers={"content-type": content_type})

    monkeypatch.setattr(clients, "transport", httpx.MockTransport(handler))

    async def public(host, port):
        return ["93.184.216.34"]

    monkeypatch.setattr("alyr.modules.connect.ssrf.resolve", public)
    return seen


def test_a_client_id_that_is_an_address_is_read_and_shown(world, monkeypatch):
    shop, app = world
    seen = serve(monkeypatch, {
        "client_id": DOC_URL, "client_name": "ChatGPT", "token_endpoint_auth_method": "none",
        "redirect_uris": ["https://chatgpt.com/connector_platform_oauth_redirect"],
    })
    app.client_id = DOC_URL
    app.redirect = "https://chatgpt.com/connector_platform_oauth_redirect"
    app.name = "ChatGPT"
    verifier, challenge = pkce()
    page = app.start(challenge)
    assert page.status_code == 200 and seen
    assert seen[0].headers["host"] == "chatgpt.example"  # connected to the vetted address
    after = app.sign_in(page, person(shop))
    # The page names the app and the address it will return to, and where its own description is.
    assert "ChatGPT" in after.text and "chatgpt.com" in after.text
    assert "chatgpt.example" in after.text
    done = app.consent(after)
    code = parse_qs(urlsplit(done.headers["location"]).query)["code"][0]
    assert app.exchange(code, verifier).access
    assert sql("select kind from mcp_clients where client_id = $1", DOC_URL)[0]["kind"] == "cimd"


@pytest.mark.parametrize("document", [
    {"client_id": "https://other.example/x.json", "client_name": "A",
     "redirect_uris": ["https://a.example/cb"]},
    {"client_id": DOC_URL, "redirect_uris": ["https://a.example/cb"]},
    {"client_id": DOC_URL, "client_name": "A", "redirect_uris": ["http://a.example/cb"]},
    {"client_id": DOC_URL, "client_name": "A", "redirect_uris": ["https://a.example/cb"],
     "token_endpoint_auth_method": "client_secret_basic"},
])
def test_a_client_document_that_is_wrong_is_refused(world, monkeypatch, document):
    _, app = world
    serve(monkeypatch, document)
    app.client_id, app.redirect = DOC_URL, "https://a.example/cb"
    assert app.start(pkce()[1]).status_code == 400


def test_a_client_document_at_a_private_address_is_never_fetched(world, monkeypatch):
    _, app = world
    seen = serve(monkeypatch, {"client_id": DOC_URL})

    async def private(host, port):
        return ["10.0.0.5"]

    monkeypatch.setattr("alyr.modules.connect.ssrf.resolve", private)
    app.client_id, app.redirect = DOC_URL, "https://a.example/cb"
    assert app.start(pkce()[1]).status_code == 400
    assert seen == []


# ── The page ───────────────────────────────────────────────────────────────────────────────────


def test_the_whole_flow_gives_tokens_that_are_random_and_kept_only_as_hashes(world):
    shop, app = world
    tokens = app.connect(person(shop), scope="read stock")
    assert tokens.scope == "read stock"
    assert tokens.raw["token_type"] == "Bearer" and tokens.raw["expires_in"] == 1800
    assert tokens.access.startswith("alyr_mcp_at_") and tokens.refresh.startswith("alyr_mcp_rt_")
    kept = sql("select kind, token_hash from mcp_tokens where tenant_id = $1", shop.tenant_id)
    hashes = {r["token_hash"] for r in kept}
    for value in (tokens.access, tokens.refresh):
        assert hashlib.sha256(value.encode()).hexdigest() in hashes
    everything = json.dumps(sql("select * from mcp_tokens where tenant_id = $1", shop.tenant_id),
                            default=str)
    assert tokens.access not in everything and tokens.refresh not in everything
    # Two sign-ins never make the same secret.
    again = App(app.http, client_id=app.client_id).connect(person(shop), scope="read")
    assert again.access != tokens.access and again.refresh != tokens.refresh


def test_a_bad_redirect_or_client_is_a_page_and_never_a_redirect(world):
    _, app = world
    app.register()
    other = app.start(pkce()[1], redirect_uri="https://evil.example/cb")
    assert other.status_code == 400 and "location" not in other.headers
    app.client_id = "alyr_mcp_c_unknown"
    assert app.start(pkce()[1]).status_code == 400


@pytest.mark.parametrize("change", [
    {"code_challenge_method": "plain"}, {"code_challenge": "short"}, {"resource": "https://x/mcp"},
])
def test_a_request_that_breaks_the_rules_is_sent_back_with_an_error(world, change):
    _, app = world
    app.register()
    page = app.http.get(app.authorize_url(pkce()[1], **change), follow_redirects=False)
    assert page.status_code == 303
    query = parse_qs(urlsplit(page.headers["location"]).query)
    assert query["error"] and query["iss"] == [ISSUER] and query["state"] == ["xyz"]


def test_the_page_is_not_cached_and_cannot_be_framed(world):
    _, app = world
    app.register()
    page = app.start(pkce()[1])
    assert page.headers["cache-control"] == "no-store"
    assert page.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in page.headers["content-security-policy"]
    assert "<script" not in page.text


def test_the_page_comes_in_arabic_too(world):
    _, app = world
    app.register()
    page = app.start(pkce()[1], lang="ar")
    assert 'lang="ar"' in page.text and 'dir="rtl"' in page.text


def test_a_request_is_only_for_the_browser_that_began_it(world, client_factory):
    shop, app = world
    app.register()
    page = app.start(pkce()[1])
    elsewhere = App(client_factory(), client_id=app.client_id)  # no cookie
    sent = elsewhere.http.post("/oauth/authorize/email",
                               data={"req": hidden(page.text, "req"), "email": person(shop)})
    assert sent.status_code == 400


def test_an_unknown_email_gets_the_same_page_and_no_code(world):
    _, app = world
    app.register()
    page = app.start(pkce()[1])
    sent = app.http.post("/oauth/authorize/email",
                         data={"req": hidden(page.text, "req"), "email": "nobody@nowhere.example"})
    assert sent.status_code == 200 and "data-dev-code" not in sent.text
    assert "6-digit code" in sent.text


def test_a_wrong_code_is_refused_with_the_same_words(world):
    shop, app = world
    app.register()
    page = app.start(pkce()[1])
    req = hidden(page.text, "req")
    app.http.post("/oauth/authorize/email", data={"req": req, "email": person(shop)})
    wrong = app.http.post("/oauth/authorize/code", data={"req": req, "code": "000000"})
    assert wrong.status_code == 400 and "wrong or has expired" in wrong.text


# ── The business, the role, the opt-in ─────────────────────────────────────────────────────────


def test_only_an_owner_can_switch_the_connector_on_and_it_is_recorded(world):
    shop, app = world
    app.register()
    # An admin is told an owner must.
    page = app.start(pkce()[1])
    after = app.sign_in(page, person(shop, "admin"))
    assert after.status_code == 403 and "owner" in after.text
    # An owner who does not tick is stopped on the page.
    page = app.start(pkce()[1])
    after = app.sign_in(page, person(shop, "owner"))
    assert "opt_in" in after.text
    refused = app.consent(after, opt_in=False)
    assert refused.status_code == 200 and "Tick the box" in refused.text
    assert sql("select enabled from mcp_settings where tenant_id = $1", shop.tenant_id) == []
    # With the tick it is on, with who and when and which words.
    tokens = app.connect(person(shop, "owner"))
    assert tokens.access
    [row] = sql("select * from mcp_settings where tenant_id = $1", shop.tenant_id)
    assert row["enabled"] and row["enabled_by"] == "Owner" and row["opt_in_version"]
    seen = sql("select action, channel from activity where tenant_id = $1 and subject = 'mcp'",
               shop.tenant_id)
    assert {"action": "opted_in", "channel": "mcp"} in seen
    # Now an admin may connect: the owner already agreed for the business.
    admin = App(app.http, client_id=app.client_id).connect(person(shop, "admin"), opt_in=False)
    assert admin.access


def test_a_person_in_two_businesses_picks_one_and_the_grant_is_for_that_one(world):
    shop, app = world
    other = new_shop()
    # The same person on both teams.
    email = person(shop)
    user = sql("select id from users where email = $1", email)[0]["id"]
    sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
        other.tenant_id, user)
    app.register()
    page = app.start(pkce()[1])
    after = app.sign_in(page, email)
    assert 'action="/oauth/authorize/shop"' in after.text
    verifier, challenge = pkce()
    done = app.consent(after, other.tenant_id)
    code = parse_qs(urlsplit(done.headers["location"]).query)["code"][0]
    # (the page's challenge was another one: the exchange below proves PKCE binds the code)
    assert app.token({"grant_type": "authorization_code", "code": code, "client_id": app.client_id,
                      "redirect_uri": CLAUDE, "code_verifier": verifier}).status_code == 400
    [grant] = sql("select tenant_id from mcp_grants where user_id = $1", user)
    assert grant["tenant_id"] == other.tenant_id


def test_a_business_that_is_not_theirs_is_refused(world):
    shop, app = world
    other = new_shop()
    app.register()
    page = app.start(pkce()[1])
    after = app.sign_in(page, person(shop))
    done = app.http.post("/oauth/authorize/consent", data={
        "req": hidden(after.text, "req"), "tenant_id": str(other.tenant_id),
        "decision": "allow", "opt_in": "yes"}, follow_redirects=False)
    assert done.status_code == 403
    assert sql("select 1 from mcp_grants where tenant_id = $1", other.tenant_id) == []


def test_saying_no_sends_the_app_back_with_access_denied(world):
    shop, app = world
    app.register()
    page = app.start(pkce()[1])
    after = app.sign_in(page, person(shop))
    done = app.consent(after, decision="deny")
    query = parse_qs(urlsplit(done.headers["location"]).query)
    assert query["error"] == ["access_denied"] and "code" not in query
    assert sql("select 1 from mcp_grants where tenant_id = $1", shop.tenant_id) == []


# ── The code ───────────────────────────────────────────────────────────────────────────────────


def _code(app, shop, **more):
    verifier, challenge = pkce()
    page = app.start(challenge, **more)
    after = app.sign_in(page, person(shop))
    done = app.consent(after)
    return parse_qs(urlsplit(done.headers["location"]).query)["code"][0], verifier


def test_the_code_works_once_and_a_second_use_ends_the_grant(world):
    shop, app = world
    app.register()
    code, verifier = _code(app, shop)
    first = app.exchange(code, verifier)
    assert app.rpc(first.access, "tools/list").status_code == 200
    again = app.token({"grant_type": "authorization_code", "code": code,
                       "client_id": app.client_id, "redirect_uri": CLAUDE,
                       "code_verifier": verifier})
    assert again.status_code == 400 and again.json()["error"] == "invalid_grant"
    # Whoever holds what the first use made must not keep it.
    assert app.rpc(first.access, "tools/list").status_code == 401
    assert app.refresh(first.refresh).json()["error"] == "invalid_grant"


@pytest.mark.parametrize("what", ["verifier", "redirect", "client", "resource", "nothing"])
def test_a_code_needs_everything_it_was_made_for(world, what):
    shop, app = world
    app.register()
    code, verifier = _code(app, shop)
    data = {"grant_type": "authorization_code", "code": code, "client_id": app.client_id,
            "redirect_uri": CLAUDE, "code_verifier": verifier, "resource": RESOURCE}
    expected = "invalid_grant"
    if what == "verifier":
        data["code_verifier"] = pkce()[0]
    elif what == "redirect":
        data["redirect_uri"] = "https://claude.ai/other"
    elif what == "client":
        data["client_id"] = "alyr_mcp_c_other"
    elif what == "resource":
        data["resource"] = "https://elsewhere.example/mcp"
        expected = "invalid_target"
    elif what == "nothing":
        del data["code_verifier"]
        expected = "invalid_request"
    answer = app.token(data)
    assert answer.status_code == 400 and answer.json()["error"] == expected, answer.text
    # A failed try does not leave an app with a token.
    assert sql("select 1 from mcp_tokens where kind = 'access' and tenant_id = $1",
               shop.tenant_id) == []


def test_a_code_that_has_run_out_is_refused(world):
    shop, app = world
    app.register()
    code, verifier = _code(app, shop)
    sql("update mcp_tokens set expires_at = now() - interval '1 second' where kind = 'code'")
    assert app.token({"grant_type": "authorization_code", "code": code,
                      "client_id": app.client_id, "redirect_uri": CLAUDE,
                      "code_verifier": verifier}).json()["error"] == "invalid_grant"


def test_the_token_endpoint_is_form_encoded_and_says_what_it_does_not_do(world):
    _, app = world
    assert app.token({"grant_type": "password"}).json()["error"] == "unsupported_grant_type"
    assert app.token({"grant_type": "client_credentials"}).json()["error"] == (
        "unsupported_grant_type")
    assert app.token({}).status_code == 400
    ok = app.token({"grant_type": "authorization_code"})
    assert ok.json()["error"] == "invalid_request"
    assert ok.headers["cache-control"] == "no-store"


# ── Refresh, expiry, revoke ────────────────────────────────────────────────────────────────────


def test_a_refresh_token_is_rotated_and_using_an_old_one_ends_the_grant(world):
    shop, app = world
    first = app.connect(person(shop))
    answer = app.refresh(first.refresh)
    assert answer.status_code == 200
    second = answer.json()
    assert second["refresh_token"] != first.refresh and second["access_token"] != first.access
    assert app.rpc(second["access_token"], "tools/list").status_code == 200
    # The first refresh token is spent. Using it again means it was copied: everything ends.
    stolen = app.refresh(first.refresh)
    assert stolen.status_code == 400 and stolen.json()["error"] == "invalid_grant"
    assert app.rpc(second["access_token"], "tools/list").status_code == 401
    assert app.refresh(second["refresh_token"]).json()["error"] == "invalid_grant"
    why = sql("select revoked_why from mcp_grants where tenant_id = $1", shop.tenant_id)
    assert why[0]["revoked_why"] == "refresh_reused"


def test_a_refresh_cannot_widen_the_scope_or_be_used_by_another_client(world):
    shop, app = world
    tokens = app.connect(person(shop), scope="read")
    assert app.refresh(tokens.refresh, scope="read stock").json()["error"] == "invalid_scope"
    other = App(app.http)
    other.register(name="Other")
    assert other.refresh(tokens.refresh).json()["error"] == "invalid_grant"


def test_expiry_ends_each_kind_of_token(world):
    shop, app = world
    tokens = app.connect(person(shop))
    assert app.rpc(tokens.access, "tools/list").status_code == 200
    sql("update mcp_tokens set expires_at = now() - interval '1 second' where kind = 'access'")
    assert app.rpc(tokens.access, "tools/list").status_code == 401
    sql("update mcp_tokens set expires_at = now() - interval '1 second' where kind = 'refresh'")
    assert app.refresh(tokens.refresh).json()["error"] == "invalid_grant"


def test_a_grant_that_has_run_out_ends_its_tokens(world):
    shop, app = world
    tokens = app.connect(person(shop))
    sql("update mcp_grants set expires_at = now() - interval '1 second' where tenant_id = $1",
        shop.tenant_id)
    assert app.rpc(tokens.access, "tools/list").status_code == 401
    assert app.refresh(tokens.refresh).json()["error"] == "invalid_grant"


def test_the_app_can_revoke_and_the_next_call_is_refused(world):
    shop, app = world
    tokens = app.connect(person(shop))
    assert app.http.post("/oauth/revoke", data={"token": tokens.refresh}).status_code == 200
    assert app.rpc(tokens.access, "tools/list").status_code == 401
    # Saying nothing about whether a token was ever known.
    assert app.http.post("/oauth/revoke", data={"token": "whatever"}).status_code == 200


def test_a_token_made_for_another_address_opens_nothing(world):
    shop, app = world
    tokens = app.connect(person(shop))
    sql("update mcp_grants set resource = 'https://api.alyr.qa/mcp' where tenant_id = $1",
        shop.tenant_id)
    assert app.rpc(tokens.access, "tools/list").status_code == 401


def test_a_code_is_not_a_token_and_a_token_is_not_a_code(world):
    shop, app = world
    app.register()
    code, verifier = _code(app, shop)
    assert app.rpc(code, "tools/list").status_code == 401
    tokens = app.exchange(code, verifier)
    assert app.rpc(tokens.refresh, "tools/list").status_code == 401
    assert app.refresh(tokens.access).json()["error"] == "invalid_grant"


def test_at_most_ten_permissions_per_person_stay_alive(world):
    shop, app = world
    first = app.connect(person(shop))
    for _ in range(10):
        sql("delete from rate_hits")  # five codes an hour per email is its own, tested, rule
        sql("delete from login_codes where used")
        App(app.http, client_id=app.client_id).connect(person(shop))
    live = sql("select count(*) as n from mcp_grants where tenant_id = $1 and revoked_at is null",
               shop.tenant_id)[0]["n"]
    assert live == 10
    assert app.rpc(first.access, "tools/list").status_code == 401  # the oldest ended


def test_a_sign_in_request_is_spent_when_used_and_dead_when_it_runs_out(world):
    shop, app = world
    app.connect(person(shop))
    used = sql("select used_at from mcp_auth_requests where client_id = $1", app.client_id)
    assert used and all(r["used_at"] for r in used)
    page = app.start(pkce()[1])
    sql("update mcp_auth_requests set expires_at = now() - interval '1 second' "
        "where client_id = $1", app.client_id)
    sent = app.http.post("/oauth/authorize/email",
                         data={"req": hidden(page.text, "req"), "email": person(shop)})
    assert sent.status_code == 400


# ── Limits ─────────────────────────────────────────────────────────────────────────────────────


def test_registration_and_the_page_are_limited_per_address(world, monkeypatch):
    _, app = world
    from alyr.core import ratelimit
    from alyr.routes import mcp_oauth

    app.register()
    monkeypatch.setattr(mcp_oauth, "REGISTER_PER_ADDRESS", ratelimit.Limit(3, 3600))
    monkeypatch.setattr(mcp_oauth, "AUTHORIZE_PER_ADDRESS", ratelimit.Limit(2, 600))
    codes = [app.http.post("/oauth/register", json={"client_name": "x",
                                                    "redirect_uris": [CLAUDE]}).status_code
             for _ in range(5)]
    assert codes == [201, 201, 429, 429, 429]  # the first registration was one of the three
    codes = [app.start(pkce()[1]).status_code for _ in range(4)]
    assert codes[:2] == [200, 200] and codes[2:] == [429, 429]


def test_the_token_endpoint_is_limited_per_address(world, monkeypatch):
    _, app = world
    from alyr.core import ratelimit
    from alyr.routes import mcp_oauth

    monkeypatch.setattr(mcp_oauth, "TOKEN_PER_ADDRESS", ratelimit.Limit(2, 600))
    codes = [app.token({"grant_type": "refresh_token"}).status_code for _ in range(4)]
    assert codes == [400, 400, 429, 429]


def test_asking_for_codes_uses_the_sign_in_limits(world):
    shop, app = world
    app.register()
    page = app.start(pkce()[1])
    req = hidden(page.text, "req")
    answers = [app.http.post("/oauth/authorize/email",
                             data={"req": req, "email": person(shop)}).status_code
               for _ in range(7)]
    assert answers[:5] == [200] * 5 and set(answers[5:]) == {429}


def test_the_database_role_cannot_read_another_businesses_tokens(world):
    """A token row can be read by the hash of the token presented, and by the business it belongs
    to: nobody else."""
    import asyncio

    import asyncpg

    shop, app = world
    other = new_shop()
    tokens = app.connect(person(shop))

    async def read(tenant):
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)", str(tenant))
                return await conn.fetch("select token_hash from mcp_tokens")
        finally:
            await conn.close()

    assert asyncio.run(read(other.tenant_id)) == []
    assert len(asyncio.run(read(shop.tenant_id))) == 3  # the code, the token, the refresh
    assert tokens.access
