"""Meta's messaging rules, enforced in the outbound layer (D-020)."""

import asyncio
from uuid import UUID

import asyncpg

from alyr.channels.base import OutboundMessage
from alyr.seed import AHMED_PHONE, DEMO_SLUG, DEMO_TENANT_ID
from conftest import OWNER_DSN


def say(client, phone, text="", reply_id=""):
    response = client.post(
        "/sim/messages", json={"from_number": phone, "text": text, "reply_id": reply_id}
    )
    assert response.status_code == 200
    return response.json()["messages"]


def conversation(client, phone=AHMED_PHONE):
    return client.get(f"/sim/conversations/{phone}").json()["messages"]


def ahmed(client):
    people = client.get("/api/ledger/summary").json()["customers"]
    return next(c for c in people if c["phone"] == AHMED_PHONE)


def send_directly(client, contact_id, **message):
    """Hand one message to the outbound layer, as a module would."""

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await client.app.state.outbound.send(
                conn, OutboundMessage(to=UUID(contact_id), **message)
            )

    return client.portal.call(go)


def owner_sql(sql, *args):
    async def go():
        conn = await asyncpg.connect(OWNER_DSN)
        try:
            return await conn.fetch(sql, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


def test_customer_who_says_stop_gets_no_more_reminders(client):
    reply = say(client, AHMED_PHONE, "STOP")[-1]
    assert "will not receive reminders" in reply["body"]
    assert reply["status"] == "sent"
    assert ahmed(client)["opted_out"] is True

    before = len(conversation(client))
    result = client.post("/api/ledger/reminders", json={"min_days": 30}).json()
    assert result["skipped_opted_out"] == 1
    assert len(conversation(client)) == before


def test_stop_works_in_arabic_and_ignores_punctuation(client):
    assert "لن تصلك" in say(client, AHMED_PHONE, "إيقاف.")[-1]["body"]
    assert ahmed(client)["opted_out"] is True


def test_stop_inside_a_sentence_does_not_unsubscribe(client):
    say(client, AHMED_PHONE, "please stop by the shop tomorrow")
    assert ahmed(client)["opted_out"] is False


def test_start_turns_notices_back_on(client):
    say(client, AHMED_PHONE, "stop")
    assert "again" in say(client, AHMED_PHONE, "start")[-1]["body"]
    assert ahmed(client)["opted_out"] is False
    assert client.post("/api/ledger/reminders", json={"min_days": 30}).json()["sent"] >= 1
    assert conversation(client)[-1]["kind"] == "template"


def test_the_outbound_layer_blocks_a_template_to_someone_who_said_stop(client):
    """The backstop: even if a module forgets to check, nothing goes out."""
    say(client, AHMED_PHONE, "stop")
    switch = next(
        p for p in client.get(f"/api/store/{DEMO_SLUG}").json()["products"]
        if p["name"].startswith("Switch")
    )
    order = client.post(
        f"/api/store/{DEMO_SLUG}/orders",
        json={"contact_id": ahmed(client)["id"], "payment": "link",
              "items": [{"product_id": switch["id"], "quantity": 1}]},
    )
    assert order.status_code == 200
    last = conversation(client)[-1]
    assert (last["status"], last["error"]) == ("blocked", "opted_out")
    assert client.get("/api/jobs/failed").json()["jobs"] == []


def test_every_consent_change_is_logged_with_its_source_and_wording(client):
    say(client, AHMED_PHONE, "Stop!")
    say(client, AHMED_PHONE, "start")
    log = client.get(f"/api/ledger/customers/{ahmed(client)['id']}/entries").json()["consent"]
    assert [(c["purpose"], c["status"], c["source"]) for c in log] == [
        ("service", "granted", "merchant_record"),
        ("service", "revoked", "customer_message"),
        ("marketing", "revoked", "customer_message"),
        ("service", "granted", "customer_message"),
    ]
    assert log[1]["wording"] == "Stop!"


def test_first_message_from_a_new_customer_is_recorded_as_service_consent(client):
    say(client, "97455566666", "hello")
    people = client.get("/api/ledger/summary").json()["customers"]
    stranger = next(c for c in people if c["phone"] == "97455566666")
    log = client.get(f"/api/ledger/customers/{stranger['id']}/entries").json()["consent"]
    assert [(c["purpose"], c["status"], c["source"]) for c in log] == [
        ("service", "granted", "customer_initiated")
    ]


def test_free_text_is_only_allowed_inside_24_hours_of_their_last_message(client):
    customer = ahmed(client)
    never_wrote = send_directly(client, customer["id"], body="Are you there?")
    assert never_wrote.blocked == "window_closed"

    say(client, AHMED_PHONE, "hello")
    assert send_directly(client, customer["id"], body="Yes, how can we help?").blocked is None

    owner_sql(
        "update contacts set last_inbound_at = now() - interval '25 hours' where id = $1",
        UUID(customer["id"]),
    )
    assert send_directly(client, customer["id"], body="Still there?").blocked == "window_closed"


def test_a_utility_template_can_go_out_after_the_window_has_closed(client):
    result = send_directly(
        client, ahmed(client)["id"], kind="template", body="Your order is ready.",
        template_name="order_ready", template_category="utility",
    )
    assert result.blocked is None


def test_a_template_is_blocked_when_the_customer_never_agreed(client):
    rows = owner_sql(
        "insert into contacts (tenant_id, phone, name) values ($1, '97455512345', 'Imported') "
        "returning id",
        DEMO_TENANT_ID,
    )
    result = send_directly(
        client, str(rows[0]["id"]), kind="template", body="Reminder",
        template_name="payment_reminder", template_category="utility",
    )
    assert result.blocked == "no_consent"


def test_marketing_needs_its_own_agreement(client):
    result = send_directly(
        client, ahmed(client)["id"], kind="template", body="New stock has arrived.",
        template_name="new_stock", template_category="marketing",
    )
    assert result.blocked == "no_marketing_consent"


def test_the_app_cannot_rewrite_the_consent_log(client):
    async def tamper():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await conn.execute("update consents set status = 'granted'")

    try:
        client.portal.call(tamper)
    except asyncpg.InsufficientPrivilegeError:
        return
    raise AssertionError("the app role was able to change consent history")


def test_payment_confirmation_still_arrives_days_after_the_last_message(client):
    import re

    link = say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", link).groups()
    owner_sql(
        "update contacts set last_inbound_at = now() - interval '3 days' where phone = $1",
        AHMED_PHONE,
    )
    client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")
    last = conversation(client)[-1]
    assert "Received QAR 1,850" in last["body"]
    assert (last["kind"], last["status"]) == ("template", "sent")
