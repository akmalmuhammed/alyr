# 064 · Made-up demo data in an existing test business

Linear ALY-309 · Decision D-151 · Builds on the seven demo shops (`alyr/demo/`, `alyr.seed`), the documents engine (spec 011, D-042), the erasure rules (spec 042) and the back office

## What it is for

The founder shows ALYR to a client on `app.alyr.qa`. A new business is empty: no conversations, no orders, no documents, no credit. The seven demo shops (`python -m alyr.seed`) are rich but live only on a developer's machine, as their own businesses. This puts a believable, fictional business **into one existing test business on production** (the founder's own, `akmal@alyr.qa`), so he can click through inbox, bookings, orders, catalog, documents and credit accounts, in English and Arabic, from his phone, and take it out again.

## The story it tells

Zaman Bakehouse (made up; not checked against real businesses): a bakery and catering business in Doha, ten weeks old on ALYR. 42 items in 6 categories, each with English and Arabic names, prices, variants and stock rules; a team of 5 besides the owner; 24 consumers and 10 business accounts on credit (their limits, habits, a balance brought forward, one over its limit, promises to pay); about 200 orders over 70 days (busier Thursday and Friday, growing, accounts on their own rhythm, delivery with fees, a coupon, three price groups, cash recorded by hand); about 40 bookings over three services and three people or tables (deposits, no-shows, cancellations, today and tomorrow full); 22 scripted conversations in English and Arabic (four waiting for an answer, a complaint, a voice note, a photo, one customer who stopped); receipts, invoices, a quote accepted into an invoice, credit notes and statements, all made by the product's own services with real PDFs and gapless numbers. Names, numbers and addresses are fictional. The seller on documents is the story's brand with registration `CR 000000`.

## What it must never do (each has a test; the mutation checks are in the runbook)

1. **Run only on a business marked as a test business.** `tenants.demo_data_allowed`, false for every business, set only by ALYR staff in the back office (`POST /api/admin/businesses/{id}/demo-data`, audited as `business.demo_data_on` and `_off`). The command refuses any other business, an unknown owner and a missing `--yes-this-business-is-a-test`. `--remove` alone works on an unmarked business, so a business that was unmarked can still be cleaned.
2. **Refuse without a dry run.** A dry run (the whole load, in one transaction that is always rolled back, acting as the application's role) leaves one marker row, `demo_seed_runs.status = 'rehearsed'`. A real load needs one made in the last day, for the same seed, and uses it up.
3. **Send nothing.** Made-up customers sit on the business's private simulator line, so even a reply typed in the inbox goes nowhere. After the load every job it made is deleted except `media.sync` (stores the photos; holds no keys), and every webhook delivery; document deliveries are written as the engine's own "sent" or "failed" rows with no job. The Cloud Run job holds no WhatsApp, email or payment secret.
4. **Never touch another business, or the business's own activity.** Everything is scoped by business. A business with its own customers or orders is refused unless `--replace`, which removes only the previous load. Existing rows are never deleted; only rows of the tables in `manifest.RESTORABLE` may change, and only the changed columns are kept for removal.
5. **Be idempotent and removable.** A second run says "Already loaded" and does nothing. `--replace` writes a copy of everything (the same ZIP as "Download all data"), removes the previous load, loads again. `--remove` deletes exactly what the load added, puts back what it changed (counters, the document numbering series), queues the load's photo files for deletion the way a shop's own deleted photo is (the worker, which holds the photo store's keys, carries it out), and leaves every table of the business as it was; the record of the load stays as history, marked `removed`.
6. **Never run from the cloud session or against the shared local database.** The command runs where the founder starts it: a Cloud Run job (`infra/gcp/demo-data.sh`, not applied) or his machine.

## How the load is measured (the safety core)

The load never names the rows it writes: the product's services insert along the way (variants, activity, document lines, PDFs). `manifest.py` writes down every tenant table's primary keys (and, for the restorable tables, the rows) before and after. New keys are the load's; a changed row is allowed only in `RESTORABLE`; any other change or a vanished row stops the load and takes it out again. `remove` deletes the new keys child-first as the database owner, with the erasure job's own door for issued documents opened for this business and this transaction only (migration 0083), and puts the changed columns back.

## Data

Migration `0110_demo_data.sql`: `tenants.demo_data_allowed`; `admin_set_demo_data_allowed()`; table `demo_seed_runs` (tenant-owned, row-level security, readable by the application's role, written only by the command as the owner; statuses `active`, `removed`, `rehearsed`); `admin_businesses()` returns the flag and whether a load is in. Rules: `erase_rules.py` (deleted with the business), `export.py` (left out of the download, named).

## Tests

`tests/test_demo_data_switch.py` (the back office switch), `tests/test_demo_into_business.py` (the refusals, the lifecycle and the dataset's invariants: stock log equals stock and never negative, order totals equal their lines, document numbers gapless per kind with a PDF each, no overlapping bookings, Arabic on every item, the credit screen's totals equal its customers', nothing queued or sent, other businesses unchanged, replace and remove).

## Not in this spec

Seeding a new business, a schedule, any other business type, real photos (the story's photos are drawn tiles), a public demo.
