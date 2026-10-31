"""The sign-in of ALYR's own staff (ALY-125, D-135): a daily cap on wrong codes, and an email and
an audit entry when the account signs in from a device or an address it has not used before."""

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest

from alyr.config import get_settings
from alyr.core import alerts, auth, mail, staff_security
from alyr.db import Database
from alyr.seed import DEMO_TENANT_ID, OWNER_EMAIL
from conftest import APP_DSN
from test_consent import owner_sql
from test_mail import provider  # noqa: F401  (the fixture: turns email on, records what is sent)
from test_sign_in import code_for, sign_in

STAFF = "founder@staff-check.com"
ADDRESS = "x-test-address"
LAPTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36"
PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1"
WRONG = "000000"


# The audit log cannot be emptied, so each test reads only what was written after it began.
began = {"after": 0}


def make_staff():
    """A member of staff with a real-looking address: the example domains are never emailed.
    The demo shop exists only once the app has been built, so this runs after that."""
    owner_sql("insert into users (email, name) values ($1, 'Fatima Staff') on conflict do nothing",
              STAFF)
    owner_sql(
        "insert into memberships (tenant_id, user_id, role) "
        "select $1, id, 'owner' from users where email = $2 on conflict do nothing",
        DEMO_TENANT_ID, STAFF,
    )
    owner_sql("insert into platform_admins (email, name) values ($1, 'Fatima Staff') "
              "on conflict do nothing", STAFF)
    owner_sql("delete from staff_known where email = $1", STAFF)
    began["after"] = owner_sql("select coalesce(max(id), 0) as n from platform_audit")[0]["n"]
    # Codes nobody used still count toward the five an email may ask for in an hour, and the
    # test database lives for the whole run.
    owner_sql("delete from login_codes where email = any($1)",
              [STAFF, OWNER_EMAIL, "ops@alyr.example"])


@pytest.fixture
def office(client_factory, monkeypatch):
    """An app that reads the visitor's address from a header, as production does."""
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", ADDRESS)
    client = client_factory()
    make_staff()
    yield client
    owner_sql("delete from platform_admins where email = $1", STAFF)
    owner_sql("delete from staff_known where email = $1", STAFF)
    owner_sql("delete from login_codes where email = any($1)",
              [STAFF, OWNER_EMAIL, "ops@alyr.example"])


def sign_in_from(client, user_agent=LAPTOP, address="203.0.113.7", email=STAFF):
    headers = {"user-agent": user_agent, ADDRESS: address}
    code = client.post("/api/auth/code", json={"email": email}, headers=headers).json()["dev_code"]
    return client.post(
        "/api/auth/verify", json={"email": email, "code": code}, headers=headers
    )


def audit(action=None, email=STAFF):
    rows = owner_sql(
        "select action, detail from platform_audit where staff_email = $1 and id > $2 "
        "order by id", email, began["after"],
    )
    return [r for r in rows if action is None or r["action"] == action]


def alerts_about_it(sent):
    return [m for m in sent if "back office" in m["body"]["subject"]]


def lock_account(client):
    """Ten wrong codes over two codes, as a person or a script would make them."""
    for _ in range(2):
        code_for(client, STAFF)
        for _ in range(auth.MAX_GUESSES):
            refused = client.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
            assert refused.status_code == 401


# ── the daily cap on wrong codes ──────────────────────────────────────────────────────────────


def test_ten_wrong_codes_lock_a_staff_account_and_the_right_one_no_longer_works(office):
    lock_account(office)
    fresh = code_for(office, STAFF)
    refused = office.post("/api/auth/verify", json={"email": STAFF, "code": fresh})
    assert refused.status_code == 401
    # The same words as any wrong code: the answer does not say the account is staff's.
    wrong_one = office.post("/api/auth/verify", json={"email": OWNER_EMAIL, "code": WRONG})
    assert refused.json() == wrong_one.json()
    assert office.get("/api/auth/me").json()["signed_in"] is False


def test_nine_wrong_codes_do_not_lock_it(office):
    code_for(office, STAFF)
    for _ in range(auth.MAX_GUESSES):
        office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
    code = code_for(office, STAFF)
    for _ in range(staff_security.WRONG_CODES_PER_DAY - auth.MAX_GUESSES - 1):
        office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
    assert owner_sql("select count(*) as n from rate_hits where bucket = $1",
                     staff_security.WRONG_BUCKET)[0]["n"] == 9
    assert office.post("/api/auth/verify", json={"email": STAFF, "code": code}).status_code == 200


def test_the_lock_lifts_when_the_wrong_codes_are_a_day_old(office):
    lock_account(office)
    owner_sql(
        "update rate_hits set at = now() - interval '25 hours' where bucket = $1",
        staff_security.WRONG_BUCKET,
    )
    assert sign_in_from(office).status_code == 200


def test_a_lock_that_is_only_part_old_still_holds(office):
    lock_account(office)
    owner_sql(
        "update rate_hits set at = now() - interval '23 hours' where bucket = $1 and ctid in "
        "(select ctid from rate_hits where bucket = $1 limit 3)",
        staff_security.WRONG_BUCKET,
    )
    assert sign_in_from(office).status_code == 401


def test_wrong_codes_on_other_accounts_are_not_capped_by_this_rule(office):
    for _ in range(2):
        code_for(office, OWNER_EMAIL)
        for _ in range(auth.MAX_GUESSES):
            office.post("/api/auth/verify", json={"email": OWNER_EMAIL, "code": WRONG})
    assert owner_sql("select count(*) as n from rate_hits where bucket = $1",
                     staff_security.WRONG_BUCKET)[0]["n"] == 0
    assert sign_in(office, OWNER_EMAIL)["signed_in"] is True


def test_one_staff_accounts_wrong_codes_do_not_lock_another(office):
    owner_sql("insert into platform_admins (email, name) values ('ops@alyr.example', 'Ops') "
              "on conflict do nothing")
    lock_account(office)
    assert sign_in_from(office, email="ops@alyr.example").status_code == 200


def test_a_burst_of_wrong_codes_is_counted_once_each_and_never_past_the_cap(office):
    code_for(office, STAFF)
    for _ in range(auth.MAX_GUESSES):
        office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
    code_for(office, STAFF)
    for _ in range(staff_security.WRONG_CODES_PER_DAY - auth.MAX_GUESSES - 1):
        office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
    code_for(office, STAFF)  # nine wrong so far, and a fresh code with five guesses on it

    async def storm():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async def guess():
                try:
                    await auth.check_code(db, STAFF, WRONG)
                except auth.AuthError:
                    return "refused"
                return "accepted"

            return await asyncio.gather(*(guess() for _ in range(40)))
        finally:
            await db.close()

    assert set(asyncio.run(storm())) == {"refused"}
    count = owner_sql("select count(*) as n from rate_hits where bucket = $1",
                      staff_security.WRONG_BUCKET)[0]["n"]
    assert count == staff_security.WRONG_CODES_PER_DAY


def test_the_lock_is_announced_once_to_the_person_to_the_audit_log_and_to_alyr(
    provider, office, monkeypatch,  # noqa: F811
):
    sent, _ = provider
    pushed = []

    def handle(request: httpx.Request) -> httpx.Response:
        pushed.append(request.content.decode())
        return httpx.Response(200)

    monkeypatch.setenv("ALYR_ALERT_NTFY_TOPIC", "a-private-topic")
    monkeypatch.setattr(alerts, "transport", httpx.MockTransport(handle))
    get_settings.cache_clear()  # the app was built before the alert topic was set
    lock_account(office)
    for _ in range(3):  # more refused attempts announce nothing more
        office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})

    mails = [m for m in sent if "paused" in m["body"]["subject"]]
    assert len(mails) == 1
    body = mails[0]["body"]
    assert mails[0]["body"]["to"] == [STAFF]
    assert "Sign-in to your ALYR account is paused" in body["subject"]
    assert "متوقف" in body["subject"]
    assert "10 wrong sign-in codes" in body["text"] and "10 رموز دخول خاطئة" in body["text"]
    assert "(Doha)" in body["text"] and "بتوقيت الدوحة" in body["text"]
    assert 'dir="rtl"' in body["html"]
    assert "QAR" not in body["text"] and "…" not in body["text"]

    locked = audit("staff.locked")
    assert len(locked) == 1
    assert json.loads(locked[0]["detail"])["wrong_codes"] == staff_security.WRONG_CODES_PER_DAY
    # Nothing that leaves ALYR names the account.
    for note in pushed:
        assert STAFF not in note and "staff-check" not in note


# ── a note of every sign-in, and an email when it is from somewhere new ───────────────────────


def test_the_first_sign_in_is_new_on_both_counts_and_is_emailed_and_recorded(provider, office):  # noqa: F811
    sent, _ = provider
    assert sign_in_from(office).status_code == 200
    alert = alerts_about_it(sent)
    assert len(alert) == 1
    body = alert[0]["body"]
    assert body["to"] == [STAFF]
    assert "New sign-in to the ALYR back office" in body["subject"] and "جديد" in body["subject"]
    text = body["text"]
    assert "a device and an address ALYR has not seen before" in text
    assert "Chrome on Windows" in text and "203.0.113.7" in text
    assert "ALYR" in text and "لوحة الإدارة" in text and 'dir="rtl"' in body["html"]
    # The email carries no code and no link that signs anyone in.
    assert "http" not in text and "6-digit" not in text

    entry = audit("staff.sign_in")
    assert len(entry) == 1
    detail = json.loads(entry[0]["detail"])
    assert detail == {
        "device": "Chrome on Windows", "address": "203.0.113.7", "new_device": True,
        "new_address": True, "email": "sent",
    }


def test_the_same_device_and_address_again_is_recorded_and_not_emailed(provider, office):  # noqa: F811
    sent, _ = provider
    sign_in_from(office)
    office.cookies.clear()
    sign_in_from(office)
    assert len(alerts_about_it(sent)) == 1
    second = json.loads(audit("staff.sign_in")[1]["detail"])
    assert second["new_device"] is False and second["new_address"] is False
    assert second["email"] == "not_needed"


def test_a_new_device_from_a_known_address_is_emailed_as_a_new_device(provider, office):  # noqa: F811
    sent, _ = provider
    sign_in_from(office)
    office.cookies.clear()
    sign_in_from(office, user_agent=PHONE)
    assert len(alerts_about_it(sent)) == 2
    text = alerts_about_it(sent)[1]["body"]["text"]
    assert "a device ALYR has not seen before" in text and "iOS" in text
    detail = json.loads(audit("staff.sign_in")[1]["detail"])
    assert (detail["new_device"], detail["new_address"]) == (True, False)


def test_a_new_address_on_a_known_device_is_emailed_as_a_new_address(provider, office):  # noqa: F811
    sent, _ = provider
    sign_in_from(office)
    office.cookies.clear()
    sign_in_from(office, address="198.51.100.20")
    text = alerts_about_it(sent)[1]["body"]["text"]
    assert "an address ALYR has not seen before" in text and "198.51.100.20" in text
    detail = json.loads(audit("staff.sign_in")[1]["detail"])
    assert (detail["new_device"], detail["new_address"]) == (False, True)


def test_a_failed_sign_in_is_not_a_sign_in(provider, office):  # noqa: F811
    sent, _ = provider
    code_for(office, STAFF)
    office.post("/api/auth/verify", json={"email": STAFF, "code": WRONG})
    assert alerts_about_it(sent) == [] and audit("staff.sign_in") == []


def test_somebody_who_is_not_staff_gets_no_alert_and_no_audit_entry(provider, office):  # noqa: F811
    sent, _ = provider
    sign_in(office, OWNER_EMAIL)
    assert alerts_about_it(sent) == []
    assert audit("staff.sign_in", OWNER_EMAIL) == []
    assert owner_sql("select count(*) as n from staff_known where email = $1",
                     OWNER_EMAIL)[0]["n"] == 0


def test_the_sign_up_door_notes_a_staff_sign_in_too(provider, office):  # noqa: F811
    sent, _ = provider
    headers = {"user-agent": LAPTOP, ADDRESS: "203.0.113.7"}
    code = office.post("/api/onboarding/code", json={"email": STAFF}, headers=headers).json()[
        "dev_code"]
    answer = office.post("/api/onboarding/verify", json={"email": STAFF, "code": code},
                         headers=headers)
    assert answer.json() == {"status": "signed_in"}
    assert len(alerts_about_it(sent)) == 1 and len(audit("staff.sign_in")) == 1


def test_a_mail_provider_that_is_down_does_not_stop_the_sign_in_and_the_audit_says_so(
    provider, office,  # noqa: F811
):
    _, state = provider
    headers = {"user-agent": LAPTOP, ADDRESS: "203.0.113.7"}
    code = code_for(office, STAFF)
    state["status"] = 500  # the code reached the person; the alert after it cannot be sent
    answer = office.post("/api/auth/verify", json={"email": STAFF, "code": code}, headers=headers)
    assert answer.status_code == 200
    assert json.loads(audit("staff.sign_in")[0]["detail"])["email"] == "send_failed"


def test_without_email_set_up_the_sign_in_is_recorded_and_says_why_no_email_went(office):
    assert sign_in_from(office).status_code == 200
    assert json.loads(audit("staff.sign_in")[0]["detail"])["email"] == "mail_not_configured"


def test_an_address_nobody_vouched_for_is_shown_as_unknown(client_factory, monkeypatch):
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", ADDRESS)
    monkeypatch.setenv("ALYR_CLIENT_IP_KEYS", "a-key-for-the-edge")
    client = client_factory()
    make_staff()
    assert sign_in_from(client).status_code == 200
    assert json.loads(audit("staff.sign_in")[0]["detail"])["address"] == "unknown"
    owner_sql("delete from platform_admins where email = $1", STAFF)


def test_the_table_keeps_hashes_of_devices_and_addresses_not_the_values(office):
    sign_in_from(office)
    rows = owner_sql("select kind, value from staff_known where email = $1", STAFF)
    assert {r["kind"] for r in rows} == {"device", "address"}
    for row in rows:
        assert len(row["value"]) == 64 and "203.0.113" not in row["value"]
        assert "Chrome" not in row["value"]


def test_describe_device_names_a_browser_and_a_system_and_nothing_else():
    assert staff_security.describe_device(LAPTOP) == "Chrome on Windows"
    assert staff_security.describe_device(PHONE) == "Safari on iOS"
    assert staff_security.describe_device("") == "a browser"
    hostile = "Firefox/1 <script>alert(1)</script> Linux\nBcc: x@evil.example"
    described = staff_security.describe_device(hostile)
    assert described == "Firefox on Linux"


def test_the_emails_escape_what_a_client_sends():
    subject, text, html = mail.staff_sign_in_message(
        "<b>Fatima</b>", datetime(2026, 10, 31, 11, 5, tzinfo=UTC),
        "Chrome on Windows", "<script>x</script>", True, True,
    )
    assert "<script>" not in html and "&lt;script&gt;" in html and "<b>Fatima" not in html
    assert "14:05" in text  # Doha is three hours ahead of UTC
    assert "·" in subject
