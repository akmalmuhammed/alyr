"""Owner actions over WhatsApp, phases 0 and 1 (ALY-130, decision D-040): linking a staff
number to the person who holds it, and the read-only commands that number can then send."""

import pytest

from alyr.core import staff_link
from alyr.seed import AGENT_EMAIL, AHMED_PHONE, DEMO_TENANT_ID, OWNER_EMAIL
from test_consent import ahmed, conversation, owner_sql, say
from test_orders import place, product
from test_sign_in import sign_in

OWNER_PHONE_NEW = "97455500777"
AGENT_PHONE_NEW = "97455500778"
SPARE_PHONE = "97455500779"


@pytest.fixture
def two_people(client_factory, monkeypatch):
    """The shop's owner and its agent, each signed in on their own session."""
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    owner, agent = client_factory(), client_factory()
    owner_me, agent_me = sign_in(owner, OWNER_EMAIL), sign_in(agent, AGENT_EMAIL)
    return owner, agent, owner_me, agent_me


def reply(client, phone, text):
    return say(client, phone, text)[-1]["body"]


def code_for_link(client) -> str:
    response = client.post("/api/owner/whatsapp-link")
    assert response.status_code == 200
    return response.json()["code"]


def link(client, phone) -> str:
    """The person asks for a code in the workspace and sends it from their phone."""
    return reply(client, phone, f"LINK {code_for_link(client)}")


def contact_row(phone):
    return owner_sql(
        "select role, user_id, verified_at from contacts where phone = $1 and tenant_id = $2",
        phone, DEMO_TENANT_ID,
    )[0]


def activity(action):
    return owner_sql(
        "select channel, actor_name from activity where action = $1 order by created_at",
        action,
    )


# ------------------------------------------------------------------- the message shape

def test_a_link_message_is_eight_digits_in_either_script():
    assert staff_link.parse("LINK 48271936") == "48271936"
    assert staff_link.parse("  link 48271936 ") == "48271936"
    assert staff_link.parse("ربط ٤٨٢٧١٩٣٦") == "48271936"
    # Ordinary talk is left alone: a customer asking for "link" is not linking anything.
    for text in ("link", "link pay", "link 1234567", "link 123456789", "please link 12345678"):
        assert staff_link.parse(text) is None, text


# ----------------------------------------------------------------- phase 0: who is writing

def test_a_code_sent_from_the_phone_links_it_to_the_signed_in_person(two_people):
    owner, _, owner_me, _ = two_people
    assert owner.get("/api/owner/whatsapp").json()["linked"] is False

    answer = link(owner, OWNER_PHONE_NEW)
    assert "Linked" in answer and owner_me["name"] in answer and "(owner)" in answer

    row = contact_row(OWNER_PHONE_NEW)
    assert row["role"] == "staff" and row["user_id"] is not None and row["verified_at"]
    status = owner.get("/api/owner/whatsapp").json()
    assert status["linked"] is True and status["number_ends"] == "0777"
    # It is on the record, and says it happened by message (the person was the one typing).
    [entry] = activity("whatsapp_linked")
    assert (entry["channel"], entry["actor_name"]) == ("whatsapp", owner_me["name"])


def test_a_wrong_code_links_nothing_and_does_not_say_why(two_people):
    owner, *_ = two_people
    code_for_link(owner)
    answer = reply(owner, SPARE_PHONE, "LINK 00000000")
    assert answer == "That code did not work. Ask for a new one in your workspace."
    assert contact_row(SPARE_PHONE)["role"] == "customer"


def test_a_code_works_once(two_people):
    owner, *_ = two_people
    code = code_for_link(owner)
    assert "Linked" in reply(owner, OWNER_PHONE_NEW, f"LINK {code}")
    assert "did not work" in reply(owner, SPARE_PHONE, f"LINK {code}")
    assert contact_row(SPARE_PHONE)["role"] == "customer"


def test_an_expired_code_is_refused(two_people):
    owner, *_ = two_people
    code = code_for_link(owner)
    owner_sql("update staff_link_codes set expires_at = now() - interval '1 minute'")
    assert "did not work" in reply(owner, OWNER_PHONE_NEW, f"LINK {code}")


def test_asking_for_a_new_code_cancels_the_old_one(two_people):
    owner, *_ = two_people
    first, second = code_for_link(owner), code_for_link(owner)
    assert "did not work" in reply(owner, OWNER_PHONE_NEW, f"LINK {first}")
    assert "Linked" in reply(owner, OWNER_PHONE_NEW, f"LINK {second}")


def test_ten_wrong_guesses_kill_the_codes_that_are_waiting(two_people):
    owner, *_ = two_people
    code = code_for_link(owner)
    for guess in range(1, staff_link.MAX_WRONG + 1):
        assert "did not work" in reply(owner, SPARE_PHONE, f"LINK {guess:08d}")
    # Even the right code, from a stranger or from the person, is now refused.
    assert "did not work" in reply(owner, OWNER_PHONE_NEW, f"LINK {code}")
    assert contact_row(OWNER_PHONE_NEW)["role"] == "customer"
    # The person asks for a fresh one and is back in business.
    assert "Linked" in reply(owner, OWNER_PHONE_NEW, f"LINK {code_for_link(owner)}")


def test_a_new_number_replaces_the_old_one(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    link(owner, SPARE_PHONE)
    assert contact_row(OWNER_PHONE_NEW)["user_id"] is None
    assert contact_row(SPARE_PHONE)["user_id"] is not None
    assert "not linked" in reply(owner, OWNER_PHONE_NEW, "TODAY")
    assert "*Today," in reply(owner, SPARE_PHONE, "TODAY")


def test_a_number_that_belongs_to_someone_else_is_not_taken_over(two_people):
    owner, agent, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    answer = reply(agent, OWNER_PHONE_NEW, f"LINK {code_for_link(agent)}")
    assert "linked to another person" in answer
    assert "*Today," in reply(owner, OWNER_PHONE_NEW, "TODAY")


def test_unlinking_stops_the_commands_and_is_on_the_record(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert owner.delete("/api/owner/whatsapp").json()["unlinked"] is True
    assert owner.get("/api/owner/whatsapp").json()["linked"] is False
    assert "not linked" in reply(owner, OWNER_PHONE_NEW, "TODAY")
    [entry] = activity("whatsapp_unlinked")
    assert entry["channel"] == "portal"
    assert owner.delete("/api/owner/whatsapp").json()["unlinked"] is False


def test_a_person_taken_off_the_team_loses_their_number_at_once(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert "*Today," in reply(owner, OWNER_PHONE_NEW, "TODAY")
    owner_sql("delete from memberships where tenant_id = $1 and role = 'owner'", DEMO_TENANT_ID)
    assert "not linked" in reply(owner, OWNER_PHONE_NEW, "TODAY")


def test_a_role_change_applies_on_the_next_message(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert "Owed to you" in reply(owner, OWNER_PHONE_NEW, "OWED")
    owner_sql(
        "update memberships set role = 'agent' where tenant_id = $1 and role = 'owner'",
        DEMO_TENANT_ID,
    )
    assert reply(owner, OWNER_PHONE_NEW, "OWED") == "That is for the owner and admins."


def test_a_code_from_another_shop_does_nothing(two_people):
    owner, *_ = two_people
    other = owner_sql(
        "insert into tenants (name) values ('Link test shop') returning id"
    )[0]["id"]
    user = owner_sql(
        "insert into users (email, name) values ('link-test@other.example', 'Linda') returning id"
    )[0]["id"]
    try:
        owner_sql(
            "insert into memberships (tenant_id, user_id, role) values ($1, $2, 'owner')",
            other, user,
        )
        owner_sql(
            "insert into staff_link_codes (tenant_id, user_id, code_hash, expires_at) "
            "values ($1, $2, $3, now() + interval '5 minutes')",
            other, user, staff_link._digest("11112222"),
        )
        assert "did not work" in reply(owner, OWNER_PHONE_NEW, "LINK 11112222")
        assert contact_row(OWNER_PHONE_NEW)["role"] == "customer"
    finally:
        # Other tests look for shops and people by name; leave nothing of this one behind.
        owner_sql("delete from staff_link_codes where tenant_id = $1", other)
        owner_sql("delete from memberships where tenant_id = $1", other)
        owner_sql("delete from tenants where id = $1", other)
        owner_sql("delete from users where id = $1", user)


def test_the_open_demo_has_no_person_to_link(client):
    assert client.post("/api/owner/whatsapp-link").status_code == 409
    assert client.get("/api/owner/whatsapp").status_code == 409


def test_where_a_person_prefers_to_work_is_kept(two_people):
    owner, *_ = two_people
    assert owner.get("/api/owner/whatsapp").json()["preference"] == "both"
    assert owner.put("/api/owner/channel", json={"preference": "whatsapp"}).json()[
        "preference"
    ] == "whatsapp"
    assert owner.put("/api/owner/channel", json={"preference": "telegram"}).status_code == 422


# ------------------------------------------------------------------ phase 1: the commands

def test_a_customer_cannot_use_staff_commands(two_people):
    owner, *_ = two_people
    for word in ("TODAY", "ORDERS", "OWED", "HELP"):
        body = reply(owner, AHMED_PHONE, word)
        assert "*Today," not in body and "Owed to you" not in body, word
        assert "What you can ask ALYR here" not in body, word


def test_staff_who_are_not_linked_are_told_how(client):
    # The demo's own staff number was never linked to a login.
    body = reply(client, "97455500100", "TODAY")
    assert body.startswith("This number is not linked to a login")


def test_today_gives_the_day_in_numbers_for_every_module_that_is_on(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    placed = place(owner, ahmed(owner)["id"], [(product(owner, "Cable 2.5 mm"), 2)], "link")
    assert placed.status_code == 200, placed.text
    body = reply(owner, OWNER_PHONE_NEW, "today")
    assert body.splitlines()[0].startswith("*Today, ")
    assert "Orders: 1 (QAR 450), 1 waiting, 0 ready" in body
    assert "Bookings:" in body and "Collected: QAR" in body and "Chats:" in body


def test_orders_lists_what_is_open(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert reply(owner, OWNER_PHONE_NEW, "ORDERS") == "No open orders."
    placed = place(owner, ahmed(owner)["id"], [(product(owner, "Cable 2.5 mm"), 1)], "link")
    assert placed.status_code == 200
    body = reply(owner, OWNER_PHONE_NEW, "orders")
    assert body.splitlines()[0] == "*Open orders (1)*"
    assert "Ahmed Al-Kuwari: new, not paid, QAR 225" in body


def test_bookings_lists_today_in_time_order(two_people):
    from test_bookings import book

    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert reply(owner, OWNER_PHONE_NEW, "BOOKINGS") == "No bookings today."
    made = book(owner, contact_id=ahmed(owner)["id"])
    assert made.status_code == 200
    owner_sql(
        "update bookings set starts_at = now(), ends_at = now() + interval '30 minutes' "
        "where tenant_id = $1",
        DEMO_TENANT_ID,
    )
    body = reply(owner, OWNER_PHONE_NEW, "bookings")
    assert body.splitlines()[0] == "*Bookings today (1)*"
    assert "Ahmed Al-Kuwari" in body and "Electrician site visit" in body


def test_owed_names_the_biggest_balances_and_what_is_late(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    body = reply(owner, OWNER_PHONE_NEW, "OWED")
    assert body.splitlines()[0].startswith("*Owed to you: QAR ")
    assert len([line for line in body.splitlines() if ": QAR " in line]) >= 2


def test_help_lists_only_what_the_role_and_the_modules_allow(two_people):
    owner, agent, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    link(agent, AGENT_PHONE_NEW)
    full = reply(owner, OWNER_PHONE_NEW, "help")
    assert all(word in full for word in ("TODAY", "ORDERS", "BOOKINGS", "OWED", "REPORT"))
    assert "OWED" not in reply(agent, AGENT_PHONE_NEW, "HELP")
    owner_sql(
        "update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'ledger'",
        DEMO_TENANT_ID,
    )
    assert "OWED" not in reply(owner, OWNER_PHONE_NEW, "HELP")
    assert reply(owner, OWNER_PHONE_NEW, "OWED") == "That is not switched on for this shop."


def test_an_agent_sees_no_money_in_chat(two_people):
    owner, agent, *_ = two_people
    link(agent, AGENT_PHONE_NEW)
    place(owner, ahmed(owner)["id"], [(product(owner, "Cable 2.5 mm"), 1)], "link")
    for word in ("TODAY", "ORDERS"):
        body = reply(agent, AGENT_PHONE_NEW, word)
        assert "QAR" not in body and "Collected" not in body, (word, body)
    assert reply(agent, AGENT_PHONE_NEW, "OWED") == "That is for the owner and admins."


def test_the_same_commands_work_in_arabic(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert reply(owner, OWNER_PHONE_NEW, "اليوم").lstrip("‏").startswith("*اليوم،")
    assert reply(owner, OWNER_PHONE_NEW, "الطلبات").lstrip("‏") == "لا طلبات مفتوحة."
    assert "المستحق لك" in reply(owner, OWNER_PHONE_NEW, "المستحقات")
    assert "يمكنك أن تسأل ALYR هنا" in reply(owner, OWNER_PHONE_NEW, "مساعدة")
    # Every Arabic line keeps its direction next to digits and Latin letters.
    body = reply(owner, OWNER_PHONE_NEW, "الطلبات")
    assert all(line.startswith("‏") for line in body.splitlines() if line)


def test_other_staff_messages_go_on_to_the_modules_as_before(two_people):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    # REPORT is still the report module's.
    assert "weekly report" in reply(owner, OWNER_PHONE_NEW, "REPORT")
    before = len(conversation(owner, OWNER_PHONE_NEW))
    say(owner, OWNER_PHONE_NEW, "good morning")
    assert len(conversation(owner, OWNER_PHONE_NEW)) >= before + 1


def test_answers_end_with_a_workspace_link_only_once_the_workspace_has_an_address(
    two_people, monkeypatch
):
    owner, *_ = two_people
    link(owner, OWNER_PHONE_NEW)
    assert "http" not in reply(owner, OWNER_PHONE_NEW, "ORDERS")
    monkeypatch.setenv("ALYR_WORKSPACE_URL", "https://app.example.test/")
    from alyr.config import get_settings

    get_settings.cache_clear()
    try:
        assert reply(owner, OWNER_PHONE_NEW, "ORDERS").endswith(
            "https://app.example.test/app/orders"
        )
        assert reply(owner, OWNER_PHONE_NEW, "TODAY").endswith("https://app.example.test/app")
    finally:
        monkeypatch.delenv("ALYR_WORKSPACE_URL")
        get_settings.cache_clear()


# ------------------------------------------------------------- the workspace's door

def test_the_workspace_asks_the_same_actions_and_gets_the_same_answers(two_people):
    owner, agent, *_ = two_people
    place(owner, ahmed(owner)["id"], [(product(owner, "Cable 2.5 mm"), 1)], "link")

    seen_by_owner = owner.get("/api/owner/ask/orders").json()
    assert seen_by_owner["open"] == 1 and seen_by_owner["items"][0]["total"] == 22500
    seen_by_agent = agent.get("/api/owner/ask/orders").json()
    assert seen_by_agent["open"] == 1 and seen_by_agent["items"][0]["total"] is None

    assert owner.get("/api/owner/ask/owed").json()["customers"] >= 1
    assert agent.get("/api/owner/ask/owed").status_code == 403
    assert owner.get("/api/owner/ask/today").json()["sections"]["orders"]["value"] == 22500
    assert agent.get("/api/owner/ask/today").json()["sections"]["orders"]["value"] is None
    assert "ledger" not in agent.get("/api/owner/ask/today").json()["sections"]
    assert owner.get("/api/owner/ask/everything").status_code == 404


def test_the_workspace_refuses_a_question_about_a_module_that_is_off(two_people):
    owner, *_ = two_people
    owner_sql(
        "update tenant_modules set enabled = false where tenant_id = $1 and module_key = 'orders'",
        DEMO_TENANT_ID,
    )
    assert owner.get("/api/owner/ask/orders").status_code == 403
    assert "orders" not in owner.get("/api/owner/ask/today").json()["sections"]


def test_asking_needs_a_sign_in_away_from_the_demo(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    client = client_factory()
    for path in ("/api/owner/ask/today", "/api/owner/whatsapp"):
        assert client.get(path).status_code == 401, path
    assert client.post("/api/owner/whatsapp-link").status_code == 401
