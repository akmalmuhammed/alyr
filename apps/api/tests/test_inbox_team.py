"""Inbox, second part: assignment, staff-only notes and saved replies (ALY-28)."""

from uuid import uuid4

import asyncpg

from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL
from test_consent import ahmed, conversation, owner_sql, say
from test_sign_in import other_shop_with_owner, sign_in

BASE = "/api/inbox/conversations"


def user_id(email):
    return str(owner_sql("select id from users where email = $1", email)[0]["id"])


def rows(client, query=""):
    return client.get(f"{BASE}?{query}").json()["conversations"]


def test_a_conversation_can_be_given_to_a_team_member_and_taken_back(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    assert rows(client)[0]["assigned"] is None
    yusuf = user_id(AGENT_EMAIL)
    given = client.post(f"{BASE}/{contact_id}/assign", json={"user_id": yusuf})
    assert given.status_code == 200
    assert rows(client)[0]["assigned"] == {"id": yusuf, "name": "Yusuf Rahman"}
    thread = client.get(f"{BASE}/{contact_id}").json()
    assert thread["customer"]["assigned"]["name"] == "Yusuf Rahman"
    client.post(f"{BASE}/{contact_id}/assign", json={"user_id": None})
    assert rows(client)[0]["assigned"] is None


def test_the_list_can_show_mine_or_unassigned(client):
    say(client, AHMED_PHONE, "hello")
    say(client, "97455500002", "hello")
    contact_id = ahmed(client)["id"]
    me = sign_in(client, AGENT_EMAIL)
    client.post(f"{BASE}/{contact_id}/assign", json={"user_id": me["id"]})
    assert [r["name"] for r in rows(client, "assigned=me")] == ["Ahmed Al-Kuwari"]
    assert [r["name"] for r in rows(client, "assigned=none")] == ["Bilal Contracting"]
    assert len(rows(client, "assigned=any")) == 2


def test_replying_to_an_unassigned_conversation_takes_it(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    me = sign_in(client, AGENT_EMAIL)
    client.post(f"{BASE}/{contact_id}/reply", json={"text": "On it."})
    assert rows(client)[0]["assigned"]["id"] == me["id"]

    # A colleague's later reply does not take it away.
    sign_in(client, OWNER_EMAIL)
    client.post(f"{BASE}/{contact_id}/reply", json={"text": "Also here."})
    assert rows(client)[0]["assigned"]["id"] == me["id"]


def test_a_conversation_cannot_be_given_to_someone_outside_the_shop(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    other_shop_with_owner("nadia@other.example")
    outsider = user_id("nadia@other.example")
    refused = client.post(f"{BASE}/{contact_id}/assign", json={"user_id": outsider})
    assert refused.status_code == 422
    assert client.post(f"{BASE}/{uuid4()}/assign", json={"user_id": None}).status_code == 404


def test_removing_a_team_member_frees_their_conversations(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client)
    sara = client.post(
        "/api/team", json={"email": "sara@alnoor.example", "name": "Sara", "role": "agent"}
    ).json()["id"]
    client.post(f"{BASE}/{contact_id}/assign", json={"user_id": sara})
    assert client.delete(f"/api/team/{sara}").status_code == 200
    assert rows(client)[0]["assigned"] is None


def test_a_note_is_kept_with_its_author_and_never_reaches_the_customer(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    sign_in(client, AGENT_EMAIL)
    before = conversation(client)
    added = client.post(f"{BASE}/{contact_id}/notes", json={"text": "Prefers calls after 5."})
    assert added.status_code == 200
    thread = client.get(f"{BASE}/{contact_id}").json()
    assert [(n["body"], n["author_name"]) for n in thread["notes"]] == [
        ("Prefers calls after 5.", "Yusuf Rahman")
    ]
    # Nothing was added to the conversation the customer sees, and nothing was queued.
    assert conversation(client) == before
    assert all("Prefers calls" not in m["body"] for m in thread["messages"])
    # A note does not pause the assistant or count as a reply.
    assert thread["customer"]["assistant_paused"] is False


def test_notes_cannot_be_edited_or_deleted_by_the_app(client):
    say(client, AHMED_PHONE, "hello")
    client.post(f"{BASE}/{ahmed(client)['id']}/notes", json={"text": "First note"})

    async def tamper():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            await conn.execute("delete from inbox_notes")

    try:
        client.portal.call(tamper)
    except asyncpg.InsufficientPrivilegeError:
        return
    raise AssertionError("the app role was able to delete staff notes")


def test_bad_notes_are_refused(client):
    say(client, AHMED_PHONE, "hello")
    contact_id = ahmed(client)["id"]
    assert client.post(f"{BASE}/{contact_id}/notes", json={"text": "  "}).status_code == 422
    assert client.post(f"{BASE}/{uuid4()}/notes", json={"text": "x"}).status_code == 404


def test_saved_replies_can_be_listed_added_and_deleted(client):
    listed = client.get("/api/inbox/saved-replies").json()["replies"]
    assert "Opening hours" in [r["title"] for r in listed]
    added = client.post(
        "/api/inbox/saved-replies", json={"title": "Delivery", "body": "We deliver in Doha."}
    )
    assert added.status_code == 200
    reply_id = added.json()["id"]
    assert len(client.get("/api/inbox/saved-replies").json()["replies"]) == len(listed) + 1
    assert client.delete(f"/api/inbox/saved-replies/{reply_id}").status_code == 200
    assert client.delete(f"/api/inbox/saved-replies/{reply_id}").status_code == 404
    blank = client.post("/api/inbox/saved-replies", json={"title": " ", "body": "x"})
    assert blank.status_code == 422


def test_another_shop_sees_none_of_this_shops_notes_or_saved_replies(client):
    say(client, AHMED_PHONE, "hello")
    client.post(f"{BASE}/{ahmed(client)['id']}/notes", json={"text": "Private"})
    other = other_shop_with_owner("huda@other.example")

    async def look():
        async with client.app.state.db.tenant(other) as conn:
            notes = await conn.fetchval("select count(*) from inbox_notes")
            replies = await conn.fetchval("select count(*) from saved_replies")
            return notes, replies

    assert client.portal.call(look) == (0, 0)
