"""The break-glass script (ALY-125, D-135): the founder-run way back in when the normal door is
shut. It must work, leave a record, and refuse anything outside its short list."""

import asyncio
import json

import pytest

from alyr import staff_breakglass
from alyr.core import staff_security
from alyr.seed import OWNER_EMAIL
from conftest import OWNER_DSN
from test_consent import owner_sql
from test_sign_in import code_for
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
