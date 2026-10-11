# ALYR Hermes bootstrap and readiness audit

Work from `C:/Users/akmal/OneDrive/Documents/alyr/ALYR_Lead_Intelligence` and load the `alyr-prospecting` skill.

Use `READ_ONLY_BRIEF` mode. Do not create tasks, contacts, drafts, events, accounts, projects, sends, or suppressions.

1. Confirm that the project context identifies ALYR as a Qatar/GCC end-to-end business transformation partner.
2. Read the skill references for company/offer, system/data, governance, and roadmap/cadence.
3. Confirm all 13 `alyr_market` tools are available:
   - command dashboard
   - market summary
   - list prospects
   - get prospect
   - verify website
   - upsert prospect contact
   - create outreach draft
   - list outreach queue
   - execute approved action
   - record operational event
   - upsert client account
   - upsert delivery project
   - suppress prospect
4. Call the command dashboard and market summary.
5. Report the current counts and source health as live observations, not memory.
6. Confirm external outreach mode, provider readiness, recorded permission counts, pending approvals, `internalTasksReleased`, `externalMessagesSent`, and whether any client/project records exist. Do not describe an internal task as an external send.
7. Explain in one paragraph what Hermes may do autonomously, what requires human review, and what it may never do.
8. Compare `hermes/memory/ALYR_MEMORY_SEED.md` with current memory. Propose missing stable facts, but do not save them until the founder approves.

Return a compact readiness report with `READY`, `PARTIALLY READY`, or `BLOCKED`; missing tools/configuration; current operating truth; governance state; and the next three setup actions. Do not send anything externally.
