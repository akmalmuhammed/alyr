# 041 · A payment turns a signed-up business into a working workspace

Linear ALY-213 (part of the client onboarding epic ALY-163; pieces A6 and A7 of the plan of 23 Oct 2026). Decisions D-100 (the activation job) and D-101 (the sign-in link that works once). Builds on D-022 (sign-in is a code by email, never a password), D-053 (nothing is paid first; the plan is paid at go-live), D-029 and D-010 (email through Resend, the job queue), D-049 (the readiness check and who owns each step) and D-082 (the plan's states). The email's Arabic waits for a native reader (ALY-66).

## What it is for

A client pays ALYR (staff record a transfer, Paddle's webhook records a card payment) or staff waive the payment for a pilot. Until now that changed one line on a checklist and nothing else: the owner was not told, the modules of the price they accepted were whatever the business started with, and nothing said who had to do what next. The activation job does what "paid" should mean, once, and shows staff that it did.

## The rules

- **One activation per client.** A second payment, the same payment recorded twice, two payments recorded at the same moment, or staff waiving a payment already made all find the first activation's row (`activations.client_id` is unique) and do nothing.
- **When.** The moment a payment or a waiver is recorded, in the same transaction, if the client's payments now cover what is due (or it is waived) and **none of the client's businesses is live yet**. A client that is live has been through all of this; a later period's payment never activates it again.
- **Every step can run again and leaves the same result.** A retry, a job that stopped halfway and a second job for the same activation never do anything twice.
- **A failure shows and can be run again.** What retrying cannot fix until someone acts (email is not set up, no owner to write to) is recorded at once, with the reason, and shown in `/ops` with a Retry button. A Resend hiccup is retried by the job queue (eight tries, 5 seconds doubling) and then recorded the same way. Nothing is sent twice by a retry: the email step is skipped once `emailed_at` is set, unless staff press "Send the email again".
- **Nothing is ever switched off, and nobody's choice is overruled.** A module that was switched off by hand stays off; a step whose owner someone already chose keeps it.
- **The worker's sweep catches a payment no path reported** (every minute): a client paid up, with no activation, none of its businesses live, and a payment or waiver recorded after the migration. An older payment is never emailed about.

## The five steps

| # | Step | What it does | If it cannot |
|---|---|---|---|
| 1 | **Plan** | Checks the payments cover what is due (or are waived) and works the plan's state out (`subscription.refresh`). It must be `active`. | Fails: "the plan is cancelled, not active" (or past due, or paused) or "the payments do not cover what is due". |
| 2 | **Modules** | For each business the accepted price has lines for, switches on the modules of each product on those lines (`product:chat` is the inbox, orders and payment links; the price list's `applies` rule says which). Lines ALYR wrote by hand, lines for the whole client and included products switch nothing on. | A module row that exists, on or off, is left alone. |
| 3 | **Setup** | For each business of the client: its type's starting services and opening hours if it takes bookings and has none; the Catalog's starting settings and categories (no sample items) if the Catalog is on and the business has neither settings nor items. | Adds only what is missing; counts what it added. |
| 4 | **Steps** | Runs the readiness check, which writes the business's onboarding steps. In the `assisted` way ALYR is made the owner of what it does for the business: what they sell, opening hours, how customers pay and the WhatsApp number (`ALYR_STEPS`, one place to change). Everything else is the client's. | A step someone has already given an owner (an `owner` event exists) is never overruled. |
| 5 | **Email** | Tells the owner (below). | No Resend key: fails with "email is not set up on this server (no Resend key), so nothing was sent; set it and press Retry". An example address (the demo shops): skipped, not a failure. |

The owner who is written to is the one who accepted the price, if they still own the business, else its longest-standing owner. The business whose steps are listed and whose workspace the link opens is the client's oldest. A client with more than one business sees the others through Your account (spec 040).

## The email

**To** the owner, in the language they signed up in (`owner_lang`), through the existing mail path (`core/mail.py`, Resend). **Subject:** "Your ALYR workspace is ready, Hamad" ("مساحة عملك على ALYR جاهزة يا Hamad").

It says, in this order:

1. Your plan for the business is active and your workspace is ready.
2. **What comes next, and who does it:** the first three steps still to do, in the owner's words (the readiness check's own texts, the ones the go-live list shows). A step ALYR does for them reads "…. ALYR does this for you."; a step that waits on ALYR (the owner has done their part) reads the same.
3. The button, **Open your workspace**, a link that signs them in once; that it stops working after 24 hours; not to pass the email on; and that afterwards they sign in at `/login` with a 6-digit code, with no password.
4. **Who to ask:** "Reply to this email and a person at ALYR will read it" (replies go to `email_reply_to`). No time is promised.
5. "If you did not expect this email, you can ignore it."

If nothing is left, it says everything is done. Plain text carries all of it with the link written out. No tracking, no images, no price.

## The link (D-101)

- **A random token** (32 bytes), kept only as a SHA-256 hash in `signin_links` with the person, the business, the activation and the time it runs out. It is in the email and nowhere else: not in the job, not in the activation, not in a log.
- **Works once.** One `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING` spends it, so two people opening the same link at the same moment cannot both get a session (tested with two at once).
- **Expires after 24 hours** (`activation.LINK_HOURS`). After that, or after one use, the page says so and offers the sign-in code. Sending the email again ends the unused link before it.
- **Opening the link signs nobody in.** The address is `/login/link#t=<token>&l=en`. It opens a page with one button; the button posts the token to `POST /api/auth/link`. Mail programs that fetch an address to check it (link scanners, previews) therefore cannot spend it. The token sits in the address fragment, which no server, log or Referer header ever receives; `l` is the email's language, so the page and the workspace open in it.
- **It signs in one person to one business.** The business it opens is remembered as the one used last (as when someone switches business). If the person has left the team since, the link is refused.
- **Guesses are limited** like sign-in code guesses (30 an hour from one address). A token has 256 bits, so this is a second wall, not the first.
- **No new trust.** Whoever can read the owner's inbox can already ask for a sign-in code. What the link adds is a longer window than a code's 10 minutes, which is why it works once, stops after a day, and says not to pass it on. The welcome email of spec 037 is unchanged: it holds no link that signs anyone in.

## What staff see (`/ops`, Activations)

A new item in the console's menu. Each activation: the client and business; what started it (payment recorded, card payment, payment waived, found by the worker) and who recorded it; the five steps each with Done, Failed or Not reached and a note; whether the email went, to whom, and whether the owner has used the link (not yet, used, ran out); the result (Done, Running or trying again, Failed) with the reason and the number of tries. **Retry** on a failed one; **Send the email again** on a finished one (asks first; the old link stops working). Both are on the audit log (`activation.retry`). The list refreshes every 15 seconds. Staff only (`403` for an owner).

## Data

- **Migration 0077:** `activations` (global, back office only, forced row-level security; one row per client with the trigger, status, attempts, each step's result, the error, `emailed_at` and `sent_to`) and `signin_links` (global like `sessions`: a person's, not a shop's). The one-time `activation_since` setting in `platform_settings`.
- **Resend receives** the owner's name and address, the business's name, and the texts of up to three setup steps. No customer data, no price. Listed in `docs/data-residency.md`. Open and click tracking stay off.
- **Hard rules:** 1 (the two new tables are listed in the isolation test's global tables, with why), 2 (as the welcome email), 3 (nothing moves money), 6 (no secret in a job, a log or a row).

## Checked

`tests/test_activation.py` (23), through the real path: a payment turns a business on, with its steps, owners, plan state and a letter that holds the first three steps in order; the Arabic letter; a part payment does nothing; a payment twice, three ways (twice, then a waiver, and two at the same moment) makes one activation and one email; a waiver activates; a client already live does not; an example address is skipped without failing; modules of the price switched on while one switched off by hand stays off; the products on a price say which modules a business needs; the starting setup is added where missing and never twice; assisted steps go to ALYR and an owner chosen earlier is kept; with no email set up the failure shows and a retry finishes it exactly once; a refusal by Resend is tried again and then shown; the link signs in once, is refused the second time and after it expires, refuses wrong tokens without spending the real one, gives one session to two at once, is refused for someone who left the team, is ended by sending the email again, and opens the business it was made for; the sweep finds an unreported payment, never an old one, and queues once; only staff see the screens. Web: `login/link/link.test.mjs` (both languages, the page takes its words from the copy, opening the page spends nothing, the fragment is read safely).

Looked at in the desktop app's browser pane, against a scratch API and database of their own, with two fictional clients taken through sign-up, price and payment over HTTP: the Activations screen with failed rows at 1360, 390 and 320 px (no sideways scroll), light and dark, axe-core clean; the link page in Arabic and English, signing in through the real API into the Arabic workspace, then the refusal when it is used again, axe-core clean in both states and both themes; an owner signed in with the link is refused at `/ops`. `pnpm lint`, `tsc`, `pnpm test` (128) and `pnpm build` pass, and so does the design check.

## Not in this spec

- **The Resend key and domain** (ALY-74): without them the email step fails visibly; everything before it is done.
- **A native read of the Arabic** (the email, the link page; ALY-66).
- **A payment for a second business of an existing client**, or a changed price after go-live: the job does not run for a client that has a live business.
- **WhatsApp to the owner** about this: email only.
- **Telling the client's team members** (invitations are spec 037).
- **A screen for the founder to change who owns the assisted steps:** it is one table in `core/activation.py`.

## Questions for the founder

1. **Who owns the assisted steps?** I gave ALYR what it does in a business set up with it: what they sell, opening hours, how customers pay, the WhatsApp number. The test line, the plan, the terms and the payment stay the client's. Say if that is wrong.
2. **24 hours** for the link, or longer? A longer link is easier to read tomorrow morning and easier to leak.
3. **A waived (pilot) client gets the same email.** It says the plan is active, not that a payment arrived. Say if pilots should not be emailed.
