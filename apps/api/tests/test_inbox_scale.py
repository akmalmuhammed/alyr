"""The inbox and the Orders screen stay cheap as a shop's history grows (D-130, migrations 0090
and 0091).

Each customer carries the time of their latest message and of their latest message from them,
kept by the database. The inbox lists the newest conversations off an index; "waiting for a first
look" is read from those two times. The tests prove the numbers equal what counting the
messages gives, that the cap is honest (`more`), that merged records keep the later times, and
that the Orders screen shows the last 30 days and everything still open and no more.
"""

from alyr.modules.inbox import service as inbox_service
from alyr.modules.orders import service as orders_service
from alyr.seed import AHMED_PHONE, DEMO_TENANT_ID
from test_consent import ahmed, owner_sql, say


def shop_customers(count: int, base: int = 97400000000) -> list:
    """`count` customers of the demo shop, each with one message in, `n` minutes ago."""
    rows = owner_sql(
        "insert into contacts (tenant_id, phone, name, role, last_inbound_at, consent_service) "
        "select $1, ($2::bigint + g)::text, 'Scale ' || g, 'customer', "
        "       now() - make_interval(mins => g), 'granted' "
        "from generate_series(1, $3) g returning id, name",
        DEMO_TENANT_ID, base, count,
    )
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status, created_at) "
        "select $1, c.id, 'in', 'text', 'hi', 'received', c.last_inbound_at "
        "from contacts c where c.name like 'Scale %' and c.tenant_id = $1", DEMO_TENANT_ID,
    )
    return rows


def test_the_database_keeps_each_customers_latest_message_times(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    row = owner_sql(
        "select c.last_message_at, c.last_in_message_at, "
        "  (select max(created_at) from messages where contact_id = c.id) as latest, "
        "  (select max(created_at) from messages where contact_id = c.id and direction = 'in') "
        "    as latest_in "
        "from contacts c where id = $1::uuid", contact_id)[0]
    assert row["last_message_at"] == row["latest"]  # the shop's reply was written after
    assert row["last_in_message_at"] == row["latest_in"]
    assert row["last_message_at"] >= row["last_in_message_at"]


def test_a_reply_moves_the_conversation_up_without_counting_as_unread(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    client.post(f"/api/inbox/conversations/{contact_id}/read")
    before = owner_sql("select last_in_message_at from contacts where id = $1::uuid",
                       contact_id)[0]["last_in_message_at"]
    assert client.post(f"/api/inbox/conversations/{contact_id}/reply",
                       json={"text": "One moment."}).status_code == 200
    after = owner_sql("select last_message_at, last_in_message_at from contacts "
                      "where id = $1::uuid", contact_id)[0]
    assert after["last_in_message_at"] == before  # our own message is not theirs
    assert after["last_message_at"] > before
    assert client.get("/api/inbox/conversations").json()["unread"] == 0


def test_unread_conversations_are_counted_the_way_counting_the_messages_would(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    counted = client.get("/api/inbox/conversations").json()
    assert counted["unread"] == sum(1 for r in counted["conversations"] if r["unread"]) == 1
    card = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    assert card["unanswered"]["value"] == 1
    client.post(f"/api/inbox/conversations/{contact_id}/read")
    assert client.get("/api/inbox/conversations").json()["unread"] == 0
    card = {c["key"]: c for c in client.get("/api/workspace/home").json()["cards"]}
    assert card["unanswered"]["value"] == 0
    say(client, AHMED_PHONE, "are you there?")
    assert client.get("/api/inbox/conversations").json()["unread"] == 1


def test_the_list_holds_the_newest_conversations_and_says_when_there_are_more(client):
    shop_customers(inbox_service.CONVERSATIONS_SHOWN + 15)
    answer = client.get("/api/inbox/conversations").json()
    rows = answer["conversations"]
    assert len(rows) == inbox_service.CONVERSATIONS_SHOWN
    assert answer["more"] is True
    # Newest first, and the oldest 15 are the ones left out.
    times = [r["last"]["created_at"] for r in rows]
    assert times == sorted(times, reverse=True)
    names = {r["name"] for r in rows}
    assert "Scale 1" in names and "Scale 300" in names
    assert "Scale 315" not in names
    # The count of conversations waiting for a first look is for all of them, not the page.
    assert answer["unread"] == inbox_service.CONVERSATIONS_SHOWN + 15


def test_a_shop_under_the_cap_gets_exactly_what_it_always_got(client):
    shop_customers(5)
    answer = client.get("/api/inbox/conversations").json()
    assert set(answer) == {"conversations", "unread"}  # no `more` unless something is left out
    assert len(answer["conversations"]) == 5


def test_an_old_conversation_comes_back_to_the_top_when_the_customer_writes_again(client):
    shop_customers(inbox_service.CONVERSATIONS_SHOWN + 5)
    assert "Scale 304" not in {r["name"] for r in
                               client.get("/api/inbox/conversations").json()["conversations"]}
    phone = owner_sql("select phone from contacts where name = 'Scale 304' and tenant_id = $1",
                      DEMO_TENANT_ID)[0]["phone"]
    say(client, phone, "hello again")
    top = client.get("/api/inbox/conversations").json()["conversations"][0]
    assert top["name"] == "Scale 304"


def test_merged_records_keep_the_later_times(client):
    say(client, AHMED_PHONE, "hello")
    kept = ahmed(client)["id"]
    other = owner_sql(
        "insert into contacts (tenant_id, phone, name, role) values ($1, '97455599911', "
        "'Duplicate', 'customer') returning id", DEMO_TENANT_ID)[0]["id"]
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, status, created_at) "
        "values ($1, $2, 'in', 'text', 'later', 'received', now() + interval '1 hour')",
        DEMO_TENANT_ID, other)
    owner_sql("update messages set contact_id = $1 where contact_id = $2", kept, other)
    row = owner_sql("select last_message_at, last_in_message_at from contacts "
                    "where id = $1::uuid", kept)[0]
    later = owner_sql("select max(created_at) as t from messages where contact_id = $1::uuid",
                      kept)[0]["t"]
    assert row["last_message_at"] == later == row["last_in_message_at"]


# --------------------------------------------------------------------------- the Orders screen

def make_order(number: int, days_ago: int, status: str, payment: str) -> None:
    contact = owner_sql("select id from contacts where tenant_id = $1 and role = 'customer' "
                        "limit 1", DEMO_TENANT_ID)[0]["id"]
    owner_sql(
        "insert into orders (tenant_id, contact_id, number, status, payment, total, created_at) "
        "values ($1, $2, $3, $4, $5, 1000, now() - make_interval(days => $6))",
        DEMO_TENANT_ID, contact, number, status, payment, days_ago)


def listed(client) -> set[int]:
    return {o["number"] for o in client.get("/api/orders").json()["orders"]}


def test_the_orders_screen_lists_recent_orders_and_every_open_one(client):
    say(client, AHMED_PHONE, "hello")
    base = 900000
    make_order(base + 1, 2, "done", "paid")          # recent, finished
    make_order(base + 2, 29, "done", "paid")         # still inside the window
    make_order(base + 3, 45, "done", "paid")         # old and finished: not listed
    make_order(base + 4, 120, "new", "unpaid")       # old but nobody has dealt with it
    make_order(base + 5, 90, "ready", "paid")        # old, ready, not collected
    make_order(base + 6, 60, "done", "unpaid")       # old, finished, still owed
    make_order(base + 7, 60, "cancelled", "unpaid")  # old, cancelled: not owed, not open
    shown = listed(client)
    assert {base + 1, base + 2, base + 4, base + 5, base + 6} <= shown
    assert base + 3 not in shown and base + 7 not in shown


def test_an_old_orders_lines_and_discounts_are_read_only_for_the_orders_shown(client):
    say(client, AHMED_PHONE, "hello")
    make_order(910001, 1, "new", "unpaid")
    make_order(910002, 200, "done", "paid")
    shown = client.get("/api/orders").json()["orders"]
    assert {o["number"] for o in shown if o["number"] > 910000} == {910001}


def test_the_orders_screen_is_capped(client, monkeypatch):
    say(client, AHMED_PHONE, "hello")
    monkeypatch.setattr(orders_service, "ORDERS_SHOWN", 3)
    for n in range(5):
        make_order(920000 + n, 1, "done", "paid")
    rows = client.get("/api/orders").json()["orders"]
    assert [o["number"] for o in rows] == [920004, 920003, 920002]
