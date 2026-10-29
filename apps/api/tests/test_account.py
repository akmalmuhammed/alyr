"""Your account: the businesses a person works for and the switch between them, and the change
of their sign-in email (go-live item 40, specs/040, D-081)."""

import json
from uuid import uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import account, auth, mail
from alyr.seed import AGENT_EMAIL, ALYR_STAFF_EMAIL, DEMO_TENANT_ID
from test_consent import owner_sql
from test_sign_in import code_for, other_shop_with_owner, sign_in


@pytest.fixture
def letters(monkeypatch):
    """Mail on, and every email sent, sign-in codes too."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    sent: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return sent


@pytest.fixture
def closed(client_factory, monkeypatch):
    """The app with the open demo off, as anywhere but a developer's machine: a cookie that
    opens nothing gets 401, not the demo shop."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    return client_factory()


def person(role="admin", tenant=DEMO_TENANT_ID, email=None, name="Noura Saleh"):
    """Someone new on a business's team, with an address that could be real."""
    email = email or f"noura-{uuid4().hex[:8]}@shop-test.com"
    user = owner_sql(
        "insert into users (email, name) values ($1, $2) returning id", email, name
    )[0]["id"]
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)",
        tenant, user, role,
    )
    return email, user


def cookie(client) -> str:
    return client.cookies.get(auth.COOKIE)


def as_cookie(client, token):
    """The answer the workspace gives a browser holding `token` (another device)."""
    return client.get("/api/workspace", headers={"cookie": f"{auth.COOKIE}={token}"})


def activity(tenant, action):
    return owner_sql(
        "select subject, subject_id, actor_name from activity where tenant_id = $1 and action = $2",
        tenant, action,
    )


# ── businesses ──


def test_a_person_sees_every_business_they_work_for_and_switches_between_them(closed):
    client = closed
    email, user = person("admin")
    other = other_shop_with_owner(f"omar-{uuid4().hex[:6]}@other.example")
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) values ($1, $2, 'agent')", other, user
    )
    sign_in(client, email)
    mine = client.get("/api/account").json()
    assert mine["signed_in"] and mine["me"]["email"] == email and mine["me"]["role"] == "admin"
    assert {(b["name"], b["role"], b["current"]) for b in mine["businesses"]} == {
        ("Al Noor Electricals", "admin", True), ("Other shop", "agent", False),
    }
    assert mine["can_export"] is False and mine["can_change_email"] is True
    before = cookie(client)

    switched = client.post("/api/account/switch", json={"business_id": str(other)})
    assert switched.status_code == 200
    after = cookie(client)
    assert after and after != before
    assert client.get("/api/workspace").json()["business"]["name"] == "Other shop"
    assert client.get("/api/auth/me").json()["role"] == "agent"
    assert [b["current"] for b in client.get("/api/account").json()["businesses"]
            if b["name"] == "Other shop"] == [True]
    # The old cookie opens nothing now: one browser, one business.
    assert as_cookie(client, before).status_code == 401

    # Signing in again opens the business used last.
    client.post("/api/auth/logout")
    sign_in(client, email)
    assert client.get("/api/workspace").json()["business"]["name"] == "Other shop"
    # And back again.
    client.post("/api/account/switch", json={"business_id": str(DEMO_TENANT_ID)})
    assert client.get("/api/workspace").json()["business"]["name"] == "Al Noor Electricals"


def test_nobody_switches_into_a_business_they_do_not_work_for(client):
    other = other_shop_with_owner(f"omar-{uuid4().hex[:6]}@other.example")
    sign_in(client, AGENT_EMAIL)
    before = cookie(client)
    for target in (str(other), str(uuid4())):
        refused = client.post("/api/account/switch", json={"business_id": target})
        assert refused.status_code == 404
        assert cookie(client) == before
    assert client.get("/api/workspace").json()["business"]["name"] == "Al Noor Electricals"
    assert [b["name"] for b in client.get("/api/account").json()["businesses"]] == [
        "Al Noor Electricals"
    ]
    # Switching to the business already open changes nothing.
    same = client.post("/api/account/switch", json={"business_id": str(DEMO_TENANT_ID)})
    assert same.status_code == 200 and cookie(client) == before


def test_the_open_demo_has_no_account_to_change(client):
    mine = client.get("/api/account").json()
    assert mine["signed_in"] is False and mine["businesses"] == []
    assert mine["can_change_email"] is False
    asked = client.post("/api/account/email/code", json={"email": "new@shop-test.com"})
    assert asked.status_code == 422 and asked.json()["detail"]["code"] == "demo"
    switched = client.post("/api/account/switch", json={"business_id": str(DEMO_TENANT_ID)})
    assert switched.status_code == 404


# ── the sign-in email ──


def test_a_person_changes_their_sign_in_email_with_a_code_sent_to_the_new_address(
    closed, letters
):
    client = closed
    old, user = person("admin")
    other = other_shop_with_owner(f"omar-{uuid4().hex[:6]}@other.example")
    owner_sql("insert into memberships (tenant_id, user_id, role) values ($1, $2, 'agent')",
              other, user)
    sign_in(client, old)
    elsewhere = cookie(client)  # another device
    sign_in(client, old)
    here = cookie(client)
    new = f"noura.saleh-{uuid4().hex[:6]}@gmail.com"

    asked = client.post("/api/account/email/code", json={"email": f"  {new.upper()} "})
    assert asked.status_code == 200, asked.text
    assert asked.json()["email"] == new
    code = asked.json()["dev_code"]
    [to_new] = [m for m in letters if m["to"] == [new]]
    assert code in to_new["subject"] and "change your ALYR sign-in email" in to_new["subject"]
    assert code in to_new["text"] and "رمزك" in to_new["text"]

    changed = client.post("/api/account/email", json={"email": new, "code": code})
    assert changed.status_code == 200, changed.text
    assert changed.json() == {"email": new}
    assert client.get("/api/auth/me").json()["email"] == new

    # The old address is told, with the new one only in part.
    [to_old] = [m for m in letters if m["to"] == [old] and "sign-in code" not in m["subject"]]
    assert to_old["subject"] == "Your ALYR sign-in email was changed"
    shown = new[:2] + "••••@gmail.com"
    assert shown in to_old["text"] and new not in to_old["text"]
    assert "reply to this email now" in to_old["text"] and "أصبح بريد الدخول" in to_old["text"]
    assert "Hello Noura," in to_old["text"]

    # Every other device is signed out; this one is not.
    assert as_cookie(client, elsewhere).status_code == 401
    assert as_cookie(client, here).status_code == 200
    # The old address no longer signs in; the new one does.
    assert code_for(client, old) is None
    sign_in(client, new)
    # Both businesses have it on the record, against the person.
    for tenant in (DEMO_TENANT_ID, other):
        assert [(r["subject"], r["subject_id"], r["actor_name"]) for r in
                activity(tenant, "email_changed")] == [("team", user, "Noura Saleh")]


def test_a_change_code_cannot_sign_in_and_a_wrong_code_changes_nothing(client):
    old, _ = person("agent")
    sign_in(client, old)
    new = f"n-{uuid4().hex[:6]}@shop-test.com"
    code = client.post("/api/account/email/code", json={"email": new}).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    refused = client.post("/api/account/email", json={"email": new, "code": wrong})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "code"
    # A code for one address does not change it to another.
    other = f"m-{uuid4().hex[:6]}@shop-test.com"
    refused = client.post("/api/account/email", json={"email": other, "code": code})
    assert refused.status_code == 422
    assert client.get("/api/auth/me").json()["email"] == old
    # The change code is no sign-in code for the new address, nor for anyone.
    for email in (new, old):
        verify = client.post("/api/auth/verify", json={"email": email, "code": code})
        assert verify.status_code == 401
    # Five wrong guesses burn it.
    for _ in range(5):
        client.post("/api/account/email", json={"email": new, "code": wrong})
    late = client.post("/api/account/email", json={"email": new, "code": code})
    assert late.status_code == 422
    assert client.get("/api/auth/me").json()["email"] == old


def test_a_change_code_does_not_crowd_out_the_addresses_own_sign_in(client):
    """Someone asking for a change to an address that already signs someone in must not stop
    that person's own codes from working."""
    victim, _ = person("agent")
    sign_in(client, AGENT_EMAIL)
    sign_in_code = code_for(client, victim)
    asked = client.post("/api/account/email/code", json={"email": victim})
    assert asked.status_code == 200  # the same answer as for a free address
    verify = client.post("/api/auth/verify", json={"email": victim, "code": sign_in_code})
    assert verify.status_code == 200


def test_an_address_that_already_signs_someone_in_is_refused_after_the_code(client):
    taken, _ = person("agent")
    old, _ = person("admin")
    sign_in(client, old)
    code = client.post("/api/account/email/code", json={"email": taken}).json()["dev_code"]
    refused = client.post("/api/account/email", json={"email": taken, "code": code})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "taken"
    assert client.get("/api/auth/me").json()["email"] == old


@pytest.mark.parametrize(
    ("email", "code"),
    [("not an address", "invalid"), ("someone@", "invalid"), ("a@b", "invalid")],
)
def test_what_is_not_an_address_is_refused(client, email, code):
    old, _ = person("admin")
    sign_in(client, old)
    refused = client.post("/api/account/email/code", json={"email": email})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == code


def test_the_same_address_and_alyr_staff_are_refused(client):
    old, _ = person("admin")
    sign_in(client, old)
    same = client.post("/api/account/email/code", json={"email": old.upper()})
    assert same.status_code == 422 and same.json()["detail"]["code"] == "same"
    sign_in(client, ALYR_STAFF_EMAIL)
    staff = client.post("/api/account/email/code", json={"email": "ops.new@shop-test.com"})
    assert staff.status_code == 422 and staff.json()["detail"]["code"] == "staff"


def test_an_example_address_is_refused_outside_a_developers_machine(monkeypatch):
    monkeypatch.setenv("ALYR_ENV", "production")
    get_settings.cache_clear()
    try:
        assert not account._usable("x@shop.example") and not account._usable("x@shop.test")
        assert account._usable("noura@gmail.com")
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_changes_are_limited_per_person(client):
    old, _ = person("admin")
    sign_in(client, old)
    for n in range(5):
        asked = client.post("/api/account/email/code", json={"email": f"n{n}@shop-test.com"})
        assert asked.status_code == 200
    late = client.post("/api/account/email/code", json={"email": "n9@shop-test.com"})
    assert late.status_code == 429 and late.json()["detail"]["code"] == "too_many"
    assert int(late.headers["retry-after"]) > 0
