# ALYR staff sign-in: what protects the back office, and the way back in

The back office (`/ops`) reads every client's data, so the accounts that open it get more than an
ordinary sign-in. Written 31 Oct 2026 (ALY-125). Why each rule is what it is: D-135 (the cap and
the alerts), D-136 (the second factor), and `specs/047-back-office-hardening/spec.md`. The
break-glass commands run on the founder's machine, in Git Bash, signed in with `gcloud auth login`;
`staff-access.sh` prints a plan before it changes anything and never prints a secret.

**State on 31 Oct 2026: built and tested; not on production until the next release.** The only
account on the staff list is the founder's. The second factor is **off** (`ALYR_STAFF_2FA` unset):
it can be set up, and nothing asks for it, until the founder switches it on (below).

## What protects it

| Layer | What it does | Where |
|---|---|---|
| The code | A six-digit code by email, valid once, for ten minutes. Five guesses a code, five codes an hour | `core/auth.py`, `core/ratelimit.py` |
| The daily cap | For a staff account, ten wrong codes in 24 hours lock it: every code is refused, the right one too, with the same words as any wrong code, until the oldest wrong code is a day old | `core/staff_security.py` |
| The note | Every staff sign-in is written to the audit log (`/ops` → Audit log: "Signed in to the back office", with the browser, the system and the address) | `platform_audit`, action `staff.sign_in` |
| The alert | A sign-in from a browser or an address this person has not signed in from before sends them an email (English and Arabic). The first sign-in after this ships is "new" on both counts, so expect one email | `mail.staff_sign_in_message` |
| **The second factor** | An authenticator app on the founder's phone: a six-digit code that works once, plus ten recovery codes. While it is required, every back-office route refuses a sign-in that has not passed it | `core/second_factor.py`, `/ops/security` |
| A short session | A back-office session lasts 12 hours, then the code again (and the second factor again) | `core/backoffice.py` |

When the cap is reached three things happen once: the account owner gets an email, ALYR's alert
channels hear of it (the ntfy topic and the alert email of `infra/gcp/README.md` 8b; the alert has
a count and no address), and `staff.locked` is written to the audit log. The same happens, in the
audit log and the alert channels, when the authenticator pauses after wrong codes.

## The second factor, in plain words

- **Setting it up.** Sign in to `/ops`, open **Security**, press *Set up your authenticator app*, scan
  the square (or type the key) in an authenticator app, type the code it shows, and **save the ten
  recovery codes** in your password manager. They are shown once. Each works once.
- **Using it.** While it is required, signing in to `/ops` ends at a prompt: *Enter your authenticator
  code*. A code works once; if one was just used, wait for the next (30 seconds). A recovery code works
  instead of the app; make new ones after using one. The prompt is in English and Arabic.
- **Changing it.** On **Security**: *Check my app*, *Replace the app*, *Make new recovery codes*,
  *Turn it off*. Every one needs a current code (or a recovery code), even from a session that has
  already passed it. While it is required, *Turn it off* is closed: replace the app instead.
- **Wrong codes.** Five wrong in ten minutes, or twenty in a day, pause the authenticator (every code
  is refused, the right one too) until the oldest wrong one has aged out. You are emailed on every
  setup, replacement, removal, new set of recovery codes and use of a recovery code.
- **The email address stays the first factor.** Whoever reads the mailbox still needs the phone.
  Whoever has the phone still needs the mailbox.
- **What is stored.** The secret, sealed (AES-256-GCM, a key derived from `ALYR_LINK_SECRET`, the email
  bound in); the recovery codes only as keyed hashes. **Rotating `ALYR_LINK_SECRET` makes every sealed
  secret unreadable** (it also ends every customer link: `secret-rotation.md`). After a rotation, each
  member of staff signs in with a recovery code and replaces the app, or the break-glass does it.

## Switching it on (the order matters)

Do this only after the release that carries it is live. Nothing here is done by Claude.

1. **Enrol.** Sign in to `https://app.alyr.qa/ops`, open **Security**, set up the app, save the ten
   recovery codes in your password manager. Expect an email "An authenticator app was set up on your
   ALYR account".
2. **Test it without risk.** On **Security**, type a fresh code and press *Check my app* (the console
   does not ask for it yet, so nothing can lock you out). Sign out and in again to see that the code
   from the mailbox still works as before.
3. **Check nobody would be locked out.** `infra/gcp/staff-access.sh ready` (the job first: `plan v0.x.y`,
   then `deploy v0.x.y`, once). It prints each member of staff with *enrolled* and the recovery codes
   left, and fails if any has no authenticator or no recovery code.
4. **Require it.** `infra/gcp/staff-access.sh require`. It runs `ready` again, asks you to type
   `REQUIRE`, then sets `ALYR_STAFF_2FA=true` on `alyr-api` (a new revision; a minute, no downtime).
   A full deploy from the laptop (`setup.sh apps`) keeps it; the release workflow does not touch it.
5. **Check it.** Keep this window and a signed-in browser open. In a private window sign in to `/ops`
   with the mailbox code: the prompt for the authenticator code must appear. Enter a code: the console
   opens. Then sign out of the old browser.

**To undo it, at any moment:** `infra/gcp/staff-access.sh unrequire` (or `gcloud run services update
alyr-api --region me-central1 --remove-env-vars=ALYR_STAFF_2FA`). Authenticators and recovery codes
stay; nothing asks for them. This needs only your Google Cloud sign-in, not the database and not the
authenticator: it is the ultimate way back in.

## An email says "new sign-in to the back office"

1. **If it was you**, nothing to do. A new phone, a new network, a private window and a cleared
   browser all look new.
2. **If it was not you**, someone read your inbox, because a sign-in code was needed. In this
   order: (a) secure the mailbox: change its password, check its two-step verification and its
   forwarding rules and signed-in devices; (b) end the sessions: `staff-access.sh reset-factor` ends
   every session of the account (below) and `status` shows who signed in; if a stranger's sign-in is
   listed, treat it as a breach: `incident-response.md`, sections 6 and 7; (c) look at `/ops` → Audit
   log for what that session changed. While the second factor is required, a stranger with only the
   mailbox is stopped at the prompt: say so in the breach note.

## The account is locked, or the phone is lost

| What happened | Do |
|---|---|
| The right code is refused, "that code is wrong or has expired", and an email said "Sign-in to your ALYR account is paused" | It lifts by itself when the oldest of the ten wrong codes is a day old (the email says when, in Doha time). To go in sooner: `staff-access.sh clear-lock <email> <reason>` |
| The authenticator prompt says "Too many wrong codes" | Wait the minutes it says (at most ten; a day after twenty wrong ones), or `clear-lock` forgets the account's wrong codes, the authenticator's too |
| Lost phone, but you have a recovery code | At the prompt press *Use a recovery code instead*, type it, then on **Security** replace the app and make new codes |
| Lost phone and no recovery code, while it is required | Either `staff-access.sh unrequire` (instant; then sign in with the mailbox code, replace the app on **Security**, run `ready`, `require` again), or `staff-access.sh reset-factor <email> <reason>` then `open-enrolment <email> <reason>` (30 minutes to set up a new app from the door) |
| Lost phone and no recovery code, while it is not required | Sign in with the mailbox code, **Security**: the app cannot be replaced without a code, so `reset-factor`, then set up again |
| Cannot reach Google Cloud either | Out of scope here: Google's own account recovery |

Remember what a lock means: **someone typed ten wrong codes**. Perhaps you did. If you did not,
someone is guessing, and the first thing to check is the mailbox (above).

## Break-glass

A command, not a screen. It runs as the database owner, which nothing a stolen staff sign-in can
reach can become. It writes `staff.breakglass` to the audit log with your reason for every change,
and Google logs who started it. Its commands:

| Command | What it does |
|---|---|
| `status <email>` | Reads and writes nothing: wrong codes in 24 hours, whether locked, known devices and addresses, the authenticator (enrolled, recovery codes left, whether an enrolment window is open) and the last five sign-ins. Never a secret or a code |
| `ready` | Reads only: every member of staff with *enrolled* and the recovery codes left; fails if any is not ready for the second factor to be required |
| `clear-lock <email> <reason>` | Forgets the wrong codes of the last day (sign-in and authenticator) and voids every sign-in code not yet used (a code an attacker already holds dies with the lock) |
| `reset-factor <email> <reason>` | Removes the authenticator and the recovery codes, forgets its wrong codes, and **ends every session of that person** |
| `open-enrolment <email> <reason>` | For 30 minutes, lets the person set up an authenticator from the door while it is required. Refused while they have a working one |

One time, to make the job (it has no schedule and does nothing until started):

```bash
infra/gcp/staff-access.sh plan v0.x.y     # prints what deploy would do; calls nothing
infra/gcp/staff-access.sh deploy v0.x.y   # the release tag the API is running
```

Then, when needed:

```bash
infra/gcp/staff-access.sh status akmal@alyr.qa
infra/gcp/staff-access.sh clear-lock akmal@alyr.qa "locked out by wrong codes"
infra/gcp/staff-access.sh reset-factor akmal@alyr.qa "lost phone, no recovery codes"
infra/gcp/staff-access.sh open-enrolment akmal@alyr.qa "new phone"
```

The reason is 80 characters at most, a reference and never a story or a name: Google logs a job's
arguments. Afterwards the audit log (`/ops` → Audit log, or `status`) says who ran it and why.

## Not covered yet

- Putting `/ops` behind Cloudflare Access (ALY-219): the founder's, and the Cloudflare session's.
  The second factor here is the in-app alternative; both can stand together.
- Other accounts: owners and agents keep the older limits only, and have no second factor. The
  same cap for them is a follow-up (SEC-2).
- A second member of staff: nobody has been added. `/ops` → Staff adds one; they get the same cap
  and the same alerts. While the second factor is required they cannot enrol by themselves: run
  `open-enrolment` for them after adding them.
- The database roles that keep the application from giving itself back-office rights (part 3 of
  ALY-125, SEC-5): until they are applied, the second factor is a rule the application keeps.
- Passkeys, and a second factor for owners.
