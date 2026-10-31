# Demo data in an existing business: work in progress notes

Written 31 Oct 2026 while the work is unfinished, so another session can pick it up. Delete this
file when `docs/runbooks/demo-data.md` (the real runbook) is written. Branch
`aly-demo-into-business`, draft pull request "WIP: seed demo data into an existing business".
Nothing here has been run against production or the shared local `alyr` database.

## The goal

`python -m alyr.seed_into_business --owner-email akmal@alyr.qa --yes-this-business-is-a-test`
fills ONE existing business (the founder's production test business "ALYR") with ten weeks of a
believable, made-up bakery and catering business (Zaman Bakehouse), in English and Arabic, so he
can walk a client through inbox, bookings, orders, catalog, documents and credit accounts.

## What is done (written, not yet all working)

- `apps/api/migrations/0110_demo_data.sql`: `tenants.demo_data_allowed` (default false, ALYR staff
  only), `admin_set_demo_data_allowed()`, table `demo_seed_runs` (the manifest of a load),
  `admin_businesses()` replaced to return the flag and whether demo data is loaded.
- Back office switch (done by a helper, tested): `POST /api/admin/businesses/{id}/demo-data`
  (`routes/admin.py`), audit entries `business.demo_data_on/off`, screen
  `apps/web/app/(product)/ops/BusinessDemoData.tsx` (+ `.copy.ts`, `ops.css`, `Clients.tsx`,
  `api.ts`), `tests/test_demo_data_switch.py` (8 pass), rules in `core/erase_rules.py` and
  `core/export.py` (LEFT_OUT).
- Package `apps/api/src/alyr/seed_into_business/`:
  - `persona.py` the story: 42 items in 6 categories (bilingual), 5 team members, 24 consumers,
    10 business accounts with credit limits and payment habits.
  - `story.py` ten weeks of orders (Thursday/Friday busy, growing; accounts on their own cadence;
    cash recorded by hand; delivery with fees), built on `demo/history.py`.
  - `bookings.py` 3 services, 3 resources (2 people, 1 table), deposits, today/tomorrow full.
  - `docs.py` receipts, invoices, a quote accepted into an invoice, credit notes, statements,
    all through `modules/documents/service.py` with its clock set to each moment.
  - `credit.py` brought-forward balances (90+ days), an account over its limit, promises, reminders.
  - `chats.py` 22 scripted bilingual conversations (4 waiting, a complaint, voice note, photo,
    a customer who stopped).
  - `world.py` setup (private test line, modules/features, team, groups, delivery, coupon,
    customers, items with tiles); `loader.py` the order of steps and the owner-role touches;
    `manifest.py` snapshot/diff/remove (the safety core); `summary.py`; `cli.py` the command,
    guards, dry run (a full load in a rolled-back transaction that acts as the app role), replace,
    remove.
- `demo/history.py` made parameterised (`days`, `settle()` hook, `Placed.cash/catering`);
  defaults keep the seven demo shops identical.
- Test helpers `tests/demo_into_support.py` and a smoke test `tests/test_demo_into_smoke.py`.

## What is left

1. Finish making the smoke test pass. Last failure: `docs.record_cash` calls
   `payments._issue_receipt(conn, staff, row, False, out)` with `out = None` types wrong: the
   function takes `out` dict and RETURNS it (I pass a dict; the failure was `done["document"]`
   being read from the wrong object / `out["receipt_error"]` on None: check `_issue_receipt`
   return value when `sales.issue` returns a document). Same in `pay_invoice` and
   `catering_quote`. Then keep running the smoke test and fixing what appears (dry run first,
   then real run, then `--remove` must give back exactly the table counts from before).
2. Tests (real Postgres): safety rules (refuses without flag; refuses when not marked; dry run
   writes nothing; no jobs but `media.sync` left; other tenants untouched; `--replace` exports
   first and removes only demo rows; `--remove` restores; second run does not double), dataset
   invariants (stock never negative and `modules/items/stock.py` `mismatches()` empty; ledger
   balances equal entries; document numbers gapless; order total equals lines; bookings do not
   overlap per resource; Arabic on every item), cross-screen consistency (call
   `modules/report.py` and the Agent `facts.gather/view.render` and compare totals). Then mutation
   checks of each safety rule and report what was broken.
3. Browser pass: run the command on a scratch business, start API and web on random ports, sign
   in locally, look at every section at 375 and 1440 px in English and Arabic
   (`scripts/browser-kit.mjs`, `catalog-browser-check.mjs`, `documents-screens-browser-check.mjs`).
   Fix what looks empty or odd; list the fixes.
4. `infra/gcp/demo-data.sh` (plan/deploy/run/logs like `erase.sh`; a Cloud Run job under
   `alyr-migrate` with `migration-url` and `database-url`, args `python -m alyr.seed_into_business`).
   Not applied anywhere.
5. Docs: `docs/runbooks/demo-data.md`, `docs/status.md`, `docs/lanes/product.md` "Now",
   `CHANGELOG.md` "## Unreleased" only, a decision record D-150 in `docs/decisions.md` (D-147 is
   the highest in an open PR; check main again), `specs/063-demo-into-business/spec.md`.
6. `ruff check .` in `apps/api`; web lint/types were run by the helper for the ops screen only.
7. Delete `apps/api/_explore/` (scratch scripts, not for commit) and this file.

## Design decisions taken

- Migration number 0110, spec 063, decision D-150: chosen to stay clear of open PRs (0096-0107,
  D-136-D-147, specs up to 062). Re-check against main before merging.
- The load never names the rows it writes. `manifest.py` snapshots every tenant table's primary
  keys before and after; new keys are the load's; a changed existing row is allowed only in
  `RESTORABLE` tables and only the changed columns are kept for `--remove`. Anything else changed
  makes the load stop and take itself out.
- The product's own role (RLS holds) writes the story; the database owner is used only to move
  the dates of rows the load itself made (`created_at >= run.since`), to remove, and to clean the
  queue. Every owner statement names the business.
- No outbound: made-up customers sit on the business's private simulator line (the one sign-up
  made, else `sim-demo-<id>`), so even a reply typed in the inbox goes nowhere. After the load,
  every job made since it began is deleted except `media.sync` (the worker stores the photos in R2;
  the job holds no R2 keys); `webhook_deliveries` made since are deleted. Document deliveries are
  written as the engine's own "sent"/"failed" rows with no job.
- Photos: `--photos queue` (production: leave `media.sync` for the worker) or `now` (local disk).
- Dry run = the whole load in one transaction, always rolled back, acting as the app role via
  `set role`; so the printed summary is exact.
- `--remove` deletes the manifest's rows as the owner, opening the erasure job's door
  (`erasing_businesses`, migration 0083) for this business inside the transaction, and puts the
  document numbering series back (trigger switched off inside that transaction only).
- Existing rows are never deleted. `--hide-existing-items` hides the founder's leftover test item
  (restored by `--remove`); `--rename-business` is off by default.
- "Real activity" = rows about customers whose WhatsApp id is not `TEST.%`; refuses unless
  `--replace`, which only replaces the previous load (a copy of everything is written first; in a
  Cloud Run job the file is ephemeral, so the founder should press "Download all data" first).
- The seller on documents is the story's brand with the registration `CR 000000` (not a real number).
- Story names are fictional; Zaman Bakehouse is not checked against real businesses (founder's check).

## How to run things (Docker; Windows blocks the database driver natively)

Own scratch Postgres and volumes (never the shared `alyr` database, never other sessions' containers):

```
docker network create demoseed-net
docker run -d --name demoseed-pg --network demoseed-net --network-alias pg -e POSTGRES_USER=alyr -e POSTGRES_PASSWORD=alyr_local -e POSTGRES_DB=alyr_dev_demoseed postgres:16 -c max_connections=200
docker volume create demoseed_uv_cache
docker volume create demoseed_venv
```

Run a command (PowerShell, from the worktree root; `$root` is the worktree path):

```
docker run --rm --network demoseed-net -v "${root}:/src" -v demoseed_uv_cache:/root/.cache/uv -v demoseed_venv:/venv -e UV_PROJECT_ENVIRONMENT=/venv -e UV_LINK_MODE=copy -e ALYR_TEST_DB_HOST=pg:5432 -e ALYR_ENV=local -e ALYR_DATABASE_URL=postgresql://alyr_app:alyr_app_local@pg:5432/alyr_dev_demoseed -e ALYR_MIGRATION_URL=postgresql://alyr:alyr_local@pg:5432/alyr_dev_demoseed -w /src/apps/api ghcr.io/astral-sh/uv:python3.13-bookworm-slim uv run pytest tests/test_demo_into_smoke.py -x -q -s
```

(first `uv sync --frozen` the same way; `uv run ruff check .` likewise). The tests create and drop
their own database `alyr_test` inside `demoseed-pg`; `alyr_dev_demoseed` is for the browser pass.
Remove afterwards: `docker rm -f demoseed-pg`, `docker network rm demoseed-net`,
`docker volume rm demoseed_uv_cache demoseed_venv`.
