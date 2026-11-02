# Demo data in a test business

Fills ONE existing business with ten weeks of a made-up bakery and catering business (Zaman Bakehouse), in English and Arabic, so the founder can show a client a working product: inbox, bookings, orders, catalog, documents and credit accounts. Why it is built this way: D-151 and `specs/064-demo-into-business/spec.md`.

**State on 1 Nov 2026: built and tested on a local database; not applied.** The Cloud Run job does not exist on Google Cloud, and nothing has been loaded into production. This runbook is the steps for the founder or the laptop session after release v0.3.5.

## What a load leaves (about; the dry run prints the exact numbers)

42 items in 6 categories (the business's own leftover items stay, and can be hidden with `--hide-existing-items`); 34 customers, 10 of them business accounts on credit (one over its limit, balances aged up to 90+ days); about 200 orders over 70 days; about 40 bookings (today and tomorrow full; the last day's bookings are left unmarked on purpose, so Came / Didn't come can be shown live); 22 scripted conversations in English and Arabic (four waiting for an answer); about 190 documents with PDFs (receipts, invoices, a quote accepted into an invoice, credit notes, statements, gapless numbers per kind); five team members besides the owner; a coupon, three price groups, three delivery zones. Everything is fictional. The seller on documents is the story's brand, registration `CR 000000`.

It **sends nothing**: customers sit on the business's private simulator line, so even a reply typed in the inbox goes nowhere, and the job holds no WhatsApp, email or payment key.

## Steps (production)

1. **Release.** v0.3.5 per `docs/runbooks/release.md` (the founder approves `production`). Migration 0110 adds `tenants.demo_data_allowed` and `demo_seed_runs`; nothing changes for any business.
2. **Make the job** (founder's machine, `gcloud auth login`): `infra/gcp/demo-data.sh plan v0.3.5`, read it, then `infra/gcp/demo-data.sh deploy v0.3.5`. It makes a job with no schedule that holds only the two database addresses.
3. **Mark the business as a test business.** Back office (`/ops`) → Clients → the business → "Test business: demo data may be loaded". Staff only; audited.
4. **Download all data** in the workspace (Account) if the business has anything you care about. A load into a business with its own customers or orders is refused anyway.
5. **Dry run:** `infra/gcp/demo-data.sh dry-run akmal@alyr.qa`. It rehearses the whole load in a transaction that is rolled back and prints what a real run would leave. Nothing is written except one marker row.
6. **Load:** `infra/gcp/demo-data.sh load akmal@alyr.qa`. Refused unless a dry run for the same seed was made in the last day. Takes about a minute.
7. **Click through** at `app.alyr.qa` as the owner: Inbox, Bookings (today), Orders, Menu, Documents (open an invoice's PDF), Credit accounts (an account over its limit), Team. In Arabic too (the globe button).
8. **Photos** are stored by the worker a minute or two after the load (the job holds no photo-store key). Until then item tiles may be blank.

Refresh the dates later with `replace` (`infra/gcp/demo-data.sh replace <email>`, after a new dry run); take it all out with `remove`. `remove` deletes exactly what the load added, puts back the counters it moved (including document numbering), and leaves the business as it was. The record of the load stays as history, marked `removed`.

## Refusals you may see

| Message | Meaning |
|---|---|
| "has not been marked as a test business" | Step 3. |
| "no dry run was made first" | Step 5; a dry run counts for one day and for one seed. |
| "Already loaded … nothing was done" | A load is in. `replace` or `remove`. |
| "the business already has activity of its own" | It has customers or orders that no load made. Nothing was changed. `--replace` only removes the previous load; it never deletes the business's own rows. |
| "another load or removal is running" | Wait for it. |

## Locally

```
cd apps/api
uv run python -m alyr.seed_into_business --owner-email <email> --yes-this-business-is-a-test --dry-run --photos now
uv run python -m alyr.seed_into_business --owner-email <email> --yes-this-business-is-a-test --photos now
uv run python -m alyr.seed_into_business --owner-email <email> --yes-this-business-is-a-test --remove
```

Mark the business first (a local business has no `/ops` unless you run it; set `tenants.demo_data_allowed` as the database owner on a scratch database). Never against the shared local `alyr` database of another session.

## How it was checked (1 Nov 2026)

- Tests (real PostgreSQL): `test_demo_data_switch.py`, `test_demo_into_business.py` (refusals, lifecycle, data invariants).
- **Mutation checks**, each making one safety rule false and confirming a test fails: the `--yes` flag not required; the test-business mark not checked; the dry run not required; a business's own activity allowed; the queue not cleaned after the load (sending jobs left behind); the changed rows not restored on removal. All six failed a test; the "own activity" check first failed for a wrong reason (a bad row in the test) and was redone.
- **Browser pass** (Chromium, a scratch business loaded locally): every workspace section at 375 and 1440 px, English and Arabic, 48 views: no page error, no server error, no horizontal overflow; screenshots of inbox, bookings, credit and documents looked like a working business.

## Not checked

- Anything on Google Cloud: the job, its image, the photo path with `--photos queue` and the worker, the back office switch on production.
- Arabic wording of the story (customers' messages, item names, document text) has not been read by a native speaker (ALY-66). Names and the brand "Zaman Bakehouse" are not checked against real businesses.
- The back office switch screen was built and type-checked, and its API tested, but was not clicked in a browser.
