# Changelog

What changed for customers and for the team, newest first. One line per merged pull request
that changes behaviour; internal-only work can be grouped. Versions follow phases
(`0.<phase>.<n>`), tagged on main when a phase demo works (docs/hygiene.md).

## Unreleased
- Catalog package 4, the customer order page, share links and QR codes, hidden until go-live (ALY-112, D-039, migration 0029): a shop with the Catalog on gets a new order page with photos, English and Arabic descriptions, search that finds Arabic in any common spelling, category chips, sizes and choices with named errors, steppers that honour the smallest order and pack size, "only 3 left" only when true, sold-out items greyed or left out, plain words for hours and cut-offs, a refresh every 20 to 30 seconds, a review that shows a price or stock change before payment, "same as last time" that names what is gone, a compact wholesale table for a price group, and amounts in Arabic as «24 ر.ق». The pay page says when an order was released and offers a way back. A customer's own link now carries a signed token (`ALYR_LINK_SECRET`; the API will not start without it outside a developer machine) and a bare contact ID in a link or a request grants nothing; public links (an item, a category, a table, a QR code) carry no customer and send an ordering customer to the shop's WhatsApp. The workspace Catalog gets Share (copy, WhatsApp, QR codes for the counter and tables, SVG, PNG, print) and three settings; orders show the table. A shop without the Catalog keeps its page. New dependencies: `qrcode-generator` (the QR codes), `jsqr` (a test).
- Catalog 2b, customer price groups (wholesale) and SKU, hidden until go-live (ALY-127, D-039, migration 0026): a shop groups its customers (Retail, Wholesale, Staff...), gives a group its own price for an item or a size (the normal price where it has none, with a history), and the customer's group decides the price on the order page, in the cart check, in the order and on its payment link; the order keeps the group's name and every line's price. Staff set a customer's group from the conversation in the inbox; groups and prices are managed in the Catalog's settings and edit sheet. Items and sizes can have a SKU, unique in the shop, searchable and shown on orders. Row-level security and isolation tests on every new table; the order page's API is documented in `specs/003-price-groups-and-sku/spec.md` for ALY-112.
- Fix: cancelling an order that was put on a customer's credit account now takes its sale off the customer's ledger, once, whoever cancels (the customer, staff or the hold sweep). The ledger keeps both entries, the customer is told their balance changed (plain text inside the 24-hour window, the existing `entry_recorded` template outside it), and the aged-debt buckets, the weekly report and the Agent no longer count the order (ALY-128, migration 0025).
- Catalog package 3, the workspace screens, hidden until go-live (ALY-104, D-039): the owner's items as photos or a list with Arabic-aware search, filters and a switch on every row; an edit sheet with photos, sizes, extras, times and history; adding many items from photos with a draft for each and a walk through them; a Stock tab with counts that show the difference and need a reason; bulk actions with a preview and one undo; roles. English and Arabic, light and dark, phone first. A new `catalog` module, off for every shop. The API gained photos on items, drafts from photos, bulk actions with undo and the agents setting (ALY-103's follow-up, migration 0024).
- Catalog package 1, the engine, not visible yet (ALY-102, D-039): items with variants, options,
  availability rules, a stock log, holds for unpaid pay-link orders, and a checkout that tells a
  customer exactly what changed. Products became items; existing shops and orders carry over.
- Catalog package 2, API only: product photos are checked by content, cleaned of location and
  camera data, saved in three WebP sizes on Cloudflare R2 (local disk when unset), with
  per-shop limits that never delete, monthly usage meters, an 80% free-tier flag, and a
  back-office route to take a reported photo down (ALY-103, D-039). Nothing is visible to
  owners or customers until the catalog screens use it.
- Security: the API now treats any environment that is not explicitly `local` as production;
  stand-in payments, the simulator and the API docs pages only exist on a developer machine (ALY-114).
- Hygiene: PR and issue templates, CODEOWNERS, SECURITY.md, licence notice, Dependabot,
  dependency vulnerability checks in CI, hygiene rules and the 17 Oct audit (ALY-114).

## 0.2.0 · 16-17 Oct 2026
- First live end-to-end rehearsal on a real phone: order, pay, track, team inbox (ALY-73).
- Customer pages (order, booking, payment, tracking) in the ALYR design, light and dark (ALY-73).
- Team accountability: one person responsible for every item, activity record, team report (ALY-72).
- Workspace redesign and back office (ALY-18).
- Sign-in codes by email from no-reply@alyr.qa (ALY-74).

## 0.1.0 · 6-15 Oct 2026
- Multi-tenant core with row-level security, WhatsApp Cloud API, credit ledger, order link,
  bookings, consent and the 24-hour window, job queue, public site at alyr.qa.
