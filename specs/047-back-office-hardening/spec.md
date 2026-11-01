# 047 · Hardening the back office and the database roles (ALY-125)

Status: parts 1, 2 and 3 built (D-135, D-136, D-137). Part 3 is built and not applied: the founder
runs `infra/gcp/roles.sh` step by step.

**The problem.** `/ops` can read every client's data and change every client's price, and its
only protection is a six-digit code emailed to one address. The 50 clients ALYR is about to take
should not be one stolen staff sign-in away from each other's data, and the database should not
rely on the application alone to keep staff powers to staff. Three parts, in this order:

1. **Staff sign-in hardening** (this part): a cap on wrong codes per account per day, and a note
   and an email for every sign-in from somewhere new.
2. **A second factor for staff**, in the app (authenticator app, recovery codes), enforced on
   `platform_admin` behind a setting that is off until the founder has enrolled.
3. **Separate database roles** for the back office and for the worker (SEC-2, SEC-5).

What is out of scope on purpose: Cloudflare Access in front of `/ops` (ALY-219, the founder's and
the Cloudflare session's); the same cap for owner and agent accounts (a follow-up); removing the
founder's address from public documents.

## Part 1 · The cap and the alert

### What a person sees

- **Locked.** After ten wrong codes in 24 hours a staff account refuses every code. The answer is
  the one any wrong code gets (`401`, "that code is wrong or has expired"), so the sign-in form
  cannot be used to learn who is staff. The person gets an email (English and Arabic) saying so,
  and when it lifts, in Doha time.
- **New sign-in.** A staff sign-in from a browser or an address not seen for that person before
  sends them an email naming the browser and system ("Chrome on Windows"), the address and the
  time, and what to do if it was not them. Every staff sign-in, new or not, is a line in
  `/ops` → Audit.

### How it works

| | |
|---|---|
| The cap | `core/staff_security.py`. Wrong codes of an email on `platform_admins` are counted in `rate_hits` (bucket `staff-wrong-code`, key a hash of the email). `core/auth.check_code` takes the account's advisory lock, refuses at the cap, and counts a wrong code in the same transaction as the code's own attempt counter, so parallel guesses cannot pass nine |
| What counts | A guess at a live code that is wrong. A code request, a code with no row to guess at, a code already burnt by five guesses, and a refusal at the cap are not counted again |
| The window | Rolling 24 hours. It lifts when the oldest wrong code that keeps the account at the cap is a day old (`lifts_at`) |
| The announcement | Once, by the wrong code that reaches the cap: `staff.locked` in the audit log, an email to the person, `alerts.notify` for ALYR (a count, never the address) |
| The note | `record_sign_in`, after a correct code, on `/api/auth/verify` and `/api/onboarding/verify` (the sign-up door signs a known email in too). `staff.sign_in` in the audit log: device phrase, address, `new_device`, `new_address`, `email` (`sent`, `not_needed`, `mail_not_configured`, `not_deliverable` or `send_failed`) |
| "Seen before" | `staff_known` (migration 0095): `(email, kind, value)` with `value` a SHA-256 of the user-agent text or of the address. The address itself is only in the audit entry |
| What a mail failure does | Nothing to the sign-in. It is logged and the audit entry says `send_failed` |
| The way through a lock | `python -m alyr.staff_breakglass` (`status`, `clear-lock`), run as a Cloud Run job under the database owner's account (`infra/gcp/staff-access.sh`, `docs/runbooks/staff-sign-in.md`). Writes `staff.breakglass` to the audit log with the reason |

### Hostile cases, and where they are tested (`tests/test_staff_sign_in.py`, `tests/test_staff_breakglass.py`)

| Case | Result |
|---|---|
| Ten wrong codes over two codes, then the right one | Refused with the words of any wrong code |
| Nine wrong codes, then the right one | Signs in |
| Forty parallel wrong guesses with nine already counted | Exactly one more is counted; the count never passes ten (removing the advisory lock makes this test fail) |
| Removing the check at the cap | Three tests fail |
| Wrong codes on an owner's account | Not counted; one staff account's count does not touch another's |
| A lock whose wrong codes are 25 hours old / only some of them 23 hours old | Lifted / still locked |
| Mail provider down | Sign-in works; the audit entry says `send_failed` |
| An address the edge did not vouch for | Shown as "unknown"; the device still decides what is new |
| What a client sends as its user-agent or name | The device phrase is a fixed vocabulary; names and addresses are escaped in the email |
| The break-glass script on a non-staff email, with no reason, with a long reason, or with an unknown command | Refused, nothing written |

### Not done

- Owner and agent accounts have no daily cap (SEC-2).
- The device is a browser and a system read from the user-agent text. It is a hint, not an
  identity: a thief who copies the user-agent and sits behind the same address is not new.
- `staff_known` can be written by the application role, so an attacker who already runs SQL as
  the application can add their own device and silence the email. Part 3 narrows that.
- The Audit screen is English only, like the rest of `/ops`.

## Part 2 · The second factor

### What a person sees

- **Security** (`/ops/security`): *Set up your authenticator app* shows a square to scan (and the key to type), asks for the first code, then shows ten recovery codes once, with *Copy*, *Download* and a tick to say they are saved. Afterwards the screen says when it was turned on, how many recovery codes are left, and whether the console requires it. *Check my app*, *Replace the app*, *Make new recovery codes* and *Turn it off* each ask for a current code or a recovery code.
- **The door.** While the second factor is required and the sign-in has not passed it, the console draws one of three screens instead of itself: *Enter your authenticator code* (with *Use a recovery code instead*), *Set up your authenticator app* (only when enrolment is open for that person), or *This account has no authenticator yet* (enrolment closed; says who can open it). All three, and Security, are in English and Arabic with a switch that shares the workspace's language choice.
- **Emails** (both languages): set up, replaced, turned off, new recovery codes, a recovery code used. Audit log: `staff.factor_enrolled`, `_replaced`, `_removed`, `_recovery_new`, `_recovery_used`, `_paused`.

### How it works

| | |
|---|---|
| The setting | `ALYR_STAFF_2FA`, default off. Off: no route asks for the factor. On: `platform_admin` (every `/api/admin` route) refuses a session that has not passed it, with `403 {code: "second_factor_required", enrolled, enrolment_open}` |
| Who passed | `sessions.second_factor_at`, not earlier than `staff_factors.confirmed_at`. Passing the factor deletes the session row and writes a new one with a new cookie value, keeping its start and its end, so the back office's 12 hours do not restart |
| The routes | `/api/admin/factor`: `GET` (state), `POST /verify`, `/begin`, `/confirm`, `/recovery`, `/disable`. They use `staff_member` (staff, session under 12 hours, **no factor needed**) |
| The code | RFC 6238, SHA-1, 6 digits, 30 seconds; the step before and after count. A code is spent by `update staff_factors set last_step = step where last_step < step`, so the same step cannot pass twice, even at the same moment |
| Recovery codes | Ten, 12 characters from a 32-letter alphabet, `XXXX-XXXX-XXXX`; typed in any case, with or without dashes; each is spent once (`used_at`); new ones delete the old |
| Wrong codes | Counted in `rate_hits` (bucket `staff-factor`) behind an advisory lock for the account: 5 in ten minutes or 20 in a day pause it (429 with `Retry-After`; the right code too). A replayed code and a wrong recovery code count |
| Setting up | `begin` stores a pending secret; `confirm` makes it the working one on its first right code. A replacement needs a current code to `begin`, and the old factor works until `confirm` |
| Closed enrolment | While required, `begin` for an account with no factor is refused (`enrolment_closed`) unless `staff_factors.enrol_open_until` is in the future; only the break-glass sets it, for 30 minutes, and a successful `confirm` clears it |
| Turning off | Needs a current code; refused (`second_factor_required`) while the setting is on |
| The secret | Sealed (AES-256-GCM, key from HKDF over `ALYR_LINK_SECRET`, the email as associated data); recovery codes as HMAC-SHA256 under another derived key |
| Way back | `staff_breakglass`: `ready`, `reset-factor` (also ends the person's sessions), `open-enrolment`, and `clear-lock` (also the authenticator's wrong codes); `infra/gcp/staff-access.sh` adds `require` (refuses unless `ready`) and `unrequire` |

### Hostile cases, and where they are tested (`tests/test_staff_second_factor.py`, `tests/test_staff_breakglass.py`, `ops/factor.test.mjs`)

| Case | Result |
|---|---|
| The RFC 6238 test values | Same six digits |
| A code replayed, or the code used to set up | Refused; the next step's code works |
| One step off either way / two steps off | Accepted / refused |
| Two sessions send the same fresh code at once | One accepted, one refused |
| Five wrong codes, then the right one / twenty in a day | 429, then lets back in after ten minutes / a day |
| Thirty parallel wrong codes | Exactly five counted; announced once |
| A cookie planted before sign-in | Not the cookie after sign-in; on its own opens nothing |
| After passing the factor | The old cookie value is gone; the session kept its start |
| A verified session, then the factor is replaced elsewhere | The old session stops being verified |
| Turning off with no code, a wrong code, an empty one | 401; with the right one it works; while required, refused even with it |
| A stolen unverified session asks for `begin`, `recovery`, `disable` | 401 each |
| Required, no authenticator, enrolment closed / window open / window run out | `begin` refused / allowed / refused |
| A reset or an enrolment window | Ends sessions / lets the person enrol once and then shuts |
| `ready` with an account not enrolled, or with no recovery code left | Refused |
| Removing the replay rule, the check on `platform_admin`, the new cookie, the guard on wrong codes, the refusal to turn off while required, the closed enrolment, or widening the drift | Each fails 1 to 4 tests |
| The open local demo (no person) with the setting on | Not asked; the factor routes answer 400 |

### Not done

- Passkeys; a second factor for owners and agents.
- A second member of staff enrolling from the door needs `open-enrolment`.
- It is a rule the application keeps; part 3 narrows what the application's database role can do.
- A real phone app has not scanned the setup square. `ops/factor.test.mjs` reads it back with an independent decoder (jsQR) as exactly the key link the API makes, at two sizes; the key link follows the Key URI format that authenticator apps share.

## Part 3 · The database roles (SEC-2, SEC-5)

### The problem, in one paragraph

The guards that keep the back office's powers and every business's jobs to ALYR read a session setting that the application writes (`app.platform_admin`, `app.worker`). Any code running as the application's database role can write any setting, so one SQL statement run as `alyr_app` could read all clients, add itself to the staff list or read every business's jobs (proved on 29 Oct, in a rolled-back transaction). The fix makes those powers a property of **who signed in to the database**.

### What exists

| | |
|---|---|
| Roles | `alyr_admin` (the API's back-office work) and `alyr_worker` (the worker process), created by `migrate.py` (`ensure_platform_roles`), each a member of `alyr_app`; NOLOGIN unless their address is in the migration job's environment (`ALYR_ADMIN_DATABASE_URL`, `ALYR_WORKER_DATABASE_URL`) |
| The switch | `role_guard.enforced` (migration 0097), default **false**; written only by the owner (`python -m alyr.db_roles enforce / relax`) |
| The guards | `is_back_office()` (the policy of every back-office table), `assert_platform_admin()` (every `admin_*` function) and the `jobs` policy still read the setting and, while enforced, also need `session_user` to be an allowed login: `alyr_admin`, `alyr_worker` or the database's owner for the back office; `alyr_worker` or the owner for jobs |
| The API | `ALYR_ADMIN_DATABASE_URL` opens a second pool, `app.state.db.admin`; `core/roles.privileged(db)` returns it (or `db`). Used by `routes/admin.py` `_back_office`, `core/access.office`, `core/subscription._cancel_at_provider` and `core/staff_security.audit_event`. The worker is moved by pointing its own `ALYR_DATABASE_URL` at `worker-database-url`: no code |
| The way on and off | `infra/gcp/roles.sh` (`create`, `deploy`, `status`, `move`, `enforce`, `relax`, `back`; not applied); `setup.sh apps` keeps the addresses; `docs/runbooks/database-roles.md` |
| The safety | `enforce` refuses unless both new logins are connected right now, and unless neither can bypass row-level security; `relax` always works; both are in the audit log |

### Hostile cases and where they are tested (`tests/test_database_roles.py`)

| Case | Result |
|---|---|
| Not enforced, as `alyr_app`: set the setting, call the guard, `admin_staff()`, read another business's jobs | Works, as before (the test records the attack, so the switch is shown to be what matters) |
| Enforced, as `alyr_app`: the same, `admin_add_staff`, `clients`, a forged audit row, `set role alyr_admin` | Each refused or empty; nothing written |
| Enforced, as `alyr_app`: write `role_guard`, or a setting in the middle of the session | Refused; no way round |
| Enforced, as `alyr_admin` | Back office opens (with the declaration); the jobs of every business do not; without the declaration it is an ordinary role |
| Enforced, as `alyr_worker` | Every business's jobs and the back office open (its plan check); without the setting it sees only its own business |
| Enforced, as the database owner | Not locked out |
| Back to not enforced | The application role is as it was |
| The whole product on the admin login with the guard on | Sign-up, pricing, publishing a quote, Today, Staff, the audit log and the workspace work |
| The guard on and the API not moved | The back office fails (so `enforce` must refuse that) |
| `enforce` too early / a role with no login / no reason / a long reason / an unknown command | Refused; the switch unchanged |
| `access.office` and the audit log's writer, with the guard on | Use `alyr_admin` through `db.admin` |
| Five mutations: the guard ignoring the login, the jobs policy ignoring it, the back office on the application login, billing on it, the worker accepted as an admin | Each fails 1 to 4 tests |

### Not done

- `users`, `sessions`, `login_codes` and `signup_tokens` remain open to the application role (a separate sign-in role is the follow-up).
- `memberships` and the connect API keys still lean on a setting.
- A script to rotate the two passwords.
- Nothing is applied to production: the founder runs `infra/gcp/roles.sh` step by step.
