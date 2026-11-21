"""What happens to a voice note, a photo, a reaction or any other message that is not text (the
first client's audit, T8, D-195). Meta's own payloads in, the real webhook, the real router. A
voice note used to be dropped to nothing, answered with the welcome menu and shown in the inbox as
an empty bubble; now the inbox says what arrived, the customer is told once that a person will
look, and a reaction is not answered at all."""

import pytest

from alyr.channels.meta import parse_webhook
from conftest import NUMBER_ID
from test_consent import owner_sql
from test_jobs import FlakyChannel, meta_conversation, use
from test_not_sent import PHONE, customer_id
from test_whatsapp_webhook import signed_post

SEEN = "wamid.media."


def meta_message(message_id: str, kind: str, body: dict | None = None, **extra) -> dict:
    """One incoming message as Meta's webhook sends it (the messages webhook reference)."""
    message = {"id": message_id, "from": PHONE, "timestamp": "1790000000", "type": kind}
    if body is not None:
        message[kind] = body
    return {"entry": [{"changes": [{"value": {
        "metadata": {"phone_number_id": NUMBER_ID}, "messages": [message | extra]}}]}]}


VOICE = {"id": "media-voice-1", "mime_type": "audio/ogg; codecs=opus", "voice": True}
PHOTO = {"id": "media-photo-1", "mime_type": "image/jpeg", "caption": "like this, please"}


def replies(client):
    return [m for m in meta_conversation(client) if m["direction"] == "out"]


@pytest.fixture
def shop(client):
    use(client, FlakyChannel())
    return client


def thread(client):
    return client.get(f"/api/inbox/conversations/{customer_id()}").json()


def actions():
    return [r["action"] for r in owner_sql(
        "select action from activity where subject = 'conversation' and subject_id = $1 "
        "order by created_at", customer_id())]


# ── what the parser keeps ───────────────────────────────────────────────────────────────


def parsed(kind, body=None, **extra):
    [one] = parse_webhook(meta_message(SEEN + kind, kind, body, **extra))
    return one


def test_a_voice_note_is_kept_as_a_voice_note_with_its_file_id():
    one = parsed("audio", VOICE)
    assert (one.kind, one.media_id, one.mime_type) == (
        "voice", "media-voice-1", "audio/ogg; codecs=opus")


def test_audio_that_is_not_a_voice_note_stays_audio():
    one = parsed("audio", {"id": "media-song", "mime_type": "audio/mpeg"})
    assert (one.kind, one.media_id) == ("audio", "media-song")


def test_every_file_kind_keeps_its_caption_and_file_id():
    assert (parsed("image", PHOTO).text, parsed("image", PHOTO).media_id) == (
        "like this, please", "media-photo-1")
    video = parsed("video", {"id": "v1", "mime_type": "video/mp4", "caption": "my nails"})
    assert (video.kind, video.text, video.media_id) == ("video", "my nails", "v1")
    document = parsed("document", {"id": "d1", "mime_type": "application/pdf",
                                   "caption": "the design", "filename": "design.pdf"})
    assert (document.kind, document.text, document.media_id) == ("document", "the design", "d1")
    sticker = parsed("sticker", {"id": "s1", "mime_type": "image/webp"})
    assert (sticker.kind, sticker.text, sticker.media_id) == ("sticker", "", "s1")


def test_a_reaction_keeps_its_emoji_and_asks_nothing():
    one = parsed("reaction", {"message_id": "wamid.out.1", "emoji": "❤️"})
    assert (one.kind, one.text, one.reply_id, one.media_id) == ("reaction", "❤️", "", "")


def test_a_place_a_contact_card_and_an_unsupported_message_are_kept_as_what_they_are():
    for kind in ("location", "contacts", "unsupported"):
        assert parsed(kind, [] if kind == "contacts" else {}).kind == kind


# ── what the shop does with it ──────────────────────────────────────────────────────────


def test_a_voice_note_is_acknowledged_once_labelled_and_left_to_a_person(shop):
    assert signed_post(shop, meta_message(SEEN + "1", "audio", VOICE)).status_code == 200
    [reply] = replies(shop)
    assert reply["body"].startswith("Thank you, we received it. A person from ")
    assert "Welcome" not in reply["body"] and reply["kind"] != "buttons"
    heard = [m for m in thread(shop)["messages"] if m["direction"] == "in"]
    assert [(m["kind"], m["body"]) for m in heard] == [("voice", "")]
    assert actions() == ["asked_person"]
    assert owner_sql("select inbox_status from contacts where id = $1", customer_id())[0][
        "inbox_status"] == "open"


def test_a_second_voice_note_a_minute_later_is_not_acknowledged_again(shop):
    signed_post(shop, meta_message(SEEN + "2a", "audio", VOICE))
    signed_post(shop, meta_message(SEEN + "2b", "audio", VOICE | {"id": "media-voice-2"}))
    signed_post(shop, meta_message(SEEN + "2c", "image", PHOTO))
    assert len(replies(shop)) == 1
    assert actions() == ["asked_person"]
    assert [m["kind"] for m in thread(shop)["messages"] if m["direction"] == "in"] == [
        "voice", "voice", "image"]


def test_after_ten_minutes_the_customer_is_told_again(shop):
    signed_post(shop, meta_message(SEEN + "3a", "audio", VOICE))
    owner_sql("update activity set created_at = now() - interval '11 minutes' "
              "where subject = 'conversation' and action = 'asked_person'")
    signed_post(shop, meta_message(SEEN + "3b", "audio", VOICE))
    assert len(replies(shop)) == 2


def test_a_photo_with_a_caption_that_says_book_is_still_left_to_a_person(shop):
    signed_post(shop, meta_message(
        SEEN + "4", "image", {"id": "p", "mime_type": "image/jpeg", "caption": "can I book?"}))
    [reply] = replies(shop)
    assert "http" not in reply["body"]  # no booking link: a person reads the photo first
    assert actions() == ["asked_person"]


def test_an_arabic_speaker_is_answered_in_arabic(shop):
    signed_post(shop, meta_message(SEEN + "5a", "text", {"body": "مرحبا"}))
    owner_sql("update contacts set lang = 'ar' where id = $1", customer_id())
    before = len(replies(shop))
    signed_post(shop, meta_message(SEEN + "5b", "audio", VOICE))
    [reply] = replies(shop)[before:]
    assert "استلمنا" in reply["body"] and reply["body"].startswith("‏")


def test_a_reaction_is_stored_and_shown_but_never_answered(shop):
    signed_post(shop, meta_message(SEEN + "6", "reaction",
                                   {"message_id": "wamid.x", "emoji": "\U0001f44d"}))
    assert replies(shop) == []
    heard = [m for m in thread(shop)["messages"] if m["direction"] == "in"]
    assert [(m["kind"], m["body"]) for m in heard] == [("reaction", "\U0001f44d")]
    assert actions() == []


def test_a_reaction_after_our_message_does_not_bring_back_the_welcome_menu(shop):
    signed_post(shop, meta_message(SEEN + "7a", "text", {"body": "hello"}))
    before = len(replies(shop))
    signed_post(shop, meta_message(SEEN + "7b", "reaction", {"emoji": "❤️"}))
    assert len(replies(shop)) == before


def test_a_person_who_is_already_talking_to_the_customer_is_not_interrupted(shop):
    signed_post(shop, meta_message(SEEN + "8a", "text", {"body": "hello"}))
    answer = shop.post(f"/api/inbox/conversations/{customer_id()}/reply",
                       json={"text": "Hello, one moment"})
    assert answer.status_code == 200
    before = len(replies(shop))
    signed_post(shop, meta_message(SEEN + "8b", "audio", VOICE))
    assert len(replies(shop)) == before  # the person has it; the voice note is in the inbox


def test_the_inbox_list_says_what_arrived_in_the_last_message(shop):
    signed_post(shop, meta_message(SEEN + "9a", "audio", VOICE))  # answered once
    signed_post(shop, meta_message(SEEN + "9b", "audio", VOICE))  # not answered: it is the last
    listing = shop.get("/api/inbox/conversations").json()
    row = next(c for c in listing["conversations"] if c["id"] == str(customer_id()))
    assert (row["last"]["kind"], row["last"]["body"]) == ("voice", "")
    assert meta_conversation(shop)  # the simulator view still reads it
