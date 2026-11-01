"""The health of a business's WhatsApp number (ALY-166, spec 062, D-147).

Two kinds of fact arrive from Meta. About the **number**: its quality rating, its status (connected,
flagged, restricted), the messaging limit its tier allows, how its display name fared. About the
**account** the number is on: a restriction, a policy violation, a disable scheduled or lifted, a
review decision, a partner removed. Meta reports the first by reading (`GET /{number-id}`) and by
notices (`phone_number_quality_update`, `phone_number_name_update`, `account_alerts`); the second
only by notices (`account_update`, `account_review_update`). Fields and values checked against
Meta's webhook reference and phone number pages on 31 Oct 2026 (linked from
docs/runbooks/whatsapp-line.md).

What ALYR makes of it is `evaluate`: a severity (`ok`, `attention`, `critical`, or `unknown` before
Meta has said anything) and the reasons behind it, each with a level and a scope (the number, or the
whole account). A restriction on ALYR's shared account is one thing for the founder to look at, not
one per shop, so the back office groups account-scoped reasons by account.

Account facts are kept for every business whose number is on the account, so row-level security
stays the plain rule (as for templates, spec 061). Only states and Meta's own words are kept.

Meta is read outside any database transaction. Functions that take a connection need one scoped to
the business.
"""

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta

import asyncpg
import httpx

from alyr.channels.meta import MetaChannel, describe_error
from alyr.core import whatsapp_line
from alyr.db import Database

log = logging.getLogger("alyr.whatsapp_health")

# A number's status as Meta shows it. Meta's phone number page does not list the values; these are
# the ones its help pages and partners describe, and anything else is shown as it came and counted
# as worth a look rather than as an emergency.
CRITICAL_STATUS = ("FLAGGED", "RESTRICTED", "BANNED", "DELETED", "DISCONNECTED")
# A policy-violation notice is a warning until restrictions follow; it counts for this long.
VIOLATION_DAYS = 30
# A business's own token is shown as worth a look this long before it ends.
TOKEN_WARN_DAYS = 14
SEVERITIES = ("unknown", "ok", "attention", "critical")


def digits(text: object) -> str:
    return re.sub(r"\D", "", str(text or ""))


def _when(value: object) -> datetime | None:
    """A time Meta or we wrote down: a Unix time in seconds, or an ISO string."""
    try:
        if isinstance(value, int | float) or (isinstance(value, str) and value.isdigit()):
            return datetime.fromtimestamp(int(value), UTC)
        if isinstance(value, str) and value:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (ValueError, OverflowError, OSError):
        return None
    return None


# ── what ALYR makes of it ─────────────────────────────────────────────────────────────────


def evaluate(
    number: dict, account: dict, now: datetime, heard: bool, token_expires: datetime | None = None
) -> tuple[str, list[dict], datetime | None]:
    """The severity of a line, the reasons behind it, and when to make it again (when the first
    restriction on the account runs out). `heard` is whether Meta has said anything at all.
    `token_expires` is when a business's own token ends, if it has one and Meta said (spec 063)."""
    reasons: list[dict] = []
    recheck: datetime | None = None

    def add(code: str, level: str, scope: str, value: str = "") -> None:
        reasons.append({"code": code, "level": level, "scope": scope, "value": value})

    status = number.get("number_status", "")
    if status in CRITICAL_STATUS:
        add(f"number_{status.lower()}", "critical", "number", status)
    elif status and status != "CONNECTED":
        add("number_status", "attention", "number", status)
    quality = number.get("quality_rating", "")
    if quality == "RED":
        add("quality_red", "critical", "number")
    elif quality == "YELLOW":
        add("quality_yellow", "attention", "number")
    health = number.get("health", "")
    if health == "BLOCKED":
        add("sending_blocked", "critical", "number")
    elif health == "LIMITED":
        add("sending_limited", "attention", "number")
    if number.get("name_decision") == "REJECTED":
        add("name_rejected", "attention", "number", number.get("name_reason", ""))

    for restriction in account.get("restrictions", []):
        expires = _when(restriction.get("expires"))
        if expires is None or expires > now:
            add("restricted", "critical", "account", str(restriction.get("type", "")))
            if expires is not None and (recheck is None or expires < recheck):
                recheck = expires
    ban = account.get("ban") or {}
    if ban.get("state") == "DISABLE":
        add("account_disabled", "critical", "account")
    elif ban.get("state") == "SCHEDULE_FOR_DISABLE":
        add("disable_scheduled", "critical", "account", str(ban.get("date", "")))
    violation = account.get("violation") or {}
    seen = _when(violation.get("at"))
    if violation and seen is not None and now - seen < timedelta(days=VIOLATION_DAYS):
        add("policy_violation", "attention", "account", str(violation.get("type", "")))
        until = seen + timedelta(days=VIOLATION_DAYS)
        recheck = until if recheck is None or until < recheck else recheck
    if account.get("state") in ("deleted", "partner_removed", "offboarded"):
        add(f"account_{account['state']}", "critical", "account")
    review = account.get("review", "")
    if review == "REJECTED":
        add("account_review_rejected", "critical", "account")
    elif review in ("PENDING", "DEFERRED"):
        add("account_review_pending", "attention", "account", review)
    if token_expires is not None:
        if token_expires <= now:
            add("token_expired", "critical", "number")
        else:
            warn_from = token_expires - timedelta(days=TOKEN_WARN_DAYS)
            if warn_from <= now:
                add("token_expiring", "attention", "number", token_expires.date().isoformat())
            soonest = token_expires if warn_from <= now else warn_from
            recheck = soonest if recheck is None or soonest < recheck else recheck
    for alert in account.get("alerts", []):
        if alert.get("status") == "ACTIVE" and alert.get("severity") in ("CRITICAL", "WARNING"):
            add("alert", "attention", "account", str(alert.get("type", "")))

    if any(r["level"] == "critical" for r in reasons):
        return "critical", reasons, recheck
    if reasons:
        return "attention", reasons, recheck
    return ("ok" if heard else "unknown"), reasons, recheck


# The reasons in words, for the Today list and the alert (the screen has its own).
REASON_TEXT = {
    "number_flagged": "Meta has flagged the number (low quality)",
    "number_restricted": "Meta shows the number as restricted",
    "number_banned": "Meta shows the number as banned",
    "number_deleted": "Meta shows the number as deleted",
    "number_disconnected": "Meta shows the number as disconnected",
    "number_status": "Meta shows an unusual status",
    "quality_red": "quality rating is red",
    "quality_yellow": "quality rating is yellow",
    "sending_blocked": "Meta says sending is blocked",
    "sending_limited": "Meta says sending is limited",
    "name_rejected": "the display name was rejected",
    "restricted": "the account is restricted",
    "account_disabled": "the account is disabled",
    "disable_scheduled": "the account is scheduled to be disabled",
    "policy_violation": "Meta reports a policy violation",
    "account_deleted": "the account was deleted",
    "account_partner_removed": "the business removed ALYR from its account",
    "account_offboarded": "the account was offboarded",
    "account_review_rejected": "Meta's review of the account was rejected",
    "account_review_pending": "Meta's review of the account is not decided",
    "alert": "Meta raised an alert",
    "token_expired": "the business's own WhatsApp access token has expired",
    "token_expiring": "the business's own WhatsApp access token ends within two weeks",
}


def describe(reasons: list[dict]) -> str:
    """The reasons in a sentence: "quality rating is red; the account is restricted (TYPE)"."""
    return "; ".join(
        REASON_TEXT.get(r["code"], r["code"]) + (f" ({r['value']})" if r.get("value") else "")
        for r in reasons)


# ── keeping it ────────────────────────────────────────────────────────────────────────────

_NUMBER_COLUMNS = (
    "quality_rating", "number_status", "name_status", "name_decision", "name_reason",
    "messaging_limit", "throughput", "health",
)


async def _row(conn: asyncpg.Connection, line: whatsapp_line.Line) -> asyncpg.Record:
    await conn.execute(
        "insert into whatsapp_line_health (number_id) values ($1) on conflict do nothing",
        line.number_id)
    return await conn.fetchrow(
        "select * from whatsapp_line_health where number_id = $1 for update", line.number_id)


async def _save(
    conn: asyncpg.Connection, line: whatsapp_line.Line, before: asyncpg.Record, number: dict,
    account: dict, *, polled: bool = False, heard: bool = True, actor: str = "ALYR",
) -> None:
    """Write the number's and the account's facts with the severity made from them, and put what
    changed on the line's trail: a new severity, a new quality rating, a new limit."""
    now = datetime.now(UTC)
    token_expires = await conn.fetchval(
        "select expires_at from channel_credentials where number_id = $1", line.number_id)
    severity, reasons, recheck = evaluate(number, account, now, heard, token_expires)
    await conn.execute(
        "update whatsapp_line_health set quality_rating = $2, number_status = $3, "
        "name_status = $4, name_decision = $5, name_reason = $6, messaging_limit = $7, "
        "throughput = $8, "
        "health = $9, account = $10, severity = $11, reasons = $12, recheck_at = $13, "
        "polled_at = case when $14 then now() else polled_at end, "
        "event_at = case when $14 then event_at else now() end where number_id = $1",
        line.number_id, *(number[c] for c in _NUMBER_COLUMNS), account, severity, reasons,
        recheck, polled)
    if number["quality_rating"] != before["quality_rating"] and before["quality_rating"]:
        await whatsapp_line.record(
            conn, line.number_id, "quality", actor, number["quality_rating"] in ("GREEN", "NA"),
            {"from": before["quality_rating"], "to": number["quality_rating"]})
    if number["messaging_limit"] != before["messaging_limit"] and before["messaging_limit"]:
        await whatsapp_line.record(
            conn, line.number_id, "limit", actor, None,
            {"from": before["messaging_limit"], "to": number["messaging_limit"]})
    if severity != before["severity"] and not (
        before["severity"] == "unknown" and severity == "ok"
    ):
        await whatsapp_line.record(
            conn, line.number_id, "health", actor, severity == "ok",
            {"from": before["severity"], "to": severity,
             "reasons": [r["code"] for r in reasons][:10]})


def _number(row: asyncpg.Record) -> dict:
    return {c: row[c] for c in _NUMBER_COLUMNS}


def _account(row: asyncpg.Record) -> dict:
    value = row["account"]
    return dict(value) if isinstance(value, dict) else {}


async def apply_info(
    conn: asyncpg.Connection, line: whatsapp_line.Line, info: dict, actor: str = "ALYR",
    polled: bool = True,
) -> str:
    """What Meta answered to `GET /{number-id}`: the number's status, quality rating, name status,
    and, when Meta gave them, its messaging limit, throughput and health. A field Meta did not
    answer keeps what we had. Returns the severity."""
    before = await _row(conn, line)
    number = _number(before)
    number["number_status"] = str(info.get("status") or number["number_status"])
    number["quality_rating"] = str(info.get("quality_rating") or number["quality_rating"])
    number["name_status"] = str(info.get("name_status") or number["name_status"])
    limit = info.get("whatsapp_business_manager_messaging_limit")
    number["messaging_limit"] = str(limit or number["messaging_limit"])
    throughput = info.get("throughput")
    if isinstance(throughput, dict) and throughput.get("level"):
        number["throughput"] = str(throughput["level"])
    health = info.get("health_status")
    if isinstance(health, dict) and health.get("can_send_message"):
        number["health"] = str(health["can_send_message"])
    await _save(conn, line, before, number, _account(before), polled=polled, actor=actor)
    return (await conn.fetchval(
        "select severity from whatsapp_line_health where number_id = $1", line.number_id))


async def recompute(conn: asyncpg.Connection, line: whatsapp_line.Line) -> None:
    """Make the severity again from what is kept, for a restriction that has run out since."""
    before = await _row(conn, line)
    if before["polled_at"] is None and before["event_at"] is None:
        return
    await _save(conn, line, before, _number(before), _account(before), polled=False)
    # `_save` marks an event; this was not one.
    await conn.execute(
        "update whatsapp_line_health set event_at = $2 where number_id = $1",
        line.number_id, before["event_at"])


# ── what Meta tells us by webhook ─────────────────────────────────────────────────────────


async def apply_quality_notice(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """`phone_number_quality_update`: the number's throughput level changed (an upgrade, or still
    being registered), and the messaging limit its tier allows. `current_limit` is deprecated by
    Meta in favour of `max_daily_conversations_per_business`; either is read."""
    limit = str(
        value.get("max_daily_conversations_per_business") or value.get("current_limit") or "")
    event = str(value.get("event") or "")
    if not (limit or event):
        return False
    before = await _row(conn, line)
    number = _number(before)
    if limit:
        number["messaging_limit"] = limit
    if event == "THROUGHPUT_UPGRADE":
        number["throughput"] = "HIGHER"
    await _save(conn, line, before, number, _account(before))
    return True


async def apply_name_notice(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """`phone_number_name_update`: the display name was approved, rejected (with Meta's reason),
    deferred or is still pending."""
    decision = str(value.get("decision") or "")
    if not decision:
        return False
    before = await _row(conn, line)
    number = _number(before)
    number["name_decision"] = decision
    reason = str(value.get("rejection_reason") or "")
    number["name_reason"] = reason if decision == "REJECTED" else ""
    await _save(conn, line, before, number, _account(before))
    await whatsapp_line.record(conn, line.number_id, "name", "ALYR", decision == "APPROVED", {
        "decision": decision, "reason": number["name_reason"]})
    return True


async def apply_review_notice(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """`account_review_update`: Meta reviewed the account against its policies."""
    decision = str(value.get("decision") or "")
    if not decision:
        return False
    before = await _row(conn, line)
    account = _account(before) | {"review": decision}
    await _save(conn, line, before, _number(before), account)
    await whatsapp_line.record(conn, line.number_id, "account", "ALYR", decision == "APPROVED", {
        "event": "REVIEW", "decision": decision})
    return True


async def apply_alert_notice(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """`account_alerts`: a change to a limit increase request, an official business account
    decision, or a lost profile picture. Kept as the alerts that are active; one that goes `NONE`
    is dropped."""
    info = value.get("alert_info") or {}
    kind = str(info.get("alert_type") or "")
    if not kind:
        return False
    before = await _row(conn, line)
    account = _account(before)
    kept = [a for a in account.get("alerts", []) if a.get("type") != kind]
    if info.get("alert_status") == "ACTIVE":
        kept.append({
            "type": kind, "severity": str(info.get("alert_severity") or ""), "status": "ACTIVE",
            "description": str(info.get("alert_description") or "")[:300]})
    account["alerts"] = kept
    await _save(conn, line, before, _number(before), account)
    await whatsapp_line.record(conn, line.number_id, "account", "ALYR", None, {
        "event": "ALERT", "type": kind, "status": str(info.get("alert_status") or "")})
    return True


async def apply_account_notice(
    conn: asyncpg.Connection, line: whatsapp_line.Line, value: dict
) -> bool:
    """`account_update`: what happened to the account itself. Only the events that change how a line
    can be used are kept; the rest (a partner added, pricing tiers, an authentication rate) are
    not about health."""
    event = str(value.get("event") or "")
    before = await _row(conn, line)
    account = _account(before)
    if event == "ACCOUNT_RESTRICTION":
        account["restrictions"] = [
            {"type": str(r.get("restriction_type") or ""),
             "expires": expires.isoformat() if (expires := _when(r.get("expiration"))) else None,
             "remediation": str(r.get("remediation") or "")[:300]}
            for r in value.get("restriction_info", []) if isinstance(r, dict)]
    elif event == "ACCOUNT_VIOLATION":
        info = value.get("violation_info") or {}
        account["violation"] = {"type": str(info.get("violation_type") or ""),
                                "at": datetime.now(UTC).isoformat()}
    elif event == "DISABLED_UPDATE":
        info = value.get("ban_info") or {}
        state = str(info.get("waba_ban_state") or "")
        account["ban"] = {} if state == "REINSTATE" else {
            "state": state, "date": str(info.get("waba_ban_date") or "")}
    elif event == "ACCOUNT_DELETED":
        account["state"] = "deleted"
    elif event == "ACCOUNT_OFFBOARDED":
        account["state"] = "offboarded"
    elif event == "ACCOUNT_RECONNECTED":
        account["state"] = "" if account.get("state") == "offboarded" else account.get("state", "")
    elif event == "PARTNER_REMOVED":
        # The business took ALYR off its account (Embedded Signup): messages stop.
        account["state"] = "partner_removed"
    else:
        return False
    await _save(conn, line, before, _number(before), account)
    await whatsapp_line.record(conn, line.number_id, "account", "ALYR", None, {"event": event})
    return True


# ── reading it ────────────────────────────────────────────────────────────────────────────


def view(row: asyncpg.Record, now: datetime | None = None) -> dict:
    """One line's health as the back office reads it: the facts, and the severity made again now, so
    a restriction that has run out stops showing."""
    now = now or datetime.now(UTC)
    account = row["account"] if isinstance(row["account"], dict) else {}
    number = {c: row[c] for c in _NUMBER_COLUMNS}
    heard = row["polled_at"] is not None or row["event_at"] is not None
    expires = row["credential_expires_at"] if "credential_expires_at" in row.keys() else None
    severity, reasons, _ = evaluate(number, account, now, heard, expires)
    active = [r for r in account.get("restrictions", [])
              if _when(r.get("expires")) is None or _when(r.get("expires")) > now]
    return {
        "severity": severity, "reasons": reasons, **number,
        "review": account.get("review", ""), "restrictions": active,
        "ban": account.get("ban") or {}, "violation": account.get("violation") or {},
        "state": account.get("state", ""),
        "alerts": [a for a in account.get("alerts", []) if a.get("status") == "ACTIVE"],
        "polled_at": row["polled_at"].isoformat() if row["polled_at"] else None,
        "event_at": row["event_at"].isoformat() if row["event_at"] else None,
    }


# ── polling Meta for every line ───────────────────────────────────────────────────────────


async def _lines(db: Database) -> list[whatsapp_line.Line]:
    async with db.unscoped() as conn:
        rows = await conn.fetch(
            "select tenant_id, number_id, coalesce(waba_id, '') as waba_id, display_phone "
            "from channel_numbers where channel = 'meta' order by number_id")
    return [whatsapp_line.Line(**dict(r)) for r in rows]


async def poll_all(db: Database, channel: MetaChannel, *, ask_meta: bool = True) -> dict:
    """Read every attached line's health from Meta, one at a time with a pause between, and make
    every severity again. A line Meta cannot be asked about is counted and left as it was. Reads
    only; nothing is sent to Meta but the question."""
    asked = failed = 0
    for line in await _lines(db):
        if ask_meta:
            try:
                info = await channel.number_health(line.number_id)
            except httpx.HTTPError as error:
                failed += 1
                log.warning("could not read the health of a line: %s", describe_error(error))
                continue
            async with db.tenant(line.tenant_id) as conn:
                await apply_info(conn, line, info)
            asked += 1
            await asyncio.sleep(0.2)
        else:
            async with db.tenant(line.tenant_id) as conn:
                await recompute(conn, line)
    return {"asked": asked, "failed": failed}


async def keep_lines_polled(db: Database, channel: MetaChannel, minutes: int) -> None:
    """The worker's loop: ask Meta about every line every `minutes` (0 asks nothing and only makes
    the severities again, each hour, so a restriction that ran out stops showing). The first pass
    is when the worker starts."""
    while True:
        try:
            done = await poll_all(db, channel, ask_meta=minutes > 0)
            if done["asked"] or done["failed"]:
                log.info("read the health of %s lines (%s could not be read)",
                         done["asked"], done["failed"])
        except Exception:  # noqa: BLE001 - never let the poll stop the worker
            log.exception("could not read the health of the lines")
        await asyncio.sleep(max(minutes, 60) * 60 if minutes > 0 else 3600)
