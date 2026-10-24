"""Alert rules and how a person is told (ALY-121, spec 022).

The job runner evaluates the rules every minute. A rule that starts to fail sends one message;
while it lasts a reminder goes out every two hours; when it clears, one more says so. State lives
in `alert_state`, so a restart does not repeat an alert.

An alert holds a rule's name, counts and ages. It never holds a name, a phone number or a
message, because it leaves ALYR (ntfy, email) and hard rule 2 says what may leave.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from alyr.config import get_settings
from alyr.core import health, mail
from alyr.core.outbound import SEND
from alyr.db import Database

log = logging.getLogger("alyr.alerts")

REMIND_EVERY = timedelta(hours=2)
CHECK_EVERY_SECONDS = 60
# Sends: fire when more than this share failed in the window, once enough were tried.
SEND_FAIL_SHARE = 0.05
SEND_MIN_TRIED = 20
WEBHOOK_QUIET_AFTER_SECONDS = 15 * 60
# The hours a shop's customers are writing (Doha). Outside them a quiet webhook is normal.
BUSY_HOURS = range(9, 22)

# Tests replace this with an httpx.MockTransport; nothing else should.
transport: httpx.AsyncBaseTransport | None = None


@dataclass(frozen=True)
class Alert:
    key: str
    title: str
    detail: str
    # What to try first; one line, from the runbook (docs/runbooks/monitoring.md).
    first_step: str
    urgent: bool = True


async def evaluate(db: Database, now: datetime | None = None) -> dict[str, Alert | None]:
    """Every rule, with its alert when it is firing and None when it is quiet."""
    now = now or datetime.now(UTC)
    results: dict[str, Alert | None] = {}

    queue = await health.queue_numbers(db)
    late = queue["oldest_due_seconds"] > health.QUEUE_LATE_AFTER_SECONDS
    results["queue_late"] = Alert(
        "queue_late", "Messages are waiting",
        f"The oldest due job has waited {queue['oldest_due_seconds'] // 60} minutes "
        f"({queue['queued']} queued).",
        "Check /health/worker and the runner's logs; restart the container if it is silent.",
    ) if late else None

    async with db.unscoped() as conn, conn.transaction():
        await conn.execute("select set_config('app.worker', 'on', true)")
        parked = await conn.fetchval(
            "select count(*) from jobs where status = 'failed' "
            "and finished_at > now() - interval '30 minutes'"
        )
        sends = await conn.fetchrow(
            "select count(*) filter (where status = 'failed') as failed, count(*) as tried "
            "from jobs where kind = $1 and status in ('done', 'failed') "
            "and finished_at > now() - interval '10 minutes'",
            SEND,
        )
        real_numbers = await conn.fetchval(
            "select count(*) from channel_numbers where channel = 'meta'"
        )
    results["job_parked"] = Alert(
        "job_parked", "A job gave up",
        f"{parked} job(s) used all their attempts in the last 30 minutes.",
        "Open /ops, failed jobs: read the error, fix it, then retry the job.",
        urgent=False,
    ) if parked else None

    tried, failed = sends["tried"], sends["failed"]
    failing = tried >= SEND_MIN_TRIED and failed / tried > SEND_FAIL_SHARE
    results["sends_failing"] = Alert(
        "sends_failing", "WhatsApp sends are failing",
        f"{failed} of {tried} sends failed in the last 10 minutes.",
        "Check Meta's status page and the access token (docs/runbooks/secret-rotation.md).",
    ) if failing else None

    # Only once a real number exists, and only when customers are likely to be writing.
    quiet = None
    if real_numbers and health.doha_hour(now) in BUSY_HOURS:
        age = await health.heartbeat_age(db, health.WEBHOOK)
        if age is None or age > WEBHOOK_QUIET_AFTER_SECONDS:
            quiet = Alert(
                "webhook_quiet", "No WhatsApp message received",
                "Nothing has reached the webhook for over 15 minutes in opening hours.",
                "Check the webhook subscription in Meta's app dashboard and /health/ready.",
                urgent=False,
            )
    results["webhook_quiet"] = quiet
    return results


async def notify(title: str, body: str, *, urgent: bool, tag: str) -> None:
    """Tell a person, by every channel that is set up. Never raises: an alert that cannot be
    sent is logged, and the next minute tries the reminder path again."""
    settings = get_settings()
    log.warning("ALERT %s: %s", title, body)
    if settings.alert_ntfy_topic:
        try:
            async with httpx.AsyncClient(timeout=8, transport=transport) as client:
                response = await client.post(
                    f"{settings.alert_ntfy_url.rstrip('/')}/{settings.alert_ntfy_topic}",
                    content=body.encode(),
                    headers={
                        "Title": title.encode("ascii", "replace").decode(),
                        "Priority": "urgent" if urgent else "default",
                        "Tags": tag,
                    },
                )
                response.raise_for_status()
        except Exception as error:  # noqa: BLE001
            log.warning("could not send the push alert: %s", type(error).__name__)
    if settings.alert_email and mail.configured() and mail.deliverable(settings.alert_email):
        try:
            await mail.send(settings.alert_email, f"[ALYR] {title}", body, f"<pre>{body}</pre>")
        except Exception as error:  # noqa: BLE001
            log.warning("could not send the alert email: %s", type(error).__name__)


async def apply(
    db: Database, results: dict[str, Alert | None], now: datetime | None = None
) -> list[str]:
    """Compare the rules with what we last told a person, and send what changed. Returns the
    keys that were announced, for the tests."""
    now = now or datetime.now(UTC)
    sent: list[str] = []
    for key, alert in results.items():
        async with db.unscoped() as conn:
            state = await conn.fetchrow(
                "select firing, since, last_sent_at from alert_state where key = $1", key
            )
            was_firing = bool(state and state["firing"])
            if alert and not was_firing:
                await notify(
                    alert.title, f"{alert.detail}\nFirst step: {alert.first_step}",
                    urgent=alert.urgent, tag="rotating_light",
                )
                await conn.execute(
                    "insert into alert_state (key, firing, since, last_sent_at, detail) "
                    "values ($1, true, $2, $2, $3) on conflict (key) do update set "
                    "firing = true, since = $2, last_sent_at = $2, detail = $3",
                    key, now, alert.detail,
                )
                sent.append(key)
            elif alert and was_firing:
                if now - state["last_sent_at"] >= REMIND_EVERY:
                    minutes = int((now - state["since"]).total_seconds() // 60)
                    await notify(
                        f"Still: {alert.title}",
                        f"{alert.detail}\nIt has lasted {minutes} minutes.",
                        urgent=alert.urgent, tag="rotating_light",
                    )
                    await conn.execute(
                        "update alert_state set last_sent_at = $2, detail = $3 where key = $1",
                        key, now, alert.detail,
                    )
                    sent.append(key)
            elif state and was_firing:
                await notify(
                    f"Cleared: {key.replace('_', ' ')}", "It is back to normal.",
                    urgent=False, tag="white_check_mark",
                )
                await conn.execute(
                    "update alert_state set firing = false, last_sent_at = $2 where key = $1",
                    key, now,
                )
                sent.append(key)
    return sent


async def keep_watching(db: Database) -> None:
    """The runner's watch: evaluate and announce, every minute, for the life of the process."""
    while True:
        try:
            await apply(db, await evaluate(db))
        except Exception:  # never let the watch stop the runner
            log.exception("could not evaluate the alert rules")
        await asyncio.sleep(CHECK_EVERY_SECONDS)
