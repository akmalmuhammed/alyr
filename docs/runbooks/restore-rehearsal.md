# Restoring the database, and rehearsing it

ALY-277 (OPS-8, CLD-5). The database is Cloud SQL `alyr-db` in Doha: one instance, one zone, shared
core, no standby. This page is what to do when its data is wrong or gone, and how to prove the
steps still work. The first rehearsal, with measured times, is `docs/audit/restore-2026-10-30.md`.
When to use it in an incident: `docs/runbooks/incident-response.md`, section 4.

## What we promise ourselves

| | Target | Basis |
|---|---|---|
| **RPO** (data we can lose) | Under 10 minutes | The rehearsal measured the newest recoverable moment 97 and 299 seconds behind real time, and the clone held every write up to the moment asked for. A nightly backup alone would lose up to a day |
| **RTO** (time to be back) | About 15 minutes from the decision to restore; plan for 30 | Measured: the clone usable in 6 to 9 minutes, the check 1 minute. Estimated, not run: rewriting the secrets and restarting the apps, 3 minutes. The data is tiny today (100 tables, 107 rows); it grows with the data, so repeat the rehearsal at ten customers |

These are what the setup achieves, not a promise to clients (the clients' hours and promises are the
founder's, in the incident runbook). A single-zone, shared-core instance is outside Google's SLA
(CLD-5). Moving to a dedicated-core tier with a standby (`--availability-type=REGIONAL`, roughly double
the database cost) is the next step if a paying client needs a firmer RTO.

## Which way to restore

| Situation | Way | Keeps the address? |
|---|---|---|
| Data wrong from a known moment (bad migration, bad import, deleted rows) | **Point-in-time clone** of `alyr-db` to a new instance (below) | No: new address, new name |
| The instance is lost or its disk is corrupt, or point-in-time recovery cannot reach the moment (it only reaches back as far as the oldest backup that exists) | Restore a nightly backup into a new instance of the same version and at least the same disk size: **`infra/gcp/restore.sh backup-drill` is exactly this, run on a temporary instance and measured** (below); by hand, create the instance first, then `gcloud sql backups restore <id> --backup-instance=alyr-db --restore-instance=<new>`; the list: `gcloud sql backups list --instance alyr-db`. A deleted `alyr-db` leaves its backups for up to 14 days (Google keeps them as retained backups) | No |
| Only a few tables or rows are needed | Clone, read the rows from the clone, put them back with a normal change, delete the clone | The apps never move |
| Everything inside Cloud SQL is gone or untrusted | Import the newest export: `gcloud sql import sql <instance> gs://alyr-prod-db-exports/<file> --database alyr` into an empty database (`docs/hosting.md`, "Backups on Google") | No |

Everything below is for the first row, the common case.

## The steps

Times are from the rehearsal of 30 Oct 2026 (`docs/audit/restore-2026-10-30.md`).

1. **Decide the moment.** The last time the data was good, in UTC. Anything between the earliest and the latest
   moment that `gcloud sql instances get-latest-recovery-time alyr-db` prints works. **The earliest is not always 7 days ago:**
   it is the end of the oldest backup that still exists (on 30 Oct 2026 it was 14 hours ago, because the old `eu` backups had
   just been deleted; it is 7 days from 5 Nov). A moment before it needs a nightly backup instead (row 2). If the damage is still spreading,
   close the API first (incident runbook, section 2).
2. **Clone** (6 to 9 minutes, measured):
   `infra/gcp/restore.sh clone alyr-db-restored 2026-10-30T09:15:00Z`
   Leave the time off to take the newest moment. The clone is the same size and settings, in the
   same network, **with a new private address** (each rehearsal clone got a different address from `alyr-db`).
   Name it something that tells it from the old one. **A deleted instance's name cannot be used again
   for about a week**, so you cannot restore "back into" `alyr-db`: the clone's name becomes the new name.
3. **Check it** (1 minute, measured) before anything is pointed at it:
   `infra/gcp/restore.sh check alyr-db-restored`
   A one-off job runs the API's image inside the private network and prints counts only (tables, rows,
   security policies, applied migrations, the worker's last check-in, and whether the application role
   can connect). Compare with what you expect. Nothing is copied out and no data is shown.
4. **Point the apps at it** (estimated 3 minutes; the rehearsal does not run this step): `infra/gcp/restore.sh repoint alyr-db-restored`
   - **The address of the database is written into both secrets, `database-url` and `migration-url`.**
     Each holds the whole URL, address included, so a new instance means rewriting both. The passwords
     stay the same: a clone carries its users with it. Old secret versions stay in Secret Manager, so
     going back is possible (step 8).
   - Then the API and the worker are restarted so they read the new value. The web app does not
     talk to the database. The migrate and first-admin jobs read `:latest` each time they run. Since
     ALY-268 only the migrate and first-admin account reads `migration-url`; the API and worker read
     `database-url`. `repoint` rewrites both either way.
5. **Check the apps:** `curl -s https://api.alyr.qa/health/ready`, `.../health/worker`, then sign in at
   `https://app.alyr.qa/login` and open a conversation. Look at the last customer message: it should be the last one before the moment you chose.
6. **Fix what is keyed to the old instance's name.** None of these follow a rename by themselves:
   - the nightly export reads `INSTANCE=alyr-db`:
     `gcloud run jobs update alyr-db-export --region me-central1 --update-env-vars=INSTANCE=alyr-db-restored`;
   - the new instance writes exports as its own Google account, which must be allowed into the bucket:
     `gcloud storage buckets add-iam-policy-binding gs://alyr-prod-db-exports --member="serviceAccount:$(gcloud sql instances describe alyr-db-restored --format='value(serviceAccountEmailAddress)')" --role=roles/storage.objectCreator`
     (a new instance's account is refused as "invalid" for a few minutes; try again);
   - the database alerts watch `alyr-prod:alyr-db`:
     `ALYR_SQL_INSTANCE=alyr-db-restored infra/gcp/monitoring.sh apply`;
   - the new instance has its own backup, point-in-time and deletion-protection settings, copied from
     the old one by the clone. Check them: `gcloud sql instances describe alyr-db-restored`.
7. **Keep the old instance until the incident is closed**, for comparison. It costs about USD 34 a month, so
   do not leave it. `gcloud sql instances patch alyr-db --no-deletion-protection`, then
   `gcloud sql instances delete alyr-db`.
8. **Going back** (the restore was the wrong call, the old instance is untouched): `infra/gcp/restore.sh revert`. It puts the
   previous value of `database-url` and `migration-url` back as the newest version of each, then restarts the API and the
   worker as in step 4. Run it once: a second run goes forward again. **Do not go back by disabling the newest version.**
   `:latest` is the highest version number and does not fall back to an older one: with the newest disabled, reading
   `:latest` fails (`FAILED_PRECONDITION`, tried on a scratch secret on 30 Oct 2026), so new copies of the API and worker
   would not start. (An earlier version of this page said to disable the newest; that was wrong.)

## Restoring a nightly backup (the second way back)

`infra/gcp/restore.sh backup-drill [<backup id>]` restores the newest automatic backup in Doha into a new
temporary instance `alyr-restore-drill` (`db-f1-micro`, private address only, no backups of its own), counts its rows and
production's, and deletes it, whatever happens. First run, 30 Oct 2026 (`docs/audit/hardening-2026-10-30.md`):

| | Measured |
|---|---|
| Create the empty instance | 5 min 4 s |
| Restore the backup over it | 7 min 4 s |
| **Decision to a usable copy** | **12 min 8 s** |
| Row-count check | about 1 minute |
| Delete | 2 min 10 s (17 min 11 s from create to gone) |
| Data lost | Everything after the backup: 13 h 56 min in that run, about a day at worst (the backup runs at 02:00 Doha) |

Exact times, UTC, 30 Oct 2026 (Cloud SQL's operation records and the audit log): create requested 13:20:58, usable 13:26:06;
restore requested 13:26:28, done 13:33:32; copy counted 13:34:07, production counted 13:35:05; delete requested 13:35:59,
**gone 13:38:09**. Delete confirmation: the audit log's closing `cloudsql.instances.delete` entry at 13:38:09, `gcloud sql instances
describe alyr-restore-drill` answering 404, and `gcloud sql instances list` showing only `alyr-db`.

For a real restore, with this way:

1. Make the instance at **production's tier** (`db-g1-small`), at least the same disk size, private address only, the same
   PostgreSQL version, and restore the backup onto it (the script's `create` and `restore` lines show the flags).
2. **If the backup is older than the last deploy, run the migrations first**: the 30 Oct backup had 57 migrations and production 72.
   Point the migration job at the copy (`restore.sh repoint` writes both secrets; then `gcloud run jobs execute alyr-migrate
   --region me-central1 --wait`), because the new code meets the old schema otherwise.
3. The users come back with the backup (the application role connected with production's own password), so `restore.sh check`
   then `restore.sh repoint <name>` and the rest of "The steps" above (from step 3) apply unchanged.

## What the rehearsal does

`infra/gcp/restore.sh rehearse` is steps 2 and 3 on a throwaway clone, with a stopwatch, and then deletes it:

1. Shows what the address rewrite does to a made-up URL (it reads no secret).
2. Asks Cloud SQL for the newest recoverable moment and notes how far behind real time it is: that is the RPO.
3. Clones `alyr-db` to `alyr-db-rehearsal-<date>` at that moment (same tier, same network, same region, `me-central1`).
4. Runs the row-count check from inside the network.
5. Turns off deletion protection on the clone (it copies the setting), deletes it, and confirms it is gone.

It never touches `alyr-db`, never points an app at the clone, never writes a secret and never copies data out.
The clone lives for minutes and costs cents (an extra `db-g1-small` and 10 GB of disk).
If anything fails after the clone exists, the script still deletes it. Check `gcloud sql instances list`
afterwards: only `alyr-db` should be there.

Rehearse both ways (`rehearse` and `backup-drill`): once before the first paying customer (done 30 Oct 2026), after any change
to the backup settings, the database tier or the network, and every quarter. The go-live checklist wants one in the last 30 days.
The rewrite of the secrets and the restart of the apps are deliberately **not** done in the rehearsal, because
doing them would move production onto the clone. Their steps are exact (`restore.sh repoint`), the address rewrite
is shown on a made-up URL each time, and the redeploy times come from past deploys.
