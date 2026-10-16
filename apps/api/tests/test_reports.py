"""The weekly result report (ALY-75, D-030): every product adds its own section, the
owner gets it once a week on WhatsApp, and REPORT brings the whole thing."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from alyr.core.words import CUSTOMERS, counted
from alyr.modules import report
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_PHONE, STAFF_PHONE
from test_bookings import book
from test_consent import ahmed, conversation, owner_sql, say
from test_orders import place, product
from test_sign_in import sign_in

QATAR = ZoneInfo("Asia/Qatar")
BILAL_PHONE = "97455500002"


def future_week() -> date:
    """A week no demo data falls in, so every number in it comes from the test."""
    today = datetime.now(QATAR).date()
    return today - timedelta(days=(today.weekday() - 6) % 7) + timedelta(days=14)


def at(week: date, day: int, hour: int = 11) -> datetime:
    return datetime.combine(week + timedelta(days=day), time(hour), QATAR)


def contact_id(client, phone):
    return next(
        c["id"] for c in client.get("/api/ledger/summary").json()["customers"]
        if c["phone"] == phone
    )


def on_shop(client, fn, *args):
    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await fn(conn, *args)

    return client.portal.call(go)


def build(client, week):
    return on_shop(client, report.build, week)


def send_week(client, week):
    handler = report.WeeklyReports(client.app.state.db, client.app.state.outbound)
    client.portal.call(handler.send, DEMO_TENANT_ID, {"week_start": week.isoformat()})


def section(built, key):
    return next(s for s in built["sections"] if s["key"] == key)


def ledger_entry(contact, kind, amount, when):
    owner_sql(
        "insert into ledger_entries (tenant_id, contact_id, kind, amount, created_by, created_at) "
        "values ($1, $2, $3, $4, 'test', $5)",
        DEMO_TENANT_ID, contact, kind, amount, when,
    )


def test_every_product_adds_its_own_section_with_its_own_numbers(client):
    week = future_week()
    ahmed_id, bilal_id = contact_id(client, AHMED_PHONE), contact_id(client, BILAL_PHONE)

    # Credit accounts: two customers paid, one bought on credit, a reminder went out.
    ledger_entry(ahmed_id, "payment", 30_000, at(week, 1))
    ledger_entry(bilal_id, "payment", 20_000, at(week, 2))
    ledger_entry(bilal_id, "sale", 45_000, at(week, 3))
    ledger_entry(ahmed_id, "payment", 10_000, at(week - timedelta(days=7), 2))
    owner_sql(
        "insert into payment_requests (tenant_id, contact_id, amount, status, paid_at) "
        "values ($1, $2, 20000, 'paid', $3)",
        DEMO_TENANT_ID, bilal_id, at(week, 2),
    )
    owner_sql(
        "insert into messages (tenant_id, contact_id, direction, kind, body, payload, status, "
        "created_at) values ($1, $2, 'out', 'template', 'Reminder', "
        "'{\"template\": \"payment_reminder\"}', 'sent', $3)",
        DEMO_TENANT_ID, ahmed_id, at(week, 1),
    )

    # Orders: Ahmed has ordered before, so this week he is a repeat customer.
    cable = product(client, "Cable 2.5 mm")
    first = place(client, ahmed_id, [(cable, 1)], "link").json()["order_id"]
    paid = place(client, ahmed_id, [(cable, 2)], "link").json()["order_id"]
    breaker = product(client, "Breaker 16 A")
    tab = place(client, bilal_id, [(breaker, 3)], "account").json()["order_id"]
    owner_sql("update orders set created_at = $2 where id = $1", first, at(week, -30))
    owner_sql(
        "update orders set created_at = $2, payment = 'paid' where id = $1", paid, at(week, 2)
    )
    owner_sql("update orders set created_at = $2 where id = $1", tab, at(week, 4))

    # Bookings: one customer came, one did not.
    came, missed = book(client).json()["id"], book(client, contact_id=bilal_id).json()["id"]
    for booking, status, day in ((came, "completed", 1), (missed, "no_show", 3)):
        owner_sql(
            "update bookings set status = $2, starts_at = $3, "
            "ends_at = $3::timestamptz + interval '1 hour', "
            "created_at = $4 where id = $1",
            booking, status, at(week, day), at(week, 0),
        )

    # The inbox: Ahmed wrote.
    say(client, AHMED_PHONE, "hello")
    owner_sql(
        "update messages set created_at = $2 "
        "where contact_id = $1 and created_at > now() - interval '1 minute'",
        ahmed_id, at(week, 2),
    )

    built = build(client, week)
    assert [s["key"] for s in built["sections"]] == ["ledger", "orders", "bookings", "inbox"]

    ledger = section(built, "ledger")
    assert ledger["numbers"]["collected"] == 50_000
    assert ledger["numbers"]["payers"] == 2
    assert ledger["numbers"]["credit_given"] == 45_000
    assert ledger["numbers"]["by_link"] == 20_000
    assert ledger["numbers"]["reminders"] == 1
    assert ledger["before"]["collected"] == 10_000

    orders = section(built, "orders")["numbers"]
    assert orders["orders"] == 2
    assert orders["paid_online"] == 2 * cable["price"]
    assert orders["on_account"] > 0
    assert orders["repeat"] == 1
    assert orders["top"]["name"].startswith("Breaker 16 A")

    bookings = section(built, "bookings")["numbers"]
    assert (bookings["came"], bookings["no_shows"], bookings["made"]) == (1, 1, 2)

    assert section(built, "inbox")["numbers"]["wrote"] == 1


def test_a_shop_only_hears_about_the_products_it_uses(client):
    owner_sql(
        "delete from tenant_modules where tenant_id = $1 and module_key = any($2)",
        DEMO_TENANT_ID, ["orders", "bookings", "payments"],
    )
    assert [s["key"] for s in build(client, future_week())["sections"]] == ["ledger", "inbox"]


def test_the_report_reads_naturally_in_english_and_arabic(client):
    week = future_week()
    ledger_entry(contact_id(client, AHMED_PHONE), "payment", 430_000, at(week, 1))
    built = build(client, week)
    shop = {"en": "Al Noor Electricals", "ar": "النور للكهربائيات"}
    english, arabic = report.render(built, shop, "en"), report.render(built, shop, "ar")
    heading = f"ALYR weekly report: Al Noor Electricals\n{english['label']}"
    assert english["text"].startswith(heading)
    assert "Collected: QAR 4,300 from 1 customer" in english["text"]
    assert english["summary"].startswith("QAR 4,300 collected")
    assert arabic["text"].startswith("تقرير ALYR الأسبوعي: النور للكهربائيات")
    assert "الحسابات الآجلة" in arabic["text"]
    assert "تم تحصيل QAR 4,300 من عميل واحد" in arabic["text"]


def test_the_owner_gets_the_report_once_and_the_next_week_is_queued(client):
    week = future_week()
    before = len(conversation(client, OWNER_PHONE))
    send_week(client, week)
    thread = conversation(client, OWNER_PHONE)
    assert len(thread) == before + 1
    last = thread[-1]
    # The owner has not written in the last 24 hours, so it is the approved template.
    assert last["kind"] == "template"
    assert last["payload"]["template"] == "weekly_report"
    assert "Send REPORT to read the whole report here." in last["body"]

    send_week(client, week)
    assert len(conversation(client, OWNER_PHONE)) == before + 1

    queued = owner_sql(
        "select run_at from jobs where tenant_id = $1 and kind = 'weekly_report' "
        "and status = 'queued' and payload->>'week_start' = $2",
        DEMO_TENANT_ID, (week + timedelta(days=7)).isoformat(),
    )
    assert [r["run_at"] for r in queued] == [at(week, 14, report.SEND_HOUR)]
    # The counter staff are not on the list.
    staff_thread = conversation(client, STAFF_PHONE)
    assert all(m["payload"].get("template") != "weekly_report" for m in staff_thread)


def test_inside_the_window_the_whole_report_arrives_at_once(client):
    say(client, OWNER_PHONE, "hello")
    send_week(client, future_week())
    last = conversation(client, OWNER_PHONE)[-1]
    assert last["kind"] == "text"
    assert last["body"].startswith("ALYR weekly report: Al Noor Electricals")
    assert "Credit accounts" in last["body"] and "Bookings" in last["body"]


def test_report_in_the_chat_brings_the_whole_report(client):
    assert say(client, OWNER_PHONE, "report")[-1]["body"].startswith("ALYR weekly report:")
    assert say(client, OWNER_PHONE, "تقرير")[-1]["body"].startswith("تقرير ALYR الأسبوعي:")
    # Someone the owner has not chosen is told who decides.
    assert "numbers the owner chooses" in say(client, STAFF_PHONE, "report")[-1]["body"]


def test_a_shop_that_switches_the_report_off_gets_nothing(client):
    assert client.put("/api/reports/settings", json={"enabled": False}).json()["enabled"] is False
    before = len(conversation(client, OWNER_PHONE))
    send_week(client, future_week())
    assert len(conversation(client, OWNER_PHONE)) == before
    assert owner_sql("select count(*) as n from weekly_reports where tenant_id = $1",
                     DEMO_TENANT_ID)[0]["n"] == 0


def test_reports_go_out_on_sunday_at_nine_shop_time():
    thursday = datetime(2026, 10, 15, 10, 0, tzinfo=UTC)
    assert report.last_full_week(thursday, "Asia/Qatar") == date(2026, 10, 4)
    assert report.next_send(thursday, "Asia/Qatar") == (
        date(2026, 10, 11), datetime(2026, 10, 18, 9, 0, tzinfo=QATAR)
    )
    early_sunday = datetime(2026, 10, 18, 5, 0, tzinfo=UTC)  # 08:00 in Doha
    assert report.next_send(early_sunday, "Asia/Qatar")[0] == date(2026, 10, 11)
    late_sunday = datetime(2026, 10, 18, 8, 0, tzinfo=UTC)  # 11:00 in Doha
    assert report.next_send(late_sunday, "Asia/Qatar") == (
        date(2026, 10, 18), datetime(2026, 10, 25, 9, 0, tzinfo=QATAR)
    )
    assert report.label(date(2026, 10, 11), "en") == "11 to 17 Oct"
    assert report.label(date(2026, 9, 27), "en") == "27 Sep to 3 Oct"
    assert report.label(date(2026, 10, 11), "ar") == "من 11/10 إلى 17/10"


def test_every_shop_has_its_next_report_queued_exactly_once(client):
    owner_sql("delete from jobs where kind = 'weekly_report'")
    db = client.app.state.db
    assert client.portal.call(report.ensure_scheduled, db) >= 1
    assert client.portal.call(report.ensure_scheduled, db) == 0
    rows = owner_sql(
        "select count(*) as n from jobs where tenant_id = $1 and kind = 'weekly_report' "
        "and status = 'queued'",
        DEMO_TENANT_ID,
    )
    assert rows[0]["n"] == 1


def test_the_workspace_shows_the_report_and_who_receives_it(client):
    page = client.get("/api/reports/weekly").json()
    assert [s["key"] for s in page["sections"]] == ["ledger", "orders", "bookings", "inbox"]
    assert page["text"]["en"].startswith("ALYR weekly report:")
    assert page["sections"][0]["title"] == {"en": "Credit accounts", "ar": "الحسابات الآجلة"}

    people = {p["name"]: p for p in client.get("/api/reports/settings").json()["recipients"]}
    assert people["Fatima (owner)"]["receives"] is True
    assert people["Yusuf (counter)"]["receives"] is False

    changed = client.put(
        "/api/reports/settings", json={"recipients": [people["Yusuf (counter)"]["id"]]}
    ).json()
    receives = {p["name"]: p["receives"] for p in changed["recipients"]}
    assert receives == {"Fatima (owner)": False, "Yusuf (counter)": True}
    assert client.post("/api/reports/weekly/send").json() == {"sent": 1}
    assert conversation(client, STAFF_PHONE)[-1]["payload"]["template"] == "weekly_report"

    refused = client.put("/api/reports/settings", json={"recipients": [ahmed(client)["id"]]})
    assert refused.status_code == 422


def test_only_the_owner_or_an_admin_sees_the_report(client):
    sign_in(client, AGENT_EMAIL)
    assert client.get("/api/reports/weekly").status_code == 403
    assert client.put("/api/reports/settings", json={"enabled": False}).status_code == 403


def test_numbers_are_worded_the_way_each_language_counts():
    assert counted(1, CUSTOMERS, "en") == "1 customer"
    assert counted(4, CUSTOMERS, "en") == "4 customers"
    assert counted(1, CUSTOMERS, "ar") == "عميل واحد"
    assert counted(2, CUSTOMERS, "ar") == "عميلان"
    assert counted(5, CUSTOMERS, "ar") == "5 عملاء"
    assert counted(14, CUSTOMERS, "ar") == "14 عميلاً"


def test_a_quiet_week_says_so_in_one_line_and_late_money_gets_a_next_step(client):
    built = build(client, future_week())
    text = report.render(built, {"en": "Al Noor", "ar": "النور"}, "en")["text"]
    assert "No orders came in this week." in text
    assert "Orders received: 0" not in text
    assert "No visits and no new bookings this week." in text
    # The demo shop has money more than 60 days late and sent no reminders.
    assert "Next step: send reminders from Credit accounts." in text
    summary = report.render(built, {"en": "Al Noor", "ar": "النور"}, "en")["summary"]
    assert "no orders" not in summary


def test_made_up_addresses_are_never_emailed():
    assert report._deliverable("owner@realshop.qa")
    assert not report._deliverable("fatima@alnoor.example")
    assert not report._deliverable("ops@alyr.example")
    assert not report._deliverable("someone@shop.test")
    assert not report._deliverable("broken-address")

