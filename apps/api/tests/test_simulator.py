"""Demo 1, step by step, through the same code a real WhatsApp message takes."""

import re

from alyr.seed import AHMED_PHONE, STAFF_PHONE


def say(client, phone, text="", reply_id=""):
    response = client.post(
        "/sim/messages", json={"from_number": phone, "text": text, "reply_id": reply_id}
    )
    assert response.status_code == 200
    return response.json()["messages"]


def ahmed(client):
    customers = client.get("/api/ledger/summary").json()["customers"]
    return next(c for c in customers if c["phone"] == AHMED_PHONE)


def test_demo_shop_starts_in_a_known_state(client):
    summary = client.get("/api/ledger/summary").json()
    assert summary["shop"]["name"] == "Al Noor Electricals"
    assert len(summary["customers"]) == 25
    assert ahmed(client)["balance_text"] == "QAR 1,850"
    assert ahmed(client)["oldest_days"] == 41
    assert summary["outstanding"] == sum(summary["buckets"].values())


def test_step_1_staff_records_a_credit_sale_by_message(client):
    reply = say(client, STAFF_PHONE, "Ahmed 450 credit")[-1]
    assert "Ahmed Al-Kuwari" in reply["body"]
    assert "QAR 2,300" in reply["body"]
    assert ahmed(client)["balance_text"] == "QAR 2,300"


def test_staff_can_record_a_payment_with_arabic_digits(client):
    reply = say(client, STAFF_PHONE, "Ahmed paid ٢٠٠")[-1]
    assert "payment of QAR 200" in reply["body"]
    assert ahmed(client)["balance_text"] == "QAR 1,650"


def test_staff_get_help_when_the_message_is_not_understood(client):
    assert "Ahmed 450 credit" in say(client, STAFF_PHONE, "hello")[-1]["body"]
    assert "No customer matches" in say(client, STAFF_PHONE, "Nobody 100 credit")[-1]["body"]
    assert ahmed(client)["balance_text"] == "QAR 1,850"


def test_step_2_customer_asks_for_balance_in_arabic_and_is_answered_in_arabic(client):
    reply = say(client, AHMED_PHONE, "كم حسابي؟")[-1]
    assert "رصيدك الحالي: QAR 1,850" in reply["body"]
    assert reply["payload"]["choices"] == [{"id": "pay", "title": "ادفع الآن"}]


def test_customer_gets_a_menu_for_anything_else(client):
    reply = say(client, AHMED_PHONE, "hello")[-1]
    assert reply["kind"] == "buttons"
    assert [c["id"] for c in reply["payload"]["choices"]] == ["balance", "pay", "human"]


def test_a_customer_only_ever_sees_their_own_balance(client):
    stranger = say(client, "97455599999", "balance")[-1]
    assert "QAR 0" in stranger["body"]


def test_steps_4_and_5_reminder_then_payment_clears_the_balance(client):
    sent = client.post("/api/ledger/reminders", json={"min_days": 30}).json()["sent"]
    assert sent >= 1

    reminder = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert reminder["kind"] == "template"
    assert reminder["payload"] == {"template": "payment_reminder", "category": "utility"}
    assert "QAR 1,850" in reminder["body"]

    link = re.search(r"http://web\.test/pay/(\S+)/(\S+)", reminder["body"])
    tenant_id, payment_id = link.groups()
    details = client.get(f"/api/pay/{tenant_id}/{payment_id}").json()
    assert details["amount_text"] == "QAR 1,850"
    assert details["status"] == "pending"

    assert client.post(f"/api/pay/{tenant_id}/{payment_id}/complete").json() == {"status": "paid"}
    confirmation = client.get(f"/sim/conversations/{AHMED_PHONE}").json()["messages"][-1]
    assert "Received QAR 1,850" in confirmation["body"]
    assert ahmed(client)["balance"] == 0


def test_paying_twice_does_not_record_two_payments(client):
    link = say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", link).groups()
    client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")
    client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")
    assert ahmed(client)["balance"] == 0


def test_reminders_skip_customers_whose_debt_is_recent(client):
    everyone = client.post("/api/ledger/reminders", json={"min_days": 0}).json()["sent"]
    client.post("/sim/reset")
    old_only = client.post("/api/ledger/reminders", json={"min_days": 60}).json()["sent"]
    assert 0 < old_only < everyone


def test_reset_puts_the_demo_back(client):
    say(client, STAFF_PHONE, "Ahmed 450 credit")
    client.post("/sim/reset")
    assert ahmed(client)["balance_text"] == "QAR 1,850"
    assert client.get(f"/sim/conversations/{STAFF_PHONE}").json()["messages"] == []
