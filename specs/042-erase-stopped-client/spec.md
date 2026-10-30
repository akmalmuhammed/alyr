# 042 · Deleting a stopped client's data 60 days after it stops

Go-live checklist item 39 (the deletion half), SEC-6 and LEG-1 of the 29 Oct go-live audit, found
open by the ALY-34 audit on 30 Oct 2026 (`docs/audit/hardening-2026-10-30.md`, section 3). Related:
ALY-119 (a customer's data, D-075), ALY-51 (the lawyer), ALY-218 (the cancelling that starts the
clock, D-082). Decisions: D-116, D-117, D-118. Linear refused a new issue on 30 Oct ("exceeded the
free issue limit"), so the work is tracked on ALY-119.

**Status: built, not switched on.** The step is in the code and its tests pass. The job and its
schedule are written (`infra/gcp/erase.sh`) and **not applied** to production. The real deletion is
behind a setting that is off, and a dry run is what runs by default. Nothing in this work ran against
production data.

## The promise

`apps/web/app/_site/copyPrivacy.ts`, section `keep` ("How long we keep it"), published at `/privacy`
and `/ar/privacy`:

> For as long as the business uses ALYR. When a business stops, it can ask for a copy of its records
> within 30 days. 60 days after it stops, we delete its data, except what the law requires us to
> keep, such as our invoices to it. Copies in our backups are gone within 35 days after that.

Until this spec nothing deleted anything: migration 0075 says "Nothing is ever deleted" (D-033,
D-053), and spec 038 deferred the job to "go-live item 39". D-116 reconciles them.

## When a business "stops"

The day a **cancellation takes effect**: `clients.cancels_on` (set by `subscription.cancel` with seven
days' notice, D-082; `billing_state = 'cancelled'`). A client is **due** on the day `cancels_on` plus
`erase_after_days` is today or past (Qatar's calendar). `erase_after_days` is 60 and is never read
below **31**, so the 30 days to ask for a copy are always over first.

During those 60 days nothing is deleted and the workspace stays open: the owner can sign in, see
everything and download it (D-081), and ALYR's own sending is paused (D-082). A client is the unit:
all of its businesses are erased together.

Not covered, on purpose: a sign-up that never went live and never cancelled (an abandoned set-up).
It has no clock; see "Open questions".

## What is deleted, and what is kept

`apps/api/src/alyr/core/erase_rules.py` is the keep-list and it is only data: a rule for **every**
table (113 today), with the reason. `tests/test_erase.py` reads the database and fails when a table
has no rule, when a rule names a column that does not exist, or when a kept table points at
something that is deleted. The run itself also **stops, erasing nothing,** when the database and the
rules disagree.

| Rule | Tables | Why |
|---|---|---|
| **Delete** | 88: everything with a `tenant_id` except the terms record, and the business's own row | The business's own data. Its owner could download all of it (a ZIP with every table, every issued PDF and the photos) for 30 days |
| **Delete, deliberately** | Issued documents, their lines and PDFs, and payments recorded by hand | The business's receipts and invoices to *its* customers. The database refuses to delete them; the erasure passes through one door (below). ALYR's reading: the duty to keep them is the business's, and the business had its copy. **Lawyer** |
| **Scrub** | `clients` (the contact person's name, email, phone, ALYR's notes about them and the note of how the client asked to cancel), `card_checkouts` (who started the checkout), `terms_acceptances` (the address and browser) | The row stays as a record of the contract or the payment; the personal details go. **Lawyer** |
| **Keep** | `quotes`, `quote_lines`, `client_payments`, `billing_notices` | "Our invoices to it": ALYR's accounting records. They name the business by its ID only. **Lawyer** (how long) |
| **Keep** | `platform_audit` | The database refuses to change or delete a row. It names the client and business by ID and what staff typed. **Lawyer** |
| **Keep** | `erasure_receipts`, `erasure_files` | The proof: counts only |
| **People** | `users`, `login_codes`, `signup_tokens` | A person who belonged to no other business is deleted, or made anonymous (no email, no name) when a kept record points at them (the quote they accepted, the terms they accepted). Someone who still belongs to another business, and ALYR's own staff, are never touched |
| **Global** | 11 tables | Not about any client: the price list, the staff list, the worker's check-ins, rate counters |

What remains of a person after an erasure: their name as written on the quote they accepted and on
the terms they accepted (`quotes.accepted_by_name`, `terms_acceptances.accepted_by`), and what
ALYR's staff typed in the audit log (how a client asked to cancel, and an owner's email when the business was made: the database refuses to change a row). That is the smallest honest reading of "except what the law
requires"; the lawyer may say it is too much or too little.

## How it runs

- **A daily Cloud Run job** `alyr-erase` (`python -m alyr.erase_job`) started by Cloud Scheduler at
  03:30 Doha time, under the service account `alyr-migrate`. The application's role cannot delete a
  business and, since ALY-268, the API and the worker do not hold the owner's address, so nothing that
  is always on can run it. The job reads `migration-url` and `database-url` and nothing else.
  `infra/gcp/erase.sh` makes it: the job with the switch off, the schedule created **paused**.
- **Dry run by default.** With `ALYR_ERASE_STOPPED_CLIENTS` false (the default) the job lists the
  clients that are due and, per business, how many rows of each table would go and what would be kept,
  inside a read-only transaction. `--dry-run` forces it even when the switch is on. `infra/gcp/erase.sh
  enable` is the one command that turns deletion on, and asks for the word ERASE.
- **One business, one transaction.** Everything goes or nothing does. In it: the client's row is
  locked and **re-checked** (still stopped, not held, 60 days up); the business is named in
  `erasing_businesses`; every table is deleted from in the order the foreign keys need (read from the
  database, children first); the terms record is scrubbed; the business's people are dealt with; the
  business's own row is deleted; the door is shut; the receipt, the photo-store list and an audit
  line are written. A failure at any point rolls all of it back, and the next run tries again.
- **When the last business of a client is gone** a second transaction blanks the client's contact
  details and sets `clients.erased_at`.
- **The door through the guards (migration 0083).** Issued documents, their lines and PDFs, and
  recorded payments refuse deletion for everyone, the table owner included (spec 011). The triggers
  that covered DELETE are split: the original keeps its name and covers the rest, and a new one covers
  DELETE with a `WHEN` condition that skips it only for a business named in `erasing_businesses`. The
  application's role has no privilege on that table (it can neither add a row nor read it), the row is
  added and removed inside the job's own transaction so no other session ever sees it, and only DELETE
  is let through. The guard functions are untouched.
- **ALYR's records name a business by its ID only.** Three foreign keys to `tenants` are dropped
  (`quote_lines.business_id`, `card_checkouts.business_id`, `terms_acceptances.tenant_id`) so the
  business's row can really be deleted: every list and every background loop that reads `tenants`
  then simply no longer sees it, and nothing can write to it again.
- **Photos.** Product photos are in the photo store (R2), under `shops/<business id>/`. The job holds
  no store keys. In the same transaction it leaves one row per business in `erasure_files`; the worker
  (which has the keys) empties the prefix every hour, deleting whatever a listing returns (so strays no
  record points at go too), and finishes the row only when a listing comes back empty. A store that is
  down leaves the row pending; the next pass continues. A listing returns **every** object under the
  prefix, so "empty" means empty: photo-named objects are deleted, anything else is reported on the
  row ("N objects that are not photo files were left") and a person looks. Checked against Cloudflare's S3 API page,
  30 Oct 2026: `ListObjectsV2` and `DeleteObject` are supported.
- **The receipt** (`erasure_receipts`, append-only): which tables, how many rows deleted, kept and
  scrubbed, how many people deleted, made anonymous or left alone, the stop day, the day the business
  went live, its type, and a fingerprint of the rules that ran. **Counts only, never a name, a number,
  an address or a message**; a test searches it for the made-up strings of the test business.
  `python -m alyr.erase_job status` shows the latest receipts, holds and the photo store's progress.

## What stops a run

- **The switch is off** (the default): report only.
- **A hold** (`erase_job hold <client id> <reference>`): a dispute, a request from an authority. The
  client is skipped until `release`. The reason is a short reference (80 characters), not a name or a
  story, because it travels in the job's arguments, which Google logs; it is never printed in a report.
- **A business made after the cancellation was asked for** (an owner who cancelled and signed up again
  under the same client): nothing of that client is erased until a person moves it to a client of its
  own. And a business cannot be moved into a client that has cancelled (`admin_set_business_client`
  refuses; the route answers 404).
- **A card subscription still running** at the payment provider: it would keep charging a client whose
  data is gone. Skipped until it is cancelled (the hourly sweep cancels it on `cancels_on`).
- **ALYR's own business** (slug `alyr`) is never erased, whatever the data says.
- **At most `ALYR_ERASE_MAX_PER_RUN` businesses (3) a night**, so a mistake in the dates cannot empty
  the database; the rest wait for the next run.
- **A table nobody decided about**: nothing is erased and the run reports it and fails.

## Coming back inside the 60 days

`subscription.undo_cancel` empties `cancels_on`, and the client is never due: it keeps **everything**,
as it was. Cancelling again starts a new clock (seven days, then 60). The erasure and the undo cannot
both win: both lock the client's row first, and the erasure re-reads it. An undo that commits first
leaves the business whole. From the moment the **first** business of a client is erased
(`clients.erase_started_at`, set in that business's transaction) the undo is **refused** (HTTP 422,
"the erasure of this client's data has begun"), and so is a new cancellation, even when the cap leaves
other businesses for another night: a client half erased is not one to bring back (a hold is how to
keep the rest). After the erasure there is nothing to bring back; the client signs up again as a new one.

## Backups and a restore

Deleted rows stay in Cloud SQL's 14 nightly backups and 7 days of logs, and in the nightly exports
(deleted at 36 days): all gone within 35 days, as the notice says. On-demand backups never expire and
are flagged by `infra/gcp/audit.sh`. **After a restore from a backup older than an erasure the erased
data is back**, but so are `cancels_on` and the empty `erased_at`: the next run erases it again.
`docs/runbooks/erasing-a-client.md` says to run the job (or wait for it) after any restore.

## What ALYR cannot delete itself

| Where | What it holds | What to do |
|---|---|---|
| Meta / WhatsApp | The business's number registration and templates; message history on the customers' phones | Detach the number from ALYR's WhatsApp Business Account when a client stops (go-live lane). Customers' own copies are theirs |
| Paddle (the merchant of record for the card) | The owner's billing details and the payments, which Paddle keeps for its own legal reasons | ALYR keeps only references. Ask Paddle to delete the customer record when the lawyer says ALYR has no reason to keep it |
| Resend | The emails ALYR sent (sign-in codes, reports) and the documents' PDFs sent by email, for Resend's own retention | Not deleted by ALYR; its retention is Resend's setting (check in the dashboard) |
| PostHog (EU) | Counts by page and, with consent, a user and business ID | Delete the person in PostHog if they ask |
| Logs | Cloud Run logs hold signed links for 30 days (CLD-21) | Age out by themselves |
| The business's own systems | Anything it received by webhook or API | The business's responsibility |

## Tests

`tests/test_erase.py` (40, real PostgreSQL, the local-disk twin of R2) and `tests/erase_support.py`:

- a rule for every table and every rule a table; rules agree with the schema; nothing kept points at
  something deleted; kept records that point at a person are named; delete order is children first
  and the business last; **a table with no rule stops the run** (mutation check);
- nothing at day 59, everything on day 60 (to the day, in Qatar's calendar); the floor of 31 days;
  only due clients are listed;
- a dry run reports and changes nothing, cannot write even by mistake, holds no name; the job's
  default is off, `--dry-run` wins over the switch, the switch turns it on;
- coming back: the undo inside the 60 days keeps everything for a year and a new cancellation starts a
  new clock; **the undo and the erasure racing** (the undo commits while the erasure waits); after the
  erasure the undo and a new cancellation are refused;
- other businesses are never touched (their rows in every table, the demo shop, the global tables);
- kept records survive unchanged; the client and the terms record are scrubbed; the person a kept
  record points at is anonymous, the others are deleted, someone in another business and ALYR's staff
  stay; the receipt is counts only, equals what was there, and cannot be changed or removed;
- **no needle left anywhere:** every text, JSON and array column of every table is searched for the
  made-up names, emails, numbers and messages: nothing, except the owner's name on the two records
  that prove they accepted ALYR's quote and terms;
- issued documents and recorded payments: refused without the door, for the application and the table
  owner; the door open for one business does not open another's, and does not allow an update; the
  application cannot add a row to it or read it; after the erasure everyone else's paper is still
  guarded; the former owner's sessions are dead;
- photos: removed by the worker, strays included, another shop's untouched; a store that is down
  leaves the prefix queued and the next pass finishes it; only a shop's own prefix can be listed;
- a business that fails at the last statement is left whole (no receipt, no list, no half state),
  the other business is erased, the client is not marked done, and the next run finishes; running again
  changes nothing;
- a held client, a card subscription still running, ALYR's own business, the cap per run;
- the job as an owner that row-level security applies to (a probe role that owns what the owner owns
  and cannot bypass), with a person who also works for another client (who stays); `status` shows the
  record without a name, a number or a reason;
- found by an independent review before the first merge: a client half erased cannot be undone; a
  business made after the cancellation is not erased with it and a cancelled client takes no business
  in; the checkout's `created_by` and the cancel note are scrubbed (the "no trace" search now looks
  for them); a non-photo object under a prefix is reported and never mistaken for an empty prefix;
  a hold's reason is a short reference;
- nine **mutation checks** (each safeguard broken on purpose, a test goes red): the client row not
  locked, day 60 as day 61, the erasure having begun not recorded, a person's memberships asked about
  without saying whose, the made-after rule off, the cap ignored, an undo accepted after the erasure
  began, the people who work elsewhere not protected, the client scrub skipped;
- `tests/test_media_storage.py`: the listing is a signed `GET` with the query in the form it is
  signed in, only a shop's prefix, at most 1000 keys, refusals without a secret.
- `tests/test_tenant_isolation.py` and the document immutability tests still pass unchanged.

## Not checked

- Nothing ran against production, Google Cloud, Cloud Scheduler or the real R2: `erase.sh` was only
  syntax-checked and run in `plan` mode (which calls nothing). The R2 listing is tested with a faked
  transport, as the rest of the store is; the opt-in live check (`ALYR_TEST_R2_LIVE`) was not extended.
- The job on Cloud SQL's real owner role (the probe role is the nearest thing).
- A business with a very large number of rows (the deletion is one transaction; the lock wait is capped
  at 15 seconds and a business that cannot finish waits for the next night).
- A late event from the card provider for a checkout of an erased business: its job fails (the business is gone). The subscription is cancelled on the stop day, so none should come.
- The Arabic of anything: this adds no user-facing text. The owner is **not** emailed before the
  erasure (see below).

## Open questions

**For the lawyer (ALY-51)**: (1) How long must ALYR keep its own records of a client (quotes,
payments, card checkouts, the audit log): the period, and from when. (2) Is the name of the person who
accepted the quote and the terms part of those records, or can it be blanked? (3) Does ALYR, as the
business's processor, have any duty to keep the business's issued receipts and invoices once the
business has had its copy, or is that the business's alone (D-042)? (4) Is a set-up that never went
live "a business that stops", and after how long? (5) Whether a backup that still holds the data for up
to 35 days needs more than the notice says.

**For the founder**: (1) Switch the real deletion on, and when (`docs/runbooks/erasing-a-client.md`,
"Before the switch goes on"). (2) Apply `erase.sh deploy` (a job, a paused schedule). (3) Should the
owner be emailed 14 and 3 days before (recommended; it is a follow-up: wording in both languages,
`billing_notices` has the pattern)? (4) Add a failure alert for the job. (5) What to do about
abandoned sign-ups.
