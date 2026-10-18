# Changelog

What changed for customers and for the team, newest first. One line per merged pull request
that changes behaviour; internal-only work can be grouped. Versions follow phases
(`0.<phase>.<n>`), tagged on main when a phase demo works (docs/hygiene.md).

## Unreleased
- Catalog package 6, business-type templates, hidden until go-live (ALY-107, D-039, migration 0031): each type of business starts with its own catalog, named in English and Arabic (Menu for a restaurant and a bakery, Products for a shop, a grocery, a fashion seller and the appointment businesses, Price list for wholesale), with its own starting rule for new items, low-stock number, sold-out look, WhatsApp alerts, order-page layout hints and categories, and believable sample items that are marked Sample, carry example prices, are never for sale and are removed all at once. Three new types: bakery and home kitchen, grocery and baqala, fashion and gifts. Travel and documents have no catalog. Onboarding's review says what the owner is getting. One setting, `ALYR_CATALOG_FOR_NEW_SHOPS` (default off), decides whether any of it happens; off, onboarding is exactly as before and the new types are not offered. Spec `specs/008-catalog-business-types/spec.md`.
- Catalog package 5, the Catalog on WhatsApp, hidden until go-live (ALY-106, D-039): registered staff numbers change the Catalog by message in English or Arabic (sold out, back, stock, price, undo; a photo with a caption becomes a draft), ALYR says what it understood and offers Undo, asks which item when several fit and never guesses; a customer who types an item's name gets its photo, price and an Order button; "tell me when it is back" asks once and messages once; managers are told of low stock, sold-out items, drafts waiting and refunds due; an item can have its own low-stock number. Six message templates added, not submitted. Staff numbers are registered in the Catalog settings. Migration 0027.
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
