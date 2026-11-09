"""The MCP server (spec 067, ALY-289): both eras of the protocol on one endpoint, tools offered by
what the person, the permission and the business allow, a business that is only ever its own,
every call on the activity record, and the switches that stop it.

Through the real path: the OAuth flow, PostgreSQL, HTTP, row-level security.
"""

import json
from uuid import uuid4

import pytest

from mcp_support import MODERN, App, environment, new_shop, person, sql, structured
from test_sign_in import sign_in


def build(client_factory, monkeypatch, **env):
    environment(monkeypatch, **env)
    shop = new_shop()
    return shop, App(client_factory())


@pytest.fixture
def world(client_factory, monkeypatch):
    return build(client_factory, monkeypatch)


def connect_all(shop, app, scope="read stock"):
    """The owner connects first (the opt-in), then the others."""
    owner = app.connect(person(shop, "owner"), scope=scope)
    return owner


def second(app, shop, role, scope="read stock"):
    sql("delete from rate_hits")
    sql("delete from login_codes where used")
    return App(app.http, client_id=app.client_id).connect(person(shop, role), scope=scope,
                                                          opt_in=False)


def names(answer) -> list[str]:
    return [t["name"] for t in answer.json()["result"]["tools"]]


# ── The legacy era: what Claude and ChatGPT send today ─────────────────────────────────────────


def test_a_client_of_the_earlier_revisions_gets_a_stateless_handshake(world):
    shop, app = world
    token = connect_all(shop, app).access
    init = app.rpc(token, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                         "clientInfo": {"name": "x", "version": "1"}})
    assert init.status_code == 200
    result = init.json()["result"]
    assert result["protocolVersion"] == "2025-06-18"
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    assert result["serverInfo"]["name"] == "ALYR"
    assert "mcp-session-id" not in init.headers  # no session is ever made
    assert "resultType" not in result
    asked = app.rpc(token, "initialize", {"protocolVersion": "1999-01-01"})
    assert asked.json()["result"]["protocolVersion"] == "2025-11-25"
    done = app.http.post("/mcp", content=json.dumps(
        {"jsonrpc": "2.0", "method": "notifications/initialized"}),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    assert done.status_code == 202 and done.content == b""
    assert app.rpc(token, "ping").json()["result"] == {}


def test_hello_works_end_to_end_and_says_which_business_and_who(world):
    shop, app = world
    token = connect_all(shop, app).access
    listed = app.rpc(token, "tools/list")
    assert "hello" in names(listed)
    hello = [t for t in listed.json()["result"]["tools"] if t["name"] == "hello"][0]
    assert hello["annotations"]["readOnlyHint"] is True
    assert hello["inputSchema"]["type"] == "object"
    result = app.result(token, "hello")
    data = structured(result)
    assert data["business"] == {"name": "Qirfa Bakery", "name_ar": "مخبز قرفة"}
    assert data["you"] == {"first_name": "Owner", "role": "owner"}
    assert "documents" in data["modules_on"] and "+" not in result["content"][0]["text"][:1]
    assert json.loads(result["content"][0]["text"]) == data


def test_an_unknown_method_is_an_error_and_a_notification_gets_no_answer(world):
    shop, app = world
    token = connect_all(shop, app).access
    bad = app.rpc(token, "resources/list")
    assert bad.status_code == 200 and bad.json()["error"]["code"] == -32601


def test_a_bad_message_is_refused(world):
    shop, app = world
    token = connect_all(shop, app).access
    assert app.rpc(token, "ping", raw=b"{not json").status_code == 400
    assert app.rpc(token, "ping", raw=b"[]").status_code == 400
    batch = json.dumps([{"jsonrpc": "2.0", "id": 1, "method": "ping"}]).encode()
    assert app.rpc(token, "ping", raw=batch).status_code == 400
    assert app.rpc(token, "ping", raw=b'{"jsonrpc":"2.0","id":null,"method":"ping"}'
                   ).status_code == 400
    assert app.rpc(token, "ping", raw=b" " * (70 * 1024)).status_code == 413
    old = app.rpc(token, "ping", headers={"MCP-Protocol-Version": "1999-01-01"})
    assert old.status_code == 400


def test_there_is_no_stream_and_no_session_to_end(world):
    _, app = world
    for method in ("get", "delete"):
        answer = getattr(app.http, method)("/mcp")
        assert answer.status_code == 405 and answer.headers["allow"] == "POST"


def test_a_page_in_another_site_cannot_call_it(world):
    shop, app = world
    token = connect_all(shop, app).access
    assert app.rpc(token, "ping", headers={"Origin": "https://evil.example"}).status_code == 403
    assert app.rpc(token, "ping", headers={"Origin": "https://claude.ai"}).status_code == 200
    assert app.rpc(token, "ping", headers={"Origin": "https://chatgpt.com"}).status_code == 200


# ── The modern era: specification 2026-07-28 ───────────────────────────────────────────────────


def test_a_modern_client_is_served_statelessly(world):
    shop, app = world
    token = connect_all(shop, app).access
    found = app.rpc(token, "server/discover", modern=True)
    result = found.json()["result"]
    assert result["resultType"] == "complete" and MODERN in result["supportedVersions"]
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    assert result["_meta"]["io.modelcontextprotocol/serverInfo"]["name"] == "ALYR"
    assert result["cacheScope"] == "public" and result["ttlMs"] > 0
    listed = app.rpc(token, "tools/list", modern=True).json()["result"]
    assert "hello" in [t["name"] for t in listed["tools"]]
    # What is offered depends on the person: private to this authorization, never fresh.
    assert listed["cacheScope"] == "private" and listed["ttlMs"] == 0
    called = app.call(token, "hello", modern=True).json()["result"]
    assert called["resultType"] == "complete" and called["isError"] is False


def _message(method, version=MODERN, caps=True, **params):
    meta = {"io.modelcontextprotocol/protocolVersion": version}
    if caps:
        meta["io.modelcontextprotocol/clientCapabilities"] = {}
    return json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                       "params": {**params, "_meta": meta}}).encode()


def test_a_modern_request_that_does_not_match_its_headers_is_refused(world):
    shop, app = world
    token = connect_all(shop, app).access
    cases = [
        ({"MCP-Protocol-Version": "2025-06-18"}, "tools/list", {}),
        ({"Mcp-Method": "tools/call"}, "tools/list", {}),
        ({"Mcp-Name": "other"}, "tools/call", {"name": "hello", "arguments": {}}),
    ]
    for headers, method, params in cases:
        answer = app.rpc(token, method, params, modern=True, headers=headers)
        assert answer.status_code == 400, (headers, answer.text)
        assert answer.json()["error"]["code"] == -32020


def test_a_modern_request_names_what_is_wrong_in_the_specifications_words(world):
    shop, app = world
    token = connect_all(shop, app).access
    send = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
            "Mcp-Method": "tools/list"}
    old = app.http.post("/mcp", content=_message("tools/list", "1900-01-01"),
                        headers={**send, "MCP-Protocol-Version": "1900-01-01"})
    assert old.status_code == 400 and old.json()["error"]["code"] == -32022
    assert MODERN in old.json()["error"]["data"]["supported"]
    no_caps = app.http.post("/mcp", content=_message("tools/list", caps=False),
                            headers={**send, "MCP-Protocol-Version": MODERN})
    assert no_caps.status_code == 400 and no_caps.json()["error"]["code"] == -32602
    nothing = app.http.post("/mcp", content=_message("nothing/here"),
                            headers={**send, "MCP-Protocol-Version": MODERN,
                                     "Mcp-Method": "nothing/here"})
    assert nothing.status_code == 404 and nothing.json()["error"]["code"] == -32601


# ── Who may see and call what ──────────────────────────────────────────────────────────────────


def test_a_token_for_one_business_reads_that_business_and_never_another(world):
    shop, app = world
    other = new_shop()
    sql("insert into contacts (tenant_id, phone, name) "
        "values ($1, '+97455500111', 'Aisha Al-Mohannadi')",
        shop.tenant_id)
    sql("insert into contacts (tenant_id, phone, name) values ($1, '+97455500999', 'Bilal Rahman')",
        other.tenant_id)
    mine = connect_all(shop, app)
    theirs = App(app.http, client_id=app.client_id).connect(person(other), scope="read")
    one = structured(app.result(mine.access, "test_customer_name"))["customer"]
    two = structured(app.result(theirs.access, "test_customer_name"))["customer"]
    assert one["first_name"]["text"] == "Aisha" and one["phone_last3"] == "111"
    assert two["first_name"]["text"] == "Bilal" and two["phone_last3"] == "999"
    assert structured(app.result(mine.access, "hello"))["business"]["name"] == "Qirfa Bakery"
    # The second business's token read nothing of the first, even with the shop's ID in hand.
    forged = app.result(theirs.access, "test_customer_name", {})
    assert "Aisha" not in json.dumps(forged)
    # Another business's grants are not even visible to the database role scoped to this one.
    assert sql("select count(*) as n from mcp_grants where tenant_id = $1", other.tenant_id
               )[0]["n"] == 1


def test_the_role_decides_what_is_offered_and_what_is_allowed(world):
    shop, app = world
    owner = connect_all(shop, app)
    agent = second(app, shop, "agent", "read stock")
    admin = second(app, shop, "admin", "read stock")
    assert "test_write_note" in names(app.rpc(owner.access, "tools/list"))
    assert "test_write_note" in names(app.rpc(admin.access, "tools/list"))
    assert "test_write_note" not in names(app.rpc(agent.access, "tools/list"))
    # Not offered, and refused if called anyway, and the refusal is on the record.
    refused = app.result(agent.access, "test_write_note", {"note": "x"})
    assert refused["isError"] is True and "role" in refused["content"][0]["text"]
    last = sql("select detail from activity where tenant_id = $1 and subject = 'mcp' "
               "and action = 'call' order by created_at desc limit 1", shop.tenant_id)[0]["detail"]
    assert last["result"] == "refused" and last["code"] == "role"


def test_a_change_of_role_takes_effect_on_the_next_call(world):
    shop, app = world
    connect_all(shop, app)
    admin = second(app, shop, "admin")
    assert "test_write_note" in names(app.rpc(admin.access, "tools/list"))
    sql("update memberships set role = 'agent' where tenant_id = $1 and user_id = "
        "(select id from users where email = $2)", shop.tenant_id, person(shop, "admin"))
    assert "test_write_note" not in names(app.rpc(admin.access, "tools/list"))
    assert app.result(admin.access, "test_write_note", {"note": "x"})["isError"] is True


def test_a_person_who_is_removed_stops_on_the_next_call(world):
    shop, app = world
    connect_all(shop, app)
    admin = second(app, shop, "admin")
    assert app.rpc(admin.access, "tools/list").status_code == 200
    sql("delete from memberships where tenant_id = $1 and user_id = "
        "(select id from users where email = $2)", shop.tenant_id, person(shop, "admin"))
    assert app.rpc(admin.access, "tools/list").status_code == 401
    assert app.call(admin.access, "hello").status_code == 401
    # Refreshing does not bring them back: the grant ends.
    assert app.refresh(admin.refresh).json()["error"] == "invalid_grant"
    why = sql("select revoked_why from mcp_grants where user_id = (select id from users "
              "where email = $1)", person(shop, "admin"))
    assert why[0]["revoked_why"] == "person_removed"


def test_a_scope_the_owner_did_not_give_is_not_offered_and_asks_for_more(world):
    shop, app = world
    narrow = app.connect(person(shop), scope="read")
    assert "test_write_note" not in names(app.rpc(narrow.access, "tools/list"))
    answer = app.call(narrow.access, "test_write_note", {"note": "x"})
    assert answer.status_code == 403
    header = answer.headers["www-authenticate"]
    assert 'error="insufficient_scope"' in header and 'scope="stock"' in header
    assert "resource_metadata=" in header
    assert sql("select 1 from activity where tenant_id = $1 and action = 'test_note'",
               shop.tenant_id) == []


def test_a_tool_whose_module_is_off_is_hidden_and_refused(world):
    shop, app = world
    token = connect_all(shop, app).access
    from alyr.core import actions
    from alyr.modules.mcp import registry

    async def run(conn, caller, args):
        return {"ok": True}

    actions.REGISTRY["mcp.test_module"] = actions.Action(
        "mcp.test_module", actions.ALL_ROLES, "discovery", run)
    registry.declare(
        name="test_module_tool", action="mcp.test_module", scope="read", title="t",
        description="d", input_schema={"type": "object", "properties": {}},
    )
    try:
        assert "test_module_tool" not in names(app.rpc(token, "tools/list"))
        gone = app.result(token, "test_module_tool")
        assert gone["isError"] is True and "discovery" in gone["content"][0]["text"]
        sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'discovery')",
            shop.tenant_id)
        assert "test_module_tool" in names(app.rpc(token, "tools/list"))
        assert structured(app.result(token, "test_module_tool")) == {"ok": True}
    finally:
        actions.REGISTRY.pop("mcp.test_module", None)
        registry.TOOLS.pop("test_module_tool", None)


def test_the_arguments_are_checked_before_anything_runs(world):
    shop, app = world
    token = connect_all(shop, app).access
    bad = app.result(token, "hello", {"surprise": 1})
    assert bad["isError"] is True and "not a known argument" in bad["content"][0]["text"]
    missing = app.result(token, "test_write_note", {})
    assert missing["isError"] is True and "required" in missing["content"][0]["text"]
    unknown = app.result(token, "no_such_tool")
    assert unknown["isError"] is True
    assert app.rpc(token, "tools/call", {"arguments": {}}).status_code == 400


def test_a_customer_is_shown_by_first_name_and_three_digits_and_nothing_else(world):
    shop, app = world
    sql("insert into contacts (tenant_id, phone, name) "
        "values ($1, '+97455512345', 'Fatima Al-Kuwari')",
        shop.tenant_id)
    token = connect_all(shop, app).access
    result = app.result(token, "test_customer_name")
    text = result["content"][0]["text"]
    assert "Fatima" in text and "Kuwari" not in text and "12345" not in text
    assert "345" in text and "97455512345" not in text
    assert "untrusted" in text  # and the answer says what that means


# ── Every call is on the record ────────────────────────────────────────────────────────────────


def test_every_call_is_one_row_with_the_person_the_app_the_tool_and_no_answer(world):
    shop, app = world
    token = connect_all(shop, app).access
    app.result(token, "hello")
    app.result(token, "hello", {"surprise": 1})
    app.result(token, "no_such_tool")
    rows = sql("select * from activity where tenant_id = $1 and subject = 'mcp' and "
               "action = 'call' order by created_at", shop.tenant_id)
    assert len(rows) == 3 and {r["channel"] for r in rows} == {"mcp"}
    first = rows[0]
    assert first["actor_name"] == "Owner" and first["actor_id"]
    assert first["detail"]["tool"] == "hello" and first["detail"]["client"] == "Claude"
    assert first["detail"]["client_id"] == app.client_id and first["detail"]["result"] == "ok"
    assert first["detail"]["phase"] == "read" and first["detail"]["ms"] >= 0
    assert "Qirfa" not in json.dumps(rows, default=str)  # arguments, never the answer
    assert [r["detail"]["result"] for r in rows] == ["ok", "error", "refused"]
    assert rows[1]["detail"]["args"] == {"surprise": 1}
    # The grant's own ID is the subject, so one app's calls can be listed.
    assert len({r["subject_id"] for r in rows}) == 1


def test_the_record_cannot_be_changed_by_the_application_role(world):
    import asyncio

    import asyncpg

    from conftest import APP_DSN

    shop, app = world
    connect_all(shop, app)

    async def go():
        conn = await asyncpg.connect(APP_DSN)
        try:
            async with conn.transaction():
                await conn.execute("select set_config('app.tenant_id', $1, true)",
                                   str(shop.tenant_id))
                await conn.execute("update activity set action = 'x' where subject = 'mcp'")
        finally:
            await conn.close()

    with pytest.raises(asyncpg.InsufficientPrivilegeError):
        asyncio.run(go())


# ── The switches ───────────────────────────────────────────────────────────────────────────────


def owner_session(client_factory, shop, role="owner"):
    http = client_factory()
    sign_in(http, person(shop, role))
    return http


def test_the_owner_can_pause_resume_and_switch_off_and_it_takes_effect_at_once(
        world, client_factory):
    shop, app = world
    token = connect_all(shop, app).access
    boss = owner_session(client_factory, shop)
    assert app.rpc(token, "ping").status_code == 200
    paused = boss.post("/api/mcp/pause")
    assert paused.status_code == 200 and paused.json()["paused"] is True
    stopped = app.rpc(token, "ping")
    assert stopped.status_code == 403
    boss.post("/api/mcp/resume")
    assert app.rpc(token, "ping").status_code == 200
    assert boss.post("/api/mcp/switch-off").json()["enabled"] is False
    assert app.rpc(token, "ping").status_code == 403
    # An owner turns it on again from the workspace, saying they understand where it goes.
    assert boss.post("/api/mcp/opt-in", json={"understood": False}).status_code == 422
    assert boss.post("/api/mcp/opt-in", json={"understood": True}).json()["enabled"] is True
    assert app.rpc(token, "ping").status_code == 200
    seen = {r["action"] for r in sql("select action from activity where tenant_id = $1 and "
                                     "subject = 'mcp'", shop.tenant_id)}
    assert {"paused", "resumed", "switched_off", "opted_in"} <= seen


def test_an_admin_may_pause_but_only_an_owner_may_switch_on_and_an_agent_nothing(
        world, client_factory):
    shop, app = world
    connect_all(shop, app)
    admin = owner_session(client_factory, shop, "admin")
    agent = owner_session(client_factory, shop, "agent")
    assert admin.post("/api/mcp/pause").status_code == 200
    assert admin.post("/api/mcp/resume").status_code == 200
    assert agent.get("/api/mcp").status_code == 403
    assert agent.post("/api/mcp/pause").status_code == 403
    admin.post("/api/mcp/switch-off")
    refused = admin.post("/api/mcp/opt-in", json={"understood": True})
    assert refused.status_code == 403 and refused.json()["detail"]["code"] == (
        "owner_must_switch_on")


def test_the_global_switch_ends_it_everywhere(client_factory, monkeypatch):
    shop, app = build(client_factory, monkeypatch)
    token = connect_all(shop, app).access
    assert app.rpc(token, "ping").status_code == 200
    from alyr.config import get_settings

    monkeypatch.setenv("ALYR_MCP_ENABLED", "false")
    get_settings.cache_clear()
    assert app.rpc(token, "ping").status_code == 404
    assert app.http.get("/.well-known/oauth-authorization-server").status_code == 404


def test_the_workspace_lists_connections_revokes_one_or_all_and_reads_the_record(
        world, client_factory):
    shop, app = world
    first = connect_all(shop, app)
    admin = second(app, shop, "admin")
    boss = owner_session(client_factory, shop)
    app.result(first.access, "hello")
    overview = boss.get("/api/mcp").json()
    assert overview["settings"]["enabled"] is True and overview["address"].endswith("/mcp")
    assert len([g for g in overview["grants"] if g["live"]]) == 2
    mine = [g for g in overview["grants"] if g["person"] == "Owner"][0]
    assert mine["client"] == "Claude" and mine["last_used_at"] and "read" in mine["scopes"]
    assert boss.delete(f"/api/mcp/grants/{mine['id']}").json() == {"ended": 1}
    assert app.rpc(first.access, "ping").status_code == 401
    assert app.rpc(admin.access, "ping").status_code == 200
    assert boss.delete(f"/api/mcp/grants/{mine['id']}").status_code == 404
    assert boss.delete(f"/api/mcp/grants/{uuid4()}").status_code == 404
    assert boss.post("/api/mcp/grants/revoke-all").json() == {"ended": 1}
    assert app.rpc(admin.access, "ping").status_code == 401
    # "What the apps did" is the record's channel `mcp`; ending a permission from the workspace
    # is the workspace's own act, on the record under its own door.
    calls = boss.get("/api/mcp/activity").json()["calls"]
    actions = [c["action"] for c in calls]
    assert "call" in actions and "grant_created" in actions and "grant_revoked" not in actions
    ended = sql("select channel, actor_name from activity where tenant_id = $1 and "
                "action = 'grant_revoked'", shop.tenant_id)
    assert [(r["channel"], r["actor_name"]) for r in ended] == [("portal", "Owner")] * 2


def test_a_token_cannot_open_the_workspace_and_a_session_cannot_call_the_endpoint(
        world, client_factory):
    shop, app = world
    token = connect_all(shop, app).access
    assert app.http.get("/api/mcp", headers={"Authorization": f"Bearer {token}"}).status_code in (
        401, 403)
    boss = owner_session(client_factory, shop)
    assert boss.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}).status_code == 401


# ── Limits and sizes ───────────────────────────────────────────────────────────────────────────


def test_a_permission_is_limited_per_minute(client_factory, monkeypatch):
    shop, app = build(client_factory, monkeypatch, mcp_calls_per_minute=3)
    token = connect_all(shop, app).access
    codes = [app.call(token, "hello").status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    assert "retry-after" in app.call(token, "hello").headers
    # A call that is refused is on no record: it never reached a business.
    assert len(sql("select 1 from activity where tenant_id = $1 and action = 'call'",
                   shop.tenant_id)) == 3


def test_a_business_is_limited_per_minute_across_its_apps(client_factory, monkeypatch):
    shop, app = build(client_factory, monkeypatch, mcp_calls_per_minute_shop=4)
    one = connect_all(shop, app)
    two = second(app, shop, "admin")
    sql("delete from rate_hits")
    codes = [app.call(one.access, "hello").status_code for _ in range(2)]
    codes += [app.call(two.access, "hello").status_code for _ in range(3)]
    assert codes == [200, 200, 200, 200, 429]


def test_a_wrong_token_is_counted_against_the_address_and_a_good_one_never(world, monkeypatch):
    shop, app = world
    token = connect_all(shop, app).access
    from alyr.core import ratelimit
    from alyr.modules.mcp import access

    monkeypatch.setattr(access, "BAD_TOKENS_PER_ADDRESS", ratelimit.Limit(2, 600))
    assert [app.rpc("alyr_mcp_at_" + "a" * 43, "ping").status_code for _ in range(4)] == [
        401, 401, 429, 429]
    assert "www-authenticate" not in app.rpc("alyr_mcp_at_" + "a" * 43, "ping").headers
    assert app.rpc(token, "ping").status_code == 200


def test_an_answer_that_is_too_large_is_replaced_not_cut(world, monkeypatch):
    shop, app = world
    token = connect_all(shop, app).access
    from alyr.modules.mcp import server

    monkeypatch.setattr(server, "MAX_ANSWER_CHARS", 20)
    result = app.result(token, "hello")
    assert result["isError"] is True and "too large" in result["content"][0]["text"]
    assert "structuredContent" not in result
    monkeypatch.setattr(server, "MAX_ARGUMENT_BYTES", 50)
    big = app.result(token, "test_write_note", {"note": "x" * 100})
    assert big["isError"] is True and "too large" in big["content"][0]["text"]
