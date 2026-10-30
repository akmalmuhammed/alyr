"""The welcome after sign-up and the invite to a team (go-live checklist item 23, specs/037).
Real PostgreSQL, HTTP in, and Resend stood in by a transport that keeps what it was given."""

import json
import re
from uuid import uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import mail, welcome
from alyr.seed import ALYR_STAFF_EMAIL
from test_consent import owner_sql
from test_onboarding import BASE, accepted_terms, signup_token
from test_sign_in import sign_in

DOMAIN = "welcome-test.com"


@pytest.fixture(autouse=True)
def addresses_restored():
    """People here get an address that could be real, so they are written to. Put them back
    after, so no other test (the setup reminders) ever writes to them."""
    yield
    owner_sql(
        "update users set email = id::text || '@shop.example' where email like $1",
        f"%@{DOMAIN}",
    )


@pytest.fixture
def sent(monkeypatch):
    """Mail on, and a list of what Resend was given (the sign-in codes left out)."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    letters: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            letters.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return letters


def address(who="person"):
    return f"{who}-{uuid4().hex[:8]}@{DOMAIN}"


def sign_up(client, lang="en", email=None):
    """A new owner makes a business at /start; the client is left signed in as them."""
    email = email or address("owner")
    # A letter ends the hex, so the name never holds six digits in a row, which the welcome
    # email is checked not to carry (a sign-in code is six digits).
    name = f"Barbers {uuid4().hex[:6]}b"
    body = {"signup_token": signup_token(client, email), "owner_name": "Hamad Al-Kuwari",
            "name": name, "name_ar": "حلاق السد", "type": "salon", "area": "Al Sadd",
            "accepted_terms": accepted_terms(client), "lang": lang}
    answer = client.post(f"{BASE}/business", json=body)
    assert answer.status_code == 200, answer.text
    return answer.json()["created"], email, name


def to(letters, email):
    return [m for m in letters if m["to"] == [email]]


def account_jobs(tenant):
    return owner_sql(
        "select payload, status, attempts from jobs where tenant_id = $1 and kind = $2",
        tenant, welcome.JOB,
    )


def web():
    return get_settings().public_web_url.rstrip("/")


def test_a_new_owner_is_welcomed_with_how_to_sign_in_again(client, sent):
    tenant, email, name = sign_up(client)
    [letter] = to(sent, email)
    assert letter["subject"] == "Welcome to ALYR, Hamad"
    for words in (f"workspace for {name}", f"{web()}/login", email, f"{web()}/start",
                  "6-digit code", "no password"):
        assert words in letter["text"] and words in letter["html"], words
    # Nothing in it signs anyone in: no code, no token.
    assert not re.search(r"\b\d{6}\b", letter["text"]) and "?t=" not in letter["text"]
    assert letter["reply_to"] == get_settings().email_reply_to
    # The job carried IDs only; the address and names were read when it ran.
    [job] = account_jobs(tenant)
    payload = json.loads(job["payload"])
    assert set(payload) == {"letter", "user_id", "by"} and job["status"] == "done"
    assert payload["letter"] == "welcome" and payload["by"] is None


def test_an_owner_who_signed_up_in_arabic_is_welcomed_in_arabic(client, sent):
    _, email, _ = sign_up(client, lang="ar")
    [letter] = to(sent, email)
    assert letter["subject"] == "مرحباً بك في ALYR يا Hamad"
    assert "مساحة العمل لـ حلاق السد" in letter["text"]
    assert 'dir="rtl"' in letter["html"] and "أكمل إعدادك" in letter["html"]
    assert "Welcome" not in letter["text"]


def test_someone_added_to_the_team_is_told_who_added_them_and_how_to_sign_in(client, sent):
    tenant, _, name = sign_up(client)
    sara = address("sara")
    added = client.post("/api/team", json={"email": sara, "name": "Sara Haddad", "role": "agent"})
    assert added.status_code == 200, added.text
    [letter] = to(sent, sara)
    assert letter["subject"] == f"Hamad Al-Kuwari added you to {name} on ALYR"
    text = letter["text"]
    assert f"Hamad Al-Kuwari added you to the team of {name} on ALYR, as a team member." in text
    assert "أضافك Hamad Al-Kuwari إلى فريق حلاق السد على ALYR، بدور موظف." in text
    assert f"{web()}/login" in text and sara in text
    # The shop signed up in English, so English comes first; the Arabic follows.
    assert text.index("Hello Sara") < text.index("مرحباً Sara")
    assert "another business" not in text
    owner = owner_sql(
        "select user_id from memberships where tenant_id = $1 and role = 'owner'", tenant
    )[0]["user_id"]
    invites = [json.loads(j["payload"]) for j in account_jobs(tenant)]
    assert {"letter": "invite", "user_id": added.json()["id"], "by": str(owner)} in invites


def test_the_back_office_tells_the_owner_of_a_business_it_makes(client_factory, sent, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    office = client_factory()
    sign_in(office, ALYR_STAFF_EMAIL)
    owner = address("reem")
    slug = f"zaitoon-{uuid4().hex[:6]}"
    created = office.post("/api/admin/businesses", json={
        "name": "Zaitoon Grill", "name_ar": "مشاوي زيتون", "slug": slug,
        "owner_email": owner, "owner_name": "Reem", "products": ["chat"],
    })
    assert created.status_code == 200, created.text
    [letter] = to(sent, owner)
    assert letter["subject"] == "Your ALYR workspace for Zaitoon Grill is ready"
    text = letter["text"]
    assert "ALYR has set up the workspace for Zaitoon Grill, with you as its owner." in text
    assert "جهّزت ALYR مساحة العمل لـ مشاوي زيتون، وأنت مالكها." in text


def test_an_invite_says_so_when_signing_in_opens_another_business(client_factory, sent):
    first, second = client_factory(), client_factory()
    _, _, first_name = sign_up(first)
    _, _, second_name = sign_up(second)
    both = address("nora")
    for owner in (first, second):
        assert owner.post("/api/team", json={"email": both, "name": "Nora"}).status_code == 200
    by_shop = {m["subject"].split(" added you to ")[1].removesuffix(" on ALYR"): m["text"]
               for m in to(sent, both)}
    assert "another business" not in by_shop[first_name]
    assert "Signing in opens the one you joined first" in by_shop[second_name]
    assert "تسجيل الدخول يفتح النشاط الذي انضممت إليه أولاً" in by_shop[second_name]


def test_nothing_is_queued_for_an_example_address_or_while_email_is_off(client_factory, sent,
                                                                        monkeypatch):
    client = client_factory()
    tenant, _, _ = sign_up(client)
    client.post("/api/team", json={"email": f"x-{uuid4().hex[:6]}@alnoor.example", "name": "X"})
    assert [json.loads(j["payload"])["letter"] for j in account_jobs(tenant)] == ["welcome"]

    monkeypatch.delenv("ALYR_EMAIL_API_KEY")
    get_settings.cache_clear()
    off = client_factory()
    quiet, email, _ = sign_up(off)
    off.post("/api/team", json={"email": address("y"), "name": "Y"})
    assert account_jobs(quiet) == [] and to(sent, email) == []


def test_someone_removed_before_it_went_is_not_written_to(client_factory, sent, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_INLINE", "false")
    client = client_factory()
    tenant, _, _ = sign_up(client)
    gone = address("gone")
    member = client.post("/api/team", json={"email": gone, "name": "Gone"}).json()["id"]
    assert client.delete(f"/api/team/{member}").status_code == 200
    client.portal.call(client.app.state.jobs.drain)
    assert to(sent, gone) == []
    assert {j["status"] for j in account_jobs(tenant)} == {"done"}


def test_a_refusal_by_resend_is_tried_again(client_factory, sent, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    calls = {"n": 0}

    def flaky(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" not in body["subject"]:
            calls["n"] += 1
            if calls["n"] == 1:
                return httpx.Response(500, json={"message": "try later"})
            sent.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(flaky))
    client = client_factory()
    tenant, email, _ = sign_up(client)
    assert len(to(sent, email)) == 1
    [job] = account_jobs(tenant)
    assert (job["status"], job["attempts"]) == ("done", 2)
