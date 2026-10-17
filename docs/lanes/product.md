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

- **ALY-102, the Catalog's engine (package 1 of ALY-101, D-039), branch `aly-102-catalog-engine`, in review, not merged.** Spec: `specs/001-catalog-engine/spec.md` (read it before building on this).
  - Built: items with English and Arabic names, price with sale price and history, variants with their own stock and price difference, options (required choices, priced extras), availability rules (always, switch, count, daily limit, a schedule with lead time, cut-off and date-range overrides, the shop's day start), an append-only stock log, stock taken in one statement at checkout, 30-minute holds for pay-link orders that release on expiry (the job queue, a per-order job and a worker sweep), restock on cancel, a copy of the variant and options on each order line, and the REST API under `/api/items`. Migration 0022; the old `products` table is now `items`.
  - Nothing is visible yet: no module registered, no screen, photo slots (`photo_id`) left for ALY-103.
  - Still missing for the other packages: screens (ALY-104), the order page (ALY-112; it must handle `expired` payments and the `unavailable` list), WhatsApp (ALY-106), alerts (ALY-109), and customer price groups, which D-039 puts in release 1 but no package lists.
  - ALY-103's meters and item limit now read the real items (`item_counter` is set, and `POST /api/items` asks the limit first). Joining photos to items is the follow-up both packages name: `media_links` holds `item` and `variant` owners with no foreign key, so the item routes should call `app.state.media.attach` and `detach`; the `photo_id` columns on items and variants are only slots.
- **ALY-103, Catalog package 2: the photo pipeline, Cloudflare R2 storage, caps and meters (D-039), branch `aly-103-photos-r2`, PR #65, merged.** API only; migration 0023.
  - Upload: `POST /api/media/photos` takes the photo as the request body. `core/images.py` decides the type by content (JPEG, PNG, WebP), refuses SVG, markup, hidden code, damaged and animated files and anything over the byte or pixel limit, turns it upright, and draws it again from its pixels so no location, camera or other metadata survives (the output is checked for metadata chunks). Three WebP sizes (long side 320, 800, 1,600, never enlarged), named by the upload's SHA-256, in `shops/<shop id>/`. The same file twice is stored once.
  - Storage: `core/storage.py`, one small interface. `S3Store` is Cloudflare R2 with hand-written SigV4 (region `auto`, path-style); `LocalStore` is disk, for development, every test and when the R2 settings are missing. Settings `ALYR_R2_ACCOUNT_ID`, `ALYR_R2_ACCESS_KEY_ID`, `ALYR_R2_SECRET_ACCESS_KEY`, `ALYR_R2_BUCKET`, `ALYR_MEDIA_BASE_URL`.
  - Writes go through a queue (`media_ops`, job `media.sync`, up to 48 tries about an hour apart), so R2 being down never fails a request: the photo shows as `pending` (a placeholder) and appears when R2 is back.
  - Caps (`ALYR_CATALOG_MAX_PHOTOS` 3,000 and `ALYR_CATALOG_MAX_ITEMS` 1,000) refuse with a bilingual message and delete nothing. Monthly meters per shop (`media_usage`): photos, GB stored with the month's peak, uploads, duplicates, refused, active items. `GET /api/media/usage` for the shop, `GET /api/admin/media/usage` for the back office with the 80% flag against 10 GB.
  - Back office: `POST /api/admin/media/remove` takes a reported photo down (by its web address, with a reason), unlinks it, deletes its files, refuses the same file afterwards, and writes the audit record.
  - For the catalog (ALY-102 follow-up): `app.state.media.attach / detach / photos_for / covers_for / assert_can_add_item`, and set `app.state.media.item_counter` to count live items. Photos are linked by `media_links` (owner kind `item`, owner id), which has no foreign key to items.
  - Still missing: linking photos to real items (routes, the 8-photo rule on the item screen, cover choice, showing photos in the item lists and on the order page), the web page that shrinks photos before upload with progress and retry (ALY-104), the back-office usage screen (ALY-109), automatic clean-up of photos never attached to anything, per-shop cap overrides, a native review of the Arabic messages (ALY-66), and a live run of the R2 smoke test (the reviewer's; `docs/runbooks/photo-storage.md`).
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

0. The Catalog, ALY-101 and its packages ALY-102 to ALY-110, ALY-112 and ALY-113 (D-039; plan in the Eraser file named there). ALY-102 (the engine) is built and in review; ALY-103 (photos) runs beside it; then ALY-104 (workspace screens), ALY-112 (order page), ALY-106 (WhatsApp). Nothing the Catalog adds is visible to an owner or customer until it works.
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
