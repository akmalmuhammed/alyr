# Production hardening: backups, restore and retention, 30 Oct 2026

ALY-34 ("Production hardening: backups, restore test and security review"), the part that is still
open on the production database after ALY-277 (alerts, incident runbook, the point-in-time rehearsal;
`docs/audit/restore-2026-10-30.md`) and ALY-119 (a customer's data, working-copy purge; D-075). Done by Claude
with the founder's `gcloud` (`akmal@alyr.qa`) between 13:00 and 14:00 UTC on 30 Oct (16:00 to 17:00 Doha).
Go-live audit IDs (CLD-, OPS-, SEC-, LEG-) are those of the 29 Oct audit, kept outside the repository.

**No customer data appears here.** The row-count check prints counts only. No secret value was read, written
or printed: secrets were listed by name, version and date, never opened. Times are UTC unless marked Doha (UTC+3).

## Verdict

- **The database is protected as the docs say, and thin for a few more days.** Point-in-time recovery is on (7 days;
  only 14 hours of it exist, because deleting the `eu` backups moved its start; full on 5 Nov), a backup runs every
  night at 02:00 Doha with 14 kept, all in Doha (one so far; 14 by 12 Nov), no public address, deletion protection on, and the newest backup and
  export are inside the limits their alerts watch. `infra/gcp/audit.sh` now checks all of it in one command and
  reports **no FAIL**.
- **A restore from a nightly backup works, and is timed.** Into a brand-new instance: 5 min 4 s to create, 7 min 4 s
  to restore, so **12 min 8 s** to a usable copy, then 1 minute to check it. Together with the point-in-time rehearsal
  (clone usable in 6 to 9 minutes), both ways back have now been run on production data.
- **What is still open**, in order of weight: (1) nothing deletes a business's data 60 days after it stops, which
  the privacy notice promises (product work, needs a way for a business to stop); (2) the development-era keys
  were never rotated, and the laptop still holds copies (founder); (3) no status page (a plan is written; needs a
  yes); (4) exports are not yet locked, which waits for one restore from an export on production data (founder).

## 1. What was asked, what was found

| Item in ALY-34 | Finding | State |
|---|---|---|
| Automated Postgres backups with point-in-time recovery | PITR **on**; transaction logs kept 7 days; the newest recoverable moment was 36 to 118 s behind real time in the audit. Automatic backup at 23:00 UTC (02:00 Doha), **14 kept** (counted, not dated), stored in `me-central1`. **Only one automatic backup exists in Doha so far** (29 Oct; the two before it were in `eu` and are gone), so a restore reaches back one night today and the full 14 nights exist from 12 Nov. **The point-in-time window shrank when those backups were deleted**: its earliest moment was 27 Oct 21:55 UTC before, and is 29 Oct 23:29 UTC now (about 14 hours). It grows by a day a day and is 7 days on 5 Nov. Until then an incident can only be restored to a moment after 29 Oct 23:29 UTC | ok; thin until 5 Nov |
| Backups stay in Qatar (hard rule 2) | The four older backups stored in the `eu` multi-region (CLD-1) were deleted on 30 Oct between 13:17 and 13:19 UTC by `akmal@alyr.qa` (the audit trail shows the four deletes). None is stored outside `me-central1` now | ok |
| One full restore, timed | Point-in-time: usable in 354 s, whole rehearsal 726 s (29 Oct). **Nightly backup: usable 12 min 8 s** (this page, section 2). Export to a scratch database: done on 27 Oct with the demo shop only | ok, export on production data open |
| The nightly export | `gs://alyr-prod-db-exports`, Doha, retention 35 days, objects deleted at 36, public access blocked, 3 files, newest 14 h old, schedule enabled. **Retention is not locked** (an owner could still shorten it) | ok; lock waits (section 5) |
| Secrets only in the key vault | 15 secrets, all stored in `me-central1` only; none of the five runtimes (API, web, worker, migrate job, export job) keeps a secret-looking setting as a plain value; every secret is read as `:latest`; no service-account key files exist; no project-wide Secret Manager role (ALY-268). **The laptop's `apps/api/.env` still holds the development-era copies** | production ok; laptop open |
| Rotate every key used during development | **None has been rotated since go-live.** Which are development-era and what to do: `docs/runbooks/secret-rotation.md`, "Where production stands". Five superseded secret versions are still enabled (CLD-15); no rotation schedule exists | open (founder) |
| Retention and deletion matching the PDPPL commitments | Table in section 3. **One promise has no job behind it: deleting a business's data 60 days after it stops** (SEC-6, LEG-1) | open (product) |
| Status page | **None exists** (OPS-16). Plan, options and who updates it: `docs/runbooks/status-page.md` | proposal |
| Incident checklist | **Exists** and describes Google Cloud: `docs/runbooks/incident-response.md` (first ten minutes, switches with their undo, rollback, restore, leaked secret, breach, the merchant notice in two languages, the review). Blanks only the founder can fill: on-call name, phone and hours; the breach authority and deadline (ALY-51) | ok; blanks open (founder) |
| Alerts reach a phone | Database, backup, export and cost alerts exist (ALY-277). **Still email only**: the founder adds the Google Cloud app (`infra/gcp/README.md`, 8b). New: an alert when the production database is deleted, cloned, restored over, or one of its backups deleted (section 4) | open (founder) |
| Rate limits on public endpoints; webhook replay protection | Not re-audited here. Seen in passing: the API in production reads the edge-signed visitor address (`ALYR_CLIENT_IP_HEADER` set, `client-ip-key` mounted), so the per-address limits are on (ALY-265). Handled-message IDs are kept 30 days against Meta's 7-day retry (`core/retention.py`) | covered elsewhere |
| Security review of the whole codebase, with a focused attempt to cross tenants | **Not part of this pass.** The 29 Oct audit (`security.md`) did it; its High findings (SEC-1 the back office's single emailed code, OPS-7 one human owner and unconfirmed 2FA, LEG-1 above) are what keeps "no open high-severity findings" from being true yet | open |

## 2. The drill: a nightly backup restored into a fresh instance

`infra/gcp/restore.sh backup-drill` (new). It never touches `alyr-db`: it makes an empty instance, restores a
backup over it, counts rows, counts production's for comparison, and deletes the instance, whatever happens in between.

| | Measured |
|---|---|
| Backup restored | `1793314800000`, automatic, window 23:00 UTC on 29 Oct, finished 23:29:59, stored in `me-central1` |
| Instance made | `alyr-restore-drill`: PostgreSQL 16, `db-f1-micro` (the smallest; production is `db-g1-small`), 10 GB SSD, one zone, private address only, no backups, no deletion protection, `me-central1` |
| Create requested 13:20:58 → usable 13:26:06 | **5 min 4 s** |
| Restore requested 13:26:28 → done 13:33:32 | **7 min 4 s** |
| **Decision to usable copy** | **12 min 8 s** (create + restore, measured) |
| Row-count check of the copy, then of production (a Cloud Run job inside the network) | The copy answered at 13:34:07, production at 13:35:05; about 1 minute each, job deploy and delete included |
| Delete requested 13:35:59 → gone 13:38:09 | 2 min 10 s; the instance lived **17 min 11 s** in all |
| Data lost by restoring this backup | The restore started 13 h 56 min after the backup ended; the copy's last worker check-in was 23:28:45, a minute before it ended. A nightly backup loses up to a day; the point-in-time clone loses under 10 minutes (`restore-rehearsal.md`) |
| **RTO of this way back** | 12 min to a usable copy, plus 1 minute to check it, plus the migrations when the backup is older than the last deploy (below), plus an estimated 3 minutes to point the apps at it (`restore.sh repoint`, not run on purpose). **About 20 minutes; plan for 30** |

What the copy held, against production at 13:35 (the difference is the explanation, not a fault):

| | Copy of the backup | Production now |
|---|---|---|
| Tables / with rows / rows | 100 / 21 / 107 | 110 / 25 / 132 |
| Row-level-security policies | 100 | 111 |
| Migrations applied (last) | 57 (`0060_resume_reminders.sql`) | 72 (`0076_chairs_deposits_reviews.sql`) |
| PostgreSQL | 16.15 | 16.15 |
| Not a standby (`pg_is_in_recovery`) | false | false |
| Application role `alyr_app` connected with the production password | **yes** | yes |

What the drill found:

1. **The backup predates v0.3.0.** It was taken at 23:00 UTC on 29 Oct and the release ran its migrations at about
   10:30 UTC on 30 Oct, so the copy has 57 migrations and production 72. After a restore from a backup older
   than the last deploy, **run the migration job before pointing the apps at the copy**, or the new code meets an
   old schema (`rollback.md`, "Going back across a migration", is the same point from the other side).
2. **The users come back with the backup.** The application role connected using the secrets as they are, so
   `restore.sh repoint` (new address in both URLs) is enough: no password has to be reset.
3. **A smaller instance can hold it.** A `db-f1-micro` took a `db-g1-small`'s backup. The restored copy is for
   proof, not for serving: a real restore should use production's tier.
4. **Making the instance is half the time.** 5 minutes of the 12 are Cloud SQL creating an empty instance, which
   does not depend on the data. A restore's duration will grow with the data; repeat the drill at ten paying
   clients or when the database passes 1 GB, whichever comes first.
5. **A deleted instance does not take its backups at once** (Google's page on backups, read 30 Oct 2026):
   backups taken while it lived are kept as "retained backups" and the automatic ones are removed one a day over
   the retention period. A deleted `alyr-db` is therefore recoverable for up to 14 days. On-demand backups never
   expire, which matters for the privacy notice (section 3).
6. **The first start of the drill had a trace switched on** (`bash -x`), which would have printed the throwaway root
   password of the drill instance into a log file. The log was deleted at once; the password belonged to an instance
   with no public address that was deleted 17 minutes later. The script itself never prints it.

Cost: one `db-f1-micro` with a 10 GB disk for 17 minutes and two one-minute Cloud Run jobs, under USD 0.05 at list
prices (estimate; the billing report lags by a day). Estimated at under USD 0.10 beforehand; authorised for this
one drill by the brief.

## 3. Retention and deletion against what the privacy notice promises

The promises are in `apps/web/app/_site/copyPrivacy.ts` (section "How long we keep it") and `/privacy`.

| Promise | What does it | State |
|---|---|---|
| A business's records are kept while it uses ALYR | Nothing deletes them; a workspace never closes (D-033, D-053, D-082) | ok |
| A business can ask for a copy of its records within 30 days of stopping | Owners download everything as one ZIP from their account screen (D-081) | ok |
| **ALYR deletes a stopped business's data 60 days after it stops, except what the law requires (our invoices)** | **Nothing.** There is no way for a business to stop yet (go-live item 39; `specs/038-customer-data/spec.md` defers it) and no deletion job (SEC-6, LEG-1) | **open** |
| Backups are gone within 35 days after that | Cloud SQL: 14 nightly (14 days), 7 days of logs. Exports: retention 35 days, deleted at 36. On-demand backups do **not** age out: they must be deleted by hand, and `audit.sh database` fails when one is over 35 days old. The `eu` backups were deleted on 30 Oct | ok, with the manual rule |
| A customer asks to see, correct or delete their data: answered within 30 days | The owner or admin downloads or forgets a customer from the conversation (D-075, `core/forget.py`); the rest is by email to hello@alyr.qa | ok |
| Working copies: finished jobs 30 days, failed jobs 90, handled-message IDs 30 | `core/retention.py`, run by the worker once a day. It shipped in v0.3.0 today and nothing is yet old enough to purge, so there is no log line to show; the worker logged no error from it in 24 hours. The tests prove the delete (`tests/test_retention.py`) | ok, unproven in production until data is 30 days old |
| The apps' logs are kept 30 days | Log bucket `alyr-doha`, Doha, 30 days. Request logs hold signed links for those days (CLD-21) | ok |
| Events sent to a business's own system are kept 30 days | `connect.webhooks.KEEP_DAYS` | ok |
| Session recordings (PostHog) deleted after 30 days | PostHog's own setting, in the EU | not checked here |
| "If a breach affects a business's data, we tell the business without delay" | `incident-response.md`, sections 6 and 7. The regulator and deadline are unknown until ALY-51 | ok; blanks open |

## 4. What this pull request changes

- `infra/gcp/restore.sh backup-drill`: the drill above, scripted, timed, deleting its instance on any exit.
- `infra/gcp/audit.sh`: the read-only audit of this page as a command. It reports **no FAIL** on production today
  (it caught its own two false alarms while being written: an empty value shifting the columns).
- **Alert (applied to production, additive and free):** the log metric `alyr-db-protected-actions` and the policy
  "Production database deleted, copied, restored over or its backups deleted", sent to the same email channel as the
  others. The filter was tried against the real audit log and matches the four backup deletions of 13:17 to 13:19 UTC
  (those happened before the metric existed, so it has not fired). It will also open on a restore rehearsal, which
  clones the database; it closes by itself after a day. `monitoring.sh apply` keeps it.
- Docs: the production state of secret rotation, the status-page proposal, the checklist lines, `hosting.md` (on-demand
  backups never expire; the new alert), `data-residency.md` (Google's audit trail is global and holds no merchant data),
  `restore-rehearsal.md`, `incident-response.md`, `status.md`, the go-live lane's "Now".

Not changed: `alyr-db` (no setting, no restart), any secret, any IAM binding, the budget, DNS, any running service.

## 5. What needs the founder's go (exact commands)

None of these was run. `gcloud` in Git Bash: `source infra/gcp/gcloud.sh`, then type `gcloud_run` for `gcloud`.

| # | Do | Command | Expected effect | Undo |
|---|---|---|---|---|
| 1 | Rotate the development-era keys, in this order (`secret-rotation.md`, "Where production stands"): Resend, R2, the Meta system-user token, then the Meta app secret and verify token together | Provider dashboards, then `infra/gcp/setup.sh set-secret <name>` for each (typed, hidden; it restarts the API and worker). For the two Meta values then `infra/gcp/setup.sh meta-webhook 1071845795713841` | A minute of restart per secret; Meta's webhook is refused between changing the app secret and storing it, so do both in one sitting | The old value stays as a version in Secret Manager until disabled |
| 2 | Once a rotated value works, disable the superseded secret versions (every runtime reads `:latest`, so no running app can be affected) | `infra/gcp/audit.sh secrets` prints each line, for example `gcloud secrets versions disable 1 --secret=meta-access-token --project=alyr-prod` (also `2`, and `r2-access-key-id`, `r2-account-id`, `r2-secret-access-key` version `1`) | The old values can no longer be read from Secret Manager | `gcloud secrets versions enable <n> --secret=<name>` |
| 3 | Delete the Cloudflare tunnel and its credentials file on the laptop (the webhook left it on 28 Oct) | Cloudflare dashboard > Zero Trust > Tunnels > delete; delete `~/.cloudflared/<id>.json` | One secret fewer; the laptop demo's public address `api.alyr.online` stops | Make a tunnel again |
| 4 | Test a restore **from an export** on production data, then lock the exports | (a) `SA=$(gcloud sql instances describe alyr-db --format='value(serviceAccountEmailAddress)')`; (b) `gcloud storage buckets add-iam-policy-binding gs://alyr-prod-db-exports --member="serviceAccount:$SA" --role=roles/storage.objectViewer`; (c) `gcloud sql databases create alyr_restored --instance alyr-db`; (d) `gcloud sql import sql alyr-db gs://alyr-prod-db-exports/<newest file> --database alyr_restored`; (e) compare table and row counts with `alyr`; (f) `gcloud sql databases delete alyr_restored --instance alyr-db` and `gcloud storage buckets remove-iam-policy-binding` with the same member and role; (g) `infra/gcp/setup.sh lock-backups` | A scratch database inside the production instance for a few minutes (45 KB of data); a temporary read grant on the export bucket. No restart. **The lock cannot be undone**: nobody can delete an export early, or shorten the 35 days | Everything but the lock |
| 5 | Optional: keep a last backup when the instance is deleted | `gcloud sql instances patch alyr-db --final-backup --final-backup-retention-days=30` | Nothing while it runs; a backup is taken at deletion and kept 30 days (inside the 35 of the privacy notice). Google's `--help` shows no restart warning on this flag | `gcloud sql instances patch alyr-db --no-final-backup` |
| 6 | Optional: record who read which secret (Data Access audit logs for Secret Manager) | Console > IAM & Admin > Audit Logs > Secret Manager API > Data Read. Not scripted: it edits the project's IAM policy | One log line per secret read, into the Doha log bucket (30 days). Small; look at the billing report after a week | Untick it |
| 7 | Optional, later: connection logging on the database (CLD-16) | `gcloud sql instances patch alyr-db --database-flags=log_connections=on,log_disconnections=on` | **The instance may restart** (about a minute of 503s; the apps reconnect). Do not set `log_min_duration_statement`: statements carry customers' data | `--clear-database-flags` (restarts again) |
| 8 | The status page (a plan, not built) | `docs/runbooks/status-page.md`, "The steps" | Free; one DNS record | |
| 9 | Fill in the blanks only you can: on-call name, phone and hours; the Google Cloud app as the phone channel then `infra/gcp/monitoring.sh apply` and `test-fire` | `incident-response.md` top; `infra/gcp/README.md` 8b | Alerts reach a phone | |

## 6. Follow-ups (new issues, not this one)

1. **Product:** a business can stop, and 60 days later its data is deleted except what the law requires (SEC-6, LEG-1;
   go-live item 39; `specs/038` says where). Without it the privacy notice promises something nothing does.
2. **Go-live lane:** `setup.sh db-password`, one command that rotates the application role's password in Cloud SQL
   and both URLs together (`secret-rotation.md`).
3. **Go-live lane:** the status page (`status-page.md`), after the founder's yes.
4. **Founder:** repeat both restore drills at ten paying clients, after any change to the tier, the network or the backup
   settings, and every quarter (`restore.sh rehearse` and `restore.sh backup-drill`; `audit.sh` before each).

## Not covered

- A restore from the **export** on production data (section 5, row 4), and the apps actually running on a restored
  copy (`repoint` is estimated, not run, because running it moves production).
- A restore with a realistic amount of data; the database is 107 rows today.
- A person doing it cold. Only its author has followed the runbook.
- The whole-codebase security review and the attempt to cross tenants; the application's rate limits and webhook
  replay checks as code (they were not re-read).
- Whether the Meta, Resend and R2 values in Secret Manager equal the laptop's: deliberately not compared, because
  that would mean reading them. The table in `secret-rotation.md` says "may" where this matters.
- Anything outside Google: Cloudflare, Meta, the R2 photos, PostHog.
