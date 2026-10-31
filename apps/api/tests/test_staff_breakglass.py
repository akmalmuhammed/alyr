"""The break-glass script (ALY-125, D-135): the founder-run way back in when the normal door is
shut. It must work, leave a record, and refuse anything outside its short list."""

import asyncio
import json

import pytest

from alyr import staff_breakglass
from alyr.config import get_settings
from alyr.core import staff_security
from alyr.seed import OWNER_EMAIL
from conftest import OWNER_DSN
from test_consent import owner_sql
from test_sign_in import code_for
from test_staff_second_factor import (  # noqa: F401  (bo and clock are fixtures)
    ADMIN,
    FACTOR,
    bo,
    clock,
    code,
    enrol,
    post,
    require,
    sign_in_again,
)
from test_staff_sign_in import (  # noqa: F401  (office is a fixture)
    STAFF,
    audit,
    lock_account,
    office,
    sign_in_from,
)


def run(command, email=STAFF, reason=""):
    return asyncio.run(staff_breakglass.run(OWNER_DSN, command, email, reason))


def test_status_says_where_the_account_stands_and_writes_nothing(office):  # noqa: F811
    lock_account(office)
    answer = run("status")
    assert answer["locked"] is True and answer["cap"] == staff_security.WRONG_CODES_PER_DAY
    assert answer["wrong_codes_in_24_hours"] == staff_security.WRONG_CODES_PER_DAY
    assert answer["recent"][0]["action"] == "staff.locked"
    assert audit("staff.breakglass", staff_breakglass.ACTOR) == []
    # Counts and flags only: no code, no hash, no secret.
    text = json.dumps(answer)
    for row in owner_sql("select code_hash from login_codes where email = $1", STAFF):
        assert row["code_hash"] not in text


def test_clear_lock_lets_the_right_code_in_again_and_voids_the_codes_still_open(office):  # noqa: F811
    lock_account(office)
    held = code_for(office, STAFF)  # a code an attacker could be holding
    assert sign_in_from(office).status_code == 401
    answer = run("clear-lock", reason="locked out by wrong codes")
    assert answer["wrong_codes_cleared"] == staff_security.WRONG_CODES_PER_DAY
    assert answer["codes_voided"] >= 1
    # The held code died with the lock.
    assert office.post("/api/auth/verify", json={"email": STAFF, "code": held}).status_code == 401
    assert sign_in_from(office).status_code == 200


def test_clear_lock_also_forgets_the_authenticators_wrong_codes(bo, clock):  # noqa: F811
    enrol(bo, clock)
    sign_in_again(bo)
    for _ in range(5):
        assert post(bo, "/verify", code="000000").status_code == 401
    assert post(bo, "/verify", code="000000").status_code == 429
    answer = run("clear-lock", reason="paused authenticator")
    assert answer["authenticator_wrong_codes_cleared"] == 5
    assert post(bo, "/verify", code="000000").status_code == 401  # counted again from one


def test_clear_lock_is_in_the_audit_log_with_the_reason_and_the_count(office):  # noqa: F811
    lock_account(office)
    run("clear-lock", reason="  locked   out\nby wrong codes ")
    entries = audit("staff.breakglass", staff_breakglass.ACTOR)
    assert len(entries) == 1
    detail = json.loads(entries[0]["detail"])
    assert detail["command"] == "clear-lock" and detail["reason"] == "locked out by wrong codes"
    assert detail["wrong_codes_cleared"] == staff_security.WRONG_CODES_PER_DAY
    row = owner_sql(
        "select staff_email, subject_id from platform_audit where action = 'staff.breakglass' "
        "order by id desc limit 1")[0]
    assert (row["staff_email"], row["subject_id"]) == (staff_breakglass.ACTOR, STAFF)


@pytest.mark.parametrize("command, email, reason, why", [
    ("clear-lock", STAFF, "", "a reason is needed"),
    ("clear-lock", STAFF, "x" * 81, "80 characters at most"),
    ("clear-lock", OWNER_EMAIL, "not staff", "not on the ALYR staff list"),
    ("clear-lock", "nobody@nowhere.example", "no such person", "not on the ALYR staff list"),
    ("status", OWNER_EMAIL, "", "not on the ALYR staff list"),
    ("delete-everything", STAFF, "because", "unknown command"),
])
def test_it_refuses_what_is_not_on_its_short_list(office, command, email, reason, why):  # noqa: F811
    lock_account(office)
    with pytest.raises(staff_breakglass.Refused, match=why):
        run(command, email, reason)
    # A refusal changes nothing: the account is still locked and nothing was written.
    assert run("status")["locked"] is True
    assert audit("staff.breakglass", staff_breakglass.ACTOR) == []


def test_the_command_line_prints_json_and_exits_cleanly_or_with_2(office, capsys, monkeypatch):  # noqa: F811
    monkeypatch.setenv("ALYR_MIGRATION_URL", OWNER_DSN)
    from alyr.config import get_settings

    get_settings.cache_clear()
    assert staff_breakglass.main(["status", STAFF]) == 0
    assert json.loads(capsys.readouterr().out)["email"] == STAFF
    assert staff_breakglass.main(["clear-lock", STAFF]) == 2
    assert "refused: a reason is needed" in capsys.readouterr().err


# ── the second factor (D-136) ─────────────────────────────────────────────────────────────────


def test_status_shows_the_second_factor_without_a_secret_or_a_code(bo, clock):  # noqa: F811
    secret, codes = enrol(bo, clock)
    shown = run("status")["second_factor"]
    assert shown["enrolled"] is True and shown["recovery_codes_left"] == 10
    assert shown["setup_started"] is False and shown["enrolment_open_until"] is None
    text = json.dumps(run("status"))
    assert secret not in text and all(c not in text for c in codes)


def test_reset_factor_removes_it_ends_every_session_and_is_logged(
    bo, clock, monkeypatch,  # noqa: F811
):
    enrol(bo, clock)
    sign_in_again(bo)
    monkeypatch.setenv("ALYR_DEMO_OPEN", "false")  # so a session that is gone is just refused
    get_settings.cache_clear()
    answer = run("reset-factor", reason="lost phone, no recovery codes")
    assert answer["factor_removed"] is True and answer["recovery_codes_removed"] == 10
    assert answer["sessions_ended"] >= 2
    assert bo.get(FACTOR).status_code == 401  # the session is gone
    assert owner_sql("select count(*) as n from staff_factors where email = $1",
                     STAFF)[0]["n"] == 0
    assert run("status")["second_factor"]["enrolled"] is False
    detail = json.loads(audit("staff.breakglass", staff_breakglass.ACTOR)[0]["detail"])
    assert detail["command"] == "reset-factor" and detail["sessions_ended"] >= 2


def test_after_a_reset_while_required_only_an_open_window_lets_the_person_enrol_again(
    bo, clock, monkeypatch,  # noqa: F811
):
    enrol(bo, clock)
    run("reset-factor", reason="lost phone")
    require(monkeypatch)
    sign_in_from(bo)
    assert bo.get(f"{ADMIN}/today").status_code == 403
    assert post(bo, "/begin").status_code == 403  # closed
    opened = run("open-enrolment", reason="enrol a new phone")
    assert opened["enrolment_open_until"]
    secret = post(bo, "/begin").json()["secret"]
    assert post(bo, "/confirm", code=code(clock, secret)).status_code == 200
    assert bo.get(f"{ADMIN}/today").status_code == 200
    # The window shut behind them: it does not stay open for the next stranger.
    assert run("status")["second_factor"]["enrolment_open_until"] is None


def test_open_enrolment_is_refused_while_a_working_authenticator_exists(bo, clock):  # noqa: F811
    enrol(bo, clock)
    with pytest.raises(staff_breakglass.Refused, match="working authenticator"):
        run("open-enrolment", reason="try")
    assert run("status")["second_factor"]["enrolment_open_until"] is None


def test_the_new_commands_need_a_reason_and_a_staff_address(bo):  # noqa: F811
    for command in ("reset-factor", "open-enrolment"):
        with pytest.raises(staff_breakglass.Refused, match="a reason is needed"):
            run(command)
        with pytest.raises(staff_breakglass.Refused, match="not on the ALYR staff list"):
            run(command, OWNER_EMAIL, "not staff")
    assert audit("staff.breakglass", staff_breakglass.ACTOR) == []


def test_ready_says_whether_the_second_factor_can_be_required_without_a_lockout(bo, clock):  # noqa: F811
    owner_sql("delete from platform_admins where email <> $1", STAFF)
    try:
        with pytest.raises(staff_breakglass.Refused, match="not ready: .*would be locked out"):
            run("ready", email="")
        secret, codes = enrol(bo, clock)
        answer = run("ready", email="")
        assert answer == {"ready": True, "staff": [
            {"email": STAFF, "enrolled": True, "recovery_codes_left": 10}]}
        # No recovery code left is not ready either: one lost phone and the account is gone.
        owner_sql("update staff_recovery_codes set used_at = now() where email = $1", STAFF)
        with pytest.raises(staff_breakglass.Refused, match="not ready"):
            run("ready", email="")
        assert audit("staff.breakglass", staff_breakglass.ACTOR) == []  # it only reads
        assert secret and codes
    finally:
        owner_sql("insert into platform_admins (email) values ('ops@alyr.example') "
                  "on conflict do nothing")


def test_every_other_command_needs_an_address(bo):  # noqa: F811
    for command in ("status", "clear-lock", "reset-factor", "open-enrolment"):
        with pytest.raises(staff_breakglass.Refused):
            run(command, email="", reason="why")
