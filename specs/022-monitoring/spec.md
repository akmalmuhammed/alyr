# 022 · Monitoring and alerts

Linear ALY-121 · Decision D-053 · Runbook `docs/runbooks/monitoring.md` · Builds on D-052

## What it is for

Until now `/health` answered "ok" without touching the database, and nobody was told when
anything broke. A client's order could sit unsent for hours before anyone knew. This spec adds
the smallest set of checks that says "something is wrong" within minutes, to a person's phone,
at no cost, and that is honest about what it cannot see.

Free first, paid when we scale (the founder, 24 Oct 2026). Nothing here needs an account to
build; the phone alerts need one free topic name (see the runbook).

## Slice 1 (this pull request)

### Three health answers

| Route | Answers | Touches the database |
|---|---|---|
| `/health` | The process is up (liveness). Unchanged. | No |
| `/health/ready` | 200 only if: the database answers within 5 s, every migration file is applied, the oldest due job waited under 300 s, and (when there is traffic) the last WhatsApp webhook is not stale. Otherwise 503 with each check named. | Yes |
| `/health/worker` | The job runner's heartbeat: 200 while it checked in within 120 s, 503 after. "inline" when jobs run inside the API (local). | Yes |

Both new routes are cheap, read-only and carry **counts and ages only**, never a name, phone
number, message or order.

### The heartbeat

Table `heartbeats` (migration 0049, platform record, no tenant, like `platform_settings`):
the worker upserts its row every 30 s; the webhook route upserts at most once a minute after the
signature check passes. `alert_state` holds which alerts are firing.

### Alert rules (run by the worker once a minute)

| Alert | Fires when | First step |
|---|---|---|
| `queue_late` | the oldest due job waited more than 300 s | is the runner alive (`/health/worker`)? |
| `job_parked` | a job used all 6 attempts and was parked as `failed` | read the failed jobs, fix, requeue |
| `sends_failing` | more than 5% of at least 20 send jobs failed in 10 minutes | check the Meta token and template status |
| `webhook_quiet` | a shop has a live Meta number, it is 09:00 to 21:00 in Doha, and no webhook arrived for 15 minutes | check the webhook subscription in Meta |

A rule fires once when it starts, reminds every 2 hours while it lasts, and sends one message
when it clears. State is in `alert_state`, so a restart does not repeat an alert. The text
carries counts and ages only.

Delivery: a push through ntfy (topic = a secret name; no account) and an email through Resend
to `ALYR_ALERT_EMAIL`. A failed delivery is logged and never stops the checks.

### The outside watcher

The runner cannot tell us when the whole container is down. The Cloudflare Worker's existing
3-minute cron (`infra/cloudflare/api`) now also calls `/health/ready` and `/health/worker`
(the Worker lets those two through, like `/health`). Two failures in a row alert; a reminder
every 2 hours; one message when healthy again. Its memory (failure count, last alert time)
is kept in the container's Durable Object storage. A free UptimeRobot monitor on
`/health/ready` is the second, independent watcher (runbook).

## Later slices (not in this pull request)

2. Scrubbed `error_events` table and a failed-jobs page in `/ops` (no error tracker abroad).
3. Status page, and a synthetic order every 15 minutes through the simulator.
4. Weekly service report against targets.
5. Meta quality and template-status webhooks into the same alerts.

## Not proven

- **The Durable Object call from the scheduled handler** (`container.noteHealth`) is unproven on
  a real Cloudflare Container class. If it throws, the Worker alerts on the first failure
  instead of the second, so the worst case is an earlier alert, not a silent one.
- ntfy's free service has no guarantee of delivery; the email is the second route.
- The tests prove the rules against real PostgreSQL with a fake transport. No message has
  been sent to a real phone.
- Nothing is deployed; the watcher only runs once the hosting of spec 021 is deployed.
