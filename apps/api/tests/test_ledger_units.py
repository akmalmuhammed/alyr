import re
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from alyr.channels.base import Address, Choice, OutboundMessage
from alyr.channels.meta import to_graph_payload
from alyr.core import templates
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


def test_a_reversed_sale_is_not_a_debt_and_leaves_the_old_debt_alone():
    cancelled = uuid4()
    old = [("sale", 100_000, days_ago(100)), ("sale", 20_000, days_ago(40))]
    aged = age(
        [*old, ("sale", 15_000, days_ago(2), cancelled),
         ("reversal", 15_000, days_ago(1), cancelled)],
        NOW,
    )
    assert aged == age(old, NOW)
    assert aged.balance == 120_000
    assert aged.buckets == {"d0_30": 0, "d31_60": 20_000, "d61_90": 0, "d90_plus": 100_000}


def test_a_reversal_taken_as_a_payment_would_have_eaten_the_oldest_debt():
    """What the reversal must not be: the same entries without the order's link."""
    aged = age(
        [("sale", 100_000, days_ago(100)), ("sale", 15_000, days_ago(2)),
         ("reversal", 15_000, days_ago(1))],
        NOW,
    )
    assert aged.balance == 100_000
    assert aged.buckets["d90_plus"] == 85_000 and aged.buckets["d0_30"] == 15_000


def test_a_reversal_that_arrives_before_its_time_leaves_the_sale_in_place():
    order = uuid4()
    aged = age([("sale", 15_000, days_ago(2), order)], NOW)
    assert aged.balance == 15_000  # the reversal is not in the list yet: as of an earlier day


def test_more_than_three_buttons_is_refused():
    choices = tuple(Choice(str(i), f"Option {i}") for i in range(4))
    with pytest.raises(ValueError):
        OutboundMessage(to=uuid4(), kind="buttons", body="Pick", choices=choices)


def test_template_needs_name_and_category():
    with pytest.raises(ValueError):
        OutboundMessage(to=uuid4(), kind="template")


def test_buttons_are_serialised_for_the_graph_api():
    message = OutboundMessage(
        to=uuid4(), kind="buttons", body="Pay now?",
        choices=(Choice("pay", "Pay now"), Choice("later", "Later")),
    )
    payload = to_graph_payload(message, Address(phone="97455500001"))
    assert payload["to"] == "97455500001"
    assert payload["interactive"]["type"] == "button"
    assert [b["reply"]["id"] for b in payload["interactive"]["action"]["buttons"]] == [
        "pay", "later",
    ]


def test_a_user_id_is_sent_as_recipient_when_there_is_no_phone():
    message = OutboundMessage(to=uuid4(), body="hello")
    payload = to_graph_payload(message, Address(user_id="QA.123"))
    assert payload["recipient"] == "QA.123"
    assert "to" not in payload


def test_an_address_needs_something_to_deliver_to():
    with pytest.raises(ValueError):
        Address()


def test_a_template_carries_its_language_and_the_values_for_its_blanks():
    message = templates.notice(uuid4(), "order_ready", "ar", "الطلب جاهز", 1001)
    template = to_graph_payload(message, Address(phone="97455500001"))["template"]
    assert template["name"] == "order_ready"
    assert template["language"] == {"code": "ar"}
    assert template["components"] == [
        {"type": "body", "parameters": [{"type": "text", "text": "1001"}]}
    ]


def test_every_template_follows_metas_rules():
    for name, template in templates.CATALOGUE.items():
        assert re.fullmatch(r"[a-z0-9_]+", name), name
        for text in (template.en, template.ar):
            blanks = re.findall(r"\{\{(\d+)\}\}", text)
            # Numbered 1..n in order, one of each, matching the sample values.
            assert blanks == [str(i) for i in range(1, len(template.samples) + 1)], name
            assert not text.startswith("{{") and not text.rstrip().endswith("}}"), name
            assert "\n" not in text and len(text) <= 1024, name


def test_a_value_with_a_line_break_is_put_on_one_line():
    message = templates.notice(uuid4(), "order_ready", "en", "Ready", "10\n  01")
    assert message.template_params == ("10 01",)
    assert templates.render("order_ready", "en", message.template_params) == (
        "Your order 10 01 is ready for collection. See you soon."
    )


def test_a_notice_with_the_wrong_number_of_values_is_refused():
    with pytest.raises(ValueError):
        templates.notice(uuid4(), "order_ready", "en", "Ready")
