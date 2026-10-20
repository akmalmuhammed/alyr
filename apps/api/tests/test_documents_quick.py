"""Reading one line as an invoice or a receipt, in English and Arabic (ALY-141).

The parser touches nothing: these are plain cases. The WhatsApp command and the workspace's
one-line box both read a sentence with it, so what it understands is pinned here, including what
it refuses to guess.
"""

import pytest

from alyr.modules.documents import customers, quick


def read(message, **kw):
    return quick.parse(message, **kw)


@pytest.mark.parametrize(
    ("message", "name", "phone", "amount", "description"),
    [
        # the sentence the brief gives, in the order a person says it
        ("invoice for AC repair, QAR 500, to Ahmed 5551 2345", "Ahmed", "55512345", 50000,
         "AC repair"),
        ("invoice Ahmed 500 for AC repair", "Ahmed", "", 50000, "AC repair"),
        ("Invoice Ahmed 500 for AC repair", "Ahmed", "", 50000, "AC repair"),
        ("invoice to Ahmed 500 for AC repair", "Ahmed", "", 50000, "AC repair"),
        ("invoice AC repair 500 to Ahmed", "Ahmed", "", 50000, "AC repair"),
        ("invoice Ahmed Al Thani QAR 1,250.50 for deep cleaning", "Ahmed Al Thani", "", 125050,
         "deep cleaning"),
        ("invoice Ahmed 5551 2345 500 for AC repair", "Ahmed", "55512345", 50000, "AC repair"),
        ("invoice Ahmed 500 5551 2345 AC repair", "Ahmed", "55512345", 50000, "AC repair"),
        ("invoice Ahmed +974 5551 2345 QR 80 for filter", "Ahmed", "97455512345", 8000, "filter"),
        ("invoice Ahmed 55512345 500 for AC repair", "Ahmed", "55512345", 50000, "AC repair"),
        ("please make an invoice for Ahmed 75 for a key", "Ahmed", "", 7500, "a key"),
        ("bill Sara 12.5 for tea", "Sara", "", 1250, "tea"),
        # the same in Arabic, in the order Arabic is spoken: person, amount, what for
        ("فاتورة أحمد 500 صيانة مكيف", "أحمد", "", 50000, "صيانة مكيف"),
        ("فاتورة أحمد ٥٠٠ ريال صيانة مكيف", "أحمد", "", 50000, "صيانة مكيف"),
        ("فاتورة أحمد 500 ر.ق عن صيانة مكيف", "أحمد", "", 50000, "صيانة مكيف"),
        ("فاتورة عن صيانة مكيف 500 ريال إلى أحمد 5551 2345", "أحمد", "55512345", 50000,
         "صيانة مكيف"),
        ("اصدر فاتورة لسارة 1,200 مقابل تنظيف", "لسارة", "", 120000, "تنظيف"),
    ],
)
def test_an_invoice_in_one_line(message, name, phone, amount, description):
    q = read(message)
    assert q is not None and q.kind == "invoice" and not q.problems, (message, q)
    assert (q.name, q.phone, q.amount_minor, q.description) == (name, phone, amount, description)


@pytest.mark.parametrize(
    ("message", "name", "amount", "method"),
    [
        ("receipt Ahmed 500 cash", "Ahmed", 50000, "cash"),
        ("Ahmed paid 500 cash", "Ahmed", 50000, "cash"),
        ("Ahmed paid QAR 75 by card", "Ahmed", 7500, "card"),
        ("received 200 from Ahmed bank transfer", "Ahmed", 20000, "bank_transfer"),
        ("receipt Ahmed 90 cheque", "Ahmed", 9000, "cheque"),
        ("إيصال أحمد 500 نقدا", "أحمد", 50000, "cash"),
        ("أحمد دفع 500 كاش", "أحمد", 50000, "cash"),
        ("استلمت من أحمد 500 نقدا", "أحمد", 50000, "cash"),
        ("ايصال سارة 40 بطاقة", "سارة", 4000, "card"),
    ],
)
def test_a_receipt_for_money_received(message, name, amount, method):
    q = read(message)
    assert q is not None and q.kind == "receipt" and q.paid and not q.problems, (message, q)
    assert (q.name, q.amount_minor, q.method) == (name, amount, method)


def test_a_receipt_says_what_it_was_for():
    q = read("Ahmed paid 500 cash for AC repair")
    assert (q.name, q.amount_minor, q.method, q.description) == (
        "Ahmed", 50000, "cash", "AC repair")
    q = read("إيصال أحمد 500 نقدا عن صيانة")
    assert (q.name, q.description, q.method) == ("أحمد", "صيانة", "cash")


def test_a_method_word_in_an_invoice_is_part_of_what_it_is_for():
    q = read("invoice Ahmed 500 for cash register repair")
    assert q.description == "cash register repair" and q.method == ""


@pytest.mark.parametrize(
    "message",
    [
        "hello", "Ahmed 450 credit", "sold out shawarma", "undo", "price shawarma 12",
        "مرحبا", "أحمد 450 دين", "نفذ شاورما", "paid", "", "   ",
    ],
)
def test_anything_else_is_not_ours(message):
    assert read(message) is None


def test_a_payment_is_left_to_the_ledger_where_the_shop_has_one():
    assert read("Ahmed paid 200") is not None
    assert read("Ahmed paid 200", allow_paid=False) is None
    assert read("أحمد دفع 200", allow_paid=False) is None
    # but an explicit receipt is always a receipt
    assert read("receipt Ahmed 200 cash", allow_paid=False).kind == "receipt"


def test_no_amount_is_a_question_not_a_guess():
    q = read("invoice Ahmed for AC repair")
    assert q.problems == ["amount"] and q.amount_minor is None and q.name == "Ahmed"
    q = read("فاتورة أحمد صيانة")
    assert q.problems == ["amount"]


def test_two_numbers_and_no_currency_word_is_a_question():
    q = read("invoice Ahmed 2 filters 150")
    assert q.problems == ["amount_many"] and q.numbers == ["2", "150"]
    assert q.amount_minor is None


def test_a_currency_word_settles_which_number_is_the_amount():
    q = read("invoice Ahmed 2 filters 150 QAR")
    assert not q.problems and q.amount_minor == 15000
    q = read("invoice Ahmed 2 filters QAR 150")
    assert not q.problems and q.amount_minor == 15000


@pytest.mark.parametrize(
    ("message", "problem"),
    [
        ("invoice Ahmed 12.345 for x", "amount_decimals"),
        ("invoice Ahmed 0 for x", "amount"),
        ("invoice Ahmed 99999999999 for x", "amount_big"),
    ],
)
def test_an_amount_that_cannot_be_one_is_said_so(message, problem):
    assert problem in read(message).problems


def test_when_the_order_cannot_say_who_is_who_the_caller_is_told():
    both = read("invoice Ahmed 500 AC repair")
    assert (both.name, both.description, both.ambiguous) == ("Ahmed", "AC repair", "swap")
    lone = read("invoice Ahmed 500")
    assert lone.ambiguous == "lone" and lone.lone == "Ahmed" and lone.name == ""
    lone = read("invoice 500 AC repair")
    assert lone.ambiguous == "lone" and lone.lone == "AC repair"
    # "for" does not tell the person from the reason: it is said both ways round.
    for_ = read("invoice Ahmed 500 for AC repair")
    assert (for_.name, for_.description, for_.ambiguous) == ("Ahmed", "AC repair", "swap")
    assert read("invoice AC repair 500 for Ahmed").name == "AC repair"
    # "to" does: the person is after it.
    marked = read("invoice AC repair 500 to Ahmed")
    assert (marked.name, marked.description, marked.ambiguous) == ("Ahmed", "AC repair", "")


def test_the_language_is_the_one_written():
    assert read("invoice Ahmed 500 for AC repair").lang == "en"
    assert read("فاتورة أحمد 500 صيانة").lang == "ar"


def test_a_phone_number_is_found_in_every_way_it_is_written():
    for typed, digits in [
        ("5551 2345", "55512345"), ("55512345", "55512345"), ("5551-2345", "55512345"),
        ("974 5551 2345", "97455512345"), ("+974 5551 2345", "97455512345"),
        ("+97455512345", "97455512345"), ("٥٥٥١ ٢٣٤٥", "55512345"),
    ]:
        q = read(f"invoice Ahmed {typed} 500 for filter")
        assert q.phone == digits and q.amount_minor == 50000, typed


def test_a_year_or_a_quantity_is_not_a_phone_number():
    q = read("invoice Ahmed 1200 for 2 filters QAR")
    assert q.phone == "" and q.amount_minor == 120000 or q.problems


@pytest.mark.parametrize(
    "message",
    [
        "invoice AC repair 500 for Ahmed 5551 2345",
        "invoice Ahmed 5551 2345 500 for AC repair",
        "invoice AC repair 500 Ahmed 55512345",
    ],
)
def test_a_phone_number_beside_a_name_says_who_the_person_is(message):
    q = read(message)
    assert (q.name, q.description, q.ambiguous, q.phone) == (
        "Ahmed", "AC repair", "", "55512345")


def test_a_phone_number_with_no_words_beside_it_settles_nothing():
    q = read("invoice 5551 2345 500 for AC repair")
    assert q.phone == "55512345" and q.name == "" and q.lone == "AC repair"


@pytest.mark.parametrize(
    ("typed", "saved"),
    [
        ("لأحمد", "أحمد"),             # «ل» + Ahmed: to Ahmed
        ("لمحمد علي", "محمد علي"),
        ("ليلى", "ليلى"),              # a name that really begins with ل
        ("لينا الخليفي", "لينا الخليفي"),
        ("Ahmed", "Ahmed"),
        ("للأحمد", "للأحمد"),
    ],
)
def test_a_new_customer_is_saved_without_the_preposition_stuck_to_the_name(typed, saved):
    assert customers.bare_name(typed) == saved


def test_an_arabic_name_with_its_phone_number_is_the_person():
    q = read("فاتورة صيانة مكيف 500 لأحمد 55512345")
    assert (q.name, q.description, q.ambiguous, q.phone) == ("لأحمد", "صيانة مكيف", "", "55512345")
