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

Last updated 17 Oct 2026.

- **ALY-99, ALYR Agent dashboard and the product suite (D-035), branch `aly-agent-dashboard`.**
  - Phase 1 is done and pushed, with no PR yet:
    - the catalogue line-up: Chat, Bookings, Agent (included), Accounts, Payroll coming; the inbox and payment links are shared;
    - migration 0017 for the price list and setup requests;
    - the Products screen with descriptors and the "Included" state;
    - the data inventory, `docs/agent-dashboard/02-data.md`;
    - the Qirfa Bakery sample seed, `alyr.seed_qirfa`.
  - Phase 2 is next, from `01-research.md`: the metrics API (role-aware: agents see no shop-wide money) and the dashboard UI at `/app`.
- Built on the simulator: inbox with takeover, assignment and notes; credit ledger; order link; payments stand-in; bookings API; sign-in and roles; workspace shell; weekly report; self-serve onboarding at `/start` (D-031); per-client pricing and sign-up switches in the back office (D-032); the internal tool's first phase: Today, audit log, staff (D-033). 253 tests.
- Onboarding gives appointment businesses the full flow. Restaurants, shops, wholesale and document offices are created with a setup request for ALYR until their screens exist.
- Bookings have a customer page and a workspace tab, but only one customer at a time per shop. Sign-in codes are not emailed. Product screens still have the first maroon styling (the Site and brand lane restyles them).
- On the founder's laptop the API and tests run through `scripts/api-in-docker.sh`.

## Next, in order

0. The internal tool, ALY-81 to ALY-96, in order (`docs/internal-tool.md`)
1. ALY-27 bookable staff or resources, then services and hours screens
2. ALY-53 contacts and labels
3. ALY-18 what is left of sign-in

## Never

- Start a new module before the Customers lane names a pilot business that needs it (gate B).
- Query tenant data outside `db.tenant()`, or call a channel directly instead of the outbound layer.
- Edit a migration that has been applied; add a new one.

## Done means

Tests pass through the real path (PostgreSQL, simulator, HTTP), the feature was run by hand, and the pull request says what was not checked.
