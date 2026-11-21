"""A rule that says something about messages speaks only for a shop that has the inbox (task I6,
the first client's Insights audit). ALYR knows its own messages and nothing else: a shop that
sells or books through ALYR and writes to its customers somewhere else would be told "none of
your best customers has heard from you" because ALYR never saw the messages that went out
elsewhere. `Insight.chat` marks such a rule, `applies()` keeps it silent without the inbox, and
these tests fail any rule that reads `messages` without saying so."""

import inspect
import re
from datetime import timedelta

import pytest

from alyr.modules.agent import rules, view
from alyr.modules.agent.insights import INSIGHTS, applies
from alyr.modules.agent.rules import top_customers
from alyr.modules.agent.words import plain
from test_agent_rule_second_order import NOW, Shop, read

READS_MESSAGES = re.compile(r"\b(from|join)\s+messages\b", re.IGNORECASE)
WITHOUT_INBOX = frozenset({"orders", "bookings", "ledger", "catalog", "payments", "documents"})


def test_every_rule_file_that_reads_messages_is_marked_as_chat():
    reading = [
        r.KEY for r in rules.RULES
        if READS_MESSAGES.search(inspect.getsource(r)) and not r.INSIGHT.chat
    ]
    assert not reading, (
        f"{reading} read the `messages` table without `chat=True` on their Insight: say it, so "
        "the rule is kept quiet for a shop that has no inbox in ALYR (task I6)"
    )


def test_the_guard_would_catch_a_new_rule_that_forgets_to_say_so():
    forgetful = "select 1 from messages m where m.direction = 'out'"
    assert READS_MESSAGES.search(forgetful)
    assert not READS_MESSAGES.search("select 1 from orders where note = 'messages'")


def test_a_chat_card_does_not_apply_without_the_inbox():
    chat = [i for i in INSIGHTS if i.chat]
    assert {i.key for i in chat} >= {"top_customers", "after_hours"}
    for insight in chat:
        assert not applies(insight, WITHOUT_INBOX), insight.key
        assert applies(insight, WITHOUT_INBOX | {"inbox"}) or "inbox" not in insight.module, (
            insight.key)


def test_the_cards_about_answering_chats_are_for_the_inbox_alone():
    """The core rules that speak of chats name only the inbox as their module."""
    for key in ("waiting", "slow_answers", "lost_reason"):
        insight = next(i for i in INSIGHTS if i.key == key)
        assert insight.module == "inbox", key
        assert not applies(insight, WITHOUT_INBOX), key


# ── on a real database ────────────────────────────────────


async def _regulars(conn, modules):
    """A shop that has been on ALYR for 200 days with 36 customers who each ordered once in the
    last 90 days, the ten biggest spending a lot, and none of them ever written to."""
    shop = await Shop.make(conn, modules=modules, name="Chat honesty shop")
    await conn.execute(
        "update tenants set created_at = $2, onboarded_at = $2 where id = $1",
        shop.tenant, NOW - timedelta(days=200),
    )
    for i in range(36):
        who = await shop.customer(f"Customer {i}")
        await shop.order(who, NOW - timedelta(days=10 + i), total=50_000 if i < 10 else 5_000)
    return shop.tenant


def _facts(modules):
    async def build(conn):
        return [await _regulars(conn, modules)]

    return read(build)[0]


def _top_customers_card(f):
    cards = view.render(f, "en")["suggestions"]
    return next((c for c in cards if c["key"] == top_customers.KEY), None)


def test_the_best_customers_card_is_not_made_for_a_shop_without_the_inbox():
    without = _facts(("orders", "bookings"))
    assert top_customers.KEY not in without.extra
    assert _top_customers_card(without) is None


def test_the_same_shop_with_the_inbox_is_told():
    with_inbox = _facts(("orders", "bookings", "inbox"))
    assert top_customers.KEY in with_inbox.extra
    card = _top_customers_card(with_inbox)
    assert card is not None
    assert plain(card["title"]).startswith("Your 10 best customers spent ")


@pytest.mark.parametrize("modules", [("orders",), ("bookings",), ("orders", "bookings", "ledger")])
def test_no_chat_rule_gathers_for_a_shop_with_orders_or_bookings_and_no_inbox(modules):
    f = _facts(modules)
    for rule in rules.RULES:
        if rule.INSIGHT.chat:
            assert rule.KEY not in f.extra, rule.KEY
