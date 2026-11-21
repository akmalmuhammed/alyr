"""A message that cannot go fails where the shop can see it (the first client's audit, T6, D-194):
a template Meta has not approved on the shop's account is refused when it is queued, with its
reason on the "Not sent" screen; a reminder that was refused is not marked as sent; a review
request whose message did not arrive does not use up the customer's 30 days; and a message Meta
itself refuses is failed at once in Meta's words instead of after six tries. Real PostgreSQL, the
Meta channel stood in by one that fails when told to, HTTP in and out."""

import httpx
import pytest

from alyr.seed import DEMO_TENANT_ID
from conftest import NUMBER_ID
from test_bookings import book, service_id
from test_bookings_chairs_deposits import review_on
from test_consent import owner_sql
from test_jobs import FlakyChannel, drain, use
from test_not_sent import (
    PHONE,
    customer_id,
    not_sent,
    outgoing,
    retry,
    send,
    window_closed,
)
from test_whatsapp_webhook import meta_payload, signed_post

WABA = "waba-test-1"
NOTICE = dict(kind="template", body="Your order #1001 is confirmed.",
              template_name="order_confirmed", template_category="utility",
              template_params=("Ahmed", "1001"))


@pytest.fixture
def fast_retries(monkeypatch):
    monkeypatch.setenv("ALYR_JOBS_BACKOFF_SECONDS", "0")


def on_account() -> None:
    """The shop's Meta number is on a WhatsApp Business Account whose templates ALYR can see."""
    owner_sql("update channel_numbers set waba_id = $2 where number_id = $1", NUMBER_ID, WABA)


def template_is(status: str | None, name="order_confirmed", language="en", read=False) -> None:
    """What Meta says about one template on the account: a row for it, or none; `read` says
    the whole list was read from Meta (a sync), not just one notice heard."""
    owner_sql("delete from whatsapp_templates where tenant_id = $1 and waba_id = $2",
              DEMO_TENANT_ID, WABA)
    if status is not None:
        owner_sql(
            "insert into whatsapp_templates (tenant_id, waba_id, name, language, status, "
            "synced_at) values ($1, $2, $3, $4, $5, case when $6 then now() end)",
            DEMO_TENANT_ID, WABA, name, language, status, read)


def a_customer(client, **say):
    signed_post(client, meta_payload(message_id=f"wamid.ta.{say.get('n', 1)}"))
    return customer_id()


def last_out():
    return owner_sql(
        "select m.status, m.error, m.kind from messages m join contacts c on c.id = m.contact_id "
        "where c.tenant_id = $1 and c.phone = $2 and m.direction = 'out' "
        "order by m.created_at desc limit 1", DEMO_TENANT_ID, PHONE)[0]


def test_nothing_is_known_about_the_templates_so_the_message_goes_as_before(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel())
    a_customer(client)
    on_account()
    template_is(None)  # nothing read from Meta yet
    window_closed()
    send(client, **NOTICE)
    assert last_out()["status"] == "sent" and channel.sent[-1].kind == "template"


def test_a_template_meta_has_not_approved_is_refused_when_queued_and_says_why(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel())
    a_customer(client)
    on_account()
    window_closed()
    for status in ("submitted", "rejected", "paused", "flagged", "disabled", "deleted"):
        template_is(status)
        before = len(channel.sent)
        send(client, **NOTICE)
        assert len(channel.sent) == before, status  # never handed to Meta, never retried
        assert last_out()["status"] == "blocked", status
        assert last_out()["error"] == "template_not_approved", status

    [entry, *_] = not_sent(client)
    assert (entry["status"], entry["reason"], entry["can_retry"], entry["why_not"]) == (
        "blocked", "template_not_approved", False, "template_not_approved")
    assert retry(client, entry) == (409, {"detail": {"reason": "template_not_approved"}})


def test_a_template_the_account_does_not_have_is_refused_once_the_list_was_read(
    client_factory, fast_retries
):
    client = client_factory()
    use(client, FlakyChannel())
    a_customer(client)
    on_account()
    window_closed()
    template_is("approved", name="booking_reminder", read=True)  # read in full, this one missing
    send(client, **NOTICE)
    assert last_out()["error"] == "template_not_approved"


def test_an_approved_template_goes_and_so_does_a_blocked_one_once_approved(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel())
    a_customer(client)
    on_account()
    window_closed()
    template_is("submitted")
    send(client, **NOTICE)
    [entry] = not_sent(client)
    assert entry["can_retry"] is False

    template_is("approved")  # Meta said yes
    [entry] = not_sent(client)
    assert (entry["can_retry"], entry["why_not"]) == (True, None)
    assert retry(client, entry) == (200, {"status": "queued"})
    drain(client)
    assert channel.sent[-1].template_name == "order_confirmed"
    assert outgoing(client)[-1]["status"] == "sent" and not_sent(client) == []


def test_inside_the_window_a_notice_goes_as_text_and_needs_no_approval(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, FlakyChannel())
    a_customer(client)
    on_account()
    template_is("rejected")
    send(client, **NOTICE)  # the customer wrote a moment ago
    assert last_out()["status"] == "sent" and channel.sent[-1].kind == "text"


def test_a_reminder_that_was_refused_is_not_marked_as_sent(client_factory, fast_retries):
    client = client_factory()
    use(client, FlakyChannel())
    me = str(a_customer(client))
    on_account()
    window_closed()
    template_is("submitted", name="booking_reminder")
    made = book(client, service_id(client), contact_id=me).json()
    owner_sql("update jobs set run_at = now() where kind = 'booking_reminder'")
    client.get("/api/services")
    booking = owner_sql("select reminded_at from bookings where id = $1::uuid", made["id"])[0]
    assert booking["reminded_at"] is None
    assert (last_out()["status"], last_out()["error"]) == ("blocked", "template_not_approved")
    assert any(e["reason"] == "template_not_approved" for e in not_sent(client))


def test_a_reminder_that_went_is_marked_once(client_factory, fast_retries):
    client = client_factory()
    channel = use(client, FlakyChannel())
    me = str(a_customer(client))
    on_account()
    window_closed()
    template_is("approved", name="booking_reminder")
    made = book(client, service_id(client), contact_id=me).json()
    owner_sql("update jobs set run_at = now() where kind = 'booking_reminder'")
    client.get("/api/services")
    booking = owner_sql("select reminded_at from bookings where id = $1::uuid", made["id"])[0]
    assert booking["reminded_at"] is not None
    assert channel.sent[-1].template_name == "booking_reminder"


def came(client, me: str):
    sid = service_id(client)
    made = book(client, sid, contact_id=me).json()
    assert client.post(f"/api/bookings/{made['id']}/outcome",
                       json={"status": "completed"}).status_code == 200


def test_a_review_request_that_failed_does_not_use_up_the_30_days(client_factory, fast_retries):
    client = client_factory()
    channel = use(client, FlakyChannel(failures=99))
    me = str(a_customer(client))
    review_on(client)
    came(client, me)  # the message is queued and every try fails
    drain(client)
    assert owner_sql("select m.status from review_requests r join messages m "
                     "on m.id = r.message_id")[0]["status"] == "failed"

    channel.failures = 0
    came(client, me)  # the next visit may ask again: the first ask never arrived
    drain(client)
    assert len(owner_sql("select 1 from review_requests where blocked is null")) == 2
    assert channel.sent and "review" in channel.sent[-1].body

    came(client, me)  # now one did arrive, so this month's ask is made
    assert len(owner_sql("select 1 from review_requests where blocked is null")) == 2


def test_a_review_request_refused_for_an_unapproved_template_is_not_a_request(
    client_factory, fast_retries
):
    client = client_factory()
    use(client, FlakyChannel())
    me = str(a_customer(client))
    on_account()
    window_closed()
    template_is("submitted", name="review_request")
    review_on(client)
    came(client, me)
    [row] = owner_sql("select blocked from review_requests")
    assert row["blocked"] == "template_not_approved"
    template_is("approved", name="review_request")
    came(client, me)  # not held back for 30 days by the refused one
    assert len(owner_sql("select 1 from review_requests where blocked is null")) == 1


class MetaSays(FlakyChannel):
    """Meta answers every send with this status and error code."""

    def __init__(self, status: int, code: int, text: str):
        super().__init__()
        self.answer = (status, code, text)

    async def send(self, from_number_id, message, address):
        self.attempts += 1
        status, code, text = self.answer
        raise httpx.HTTPStatusError(
            "refused", request=httpx.Request("POST", "http://meta.test"),
            response=httpx.Response(
                status, json={"error": {"code": code, "message": text}},
                request=httpx.Request("POST", "http://meta.test")))


def test_a_message_meta_itself_refuses_is_failed_at_once_in_metas_words(
    client_factory, fast_retries
):
    client = client_factory()
    channel = use(client, MetaSays(400, 132001, "Template name does not exist"))
    signed_post(client, meta_payload(message_id="wamid.ta.perm"))
    assert channel.attempts == 1  # no five more tries
    [entry] = not_sent(client)
    assert (entry["status"], entry["reason"]) == ("failed", "whatsapp")
    assert entry["whatsapp_said"] == "Template name does not exist"
    assert client.get("/api/jobs/failed").json()["jobs"] == []


@pytest.mark.parametrize("status,code", [(429, 80007), (500, 1), (400, 190), (400, 4)])
def test_a_busy_meta_or_a_wrong_token_is_still_tried_again(
    client_factory, fast_retries, status, code
):
    client = client_factory()
    channel = use(client, MetaSays(status, code, "try later"))
    signed_post(client, meta_payload(message_id=f"wamid.ta.busy.{status}.{code}"))
    assert channel.attempts == 6
    [entry] = not_sent(client)
    assert (entry["status"], entry["reason"]) == ("failed", "gave_up")
