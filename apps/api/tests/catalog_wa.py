"""Shared helpers for the Catalog-on-WhatsApp tests (ALY-106): switch the module on, talk as a
phone through the chat simulator, and read what the shop said back."""

import re

import pytest

from alyr.seed import DEMO_TENANT_ID
from test_consent import conversation, owner_sql, say

ARABIC = re.compile(r"[؀-ۿ]")
YUSUF = "Yusuf (counter)"  # a registered staff number that is not a manager
FATIMA = "Fatima (owner)"  # a registered staff number that is a manager
STRANGER = "97455599123"  # a phone the shop has never heard of


@pytest.fixture(autouse=True)
def catalog_module_on(client):
    """These tests switch the Catalog on for the demo shop (the shop reset clears the row; a
    shop made by onboarding has it from the start since ALY-113). The client fixture has just
    reset the shop, which clears the setting. The tables the shop reset does not reach are
    emptied here, before and after, and so are the sample items other tests' new shops were
    given: a sample can only be a draft, and these tests change every item at once."""

    def clear():
        for table in ("media_ops", "media_links", "media_assets", "media_usage"):
            owner_sql(f"delete from {table}")
        owner_sql("delete from jobs where kind = 'media.sync'")
        owner_sql("delete from items where is_sample")

    clear()
    owner_sql(
        "insert into tenant_modules (tenant_id, module_key, enabled_by) "
        "values ($1, 'catalog', 'test') on conflict (tenant_id, module_key) "
        "do update set enabled = true",
        DEMO_TENANT_ID,
    )
    yield
    clear()


def talk(client, phone, text="", reply_id="") -> list[dict]:
    """Send one message as a phone and return the messages the shop sent back."""
    before = len(conversation(client, phone))
    after = say(client, phone, text, reply_id)
    return [m for m in after[before:] if m["direction"] == "out"]


def sent(client, phone) -> list[dict]:
    """Everything the shop has sent to a phone so far."""
    return [m for m in conversation(client, phone) if m["direction"] == "out"]


def choices(message: dict) -> list[dict]:
    return message["payload"].get("choices", [])


def undo_id(message: dict) -> str:
    return next(c["id"] for c in choices(message) if c["id"].startswith("undo:"))


def activity(client, item: dict) -> list[dict]:
    return client.get(f"/api/items/{item['id']}/activity").json()["activity"]


def contact_id(phone: str) -> str:
    return str(owner_sql("select id from contacts where phone = $1", phone)[0]["id"])


def window_closed(phone: str) -> None:
    """The customer last wrote three days ago, so only a template may be sent."""
    owner_sql(
        "update contacts set last_inbound_at = now() - interval '3 days' where phone = $1", phone
    )
