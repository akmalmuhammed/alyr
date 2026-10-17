# Changelog

What changed for customers and for the team, newest first. One line per merged pull request
that changes behaviour; internal-only work can be grouped. Versions follow phases
(`0.<phase>.<n>`), tagged on main when a phase demo works (docs/hygiene.md).

## Unreleased
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
