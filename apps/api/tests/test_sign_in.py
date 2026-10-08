"""Sign-in by one-time code, sessions, and the shop's team (ALY-18, D-022)."""

from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL
from test_consent import ahmed, owner_sql, say


def code_for(client, email):
    response = client.post("/api/auth/code", json={"email": email})
    assert response.status_code == 200
    return response.json()["dev_code"]


def sign_in(client, email=OWNER_EMAIL):
    response = client.post(
        "/api/auth/verify", json={"email": email, "code": code_for(client, email)}
    )
    assert response.status_code == 200
    return response.json()


def other_shop_with_owner(email="omar@other.example"):
    tenant = owner_sql("insert into tenants (name) values ('Other shop') returning id")[0]["id"]
    user = owner_sql(
        "insert into users (email, name) values ($1, 'Omar') "
        "on conflict (email) do update set name = 'Omar' returning id",
        email,
    )[0]["id"]
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
        tenant, user,
    )
    return tenant


def test_the_open_demo_needs_no_sign_in_on_a_local_machine(client):
    me = client.get("/api/auth/me").json()
    assert (me["signed_in"], me["name"], me["role"]) == (False, "Workspace", "owner")
    assert client.get("/api/ledger/summary").status_code == 200


def test_with_the_open_demo_off_the_workspace_requires_sign_in(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    for path in ("/api/ledger/summary", "/api/orders", "/api/inbox/conversations",
                 "/api/team", "/api/jobs/failed", "/api/auth/me"):
        assert client.get(path).status_code == 401, path
    me = sign_in(client)
    assert (me["signed_in"], me["name"], me["role"]) == (True, "Fatima Al-Noor", "owner")
    assert client.get("/api/ledger/summary").status_code == 200
    # The customer-facing pages stay public.
    assert client.get("/api/store/al-noor").status_code == 200


def test_sign_out_ends_the_session(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    sign_in(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/ledger/summary").status_code == 401


def test_a_wrong_code_is_refused_and_five_guesses_burn_the_code(client):
    code = code_for(client, OWNER_EMAIL)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        refused = client.post("/api/auth/verify", json={"email": OWNER_EMAIL, "code": wrong})
        assert refused.status_code == 401
    burnt = client.post("/api/auth/verify", json={"email": OWNER_EMAIL, "code": code})
    assert burnt.status_code == 401


def test_a_code_works_once_and_expires(client):
    code = code_for(client, OWNER_EMAIL)
    body = {"email": OWNER_EMAIL, "code": code}
    assert client.post("/api/auth/verify", json=body).status_code == 200
    assert client.post("/api/auth/verify", json=body).status_code == 401

    code = code_for(client, OWNER_EMAIL)
    owner_sql("update login_codes set expires_at = now() - interval '1 minute'")
    assert client.post(
        "/api/auth/verify", json={"email": OWNER_EMAIL, "code": code}
    ).status_code == 401


def test_an_unknown_email_gets_the_same_answer_and_no_code(client):
    response = client.post("/api/auth/code", json={"email": "nobody@nowhere.example"})
    assert response.status_code == 200
    assert response.json() == {"sent": True, "dev_code": None}
    assert owner_sql(
        "select count(*) as n from login_codes where email = 'nobody@nowhere.example'"
    )[0]["n"] == 0


def test_codes_are_limited_per_hour(client):
    owner_sql("delete from login_codes where email = $1", AGENT_EMAIL)
    for _ in range(5):
        code_for(client, AGENT_EMAIL)
    assert client.post("/api/auth/code", json={"email": AGENT_EMAIL}).status_code == 429
    owner_sql("delete from login_codes where email = $1", AGENT_EMAIL)


def test_only_hashes_of_codes_and_sessions_are_stored(client):
    owner_sql("delete from login_codes where email = $1", OWNER_EMAIL)
    code = code_for(client, OWNER_EMAIL)
    client.post("/api/auth/verify", json={"email": OWNER_EMAIL, "code": code})
    token = client.cookies.get("alyr_session")
    assert token
    stored_codes = owner_sql("select code_hash from login_codes where email = $1", OWNER_EMAIL)
    assert all(code not in row["code_hash"] for row in stored_codes)
    assert owner_sql("select count(*) as n from sessions where token_hash = $1", token)[0]["n"] == 0


def test_a_session_sees_only_its_own_shop(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    other_shop_with_owner()
    sign_in(client, "omar@other.example")
    summary = client.get("/api/ledger/summary").json()
    assert summary["shop"]["name"] == "Other shop"
    assert summary["customers"] == []
    assert [m["email"] for m in client.get("/api/team").json()["members"]] == [
        "omar@other.example"
    ]


def test_inbox_replies_carry_the_name_of_the_person_who_wrote_them(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client, AGENT_EMAIL)
    client.post(f"/api/inbox/conversations/{contact_id}/reply", json={"text": "On it."})
    thread = client.get(f"/api/inbox/conversations/{contact_id}").json()
    assert thread["messages"][-1]["sent_by"] == "Yusuf Rahman"


def test_an_owner_can_add_change_and_remove_team_members(client):
    sign_in(client)
    added = client.post(
        "/api/team", json={"email": " Sara@AlNoor.example ", "name": "Sara", "role": "agent"}
    )
    assert added.status_code == 200
    sara = added.json()["id"]
    team = client.get("/api/team").json()
    assert team["can_manage"] is True
    assert ("sara@alnoor.example", "agent") in [(m["email"], m["role"]) for m in team["members"]]

    again = client.post("/api/team", json={"email": "sara@alnoor.example", "name": "Sara"})
    assert again.status_code == 422
    assert client.post(f"/api/team/{sara}/role", json={"role": "admin"}).status_code == 200
    assert client.post(f"/api/team/{sara}/role", json={"role": "boss"}).status_code == 422
    assert client.delete(f"/api/team/{sara}").status_code == 200
    assert client.delete(f"/api/team/{sara}").status_code == 404


def test_an_agent_cannot_manage_the_team(client):
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/team").json()["can_manage"] is False
    refused = client.post("/api/team", json={"email": "x@alnoor.example", "name": "X"})
    assert refused.status_code == 403
    owner = next(m for m in client.get("/api/team").json()["members"] if m["role"] == "owner")
    assert client.delete(f"/api/team/{owner['id']}").status_code == 403


def test_an_admin_cannot_create_or_remove_an_owner(client):
    sign_in(client)
    me = client.get("/api/auth/me").json()
    admin = client.post(
        "/api/team", json={"email": "admin@alnoor.example", "name": "Adel", "role": "admin"}
    ).json()["id"]
    sign_in(client, "admin@alnoor.example")
    assert client.post(f"/api/team/{admin}/role", json={"role": "owner"}).status_code == 403
    assert client.delete(f"/api/team/{me['id']}").status_code == 403


def test_a_shop_always_keeps_one_owner(client):
    me = sign_in(client)
    assert client.delete(f"/api/team/{me['id']}").status_code == 422
    assert client.post(f"/api/team/{me['id']}/role", json={"role": "agent"}).status_code == 422


def test_a_removed_member_is_signed_out_at_once(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    agent_browser = client_factory()
    sign_in(agent_browser, AGENT_EMAIL)
    assert agent_browser.get("/api/orders").status_code == 200
    agent = owner_sql("select id from users where email = $1", AGENT_EMAIL)[0]["id"]
    owner_sql(
        "delete from memberships where user_id = $1 and tenant_id = $2", agent, DEMO_TENANT_ID
    )
    assert agent_browser.get("/api/orders").status_code == 401


def test_one_shop_cannot_list_or_remove_another_shops_team(client):
    other_shop_with_owner("layla@other.example")
    omar = owner_sql("select id from users where email = 'layla@other.example'")[0]["id"]
    sign_in(client)
    assert "layla@other.example" not in [
        m["email"] for m in client.get("/api/team").json()["members"]
    ]
    assert client.delete(f"/api/team/{omar}").status_code == 404
