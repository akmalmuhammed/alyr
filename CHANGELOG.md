# Changelog

What changed for customers and for the team, newest first. One line per merged pull request
that changes behaviour; internal-only work can be grouped. Versions follow phases
(`0.<phase>.<n>`), tagged on main when a phase demo works (docs/hygiene.md).

## Unreleased
- Catalog engine, not visible yet (ALY-102, D-039): items with variants, options, availability rules,
  a stock log, holds for unpaid pay-link orders, and a checkout that tells a customer exactly what
  changed. Products became items; existing shops and orders carry over unchanged.
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
