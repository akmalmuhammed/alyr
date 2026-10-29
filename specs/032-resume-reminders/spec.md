# 030 · Resume a half-finished sign-up

Linear ALY-171 (epic ALY-163). Decision D-068. Builds on D-031 (self-serve sign-up), D-049 (the onboarding engine and its funnel, ALY-169) and D-029 (email: Resend, from `send.alyr.qa`).

## What it is for

The step an owner stopped on is already saved on the business, so `/start` reopens exactly there. Nothing brought them back. This is the one email that does: 24 hours after the owner was last in setup, naming the next step with a link to it, and a second after three days. Then no more.

## What the owner gets

- **When.** The first email 24 hours after the owner last moved in setup (a step reached, a detail changed); the second three days after that, and at least a day after the first; none after two, whatever happens. If the owner comes back and moves on, the clock starts again from there, and the second still waits for three quiet days.
- **To whom.** Only a business whose setup is unfinished (not set up, not live), whose owner has not switched the reminders off, and whose owner's address could be a real person's (never an example or test address, as for every email ALYR sends an owner). Only if ALYR's mail is set up.
- **What it says**, in the language the owner reads (English or Arabic, never both): "Your ALYR setup is waiting: next, add your services", a line that they stopped partway at their business, a button "Continue your setup" to `/start` (it reopens at the exact step; the sign-in code is how they get in), "Reply to this email if you want a person to help", and at the foot "Stop these reminder emails". No promise of how fast a person answers. The words for each step, in both languages, are in `core/resume.py`.
- **Switching off.** The link at the foot opens `/start/stop` and switches the reminders off at once, with no sign-in: the link is signed for that business and for that one purpose (a customer's order link, a document link and this one open nothing of each other's), lasts a year, and carries no name or address. The owner can also switch them off from the API (`resume_reminders`). An owner who did so is never written to again.
- **Never after go-live.** A business set up or live is not asked.

## What ALYR sees

The onboarding funnel in `/ops` adds one line: how many reminder emails went, to how many businesses, and how many of those owners came back (opened setup again after one). A reminder carries no address or name in the record.

## How it works

- `tenants.owner_lang`, `resume_reminders`, `onboarding_touched_at` (migration 0060). The language comes from the screen the owner signs up on and follows every switch afterwards (`/start` tells the API when its language differs from the record). `update_own_business` now sets the touched time on every change to the business in setup.
- `onboarding_reminders` (tenant-owned, row-level security): one row per business per number (1 or 2), the step, the language, when it was sent, and when the owner came back. The app may add rows and set `returned_at`, nothing else.
- `resume_candidates(now)` (a database function that reads across every business as the table owner, because the worker has none in scope) says who is due. The worker's hourly loop (`keep_owners_reminded`) calls `resume.send_due`, which records the reminder first and sends after, and never retries: a reminder missed is better than two. A second worker cannot send the same one twice (the row is unique per business and number).
- Opening setup (`GET /api/onboarding/state`) records that the owner came back.
- `POST /api/onboarding/resume/stop {slug, token}` (public, rate-limited by address) reads the signed link and calls `stop_resume_reminders`.

## Not in this spec

- **WhatsApp.** The same reminder on WhatsApp waits for ALYR's own live number (Meta, ALY-6, ALY-52), and needs an approved template.
- **A business that never created its business.** A person who verified their email and stopped before "Create my business" has no business to remind; only a signed-in business with a saved step is written to.
- **A toggle on the screen.** The switch is the link in the email and the API; a setting in the workspace is not added.
- **A sign-in link.** The button opens `/start`, where the owner enters the code ALYR emails them. A one-tap sign-in link is a larger security decision and is left to the founder.

## Checks

`tests/test_resume.py` (12), on the real path (PostgreSQL, the mail provider replaced by a recording transport, the owner's clock moved by SQL): nothing before 24 hours; the first after 24 hours names the step and links to `/start` and the stop page, with no address in either; the step named is the one the owner is on; a second only after three days and never a third; an owner who moves on is not reminded a day later and is recorded as having come back; never once setup is finished or the business is live; never to an example address, and nothing is recorded when mail is not set up; Arabic for an Arabic owner (subject, direction, button); a sign-up in Arabic is remembered and an unknown language is refused; the stop link switches the reminders off and then nothing more is sent; another business's link, a tampered token, an unknown business and a customer's order link do nothing; the funnel counts reminders and returns. `scripts/resume-browser-check.mjs` in a real browser at 375 and 320 px, English and Arabic, light and dark: the page the stop link opens, a tampered link, the language following a switch, and the funnel line; 44 px targets, nothing scrolls sideways, axe clean.
