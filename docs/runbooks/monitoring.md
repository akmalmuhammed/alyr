# Runbook · Monitoring and alerts (ALY-121, D-053, spec 022)

Who gets woken, by what, and what to do first. Free tools only until a paying client or a
second developer exists.

## One-time setup (about 15 minutes)

1. **Phone alerts.** Install the free ntfy app, subscribe to a long random topic name (for
   example 25 random characters; the name is the password, so treat it as a secret and never
   put it in the repo or a chat).
2. Give the same name to the Worker and the API container:
   `cd infra/cloudflare/api && pnpm exec wrangler secret put ALYR_ALERT_NTFY_TOPIC`
   `pnpm exec wrangler secret put ALYR_ALERT_EMAIL` (the inbox that should also get alerts).
   Locally, the same two names go in `apps/api/.env`. Both empty means alerts are only logged.
3. **Second watcher.** Make a free UptimeRobot account. Add HTTPS monitors, 5-minute checks,
   alerts to the same email: `/health/ready` (keyword `"ready":true` is not needed; any 503
   is a failure), `/health/worker`, the portal's `/login`, `alyr.qa`, and the public webhook
   address. The free plan is for personal and non-profit use: it is a stopgap, switch to the
   paid Solo plan (USD 12 a month) at the first paying client.
4. Name who is on call. Today it is the founder; write it in `docs/access.md` when a second
   person exists.

## What an alert means and the first step

| Alert | Meaning | First step |
|---|---|---|
| Queue late | Jobs are due and nothing is taking them | Open `/health/worker`. 503: the runner is down, restart the container (`wrangler rollback` if a deploy caused it). 200: look for one slow or stuck job |
| Job parked | A job failed 6 times and was given up | Read it in the failed-jobs list; fix the cause, then requeue it |
| Sends failing | More than 5% of sends fail | Meta token expired or a template rejected: check the Meta app and `docs/runbooks/secret-rotation.md` |
| Webhook quiet | Shops have a live number but Meta sends nothing | Check the webhook subscription and the callback address in Meta; the public address answering 404 is a cause |
| Service not ready / worker silent (from the Worker) | The API cannot reach the database, a migration is missing, or the runner stopped | Open `/health/ready` to see which check names the failure |

An alert never contains a customer's name, number or message. If you need them, look inside
the workspace or the database, not in the alert.

## Free tools and when to pay

| Need | Now (free) | Pay when |
|---|---|---|
| Phone alerts | ntfy | Never needed; self-host if we want delivery guarantees |
| Outside uptime | UptimeRobot free | First paying client: Solo, USD 12 a month |
| Error tracking | In-house table (slice 2) | A second developer, or over 5,000 errors a month: Sentry Team |
| Logs | Cloudflare Workers Logs (200k events a day, 3 days) | Longer history is needed |
