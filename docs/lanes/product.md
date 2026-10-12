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

Last updated 12 Oct 2026.

- Built on the simulator: inbox with takeover, assignment and notes; credit ledger; order link; payments stand-in; bookings API; sign-in and roles. 148 tests.
- Bookings have no screens. Sign-in codes are not emailed. Product screens still have the first maroon styling (the Site and brand lane restyles them).
- On the founder's laptop the API and tests run through `scripts/api-in-docker.sh`.

## Next, in order

1. ALY-27 booking page and workspace bookings tab
2. ALY-53 contacts and labels
3. ALY-18 what is left of sign-in

## Never

- Start a new module before the Customers lane names a pilot business that needs it (gate B).
- Query tenant data outside `db.tenant()`, or call a channel directly instead of the outbound layer.
- Edit a migration that has been applied; add a new one.

## Done means

Tests pass through the real path (PostgreSQL, simulator, HTTP), the feature was run by hand, and the pull request says what was not checked.
