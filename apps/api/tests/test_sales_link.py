"""Sales links: a quote made on a visit opens sign-up at the pay step (ALY-216, D-105 to D-108,
specs/041-sales-link).

The founder's side is the back office (on a developer machine the unsigned demo user counts as
ALYR staff); the owner's side is another client with no sign-in. Everything goes over HTTP into
real PostgreSQL. The mail provider is a recording stand-in."""

import time
from uuid import uuid4

import pytest

from alyr.core import links, ratelimit
from test_account import letters  # noqa: F401  (a fixture: mail on, every email recorded)
from test_consent import owner_sql
from test_onboarding import BASE, signup_token
from test_pricing import ADMIN, open_quote, pricing_restored  # noqa: F401  (a fixture)
from test_sign_in import sign_in

JOIN = "/api/join"


@pytest.fixture
def office(client_factory):
    return client_factory()


@pytest.fixture
def visitor(client_factory):
    """The owner on the founder's phone or their own: nobody is signed in."""
    return client_factory()


def new_lead(office, kind="salon", email=None, name=None) -> tuple[str, str]:
    email = email or f"nadia-{uuid4().hex[:8]}@bakery-test.com"
    answer = office.post(f"{ADMIN}/leads", json={
        "name": name or f"Dafira {uuid4().hex[:6]}", "contact_name": "Nadia Al-Naimi",
        "contact_email": email, "contact_phone": "+974 5555 0100", "type": kind,
        "name_ar": "دافيرا", "area": "Al Sadd",
    })
    assert answer.status_code == 200, answer.text
    return answer.json()["id"], email


def detail(office, client_id):
    return office.get(f"{ADMIN}/clients/{client_id}").json()


def published_quote(office, client_id) -> dict:
    assert office.post(f"{ADMIN}/clients/{client_id}/quotes", json={}).status_code == 200
    quote = open_quote(detail(office, client_id))
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
    return open_quote(detail(office, client_id))


def send(office, client_id, days=7) -> dict:
    answer = office.post(f"{ADMIN}/clients/{client_id}/sales-link", json={"days": days})
    assert answer.status_code == 200, answer.text
    return answer.json()["link"]


def token_of(link) -> str:
    return link["url"].split("#")[1]


def ready_lead(office, kind="salon") -> tuple[str, str, dict, str]:
    """A lead with a published quote and a live link: (client, email, quote, token)."""
    client_id, email = new_lead(office, kind)
    quote = published_quote(office, client_id)
    return client_id, email, quote, token_of(send(office, client_id))


def prove(visitor, token, email):
    """The owner opens the link, asks for the code, types it: the offer."""
    assert visitor.post(f"{JOIN}/open", json={"t": token}).status_code == 200
    asked = visitor.post(f"{JOIN}/code", json={"t": token})
    assert asked.status_code == 200, asked.text
    answer = visitor.post(f"{JOIN}/verify", json={"t": token, "code": asked.json()["dev_code"]})
    assert answer.status_code == 200, answer.text
    return answer.json()


def accept(visitor, token, offer, **changes):
    body = {
        "t": token, "signup_token": offer["signup_token"], "owner_name": "Nadia",
        "accepted_terms": [x["id"] for x in offer["terms"]], "quote_id": offer["quote"]["id"],
        "lang": "en",
    } | changes
    return visitor.post(f"{JOIN}/accept", json=body)


def tenants_of(client_id) -> int:
    return owner_sql("select count(*) as n from tenants where client_id = $1", client_id)[0]["n"]


def actions(office, client_id) -> list[str]:
    entries = office.get(f"{ADMIN}/audit", params={"client_id": client_id}).json()["entries"]
    return [e["action"] for e in reversed(entries)]


# ── the whole visit ───────────────────────────────────────


def test_a_quote_from_a_visit_opens_sign_up_at_the_pay_step(office, visitor, letters):  # noqa: F811
    client_id, email = new_lead(office, "salon")
    assert detail(office, client_id)["businesses"] == []

    # The first quote is drafted from the price list for the type the lead will become.
    office.post(f"{ADMIN}/clients/{client_id}/quotes", json={})
    drafted = open_quote(detail(office, client_id))
    assert [(x["item_key"], x["unit_price"]) for x in drafted["lines"]] == [
        ("bookings", 44900), ("agent", 0), ("setup", 250000),
    ]
    # A link needs a published quote.
    refused = office.post(f"{ADMIN}/clients/{client_id}/sales-link", json={"days": 7})
    assert refused.status_code == 409 and "publish the quote" in refused.json()["detail"]
    office.post(f"{ADMIN}/quotes/{drafted['id']}/publish")

    link = send(office, client_id, days=7)
    assert link["state"] == "live" and link["url"].startswith("http://web.test/join#")
    # The token is the fragment, which no browser sends to a server: it is in no request log.
    assert "?" not in link["url"]
    token = token_of(link)
    # Nothing about the lead is in the address.
    for private in (email, "Dafira", "Nadia", client_id, "salon", "44900", "449"):
        assert private not in link["url"]

    # The first look shows the shop and where the code goes, not the price or the address.
    first = visitor.post(f"{JOIN}/open", json={"t": token}).json()
    assert first["business"]["name"].startswith("Dafira")
    assert first["email_hint"].startswith("n••••@") and email not in str(first)
    assert "quote" not in first and "terms" not in first

    asked = visitor.post(f"{JOIN}/code", json={"t": token}).json()
    # The code went to the address the founder recorded and nowhere else.
    sent = [m for m in letters if m["to"] == [email]]
    assert len(sent) == 1 and asked["dev_code"] in sent[0]["text"]

    wrong = visitor.post(f"{JOIN}/verify", json={"t": token, "code": "000000"})
    assert wrong.status_code == 401
    offer = visitor.post(
        f"{JOIN}/verify", json={"t": token, "code": asked["dev_code"]}
    ).json()
    assert offer["quote"]["status"] == "published" and offer["quote"]["id"] == drafted["id"]
    assert offer["quote"]["totals"]["monthly_total"] == 44900
    assert offer["quote"]["totals"]["one_time_total"] == 250000
    assert "updated_by" not in offer["quote"]
    assert offer["products"][0] == {"en": "ALYR Bookings", "ar": "ALYR Bookings"}
    assert offer["owner_name"] == "Nadia Al-Naimi"
    assert {t["kind"] for t in offer["terms"]} >= {"privacy"}

    # Nothing is made until the terms are accepted.
    assert accept(visitor, token, offer, accepted_terms=[]).status_code == 422
    assert tenants_of(client_id) == 0

    done = accept(visitor, token, offer)
    assert done.status_code == 200, done.text
    assert done.json() == {"created": True, "quote_accepted": True, "next": "/start"}

    # The owner is signed in to the business, which is the lead's client's, with its type.
    me = visitor.get("/api/auth/me").json()
    assert (me["signed_in"], me["role"]) == (True, "owner")
    state = visitor.get(f"{BASE}/state").json()
    assert state["business"]["type"] == "salon" and state["business"]["area"] == "Al Sadd"
    assert (state["way"], state["step"], state["finished"]) == ("appointments", "golive", False)
    assert state["owner"]["name"] == "Nadia"
    assert tenants_of(client_id) == 1
    after = detail(office, client_id)
    assert [b["name"] for b in after["businesses"]] == [state["business"]["name"]]
    # No second client was made for the sign-up.
    assert len([c for c in office.get(f"{ADMIN}/clients").json()["clients"]
                if c["contact_email"] == email]) == 1

    # The quote shown is the one accepted; the lines moved onto the business; the terms are on
    # record exactly as sign-up records them.
    accepted = next(q for q in after["quotes"] if q["status"] == "accepted")
    assert accepted["id"] == drafted["id"] and accepted["accepted_by"] == "Nadia"
    tenant = after["businesses"][0]["id"]
    assert {x["business_id"] for x in accepted["lines"]} == {tenant}
    assert visitor.get(f"{BASE}/terms").json()["pending"] == []
    rows = owner_sql(
        "select a.ip, a.accepted_by from terms_acceptances a where a.tenant_id = $1", tenant
    )
    assert len(rows) == len(offer["terms"]) and {r["accepted_by"] for r in rows} == {"Nadia"}

    # The pay step asks for what the price list and the quote make due, no more.
    pay = visitor.get(f"{BASE}/payment").json()
    assert pay["status"] == "unpaid" and pay["due"] == 44900 + 250000

    # The link is used, and says what came of it.
    used = office.get(f"{ADMIN}/clients/{client_id}/sales-link").json()["link"]
    assert used["state"] == "used" and used["url"] is None
    assert used["business"] == state["business"]["name"]
    assert used["opens"] == 1 and used["verified_at"] and used["claimed_at"]
    gone = visitor.post(f"{JOIN}/open", json={"t": token})
    assert (gone.status_code, gone.json()["detail"]["code"]) == (410, "used")

    # Every step is in the audit log, and the log holds no code, token or address.
    log = actions(office, client_id)
    assert [a for a in log if a.startswith(("lead", "sales_link"))] == [
        "lead.created", "sales_link.sent", "sales_link.opened", "sales_link.code_sent",
        "sales_link.verified", "sales_link.accepted",
    ]
    text = str(office.get(f"{ADMIN}/audit", params={"client_id": client_id}).json())
    for secret in (token, asked["dev_code"], offer["signup_token"], email):
        assert secret not in text


def test_the_amounts_come_from_the_price_list(office, visitor, pricing_restored):  # noqa: F811
    """Change the price list and the lead's quote, and what is due, follow it: nothing is typed
    in code (D-092: with the setup line out of use only the first month is due)."""
    office.put(f"{ADMIN}/pricing/items/setup", json={
        "name": "Setup", "name_ar": "الإعداد", "kind": "one_time", "price": 250000,
        "applies": "each_business", "active": False, "sort": 30,
    })
    office.put(f"{ADMIN}/pricing/items/bookings", json={
        "name": "ALYR Bookings", "name_ar": "ALYR Bookings", "kind": "monthly", "price": 51900,
        "applies": "product:bookings", "active": True, "sort": 10,
    })
    client_id, email, quote, token = ready_lead(office)
    assert [x["item_key"] for x in quote["lines"]] == ["bookings", "agent"]
    offer = prove(visitor, token, email)
    assert offer["quote"]["totals"]["monthly_total"] == 51900
    assert accept(visitor, token, offer).status_code == 200
    assert visitor.get(f"{BASE}/payment").json()["due"] == 51900


def test_a_lead_of_an_order_type_is_quoted_and_opened_the_same_way(office, visitor):
    client_id, email, quote, token = ready_lead(office, "bakery")
    keys = [x["item_key"] for x in quote["lines"]]
    assert "chat" in keys and "setup" in keys
    offer = prove(visitor, token, email)
    assert accept(visitor, token, offer).status_code == 200
    state = visitor.get(f"{BASE}/state").json()
    assert state["business"]["type"] == "bakery" and state["step"] == "golive"
    assert tenants_of(client_id) == 1


def test_it_works_while_public_sign_up_is_closed(client_factory, monkeypatch):
    """The founder's invitation is the permission (D-107): `ALYR_SIGNUP_OPEN=false` closes
    `/start`, not this."""
    office = client_factory()
    client_id, email, _, token = ready_lead(office)
    monkeypatch.setenv("ALYR_SIGNUP_OPEN", "false")
    closed = client_factory()
    assert closed.post(f"{BASE}/code", json={"email": "someone@x.example"}).status_code == 200
    assert closed.post(f"{BASE}/verify", json={"email": "a@b.example", "code": "123456"}
                       ).status_code == 401
    offer = prove(closed, token, email)
    assert accept(closed, token, offer).status_code == 200
    assert tenants_of(client_id) == 1


def test_an_owner_who_already_has_an_account_gets_the_new_business_opened(
    office, client_factory
):
    """The same address may work for another business; the session opens the new one, not the
    first, and the first stays theirs."""
    email = f"two-{uuid4().hex[:8]}@shop-test.com"
    first = client_factory()
    made = first.post(f"{BASE}/business", json={
        "signup_token": signup_token(first, email), "owner_name": "Nadia", "name": "First Cuts",
        "name_ar": "", "type": "salon", "area": "Al Sadd",
        "accepted_terms": [t["id"] for t in first.get(f"{BASE}/terms/current").json()["current"]],
    })
    assert made.status_code == 200, made.text
    client_id, _ = new_lead(office, "salon", email=email, name="Second Cuts")
    published_quote(office, client_id)
    token = token_of(send(office, client_id))
    second = client_factory()
    assert accept(second, token, prove(second, token, email)).status_code == 200
    assert second.get(f"{BASE}/state").json()["business"]["name"] == "Second Cuts"
    assert tenants_of(client_id) == 1


# ── links that must not work ──────────────────────────────


def refusal(answer):
    return answer.status_code, answer.json()["detail"]["code"]


def test_forged_damaged_and_foreign_tokens_are_all_refused_alike(office, visitor):
    a_client, _, _, a_token = ready_lead(office)
    b_client, b_email, _, b_token = ready_lead(office)
    a_link = office.get(f"{ADMIN}/clients/{a_client}/sales-link").json()["link"]["id"]
    b_link = office.get(f"{ADMIN}/clients/{b_client}/sales-link").json()["link"]["id"]
    from uuid import UUID

    forged = {
        "garbage": "not-a-token-at-all",
        "an empty signature": a_token.split(".")[0] + ".",
        "a changed signature": a_token[:-3] + ("AAA" if not a_token.endswith("AAA") else "BBB"),
        "a changed payload": ("B" if a_token[0] != "B" else "C") + a_token[1:],
        "another purpose": links.mint(UUID(a_client), UUID(a_link), purpose=links.PAY, days=1),
        "another client's slot": links.mint(
            UUID(b_client), UUID(a_link), purpose=links.SALES, days=1),
        "a link that is not there": links.mint(
            UUID(a_client), uuid4(), purpose=links.SALES, days=1),
        "the shop slot": links.mint(uuid4(), UUID(a_link), purpose=links.SALES, days=1),
    }
    for what, token in forged.items():
        for path in ("open", "code"):
            answer = visitor.post(f"{JOIN}/{path}", json={"t": token})
            assert refusal(answer) == (404, "unknown"), (what, path, answer.text)
        answer = visitor.post(f"{JOIN}/verify", json={"t": token, "code": "123456"})
        assert refusal(answer) == (404, "unknown"), what
    # The same words whatever was wrong: nothing tells a stranger which links exist.
    assert len({str(visitor.post(f"{JOIN}/open", json={"t": t}).json()) for t in forged.values()
                }) == 1
    # And a good token for A does not open B.
    assert visitor.post(f"{JOIN}/open", json={"t": a_token}).status_code == 200
    assert a_link != b_link and a_token != b_token
    assert tenants_of(a_client) == tenants_of(b_client) == 0


def test_a_good_link_with_the_other_clients_email_proof_makes_nothing(office, visitor):
    """The database refuses by itself: a sign-up token proved for another email cannot make
    this lead's business, whatever the page was told."""
    a_client, a_email, _, a_token = ready_lead(office)
    _, b_email, _, b_token = ready_lead(office)
    offer = prove(visitor, a_token, a_email)
    stranger = signup_token(visitor, f"intruder-{uuid4().hex[:6]}@shop-test.com")
    answer = accept(visitor, a_token, offer, signup_token=stranger)
    assert answer.status_code == 401
    assert tenants_of(a_client) == 0
    # B's proof does not fit A either.
    b_proof = prove(visitor, b_token, b_email)
    answer = accept(visitor, a_token, offer, signup_token=b_proof["signup_token"])
    assert answer.status_code == 401 and tenants_of(a_client) == 0
    # A's own proof still does.
    assert accept(visitor, a_token, offer).status_code == 200
    assert tenants_of(a_client) == 1


def test_an_expired_link_is_refused(office, visitor):
    client_id, email, _, token = ready_lead(office)
    link_id = office.get(f"{ADMIN}/clients/{client_id}/sales-link").json()["link"]["id"]
    # The signature's own expiry.
    from uuid import UUID

    old = links.mint(UUID(client_id), UUID(link_id), purpose=links.SALES,
                     expires=int(time.time()) - 5)
    assert refusal(visitor.post(f"{JOIN}/open", json={"t": old})) == (410, "expired")
    # The row's expiry, with the token still good.
    owner_sql("update sales_links set expires_at = now() - interval '1 minute' where id = $1",
              UUID(link_id))
    assert refusal(visitor.post(f"{JOIN}/open", json={"t": token})) == (410, "expired")
    assert refusal(visitor.post(f"{JOIN}/code", json={"t": token})) == (410, "expired")
    shown = office.get(f"{ADMIN}/clients/{client_id}/sales-link").json()["link"]
    assert shown["state"] == "expired" and shown["url"] is None
    assert tenants_of(client_id) == 0


def test_a_revoked_link_stops_everything_even_after_the_code(office, visitor):
    client_id, email, _, token = ready_lead(office)
    offer = prove(visitor, token, email)
    revoked = office.delete(f"{ADMIN}/clients/{client_id}/sales-link")
    assert revoked.status_code == 200 and revoked.json()["link"]["state"] == "revoked"
    for path, extra in (("open", {}), ("code", {}), ("verify", {"code": "123456"})):
        answer = visitor.post(f"{JOIN}/{path}", json={"t": token} | extra)
        assert refusal(answer) == (410, "revoked")
    # The proof the owner already holds opens nothing.
    assert refusal(accept(visitor, token, offer)) == (410, "revoked")
    assert tenants_of(client_id) == 0
    assert "sales_link.revoked" in actions(office, client_id)
    # Nothing is left to revoke.
    assert office.delete(f"{ADMIN}/clients/{client_id}/sales-link").status_code == 409


def test_a_new_link_replaces_the_old_and_a_changed_email_ends_it(office, visitor):
    client_id, email, _, first = ready_lead(office)
    second = token_of(send(office, client_id, days=3))
    assert refusal(visitor.post(f"{JOIN}/open", json={"t": first})) == (410, "revoked")
    assert visitor.post(f"{JOIN}/open", json={"t": second}).status_code == 200
    # The founder corrects the address: a link made for the old one no longer fits.
    current = detail(office, client_id)
    changed = office.patch(f"{ADMIN}/clients/{client_id}", json={
        "name": current["name"], "contact_name": current["contact_name"],
        "contact_email": "other-owner@bakery-test.com", "contact_phone": "",
        "note": "", "price_mode": None,
    })
    assert changed.status_code == 200
    assert refusal(visitor.post(f"{JOIN}/open", json={"t": second})) == (410, "revoked")
    reasons = owner_sql("select revoked_reason from sales_links where client_id = $1 "
                        "order by created_at", client_id)
    assert [r["revoked_reason"] for r in reasons] == ["replaced", "email_changed"]


def test_a_link_cannot_be_used_twice(office, visitor):
    client_id, email, _, token = ready_lead(office)
    offer = prove(visitor, token, email)
    assert accept(visitor, token, offer).status_code == 200
    # The same proof again, and a fresh one, both refused; still one business.
    assert refusal(accept(visitor, token, offer)) == (410, "used")
    assert tenants_of(client_id) == 1
    assert owner_sql("select count(*) as n from sales_links where client_id = $1 "
                     "and claimed_at is not null", client_id)[0]["n"] == 1


def test_a_price_taken_back_is_not_accepted(office, visitor):
    client_id, email, quote, token = ready_lead(office)
    offer = prove(visitor, token, email)
    office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish")
    refused = accept(visitor, token, offer)
    assert refusal(refused) == (410, "changed") and tenants_of(client_id) == 0
    # While it is a draft the owner is told it is being prepared; republished, it is accepted.
    again = visitor.post(f"{JOIN}/verify", json={
        "t": token, "code": visitor.post(f"{JOIN}/code", json={"t": token}).json()["dev_code"]})
    assert again.json()["quote"] == {"status": "preparing"}
    office.post(f"{ADMIN}/quotes/{quote['id']}/publish")
    offer = prove(visitor, token, email)
    assert accept(visitor, token, offer).status_code == 200


# ── the limits ────────────────────────────────────────────


def test_every_call_counts_against_the_address_even_a_forged_one(office, visitor, monkeypatch):
    monkeypatch.setattr(ratelimit, "JOIN_PER_ADDRESS", ratelimit.Limit(3, 3600))
    for _ in range(3):
        assert visitor.post(f"{JOIN}/open", json={"t": "x" * 40}).status_code == 404
    blocked = visitor.post(f"{JOIN}/open", json={"t": "x" * 40})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0


def test_codes_and_guesses_are_limited_for_the_link(office, visitor, monkeypatch):
    client_id, email, _, token = ready_lead(office)
    monkeypatch.setattr(ratelimit, "JOIN_CODES_PER_LINK", ratelimit.Limit(2, 3600))
    monkeypatch.setattr(ratelimit, "JOIN_GUESSES_PER_LINK", ratelimit.Limit(2, 3600))
    assert visitor.post(f"{JOIN}/code", json={"t": token}).status_code == 200
    assert visitor.post(f"{JOIN}/code", json={"t": token}).status_code == 200
    assert visitor.post(f"{JOIN}/code", json={"t": token}).status_code == 429
    wrong = {"t": token, "code": "000000"}
    assert visitor.post(f"{JOIN}/verify", json=wrong).status_code == 401
    assert visitor.post(f"{JOIN}/verify", json=wrong).status_code == 401
    assert visitor.post(f"{JOIN}/verify", json=wrong).status_code == 429


def test_the_code_always_goes_to_the_recorded_address(office, visitor, letters):  # noqa: F811
    client_id, email, _, token = ready_lead(office)
    visitor.post(f"{JOIN}/code", json={"t": token, "email": "attacker@evil.example"})
    assert [m["to"] for m in letters] == [[email]]


# ── who may do what ───────────────────────────────────────


def test_only_alyr_staff_make_leads_and_links(client_factory, monkeypatch):
    office = client_factory()
    client_id, _ = new_lead(office)
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner = client_factory()
    body = {"name": "X", "contact_name": "Y", "contact_email": "y@x.example", "type": "salon"}
    calls = (
        lambda: owner.post(f"{ADMIN}/leads", json=body),
        lambda: owner.get(f"{ADMIN}/clients/{client_id}/sales-link"),
        lambda: owner.post(f"{ADMIN}/clients/{client_id}/sales-link", json={"days": 7}),
        lambda: owner.delete(f"{ADMIN}/clients/{client_id}/sales-link"),
        lambda: owner.put(f"{ADMIN}/clients/{client_id}/prospect", json={"type": "salon"}),
    )
    assert [call().status_code for call in calls] == [401] * 5
    from alyr.seed import OWNER_EMAIL

    sign_in(owner, OWNER_EMAIL)
    assert [call().status_code for call in calls] == [403] * 5


def test_what_a_lead_needs_before_it_is_made_or_sent(office):
    body = {"name": "Dafira", "contact_name": "Nadia", "contact_email": "nadia@dafira-test.com",
            "type": "salon"}
    assert office.post(f"{ADMIN}/leads", json=body | {"contact_email": "not-an-email"}
                       ).status_code == 422
    assert office.post(f"{ADMIN}/leads", json=body | {"type": "nonsense"}).status_code == 422
    owner_sql("insert into business_type_settings (key, availability, price_mode) "
              "values ('salon', 'hidden', 'prepared') on conflict (key) do update "
              "set availability = 'hidden'")
    try:
        assert office.post(f"{ADMIN}/leads", json=body).status_code == 422
    finally:
        owner_sql("delete from business_type_settings where key = 'salon'")
    client_id = office.post(f"{ADMIN}/leads", json=body).json()["id"]
    assert office.put(f"{ADMIN}/clients/{client_id}/prospect", json={"type": "bakery"}
                      ).status_code == 200
    assert detail(office, client_id)["prospect"]["type"] == "bakery"
    # No link without a published quote; none for a client that already has a business.
    assert office.post(f"{ADMIN}/clients/{client_id}/sales-link", json={"days": 7}
                       ).status_code == 409
    assert office.post(f"{ADMIN}/clients/{client_id}/sales-link", json={"days": 99}
                       ).status_code == 422
    from test_onboarding import new_business
    from test_pricing import client_of

    existing = office.get(f"{ADMIN}/clients").json()["clients"]
    plain = next(c for c in existing if c["businesses"] and c["prospect"] is None)
    assert office.post(f"{ADMIN}/clients/{plain['id']}/sales-link", json={"days": 7}
                       ).status_code == 409
    del client_of, new_business


def test_the_link_is_made_again_from_the_row_and_never_stored(office):
    client_id, _, _, token = ready_lead(office)
    again = office.get(f"{ADMIN}/clients/{client_id}/sales-link").json()["link"]
    assert token_of(again) == token
    columns = owner_sql("select column_name from information_schema.columns "
                        "where table_name = 'sales_links'")
    assert not [c for c in columns if "token" in c["column_name"]]
    from uuid import UUID

    read = links.read(token, UUID(client_id), purpose=links.SALES)
    assert str(read.subject_id) == again["id"]
    with pytest.raises(links.LinkError):
        links.read(token, uuid4(), purpose=links.SALES)  # another client
    with pytest.raises(links.LinkError):
        links.read(token, UUID(client_id), purpose=links.PAY)  # another page
