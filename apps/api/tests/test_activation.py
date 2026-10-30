"""The activation job (ALY-213, spec 041, D-100 and D-101): a payment turns a signed-up business
into a working workspace and emails the owner a sign-in link that works once. Real PostgreSQL,
HTTP in, and Resend stood in by a transport that keeps what it was given."""

import asyncio
import json
import re
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import activation, auth, mail
from alyr.db import Database
from conftest import APP_DSN
from test_access import pay
from test_card_billing import fake, hook, owner, start_card  # noqa: F401 - fixtures
from test_consent import owner_sql
from test_onboarding import BASE, accepted_terms, signup_token
from test_pricing import ADMIN, client_of
from test_readiness import accept_price

DOMAIN = "activation-test.com"
LINK = re.compile(r"http://web\.test/login/link#t=([\w-]+)")
ARABIC = re.compile("[؀-ۿ]")


@pytest.fixture(autouse=True)
def addresses_restored():
    """The owners here get an address that could be real, so they are written to. Put them back
    after, so no other test (the setup reminders) writes to them."""
    yield
    owner_sql(
        "update users set email = id::text || '@shop.example' where email like $1",
        f"%@{DOMAIN}",
    )


@pytest.fixture
def office(client_factory):
    return client_factory()


def mail_on(monkeypatch, handler=None):
    """Mail on, and every letter Resend was given kept (the sign-in codes left out)."""
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    letters: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "sign-in code" in body["subject"]:
            return httpx.Response(200, json={"id": "code"})
        answer = handler(request) if handler else None
        if answer is not None:
            return answer
        letters.append(body)
        return httpx.Response(200, json={"id": "test-id"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    return letters


@pytest.fixture
def sent(monkeypatch):
    return mail_on(monkeypatch)


def sign_up(client, lang="en", kind="salon", email=None):
    """A new owner makes a business at /start; the client is left signed in as them."""
    email = email or f"owner-{uuid4().hex[:8]}@{DOMAIN}"
    name = f"Barbers {uuid4().hex[:6]}b"
    answer = client.post(f"{BASE}/business", json={
        "signup_token": signup_token(client, email), "owner_name": "Hamad Al-Kuwari",
        "name": name, "name_ar": "حلاق السد", "type": kind, "area": "Al Sadd",
        "accepted_terms": accepted_terms(client), "lang": lang})
    assert answer.status_code == 200, answer.text
    return answer.json()["created"], email, name


def priced(client, office, **kind):
    """A business with an accepted price and nothing paid: (tenant, email, name, client id, what
    is due)."""
    tenant, email, name = sign_up(client, **kind)
    accept_price(client, office, name)
    client_id = client_of(office, name)["id"]
    return tenant, email, name, client_id, client.get(f"{BASE}/payment").json()["due"]


def activated(client, office, **kind):
    tenant, email, name, client_id, due = priced(client, office, **kind)
    assert pay(office, client_id, due).status_code == 200
    return tenant, email, name, client_id


def mine(office, client_id):
    answer = office.get(f"{ADMIN}/activations")
    assert answer.status_code == 200, answer.text
    return [a for a in answer.json()["activations"] if a["client_id"] == client_id]


def ready(letters, email):
    """The "workspace is ready" letters to an address (the welcome is another letter)."""
    return [m for m in letters if m["to"] == [email] and (
        "workspace is ready" in m["subject"] or "جاهزة" in m["subject"])]


def token_of(letter):
    found = LINK.search(letter["text"])
    assert found, letter["text"]
    return found.group(1)


def run(coro):
    async def go():
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await coro(db)
        finally:
            await db.close()

    return asyncio.run(go())


# ── what the job does ─────────────────────────────────────


def test_a_payment_turns_the_business_into_a_working_workspace(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)

    # Part of the money opens nothing: the plan is not covered yet.
    assert pay(office, client_id, 1000).status_code == 200
    assert mine(office, client_id) == [] and ready(sent, email) == []

    assert pay(office, client_id, due - 1000, method="cash", reference="").status_code == 200
    [done] = mine(office, client_id)
    assert (done["status"], done["trigger"], done["error"]) == ("done", "payment", "")
    assert [(s["key"], s["state"]) for s in done["steps"]] == [
        (k, "ok") for k in ("plan", "modules", "setup", "steps", "email")
    ]
    assert done["business"] == name and done["sent_to"] == email and done["emailed_at"]
    assert owner_sql("select billing_state from clients where id = $1", UUID(client_id))[0][0] \
        == "active"
    # The onboarding steps exist, each with its owner.
    steps = {r["step_key"]: r["owner"] for r in owner_sql(
        "select step_key, owner from onboarding_steps where tenant_id = $1", UUID(tenant))}
    assert steps["test"] == steps["payments"] == steps["whatsapp"] == "client"
    assert "paid" in steps

    [letter] = ready(sent, email)
    assert letter["subject"] == "Your ALYR workspace is ready, Hamad"
    text = letter["text"]
    assert f"Your plan for {name} is active, and your workspace is ready." in text
    # What is left, in order: the first three, in the owner's words.
    order = [text.index(s) for s in (
        "1. Place a test order or booking on your private test line.",
        "2. Choose cash and bank transfer for now",
        "3. Choose how your customers reach you on WhatsApp.")]
    assert order == sorted(order)
    for words in ("Reply to this email and a person at ALYR will read it", "24 hours",
                  "http://web.test/login", email, "no password", "do not pass this email on"):
        assert words in text, words
    assert "ALYR does this for you" not in text and not ARABIC.search(text)
    assert 'href="http://web.test/login/link#t=' in letter["html"] and "&amp;l=en" in letter["html"]
    assert "&l=en" in text
    assert letter["reply_to"] == get_settings().email_reply_to
    # The link is in the email and nowhere else: not in the job, not in the activation.
    token = token_of(letter)
    assert token not in json.dumps(done)
    assert all(token not in r["payload"] for r in owner_sql(
        "select payload::text from jobs where tenant_id = $1", UUID(tenant)))
    [link] = owner_sql("select token_hash, used_at from signin_links where user_id = "
                       "(select id from users where email = $1)", email)
    assert link["token_hash"] != token and link["used_at"] is None
    assert done["link"] == "waiting"


def test_the_email_is_in_arabic_for_an_owner_who_signed_up_in_arabic(client, office, sent):
    _, email, name, _ = activated(client, office, lang="ar")
    [letter] = ready(sent, email)
    assert letter["subject"] == "مساحة عملك على ALYR جاهزة يا Hamad"
    text = letter["text"]
    assert "خطتك لـ حلاق السد مفعّلة، ومساحة عملك جاهزة." in text
    for words in ("1. ", "24 ساعة", "افتح مساحة عملك", "ولا توجد كلمة مرور", "ردّ على هذه الرسالة"):
        assert words in text, words
    assert 'dir="rtl"' in letter["html"] and "Your plan" not in text and "Hello" not in text
    assert "&l=ar" in text  # the page the link opens is Arabic too


def test_a_second_payment_or_the_same_one_twice_makes_one_activation(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    assert pay(office, client_id, due).status_code == 200
    assert pay(office, client_id, due, reference="TRF 2").status_code == 200
    assert office.post(f"{ADMIN}/clients/{client_id}/waive", json={"reason": "pilot"}).status_code \
        == 200
    [one] = mine(office, client_id)
    assert one["status"] == "done" and len(ready(sent, email)) == 1
    assert owner_sql("select count(*) from jobs where tenant_id = $1 and kind = 'activation'",
                     UUID(tenant))[0][0] == 1


def test_two_payments_recorded_at_the_same_moment_make_one_activation(
    client, client_factory, office, sent
):
    tenant, email, name, client_id, due = priced(client, office)
    offices = [client_factory(), client_factory()]
    with ThreadPoolExecutor(2) as pool:
        answers = list(pool.map(lambda o: pay(o, client_id, due), offices))
    assert [a.status_code for a in answers] == [200, 200]
    assert len(mine(office, client_id)) == 1 and len(ready(sent, email)) == 1


def test_a_card_payment_activates_the_client_once_and_a_renewal_does_not(
    owner, office, fake, sent,  # noqa: F811 - the fixtures of test_card_billing
):
    tenant, email, name = sign_up(owner)
    accept_price(owner, office, name)
    client_id = client_of(office, name)["id"]
    checkout = start_card(owner)["checkout"]
    sub = fake.pay(checkout["transaction"])
    assert hook(owner, "transaction.completed", fake.transactions[checkout["transaction"]]
                ).status_code == 200
    [one] = mine(office, client_id)
    assert (one["status"], one["trigger"], one["recorded_by"]) == ("done", "card", "Paddle")
    assert len(ready(sent, email)) == 1

    plan = int(fake.created[0]["items"][1]["price"]["unit_price"]["amount"])
    renewal = fake.renew(sub, plan)
    assert hook(owner, "transaction.completed", fake.transactions[renewal]).status_code == 200
    assert len(mine(office, client_id)) == 1 and len(ready(sent, email)) == 1


def test_a_waived_payment_activates_too(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    assert office.post(f"{ADMIN}/clients/{client_id}/waive", json={"reason": "pilot"}).status_code \
        == 200
    [one] = mine(office, client_id)
    assert (one["status"], one["trigger"]) == ("done", "waived")
    assert len(ready(sent, email)) == 1


def test_a_client_already_live_is_not_activated(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    owner_sql("update tenants set live_at = now() where id = $1", UUID(tenant))
    assert pay(office, client_id, due).status_code == 200
    assert mine(office, client_id) == [] and ready(sent, email) == []


def test_an_example_address_is_not_written_to_and_that_is_not_a_failure(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    owner_sql("update users set email = $2 where email = $1", email,
              f"hamad-{uuid4().hex[:6]}@shop.example")
    assert pay(office, client_id, due).status_code == 200
    [one] = mine(office, client_id)
    assert one["status"] == "done" and one["emailed_at"] is None
    assert not [m for m in sent if "workspace is ready" in m["subject"]]
    assert "example address" in one["steps"][-1]["note"]
    assert owner_sql("select count(*) from signin_links l join users u on u.id = l.user_id "
                     "where u.email like $1 and l.tenant_id = $2", "hamad-%@shop.example",
                     UUID(tenant))[0][0] == 0


# ── modules, the starting setup, the steps and their owners ──────────


def test_modules_of_the_quote_are_switched_on_and_a_module_turned_off_stays_off(
    client, office, sent
):
    tenant, email, name, client_id, due = priced(client, office)
    owner_sql("delete from tenant_modules where tenant_id = $1 and module_key = 'payments'",
              UUID(tenant))
    owner_sql("update tenant_modules set enabled = false where tenant_id = $1 "
              "and module_key = 'inbox'", UUID(tenant))
    assert pay(office, client_id, due).status_code == 200
    modules = {r["module_key"]: (r["enabled"], r["enabled_by"]) for r in owner_sql(
        "select module_key, enabled, enabled_by from tenant_modules where tenant_id = $1",
        UUID(tenant))}
    assert modules["payments"] == (True, "ALYR activation")
    assert modules["inbox"][0] is False and modules["bookings"][0] is True
    assert "1 module switched on" in mine(office, client_id)[0]["steps"][1]["note"]


def test_the_products_on_the_quote_say_which_modules_a_business_needs():
    a, b = uuid4(), uuid4()
    lines = [
        {"business_id": a, "item_key": "chat"}, {"business_id": a, "item_key": "agent"},
        {"business_id": a, "item_key": "setup"}, {"business_id": a, "item_key": None},
        {"business_id": None, "item_key": "chat"}, {"business_id": b, "item_key": "bookings"},
        {"business_id": b, "item_key": "gone"},
    ]
    applies = {"chat": "product:chat", "agent": "product:agent", "setup": "each_business",
               "bookings": "product:bookings"}
    assert activation.modules_of_quote(lines, applies) == {
        a: {"inbox", "orders", "payments"}, b: {"inbox", "bookings", "payments"}}


def test_the_starting_setup_is_added_where_missing_and_never_twice(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    count = "select (select count(*) from services where tenant_id = $1), " \
            "(select count(*) from business_hours where tenant_id = $1)"
    before = tuple(owner_sql(count, UUID(tenant))[0])
    assert before[0] > 0 and before[1] > 0
    owner_sql("delete from services where tenant_id = $1", UUID(tenant))
    owner_sql("delete from business_hours where tenant_id = $1", UUID(tenant))
    assert pay(office, client_id, due).status_code == 200
    assert tuple(owner_sql(count, UUID(tenant))[0]) == before
    [one] = mine(office, client_id)
    assert "starting items added" in one["steps"][2]["note"]
    # Run again, as a staff retry does: nothing is added a second time.
    retry = office.post(f"{ADMIN}/activations/{one['id']}/retry", json={"resend": True})
    assert retry.status_code == 200
    assert tuple(owner_sql(count, UUID(tenant))[0]) == before


def test_a_business_set_up_with_alyr_gets_its_steps_with_alyr_as_their_owner(
    client, office, sent
):
    tenant, email, name, client_id, due = priced(client, office, kind="wholesale")
    # Staff handed one step to ALYR and back before the payment: that choice is kept.
    step = f"{ADMIN}/businesses/{tenant}/steps/content"
    assert office.patch(step, json={"owner": "alyr"}).status_code == 200
    assert office.patch(step, json={"owner": "client"}).status_code == 200
    assert pay(office, client_id, due).status_code == 200
    owners = {r["step_key"]: r["owner"] for r in owner_sql(
        "select step_key, owner from onboarding_steps where tenant_id = $1", UUID(tenant))}
    assert owners["content"] == "client"
    assert owners["payments"] == owners["whatsapp"] == "alyr"
    assert owners["terms"] == owners["price"] == owners["paid"] == "client"
    [letter] = ready(sent, email)
    assert "ALYR does this for you" in letter["text"]
    assert "ALYR owns" in mine(office, client_id)[0]["steps"][3]["note"]


# ── when it cannot finish ─────────────────────────────────


def test_without_email_set_up_the_failure_shows_and_a_retry_finishes_it(
    client, office, monkeypatch
):
    monkeypatch.delenv("ALYR_EMAIL_API_KEY", raising=False)
    get_settings.cache_clear()
    assert not mail.configured()
    tenant, email, name, client_id, due = priced(client, office)
    assert pay(office, client_id, due).status_code == 200

    [failed] = mine(office, client_id)
    assert (failed["status"], failed["failed_step"]) == ("failed", "email")
    assert [s["state"] for s in failed["steps"]] == ["ok", "ok", "ok", "ok", "failed"]
    assert "no Resend key" in failed["error"] and failed["emailed_at"] is None
    assert office.get(f"{ADMIN}/activations").json()["failed"] >= 1
    # The rest was done: the workspace works, only the email waits.
    assert owner_sql("select count(*) from signin_links l join users u on u.id = l.user_id "
                     "where u.email = $1", email)[0][0] == 0
    assert owner_sql("select billing_state from clients where id = $1",
                     UUID(client_id))[0][0] == "active"

    # Nothing to run again while it is done or waiting; unknown ones are refused.
    assert office.post(f"{ADMIN}/activations/{uuid4()}/retry", json={}).status_code == 404

    letters = mail_on(monkeypatch)
    assert office.post(f"{ADMIN}/activations/{failed['id']}/retry", json={}).status_code == 200
    [again] = mine(office, client_id)
    assert (again["status"], again["error"], again["failed_step"]) == ("done", "", "")
    assert len(ready(letters, email)) == 1
    # Done: pressing Retry again does nothing, and sends nothing.
    assert office.post(f"{ADMIN}/activations/{failed['id']}/retry", json={}).status_code == 409
    assert len(ready(letters, email)) == 1


def about_the_workspace(request) -> bool:
    return "workspace is ready" in json.loads(request.content)["subject"]


def test_a_refusal_by_resend_is_tried_again_and_then_shown(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    refused = {"on": True}

    def flaky(request):
        refused_now = refused["on"] and about_the_workspace(request)
        return httpx.Response(500, json={"message": "later"}) if refused_now else None

    letters = mail_on(monkeypatch, flaky)
    client, office = client_factory(), client_factory()
    tenant, email, name, client_id, due = priced(client, office)
    assert pay(office, client_id, due).status_code == 200
    # Every try was refused: the queue gave up and the back office says so.
    [failed] = mine(office, client_id)
    assert failed["status"] == "failed" and failed["attempts"] == activation.ATTEMPTS
    assert f"gave up after {activation.ATTEMPTS} tries" in failed["error"]
    assert "HTTP 500" in failed["error"] and ready(letters, email) == []

    refused["on"] = False
    assert office.post(f"{ADMIN}/activations/{failed['id']}/retry", json={}).status_code == 200
    assert mine(office, client_id)[0]["status"] == "done" and len(ready(letters, email)) == 1


def test_one_refusal_is_tried_again_by_the_queue_alone(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")
    calls = {"n": 0}

    def once(request):
        if not about_the_workspace(request):
            return None
        calls["n"] += 1
        return httpx.Response(500, json={"message": "later"}) if calls["n"] == 1 else None

    letters = mail_on(monkeypatch, once)
    client, office = client_factory(), client_factory()
    tenant, email, name, client_id, due = priced(client, office)
    assert pay(office, client_id, due).status_code == 200
    [one] = mine(office, client_id)
    assert (one["status"], one["attempts"], one["error"]) == ("done", 2, "")
    assert len(ready(letters, email)) == 1


def test_the_back_office_screens_are_for_staff_only(client, office, sent):
    tenant, email, name, client_id, due = priced(client, office)
    # The client is signed in as the business's owner, who is not ALYR staff.
    assert client.get(f"{ADMIN}/activations").status_code == 403
    assert client.post(f"{ADMIN}/activations/{uuid4()}/retry", json={}).status_code == 403


# ── the sign-in link ───────────────────────────────────────


def test_the_link_signs_the_owner_in_once(client, client_factory, office, sent):
    tenant, email, name, client_id = activated(client, office)
    token = token_of(ready(sent, email)[0])
    visitor = client_factory()

    signed = visitor.post("/api/auth/link", json={"token": token})
    assert signed.status_code == 200, signed.text
    me = signed.json()
    assert (me["signed_in"], me["email"], me["role"], me["business_id"]) == (
        True, email, "owner", tenant)
    assert visitor.get("/api/auth/me").json()["email"] == email
    assert mine(office, client_id)[0]["link"] == "used"

    # The second try, from anyone, is refused and says what to do instead.
    other = client_factory()
    again = other.post("/api/auth/link", json={"token": token})
    assert again.status_code == 401 and "sign in with a code" in again.json()["detail"]
    assert other.get("/api/auth/me").json()["signed_in"] is False


def test_the_link_stops_working_after_it_expires(client, client_factory, office, sent):
    tenant, email, name, client_id = activated(client, office)
    token = token_of(ready(sent, email)[0])
    [row] = owner_sql("select expires_at - created_at as lasts from signin_links "
                      "where user_id = (select id from users where email = $1)", email)
    assert row["lasts"].total_seconds() == activation.LINK_HOURS * 3600
    owner_sql("update signin_links set expires_at = now() - interval '1 minute' "
              "where user_id = (select id from users where email = $1)", email)
    visitor = client_factory()
    assert visitor.post("/api/auth/link", json={"token": token}).status_code == 401
    assert visitor.get("/api/auth/me").json()["signed_in"] is False
    assert mine(office, client_id)[0]["link"] == "expired"


def test_nothing_that_is_not_a_link_signs_anyone_in(client, client_factory, office, sent):
    tenant, email, name, client_id = activated(client, office)
    token = token_of(ready(sent, email)[0])
    visitor = client_factory()
    for wrong in (token[:-2] + "xx", "x" * 43, "short", token.upper()):
        assert visitor.post("/api/auth/link", json={"token": wrong}).status_code in (401, 422)
    assert visitor.get("/api/auth/me").json()["signed_in"] is False
    # The real one still works: wrong guesses did not spend it.
    assert visitor.post("/api/auth/link", json={"token": token}).status_code == 200


def test_two_people_opening_the_same_link_at_once_get_one_session(client, office, sent):
    tenant, email, name, client_id = activated(client, office)
    token = token_of(ready(sent, email)[0])

    async def both(db):
        return await asyncio.gather(
            auth.use_link(db, token), auth.use_link(db, token), return_exceptions=True)

    results = run(both)
    assert sorted(type(r).__name__ for r in results) == ["AuthError", "str"]


def test_a_link_for_someone_who_has_left_the_team_is_refused(client, client_factory, office, sent):
    tenant, email, name, client_id = activated(client, office)
    token = token_of(ready(sent, email)[0])
    owner_sql("delete from memberships where tenant_id = $1", UUID(tenant))
    assert client_factory().post("/api/auth/link", json={"token": token}).status_code == 401


def test_sending_the_email_again_ends_the_old_link(client, client_factory, office, sent):
    tenant, email, name, client_id = activated(client, office)
    [activation_row] = mine(office, client_id)
    old = token_of(ready(sent, email)[0])
    assert office.post(f"{ADMIN}/activations/{activation_row['id']}/retry",
                       json={"resend": True}).status_code == 200
    first, second = ready(sent, email)
    assert token_of(second) != old
    visitor = client_factory()
    assert visitor.post("/api/auth/link", json={"token": old}).status_code == 401
    assert visitor.post("/api/auth/link", json={"token": token_of(second)}).status_code == 200
    # Without "resend" a finished activation is left alone.
    assert office.post(f"{ADMIN}/activations/{activation_row['id']}/retry",
                       json={}).status_code == 409
    audit = [a for a in office.get(f"{ADMIN}/audit").json()["entries"]
             if a["action"] == "activation.retry"]
    assert audit and audit[0]["detail"] == {"resend": True}


def test_the_link_opens_the_business_it_was_made_for_even_when_another_was_used_last(
    client, client_factory, office, sent
):
    tenant, email, name, client_id = activated(client, office)
    other = other_business_of(email)
    owner_sql("update users set last_tenant_id = $2 where email = $1", email, other)
    visitor = client_factory()
    assert visitor.post("/api/auth/link", json={"token": token_of(ready(sent, email)[0])}
                        ).json()["business_id"] == tenant


def other_business_of(email):
    other = owner_sql("insert into tenants (name) values ('Second shop') returning id")[0]["id"]
    owner_sql("insert into memberships (tenant_id, user_id, role) "
              "select $1, id, 'owner' from users where email = $2", other, email)
    return other


# ── the sweep ───────────────────────────────────────────────


def test_the_sweep_finds_a_payment_no_path_reported_but_never_an_old_one(
    client, client_factory, office, sent
):
    tenant, email, name, client_id, due = priced(client, office)
    owner_sql(
        "insert into client_payments (client_id, quote_id, amount, method, received_on, "
        "recorded_by) select $1, id, $2, 'cash', current_date, 'test' from quotes "
        "where client_id = $1 and status = 'accepted'", UUID(client_id), due)
    assert mine(office, client_id) == []

    async def sweep(db):
        return await activation.sweep(db)

    since = owner_sql("select value::text as v from platform_settings where key = "
                      "'activation_since'")[0]["v"]
    try:
        # A payment from before the feature existed is never emailed about.
        owner_sql("update platform_settings set value = to_jsonb(now()::text) "
                  "where key = 'activation_since'")
        owner_sql("update platform_settings set value = to_jsonb((now() + interval '1 hour')::text)"
                  " where key = 'activation_since'")
        assert run(sweep) == 0 and mine(office, client_id) == []
    finally:
        owner_sql("update platform_settings set value = $1::jsonb where key = 'activation_since'",
                  since)
    assert run(sweep) >= 1
    [one] = mine(office, client_id)
    assert one["trigger"] == "sweep"
    client.portal.call(client.app.state.jobs.drain)
    assert mine(office, client_id)[0]["status"] == "done" and len(ready(sent, email)) == 1
    assert run(sweep) == 0
