# Separate database logins for the back office and the worker

Written 31 Oct 2026 (ALY-125 part 3: SEC-2 and SEC-5 of the 29 Oct go-live audit). Why: D-137 and
`specs/047-back-office-hardening/spec.md` (Part 3). The commands run on the founder's machine, in
Git Bash, signed in with `gcloud auth login`; `infra/gcp/roles.sh` prints a plan before it changes
anything and never prints a secret.

**State on 31 Oct 2026: built and tested; not applied to production.** Releasing the code and its
migration (0097) changes nothing by itself: the guard is created **off**. Every step after that is the
founder's, one at a time, and each can be undone by the one before it.

## What was wrong, in plain words

The product keeps the back office's powers (every client's data, the staff list, the price list, the
audit log) and every business's jobs behind **guards**. Each guard read a session setting that the
application writes at the start of a transaction (`app.platform_admin`, `app.worker`). The
application connects to the database as one role, `alyr_app`, and any code running as that role can
write any setting. So a bug that ran one SQL statement of an attacker's choosing, as `alyr_app`, could
turn the setting on and read all clients, add itself to the staff list, or read every business's jobs.
The audit proved it on 29 Oct in a transaction it rolled back. Nobody has found a way to run such a
statement today. This closes the way from "a bug" to "every client's data".

## What it does

After `enforce`, a guard also asks **which login made the connection**. Three logins pass:

| Login | Used by | Passes |
|---|---|---|
| `alyr_app` | the API, for everything a shop's staff or a shop's customer asks for | **nothing of the back office, nothing of the jobs of every business**, whatever settings it writes |
| `alyr_admin` | the API, only for work that declares the back office: the back-office routes, the billing of ALYR's own clients, the audit log (`core/roles.privileged`) | the back office |
| `alyr_worker` | the worker process (its own `ALYR_DATABASE_URL`) | the back office (its hourly plan check needs it) and every business's jobs |
| the database owner | migrations, the first-admin job, the erasure job, the break-glass jobs | everything, as before |

`alyr_admin` and `alyr_worker` are **members of `alyr_app`**: they can do what the application role can,
and nothing else is granted to them. A table added later for `alyr_app` is theirs too. `alyr_app`
cannot become either (tested: `set role alyr_admin` is refused), cannot write the switch, and cannot
create a role.

## What it does not fix

- `users`, `sessions`, `login_codes` and `signup_tokens` have no row-level security and the application
  role can still read and write them. Someone who runs SQL as `alyr_app` can still mint a session and
  read people's emails. So the second factor (D-136) is still a rule the application keeps. Narrowing
  that is a follow-up (a separate sign-in role).
- The API process holds both logins (its own and `alyr_admin`). Someone who can run code **in** the API
  process, not just SQL as its role, has both. The worker is a separate process with only its own.
  Both run as the one Google account `alyr-run`, so the separation is by which address each is given.
- `memberships` (`app.user_id`) and the connect API keys (`app.api_key_prefix`) still lean on a setting.
- The passwords of the two logins are not rotated by a script yet.

## Switching it on (the order matters)

Do this only after the release that carries the code is live. Nothing here is done by Claude. Each step
says what to look at before the next.

1. **Make the logins.** `infra/gcp/roles.sh create`. It makes two secrets in Secret Manager
   (`admin-database-url`, `worker-database-url`: the application's address with a new role and a new
   random password; nothing is printed), lets `alyr-run` and `alyr-migrate` read them, gives the
   migration job both, and runs it, which makes the roles `alyr_admin` and `alyr_worker` with a login.
   *Look:* the job ends "succeeded". Nothing uses the roles yet; nothing changes.
2. **Make the status job (once).** `infra/gcp/roles.sh deploy v0.x.y` (the tag the API runs), then
   `infra/gcp/roles.sh status`. *Look:* both roles `can_log_in: true`, `member_of_alyr_app: true`,
   `superuser: false`, `bypasses_rls: false`; `enforced: false`.
3. **Move the services.** `infra/gcp/roles.sh move`. It gives the API `ALYR_ADMIN_DATABASE_URL` and moves
   the worker's `ALYR_DATABASE_URL` to its own secret: two new revisions (the worker restarts; its jobs
   wait about a minute). **The guard is still off, so everything behaves as before, on the new logins.**
   *Look:* `roles.sh status` shows `connections_open_now` for `alyr_admin` and `alyr_worker` above zero.
   Sign in to `/ops`, open Today and Clients, publish nothing; in the workspace send a test message so
   the worker has run a job.
4. **Turn the guard on.** `infra/gcp/roles.sh enforce`. It shows `status`, asks you to type `ENFORCE`,
   and then `db_roles enforce` **refuses unless both new logins are connected right now.**
5. **Check.** `/ops` (Today, Clients, Price list, Audit log) and the workspace work; a test message is
   sent; `infra/gcp/audit.sh` runs. The audit log has `database.roles_enforced`.

**To undo, at any moment, in this order:** `infra/gcp/roles.sh relax` (instant: every guard reads only
the setting again, as before, whatever login connects), then, if you want the services back on the
application login, `infra/gcp/roles.sh back`.

A full deploy from the laptop (`setup.sh apps`) keeps the two addresses on the API, the worker and the
migration job when they are there. The release workflow only changes images and leaves them alone.

## When something is wrong

| What you see | Meaning | Do |
|---|---|---|
| `/ops` shows an error; the API log says `back office only` (SQLSTATE 42501) | The guard is on and the API is not on `alyr_admin`: a new revision without `ALYR_ADMIN_DATABASE_URL`, or the secret unreadable | `roles.sh relax`; then `status` and the revision's secrets; then `move` again |
| Messages are not sent; the worker log says it finds no jobs | The guard is on and the worker is on the application login | `roles.sh relax`; then `status`; `move` again |
| `enforce` refuses: "nothing is signed in as alyr_worker" | The worker has not restarted on its new login yet, or `move` was not run | `status`, wait for the revision, try again. It refused so that the product would not stop |
| `enforce` refuses: "alyr_admin cannot log in" | The migration job has not seen the address: `create` was not run or the job lost the secret | `roles.sh create` again (it keeps secrets that exist) |
| After restoring a backup | The guard's switch and the roles come back as the backup had them | `status`; run the migration job; `enforce` again if it is off |

## Rotating the two passwords

Not scripted. Until it is: create a new version of the secret with a new password, run
`ALTER ROLE alyr_admin PASSWORD '…'` as the owner from a Cloud SQL session (the founder's `gcloud sql
connect`), then restart the service that uses it (`setup.sh set-secret` restarts the API and the worker).
Tracked as a follow-up in D-137.
