"""Cancelling an order that was put on a customer's credit account (ALY-128).

The sale the order wrote on the customer's ledger comes off again, once, whoever cancels:
the customer, staff, or the hold sweep. The ledger keeps both entries; the customer is told
through the ledger's own notice; the aged-debt buckets, the weekly report and the Agent no
longer count the order. Every test goes through the real path: PostgreSQL, the order page's
HTTP API, the simulator's conversation.
"""

import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import asyncpg
import pytest

from alyr.core import team
from alyr.modules.ledger import report as ledger_report
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from test_consent import conversation, owner_sql, say
from test_items import counted, line, on_shop, order, pay, place_at
from test_orders import customer, product
from test_reports import BILAL_PHONE, at, build, contact_id, future_week, section

LED_PANELS = 4  # QAR 45 each: QAR 180 on the account


def put_on_account(client, who=None, name="LED panel", quantity=LED_PANELS) -> dict:
    placed = order(
        client, who or customer(client),
        [{"product_id": product(client, name)["id"], "quantity": quantity}], "account",
    )
    assert placed.status_code == 200, placed.text
    return placed.json()


def staff_cancel(client, placed: dict):
    return client.post(f"/api/orders/{placed['order_id']}/status", json={"status": "cancelled"})


def ledger(client, who=None) -> list[dict]:
    """The customer's entries, newest first, as the workspace lists them."""
    found = client.get(f"/api/ledger/customers/{(who or customer(client))['id']}/entries")
    return found.json()["entries"]


def reversals(order_id: str) -> list:
    return owner_sql(
        "select amount, created_by, note from ledger_entries "
        "where order_id = $1 and kind = 'reversal'", UUID(order_id),
    )


def cancel_directly(client, placed: dict, actor, held_minutes=None):
    """Cancel through the service, as each of the three paths does."""
    return on_shop(
        client, _cancel, UUID(placed["order_id"]), client.app.state.outbound, actor, held_minutes,
    )


async def _cancel(conn, order_id, outbound, actor, held_minutes):
    from alyr.modules.orders import service

    return await service.cancel_order(
        conn, order_id, outbound, actor, restock=True,
        reason="Not paid in time" if held_minutes else "Changed my mind",
        held_minutes=held_minutes,
    )


# ------------------------------------------------- the balance comes back, once

def test_cancelling_an_order_on_account_puts_the_balance_back_and_the_ledger_shows_both(client):
    before = customer(client)
    count = len(ledger(client))
    placed = put_on_account(client)
    assert customer(client)["balance_text"] == "QAR 2,030"

    cancelled = staff_cancel(client, placed)
    assert cancelled.status_code == 200
    assert cancelled.json()["credit_reversed_text"] == "QAR 180"

    after = customer(client)
    assert after["balance"] == before["balance"] == 185_000
    assert after["balance_text"] == "QAR 1,850"
    shown = [(e["kind"], e["amount"], e["note"]) for e in ledger(client)]
    assert len(shown) == count + 2
    assert shown[:2] == [
        ("reversal", 18_000, f"Order #{placed['number']} cancelled"),
        ("sale", 18_000, f"Order #{placed['number']}"),
    ]
    # The order's own record says its credit was taken off.
    history = owner_sql(
        "select detail from activity where subject = 'order' and subject_id = $1 "
        "and action = 'cancelled'", UUID(placed["order_id"]),
    )
    assert '"credit_reversed": "QAR 180"' in history[0]["detail"]


def test_a_second_cancel_changes_nothing(client):
    placed = put_on_account(client)
    assert staff_cancel(client, placed).status_code == 200
    settled = (customer(client)["balance"], len(ledger(client)), len(conversation(client)))

    again = staff_cancel(client, placed)
    assert again.status_code == 200
    assert "credit_reversed_text" not in again.json()
    assert (customer(client)["balance"], len(ledger(client)), len(conversation(client))) == settled
    assert len(reversals(placed["order_id"])) == 1

    twice = cancel_directly(client, placed, team.CUSTOMER)
    assert twice["already"] is True and twice["credit_reversed"] == 0
    assert (customer(client)["balance"], len(ledger(client))) == settled[:2]


def test_two_cancels_at_the_same_moment_take_the_sale_off_once(client):
    before = customer(client)["balance"]
    placed = put_on_account(client)
    start = threading.Barrier(2)

    def cancel(_):
        start.wait()
        return staff_cancel(client, placed).status_code

    with ThreadPoolExecutor(2) as pool:
        assert list(pool.map(cancel, range(2))) == [200, 200]
    assert len(reversals(placed["order_id"])) == 1
    assert customer(client)["balance"] == before


def test_the_database_itself_refuses_a_second_reversal_of_the_same_order(client):
    """The order's row lock and its status keep a second cancel out; this is the guard
    underneath, so no code path added later can take the same sale off twice."""
    placed = put_on_account(client)
    assert staff_cancel(client, placed).status_code == 200
    with pytest.raises(asyncpg.UniqueViolationError):
        owner_sql(
            "insert into ledger_entries (tenant_id, contact_id, kind, amount, order_id) "
            "values ($1, $2, 'reversal', 100, $3)",
            DEMO_TENANT_ID, UUID(customer(client)["id"]), UUID(placed["order_id"]),
        )


# ------------------------------------------------------- every way of cancelling

@pytest.mark.parametrize("path, actor, held_minutes", [
    ("the customer", team.CUSTOMER, None),
    ("staff", team.Actor(None, "Yusuf"), None),
    ("the hold sweep", team.ASSISTANT, 30),
])
def test_every_path_that_cancels_takes_the_credit_sale_off(client, path, actor, held_minutes):
    before = customer(client)["balance"]
    placed = put_on_account(client)
    result = cancel_directly(client, placed, actor, held_minutes)
    assert (result["already"], result["credit_reversed"]) == (False, 18_000)
    assert customer(client)["balance"] == before
    reversal = reversals(placed["order_id"])
    assert [(r["amount"], r["created_by"]) for r in reversal] == [(18_000, actor.name)]
    assert reversal[0]["note"] == f"Order #{placed['number']} cancelled"


def test_orders_paid_by_link_never_touch_the_ledger_when_they_are_cancelled_or_run_out(client):
    """A pay-link order was never a debt, so nothing comes off the ledger when its hold
    runs out, or when it is cancelled unpaid, or paid and then cancelled."""
    from alyr.modules.orders import holds as order_holds

    before = (customer(client)["balance"], len(ledger(client)))
    muffin = counted(client, 6, name="Muffin", name_ar="مافن")

    waiting = order(client, customer(client), [line(muffin, 2)]).json()
    owner_sql(
        "update stock_holds set expires_at = now() - interval '1 minute' where order_id = $1",
        UUID(waiting["order_id"]),
    )
    swept = client.portal.call(
        order_holds.expire_shop, client.app.state.db, client.app.state.outbound, DEMO_TENANT_ID
    )
    assert swept == 1  # the sweep cancelled it

    unpaid = order(client, customer(client), [line(muffin, 1)]).json()
    paid = order(client, customer(client), [line(muffin, 1)]).json()
    assert pay(client, paid).status_code == 200
    for placed in (unpaid, paid):
        answer = staff_cancel(client, placed)
        assert answer.status_code == 200 and "credit_reversed_text" not in answer.json()
    assert (customer(client)["balance"], len(ledger(client))) == before
    for placed in (waiting, unpaid, paid):
        assert reversals(placed["order_id"]) == []


def test_an_old_sale_that_was_never_tied_to_its_order_is_still_taken_off(client):
    """Sales written before ALY-128 carry no order. If the migration could not match one,
    the order's own total comes off, and the balance still comes back."""
    before = customer(client)["balance"]
    placed = put_on_account(client)
    owner_sql("update ledger_entries set order_id = null where order_id = $1",
              UUID(placed["order_id"]))
    assert staff_cancel(client, placed).json()["credit_reversed_text"] == "QAR 180"
    assert customer(client)["balance"] == before


# -------------------------------------------- the customer is told, by the ledger notice

def test_inside_the_24_hour_window_the_customer_is_told_in_plain_text(client):
    say(client, AHMED_PHONE, "hello")
    placed = put_on_account(client)
    staff_cancel(client, placed)
    cancelled, notice = conversation(client)[-2:]
    assert f"Order #{placed['number']} has been cancelled." in cancelled["body"]
    assert (notice["kind"], notice["status"]) == ("text", "sent")
    assert notice["payload"]["template"] == "entry_recorded"
    assert notice["body"].endswith(
        f"order #{placed['number']} was cancelled, so we took its credit purchase of "
        "QAR 180 off your account. Your balance is now QAR 1,850."
    )


def test_outside_the_window_it_goes_as_the_approved_entry_template(client):
    placed = put_on_account(client)  # Ahmed has never written: his window is closed
    staff_cancel(client, placed)
    notice = conversation(client)[-1]
    assert notice["kind"] == "template"
    assert notice["body"] == (
        "Update from Al Noor Electricals: we recorded the cancellation of a credit purchase "
        "of QAR 180 on your account. Your balance is now QAR 1,850. Thank you."
    )
    assert notice["payload"]["params"] == [
        "Al Noor Electricals", "the cancellation of a credit purchase", "QAR 180", "QAR 1,850",
    ]


def test_an_arabic_customer_is_told_in_arabic_both_ways(client):
    owner_sql("update contacts set lang = 'ar' where phone = $1", AHMED_PHONE)
    placed = put_on_account(client)
    staff_cancel(client, placed)
    closed = conversation(client)[-1]
    assert closed["kind"] == "template"
    assert "سجّلنا إلغاء شراء آجل بمبلغ QAR 180 على حسابك" in closed["body"]

    say(client, AHMED_PHONE, "hello")
    second = put_on_account(client)
    staff_cancel(client, second)
    plain = conversation(client)[-1]
    assert plain["kind"] == "text"
    wording = f"بعد إلغاء الطلب رقم {second['number']} أزلنا الشراء الآجل بمبلغ QAR 180"
    assert wording in plain["body"]


def test_the_customer_sees_the_reversal_when_they_ask_for_their_balance(client):
    say(client, AHMED_PHONE, "hello")
    staff_cancel(client, put_on_account(client))
    reply = say(client, AHMED_PHONE, "balance")[-1]["body"]
    assert "Your balance is QAR 1,850." in reply
    assert "Purchase cancelled  QAR 180" in reply


def test_a_customer_who_said_stop_gets_no_notice_but_the_ledger_is_still_right(client):
    say(client, AHMED_PHONE, "stop")
    placed = put_on_account(client)
    staff_cancel(client, placed)
    assert customer(client)["balance"] == 185_000
    assert len(reversals(placed["order_id"])) == 1


# ------------------------------------- what is owed, how old it is, what the reports count

def test_the_aged_debt_buckets_forget_the_order_instead_of_paying_off_the_oldest_debt(client):
    """Ahmed owes QAR 1,850 from 41 days ago. A new order adds QAR 180 in the newest
    bucket; cancelling it empties that bucket and leaves the old debt exactly as it was.
    (Treated as a payment, the reversal would have eaten into the oldest debt instead.)"""
    before = customer(client)
    assert (before["buckets"]["d31_60"], before["buckets"]["d0_30"]) == (185_000, 0)

    placed = put_on_account(client)
    during = customer(client)
    assert (during["buckets"]["d31_60"], during["buckets"]["d0_30"]) == (185_000, 18_000)

    staff_cancel(client, placed)
    after = customer(client)
    assert after["buckets"] == before["buckets"]
    assert (after["oldest_days"], after["balance"]) == (before["oldest_days"], before["balance"])
    summary = client.get("/api/ledger/summary").json()
    assert summary["buckets"]["d0_30"] == sum(
        c["buckets"]["d0_30"] for c in summary["customers"] if c["balance"] > 0
    )
    assert after["over_limit"] is False


def test_a_reversal_only_counts_from_the_moment_it_was_made(client):
    """Read as of an earlier time (the Agent's week-ago figure), the order was still owed."""
    from datetime import UTC, datetime, timedelta

    from alyr.modules.ledger import service

    before = client.get("/api/ledger/summary").json()["outstanding"]
    placed = put_on_account(client)
    owner_sql(
        "update ledger_entries set created_at = now() - interval '2 hours' "
        "where order_id = $1 and kind = 'sale'", UUID(placed["order_id"]),
    )
    staff_cancel(client, placed)
    an_hour_ago = datetime.now(UTC) - timedelta(hours=1)
    assert on_shop(client, service.summary, an_hour_ago)["outstanding"] == before + 18_000
    assert on_shop(client, service.summary)["outstanding"] == before


def test_the_weekly_report_does_not_count_a_cancelled_order(client):
    week = future_week()
    bilal = contact_id(client, BILAL_PHONE)
    placed = put_on_account(client, {"id": bilal}, "Breaker 16 A", 3)
    # Put the order, and its sale, in the week the report looks at.
    owner_sql("update orders set created_at = $2 where id = $1", UUID(placed["order_id"]),
              at(week, 4))
    owner_sql("update ledger_entries set created_at = $2 where order_id = $1 and kind = 'sale'",
              UUID(placed["order_id"]), at(week, 4))
    including = build(client, week)
    owed = section(including, "ledger")["numbers"]["owed"]
    assert section(including, "ledger")["numbers"]["credit_given"] == placed["total"]
    assert section(including, "orders")["numbers"]["orders"] == 1
    assert section(including, "orders")["numbers"]["on_account"] == placed["total"]

    staff_cancel(client, {"order_id": placed["order_id"]})
    ignored = build(client, week)
    ledger_numbers = section(ignored, "ledger")["numbers"]
    assert ledger_numbers["credit_given"] == 0
    assert ledger_numbers["owed"] == owed - placed["total"]
    orders = section(ignored, "orders")["numbers"]
    assert (orders["orders"], orders["cancelled"], orders["on_account"]) == (0, 1, 0)


def test_the_weekly_report_window_that_holds_both_entries_counts_no_credit_either(client):
    placed = put_on_account(client)
    staff_cancel(client, placed)

    async def numbers(conn):
        from datetime import UTC, datetime, timedelta

        now = datetime.now(UTC)
        return await ledger_report.numbers(
            conn, now - timedelta(hours=1), now + timedelta(hours=1), "Asia/Qatar", False
        )

    assert on_shop(client, numbers)["credit_given"] == 0
    assert placed["total"] == 18_000


def test_the_agent_counts_neither_the_order_nor_its_reversal(client):
    from alyr.core.auth import Staff
    from alyr.modules.agent import facts

    owner = Staff(None, "Test", "owner@example.test", "owner", DEMO_TENANT_ID)

    async def credit_given_in_the_last_weeks(conn) -> int:
        gathered = await facts.gather(conn, owner)
        return sum(sales for sales, _ in gathered.owed_weeks)

    owed = client.get("/api/ledger/summary").json()["outstanding"]
    given = on_shop(client, credit_given_in_the_last_weeks)
    placed = put_on_account(client)
    owner_sql(  # a sale from last week, so it falls in one of the weeks the Agent compares
        "update ledger_entries set created_at = now() - interval '8 days' "
        "where order_id = $1 and kind = 'sale'", UUID(placed["order_id"]),
    )
    assert on_shop(client, credit_given_in_the_last_weeks) == given + 18_000

    staff_cancel(client, placed)
    assert on_shop(client, credit_given_in_the_last_weeks) == given
    agent = client.get("/api/agent")
    assert agent.status_code == 200, agent.text
    assert client.get("/api/ledger/summary").json()["outstanding"] == owed


def test_placing_an_order_on_account_still_works_and_is_tied_to_its_sale(client):
    placed = put_on_account(client)
    tied = owner_sql(
        "select kind, amount from ledger_entries where order_id = $1", UUID(placed["order_id"])
    )
    assert [(r["kind"], r["amount"]) for r in tied] == [("sale", 18_000)]
    # A later order is a separate debt with its own sale.
    second = put_on_account(client, quantity=1)
    assert second["order_id"] != placed["order_id"]
    assert customer(client)["balance"] == 185_000 + 18_000 + 4_500


def test_a_cancel_at_a_set_moment_through_the_service_path_used_by_the_order_page(client):
    """`create_order` takes a clock; the cancel after it must work the same."""
    from datetime import UTC, datetime

    from alyr.modules.items.cart import CartLine

    cable = product(client, "Cable 2.5 mm")
    placed = place_at(
        client, customer(client), [CartLine(UUID(cable["id"]), 1)], datetime.now(UTC),
        payment="account",
    )
    assert placed["payment"] == "account"
    before_cancel = customer(client)["balance"]
    result = cancel_directly(client, placed, team.CUSTOMER)
    assert result["credit_reversed"] == placed["total"]
    assert customer(client)["balance"] == before_cancel - placed["total"]
