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
    assert reminder["payload"]["template"] == "payment_reminder"
    assert reminder["payload"]["category"] == "utility"
    assert [c["id"] for c in reminder["payload"]["choices"]] == ["pay", "promise"]
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


# Added after reviewing ledger and collections products (OkCredit, Khatabook, Chaser, Adfin).


def conversation(client, phone):
    return client.get(f"/sim/conversations/{phone}").json()["messages"]


def test_customer_is_told_about_every_entry_staff_record(client):
    say(client, STAFF_PHONE, "Ahmed 450 credit")
    notice = conversation(client, AHMED_PHONE)[-1]
    assert notice["kind"] == "template"
    assert notice["payload"]["template"] == "entry_recorded"
    assert "credit purchase of QAR 450" in notice["body"]
    assert "QAR 2,300" in notice["body"]


def test_staff_are_warned_when_a_sale_goes_over_the_credit_limit(client):
    fine = say(client, STAFF_PHONE, "Ahmed 450 credit")[-1]["body"]
    over = say(client, STAFF_PHONE, "Ahmed 3000 credit")[-1]["body"]
    assert "Warning" not in fine
    assert "over their credit limit of QAR 5,000" in over


def test_customer_can_pay_part_of_the_balance(client):
    link = say(client, AHMED_PHONE, "pay 500")[-1]["body"]
    assert "To pay QAR 500" in link
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", link).groups()
    client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")
    assert ahmed(client)["balance_text"] == "QAR 1,350"


def test_part_payment_is_capped_at_what_is_owed(client):
    assert "To pay QAR 1,850" in say(client, AHMED_PHONE, "pay 99999")[-1]["body"]


def test_a_promise_to_pay_pauses_reminders(client):
    client.post("/api/ledger/reminders", json={"min_days": 30})
    reply = say(client, AHMED_PHONE, "I'll pay within a week", reply_id="promise")[-1]
    assert "No reminders will be sent until then" in reply["body"]
    assert ahmed(client)["promised_until"] is not None

    before = len(conversation(client, AHMED_PHONE))
    again = client.post("/api/ledger/reminders", json={"min_days": 30}).json()
    assert again["skipped_promised"] == 1
    assert len(conversation(client, AHMED_PHONE)) == before


def test_pressing_the_button_twice_does_not_remind_twice(client):
    first = client.post("/api/ledger/reminders", json={"min_days": 30}).json()
    second = client.post("/api/ledger/reminders", json={"min_days": 30}).json()
    assert first["sent"] > 0
    assert second == {"sent": 0, "skipped_promised": 0, "skipped_recent": first["sent"]}


def test_reminder_tone_follows_the_age_of_the_debt(client):
    client.post("/api/ledger/reminders", json={"min_days": 0})
    summary = client.get("/api/ledger/summary").json()["customers"]
    oldest = max(summary, key=lambda c: c["oldest_days"])
    assert oldest["oldest_days"] >= 90
    assert "Final notice" in conversation(client, oldest["phone"])[-1]["body"]
    assert "friendly reminder" in conversation(client, AHMED_PHONE)[-1]["body"]


def test_money_collected_through_links_is_counted(client):
    assert client.get("/api/ledger/summary").json()["collected_by_link"] == 0
    link = say(client, AHMED_PHONE, "pay 500")[-1]["body"]
    tenant_id, payment_id = re.search(r"/pay/(\S+)/(\S+)", link).groups()
    client.post(f"/api/pay/{tenant_id}/{payment_id}/complete")
    summary = client.get("/api/ledger/summary").json()
    assert summary["collected_by_link_text"] == "QAR 500"
    assert summary["payments_by_link"] == 1
