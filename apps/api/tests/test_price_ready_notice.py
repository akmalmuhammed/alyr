"""The owner is emailed once when ALYR publishes their price (CJ-14 of the go-live audit, the
part of ALY-274 that shipped ahead of the payment path): English or Arabic as they signed up,
a plain-text twin, a link to the workspace, never twice, never for a price they already saw,
never for mail that is not set up or an address that could not be a real person's."""

import asyncio
import json
from uuid import UUID, uuid4

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import mail, price_notice
from alyr.db import Database
from conftest import APP_DSN
from test_consent import owner_sql
from test_onboarding import BASE, new_business
from test_pricing import ADMIN, client_of, open_quote, pricing_restored  # noqa: F401 - fixture
from test_subscription import letters, to  # noqa: F401 - fixture


@pytest.fixture
def office(client_factory):
    return client_factory()


def reachable(client_id: str, lang: str = "en") -> str:
    """Give the client an address that could be a real person's, and the language they read."""
    address = f"owner-{uuid4().hex[:8]}@shop-test.com"
    owner_sql("update clients set contact_email = $2 where id = $1", UUID(client_id), address)
    owner_sql("update tenants set owner_lang = $2 where client_id = $1", UUID(client_id), lang)
    return address


def publish(office, name):
    quote = open_quote(client_of(office, name))
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/publish").status_code == 200
    return quote


def notified(quote_id: str):
    return owner_sql("select owner_notified_at from quotes where id = $1", UUID(quote_id))[0][0]


def test_publishing_a_price_emails_the_owner_once(client, office, letters):  # noqa: F811
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = open_quote(client_of(office, name))
    monthly = quote["totals"]["monthly_total_text"]

    publish(office, name)
    mine = to(letters, address)
    assert len(mine) == 1
    letter = mine[0]
    assert letter["subject"] == f"Your ALYR price is ready: {monthly} a month"
    # The plain-text twin carries what the HTML says, with the link written out.
    assert monthly in letter["text"] and "http://web.test/app" in letter["text"]
    assert monthly in letter["html"] and 'href="http://web.test/app"' in letter["html"]
    assert notified(quote["id"]) is not None

    # Publishing again, or taking it back and publishing again, never sends a second one.
    publish(office, name)
    assert office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish").status_code == 200
    publish(office, name)
    assert len(to(letters, address)) == 1


def test_the_email_is_in_the_language_the_owner_signed_up_in(client, office, letters):  # noqa: F811
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"], lang="ar")
    publish(office, name)
    letter = to(letters, address)[0]
    assert "سعرك من ALYR جاهز" in letter["subject"] and "ر.ق" in letter["subject"]
    assert "QAR" not in letter["subject"] + letter["text"] + letter["html"]
    assert 'dir="rtl"' in letter["html"]


def test_a_price_shown_at_sign_up_is_not_emailed(client, office, letters):  # noqa: F811
    office.put(f"{ADMIN}/pricing/types/salon",
               json={"availability": "self_serve", "price_mode": "automatic"})
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    assert client.get(f"{BASE}/quote").json()["status"] == "published"
    # The owner saw it on their screen when they signed up; publishing it again says nothing.
    publish(office, name)
    assert not to(letters, address)


def test_publishing_works_with_mail_unconfigured_or_an_address_that_cannot_be_real(
    client, office, monkeypatch
):
    monkeypatch.delenv("ALYR_EMAIL_API_KEY", raising=False)
    get_settings.cache_clear()
    sent: list[dict] = []
    monkeypatch.setattr(mail, "transport", httpx.MockTransport(
        lambda request: sent.append(json.loads(request.content)) or httpx.Response(200)))
    _, _, name = new_business(client, paid=False)
    quote = publish(office, name)
    assert not sent and notified(quote["id"]) is None

    # Mail on, but the address is one reserved for examples: nothing is sent or claimed.
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish")
    publish(office, name)
    assert not [m for m in sent if "price is ready" in m["subject"]]
    assert notified(quote["id"]) is None
    get_settings.cache_clear()


def test_a_refused_email_does_not_use_up_the_notice(client, office, monkeypatch):
    monkeypatch.setenv("ALYR_EMAIL_API_KEY", "re_test_key")
    get_settings.cache_clear()
    answers = iter([503, 200])
    seen: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if "price is ready" not in body["subject"]:
            return httpx.Response(200, json={"id": "x"})
        seen.append(body)
        return httpx.Response(next(answers), json={"id": "x"})

    monkeypatch.setattr(mail, "transport", httpx.MockTransport(handle))
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = publish(office, name)  # the provider refuses; the publishing still stands
    assert open_quote(client_of(office, name))["status"] == "published"
    assert notified(quote["id"]) is None
    office.post(f"{ADMIN}/quotes/{quote['id']}/unpublish")
    publish(office, name)
    assert [m["to"] for m in seen] == [[address], [address]]
    assert notified(quote["id"]) is not None
    get_settings.cache_clear()


def test_several_sends_at_the_same_moment_send_one_email(client, office, letters):  # noqa: F811
    """The claim is one conditional update on the quote, so two requests, or two workers,
    racing to tell the owner send a single email."""
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = publish(office, name)
    assert len(to(letters, address)) == 1

    # Forget that the owner was told, then let six sends race for it.
    owner_sql("update quotes set owner_notified_at = null where id = $1", UUID(quote["id"]))

    async def race() -> list[bool]:
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await asyncio.gather(
                *[price_notice.send_ready(db, UUID(quote["id"])) for _ in range(6)])
        finally:
            await db.close()

    assert sorted(asyncio.run(race())) == [False] * 5 + [True]
    assert len(to(letters, address)) == 2  # the first, and the one the race won
    assert notified(quote["id"]) is not None


def test_a_quote_that_is_not_published_is_never_announced(client, office, letters):  # noqa: F811
    _, _, name = new_business(client, paid=False)
    address = reachable(client_of(office, name)["id"])
    quote = open_quote(client_of(office, name))
    assert quote["status"] != "published"

    async def ask() -> bool:
        db = Database(APP_DSN)
        await db.connect()
        try:
            return await price_notice.send_ready(db, UUID(quote["id"]))
        finally:
            await db.close()

    assert asyncio.run(ask()) is False
    assert not to(letters, address) and notified(quote["id"]) is None
