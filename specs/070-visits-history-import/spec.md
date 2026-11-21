# 070 · Visits history import

First client (a Qatar salon that wants only Discovery and Insights), 21 Nov 2026 · Decisions D-197 (where the history lives, and what it may never do) and D-198 (what the Agent says of a shop whose bookings come from a file; how staff run it) · Task I3 of the Insights audit (`D:\alyr-first-client\audit\insights-real.md`, section 5) · Migrations 0150 and 0151 · Builds on spec 016 (the sales import), spec 006 (the Catalog's file reader), the Agent (ALY-99) and the weekly report.

## What it is for

A business that keeps its appointments and takes its payments in another system has nothing for ALYR Insights to read: every Agent rule, the weekly report and the MCP read tools read ALYR's own booking tables. This is the way a person at ALYR puts a file of that business's **past visits** into those tables, so the rules read real numbers. It is **not** a way to take bookings and it **never contacts anyone**.

The first client uses none of ALYR's chat or bookings. Their customers must not get a message, a reminder or a review request because a line in an export exists.

## Where the history lives

In the `bookings` family (the founder's choice on 21 Nov 2026, D-197): `services`, `booking_resources` (the stylists, when the file names them), `contacts` and `bookings`, each row **marked** with `history_import_id` and tied to one row of `history_imports`. Everything that already reads bookings reads it.

| Table | What an import writes | Mark |
|---|---|---|
| `bookings` | One row per visit, `completed`, `no_show` or `cancelled` only. `created_at` is the file's "booked on" or the visit's own time (never "now"), `price` is what the file says (never the service's price today), `note` is empty | `history_import_id`, `history_row_key` |
| `contacts` | One per client the shop does not already have. `created_at` is their first visit that was not cancelled. Name and phone only if staff say so | `history_import_id`, `history_key` |
| `services` | One per service name the shop does not already have, **switched off** (history, not something to book) | `history_import_id` |
| `booking_resources` | One per stylist name the shop does not already have, **switched off** | `history_import_id` |
| `activity` | A "cancelled" entry, by "Import", for a cancellation the file gives a time for, at that time, so "cancelled less than 24 hours before" has something to count | none (the actor says it) |
| `history_imports` | The file's hash, its state, the options, the counts, and three dates (below) | |

### "Data from"

Each import records, for the dashboard to say where its numbers come from: `exported_on` (the day the file was cut: staff say it, else the day it was applied), `first_visit_on` and `last_visit_on` (the first and last visit it holds), and a short `source` label ("the salon's booking system", at most 60 characters). `imports.data_from(conn)` returns them for the newest import and the span across all of them. Showing them on the Agent's screen is task I5.

## What it must never do (each guard has a test)

1. **Queue anything.** No message, reminder, review request, consent record, job or event is written for an imported row or client. `tests/test_history_guards.py` counts every table an outbound path writes to before and after.
2. **Leave a past row `booked`.** The database refuses it (`bookings_history_final`): an imported booking is `completed`, `no_show` or `cancelled`, so it cannot be "not marked yet", reminded, or hold a time. A visit still to come, or marked came while in the future, is a problem in the file, not a row.
3. **Be reachable.** `core/outbound.py` refuses any message to a client an import made who has never written to the shop (`imported_history`), whatever the consent column says, for every kind (typed reply, automatic text, service template, marketing template, document); the delivering job refuses too. `modules/reviews.py` never asks one. Once the person writes to the shop they are an ordinary customer and the usual rules (consent, the 24-hour window) apply. There is no broadcast, win-back or campaign path in the product; the MCP connector only reads.
4. **Need a name or a phone.** A client is told apart by a key, a keyed hash (HMAC-SHA-256, 128 bits) of the shop's own client number, else a phone number, else a name, made with a secret of that business, so the same person is a different key in every business. By default neither name nor phone is stored or shown (the contact is "Client 4F2A91 · عميل 4F2A91"); staff may choose `keep_personal` once the customer agreement allows it. `contacts_reachable` accepts a key alone. **This is pseudonymisation, not anonymisation:** the secret is kept in `history_imports.key_salt` of the same business, so the key keeps names and numbers out of screens, logs, the audit log and other businesses, and does not stop someone who can read that business's rows from testing a guess.
5. **Cross a business.** Every write runs in `db.tenant(business_id)`; every table has its tenant column and forced policy; keys are per business. Tests import into two businesses and prove neither sees the other, by the routes and by the application's own role.
6. **Switch Bookings on by accident.** A business without the Bookings module is refused unless staff say `switch_on_bookings` when they apply; it is switched on only after everything that could refuse the import has been checked, and the switch is on the audit log.

## The file

Read by `modules/items/sheets.py`: CSV (UTF-8, UTF-16, the Arabic Windows code page; comma, semicolon or tab) or Excel (.xlsx). Nothing is calculated. At most 20,000 rows and 5 MB.

**Columns are found by name in English and Arabic** (`plan.COLUMNS`; a unit in brackets such as "Price (QAR)" is ignored) and staff can say which column is which.

| Column | Needed | Notes |
|---|---|---|
| Visit date | yes | ISO, day-first (03/04/2026 is 3 April; month-first is an option), "21 Nov 2026", "21 نوفمبر 2026", Excel dates, Arabic digits; a time in the same cell is used |
| Start time | with the date | 24-hour or 12-hour with AM/PM or ص/م; a date with no time is a problem unless staff accept it (then 12:00) |
| Service | yes | up to 120 characters |
| Status | yes | came / did not come / cancelled in English and Arabic (`plan.STATUS_WORDS`). "booked", "pending", "confirmed" and the like are refused, not guessed. Staff may say every row is one status instead |
| Client number, phone or name | one of them | in that order of preference |
| Price, duration or end time, stylist, appointment number, booked on, cancelled on | no | duration defaults to staff's choice (60); no price means none, never the service's price |

**Every row gets its own answer** with its number as a spreadsheet shows it (the header is row 1): ready, a duplicate of an earlier row, already in ALYR from an earlier import, a problem, or skipped. Problems and notes carry English and Arabic text. By default any problem stops the import; staff may choose to skip the rows with problems.

**The same visit is one visit.** A visit's key is its appointment number when the file has one, else client, minute and service. The same file twice is refused (`already_imported`); a second file that overlaps the first adds only what is new.

**Notes in the file are never read.**

## The steps

1. **Dry run** (`POST .../visits-imports`): the file is read once, off the event loop; what was read (not the file) is kept in `history_imports` while it is a preview. The answer is the preview: column mapping, counts (visits, existing, duplicates, problems, new and known clients, new and matched services and stylists), notes, the first 50 rows, the problems, the hash, and whether Bookings needs switching on. Nothing else is written.
2. **Look**: `GET .../{id}/rows?state=` pages through every row; `PUT .../{id}` changes the mapping or the options (`default_status`, `keep_personal`, `date_order`, `allow_date_only`, `default_minutes`, `skip_problem_rows`, `exported_on`, `source`) and returns the preview again with a new hash.
3. **Apply** (`POST .../{id}/apply` with the hash): everything in one transaction, exactly as previewed; a changed preview, a changed database or a problem refuses it. The sheet is dropped.
4. **Undo** (`POST .../undo` or `.../{id}/undo`): the **newest** applied import, whole: its visits, and the clients, services and stylists it made that nothing else uses. A client who has written to the shop since, or a service or stylist something else points at, stays and is no longer marked. Refused when a receipt, invoice or payment was recorded against one of its visits. Undone files can be imported again.

## Who runs it

Only ALYR staff, through the back office's own door: `/api/admin/businesses/{id}/visits-imports` (`routes/admin_history.py`), signed in within 12 hours and past the second factor, every step on the audit log with counts and the file's hash and never its contents. No screen: `docs/runbooks/visits-import.md` has the commands. The workspace upload screen is task I4.

## What the Agent says of such a shop (D-198)

- **Comparisons from the first day.** A business's start is the earlier of when it began in ALYR and its first imported visit, so a week is compared with the week before as soon as there is one.
- **Nothing is "thin ahead" when nothing is booked ahead in ALYR.** `thin_days` stays silent for a shop with no booking made in ALYR (`Facts.live_bookings`).
- **A customer with no WhatsApp ID is still a customer.** Eight of the Agent's customer filters (the quiet regulars, new customers, customers who wrote, what ALYR did this week) read `wa_user_id not like 'TEST.%'`, which is NULL for any contact with no WhatsApp ID, so phone-only customers (and every imported client) were left out of quiet regulars, new customers and the rest. They now read `coalesce(wa_user_id, '')`.
- **Not done here (task I5):** the "from your export up to <date>" strip, the weekly report's "Booked for next week: 0" and "Reminders ALYR sent: 0" lines and the "Booked, next 7 days" card for a shop with no live bookings, and the line that says nobody receives the report.

## Data

Migration 0150: `history_imports` (RLS, forced, tenant index); `history_import_id` on `services`, `booking_resources`, `contacts`, `bookings`; `contacts.history_key`; `bookings.history_row_key`; two checks on `bookings`; unique indexes on both keys per business; `contacts_reachable` accepts a key. Migration 0151: `forget_contact` also blanks `history_key`. `core/erase_rules.py`: `history_imports` is deleted with the business. `core/forget.py`: a visit an import made is kept without its note, as every booking is; its row key is a keyed hash of the visit. A forgotten client loses their key, so a later import cannot tie new visits to them.

No new processor: the file is read in the API in Doha and dropped (`docs/data-residency.md` needs no row).

## Not in this spec

The workspace upload screen (I4), the "from your export" strip (I5), rules that stay silent for a shop that does not chat in ALYR (I6), the salon cards (I7), the MCP `visits_summary` tool (I11). Whether the client's customer agreement and processor terms exist before a real file is imported is the founder's (D6 of the audit).
