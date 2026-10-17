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

Last updated 17 Oct 2026 (night).

- **ALY-99, the Sunday report as a report card (D-038), branch `aly-99-report-card`, PR open, not merged.**
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
