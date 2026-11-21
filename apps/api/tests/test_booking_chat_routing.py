"""What the booking chat makes of a customer's words (the first client's audit, T10): "cancel the
appointment" and "change the appointment" used to be sent a link to make a new booking,
"reschedule" was taken for "schedule", the Arabic plural of appointment matched nothing, "thanks"
and "ok" brought the welcome menu back, and one tap on "Cancel booking" cancelled."""

import pytest

from alyr.modules import pleasantries
from alyr.modules.bookings import intent
from alyr.seed import AHMED_PHONE, DEMO_SLUG
from test_bookings import book, service_id, times
from test_consent import conversation, owner_sql, say

# A message can be several things at once ("cancel my appointment" is also about their own booking
# and names a booking); the chat asks cancel, then change, then mine, then book, so the first that
# is true wins.


def kinds(text: str) -> set[str]:
    tokens = intent.words(text)
    return {name for name, asked in (
        ("cancel", intent.cancel), ("change", intent.change), ("mine", intent.mine),
        ("book", intent.book)) if asked(tokens)}


# ── which words mean what ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,wanted", [
    ("cancel appointment", {"cancel", "book"}),
    ("I need to cancel my appointment please", {"cancel", "mine", "book"}),
    ("Cancel booking", {"cancel", "book"}),
    ("cancel my booking?", {"cancel", "mine", "book"}),
    ("change the appointment", {"change", "book"}),
    ("can I change my booking time", {"change", "mine", "book"}),
    ("move my appointment to Friday", {"change", "mine", "book"}),
    ("reschedule", {"change"}),
    ("Please reschedule my visit", {"change", "mine"}),
    ("my booking", {"mine", "book"}),
    ("my appointments", {"mine", "book"}),
    ("book", {"book"}),
    ("I want to schedule a haircut", {"book"}),
    ("do you have appointments tomorrow", {"book"}),
    ("reserve a table", {"book"}),
    ("Hello", set()),
    ("what is the price", set()),
    # not about a booking
    ("cancel my order", set()),
    ("we went to a movie", set()),
    ("I will change my mind", set()),
    # Arabic: the singular, the plural, and with the article or a pronoun attached
    ("حجز", {"book"}),
    ("أريد موعد", {"book"}),
    ("عندكم مواعيد", {"book"}),
    ("حجزي", {"mine", "book"}),
    ("مواعيدي", {"mine", "book"}),
    ("أريد إلغاء الحجز", {"cancel", "book"}),
    ("ألغي موعدي", {"cancel", "mine", "book"}),
    ("الغاء المواعيد", {"cancel", "book"}),
    ("أبغى أغير الموعد", {"change", "book"}),
    ("تغيير الحجز", {"change", "book"}),
    ("تأجيل الموعد", {"change", "book"}),
])
def test_words_mean_what_the_customer_meant(text, wanted):
    assert kinds(text) == wanted


@pytest.mark.parametrize("text", [
    "thanks", "Thank you!", "thank you so much", "thanks a lot", "ok", "Okay", "okay great",
    "👍", "🙏", "thank you for the appointment", "thanks for the reminder", "thx",
    "شكراً", "شكرا جزيلا", "شكراً لكم", "تمام", "اوكي", "شكرا على الموعد", "يعطيك العافية شكرا",
])
def test_these_close_a_conversation_and_ask_nothing(text):
    assert pleasantries.is_thanks(text)


@pytest.mark.parametrize("text", [
    "", "hello", "book", "ok can I book", "thanks, can I book again?", "no thanks",
    "thanks but I can't come", "ok?", "thank you, how much is it", "ok what time do you open",
    "I want to cancel", "yes", "no", "شكرا هل عندكم موعد", "لا شكرا", "ممكن موعد", "مرحبا",
    "thank you for the appointment, please cancel it",
])
def test_these_ask_or_say_something_so_they_are_not_pleasantries(text):
    assert not pleasantries.is_thanks(text)


# ── what the chat does ──────────────────────────────────────────────────────────────────


def a_booking(client):
    sid = service_id(client)
    return sid, book(client, sid, times(client, sid)[0]).json()


def status_of(booking_id):
    return owner_sql("select status from bookings where id = $1::uuid", booking_id)[0]["status"]


def actions():
    return [r["action"] for r in owner_sql(
        "select action from activity where subject = 'conversation' order by created_at")]


@pytest.mark.parametrize("words", ["cancel appointment", "I'd like to cancel my booking",
                                   "cancel my appointment please"])
def test_cancel_appointment_asks_first_and_never_sends_the_booking_link(client, words):
    _, booking = a_booking(client)
    asked = say(client, AHMED_PHONE, words)[-1]
    assert asked["body"].startswith("Cancel booking 101: Electrician site visit, ")
    assert "/b/" not in asked["body"] and "Pick a service" not in asked["body"]
    yes, keep = asked["payload"]["choices"]
    assert (yes["title"], keep["title"]) == ("Yes, cancel it", "Keep my booking")
    assert status_of(booking["id"]) == "booked"  # asking cancelled nothing
    assert say(client, AHMED_PHONE, reply_id=yes["id"])[-1]["body"] == (
        "Your booking has been cancelled.")
    assert status_of(booking["id"]) == "cancelled"
    # pressing the same button again finds nothing left to cancel
    assert "no active booking" in say(client, AHMED_PHONE, reply_id=yes["id"])[-1]["body"]


def test_keeping_the_booking_leaves_it_alone(client):
    _, booking = a_booking(client)
    asked = say(client, AHMED_PHONE, "cancel appointment")[-1]
    kept = say(client, AHMED_PHONE, reply_id=asked["payload"]["choices"][1]["id"])[-1]
    assert kept["body"].startswith("Your booking 101 stays as it is: Electrician site visit, ")
    assert status_of(booking["id"]) == "booked"


def test_the_cancel_button_on_my_booking_asks_too(client):
    _, booking = a_booking(client)
    card = say(client, AHMED_PHONE, "my booking")[-1]
    asked = say(client, AHMED_PHONE, reply_id=card["payload"]["choices"][0]["id"])[-1]
    assert asked["body"].startswith("Cancel booking 101") and len(asked["payload"]["choices"]) == 2
    assert status_of(booking["id"]) == "booked"


def test_cancelling_with_no_booking_says_so(client):
    assert "no upcoming booking" in say(client, AHMED_PHONE, "cancel appointment")[-1]["body"]
    assert "no upcoming booking" in say(client, AHMED_PHONE, "change the appointment")[-1]["body"]


@pytest.mark.parametrize("words", ["change the appointment", "can I reschedule", "reschedule",
                                   "I want to move my booking"])
def test_changing_a_booking_names_it_asks_a_person_and_sends_no_new_link(client, words):
    _, booking = a_booking(client)
    before = actions()
    reply = say(client, AHMED_PHONE, words)[-1]
    assert reply["body"].startswith("Booking 101: Electrician site visit, ")
    assert "a person from" in reply["body"] and "/b/" not in reply["body"]
    assert [c["title"] for c in reply["payload"]["choices"]] == ["Cancel booking", "Book a visit"]
    assert actions() == before + ["asked_person"]
    assert status_of(booking["id"]) == "booked"


def test_a_second_change_request_in_ten_minutes_does_not_write_the_record_twice(client):
    a_booking(client)
    say(client, AHMED_PHONE, "reschedule")
    say(client, AHMED_PHONE, "change the appointment")
    assert actions().count("asked_person") == 1


def test_the_plural_and_the_singular_both_get_the_booking_link_in_arabic(client):
    for words in ("أريد حجز موعد", "عندكم مواعيد؟", "مواعيد"):
        reply = say(client, AHMED_PHONE, words)[-1]
        assert f"/b/{DEMO_SLUG}?t=" in reply["body"], words
        assert "اختر الخدمة" in reply["body"]


def test_arabic_cancel_and_change_are_answered_in_arabic(client):
    _, booking = a_booking(client)
    changed = say(client, AHMED_PHONE, "أبغى أغير الموعد")[-1]
    assert changed["body"].startswith("الحجز رقم 101: ") and "/b/" not in changed["body"]
    assert [c["title"] for c in changed["payload"]["choices"]] == ["إلغاء الحجز", "احجز موعداً"]
    asked = say(client, AHMED_PHONE, "أريد إلغاء الحجز")[-1]
    assert asked["body"].startswith("هل تريد إلغاء الحجز رقم 101: ")
    assert [c["title"] for c in asked["payload"]["choices"]] == ["نعم، ألغِ الحجز", "أبقِ الحجز"]
    assert say(client, AHMED_PHONE, reply_id=asked["payload"]["choices"][1]["id"])[-1][
        "body"].startswith("حجزك رقم 101 باقٍ كما هو: ")
    assert status_of(booking["id"]) == "booked"
    say(client, AHMED_PHONE, reply_id=asked["payload"]["choices"][0]["id"])
    assert status_of(booking["id"]) == "cancelled"


@pytest.mark.parametrize("words", ["thanks", "Thank you!", "ok", "okay great", "شكراً", "تمام",
                                   "thank you for the appointment"])
def test_thanks_and_ok_get_no_answer_at_all(client, words):
    a_booking(client)
    say(client, AHMED_PHONE, "my booking")  # the shop has just said something
    before = len(conversation(client))
    say(client, AHMED_PHONE, words)
    assert len(conversation(client)) == before + 1  # their own message, and nothing back
    assert conversation(client)[-1]["direction"] == "in"


def test_thanks_that_also_asks_is_answered(client):
    reply = say(client, AHMED_PHONE, "thanks, can I book again?")[-1]
    assert f"/b/{DEMO_SLUG}?t=" in reply["body"]
