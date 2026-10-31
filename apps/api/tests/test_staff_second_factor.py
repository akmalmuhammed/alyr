"""The second factor for ALYR's own staff (ALY-125, D-136): an authenticator app and recovery
codes, enforced on the back office behind ALYR_STAFF_2FA. The tests are hostile on purpose: a code
seen twice, guessing, a clock that is off, a planted cookie, turning it off without it."""

import asyncio
import base64
import json
import time

import pytest

from alyr.config import get_settings
from alyr.core import auth, second_factor
from alyr.db import Database
from conftest import APP_DSN
from test_consent import owner_sql
from test_mail import provider  # noqa: F401  (the fixture: turns email on, records what is sent)
from test_staff_sign_in import ADDRESS, STAFF, audit, make_staff, sign_in_from

ADMIN = "/api/admin"
FACTOR = "/api/admin/factor"


class Clock:
    """The server's clock, which the tests move. It starts in the middle of a 30-second step so
    that a test never straddles the edge of one."""

    def __init__(self) -> None:
        self.t = (int(time.time() // 30) * 30) + 10.0

    def now(self) -> float:
        return self.t

    def step(self) -> int:
        return int(self.t // 30)

    def advance(self, seconds: float) -> None:
        self.t += seconds


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(second_factor, "now", c.now)
    return c


def reset_factor_state():
    owner_sql("delete from staff_recovery_codes where email = $1", STAFF)
    owner_sql("delete from staff_factors where email = $1", STAFF)
    owner_sql("delete from rate_hits where bucket in ('staff-factor', 'staff-factor-announced')")


@pytest.fixture
def bo(client_factory, monkeypatch, clock):
    """A back-office client with one member of staff and a clean second-factor state."""
    monkeypatch.setenv("ALYR_CLIENT_IP_HEADER", ADDRESS)
    client = client_factory()
    make_staff()
    reset_factor_state()
    yield client
    reset_factor_state()
    owner_sql("delete from platform_admins where email = $1", STAFF)


def require(monkeypatch, on=True):
    monkeypatch.setenv("ALYR_STAFF_2FA", "true" if on else "false")
    get_settings.cache_clear()


def b32(text):
    return base64.b32decode(text + "=" * (-len(text) % 8))


def code(clock, secret, offset=0):
    return second_factor.code_at(b32(secret), clock.step() + offset)


def post(client, path, **body):
    return client.post(f"{FACTOR}{path}", json=body)


def enrol(client, clock):
    """Sign in, set up an authenticator and confirm it; returns its secret and the recovery
    codes. The session passes the factor on the way."""
    assert sign_in_from(client).status_code == 200
    secret = post(client, "/begin").json()["secret"]
    confirmed = post(client, "/confirm", code=code(clock, secret))
    assert confirmed.status_code == 200, confirmed.text
    return secret, confirmed.json()["recovery_codes"]


def sign_in_again(client):
    client.cookies.clear()
    assert sign_in_from(client).status_code == 200


# ── the codes themselves ──────────────────────────────────────────────────────────────────────


def test_the_codes_are_the_ones_every_authenticator_app_makes_rfc_6238():
    secret = b"12345678901234567890"
    # The RFC's SHA-1 test values (8 digits there; the last 6 here), at 59 s, 1111111109 s and
    # 20000000000 s.
    assert second_factor.code_at(secret, 59 // 30) == "287082"
    assert second_factor.code_at(secret, 1111111109 // 30) == "081804"
    assert second_factor.code_at(secret, 20000000000 // 30) == "353130"


def test_a_little_clock_drift_is_allowed_and_no_more():
    secret = b"12345678901234567890"
    at = 1111111109.0
    step = second_factor.step_of(at)
    for offset, ok in ((-2, False), (-1, True), (0, True), (1, True), (2, False)):
        found = second_factor.match(secret, second_factor.code_at(secret, step + offset), at)
        assert (found is not None) is ok, offset
    assert second_factor.match(secret, " 081 804 ", 1111111109.0) == step
    for junk in ("", "12345", "1234567", "abcdef", "081-804x"):
        assert second_factor.match(secret, junk, at) is None


def test_the_sealed_secret_opens_only_for_its_own_account_and_hides_the_secret():
    secret = second_factor.new_secret()
    sealed = second_factor.seal("a@alyr.qa", secret)
    assert second_factor.unseal("a@alyr.qa", sealed) == secret
    with pytest.raises(second_factor.FactorError):
        second_factor.unseal("b@alyr.qa", sealed)
    assert second_factor.secret_text(secret) not in sealed
    assert secret not in base64.b64decode(sealed)


def test_recovery_codes_are_twelve_characters_nothing_ambiguous_and_hashed_per_account():
    codes = second_factor.new_recovery_codes()
    assert len(codes) == 10 and len(set(codes)) == 10
    for c in codes:
        raw = second_factor.normalise(c)
        assert len(raw) == 12 and c.count("-") == 2
        assert not set(raw) & set("01IO")
    one = second_factor._recovery_hash("a@alyr.qa", second_factor.normalise(codes[0]))
    other = second_factor._recovery_hash("b@alyr.qa", second_factor.normalise(codes[0]))
    assert one != other and codes[0] not in one


# ── setting it up (enforcement off) ───────────────────────────────────────────────────────────


def test_setting_up_keeps_nothing_in_clear_and_shows_the_recovery_codes_once(bo, clock):
    assert sign_in_from(bo).status_code == 200
    begun = post(bo, "/begin").json()
    secret = begun["secret"]
    assert begun["replacing"] is False
    assert begun["link"].startswith("otpauth://totp/ALYR%3A")
    assert f"secret={secret}" in begun["link"]
    # Pending: nothing is enrolled yet, and a wrong code leaves it so.
    assert bo.get(FACTOR).json()["enrolled"] is False
    assert post(bo, "/confirm", code="000000").status_code == 401
    assert bo.get(FACTOR).json()["enrolled"] is False

    confirmed = post(bo, "/confirm", code=code(clock, secret))
    assert confirmed.status_code == 200
    codes = confirmed.json()["recovery_codes"]
    assert len(codes) == 10 and confirmed.json()["replaced"] is False

    status = bo.get(FACTOR).json()
    assert status["enrolled"] is True and status["recovery_codes_left"] == 10
    assert "recovery_codes" not in status and secret not in json.dumps(status)

    stored = owner_sql("select secret_sealed, pending_sealed from staff_factors where email = $1",
                       STAFF)[0]
    assert stored["pending_sealed"] is None and secret not in stored["secret_sealed"]
    hashes = [r["code_hash"] for r in owner_sql(
        "select code_hash from staff_recovery_codes where email = $1", STAFF)]
    assert len(hashes) == 10
    for c in codes:
        assert all(second_factor.normalise(c) not in h for h in hashes)
    assert [json.loads(e["detail"]) for e in audit("staff.factor_enrolled")] == [{}]


def test_the_person_is_emailed_when_the_authenticator_is_set_up(provider, bo, clock):  # noqa: F811
    sent, _ = provider
    enrol(bo, clock)
    mails = [m for m in sent if "authenticator" in m["body"]["subject"].lower()]
    assert len(mails) == 1
    body = mails[0]["body"]
    assert body["to"] == [STAFF] and "تطبيق المصادقة" in body["subject"]
    assert "hello@alyr.qa" in body["text"] and 'dir="rtl"' in body["html"]
    assert "QAR" not in body["text"] and "…" not in body["text"]


def test_a_second_factor_is_not_asked_for_while_it_is_off(bo, clock):
    enrol(bo, clock)
    sign_in_again(bo)  # no code needed to open the back office
    assert bo.get(f"{ADMIN}/today").status_code == 200


# ── replay, drift and guessing ────────────────────────────────────────────────────────────────


def test_a_code_works_once_and_a_replay_is_refused(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    clock.advance(30)
    right = code(clock, secret)
    assert post(bo, "/verify", code=right).status_code == 200
    sign_in_again(bo)
    assert post(bo, "/verify", code=right).status_code == 401  # the same code, a minute later
    clock.advance(30)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200


def test_the_code_used_to_set_it_up_cannot_be_used_again(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 401


def test_a_code_from_the_step_before_or_after_is_accepted_two_steps_off_is_not(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    clock.advance(60)  # two steps on from the setup
    assert post(bo, "/verify", code=code(clock, secret, -2)).status_code == 401  # the setup's own
    sign_in_again(bo)
    assert post(bo, "/verify", code=code(clock, secret, 2)).status_code == 401
    sign_in_again(bo)
    assert post(bo, "/verify", code=code(clock, secret, -1)).status_code == 200
    sign_in_again(bo)
    assert post(bo, "/verify", code=code(clock, secret, 1)).status_code == 200


def test_two_tries_with_one_code_at_once_spend_it_once(bo, clock):
    secret, _ = enrol(bo, clock)
    tokens = []
    for _ in range(2):
        sign_in_again(bo)
        tokens.append(bo.cookies.get(auth.COOKIE))
    clock.advance(30)
    right = code(clock, secret)

    async def race():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async def attempt(token):
                try:
                    await second_factor.verify(db, STAFF, right, token)
                except second_factor.FactorError:
                    return "refused"
                return "accepted"

            return await asyncio.gather(*(attempt(t) for t in tokens))
        finally:
            await db.close()

    assert sorted(asyncio.run(race())) == ["accepted", "refused"]


def test_five_wrong_codes_stop_the_account_for_ten_minutes_even_for_the_right_one(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    clock.advance(30)
    for _ in range(5):
        assert post(bo, "/verify", code="000000").status_code == 401
    paused = post(bo, "/verify", code=code(clock, secret))
    assert paused.status_code == 429 and 1 <= int(paused.headers["retry-after"]) <= 600
    # Ten minutes later it is let back in.
    owner_sql("update rate_hits set at = now() - interval '11 minutes' where bucket = $1",
              second_factor.BUCKET)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200


def test_twenty_wrong_codes_in_a_day_stop_it_for_the_day(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    clock.advance(30)
    # Nineteen a while ago, spread out; the twentieth now.
    for _ in range(19):
        owner_sql(
            "insert into rate_hits (bucket, key, at) values ($1, encode(sha256($2::bytea), 'hex'), "
            "now() - interval '3 hours')", second_factor.BUCKET, STAFF.encode(),
        )
    assert post(bo, "/verify", code="000000").status_code == 401
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 429
    owner_sql("update rate_hits set at = now() - interval '25 hours' where bucket = $1",
              second_factor.BUCKET)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200


def test_a_burst_of_wrong_codes_is_counted_exactly_and_announced_once(bo, clock, monkeypatch):
    enrol(bo, clock)
    sign_in_again(bo)
    token = bo.cookies.get(auth.COOKIE)

    async def storm():
        db = Database(APP_DSN)
        await db.connect()
        try:
            async def guess():
                try:
                    await second_factor.verify(db, STAFF, "000000", token)
                except second_factor.FactorError:
                    return "refused"
                return "accepted"

            return await asyncio.gather(*(guess() for _ in range(30)))
        finally:
            await db.close()

    assert set(asyncio.run(storm())) == {"refused"}
    count = owner_sql("select count(*) as n from rate_hits where bucket = $1",
                      second_factor.BUCKET)[0]["n"]
    assert count == second_factor.SHORT.count
    post(bo, "/verify", code="000000")
    post(bo, "/verify", code="000000")
    assert len(audit("staff.factor_paused")) == 1


# ── sessions ──────────────────────────────────────────────────────────────────────────────────


def test_passing_the_factor_gives_a_new_cookie_and_the_old_one_dies(bo, clock):
    secret, _ = enrol(bo, clock)
    sign_in_again(bo)
    before = bo.cookies.get(auth.COOKIE)
    clock.advance(30)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200
    after = bo.cookies.get(auth.COOKIE)
    assert after and after != before
    rows = owner_sql("select token_hash from sessions where token_hash = any($1)",
                     [auth.token_hash(before), auth.token_hash(after)])
    assert [r["token_hash"] for r in rows] == [auth.token_hash(after)]
    # The session keeps the start it had: passing the factor does not give back the 12 hours.
    started = owner_sql("select created_at, second_factor_at from sessions where token_hash = $1",
                        auth.token_hash(after))[0]
    assert started["second_factor_at"] > started["created_at"]


def test_a_cookie_planted_before_sign_in_is_never_the_one_that_ends_up_signed_in(
    bo, clock, monkeypatch,
):
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")
    get_settings.cache_clear()
    planted = "attacker-chose-this-value-0123456789abcdef"
    planted_cookie = {"cookie": f"{auth.COOKIE}={planted}"}
    asked = bo.post("/api/auth/code", json={"email": STAFF}, headers=planted_cookie)
    answer = bo.post(
        "/api/auth/verify", json={"email": STAFF, "code": asked.json()["dev_code"]},
        headers=planted_cookie,
    )
    assert answer.status_code == 200
    assert bo.cookies.get(auth.COOKIE) != planted
    assert owner_sql("select count(*) as n from sessions where token_hash = $1",
                     auth.token_hash(planted))[0]["n"] == 0
    # The planted value, presented on its own, opens nothing.
    assert bo.get(FACTOR, headers=planted_cookie).status_code == 401
    assert bo.get(f"{ADMIN}/today", headers=planted_cookie).status_code == 401


def test_a_session_from_before_the_factor_changed_stops_counting(bo, clock, monkeypatch):
    secret, _ = enrol(bo, clock)
    require(monkeypatch)
    # This session passed the factor when it was set up.
    assert bo.get(f"{ADMIN}/today").status_code == 200
    other = bo.cookies.get(auth.COOKIE)
    # Replace the factor from another browser.
    bo.cookies.clear()
    sign_in_from(bo)
    clock.advance(30)
    begun = post(bo, "/begin", current=code(clock, secret))
    assert begun.status_code == 200 and begun.json()["replacing"] is True
    clock.advance(30)
    assert post(bo, "/confirm", code=code(clock, begun.json()["secret"])).status_code == 200
    assert bo.get(f"{ADMIN}/today").status_code == 200  # the browser that did it
    refused = bo.get(f"{ADMIN}/today", headers={"cookie": f"{auth.COOKIE}={other}"})
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "second_factor_required"


# ── turning it off, replacing it, recovery codes ──────────────────────────────────────────────


def test_it_cannot_be_turned_off_without_a_current_code(bo, clock):
    secret, _ = enrol(bo, clock)
    assert post(bo, "/disable").status_code == 401
    assert post(bo, "/disable", current="").status_code == 401
    assert post(bo, "/disable", current="123456").status_code == 401
    assert bo.get(FACTOR).json()["enrolled"] is True
    clock.advance(30)
    assert post(bo, "/disable", current=code(clock, secret)).json()["enrolled"] is False
    assert owner_sql("select count(*) as n from staff_recovery_codes where email = $1",
                     STAFF)[0]["n"] == 0
    assert len(audit("staff.factor_removed")) == 1


def test_a_stolen_session_alone_cannot_turn_it_off_or_replace_it(bo, clock):
    secret, codes = enrol(bo, clock)
    sign_in_again(bo)  # a session that has not passed the factor
    assert post(bo, "/disable").status_code == 401
    assert post(bo, "/begin").status_code == 401
    assert post(bo, "/recovery").status_code == 401
    assert post(bo, "/confirm", code=code(clock, secret)).status_code == 409  # nothing begun
    assert bo.get(FACTOR).json()["enrolled"] is True


def test_while_it_is_required_it_cannot_be_turned_off_even_with_the_code(bo, clock, monkeypatch):
    secret, _ = enrol(bo, clock)
    require(monkeypatch)
    clock.advance(30)
    refused = post(bo, "/disable", current=code(clock, secret))
    assert refused.status_code == 403
    assert refused.json()["detail"]["code"] == "second_factor_required"
    assert bo.get(FACTOR).json()["enrolled"] is True


def test_a_replacement_started_and_abandoned_leaves_the_working_factor_as_it_was(bo, clock):
    secret, _ = enrol(bo, clock)
    clock.advance(30)
    begun = post(bo, "/begin", current=code(clock, secret))
    assert begun.status_code == 200
    sign_in_again(bo)
    clock.advance(30)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200


def test_a_replacement_retires_the_old_secret_and_the_old_recovery_codes(bo, clock):
    secret, old_codes = enrol(bo, clock)
    clock.advance(30)
    begun = post(bo, "/begin", current=code(clock, secret)).json()
    clock.advance(30)
    confirmed = post(bo, "/confirm", code=code(clock, begun["secret"])).json()
    assert confirmed["replaced"] is True and set(confirmed["recovery_codes"]) != set(old_codes)
    sign_in_again(bo)
    clock.advance(30)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 401  # the old app
    assert post(bo, "/verify", code=old_codes[0]).status_code == 401
    assert post(bo, "/verify", code=code(clock, begun["secret"])).status_code == 200
    assert len(audit("staff.factor_replaced")) == 1


def test_a_recovery_code_works_once_and_says_so_in_the_audit_log_and_by_email(
    provider, bo, clock,  # noqa: F811
):
    sent, _ = provider
    secret, codes = enrol(bo, clock)
    sign_in_again(bo)
    used = post(bo, "/verify", code=codes[0].lower().replace("-", " "))
    assert used.status_code == 200 and used.json()["used"] == "recovery"
    assert used.json()["recovery_codes_left"] == 9
    sign_in_again(bo)
    assert post(bo, "/verify", code=codes[0]).status_code == 401
    assert post(bo, "/verify", code=codes[1]).status_code == 200
    assert len(audit("staff.factor_recovery_used")) == 2
    mails = [m for m in sent if "recovery code was used" in m["body"]["subject"]]
    assert len(mails) == 2 and "استُخدم رمز استرداد" in mails[0]["body"]["subject"]
    assert secret not in json.dumps(sent)


def test_new_recovery_codes_need_a_current_code_and_end_the_old_ones(bo, clock):
    secret, old = enrol(bo, clock)
    assert post(bo, "/recovery", current="").status_code == 401
    clock.advance(30)
    new = post(bo, "/recovery", current=code(clock, secret)).json()["recovery_codes"]
    assert len(new) == 10 and not set(new) & set(old)
    sign_in_again(bo)
    assert post(bo, "/verify", code=old[0]).status_code == 401
    assert post(bo, "/verify", code=new[0]).status_code == 200
    assert len(audit("staff.factor_recovery_new")) == 1


def test_a_wrong_recovery_code_counts_as_a_wrong_code(bo, clock):
    enrol(bo, clock)
    sign_in_again(bo)
    for _ in range(5):
        assert post(bo, "/verify", code="ABCD-EFGH-JKLM").status_code == 401
    assert post(bo, "/verify", code="ABCD-EFGH-JKLM").status_code == 429


# ── required: the back office itself ──────────────────────────────────────────────────────────


def test_when_required_the_back_office_refuses_a_session_that_has_not_passed_the_factor(
    bo, clock, monkeypatch,
):
    secret, _ = enrol(bo, clock)
    require(monkeypatch)
    sign_in_again(bo)
    for path in ("/today", "/staff", "/audit", "/businesses", "/clients", "/onboarding"):
        refused = bo.get(f"{ADMIN}{path}")
        assert refused.status_code == 403, path
        detail = refused.json()["detail"]
        assert detail["code"] == "second_factor_required" and detail["enrolled"] is True
    assert bo.post(f"{ADMIN}/staff", json={"email": "x@alyr.qa"}).status_code == 403
    # The rest of the workspace, and the person's own sign-in, are not held up by it.
    assert bo.get("/api/auth/me").json()["signed_in"] is True
    clock.advance(30)
    assert post(bo, "/verify", code=code(clock, secret)).status_code == 200
    assert bo.get(f"{ADMIN}/today").status_code == 200
    assert bo.get(f"{ADMIN}/staff").status_code == 200


def test_when_required_a_member_of_staff_with_none_cannot_enrol_by_themselves(
    bo, clock, monkeypatch,
):
    sign_in_from(bo)
    require(monkeypatch)
    refused = bo.get(f"{ADMIN}/today")
    assert refused.status_code == 403
    assert refused.json()["detail"] == {
        "code": "second_factor_required", "message": refused.json()["detail"]["message"],
        "enrolled": False, "enrolment_open": False,
    }
    closed = post(bo, "/begin")
    assert closed.status_code == 403 and closed.json()["detail"]["code"] == "enrolment_closed"
    assert post(bo, "/verify", code="123456").status_code == 409
    # The break-glass opens a window; with it, they can enrol, and are in.
    owner_sql("insert into staff_factors (email, enrol_open_until) values ($1, now() + interval "
              "'30 minutes')", STAFF)
    assert bo.get(f"{ADMIN}/today").json()["detail"]["enrolment_open"] is True
    secret = post(bo, "/begin").json()["secret"]
    assert post(bo, "/confirm", code=code(clock, secret)).status_code == 200
    assert bo.get(f"{ADMIN}/today").status_code == 200


def test_an_enrolment_window_that_has_run_out_is_closed(bo, clock, monkeypatch):
    sign_in_from(bo)
    require(monkeypatch)
    owner_sql("insert into staff_factors (email, enrol_open_until) values ($1, now() - interval "
              "'1 minute')", STAFF)
    assert post(bo, "/begin").status_code == 403


def test_the_open_local_demo_is_not_a_person_and_is_not_asked(client_factory, monkeypatch, clock):
    require(monkeypatch)
    client = client_factory()
    assert client.get(f"{ADMIN}/today").status_code == 200
    assert client.get(FACTOR).status_code == 400  # no person to have a factor


def test_somebody_who_is_not_staff_cannot_use_the_factor_routes(bo, clock):
    owner_sql("delete from platform_admins where email = $1", STAFF)
    sign_in_from(bo)
    assert bo.get(FACTOR).status_code == 403
    assert post(bo, "/begin").status_code == 403
    make_staff()
