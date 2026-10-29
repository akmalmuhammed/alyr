"""Messages that did not reach a customer (specs/036, go-live checklist item 26): the workspace's
"Not sent" list, sending one again through the same consent and window checks as a new message,
ALYR Agent's task and the back office's reasons. Real PostgreSQL, the Meta channel stood in by
one that fails when told to, HTTP in and out."""

import json

import pytest

from alyr.channels.base import OutboundMessage
from alyr.seed import AGENT_EMAIL, DEMO_TENANT_ID
from conftest import NUMBER_ID
from test_consent import owner_sql
from test_jobs import FlakyChannel, drain, meta_conversation, use
from test_sign_in import sign_in
from test_whatsapp_webhook import meta_payload, signed_post

PHONE = "97455500001"  # the customer of meta_payload


@pytest.fixture
def fast_retries(monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")


def not_sent(client) -> list[dict]:
    answer = client.get("/api/messages/not-sent")
    assert answer.status_code == 200, answer.text
    assert answer.json()["days"] == 14
    return answer.json()["messages"]


def outgoing(client) -> list[dict]:
    return [m for m in meta_conversation(client) if m["direction"] == "out"]


def customer_id():
    return owner_sql(
        "select id from contacts where tenant_id = $1 and phone = $2", DEMO_TENANT_ID, PHONE
    )[0]["id"]


def send(client, **message) -> None:
    """A message from a module, through the real outbound layer, and its job run."""

    to = customer_id()

    async def go():
        async with client.app.state.db.tenant(DEMO_TENANT_ID) as conn:
            return await client.app.state.outbound.send(conn, OutboundMessage(to=to, **message))

    client.portal.call(go)
    drain(client)


def window_closed() -> None:
    owner_sql(
        "update contacts set last_inbound_at = now() - interval '2 days' "
        "where tenant_id = $1 and phone = $2",
        DEMO_TENANT_ID, PHONE,
    )


def whatsapp_reports(client, wamid: str, status: str, title: str = "") -> None:
    payload = {"entry": [{"changes": [{"value": {
        "metadata": {"phone_number_id": NUMBER_ID},
        "statuses": [{"id": wamid, "status": status,
                      "errors": [{"title": title}] if status == "failed" else None}],
    }}]}]}
    assert signed_post(client, payload).status_code == 200


def retry(client, entry) -> tuple[int, dict]:
    answer = client.post(f"/api/messages/{entry['id']}/retry")
    return answer.status_code, answer.json()


def test_a_message_alyr_could_not_hand_over_is_listed_and_sent_again(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=99))
    signed_post(client, meta_payload(message_id="wamid.ns1"))
    [entry] = not_sent(client)
    assert (entry["status"], entry["reason"], entry["can_retry"]) == ("failed", "gave_up", True)
    assert entry["phone"] == PHONE and entry["body"] and entry["whatsapp_said"] is None

    channel.failures = 0
    assert retry(client, entry) == (200, {"status": "queued"})
    drain(client)
    assert len(channel.sent) == 1
    assert outgoing(client)[-1]["status"] == "sent"
    assert not_sent(client) == []
    # The parked job was the one sent round again; nothing is left parked.
    assert client.get("/api/jobs/failed").json()["jobs"] == []
    done = owner_sql(
        "select subject, subject_id, detail from activity "
        "where tenant_id = $1 and action = 'message_retried'",
        DEMO_TENANT_ID,
    )
    assert [(d["subject"], d["subject_id"], json.loads(d["detail"])["message_id"])
            for d in done] == [
        ("conversation", customer_id(), entry["id"])
    ]


def test_a_message_whatsapp_refused_gives_whatsapps_words_and_can_go_again(client):
    channel = use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.ns2"))
    whatsapp_reports(client, "wamid.out.1", "failed", "Message undeliverable")
    [entry] = not_sent(client)
    assert (entry["reason"], entry["whatsapp_said"], entry["can_retry"]) == (
        "whatsapp", "Message undeliverable", True
    )
    assert retry(client, entry)[0] == 200
    drain(client)
    assert len(channel.sent) == 2
    assert outgoing(client)[-1]["status"] == "sent"
    assert not_sent(client) == []


def test_a_customer_who_said_stop_since_is_not_sent_it_again_by_either_door(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=99))
    signed_post(client, meta_payload(message_id="wamid.ns3"))
    # A notice sent while the window is open goes as ordinary text, but it is still a notice:
    # the customer's consent decides it, not only the window.
    send(client, kind="template", body="Your order #1001 is confirmed.",
         template_name="order_confirmed", template_category="utility",
         template_params=("Ahmed", "1001"))
    channel.failures = 0
    signed_post(client, meta_payload(message_id="wamid.ns3.stop", text="STOP"))
    sent_before = len(channel.sent)

    entry = next(e for e in not_sent(client) if "1001" in e["body"])
    assert (entry["can_retry"], entry["why_not"]) == (False, "opted_out")
    assert retry(client, entry) == (409, {"detail": {"reason": "opted_out"}})
    parked = owner_sql(
        "select id from jobs where tenant_id = $1 and status = 'failed' "
        "and payload->>'message_id' = $2",
        DEMO_TENANT_ID, entry["id"],
    )[0]["id"]
    assert client.post(f"/api/jobs/{parked}/retry").status_code == 409
    assert len(channel.sent) == sent_before
    assert next(e for e in not_sent(client) if e["id"] == entry["id"])["status"] == "failed"


def test_free_text_refused_outside_the_window_goes_once_the_customer_writes_again(client):
    channel = use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.ns4"))
    window_closed()
    send(client, kind="text", body="We have your size again.")
    [entry] = not_sent(client)
    assert (entry["status"], entry["reason"], entry["can_retry"], entry["why_not"]) == (
        "blocked", "window_closed", False, "window_closed"
    )
    assert retry(client, entry) == (409, {"detail": {"reason": "window_closed"}})

    signed_post(client, meta_payload(message_id="wamid.ns4.again", text="any news?"))
    [entry] = not_sent(client)
    assert entry["can_retry"] is True
    assert retry(client, entry)[0] == 200
    drain(client)
    assert channel.sent[-1].body == "We have your size again."
    assert not_sent(client) == []


def test_a_refused_picture_cannot_go_again_because_it_was_never_kept(client):
    use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.ns5"))
    window_closed()
    send(client, kind="image", body="New stock", image=b"\x89PNG not really")
    signed_post(client, meta_payload(message_id="wamid.ns5.again"))
    [entry] = not_sent(client)
    assert (entry["can_retry"], entry["why_not"]) == (False, "file_lost")
    assert retry(client, entry) == (409, {"detail": {"reason": "file_lost"}})


def test_only_the_last_fourteen_days_of_outgoing_messages_are_listed(client):
    use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.ns6"))
    whatsapp_reports(client, "wamid.out.1", "failed", "Message undeliverable")
    assert len(not_sent(client)) == 1
    owner_sql(
        "update messages set created_at = now() - interval '15 days' where tenant_id = $1",
        DEMO_TENANT_ID,
    )
    assert not_sent(client) == []
    assert client.post(f"/api/messages/{owner_sql('select gen_random_uuid() as id')[0]['id']}"
                       "/retry").status_code == 404


def test_anyone_on_the_team_can_send_one_again_but_parked_jobs_stay_the_managers(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=99))
    signed_post(client, meta_payload(message_id="wamid.ns7"))
    sign_in(client, AGENT_EMAIL)
    [entry] = not_sent(client)
    parked = client.get("/api/jobs/failed").json()["jobs"][0]["id"]
    assert client.post(f"/api/jobs/{parked}/retry").status_code == 403
    channel.failures = 0
    assert retry(client, entry)[0] == 200
    drain(client)
    assert outgoing(client)[-1]["status"] == "sent"
    by = owner_sql(
        "select actor_name from activity where tenant_id = $1 and action = 'message_retried'",
        DEMO_TENANT_ID,
    )
    assert by[0]["actor_name"] == "Yusuf Rahman"


def test_alyr_agent_puts_a_failed_message_under_needs_you_now(client):
    use(client, FlakyChannel())
    signed_post(client, meta_payload(message_id="wamid.ns8"))
    whatsapp_reports(client, "wamid.out.1", "failed", "Message undeliverable")
    for lang, words in (("en", "did not reach the customer"), ("ar", "لم تصل إلى العميل")):
        needs = client.get("/api/agent", params={"lang": lang}).json()["needs"]["items"]
        mine = [n for n in needs if n["key"] == "not_sent"]
        assert mine and mine[0]["count"] == 1 and mine[0]["href"] == "/app/unsent", needs
        assert words in str(mine[0]["words"])
    # A refusal by rule is on the screen but is not work waiting: it does not count here.
    owner_sql("update messages set status = 'blocked', error = 'window_closed' "
              "where tenant_id = $1 and status = 'failed'", DEMO_TENANT_ID)
    needs = client.get("/api/agent").json()["needs"]["items"]
    assert not [n for n in needs if n["key"] == "not_sent"]
