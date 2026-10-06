from datetime import UTC, datetime, timedelta

import pytest

from alyr.channels.base import Choice, OutboundMessage
from alyr.channels.meta import to_graph_payload
from alyr.core.normalise import fmt_qar, has_arabic, parse_amount, western_digits
from alyr.modules.ledger.ageing import age

NOW = datetime(2026, 10, 6, tzinfo=UTC)


def days_ago(n):
    return NOW - timedelta(days=n)


def test_eastern_arabic_digits_become_western():
    assert western_digits("أبي ١٠ كرتون") == "أبي 10 كرتون"
    assert western_digits("۴۵۰") == "450"


@pytest.mark.parametrize(
    "text, dirhams",
    [("450", 45_000), ("1,850", 185_000), ("450.50", 45_050), ("٤٥٠", 45_000),
     ("paid 200 today", 20_000), ("no number", None), ("0", None)],
)
def test_amounts_are_read_into_dirhams(text, dirhams):
    assert parse_amount(text) == dirhams


def test_money_is_formatted_without_floats():
    assert fmt_qar(185_000) == "QAR 1,850"
    assert fmt_qar(45_050) == "QAR 450.50"
    assert fmt_qar(-5_000) == "-QAR 50"


def test_arabic_is_detected():
    assert has_arabic("كم حسابي؟")
    assert not has_arabic("what is my balance")


def test_payments_settle_the_oldest_debt_first():
    aged = age(
        [("sale", 100_000, days_ago(100)), ("sale", 50_000, days_ago(10)),
         ("payment", 100_000, days_ago(5))],
        NOW,
    )
    assert aged.balance == 50_000
    assert aged.oldest_days == 10
    assert aged.buckets == {"d0_30": 50_000, "d31_60": 0, "d61_90": 0, "d90_plus": 0}


def test_part_payment_leaves_the_rest_in_its_age_bucket():
    aged = age([("sale", 240_000, days_ago(41)), ("payment", 55_000, days_ago(20))], NOW)
    assert aged.balance == 185_000
    assert aged.oldest_days == 41
    assert aged.buckets["d31_60"] == 185_000


def test_overpayment_shows_as_credit():
    aged = age([("sale", 10_000, days_ago(3)), ("payment", 15_000, days_ago(1))], NOW)
    assert aged.balance == -5_000
    assert sum(aged.buckets.values()) == 0


def test_more_than_three_buttons_is_refused():
    choices = tuple(Choice(str(i), f"Option {i}") for i in range(4))
    with pytest.raises(ValueError):
        OutboundMessage(to_number="97455500001", kind="buttons", body="Pick", choices=choices)


def test_template_needs_name_and_category():
    with pytest.raises(ValueError):
        OutboundMessage(to_number="97455500001", kind="template")


def test_buttons_are_serialised_for_the_graph_api():
    message = OutboundMessage(
        to_number="97455500001", kind="buttons", body="Pay now?",
        choices=(Choice("pay", "Pay now"), Choice("later", "Later")),
    )
    payload = to_graph_payload(message)
    assert payload["interactive"]["type"] == "button"
    assert [b["reply"]["id"] for b in payload["interactive"]["action"]["buttons"]] == [
        "pay", "later",
    ]
