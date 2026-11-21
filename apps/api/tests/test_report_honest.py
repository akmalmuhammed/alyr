"""The weekly report says where it goes and goes only where it can (task I5, first client's
Insights audit): the Agent's Sunday line names the email as well as the numbers, a shop ALYR
holds nothing for is sent no page of zeros, and a report nobody could receive is not called
sent. Through the real handler, the simulator and PostgreSQL."""

import asyncio
from datetime import timedelta

import asyncpg
import pytest

from alyr.channels.base import InboundMessage
from alyr.modules import report
from alyr.modules.agent.words import plain
from alyr.seed import DEMO_TENANT_ID, OWNER_EMAIL, OWNER_PHONE
from conftest import NUMBER_ID, OWNER_DSN
from test_consent import conversation, owner_sql
from test_reports import future_week, on_shop, send_week
from test_sign_in import sign_in


async def _drop_tenant(tenant) -> None:
    """Every row of one shop, the shop included (the owner role is a superuser on the test
    database; keys and triggers are off for the transaction)."""
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        tables = [r["table_name"] for r in await conn.fetch(
            "select c.table_name from information_schema.columns c "
            "join information_schema.tables t on t.table_schema = c.table_schema "
            "and t.table_name = c.table_name and t.table_type = 'BASE TABLE' "
            "where c.table_schema = 'public' and c.column_name = 'tenant_id' "
            "and c.table_name <> 'tenants'"
        )]
        async with conn.transaction():
            await conn.execute("set local session_replication_role = replica")
            for table in tables:
                await conn.execute(f'delete from "{table}" where tenant_id = $1', tenant)
            await conn.execute("delete from tenants where id = $1", tenant)
    finally:
        await conn.close()


WHERE = "select sent_at from weekly_reports where tenant_id = $1 and week_start = $2"


def nobody_gets_it_on_whatsapp():
    owner_sql("update contacts set weekly_report = false where tenant_id = $1", DEMO_TENANT_ID)


def mail_goes_to(monkeypatch, *addresses):
    """ALYR's mail is set up and these are the owners' addresses; what is sent is kept."""
    sent = []

    async def owners(conn):
        return list(addresses)

    async def send(address, subject, text, html):
        sent.append((address, subject))

    monkeypatch.setattr(report.mail, "configured", lambda: True)
    monkeypatch.setattr(report, "_owner_emails", owners)
    monkeypatch.setattr(report.mail, "send", send)
    return sent


def test_a_report_nobody_can_receive_is_kept_and_not_called_sent(client, monkeypatch):
    week = future_week()
    nobody_gets_it_on_whatsapp()
    monkeypatch.setattr(report.mail, "configured", lambda: False)
    before = len(conversation(client, OWNER_PHONE))
    send_week(client, week)
    assert len(conversation(client, OWNER_PHONE)) == before
    rows = owner_sql(WHERE, DEMO_TENANT_ID, week)
    assert len(rows) == 1 and rows[0]["sent_at"] is None


def test_the_emailed_copy_counts_as_sent_and_the_agent_says_it_goes_by_email(client, monkeypatch):
    week = future_week()
    nobody_gets_it_on_whatsapp()
    sent = mail_goes_to(monkeypatch, "fatima@realshop.qa", "omar@realshop.qa")
    send_week(client, week)
    assert [a for a, _ in sent] == ["fatima@realshop.qa", "omar@realshop.qa"]
    assert owner_sql(WHERE, DEMO_TENANT_ID, week)[0]["sent_at"] is not None
    sign_in(client, OWNER_EMAIL)
    line = plain(client.get("/api/agent").json()["report"])
    assert line == "Your report goes to 2 email addresses on Sunday at 9:00."
    # With a phone linked as well, both are said.
    owner_sql("update contacts set weekly_report = true where tenant_id = $1 and phone = $2",
              DEMO_TENANT_ID, OWNER_PHONE)
    both = plain(client.get("/api/agent").json()["report"])
    assert both == "Your report goes to 1 number and 2 email addresses on Sunday at 9:00."


def test_a_template_meta_has_not_approved_is_not_promised_as_a_whatsapp_send(client, monkeypatch):
    """Outside a number's 24-hour window the report goes as a template; while Meta has not
    approved it on the shop's account the Agent says so instead of "goes to 1 number"."""
    owner_sql("update channel_numbers set waba_id = 'waba-honest-1' where number_id = $1",
              NUMBER_ID)
    owner_sql("delete from whatsapp_templates where tenant_id = $1", DEMO_TENANT_ID)
    for language in ("en", "ar"):
        owner_sql(
            "insert into whatsapp_templates (tenant_id, waba_id, name, language, status, "
            "synced_at) values ($1, 'waba-honest-1', 'weekly_report', $2, 'submitted', now())",
            DEMO_TENANT_ID, language)
    try:
        monkeypatch.setattr(report.mail, "configured", lambda: False)
        sign_in(client, OWNER_EMAIL)
        held = plain(client.get("/api/agent").json()["report"])
        assert held.startswith("The Sunday report is set for ")
        assert "Meta has not approved the report's wording." in held
        assert "goes to" not in held
        owner_sql("update whatsapp_templates set status = 'approved' where tenant_id = $1",
                  DEMO_TENANT_ID)
        approved = plain(client.get("/api/agent").json()["report"])
        assert approved.startswith("Your report goes to 1 number on Sunday at ")
    finally:
        owner_sql("delete from whatsapp_templates where tenant_id = $1", DEMO_TENANT_ID)
        owner_sql("update channel_numbers set waba_id = null where number_id = $1", NUMBER_ID)


def test_without_mail_the_agent_does_not_name_an_email(client, monkeypatch):
    monkeypatch.setattr(report.mail, "configured", lambda: False)
    sign_in(client, OWNER_EMAIL)
    line = plain(client.get("/api/agent").json()["report"])
    assert "email" not in line and line.startswith("Your report goes to ")


@pytest.fixture
def shop_without_records():
    """A bookings shop with one staff number that receives the report and no booking at all,
    deleted when the test is done."""
    tenant = owner_sql("insert into tenants (name) values ('Salon') returning id")[0]["id"]
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'bookings')", tenant)
    owner_sql(
        "insert into contacts (tenant_id, phone, name, role, wa_user_id, weekly_report) "
        "values ($1, '+97455512345', 'Owner', 'staff', '97455512345', true)", tenant,
    )
    yield tenant
    asyncio.run(_drop_tenant(tenant))


def test_a_shop_with_no_records_is_sent_no_page_of_zeros(
    client, monkeypatch, shop_without_records
):
    """A bookings shop whose visits are somewhere else would read "0 visits" as a fact."""
    tenant = shop_without_records
    sent = mail_goes_to(monkeypatch, "owner@realshop.qa")
    week = future_week() - timedelta(days=14)

    handler = report.WeeklyReports(client.app.state.db, client.app.state.outbound)
    client.portal.call(handler.send, tenant, {"week_start": week.isoformat()})
    assert sent == []
    assert owner_sql(WHERE, tenant, week) == []
    assert owner_sql("select count(*) as n from messages where tenant_id = $1", tenant
                     )[0]["n"] == 0


def test_asking_for_the_report_of_a_shop_with_no_records_says_there_is_none(
    client, shop_without_records
):
    tenant = shop_without_records
    message = InboundMessage(channel="simulator", message_id="m1", to_number_id="1",
                             kind="text", from_number="97455512345", text="report")

    async def ask(conn):
        staff = await conn.fetchrow("select * from contacts where role = 'staff'")
        return await report.on_staff_message(conn, staff, message)

    async def go():
        async with client.app.state.db.tenant(tenant) as conn:
            return await ask(conn)

    answer = client.portal.call(go)
    assert answer and answer[0].body == (
        "There is nothing to report yet: ALYR holds no orders, visits, chats or money records "
        "for this shop."
    )


def test_the_demo_shop_still_gets_its_report(client):
    """The guard leaves a shop with records alone: the demo shop's report is made and sent."""
    week = future_week()
    assert on_shop(client, report.holds_records) is True
    send_week(client, week)
    assert owner_sql(WHERE, DEMO_TENANT_ID, week)[0]["sent_at"] is not None
