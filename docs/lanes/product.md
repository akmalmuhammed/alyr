# Product lane

**Mission.** Build and keep working the thing a business uses every day: the API, the modules and the workspace screens.

Linear: label `Product` under "Lane", project `Alyr Launch`. Read `docs/operating-model.md` for the rules every lane follows.

## Files this lane owns

- `apps/api/`
- `apps/web/app/(product)/`
- `specs/`

Anything else belongs to another lane. If a task needs it, keep the change small and say so in the pull request.

## Read before starting

1. `docs/status.md`
2. `CLAUDE.md` (hard rules, database rules, conventions)
3. `docs/master-plan.md`
4. `docs/working-with-claude.md`

## Now (update this section in the same pull request as the work)

Last updated 18 Oct 2026.

- **ALY-130, owner actions over WhatsApp, phases 0 and 1 (D-040), branch `aly-130-owner-actions`, in a pull request, not merged.** Spec: `specs/003-owner-actions/spec.md`.
  - Phase 0: `core/staff_link.py` (a one-time code, eight digits, ten minutes, ten wrong guesses kill the live codes; `LINK <code>` from the phone links it to the signed-in person; the role is read from the membership each time), `core/actions.py` (the one action layer: caller, role, module, registry), migration 0026 (`contacts.user_id` and `verified_at`, `staff_link_codes`, `activity.channel` and subject `team`, `memberships.channel_preference`), `core/team.record` takes a channel.
  - Phase 1: `modules/owner/asks.py` (today, orders, bookings, owed) and `chat.py` (the words, English and Arabic, TODAY / ORDERS / BOOKINGS / OWED / HELP; REPORT is still the report module's), `routes/owner.py` (the same actions for the workspace, link, unlink, channel preference). Customers can only ever send `LINK`; anything else from a staff number goes on to the modules as before.
  - Tests: `tests/test_owner_actions.py`, 29 of them, through the simulator and real PostgreSQL.
  - Still missing: the Team screen for linking (web), a native review of the Arabic (ALY-66), the workspace link in answers until `ALYR_WORKSPACE_URL` is set, and phases 2 to 4. **Phase 2 waits for the gate: a named pilot owner says which five edits they want (ALY-58).**
- **ALY-104, the Catalog's workspace screens (package 3 of ALY-101, D-039), branch `aly-104-catalog-screens`, in a pull request with two commits, not merged.** Spec: `specs/002-catalog-screens/spec.md` (the screens and how they are checked); the API they stand on is in `specs/001-catalog-engine/spec.md`, "Added for the workspace screens".
  - Commit 1, "ALY-103: link photos to items...": photos attach to an item (up to eight, a cover, an order) and to a size or colour (one); every item carries `photos` and a `cover` with a state (`ready`, `pending`, `failed`, `missing`); drafts from uploaded photos (`POST /api/items/drafts`; a draft may lack a name and a price, and the database refuses to sell one that does, `items_price_set`); the list with Arabic-folded search, filters, counts and pages; bulk actions with a preview whose hash the apply must carry, and one undo (`item_bulk_changes`); roles (`agents_edit_items`, off); `low_stock_at`; the shop-wide stock log and an item's activity; the `catalog` module. Migration 0024. 35 new tests.
  - Commit 2, "ALY-104: ...": `apps/web/app/(product)/_workspace/Catalog.tsx` (list, search, filters, selection), `CatalogEdit.tsx`, `CatalogPhotos.tsx`, `usePhotoQueue.ts` (shrink in the browser, send with progress, retry each), `CatalogAdd.tsx` (photo-first adding and the walk through the drafts), `CatalogStock.tsx`, `CatalogBulk.tsx`, `CatalogSettings.tsx`, `CatalogUi.tsx` (sheet, toasts, switch, tile), `catalogApi.ts`, `catalogCopy.ts` (every word, both languages, one file), `catalog.css`. The shell's edit is one import, one icon and one `else if`; two small greys in `shell.css` were darkened for contrast (the phone tab bar labels and the top bar's small label).
  - **Hidden.** `catalog` is in no product and no starting setup: off for every shop until the back office writes a `tenant_modules` row. Nothing on the screens says "coming" or "beta" (a test reads the files). The items API answers where `orders` or `catalog` is on.
  - Checked in a real browser (`scripts/catalog-browser-check.mjs`, headless Edge at 375 px, English with 30 items and Arabic with 6): adding from photos with a throttled and then dropped connection, the walk through drafts, search, switches with undo, editing, counting with a difference and a reason, a bulk price change with preview and undo, an agent's view, the keyboard, a laptop, light and dark; axe-core finds nothing on the Catalog's screens.
  - Still missing: a native review of the Arabic (ALY-66); import and export (ALY-108); the back-office usage screen (ALY-109); category order and Arabic category names; templates by business type and the name "Menu" or "Price list" per type (ALY-107); the order page (ALY-112); WhatsApp (ALY-106); customer price groups; a language switch on a phone outside the search palette, and the grey text in the laptop sidebar and top bar that axe flags (both the shell's, not the Catalog's: ALY-129); a try on a real phone and its real keyboard.
- **ALY-102, the Catalog's engine (package 1 of ALY-101, D-039), PR #67, merged.** Spec: `specs/001-catalog-engine/spec.md` (read it before building on this).
  - Built: items with English and Arabic names, price with sale price and history, variants with their own stock and price difference, options (required choices, priced extras), availability rules (always, switch, count, daily limit, a schedule with lead time, cut-off and date-range overrides, the shop's day start), an append-only stock log, stock taken in one statement at checkout, 30-minute holds for pay-link orders that release on expiry (the job queue, a per-order job and a worker sweep), restock on cancel, a copy of the variant and options on each order line, and the REST API under `/api/items`. Migration 0022; the old `products` table is now `items`.
  - Nothing was visible when it merged. ALY-104 adds the `catalog` module (off) and the screens.
  - Still missing for the other packages: screens (ALY-104), the order page (ALY-112; it must handle `expired` payments and the `unavailable` list), WhatsApp (ALY-106), alerts (ALY-109), and customer price groups, which D-039 puts in release 1 but no package lists.
  - ALY-103's meters and item limit now read the real items (`item_counter` is set, and `POST /api/items` asks the limit first). Photos are joined to items by the item routes (ALY-104, commit 1), through `app.state.media.attach`, `detach` and the new `reorder`; the `photo_id` columns on items and variants stay empty slots.
- **ALY-103, Catalog package 2: the photo pipeline, Cloudflare R2 storage, caps and meters (D-039), branch `aly-103-photos-r2`, PR #65, merged.** API only; migration 0023.
  - Upload: `POST /api/media/photos` takes the photo as the request body. `core/images.py` decides the type by content (JPEG, PNG, WebP), refuses SVG, markup, hidden code, damaged and animated files and anything over the byte or pixel limit, turns it upright, and draws it again from its pixels so no location, camera or other metadata survives (the output is checked for metadata chunks). Three WebP sizes (long side 320, 800, 1,600, never enlarged), named by the upload's SHA-256, in `shops/<shop id>/`. The same file twice is stored once.
  - Storage: `core/storage.py`, one small interface. `S3Store` is Cloudflare R2 with hand-written SigV4 (region `auto`, path-style); `LocalStore` is disk, for development, every test and when the R2 settings are missing. Settings `ALYR_R2_ACCOUNT_ID`, `ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`, `ALYR_R2_BUCKET`, `ALYR_MEDIA_BASE_URL`.
  - Writes go through a queue (`media_ops`, job `media.sync`, up to 48 tries about an hour apart), so R2 being down never fails a request: the photo shows as `pending` (a placeholder) and appears when R2 is back.
  - Caps (`ALYR_CATALOG_MAX_PHOTOS` 3,000 and `ALYR_CATALOG_MAX_ITEMS` 1,000) refuse with a bilingual message and delete nothing. Monthly meters per shop (`media_usage`): photos, GB stored with the month's peak, uploads, duplicates, refused, active items. `GET /api/media/usage` for the shop, `GET /api/admin/media/usage` for the back office with the 80% flag against 10 GB.
  - Back office: `POST /api/admin/media/remove` takes a reported photo down (by its web address, with a reason), unlinks it, deletes its files, refuses the same file afterwards, and writes the audit record.
  - For the catalog (ALY-102 follow-up): `app.state.media.attach / detach / photos_for / covers_for / assert_can_add_item`, and set `app.state.media.item_counter` to count live items. Photos are linked by `media_links` (owner kind `item`, owner id), which has no foreign key to items.
  - Still missing: photos on the order page (ALY-112), the back-office usage screen (ALY-109), automatic clean-up of photos never attached to anything, per-shop cap overrides, a native review of the Arabic messages (ALY-66), and a live run of the R2 smoke test (the reviewer's; `docs/runbooks/photo-storage.md`).
- **ALY-99, the Sunday report as a report card (D-038), branch `aly-99-report-card`, PR #56, not merged.**
  - The card image: `modules/agent/card.py` (SVG rendered with resvg, Arabic in right-to-left embeddings and mirrored, the brand fonts embedded under the OFL), from `modules/agent/week.py`, which reads the closed week with the dashboard's engine.
  - The text under it: a summary by the engine's rules, one line per product with the main product first, what ALYR did, one next step with its rule.
  - Sending: an image inside the window; outside it the text-only `weekly_report` until Meta approves `weekly_report_card` (image header) and `ALYR_REPORT_CARD_TEMPLATE` is on. Images kept in `message_media` (migration 0021) and uploaded through the Media API at send time.
  - Samples for the site: `apps/web/app/_agent/samples/report/` (`python -m alyr.report_samples`).
  - Still missing: submitting the template (the founder, D-038), the card in the owners' email and in a workspace screen, a native review of the Arabic. Log: `docs/agent-dashboard/12-report-card-log.md`.
- **ALY-99, ALYR Agent dashboard and the product suite (D-035), branch `aly-agent-dashboard`.**
  - Phase 1 is done and pushed, with no PR yet:
    - the catalogue line-up: Chat, Bookings, Agent (included), Accounts, Payroll coming; the inbox and payment links are shared;
    - migration 0017 for the price list and setup requests;
    - the Products screen with descriptors and the "Included" state;
    - the data inventory, `docs/agent-dashboard/02-data.md`;
    - the Qirfa Bakery sample seed, `alyr.seed_qirfa`.
  - Combination pricing (the founder, 17 Oct): QAR 449 for the first product, QAR 150 for each added; migration 0018.
  - Phase 2 is done; the PR is open, not merged:
    - the Agent engine `GET /api/agent` (20 rules, roles, "Not now");
    - the `AgentDashboard` component in `apps/web/app/_agent/`, rendered on `/app`;
    - filtered screens (`?show=`);
    - the salon and AC company samples, and the sample screens for the site (`alyr.agent_samples`).
  - The fix pass on the design critique (`docs/agent-dashboard/05-critique.md`) is done and pushed to the same PR:
    - stage 1, the engine: the summary names its measure and agrees with the numbers; the week compares like with like; Arabic agreement and bidi; setup as a Needs row; credible samples (Dafira a women's salon, Zilal Cooling instead of the clinic, D-035);
    - stage 2, the component: the summary as headline, one hero number, Done beside Needs, a type and spacing scale, the charts redrawn, showcase mode (`mode`, `headingLevel`, `link`), `/agent-sample`; the ALYR team box without a reply-time promise or a fake chat.
  - Next for this lane: whatever review asks. The site builder takes the component in showcase mode and the samples for `/`, `/agent`, `/bookings` and `/accounts`. The agent-role API task (money in older routes) is separate.
- Built on the simulator: inbox with takeover, assignment and notes; credit ledger; order link; payments stand-in; bookings API; sign-in and roles; workspace shell; weekly report; self-serve onboarding at `/start` (D-031); per-client pricing and sign-up switches in the back office (D-032); the internal tool's first phase: Today, audit log, staff (D-033). 253 tests.
- Onboarding gives appointment businesses the full flow. Restaurants, shops, wholesale and document offices are created with a setup request for ALYR until their screens exist.
- Bookings have a customer page and a workspace tab, but only one customer at a time per shop. Sign-in codes are not emailed. Product screens still have the first maroon styling (the Site and brand lane restyles them).
- On the founder's laptop the API and tests run through `scripts/api-in-docker.sh`.

## Next, in order

0. The Catalog, ALY-101 and its packages ALY-102 to ALY-110, ALY-112 and ALY-113 (D-039; plan in the Eraser file named there). ALY-102 and ALY-103 are merged; ALY-104 (the workspace screens) is built and in a pull request; then ALY-112 (order page), ALY-106 (WhatsApp). Nothing the Catalog adds is visible to an owner or customer until the go-live sweep (ALY-113) switches the module on.
0. The internal tool, ALY-81 to ALY-96, in order (`docs/internal-tool.md`)
1. ALY-27 bookable staff or resources, then services and hours screens
2. ALY-53 contacts and labels
3. ALY-18 what is left of sign-in

## Never

- Start a new module before the Customers lane names a pilot business that needs it (gate B). The Catalog (ALY-101) is the one exception, by D-039.
- Query tenant data outside `db.tenant()`, or call a channel directly instead of the outbound layer.
- Edit a migration that has been applied; add a new one.

## Done means

Tests pass through the real path (PostgreSQL, simulator, HTTP), the feature was run by hand, and the pull request says what was not checked.
