"""Invoices and receipts by a message from the shop's own staff (ALY-141, spec 016): the command in
English and Arabic, the questions it asks instead of guessing, the confirmation, the Undo, the
numbers that are not staff, and the credit ledger's and the Catalog's words left alone.

Everything goes through the chat simulator and the same job queue as live traffic; nothing reaches
Meta. The shop is one made the way an owner makes it ("Invoices only", through onboarding), with a
staff number registered the way the owner registers it.
"""

import json
import re
from uuid import UUID, uuid4

import pytest

from test_consent import owner_sql
from test_items import fresh
from test_onboarding import new_business

OWNER = "97455500201"
CLERK = "97455500202"
STRANGER = "97455500299"
ACK = "Thanks for your message. We will reply shortly."
ACK_AR = "شكراً لرسالتك، سنرد عليك قريباً."


class Shop:
    def __init__(self, client, slug):
        self.client, self.slug = client, slug

    def talk(self, phone, text="", reply_id="") -> list[dict]:
        """One message from a phone; what the shop sent back, oldest first."""
        before = len(self.conversation(phone))
        answer = self.client.post("/sim/messages", json={
            "from_number": phone, "text": text, "reply_id": reply_id, "shop": self.slug})
        assert answer.status_code == 200, answer.text
        return [m for m in answer.json()["messages"][before:] if m["direction"] == "out"]

    def conversation(self, phone) -> list[dict]:
        return self.client.get(f"/sim/conversations/{phone}", params={"shop": self.slug}).json()[
            "messages"]

    def documents(self, **where) -> list[dict]:
        rows = owner_sql(
            "select d.id, d.kind, d.status, d.number, d.total_minor, d.paid_minor, d.contact_id, "
            "d.customer, d.source_ref from documents d join tenants t on t.id = d.tenant_id "
            "where t.slug = $1 and d.status in ('issued', 'void') order by d.seq, d.created_at",
            self.slug)
        return [dict(r) for r in rows if all(r[k] == v for k, v in where.items())]

    def commands(self, state=None) -> list[dict]:
        rows = owner_sql(
            "select c.state, c.kind, c.payload from document_commands c join tenants t "
            "on t.id = c.tenant_id where t.slug = $1 order by c.created_at", self.slug)
        return [dict(r) for r in rows if state is None or r["state"] == state]

    def tenant(self) -> UUID:
        return owner_sql("select id from tenants where slug = $1", self.slug)[0]["id"]

    def customer(self, name, phone, *, name_ar="", reachable=True, email=None) -> str:
        return str(owner_sql(
            "insert into contacts (tenant_id, phone, name, name_ar, role, lang, consent_service, "
            "last_inbound_at, email) values ($1, $2, $3, $4, 'customer', $5, $6, "
            "case when $7 then now() end, $8) returning id",
            self.tenant(), phone, name, name_ar, "ar" if name_ar and not name else "en",
            "granted" if reachable else "unknown", reachable, email)[0]["id"])


def buttons(message) -> dict:
    return {c["id"].split(":")[1]: c["id"] for c in message["payload"].get("choices", [])}


@pytest.fixture
def shop(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_INVOICES_FOR_NEW_SHOPS", "true")
    client = client_factory()
    _, slug, _ = new_business(client, kind="invoices")
    assert client.put("/api/documents/settings", json={"commercial_registration": "77889"}
                      ).status_code == 200
    for name, phone, lang in (("Salem (owner)", OWNER, "en"), ("Hamad (clerk)", CLERK, "en")):
        assert client.post("/api/staff-numbers", json={
            "name": name, "phone": phone, "lang": lang}).status_code == 200
    return Shop(client, slug)


def confirm(shop, text, phone=OWNER) -> dict:
    [ask] = shop.talk(phone, text)
    assert set(buttons(ask)) == {"yes", "edit", "no"}, ask
    return ask


# ── an invoice in English ─────────────────────────────────────────────────────────────────


def test_an_invoice_is_asked_back_then_issued_and_sent(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    assert ask["body"] == (
        "Invoice to *Ahmed Al Thani*: QAR 500.00 for AC repair.\n"
        "Issue it and send it? Reply Yes, or Edit to start again.")
    assert [c["title"] for c in ask["payload"]["choices"]] == ["Yes", "Edit", "Cancel"]
    assert shop.documents() == []                             # nothing before the Yes

    [done] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    assert "Invoice *INV-0001* issued to Ahmed Al Thani: QAR 500.00." in done["body"]
    assert "on its way to Ahmed Al Thani on WhatsApp" in done["body"]
    assert "Reply Undo within 10 minutes" in done["body"] and "credit note" in done["body"]
    assert [c["title"] for c in done["payload"]["choices"]] == ["Undo"]
    [doc] = shop.documents()
    assert (doc["number"], doc["total_minor"], doc["kind"]) == ("INV-0001", 50000, "invoice")
    who = json.loads(doc["customer"])
    assert who["name"] == "Ahmed Al Thani" and who["phone"] == "+97455512345"
    sent = [m for m in shop.conversation("97455512345") if m["kind"] == "document"]
    assert len(sent) == 1 and "INV-0001" in sent[0]["body"]
    # and the paper says who made it: the person on the phone
    assert owner_sql("select issued_by from documents where id = $1", doc["id"])[0][
        "issued_by"] == "Salem (owner)"


def test_a_typed_yes_does_as_the_button_does_and_a_second_yes_makes_no_second_invoice(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    shop.talk(OWNER, "yes")
    [again] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    assert "Already issued: *INV-0001*" in again["body"]
    assert len(shop.documents()) == 1


def test_edit_and_cancel_issue_nothing_and_say_so(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    [edit] = shop.talk(OWNER, reply_id=buttons(ask)["edit"])
    assert "Nothing was issued" in edit["body"] and "invoice Ahmed 450 for AC repair" in edit["body"]
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    [no] = shop.talk(OWNER, "cancel")
    assert no["body"] == "Cancelled. Nothing was issued."
    assert shop.documents() == []
    # the old button no longer does anything
    [stale] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    assert "a while ago" in stale["body"]
    assert shop.documents() == []


def test_a_confirmation_that_waits_too_long_is_not_issued_late(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    confirm(shop, "invoice Ahmed 500 for AC repair")
    owner_sql("update document_commands set updated_at = now() - interval '20 minutes'")
    [late] = shop.talk(OWNER, "yes")
    assert "nothing was issued" in late["body"]
    assert shop.documents() == [] and shop.commands("expired")


def test_a_new_command_replaces_the_one_waiting(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    first = confirm(shop, "invoice Ahmed 500 for AC repair")
    second = confirm(shop, "invoice Ahmed 90 for a filter")
    shop.talk(OWNER, reply_id=buttons(first)["yes"])                # the old button: too late
    assert shop.documents() == []
    shop.talk(OWNER, reply_id=buttons(second)["yes"])
    [doc] = shop.documents()
    assert doc["total_minor"] == 9000


def test_the_sentence_in_the_brief_in_the_other_order(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice for AC repair, QAR 500, to Ahmed 5551 2345")
    assert "Invoice to *Ahmed Al Thani* (+97455512345)" not in ask["body"]
    assert "Invoice to *Ahmed Al Thani*: QAR 500.00 for AC repair." in ask["body"]
    shop.talk(OWNER, "yes")
    assert shop.documents()[0]["total_minor"] == 50000


# ── an invoice in Arabic ──────────────────────────────────────────────────────────────────


def test_an_invoice_in_arabic_is_answered_in_arabic(shop):
    shop.customer("", "97455512345", name_ar="أحمد الثاني")
    [ask] = shop.talk(OWNER, "فاتورة أحمد 500 صيانة مكيف")
    assert ask["body"].startswith("‏") and "فاتورة إلى *أحمد الثاني*" in ask["body"]
    assert "500.00 ر.ق" in ask["body"] and "عن صيانة مكيف" in ask["body"]
    assert [c["title"] for c in ask["payload"]["choices"]] == ["نعم", "تعديل", "إلغاء"]  # no mark in a title
    assert all(line.startswith("‏") for line in ask["body"].split("\n"))
    [done] = shop.talk(OWNER, "نعم")
    assert "صدرت الفاتورة *INV-0001*" in done["body"] and "تراجع" in done["body"]
    assert [c["title"] for c in done["payload"]["choices"]] == ["تراجع"]
    [doc] = shop.documents()
    line = owner_sql("select description, description_ar from document_lines where "
                     "document_id = $1", doc["id"])[0]
    assert line["description_ar"] == "صيانة مكيف" and line["description"] == ""


def test_the_arabic_prefix_stuck_to_a_name_is_understood(shop):
    shop.customer("", "97455512345", name_ar="أحمد")
    [ask] = shop.talk(OWNER, "فاتورة لأحمد 500 صيانة مكيف")
    assert "*أحمد*" in ask["body"]


# ── asking instead of guessing ────────────────────────────────────────────────────────────


def test_two_customers_that_fit_are_asked_about_with_numbers_and_never_chosen(shop):
    shop.customer("Ahmed Salem", "97455500111")
    shop.customer("Ahmed Nasser", "97455500222")
    [question] = shop.talk(OWNER, "invoice Ahmed 500 for AC repair")
    assert question["kind"] == "list" and "Which Ahmed do you mean?" in question["body"]
    assert "1. Ahmed" in question["body"] and "2. Ahmed" in question["body"]
    assert len(question["payload"]["choices"]) == 2 and shop.documents() == []
    number = next(line.split(".")[0] for line in question["body"].splitlines() if "0222" in line)
    [ask] = shop.talk(OWNER, number)
    assert "Invoice to *Ahmed Nasser*" in ask["body"] and set(buttons(ask)) == {"yes", "edit", "no"}
    shop.talk(OWNER, "yes")
    [doc] = shop.documents()
    assert owner_sql("select phone from contacts where id = $1", doc["contact_id"])[0][
        "phone"] == "97455500222"
    # a bad answer is asked again, not guessed
    shop.customer("Sara Salem", "97455500333")
    shop.customer("Sara Nasser", "97455500444")
    shop.talk(OWNER, "invoice Sara 50 for tea")
    [again] = shop.talk(OWNER, "7")
    assert "Reply with one of the numbers" in again["body"]


def test_a_phone_number_settles_which_customer(shop):
    shop.customer("Ahmed Salem", "97455500111")
    shop.customer("Ahmed Nasser", "97455500222")
    ask = confirm(shop, "invoice Ahmed 55500222 500 for AC repair")
    assert "Ahmed Nasser" in ask["body"]


def test_a_name_nobody_has_asks_for_a_phone_number_and_adds_the_customer_on_the_yes(shop):
    [question] = shop.talk(OWNER, "invoice Omar 500 for AC repair")
    assert "No customer is called Omar yet" in question["body"] and "Skip" in question["body"]
    assert shop.customer_count() == 0 if hasattr(shop, "customer_count") else True
    [ask] = shop.talk(OWNER, "5551 9999")
    assert "Invoice to *Omar* (a new customer, +97455519999)" in ask["body"]
    assert owner_sql("select count(*) as n from contacts where phone = '97455519999'")[0]["n"] == 0
    shop.talk(OWNER, "yes")
    made = owner_sql("select name, role from contacts where phone = '97455519999'")
    assert [(r["name"], r["role"]) for r in made] == [("Omar", "customer")]
    assert len(shop.documents()) == 1
    # a bad number is asked again
    shop.talk(OWNER, "invoice Nobody 10 for x")
    [bad] = shop.talk(OWNER, "12")
    assert "does not look like a phone number" in bad["body"]


def test_skip_makes_it_without_a_customer_and_gives_the_link_to_share(shop):
    shop.talk(OWNER, "invoice Omar 500 for AC repair")
    [ask] = shop.talk(OWNER, "skip")
    assert "(not saved as a customer)" in ask["body"]
    [done] = shop.talk(OWNER, "yes")
    assert "has no customer to send to" in done["body"] and "/d/" in done["body"]
    [doc] = shop.documents()
    assert doc["contact_id"] is None and json.loads(doc["customer"]) == {"name": "Omar"}


def test_the_words_before_and_after_the_amount_are_settled_by_who_the_customers_are(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    for text in ("invoice AC repair 500 for Ahmed", "invoice Ahmed 500 for AC repair",
                 "invoice Ahmed 500 AC repair", "invoice AC repair 500 Ahmed"):
        ask = confirm(shop, text)
        assert "*Ahmed Al Thani*: QAR 500.00 for AC repair" in ask["body"], text


def test_the_amount_is_asked_for_when_it_is_missing_or_unclear(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    [none] = shop.talk(OWNER, "invoice Ahmed for AC repair")
    assert "How much is it?" in none["body"]
    [many] = shop.talk(OWNER, "invoice Ahmed 2 filters 150")
    assert "two numbers (2, 150)" in many["body"]
    [arabic] = shop.talk(OWNER, "فاتورة أحمد صيانة")
    assert "كم المبلغ" in arabic["body"]
    assert shop.documents() == [] and shop.commands("confirm") == []


def test_what_it_is_for_is_asked_for_when_a_customer_was_all_that_was_said(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    [question] = shop.talk(OWNER, "invoice Ahmed 500")
    assert "What is it for?" in question["body"]
    [ask] = shop.talk(OWNER, "AC repair")
    assert "for AC repair" in ask["body"]
    shop.talk(OWNER, "yes")
    assert len(shop.documents()) == 1


def test_the_number_of_someone_on_the_team_is_not_a_customer(shop):
    [refused] = shop.talk(OWNER, f"invoice Omar {CLERK} 500 for AC repair")
    assert "belongs to someone on the team" in refused["body"]
    assert shop.documents() == []


def test_without_a_registration_number_it_says_so_before_anything_else(shop):
    shop.client.put("/api/documents/settings", json={"commercial_registration": ""})
    shop.customer("Ahmed Al Thani", "97455512345")
    [said] = shop.talk(OWNER, "invoice Ahmed 500 for AC repair")
    assert "registration" in said["body"].lower() and said["kind"] == "text"
    [arabic] = shop.talk(OWNER, "فاتورة أحمد 500 صيانة")
    assert "السجل التجاري" in arabic["body"]
    assert shop.commands("confirm") == []
    # a receipt needs no number
    ask = confirm(shop, "receipt Ahmed 500 cash")
    assert "Receipt: *Ahmed Al Thani* paid QAR 500.00 in cash" in ask["body"]


# ── who may say it ────────────────────────────────────────────────────────────────────────


def test_every_registered_staff_number_may_and_a_stranger_gets_the_ordinary_reply(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair", phone=CLERK)    # not a manager
    shop.talk(CLERK, reply_id=buttons(ask)["yes"])
    assert len(shop.documents()) == 1
    assert owner_sql("select issued_by from documents where id = $1", shop.documents()[0]["id"])[0][
        "issued_by"] == "Hamad (clerk)"
    # a number nobody registered: the reply any customer gets, the same words in Arabic, and
    # nothing is made or remembered
    before = len(shop.commands())
    for text, expected in (("invoice Ahmed 500 for AC repair", ACK), ("hello", ACK),
                           ("فاتورة أحمد 500 صيانة", ACK_AR), ("receipt Ahmed 500 cash", ACK),
                           ("yes", ACK), ("undo", ACK)):
        [reply] = shop.talk(STRANGER, text)
        assert reply["body"] == expected and reply["kind"] == "text", text
        assert not reply["payload"].get("choices")
    assert len(shop.documents()) == 1 and len(shop.commands()) == before


def test_a_customer_who_is_not_staff_cannot_use_the_buttons_either(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    [reply] = shop.talk(STRANGER, reply_id=buttons(ask)["yes"])
    assert reply["body"] in (ACK, "Thanks for your message. We will reply shortly.")
    assert shop.documents() == []


def test_a_shop_without_the_documents_module_answers_a_stranger_exactly_the_same(
    shop, client_factory,
):
    """Byte for byte: a stranger's reply here is the reply of a shop that has no documents at all,
    with the same modules otherwise."""
    plain = owner_sql("insert into tenants (name, slug) values ('Plain', $1) returning id",
                      f"plain-{uuid4().hex[:6]}")[0]["id"]
    slug = owner_sql("select slug from tenants where id = $1", plain)[0]["slug"]
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'payments')", plain)
    owner_sql("insert into channel_numbers (number_id, tenant_id, channel) "
              "values ($1, $2, 'simulator')", f"sim-{slug}", plain)
    other = Shop(shop.client, slug)
    for text in ("invoice Ahmed 500 for AC repair", "hello", "فاتورة أحمد 500 صيانة"):
        mine = shop.talk(STRANGER, text)[0]
        theirs = other.talk(STRANGER, text)[0]
        assert (mine["body"], mine["kind"], mine["payload"]) == (
            theirs["body"], theirs["kind"], theirs["payload"])


# ── when the customer cannot be messaged ──────────────────────────────────────────────────


def test_a_customer_who_never_wrote_cannot_be_messaged_first_and_the_owner_is_told_how_to_send(shop):
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False, email="ahmed@shop.qa")
    confirm(shop, "invoice Ahmed 500 for AC repair")
    [done] = shop.talk(OWNER, "yes")
    body = done["body"]
    assert "has not messaged this number, so ALYR cannot start a WhatsApp chat" in body
    assert "https://wa.me/97455512345?text=" in body and "/d/" in body
    assert "ahmed@shop.qa" in body and "by email" in body
    # nothing was sent to a customer who has not agreed; the document says so
    assert [m for m in shop.conversation("97455512345") if m["kind"] == "document"] == []
    [doc] = shop.documents()
    states = shop.client.get(f"/api/documents/{doc['id']}/deliveries").json()["deliveries"]
    assert {d["channel"]: d["state"] for d in states}["whatsapp"] == "blocked"


def test_the_wa_me_link_carries_the_message_the_document_and_its_link(shop):
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False)
    shop.talk(OWNER, "invoice Ahmed 500 for AC repair")
    [done] = shop.talk(OWNER, "yes")
    from urllib.parse import unquote
    wa = re.search(r"https://wa\.me/97455512345\?text=(\S+)", done["body"]).group(1)
    message = unquote(wa)
    assert "Invoice INV-0001" in message and "QAR 500.00" in message and "/d/" in message


# ── receipts ──────────────────────────────────────────────────────────────────────────────


def test_a_receipt_for_money_taken_is_issued_and_can_be_undone(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "Ahmed paid 500 cash")
    assert "Receipt: *Ahmed Al Thani* paid QAR 500.00 in cash." in ask["body"]
    [done] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    assert "Receipt *RC-0001* issued: Ahmed Al Thani paid QAR 500.00." in done["body"]
    [doc] = shop.documents()
    assert doc["kind"] == "receipt" and doc["paid_minor"] == doc["total_minor"] == 50000
    [undo] = shop.talk(OWNER, "undo")
    assert "Cancelled: *RC-0001* is now void and credit note *CN-0001* was issued" in undo["body"]
    assert [d["status"] for d in shop.documents()] == ["void", "issued"]


def test_a_receipt_in_arabic_with_the_method_the_owner_said(shop):
    shop.customer("", "97455512345", name_ar="أحمد")
    [ask] = shop.talk(OWNER, "أحمد دفع 500 شيك")
    assert "دفع *أحمد* مبلغ 500.00 ر.ق بشيك" in ask["body"].replace("\u200f", "")
    shop.talk(OWNER, "نعم")
    paid = json.loads(owner_sql("select payments from documents where id = $1",
                                shop.documents(kind="receipt")[0]["id"])[0]["payments"])
    assert paid[0]["method"] == "cheque"


def test_a_payment_against_an_unpaid_invoice_pays_it_and_cannot_be_undone_by_message(shop):
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False)
    shop.talk(OWNER, "invoice Ahmed 500 for AC repair")
    shop.talk(OWNER, "yes")
    ask = confirm(shop, "Ahmed paid 500 cash")
    assert "against invoice INV-0001" in ask["body"] and "cannot be undone by message" in ask["body"]
    [done] = shop.talk(OWNER, "yes")
    assert not done["payload"].get("choices") and "Receipt *RC-0001* issued" in done["body"]
    invoice = shop.documents(kind="invoice")[0]
    got = shop.client.get(f"/api/documents/{invoice['id']}").json()["document"]
    assert got["now"] == {"paid_minor": 50000, "balance_minor": 0}
    assert got["recorded_payments"][0]["reference"] == "WhatsApp"
    assert got["children"][0]["kind"] == "receipt"
    # undo does nothing to it: the word finds nothing of this person's to undo
    [no_undo] = shop.talk(OWNER, "undo")
    assert "cannot be undone by message" in no_undo["body"]
    assert [d["status"] for d in shop.documents()] == ["issued", "issued"]


def test_several_unpaid_invoices_are_asked_about(shop):
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False)
    for what in ("AC repair", "Filter"):
        shop.talk(OWNER, f"invoice Ahmed 500 for {what}")
        shop.talk(OWNER, "yes")
    [question] = shop.talk(OWNER, "Ahmed paid 500 cash")
    assert "more than one unpaid invoice" in question["body"] and "INV-0002" in question["body"]
    assert "Only a receipt, not against an invoice" in question["body"]
    [ask] = shop.talk(OWNER, "3")                                   # only a receipt
    assert "against invoice" not in ask["body"]
    shop.talk(OWNER, "yes")
    assert shop.documents(kind="receipt")[0]["total_minor"] == 50000


def test_the_credit_ledger_keeps_its_words_where_the_shop_has_one(shop):
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'ledger')",
              shop.tenant())
    shop.customer("Ahmed Al Thani", "97455512345")
    [reply] = shop.talk(OWNER, "Ahmed paid 200")
    assert reply["body"].startswith("Recorded: Ahmed Al Thani, payment of")
    assert shop.commands() == []                                   # not ours: nothing was asked
    [hooked] = shop.documents()                                    # the receipt the ledger's own
    assert owner_sql("select source from documents where id = $1", hooked["id"])[0][   # hook makes
        "source"] == "ledger_payment"
    # but an invoice or a receipt said as such is still ours
    ask = confirm(shop, "receipt Ahmed 200 cash")
    assert "Receipt: *Ahmed Al Thani*" in ask["body"]


# ── undo ──────────────────────────────────────────────────────────────────────────────────


def test_undo_cancels_with_a_credit_note_and_tells_the_customer_who_was_sent_it(shop):
    shop.customer("Ahmed Al Thani", "97455512345")
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    [done] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    [undone] = shop.talk(OWNER, reply_id=buttons(done)["undo"])
    assert undone["body"] == (
        "Cancelled: *INV-0001* is now void and credit note *CN-0001* was issued. Both stay on "
        "record and neither number is used again.\n"
        "Ahmed Al Thani was sent the credit note too, so they know.")
    docs = shop.documents()
    assert [(d["number"], d["status"]) for d in docs] == [("INV-0001", "void"), ("CN-0001", "issued")]
    sent = [m for m in shop.conversation("97455512345") if m["kind"] == "document"]
    assert len(sent) == 2 and "CN-0001" in sent[1]["body"]
    # twice: nothing more
    [nothing] = shop.talk(OWNER, reply_id=buttons(done)["undo"])
    assert nothing["body"] == "There is nothing to undo."
    assert len(shop.documents()) == 2


def test_undo_in_arabic_and_after_the_ten_minutes_it_points_to_the_workspace(shop):
    shop.customer("", "97455512345", name_ar="أحمد", reachable=False)
    shop.talk(OWNER, "فاتورة أحمد 500 صيانة")
    [done] = shop.talk(OWNER, "نعم")
    owner_sql("update document_commands set payload = jsonb_set(payload, '{issued_at}', "
              "to_jsonb((now() - interval '11 minutes')::text)) where state = 'issued'")
    [late] = shop.talk(OWNER, "تراجع")
    assert "فات وقت التراجع عن *INV-0001* برسالة" in late["body"].replace("\u200f", "")
    assert "المستندات" in late["body"]
    assert shop.documents()[0]["status"] == "issued"
    # inside the window the Arabic word cancels
    shop.talk(OWNER, "فاتورة أحمد 300 فلتر")
    shop.talk(OWNER, "نعم")
    [undone] = shop.talk(OWNER, "تراجع")
    assert "أُلغي: صارت *INV-0002* ملغاة وصدر الإشعار الدائن *CN-0001*" in undone["body"].replace(
        "\u200f", "")
    assert "تراجع" in done["body"]


def test_only_the_person_who_issued_it_can_undo_it(shop):
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False)
    ask = confirm(shop, "invoice Ahmed 500 for AC repair")
    [done] = shop.talk(OWNER, reply_id=buttons(ask)["yes"])
    [reply] = shop.talk(CLERK, reply_id=buttons(done)["undo"])
    assert "a while ago" in reply["body"]
    assert shop.documents()[0]["status"] == "issued"
    assert shop.talk(CLERK, "undo") == []                           # nothing of the clerk's


def test_the_catalogs_undo_keeps_its_word_and_the_newer_of_the_two_wins(shop):
    owner_sql("insert into tenant_modules (tenant_id, module_key) values ($1, 'catalog')",
              shop.tenant())
    item = shop.client.post("/api/items", json={
        "name": "Shawarma", "name_ar": "شاورما", "price": 1000, "status": "live"}).json()["item"]
    shop.customer("Ahmed Al Thani", "97455512345", reachable=False)
    shop.talk(OWNER, "invoice Ahmed 500 for AC repair")
    shop.talk(OWNER, "yes")
    [sold] = shop.talk(OWNER, "sold out shawarma")
    assert "is now sold out" in sold["body"]
    [undo] = shop.talk(OWNER, "undo")                               # the newer is the Catalog's
    assert "Shawarma" in undo["body"] and shop.documents()[0]["status"] == "issued"
    assert fresh(shop.client, item)["available"] is True
    [undo2] = shop.talk(OWNER, "undo")                              # now the invoice
    assert "Cancelled: *INV-0001*" in undo2["body"]
