# 047 · Hardening the back office and the database roles (ALY-125)

Status: part 1 built (D-135). Parts 2 and 3 are written into this file by the pull requests that
build them.

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
