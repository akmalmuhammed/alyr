"""Events out: a shop's other system hears about its documents (ALY-142, spec 015).

A shop registers addresses and the events it wants (`document.issued`, `document.delivered`,
`document.failed`, `document.cancelled`, `payment.recorded`). When one happens, ALYR writes a
delivery row **in the same transaction as the event** (so an event that rolled back is never
sent, and one that committed is never lost) and queues a job. The job posts the event, signed,
and keeps trying with growing waits if the receiver does not answer with a 2xx.

**What is sent.** A small JSON envelope: `id` (the same on every retry, so a receiver can ignore a
repeat), `type`, `created_at` and `data`. The data names documents by ID and number and money by
minor units; it carries no customer's name, phone or address. The shop's system knows its own
sale from `source_ref`.

**How it is signed.** `X-Alyr-Timestamp` is the Unix time in seconds when this attempt was made;
`X-Alyr-Signature` is `sha256=` and the hex HMAC-SHA256, keyed with the endpoint's secret, of
`<timestamp>.<body>`, the body being the exact bytes sent. A receiver recomputes it, compares in
constant time and refuses a timestamp more than five minutes old (docs/connect-api.md).

**Retries.** Eight attempts in all: now, then after 30 seconds, 2 minutes, 10 minutes, 30 minutes,
1 hour, 3 hours and 6 hours. A delivery that fails them all is marked failed and stays on the log
with the last answer.

**Sustained failure.** An endpoint that has failed ten times in a row *and* has not had one
success for 24 hours is switched off, the owner is told (the activity record, and an email to the
owners and admins when email is set up), and nothing more is sent until the owner switches it on.
One slow evening switches nothing off.

**The address is checked** every time it is used (`ssrf.py`). Nothing is followed, nothing private
is reached.
"""

import hashlib
import hmac
import json
import logging
import secrets
import time
from datetime import UTC, datetime, timedelta
from html import escape
from uuid import UUID, uuid4

import asyncpg
import httpx

from alyr import brand
from alyr.config import get_settings
from alyr.core import jobs, mail, team
from alyr.core.team import Actor
from alyr.db import Database
from alyr.modules.connect import ssrf
from alyr.modules.connect.words import ConnectError

log = logging.getLogger("alyr.connect.webhooks")

JOB = "webhook_send"
EVENTS = ("document.issued", "document.delivered", "document.failed", "document.cancelled",
          "payment.recorded")
MAX_ENDPOINTS = 10
# Seconds to wait after the first, second, ... failed attempt. Eight attempts in all.
SCHEDULE = (30, 120, 600, 1800, 3600, 10800, 21600)
MAX_ATTEMPTS = len(SCHEDULE) + 1
DISABLE_AFTER_FAILURES = 10
DISABLE_AFTER = timedelta(hours=24)
KEEP_DAYS = 30
SUBJECT = "document"


def new_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def sign(secret: str, timestamp: int | str, body: bytes) -> str:
    """The value of X-Alyr-Signature for this body at this time."""
    mac = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


def allow_local() -> bool:
    settings = get_settings()
    return settings.env == "local" and settings.webhook_allow_local


# ── events in ────────────────────────────────────────────────────────────────────────────


async def emit(conn: asyncpg.Connection, event: str, data: dict, *,
               once: tuple[str, str] | None = None) -> int:
    """Queue `event` for every address that asked for it, in the caller's transaction. Returns
    how many were queued. Costs one query when nobody listens. With `once=(field, value)` the
    event is skipped if one of this kind about the same thing (the same `data[field]`) was
    already queued: a delivery report says "delivered" and then "read", and the shop hears
    about it once."""
    endpoints = await conn.fetch(
        "select id from webhook_endpoints where enabled and deleted_at is null "
        "and $1 = any(events)", event)
    if not endpoints:
        return 0
    if once is not None and await conn.fetchval(
            "select true from webhook_deliveries where event = $1 "
            "and payload -> 'data' ->> $2 = $3 limit 1", event, once[0], once[1]):
        return 0
    return await _queue(conn, [e["id"] for e in endpoints], event, data)


async def _queue(conn: asyncpg.Connection, endpoint_ids: list[UUID], event: str,
                 data: dict) -> int:
    event_id = uuid4()
    envelope = {
        "id": str(event_id), "type": event,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "data": data,
    }
    for endpoint_id in endpoint_ids:
        delivery_id = await conn.fetchval(
            "insert into webhook_deliveries (endpoint_id, event_id, event, payload, "
            "next_attempt_at) values ($1, $2, $3, $4, now()) returning id",
            endpoint_id, event_id, event, envelope)
        await jobs.enqueue(conn, JOB, {"delivery_id": str(delivery_id)})
    return len(endpoint_ids)


# ── endpoints, for the shop's screen and the API ─────────────────────────────────────────

_COLUMNS = (
    "id, name, url, events, enabled, disabled_at, disabled_reason, failing_since, "
    "consecutive_failures, last_success_at, last_failure_at, last_status, last_error, "
    "created_by, created_at"
)


def present(row: asyncpg.Record) -> dict:
    def when(value):
        return value.isoformat() if value else None

    return {
        "id": str(row["id"]), "name": row["name"], "url": row["url"], "events": list(row["events"]),
        "enabled": row["enabled"], "disabled_at": when(row["disabled_at"]),
        "disabled_reason": row["disabled_reason"], "failing_since": when(row["failing_since"]),
        "consecutive_failures": row["consecutive_failures"],
        "last_success_at": when(row["last_success_at"]),
        "last_failure_at": when(row["last_failure_at"]), "last_status": row["last_status"],
        "last_error": row["last_error"], "created_by": row["created_by"],
        "created_at": when(row["created_at"]),
    }


async def list_endpoints(conn: asyncpg.Connection) -> list[dict]:
    rows = await conn.fetch(
        f"select {_COLUMNS} from webhook_endpoints where deleted_at is null "
        "order by created_at desc")
    return [present(r) for r in rows]


async def _vet_url(url: str) -> str:
    """Refuse an address ALYR must not post to, now, with words the shop can act on."""
    url = (url or "").strip()
    try:
        await ssrf.vet(url, allow_local=allow_local())
    except ssrf.Blocked as blocked:
        if blocked.reason == "unresolved":
            raise ConnectError("webhook_url_unresolved") from blocked
        if blocked.reason in ("address", "numeric_host", "local_name"):
            raise ConnectError("webhook_url_blocked") from blocked
        raise ConnectError("webhook_url_invalid") from blocked
    return url


def _check_events(events: list[str]) -> list[str]:
    clean = list(dict.fromkeys(events or []))
    if not clean or any(e not in EVENTS for e in clean):
        raise ConnectError("webhook_events_invalid")
    return clean


async def create(
    conn: asyncpg.Connection, actor: Actor, *, url: str, events: list[str], name: str = "",
) -> tuple[dict, str]:
    """Register an address. Returns it and its secret, which is shown this once."""
    url = await _vet_url(url)
    events = _check_events(events)
    name = (name or "").strip()[:60]
    if await conn.fetchval("select count(*) from webhook_endpoints where deleted_at is null") \
            >= MAX_ENDPOINTS:
        raise ConnectError("too_many_webhooks", 409)
    secret = new_secret()
    row = await conn.fetchrow(
        f"insert into webhook_endpoints (name, url, events, secret, created_by, created_by_user) "
        f"values ($1, $2, $3, $4, $5, $6) returning {_COLUMNS}",
        name, url, events, secret, actor.name, actor.id)
    await _audit(conn, actor, "webhook_added", row["id"], {"host": _host(url), "events": events})
    return present(row), secret


def _host(url: str) -> str:
    return (url.split("//", 1)[-1].split("/", 1)[0].split("?", 1)[0])[:120]


async def _audit(conn: asyncpg.Connection, actor: Actor, action: str, endpoint_id: UUID,
                 detail: dict) -> None:
    shop = await conn.fetchval("select nullif(current_setting('app.tenant_id', true), '')::uuid")
    await team.record(conn, SUBJECT, shop, action, actor, None,
                      {"webhook": str(endpoint_id), **detail})


async def _find(conn: asyncpg.Connection, endpoint_id: UUID, *, lock: bool = False):
    row = await conn.fetchrow(
        f"select {_COLUMNS}, secret from webhook_endpoints where id = $1 "
        f"and deleted_at is null{' for update' if lock else ''}", endpoint_id)
    if row is None:
        raise ConnectError("webhook_not_found", 404)
    return row


async def update(
    conn: asyncpg.Connection, actor: Actor, endpoint_id: UUID, *, url: str | None = None,
    events: list[str] | None = None, name: str | None = None, enabled: bool | None = None,
) -> dict:
    row = await _find(conn, endpoint_id, lock=True)
    changes: dict = {}
    if url is not None and url.strip() != row["url"]:
        changes["url"] = await _vet_url(url)
    if events is not None:
        changes["events"] = _check_events(events)
    if name is not None:
        changes["name"] = name.strip()[:60]
    if enabled is not None and enabled != row["enabled"]:
        changes["enabled"] = enabled
        if enabled:
            # Switched on by a person: a fresh start, so the old failures do not switch it off
            # again at the first hiccup.
            changes.update(disabled_at=None, disabled_reason=None, failing_since=None,
                           consecutive_failures=0)
        else:
            changes.update(disabled_at=datetime.now(UTC), disabled_reason="switched off")
    if not changes:
        return present(row)
    names = list(changes)
    assignments = ", ".join(f"{n} = ${i}" for i, n in enumerate(names, start=2))
    updated = await conn.fetchrow(
        f"update webhook_endpoints set {assignments} where id = $1 returning {_COLUMNS}",
        endpoint_id, *[changes[n] for n in names])
    await _audit(conn, actor, "webhook_changed", endpoint_id, {"fields": sorted(changes)})
    return present(updated)


async def rotate_secret(conn: asyncpg.Connection, actor: Actor, endpoint_id: UUID
                        ) -> tuple[dict, str]:
    await _find(conn, endpoint_id, lock=True)
    secret = new_secret()
    row = await conn.fetchrow(
        f"update webhook_endpoints set secret = $2 where id = $1 returning {_COLUMNS}",
        endpoint_id, secret)
    await _audit(conn, actor, "webhook_secret_replaced", endpoint_id, {})
    return present(row), secret


async def remove(conn: asyncpg.Connection, actor: Actor, endpoint_id: UUID) -> None:
    """Stop sending to an address for good. Its record of deliveries stays."""
    await _find(conn, endpoint_id, lock=True)
    await conn.execute(
        "update webhook_endpoints set deleted_at = now(), enabled = false where id = $1",
        endpoint_id)
    await conn.execute(
        "update webhook_deliveries set status = 'failed', error = 'address removed' "
        "where endpoint_id = $1 and status = 'pending'", endpoint_id)
    await _audit(conn, actor, "webhook_removed", endpoint_id, {})


async def deliveries_of(conn: asyncpg.Connection, endpoint_id: UUID, limit: int = 50
                        ) -> list[dict]:
    await _find(conn, endpoint_id)
    rows = await conn.fetch(
        "select id, event_id, event, status, attempts, next_attempt_at, last_attempt_at, "
        "response_status, response_snippet, error, created_at, delivered_at "
        "from webhook_deliveries where endpoint_id = $1 order by created_at desc, id limit $2",
        endpoint_id, limit)

    def when(value):
        return value.isoformat() if value else None

    return [
        {"id": str(r["id"]), "event_id": str(r["event_id"]), "event": r["event"],
         "status": r["status"], "attempts": r["attempts"],
         "next_attempt_at": when(r["next_attempt_at"]) if r["status"] == "pending" else None,
         "last_attempt_at": when(r["last_attempt_at"]), "response_status": r["response_status"],
         "response_snippet": r["response_snippet"], "error": r["error"],
         "created_at": when(r["created_at"]), "delivered_at": when(r["delivered_at"])}
        for r in rows
    ]


async def send_test(conn: asyncpg.Connection, actor: Actor, endpoint_id: UUID) -> dict:
    """Queue a `webhook.test` event for one address, so the shop can see its receiver answer."""
    row = await _find(conn, endpoint_id)
    if not row["enabled"]:
        raise ConnectError("webhook_not_found", 404)
    await _queue(conn, [endpoint_id], "webhook.test",
                 {"message": "This is a test from ALYR. Nothing was issued."})
    await _audit(conn, actor, "webhook_tested", endpoint_id, {})
    return {"queued": True}


# ── the job ──────────────────────────────────────────────────────────────────────────────


class WebhookSender:
    """Job handler for `webhook_send`: one attempt at one delivery."""

    def __init__(self, db: Database, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._db = db
        # A test can put a pretend network here; nothing else should.
        self.transport = transport

    async def run(self, tenant_id: UUID, payload: dict) -> None:
        delivery_id = UUID(payload["delivery_id"])
        async with self._db.tenant(tenant_id) as conn:
            row = await conn.fetchrow(
                "select d.id, d.event, d.payload, d.attempts, d.status, e.url, e.secret, "
                "e.enabled, e.deleted_at from webhook_deliveries d "
                "join webhook_endpoints e on e.id = d.endpoint_id where d.id = $1 for update of d",
                delivery_id)
            if row is None or row["status"] != "pending":
                return
            if not row["enabled"] or row["deleted_at"] is not None:
                await conn.execute(
                    "update webhook_deliveries set status = 'failed', error = 'address is off' "
                    "where id = $1", delivery_id)
                return
        body = _body_of(row["payload"])
        timestamp = int(time.time())
        headers = {
            "Content-Type": "application/json", "User-Agent": "ALYR-Webhooks/1",
            "X-Alyr-Event": row["event"], "X-Alyr-Delivery": row["payload"]["id"],
            "X-Alyr-Timestamp": str(timestamp),
            "X-Alyr-Signature": sign(row["secret"], timestamp, body),
        }
        status: int | None = None
        snippet = ""
        error = ""
        try:
            answer = await ssrf.post(row["url"], body, headers, allow_local=allow_local(),
                                     transport=self.transport)
            status, snippet = answer.status, answer.snippet
            if not 200 <= status < 300:
                error = ("a redirect was not followed" if 300 <= status < 400
                         else f"the receiver answered {status}")
        except ssrf.Blocked as blocked:
            error = f"address refused: {blocked.reason}"
        except (httpx.HTTPError, TimeoutError, OSError) as failure:
            error = f"could not reach the receiver ({type(failure).__name__})"
        await self._record(tenant_id, delivery_id, row, status, snippet, error)

    async def _record(self, tenant_id: UUID, delivery_id: UUID, row: asyncpg.Record,
                      status: int | None, snippet: str, error: str) -> None:
        attempts = row["attempts"] + 1
        async with self._db.tenant(tenant_id) as conn:
            endpoint_id = await conn.fetchval(
                "select endpoint_id from webhook_deliveries where id = $1", delivery_id)
            if not error:
                await conn.execute(
                    "update webhook_deliveries set status = 'delivered', attempts = $2, "
                    "last_attempt_at = now(), delivered_at = now(), response_status = $3, "
                    "response_snippet = $4, error = null, next_attempt_at = null where id = $1",
                    delivery_id, attempts, status, snippet)
                await conn.execute(
                    "update webhook_endpoints set last_success_at = now(), "
                    "consecutive_failures = 0, failing_since = null, last_status = $2, "
                    "last_error = null where id = $1", endpoint_id, status)
                await conn.execute(
                    "delete from webhook_deliveries where endpoint_id = $1 "
                    "and created_at < now() - make_interval(days => $2)", endpoint_id, KEEP_DAYS)
                return
            last = attempts >= MAX_ATTEMPTS
            wait = None if last else SCHEDULE[attempts - 1]
            await conn.execute(
                "update webhook_deliveries set status = $2, attempts = $3, "
                "last_attempt_at = now(), response_status = $4, response_snippet = $5, "
                "error = $6, next_attempt_at = case when $7::int is null then null "
                "else now() + make_interval(secs => $7) end where id = $1",
                delivery_id, "failed" if last else "pending", attempts, status, snippet,
                error[:200], wait)
            if not last:
                await jobs.enqueue(conn, JOB, {"delivery_id": str(delivery_id)},
                                   run_at=datetime.now(UTC) + timedelta(seconds=wait))
            ep = await conn.fetchrow(
                "update webhook_endpoints set consecutive_failures = consecutive_failures + 1, "
                "failing_since = coalesce(failing_since, now()), last_failure_at = now(), "
                "last_status = $2, last_error = $3 where id = $1 "
                "returning consecutive_failures, failing_since, enabled, url, name",
                endpoint_id, status, error[:200])
            if (ep["enabled"] and ep["consecutive_failures"] >= DISABLE_AFTER_FAILURES
                    and datetime.now(UTC) - ep["failing_since"] >= DISABLE_AFTER):
                await self._switch_off(conn, endpoint_id, ep)

    async def _switch_off(self, conn: asyncpg.Connection, endpoint_id: UUID,
                          ep: asyncpg.Record) -> None:
        await conn.execute(
            "update webhook_endpoints set enabled = false, disabled_at = now(), "
            "disabled_reason = 'failing for more than a day' where id = $1", endpoint_id)
        await conn.execute(
            "update webhook_deliveries set status = 'failed', error = 'address switched off' "
            "where endpoint_id = $1 and status = 'pending'", endpoint_id)
        await _audit(conn, Actor(None, "ALYR"), "webhook_switched_off", endpoint_id,
                     {"host": _host(ep["url"]), "failures": ep["consecutive_failures"]})
        owners = [r["email"] for r in await conn.fetch(
            "select u.email from memberships m join users u on u.id = m.user_id "
            "where m.role in ('owner', 'admin')")]
        await alert_owners(owners, ep["name"] or _host(ep["url"]), _host(ep["url"]))


# ── telling the owner ────────────────────────────────────────────────────────────────────


def alert_message(name: str, host: str) -> tuple[str, str, str]:
    """Subject, text and HTML of the note an owner gets when a webhook is switched off, in
    English and Arabic together (the owner's language is not known here). The address is named
    by its host only: a full address can carry a secret."""
    subject = "ALYR stopped sending to one of your webhook addresses"
    text = (
        f"ALYR has stopped sending events to {name} ({host}) because it has not answered for "
        "more than a day. Nothing else is affected. When the receiver is working again, switch "
        "the address back on in your document settings, under Connections.\n\n"
        f"أوقفت ALYR إرسال الأحداث إلى {name} ({host}) لأنه لم يستجب لأكثر من يوم. لا يتأثر شيء "
        "آخر. عندما يعمل المستقبِل من جديد، أعد تشغيل العنوان من إعدادات المستندات في قسم الربط."
    )
    e, font = brand.EMAIL, brand.CSS_FONT["email"]
    n, h = escape(name), escape(host)
    cell = f'font-size:15px;line-height:1.7;color:{e["text"]}'
    english = (
        f"ALYR has stopped sending events to <b>{n}</b> (<bdi>{h}</bdi>) because it has not "
        "answered for more than a day. Nothing else is affected. When the receiver is working "
        "again, switch the address back on in your document settings, under Connections.")
    arabic = (
        f"أوقفت <bdi>ALYR</bdi> إرسال الأحداث إلى <b>{n}</b> (<bdi>{h}</bdi>) لأنه لم يستجب "
        "لأكثر من يوم. لا يتأثر شيء آخر. عندما يعمل المستقبِل من جديد، أعد تشغيل العنوان من "
        "إعدادات المستندات في قسم الربط.")
    html = (
        f'<!doctype html><html><body style="margin:0;background:{e["bg"]};'
        f'font-family:{font};color:{e["text"]}">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="padding:24px 16px"><tr><td align="center">'
        f'<table role="presentation" width="100%" style="max-width:520px;'
        f'background:{e["panel"]};border:1px solid {e["rule"]};padding:24px">'
        f'<tr><td style="{cell}">{english}</td></tr>'
        f'<tr><td dir="rtl" style="padding-top:16px;border-top:1px solid {e["rule"]};{cell};'
        f'text-align:right">{arabic}</td></tr>'
        '</table></td></tr></table></body></html>')
    return subject, text, html


async def alert_owners(emails: list[str], name: str, host: str) -> None:
    """Email the owners and admins. Never to an example address, never when email is not set
    up, and a failure to send is logged and goes no further."""
    if not mail.configured():
        return
    subject, text, html = alert_message(name, host)
    for address in dict.fromkeys(emails):
        if not mail.deliverable(address):
            continue
        try:
            await mail.send(address, subject, text, html)
        except mail.MailError:
            log.warning("could not tell an owner that a webhook was switched off")


def _body_of(envelope: dict) -> bytes:
    return json.dumps(envelope, separators=(",", ":"), ensure_ascii=False,
                      sort_keys=True).encode("utf-8")
