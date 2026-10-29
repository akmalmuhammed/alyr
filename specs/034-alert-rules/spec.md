# 022 · Alert rules

Linear ALY-121 · Decision D-073 · Runbook `docs/runbooks/monitoring.md` · Builds on D-060 (Google Cloud in Doha)

## What it is for

An uptime check can tell that the API answers and that the worker checks in. It cannot tell
that a client's order has sat unsent for an hour, that every send is failing because the Meta
token expired, or that Meta stopped sending us customers' messages. This spec adds the rules that
see those, and tells a person within minutes, at no cost, with counts and ages only.

## What already exists (D-060, ALY-63, PR #147)

| Piece | Where |
|---|---|
| `/health` (liveness, no database), `/health/ready` (database), `/health/worker` (a check-in within 2 minutes) | `main.py` |
| `worker_heartbeats`, written from inside the job loop | migration 0044, `worker.py` |
| Uptime checks on those addresses, budget alerts | Cloud Monitoring, `docs/hosting.md` |

This spec does not add another health route or heartbeat. A dead or hung worker cannot report
itself, so that stays the uptime checks' job.

## The rules (run by the worker once a minute)

| Alert | Fires when | First step |
|---|---|---|
| `queue_late` | the oldest due job waited more than 300 s | is the worker alive (`/health/worker`)? |
| `job_parked` | a job used all its attempts and was parked as `failed` in the last 30 minutes | read the failed jobs, fix, requeue |
| `sends_failing` | more than 5% of at least 20 send jobs failed in 10 minutes | check the Meta token and template status |
| `webhook_quiet` | a shop has a Meta number, it is 09:00 to 21:00 in Doha, and no customer message was queued for 15 minutes | check the webhook subscription in Meta |

`webhook_quiet` reads the newest `inbound_message` job of a shop on a Meta number: the webhook
only queues a message, so that is when Meta last reached us with one. Migration 0062 adds an
index on `jobs (kind, created_at)` so this stays cheap as jobs pile up.

A rule fires once when it starts, reminds every 2 hours while it lasts, and sends one message
when it clears. State is in `alert_state` (migration 0062, a platform table with no customer
data), so a restart does not repeat an alert. The worker pool runs one instance, so one
evaluator; a second instance could send a duplicate, never miss one.

Delivery: every alert is a warning in the worker's log (`ALERT ...`, logger `alyr.alerts`). If
`ALYR_ALERT_NTFY_TOPIC` is set, a push through ntfy; if `ALYR_ALERT_EMAIL` is set and Resend is
configured, an email. A failed delivery is logged and never stops the checks.

## Later slices (not in this pull request)

2. Scrubbed `error_events` table and a failed-jobs page in `/ops` (no error tracker abroad).
3. Status page, and a synthetic order every 15 minutes through the simulator.
4. Weekly service report against targets.
5. Meta quality and template-status webhooks into the same alerts.

## Not proven

- The tests prove the rules against real PostgreSQL with a fake push service. No message has
  been sent to a real phone or inbox.
- ntfy's free service has no delivery guarantee; email is the second route, and a Cloud
  Logging alert on the `ALERT` log line would be a third that stays inside Google.
- Not deployed: it runs once this is merged and the worker image is rebuilt.
