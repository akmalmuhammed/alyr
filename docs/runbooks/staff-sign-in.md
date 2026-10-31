# ALYR staff sign-in: what protects the back office, and the way back in

The back office (`/ops`) reads every client's data, so the accounts that open it get more than an
ordinary sign-in. Written 31 Oct 2026 (ALY-125). Why each rule is what it is: D-135, and
`specs/047-back-office-hardening/spec.md`. The break-glass commands run on the founder's machine,
in Git Bash, signed in with `gcloud auth login`; `staff-access.sh` prints a plan before it changes
anything and never prints a secret.

**State on 31 Oct 2026: built and tested; not on production until the next release.** The only
account on the staff list is the founder's.

## What protects it now

| Layer | What it does | Where |
|---|---|---|
| The code | A six-digit code by email, valid once, for ten minutes. Five guesses a code, five codes an hour | `core/auth.py`, `core/ratelimit.py` |
| **The daily cap** | For a staff account, ten wrong codes in 24 hours lock it: every code is refused, the right one too, with the same words as any wrong code, until the oldest wrong code is a day old | `core/staff_security.py` |
| **The note** | Every staff sign-in is written to the audit log (`/ops` → Audit: "Signed in to the back office", with the browser, the system and the address) | `platform_audit`, action `staff.sign_in` |
| **The alert** | A sign-in from a browser or an address this person has not signed in from before sends them an email (English and Arabic). The first sign-in after this ships is "new" on both counts, so expect one email | `mail.staff_sign_in_message` |
| A short session | A back-office session lasts 12 hours, then the code again | `core/backoffice.py` |

When the cap is reached three things happen once: the account owner gets an email, ALYR's alert
channels hear of it (the ntfy topic and the alert email of `infra/gcp/README.md` 8b; the alert has
a count and no address), and `staff.locked` is written to the audit log.

## An email says "new sign-in to the back office"

1. **If it was you**, nothing to do. A new phone, a new network, a private window and a cleared
   browser all look new.
2. **If it was not you**, someone read your inbox, because a sign-in code was needed. In this
   order: (a) secure the mailbox: change its password, check its two-step verification and its
   forwarding rules and signed-in devices; (b) end the sessions: sign in yourself and press Sign
   out, or run `infra/gcp/staff-access.sh status <email>` and, if a stranger's sign-in is listed,
   treat it as a breach: `incident-response.md`, sections 6 and 7; (c) look at `/ops` → Audit for
   what that session changed.

## The account is locked

Symptom: the right code is refused, with "that code is wrong or has expired", and an email said
"Sign-in to your ALYR account is paused". It lifts by itself when the oldest of the ten wrong codes
is a day old (the email says when, in Doha time). To go in sooner, use the break-glass below.

Remember what a lock means: **someone typed ten wrong codes**. Perhaps you did. If you did not,
someone is guessing, and the first thing to check is the mailbox (above).

## Break-glass

A command, not a screen. It runs as the database owner, which nothing a stolen staff sign-in can
reach can become. It knows two commands, writes `staff.breakglass` to the audit log with your
reason for every change, and Google logs who started it.

One time, to make the job (it has no schedule and does nothing until started):

```bash
infra/gcp/staff-access.sh plan v0.x.y     # prints what deploy would do; calls nothing
infra/gcp/staff-access.sh deploy v0.x.y   # the release tag the API is running
```

Then, when needed:

```bash
infra/gcp/staff-access.sh status akmal@alyr.qa
infra/gcp/staff-access.sh clear-lock akmal@alyr.qa "locked out by wrong codes"
```

`status` reads and writes nothing; it shows the number of wrong codes in 24 hours, whether the
account is locked, how many devices and addresses are known, and the last five sign-ins. `clear-lock`
forgets the wrong codes and voids every code not yet used (a code an attacker already holds dies
with the lock). The reason is 80 characters at most, a reference and never a story or a name:
Google logs a job's arguments. Afterwards, ask for a new code and sign in as usual; the note in the
audit log (`/ops` → Audit, or `status`) says who ran it and why.

## Not covered yet

- A second factor in the app: part two of ALY-125 (D-136). Until it ships, the code in the mailbox
  is the only thing between a stranger and the back office, so the mailbox's own two-step
  verification is part of this protection (`docs/access.md`).
- Putting `/ops` behind Cloudflare Access (ALY-219): the founder's, and the Cloudflare session's.
- Other accounts: owners and agents keep the older limits only. The same cap for them is a
  follow-up (SEC-2).
- A second member of staff: nobody has been added. `/ops` → Staff adds one; they get the same cap
  and the same alerts.
