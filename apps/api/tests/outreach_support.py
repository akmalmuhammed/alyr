"""Shared set-up for the outreach engine's tests (ALY-310, specs/065). Every outside service is
its simulator (`ALYR_ENV=local`); nothing reaches the network."""

import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

import asyncpg
import pytest

from conftest import OWNER_DSN

ADMIN = "/api/admin/outreach"
DOHA = ZoneInfo("Asia/Qatar")
# A Sunday, 10:00 in Doha: a working day and hour in Qatar and Saudi Arabia.
SUNDAY_10 = datetime(2026, 11, 8, 10, 0, tzinfo=DOHA)
LEGAL = "ALYR Technologies W.L.L., P.O. Box 0000, Doha, Qatar"
SECRET = "outreach-unsubscribe-test-secret-0123456789abcdef"

TABLES = ("outreach_connection_tests", "outreach_events", "outreach_suppression",
          "outreach_replies", "outreach_sends", "outreach_intents", "outreach_approvals",
          "outreach_drafts", "outreach_claims", "outreach_pages", "outreach_found_emails",
          "outreach_prospects", "outreach_mailboxes")


def osql(sql: str, *args):
    """As the database's owner, with the back office declared (the tables force row-level
    security even for their owner)."""
    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            await conn.execute("select set_config('app.platform_admin', 'on', false)")
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def clean() -> None:
    for table in TABLES:
        osql(f"delete from {table}")
    osql("update outreach_settings set kill_switch = false, kill_reason = '', daily_cap = 50, "
         "default_level = 1, honeytokens = '{}', booking_url = '', last_poll_at = null, "
         "last_digest_on = null, last_erase_on = null")
    osql("delete from jobs where kind like 'outreach.%'")


@pytest.fixture
def outreach_env(monkeypatch):
    for name, value in {
        "ALYR_OUTREACH": "on",
        "ALYR_OUTREACH_FROM": "akmal@alyr-team.example",
        "ALYR_OUTREACH_FROM_NAME": "Akmal Muhammed",
        "ALYR_OUTREACH_LEGAL_LINE": LEGAL,
        "ALYR_OUTREACH_OFFER": "ALYR answers a shop's WhatsApp, takes orders and bookings.",
        "ALYR_OUTREACH_BOOKING_URL": "https://cal.example/akmal",
        "ALYR_OUTREACH_UNSUBSCRIBE_SECRET": SECRET,
        "ALYR_OUTREACH_UNSUBSCRIBE_BASE": "https://api.alyr.test",
    }.items():
        monkeypatch.setenv(name, value)
    clean()
    yield
    clean()


@pytest.fixture
def office(outreach_env, client_factory):
    client = client_factory()
    engine(client).clock = lambda: SUNDAY_10
    return client


def engine(client):
    return client.app.state.outreach


def run(client, fn, *args):
    """Run one of the engine's coroutines on the app's own event loop."""
    return client.portal.call(fn, *args)


CONTACT = {"first_name": "contact_first_name", "last_name": "contact_last_name",
           "role": "contact_role", "email": "contact_email"}


def add(client, n=1, **over):
    body = {"company": f"Demo Bakery {n}", "website": f"https://bakery-{n}.example/",
            "country": "QA", "first_name": "Sara", "role": "Owner",
            "email": f"sara@bakery-{n}.example", "basis": "published_business_contact",
            "basis_note": f"https://bakery-{n}.example/contact", **over}
    body = {CONTACT.get(k, k): v for k, v in body.items()}
    answer = client.post(f"{ADMIN}/prospects", json=body)
    assert answer.status_code == 200, answer.text
    return answer.json()["id"]


def detail(client, pid):
    answer = client.get(f"{ADMIN}/prospects/{pid}")
    assert answer.status_code == 200, answer.text
    return answer.json()


def researched(client, n=1, **over):
    """A prospect researched and drafted for: three drafts waiting for review."""
    pid = add(client, n, **over)
    assert client.post(f"{ADMIN}/prospects/{pid}/research").status_code == 200
    seen = detail(client, pid)
    assert seen["stage"] == "in_review", seen
    return pid, seen


def first_draft(seen):
    return next(d for d in seen["drafts"] if d["kind"] == "sequence" and d["step"] == 1
                and d["status"] == "in_review")


def approve(client, seen, with_follow_ups=True):
    draft = first_draft(seen)
    return client.post(f"{ADMIN}/drafts/{draft['id']}/approve",
                       json={"body_hash": draft["body_hash"], "with_follow_ups": with_follow_ups})


def kill(on: bool) -> None:
    osql("update outreach_settings set kill_switch = $1", on)
