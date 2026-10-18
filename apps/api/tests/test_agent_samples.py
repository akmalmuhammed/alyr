"""The salon and clinic samples, and the sample screens captured for the public site
(ALY-99): rerunnable, nothing that can reach a phone, and fixtures that match the engine."""

import asyncio
import json
import re
from datetime import UTC, datetime

import pytest

from alyr.agent_samples import OUT, SAMPLE_NOW
from alyr.core import links
from alyr.core.auth import Staff
from alyr.db import Database
from alyr.modules.agent import view
from alyr.seed_bookings import HOME, SALON, ensure_sample_tenant, reset_sample
from conftest import APP_DSN, OWNER_DSN
from test_consent import owner_sql

NOW = datetime(2026, 10, 15, 13, 20, tzinfo=UTC)


def make(sample, days: int = 56) -> tuple[dict, dict]:
    async def go():
        await ensure_sample_tenant(OWNER_DSN, sample, NOW, days)
        db = Database(APP_DSN)
        await db.connect()
        try:
            first = await reset_sample(db, sample, NOW, days, web_url="http://web.test")
            again = await reset_sample(db, sample, NOW, days, web_url="http://web.test")
        finally:
            await db.close()
        return first, again

    return asyncio.run(go())


@pytest.mark.parametrize("sample", [SALON, HOME], ids=["salon", "homeservices"])
def test_a_bookings_sample_is_the_same_every_time_and_never_reaches_a_phone(sample):
    first, again = make(sample)
    assert first == again and first["bookings"] > 60 and first["orders"] == 0
    statuses = {
        r["status"]: r["n"]
        for r in owner_sql(
            "select status, count(*) as n from bookings where tenant_id = $1 group by 1",
            sample.tenant_id,
        )
    }
    assert statuses["completed"] > statuses["no_show"] > 0 and statuses["booked"] > 0
    channels = owner_sql(
        "select channel from channel_numbers where tenant_id = $1", sample.tenant_id
    )
    assert [r["channel"] for r in channels] == ["simulator"]
    assert owner_sql(
        "select count(*) as n from jobs where tenant_id = $1", sample.tenant_id
    )[0]["n"] == 0
    modules = owner_sql(
        "select module_key from tenant_modules where tenant_id = $1 order by 1", sample.tenant_id
    )
    expected = ["bookings", "inbox", "payments"] + (["ledger"] if sample.accounts else [])
    assert [r["module_key"] for r in modules] == sorted(expected)


@pytest.mark.parametrize("sample", [SALON, HOME], ids=["salon", "homeservices"])
def test_the_booking_links_in_a_sample_chat_are_signed_never_a_bare_contact_id(sample):
    """ALY-133: the seeded chats say what the real one says, a token made for booking."""
    make(sample)
    bodies = [r["body"] for r in owner_sql(
        "select body from messages where tenant_id = $1 and body like '%/b/%'", sample.tenant_id
    )]
    assert len(bodies) > 20
    for body in bodies:
        assert "?c=" not in body and "?t=" in body
        token = re.search(r"\?t=(\S+)", body).group(1)
        assert links.read(token, sample.tenant_id, purpose=links.BOOKING).contact_id


def test_an_empty_sample_shows_the_empty_state():
    make(SALON, days=0)

    async def look():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async with db.tenant(SALON.tenant_id) as conn:
                owner = await conn.fetchrow(
                    "select u.id, u.name from memberships m join users u on u.id = m.user_id "
                    "where m.role = 'owner'"
                )
                staff = Staff(owner["id"], owner["name"], "", "owner", SALON.tenant_id)
                return await view.build(conn, staff, "en", now=NOW)
        finally:
            await db.close()

    empty = asyncio.run(look())
    assert empty["state"] == "empty" and empty["kpis"] == [] and empty["placeholders"]
    make(SALON)  # back to the full sample for the tests after this one


@pytest.mark.parametrize("key", ["bakery", "salon", "homeservices"])
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_the_captured_sample_screens_match_the_engine(key, lang):
    path = OUT / f"{key}.{lang}.json"
    assert path.exists(), f"run `python -m alyr.agent_samples` to capture {path.name}"
    sample = json.loads(path.read_text(encoding="utf-8"))
    assert sample["version"] == view.VERSION
    assert sample["lang"] == lang and sample["dir"] == ("rtl" if lang == "ar" else "ltr")
    assert sample["now"] == SAMPLE_NOW.isoformat()
    assert sample["state"] == "normal" and sample["money"] is True
    assert len(sample["kpis"]) == 4 and sample["week"] and sample["needs"]["items"]
    # Money through ALYR links reads as live payments; there is no provider yet (ALY-17).
    assert not any(r["key"] == "paid" for r in sample["done"]["rows"])
    assert not any(i["key"] == "setup" for i in sample["needs"]["items"])
    text = json.dumps(sample, ensure_ascii=False).lower()
    assert not re.search(r"\b(ai|smart|learns|thinks|noticed|predicts?)\b", text)
