"""The shared inbox: staff read and answer customer conversations by hand (ALY-28)."""

from uuid import UUID, uuid4

from alyr.seed import AHMED_PHONE, STAFF_PHONE
from test_consent import ahmed, conversation, owner_sql, say


def inbox(client, status="open"):
    return client.get(f"/api/inbox/conversations?status={status}").json()


def reply(client, contact_id, text):
    response = client.post(f"/api/inbox/conversations/{contact_id}/reply", json={"text": text})
    assert response.status_code == 200
    return response.json()


def test_inbox_is_empty_until_a_customer_writes(client):
    assert inbox(client) == {"conversations": [], "unread": 0}


def test_a_customer_message_appears_as_an_unread_conversation(client):
    say(client, AHMED_PHONE, "hello")
    data = inbox(client)
    assert data["unread"] == 1
    row = data["conversations"][0]
    assert (row["name"], row["unread"], row["window_open"]) == ("Ahmed Al-Kuwari", 1, True)
    assert row["window_closes_at"] is not None
    # The newest message is the assistant's answer, not the customer's hello.
    assert row["last"]["direction"] == "out"


def test_staff_chats_do_not_appear_in_the_inbox(client):
    say(client, STAFF_PHONE, "Ahmed 450 credit")
    assert inbox(client)["conversations"] == []


def test_opening_a_conversation_marks_it_read(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    thread = client.get(f"/api/inbox/conversations/{contact_id}").json()
    assert [m["direction"] for m in thread["messages"]] == ["in", "out"]
    assert client.post(f"/api/inbox/conversations/{contact_id}/read").status_code == 200
    assert inbox(client)["unread"] == 0
    say(client, AHMED_PHONE, "are you open today?")
    assert inbox(client)["conversations"][0]["unread"] == 1


def test_a_staff_reply_reaches_the_customer_and_is_attributed(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    assert reply(client, contact_id, "Yes, until 9 pm.")["blocked"] is None
    last = conversation(client)[-1]
    assert (last["body"], last["status"]) == ("Yes, until 9 pm.", "sent")
    thread = client.get(f"/api/inbox/conversations/{contact_id}").json()
    assert thread["messages"][-1]["sent_by"] == "Workspace"
    assert thread["messages"][1]["sent_by"] == ""


def test_once_a_person_answers_the_assistant_stays_quiet(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    reply(client, contact_id, "One moment, checking.")
    before = len(conversation(client))
    say(client, AHMED_PHONE, "ok thanks")
    assert len(conversation(client)) == before + 1  # only the customer's own message
    assert inbox(client)["conversations"][0]["assistant_paused"] is True


def test_a_tapped_button_still_works_while_a_person_is_handling_the_chat(client):
    say(client, AHMED_PHONE, "hello")
    reply(client, ahmed(client)["id"], "One moment.")
    assert "/pay/" in say(client, AHMED_PHONE, reply_id="pay")[-1]["body"]


def test_stop_is_honoured_while_a_person_is_handling_the_chat(client):
    say(client, AHMED_PHONE, "hello")
    reply(client, ahmed(client)["id"], "One moment.")
    assert "will not receive reminders" in say(client, AHMED_PHONE, "stop")[-1]["body"]


def test_closing_hands_the_customer_back_to_the_assistant(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    reply(client, contact_id, "Done, anything else?")
    closed = client.post(
        f"/api/inbox/conversations/{contact_id}/status", json={"status": "closed"}
    )
    assert closed.status_code == 200
    assert inbox(client)["conversations"] == []
    assert len(inbox(client, "closed")["conversations"]) == 1

    # The next message reopens the conversation and the assistant answers again.
    assert say(client, AHMED_PHONE, "hello")[-1]["direction"] == "out"
    row = inbox(client)["conversations"][0]
    assert (row["status"], row["assistant_paused"], row["unread"]) == ("open", False, 1)


def test_the_assistant_can_be_switched_back_on_without_closing(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    reply(client, contact_id, "One moment.")
    client.post(f"/api/inbox/conversations/{contact_id}/assistant", json={"paused": False})
    assert say(client, AHMED_PHONE, "hello")[-1]["direction"] == "out"


def test_a_reply_after_24_hours_is_refused_and_does_not_pause_the_assistant(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    owner_sql(
        "update contacts set last_inbound_at = now() - interval '25 hours' where id = $1",
        UUID(contact_id),
    )
    assert reply(client, contact_id, "Sorry for the delay")["blocked"] == "window_closed"
    row = inbox(client)["conversations"][0]
    assert (row["window_open"], row["window_closes_at"]) == (False, None)
    assert row["assistant_paused"] is False
    assert row["last"]["status"] == "blocked"


def test_bad_requests_are_refused(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    base = "/api/inbox/conversations"
    assert client.post(f"{base}/{contact_id}/reply", json={"text": "   "}).status_code == 422
    assert client.post(f"{base}/{contact_id}/status", json={"status": "x"}).status_code == 422
    assert client.get(f"{base}/{uuid4()}").status_code == 404
    assert client.post(f"{base}/{uuid4()}/reply", json={"text": "hi"}).status_code == 404
    assert client.post(f"{base}/{uuid4()}/read").status_code == 404


def test_another_shop_cannot_see_this_inbox(client):
    say(client, AHMED_PHONE, "hello")
    other = owner_sql(
        "insert into tenants (name) values ('Other shop') returning id"
    )[0]["id"]

    async def look():
        from alyr.modules.inbox import service

        async with client.app.state.db.tenant(other) as conn:
            return await service.conversations(conn, "all")

    assert client.portal.call(look) == []
