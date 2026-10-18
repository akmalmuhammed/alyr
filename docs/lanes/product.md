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

- **ALY-108, the Catalog's import and export (package 7 of ALY-101, D-039), branch `aly-108-import-export`, in a pull request, not merged.** Spec: `specs/006-catalog-import-export/spec.md` (read it before building on this). Migration 0028 (`item_imports`; main holds 0025 to 0027). Brought up to date with main on 18 Oct (ALY-106, ALY-127, ALY-128 merged); the spec folder is 006 because 004 and 005 were taken.
  - Files: `modules/items/xlsx.py` (an .xlsx reader and writer with the standard library: bounded, never calculates a formula, refuses .xls, macros, passwords and zip bombs), `sheets.py` (CSV in UTF-8, UTF-16, cp1256, comma, semicolon or tab), `values.py` (a cell to a value: prices, numbers, dates, words, in either language), `columns.py` (the columns, their English and Arabic headers and other spellings, the words, the eight templates), `import_plan.py` (pure: reads the rows, groups them into items, decides create, update, same, skip or error for each and says why; its `hash` is what the owner saw), `imports.py` (the stored upload, preview, apply in one transaction, the undo, the history), `import_photos.py` (the zip and the background job that adds its photos), `import_words.py` (every note about a row, English and Arabic), `exports.py` (the downloads), `routes/items_import.py`. Screens: `_workspace/CatalogImport.tsx`, one entry and one undo button added to `Catalog.tsx`, words in `catalogCopy.ts` (`imp`).
  - Worth knowing before touching it: the export and the template are the import's own format (`Item ID` first, one row for each size or colour); an empty cell keeps what the shop has; a row the preview left out stays out, but the apply itself is one transaction (the issue's "good rows go in, bad rows are listed" and the "all or nothing per file" of the brief are both kept this way); stock numbers never touch `on_hand` directly (an `opening` movement for a new size, `stock.count` for an existing one, both with the reason "Import"); the undo removes what an import added only while nothing has happened to it since, otherwise archives it, and leaves anything edited since; the import is on the activity record under subject `item` with the import's id (the table's check list was not widened, so as not to collide with other migrations).
  - Checked: see the spec; 500 items previewed, imported and undone through a real browser in both languages. Not checked: real Excel or LibreOffice opening our files, a real phone's file picker, the Arabic by a native speaker, a worker running apart from the web server for the photo job.
  - Still missing: customer price groups in the file (group prices, a customer's group; left out on purpose, see the spec); option groups and schedules in the file; category order and Arabic category names. In: SKU (an item's and each size's, clashes per row) and the item's own low-stock number (ALY-106; empty keeps it).
  - An import queues no per-item owner alerts (`alerts=False` on its stock moves and the undo's; other paths unchanged); `import_alert.py` sends the managers one "N items are low or sold out" after an apply that counted stock, by the alerts' rules, plain text inside the 24-hour window only (no new template). The founder asked for this on 18 Oct.
- **ALY-106, the Catalog on WhatsApp (package 5 of ALY-101, D-039), branch `aly-106-whatsapp-commands`, in a pull request, not merged.** Spec: `specs/004-catalog-whatsapp/spec.md`. Migration 0027. 105 new tests in four files (`test_catalog_whatsapp*.py`, `test_catalog_alerts.py`, helpers in `tests/catalog_wa.py`).
  - **Staff commands** from registered staff numbers only, English and Arabic: `sold out shawarma`, `back shawarma`, `stock abaya black M 5` (sets the count), `price shawarma 12`, `undo` (`modules/items/commands.py`, `match.py`, `wa_staff.py`). Spelling-tolerant matching reusing `text.fold`; several matches get a numbered question and nothing changes; ALYR repeats what it understood with an Undo button; the stock log, price history and activity record carry the staff member's name and `via = whatsapp`. Staff numbers are registered by the owner in the Catalog settings (`/api/staff-numbers`, "Staff on WhatsApp"); a manager flag decides who gets alerts and may put a draft on sale. A number that is not registered gets the ordinary customer reply (tested byte for byte, both languages).
  - **Photo to draft** (`wa_photo.py`): an inbound image (`InboundMessage.media_id`; `Channel.download_media`, Meta's two requests, the simulator's own store in tests) is a job that runs the photo pipeline and makes a draft with the name and price from the caption; a manager puts it on sale with a button.
  - **In the customer's chat** (`wa_customer.py`): an item name or "menu" brings the photo (JPEG, as the header of a buttons message) with the price and an Order button; falls back to text without a stored photo. "Tell me when back" asks once (a narrow `back_in_stock` consent, not marketing consent), sends one message when stock returns (text inside the 24-hour window, the `back_in_stock` template outside), then closes. **Meta files such a message as marketing** (finding in the spec and D-039), so it goes only to a customer who gave that narrow consent.
  - **Owner alerts** (`alerts.py`): low stock (the item's own number, else the shop's) and sold out, once a day each per item, not between 22:00 and 07:00 shop time; refund-due messages when staff cancel a paid order and when a real gateway's payment arrives after the link expired. An item has an optional low-stock number of its own (API and edit sheet).
  - **Six templates** in `core/templates.py`, **not submitted**: `stock_low`, `stock_sold_out`, `refund_due`, `refund_due_late`, `draft_added` (utility) and `back_in_stock` (marketing).
  - Checked in a real browser (headless Edge at 375 px, English and Arabic, light and dark): the staff numbers in the settings sheet (add, refuse a bad number, manager switch, remove with a question) and the item's own low-stock field; axe-core finds nothing on them.
  - Hidden as before: the `catalog` module is off for every shop, and every part above runs only where it is on. Nothing says "coming" or "beta".
  - Still missing: a native review of the Arabic (ALY-66; all the words are in `modules/items/wa_text.py` and the six templates); a live run on Meta (the reviewer: submit the six templates, a real staff photo, the buttons message with an image header and the list message on a phone); templates by business type (ALY-107); the weekly report lines and the back-office usage view (ALY-109); the order page (ALY-112) does not yet read an item link.
- **ALY-127, the Catalog's customer price groups (wholesale) and SKU (package 2b of ALY-101, D-039), branch `aly-127-price-groups`, PR #72, merged.** Spec: `specs/003-price-groups-and-sku/spec.md`; **it is the contract the customer order page (ALY-112) builds on** (the fields of the store page, the cart check and the order, all additions to ALY-102's). Migration 0026 (0025 is ALY-128's).
  - Data: `price_groups` (name in both languages, one default per shop that is the normal price, archived not deleted), `item_group_prices` (a group's price for an item or one size) with `item_group_price_history`, `contacts.price_group_id` (null is the default), the order's copy of the group's name (`orders.price_group_*`) and of each line's SKU (`order_items.sku`), and `items.sku` / `item_variants.sku` (unique per shop, ignoring case; across both tables checked by the app under a lock). Every new table has forced row-level security and isolation tests.
  - Rules: a group's price for a size, else its price for the item plus the size's difference, else the normal price; a group price replaces a sale price; the customer's group decides the price in the store page (`?c=`), `cart/check` (`contact_id`), the order, "same as last time" and the payment link; the order keeps the group's name and each line's price.
  - API: `/api/price-groups` (read by the team, written by owners and admins; also `PUT /api/price-groups/customers/{id}`), `sku` and `group_prices` on `/api/items`, `GET/PUT /api/items/{id}/group-prices` and `.../group-price-history`, `price_group` and `sku` on `/api/orders`, `price_group_id` on the inbox conversation. Code: `modules/items/groups.py`, `availability.group_variant_price`, `cart.py`, `orders/service.py`.
  - Screens (inside the Catalog, still hidden): a SKU field on the item and on each size, a "Prices by group" part of the edit sheet, "Customer price groups" in the Catalog settings (`CatalogGroups.tsx`), and a **price group picker in the header of the inbox conversation** (the workspace has no customer-details screen yet; ALY-53) with the group and the SKU on the orders list. English and Arabic, light and dark, checked at 375 px by `scripts/catalog-browser-check.mjs`.
  - Still missing: the order page's own use of it (ALY-112: wholesale layout, sizes, SKU), import and export (ALY-108), a group on a contacts screen (ALY-53), a native review of the Arabic (ALY-66). Barcodes are not in release 1.

- **ALY-128, cancelling an order put on a credit account now takes its sale off the ledger, branch `aly-128-credit-cancel`, PR #70, merged.** One door: `orders.service.cancel_order` (the customer, staff and the hold sweep all come through it). In the same transaction as the cancel it writes a `reversal` entry beside the sale (migration 0025: kind `reversal`, `ledger_entries.order_id`, a unique index so an order is reversed once), then sends the ledger's own notice (`ledger.service.entry_message`: plain inside the 24-hour window, the existing `entry_recorded` template outside; no new template). `ageing.age()` drops a reversed sale from its bucket instead of treating the reversal as a payment; the weekly report and the Agent leave reversed sales out of "credit given" (`ledger.service.STANDING_SALE`). Orders cancelled before the fix keep their sale (not repaired). `seed_qirfa` still writes a sale for its cancelled account orders.

- **ALY-104, the Catalog's workspace screens (package 3 of ALY-101, D-039), branch `aly-104-catalog-screens`, PR #69, merged.** Spec: `specs/002-catalog-screens/spec.md` (the screens and how they are checked); the API they stand on is in `specs/001-catalog-engine/spec.md`, "Added for the workspace screens".
  - Commit 1, "ALY-103: link photos to items...": photos attach to an item (up to eight, a cover, an order) and to a size or colour (one); every item carries `photos` and a `cover` with a state (`ready`, `pending`, `failed`, `missing`); drafts from uploaded photos (`POST /api/items/drafts`; a draft may lack a name and a price, and the database refuses to sell one that does, `items_price_set`); the list with Arabic-folded search, filters, counts and pages; bulk actions with a preview whose hash the apply must carry, and one undo (`item_bulk_changes`); roles (`agents_edit_items`, off); `low_stock_at`; the shop-wide stock log and an item's activity; the `catalog` module. Migration 0024. 35 new tests.
  - Commit 2, "ALY-104: ...": `apps/web/app/(product)/_workspace/Catalog.tsx` (list, search, filters, selection), `CatalogEdit.tsx`, `CatalogPhotos.tsx`, `usePhotoQueue.ts` (shrink in the browser, send with progress, retry each), `CatalogAdd.tsx` (photo-first adding and the walk through the drafts), `CatalogStock.tsx`, `CatalogBulk.tsx`, `CatalogSettings.tsx`, `CatalogUi.tsx` (sheet, toasts, switch, tile), `catalogApi.ts`, `catalogCopy.ts` (every word, both languages, one file), `catalog.css`. The shell's edit is one import, one icon and one `else if`; two small greys in `shell.css` were darkened for contrast (the phone tab bar labels and the top bar's small label).
  - **Hidden.** `catalog` is in no product and no starting setup: off for every shop until the back office writes a `tenant_modules` row. Nothing on the screens says "coming" or "beta" (a test reads the files). The items API answers where `orders` or `catalog` is on.
  - Checked in a real browser (`scripts/catalog-browser-check.mjs`, headless Edge at 375 px, English with 30 items and Arabic with 6): adding from photos with a throttled and then dropped connection, the walk through drafts, search, switches with undo, editing, counting with a difference and a reason, a bulk price change with preview and undo, an agent's view, the keyboard, a laptop, light and dark; axe-core finds nothing on the Catalog's screens.
  - Still missing: a native review of the Arabic (ALY-66); the back-office usage screen (ALY-109); category order and Arabic category names; templates by business type and the name "Menu" or "Price list" per type (ALY-107); the order page (ALY-112); WhatsApp (ALY-106, now in its own pull request); a language switch on a phone outside the search palette, and the grey text in the laptop sidebar and top bar that axe flags (both the shell's, not the Catalog's: ALY-129); a try on a real phone and its real keyboard.
- **ALY-102, the Catalog's engine (package 1 of ALY-101, D-039), PR #67, merged.** Spec: `specs/001-catalog-engine/spec.md` (read it before building on this).
  - Built: items with English and Arabic names, price with sale price and history, variants with their own stock and price difference, options (required choices, priced extras), availability rules (always, switch, count, daily limit, a schedule with lead time, cut-off and date-range overrides, the shop's day start), an append-only stock log, stock taken in one statement at checkout, 30-minute holds for pay-link orders that release on expiry (the job queue, a per-order job and a worker sweep), restock on cancel, a copy of the variant and options on each order line, and the REST API under `/api/items`. Migration 0022; the old `products` table is now `items`.
  - Nothing was visible when it merged. ALY-104 adds the `catalog` module (off) and the screens.
  - Still missing for the other packages: screens (ALY-104), the order page (ALY-112; it must handle `expired` payments and the `unavailable` list), WhatsApp (ALY-106, built), alerts (ALY-106 sends them; ALY-109 adds the report lines and usage view), and customer price groups, which D-039 puts in release 1 but no package lists.
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

0. The Catalog, ALY-101 and its packages ALY-102 to ALY-110, ALY-112 and ALY-113 (D-039; plan in the Eraser file named there). ALY-102, ALY-103 and ALY-104 (the workspace screens) are merged; ALY-106 (WhatsApp) is built and in a pull request; then ALY-112 (order page). Nothing the Catalog adds is visible to an owner or customer until the go-live sweep (ALY-113) switches the module on.
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
