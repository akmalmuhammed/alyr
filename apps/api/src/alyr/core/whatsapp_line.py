"""A business's WhatsApp line after its number is attached (ALY-166, spec 060, D-145).

Attaching a number (`whatsapp_attach.py`) proves Meta knows it. It does not prove that a customer's
message reaches ALYR or that ALYR's reply reaches a phone. The line check and the test message do:

* **The check** asks Meta about the number (connected? on the account we were given?), whether
  our app is subscribed to that account's webhooks, and looks in our own records for a customer's
  message that has arrived. It sends nothing to anyone and changes nothing at Meta.
* **The test message** is an ordinary text, sent through the outbound layer (hard rule 5: consent,
  the 24-hour window, billing) to a member of the shop's own staff who has linked their phone
  (`staff_link.py`) and written to this line in the last 24 hours. Sending it is how ALYR proves the
  way out; the staff member writing first is how it proves the way in.

Every attach, detach, check and test is one row in `whatsapp_line_events`, the line's own trail. The
rows hold states and counts: never a customer's name, number or words.

Meta calls are made outside any database transaction: a slow Meta must not hold a connection.
Functions that take a connection need one scoped to the business.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg
import httpx

from alyr.channels.base import OutboundMessage
from alyr.channels.meta import MetaChannel, describe_error
from alyr.core.outbound import Outbound

# Where a line stands, in the order a person reads it. `working` needs a customer's message to
# have arrived and a message of ours to have gone out; `waiting` is every check passing with
# one of those still to happen; `problem` is a check that failed or a test that did not go.
STATES = ("no_number", "unchecked", "problem", "waiting", "working")
SENT = ("sent", "delivered", "read")


class LineError(Exception):
    """A request about a line that cannot be carried out; the message is safe to show staff."""


@dataclass(frozen=True)
class Line:
    tenant_id: UUID
    number_id: str
    waba_id: str
    display_phone: str


async def find(conn: asyncpg.Connection) -> Line | None:
    """The business's Meta line, or None when no number is attached."""
    row = await conn.fetchrow(
        "select tenant_id, number_id, coalesce(waba_id, '') as waba_id, display_phone "
        "from channel_numbers where channel = 'meta' "
        "and tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    return Line(**dict(row)) if row else None


async def record(
    conn: asyncpg.Connection, number_id: str, kind: str, actor: str,
    ok: bool | None = None, detail: dict | None = None,
) -> None:
    """Add one row to the line's trail. Call it in the transaction of the change."""
    await conn.execute(
        "insert into whatsapp_line_events (number_id, kind, ok, actor, detail) "
        "values ($1, $2, $3, $4, $5)",
        number_id, kind, ok, actor, detail or {},
    )


# ── the check ─────────────────────────────────────────────────────────────────────────────


def _ok(key: str, ok: bool | None, value: str = "", error: str = "") -> dict:
    return {"key": key, "ok": ok, "value": value, **({"error": error} if error else {})}


async def probe(
    channel: MetaChannel, line: Line, app_id: str
) -> tuple[list[dict], dict | None]:
    """Ask Meta about the line. Each answer is one entry: `ok` true, false, or null for "cannot
    tell yet". A Meta that does not answer fails the check it was asked for and no other. Also
    answers what Meta said about the number, for its health (spec 062), or None if it did not."""
    checks: list[dict] = []
    try:
        info = await channel.number_health(line.number_id)
    except httpx.HTTPError as error:
        # One refusal (the token, the number ID) would be repeated by every later question, so
        # ask no more: the account and the webhook cannot be checked without the number.
        checks.append(_ok("number", False, "error", describe_error(error)))
        return checks, None
    status = str(info.get("status", ""))
    checks.append(_ok("number", status == "CONNECTED", status or "UNKNOWN"))

    if not line.waba_id:
        checks += [_ok("account", None, "no_account_id"), _ok("webhook", None, "no_account_id")]
        return checks, info
    try:
        listed = line.number_id in await channel.account_number_ids(line.waba_id)
        checks.append(_ok("account", listed, "listed" if listed else "not_listed"))
    except httpx.HTTPError as error:
        checks.append(_ok("account", False, "error", describe_error(error)))
    try:
        apps = await channel.subscribed_app_ids(line.waba_id)
        if not apps:
            checks.append(_ok("webhook", False, "not_subscribed"))
        elif app_id and app_id not in apps:
            checks.append(_ok("webhook", False, "other_app"))
        else:
            checks.append(_ok("webhook", True, "subscribed"))
    except httpx.HTTPError as error:
        checks.append(_ok("webhook", False, "error", describe_error(error)))
    return checks, info


async def local_checks(conn: asyncpg.Connection, line: Line) -> list[dict]:
    """What our own records say: has a customer's message arrived on this number, and has one of
    ours gone out. Only times and counts are read, never what anyone wrote."""
    last = await conn.fetchval(
        "select max(last_inbound_at) from contacts where number_id = $1", line.number_id
    )
    sent = await conn.fetchval(
        "select count(*) from messages m join contacts c on c.id = m.contact_id "
        "where m.direction = 'out' and m.status = any($1) and c.number_id = $2",
        list(SENT), line.number_id,
    )
    return [
        _ok("inbound", True if last else None, last.isoformat() if last else ""),
        _ok("outbound", True if sent else None, str(sent)),
    ]


def verdict(checks: list[dict]) -> bool:
    """False when any check failed, otherwise true: a check that cannot tell is no failure."""
    return all(c["ok"] is not False for c in checks) and any(
        c["key"] == "number" and c["ok"] for c in checks
    )


async def save_check(
    conn: asyncpg.Connection, line: Line, checks: list[dict], actor: str
) -> bool:
    ok = verdict(checks)
    await conn.execute(
        "insert into whatsapp_line_state (number_id, checked_at, check_ok, checks) "
        "values ($1, now(), $2, $3) on conflict (tenant_id, number_id) do update set "
        "checked_at = now(), check_ok = excluded.check_ok, checks = excluded.checks",
        line.number_id, ok, checks,
    )
    failed = [c["key"] for c in checks if c["ok"] is False]
    await record(conn, line.number_id, "checked", actor, ok, {"failed": failed})
    return ok


async def forget(conn: asyncpg.Connection, number_id: str) -> None:
    """The number was detached: its check, test and health no longer describe anything. The trail
    stays."""
    await conn.execute("delete from whatsapp_line_state where number_id = $1", number_id)
    await conn.execute("delete from whatsapp_line_health where number_id = $1", number_id)
    await conn.execute("delete from channel_credentials where number_id = $1", number_id)


# ── the test message ──────────────────────────────────────────────────────────────────────


_TEST = {
    "en": "ALYR line test for {shop}: this message came from your business's WhatsApp number. "
          "There is nothing for you to do.",
    "ar": "‏اختبار خط ALYR لـ {shop}: وصلتك هذه الرسالة من رقم واتساب نشاطك. "
          "لا يلزمك فعل أي شيء.",
}


def message_for_test(shop: str, lang: str) -> str:
    return _TEST["ar" if lang == "ar" else "en"].format(shop=shop)


def mask(phone: str) -> str:
    """A phone number as its last four digits: staff can tell two apart without the number."""
    digits = "".join(c for c in phone if c.isdigit())
    return f"•••• {digits[-4:]}" if len(digits) >= 4 else "••••"


async def testers(conn: asyncpg.Connection, line: Line) -> list[dict]:
    """The shop's own staff who have linked their phone and written to this line. Only they may be
    sent a test: a customer is never picked by ALYR staff to receive one."""
    rows = await conn.fetch(
        "select id, name, phone, last_inbound_at, "
        "coalesce(last_inbound_at > now() - interval '24 hours', false) as window_open "
        "from contacts where role = 'staff' and number_id = $1 "
        "order by last_inbound_at desc nulls last",
        line.number_id,
    )
    return [
        {"id": str(r["id"]),
         # A contact with no WhatsApp name is stored under its number: show it masked.
         "label": mask(r["phone"] or "") if (r["name"] or "") in ("", r["phone"]) else r["name"],
         "phone": mask(r["phone"] or ""), "window_open": r["window_open"],
         "last_inbound_at": r["last_inbound_at"].isoformat() if r["last_inbound_at"] else None}
        for r in rows
    ]


async def send_test(
    conn: asyncpg.Connection, outbound: Outbound, line: Line, contact_id: UUID, actor: str
) -> dict:
    """Send the test text to one staff member through the outbound layer and note it on the line.
    Refused, with the reason, when the person is not staff on this line or their window is shut."""
    person = await conn.fetchrow(
        "select id, lang, role, number_id, "
        "coalesce(last_inbound_at > now() - interval '24 hours', false) as window_open "
        "from contacts where id = $1", contact_id,
    )
    if person is None or person["role"] != "staff" or person["number_id"] != line.number_id:
        raise LineError("Only a member of this shop's staff who has written to this number can "
                        "be sent a test.")
    if not person["window_open"]:
        raise LineError("Their last message to this number is more than 24 hours old. Ask them "
                        "to send any message to it from their phone, then try again.")
    shop = await conn.fetchrow(
        "select name, name_ar from tenants "
        "where id = nullif(current_setting('app.tenant_id', true), '')::uuid"
    )
    arabic = person["lang"] == "ar"
    name = (shop["name_ar"] if arabic and shop["name_ar"] else shop["name"])
    sent = await outbound.send(conn, OutboundMessage(
        to=contact_id, body=message_for_test(name, person["lang"]), lang=person["lang"]))
    await conn.execute(
        "insert into whatsapp_line_state (number_id, test_message_id, test_at, test_by) "
        "values ($1, $2, now(), $3) on conflict (tenant_id, number_id) do update set "
        "test_message_id = excluded.test_message_id, test_at = now(), test_by = excluded.test_by",
        line.number_id, sent.message_id, actor,
    )
    await record(conn, line.number_id, "test_sent", actor, sent.blocked is None,
                 {"blocked": sent.blocked} if sent.blocked else {})
    # A refusal is an answer, not an error: it is recorded, and the screen shows the reason.
    return {"message_id": str(sent.message_id), "blocked": sent.blocked}


# ── how a line reads ──────────────────────────────────────────────────────────────────────


def test_info(status: str | None, error: str | None, at: datetime | None, by: str) -> dict | None:
    if at is None:
        return None
    return {"status": status or "unknown", "error": error or "", "at": at.isoformat(),
            "by": by, "ok": status in SENT}


def state_of(
    check_ok: bool | None, checks: list[dict], test: dict | None, severity: str = "unknown"
) -> str:
    """Where one attached line stands. A failed check, a test that did not go, or a number Meta
    has flagged or restricted (spec 062) is a problem, whether or not it has been checked."""
    if severity == "critical":
        return "problem"
    if check_ok is None:
        return "unchecked"
    if check_ok is False or (test is not None and test["status"] in ("failed", "blocked")):
        return "problem"
    seen = {c["key"]: c["ok"] for c in checks}
    return "working" if seen.get("inbound") and seen.get("outbound") else "waiting"


def row_view(r: asyncpg.Record) -> dict:
    """One row of `admin_whatsapp_lines()` as the back office reads it."""
    checks = r["checks"] if isinstance(r["checks"], list) else []
    test = test_info(r["test_status"], r["test_error"], r["test_at"], r["test_by"])
    # Imported here: the health module uses this one.
    from alyr.core import whatsapp_health

    health = whatsapp_health.view(r)
    return {
        "business_id": str(r["tenant_id"]), "name": r["name"], "slug": r["slug"],
        "client_id": str(r["client_id"]) if r["client_id"] else None,
        "number_id": r["number_id"], "waba_id": r["waba_id"] or "",
        "display_phone": r["display_phone"],
        "attached_at": r["attached_at"].isoformat() if r["attached_at"] else None,
        "attached_by": r["attached_by"],
        "state": state_of(r["check_ok"], checks, test, health["severity"]),
        "health": health,
        # Whose token this line is sent with, and when a business's own token ends (spec 063).
        "credential": {"kind": r["credential"], "expires_at": (
            r["credential_expires_at"].isoformat() if r["credential_expires_at"] else None)},
        "checked_at": r["checked_at"].isoformat() if r["checked_at"] else None,
        "checks": checks, "test": test,
        "last_inbound_at": r["last_inbound_at"].isoformat() if r["last_inbound_at"] else None,
        "staff_numbers": r["staff_numbers"],
    }


async def trail(conn: asyncpg.Connection, limit: int = 50) -> list[dict]:
    rows = await conn.fetch(
        "select at, kind, ok, actor, detail, number_id from whatsapp_line_events "
        "order by at desc, id desc limit $1", limit,
    )
    return [{"at": r["at"].isoformat(), "kind": r["kind"], "ok": r["ok"], "actor": r["actor"],
             "detail": r["detail"], "number_id": r["number_id"]} for r in rows]
