# Runbook · Monitoring and alerts (ALY-121, D-073, spec 034)

Who gets woken, by what, and what to do first. Production is Google Cloud in Doha (D-060,
`docs/hosting.md`); its uptime checks watch `/health/ready` and `/health/worker`. The alert
rules below run inside the worker and watch what an uptime check cannot see.

## One-time setup

1. **Phone alerts (parked by the founder, 24 Oct).** Install the free ntfy app and subscribe
   to a long random topic name (the name is the password: never put it in the repo or a chat).
   Store it in Secret Manager as `ALYR_ALERT_NTFY_TOPIC` and give it to the worker.
2. **Email alerts.** Set `ALYR_ALERT_EMAIL` on the worker (planned: ops@alyr.qa, once it
   exists). The worker also needs the Resend key, `ALYR_EMAIL_API_KEY`.
3. Until both are set, alerts are only log lines (`ALERT ...` from `alyr.alerts`) in Cloud
   Logging. The error alert of PR #151 (metric `alyr-app-errors`) does not count them; adding
   `ALERT ` to its filter in `infra/gcp/setup.sh monitoring` would email them without either.
4. On call: the founder (24 Oct). Write it in `docs/access.md` when a second person exists.

## What an alert means and the first step

| Alert | Meaning | First step |
|---|---|---|
| Messages are waiting (`queue_late`) | Jobs are due and nothing is taking them | Open `/health/worker`. 503: the worker is down, restart the worker pool (roll back if a deploy caused it). 200: look for one slow or stuck job |
| A job gave up (`job_parked`) | A job used all its attempts | Read it in `/ops`, failed jobs; fix the cause, then retry it |
| WhatsApp sends are failing (`sends_failing`) | More than 5% of sends fail | Meta token expired or a template rejected: check the Meta app and `docs/runbooks/secret-rotation.md` |
| No WhatsApp message received (`webhook_quiet`) | A shop has a live number but no customer message arrived for 15 minutes in opening hours | Check the webhook subscription and callback address in Meta; the public address answering 404 is a cause |
| Uptime check failed (Cloud Monitoring) | The API cannot reach the database, or the worker stopped checking in | Open `/health/ready` and `/health/worker` |

An alert never contains a customer's name, number or message. If you need them, look inside
the workspace or the database, not in the alert.
