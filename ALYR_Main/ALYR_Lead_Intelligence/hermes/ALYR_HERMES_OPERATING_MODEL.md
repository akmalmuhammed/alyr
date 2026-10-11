# ALYR Hermes operating model

This is the founder-facing guide for teaching and operating Hermes with ALYR Growth OS.

## The five-layer teaching model

| Layer | What it teaches | Where it lives | Update frequency |
|---|---|---|---|
| Project context | ALYR identity, system boundaries, authority, and plan | `.hermes.md` | When strategy or architecture changes |
| Persistent memory | A few stable facts about ALYR and the founder | Hermes `MEMORY.md` / `USER.md` | Rarely, with founder review |
| Procedural skill | How to research, draft, execute, record, and report | `hermes/skills/alyr-prospecting/` | When the workflow improves |
| Live tools and data | Current prospects, approvals, events, accounts, and projects | `alyr_market` MCP + SQLite | Continuously |
| Operating prompts | What Hermes should do in this specific run | `hermes/prompts/` and optional cron | Daily/weekly/by workflow |

Do not put changing dashboard metrics in memory or in the system prompt. Hermes must retrieve them from MCP at the start of every run.

## What Hermes is responsible for

### Revenue intelligence

- Read the owner command picture and identify decision pressure.
- Compare category potential with actual traction.
- Research narrow ICP slices and fully inspect selected accounts.
- Verify public evidence and public business contacts with provenance.
- Build account briefs, focused ALYR offers, and internal qualification tasks.
- Prepare tailored drafts only when the recorded permission state allows it.
- Execute only exact, separately approved action IDs.
- Record confirmed sends, replies, meetings, proposals, wins, losses, and suppressions.

### Client and delivery intelligence

- Create/update accounts and projects after a confirmed state change.
- Track outcomes, workstreams, milestones, blockers, health, ownership, and due points.
- Generate daily exceptions and weekly founder reviews.
- Surface stalled decisions, value at risk, and missing baselines.

### Knowledge improvement

- Propose compact memory changes when stable facts change.
- Propose skill changes when a workflow repeatedly improves or fails.
- Keep both behind Hermes memory/skill write approval so the founder can inspect the diff.

## What remains human-owned

- ICP and category strategy approval
- Legal basis and permission evidence
- Final message approval, sender identity, and provider enablement
- Pricing, scope, proposals, contractual commitments, and promises
- Sensitive or regulated client decisions
- Account win/loss confirmation and project-completion acceptance
- Changes to agent authority, skills, memory, or production access

## First setup and teaching session

1. Build the application with `npm run build`.
2. Merge `hermes/config.windows.example.yaml` into the active Hermes profile.
3. Run `hermes mcp test alyr_market` and confirm 13 tools.
4. Start Hermes from the project directory so `.hermes.md` loads.
5. Run the contents of `hermes/prompts/ALYR_HERMES_BOOTSTRAP.md`.
6. Review the readiness report.
7. Review `hermes/memory/ALYR_MEMORY_SEED.md`; approve only stable facts worth retaining.
8. Keep `OUTREACH_MODE: disabled` until the legal, permission, sender, template, suppression, and provider checklist is complete.

Useful invocation:

```text
/alyr-prospecting Run the ALYR bootstrap readiness audit from hermes/prompts/ALYR_HERMES_BOOTSTRAP.md. Read only. Do not create or send anything.
```

## Operating cadence

| Cadence | Mode | Purpose | Prompt |
|---|---|---|---|
| Daily | Read only | Founder exceptions and top three actions | `ALYR_HERMES_DAILY_COMMAND.md` |
| 2-3 research blocks/week | Internal writes | Narrow ICP/account research and tasks | `ALYR_HERMES_REVENUE_OPERATOR.md` |
| As permission is approved | Draft only | Tailored messages for review | `ALYR_HERMES_PERMISSIONED_OUTREACH.md` Stage A |
| Explicit manual batch | Approved execution | Send exact approved IDs only | `ALYR_HERMES_PERMISSIONED_OUTREACH.md` Stage B |
| Weekly | Read only | Board-style growth and delivery review | `ALYR_HERMES_WEEKLY_REVIEW.md` |
| On confirmed client change | Controlled writes | Maintain account/project truth | `ALYR_HERMES_DELIVERY_OPERATOR.md` |

Do not schedule external outreach execution. Daily and weekly briefs are safe candidates for cron after the founder validates several manual runs.

Example scheduled commands, to run only after manual validation:

```powershell
hermes cron create "0 8 * * 0-4" "Read hermes/prompts/ALYR_HERMES_DAILY_COMMAND.md and execute it exactly." --skill alyr-prospecting --workdir "C:/Users/akmal/OneDrive/Documents/alyr/ALYR_Lead_Intelligence" --name "ALYR Daily Command"

hermes cron create "0 16 * * 4" "Read hermes/prompts/ALYR_HERMES_WEEKLY_REVIEW.md and execute it exactly." --skill alyr-prospecting --workdir "C:/Users/akmal/OneDrive/Documents/alyr/ALYR_Lead_Intelligence" --name "ALYR Weekly Review"
```

Confirm the installed Hermes version's cron syntax before creating jobs. Cron sessions are fresh, so the skill and absolute workdir are essential.

## Learning loop

After each meaningful cycle:

1. Compare recommendation with founder decision and real outcome.
2. Record the real event, not a narrative of hoped-for progress.
3. Identify whether the lesson is a stable fact, repeatable procedure, or temporary observation.
4. Put stable facts in memory, repeatable procedures in the skill, and temporary observations in Growth OS events.
5. Review proposed memory and skill changes before approval.
6. Measure whether the change improves evidence quality, response, conversion, delivery, or decision speed.

## Readiness gates before live outreach

- Qatar legal review and documented channel policy
- Approved ALYR sender identities and reply ownership
- Permission evidence capture and retention policy
- Opt-out and suppression process tested end to end
- Reviewed email copy and approved WhatsApp templates
- SMTP/Meta credentials in secret storage
- Human approval UI and audit trail tested
- Small pilot list with exact account owners
- Provider failure, bounce, complaint, and stop procedures
- Founder explicitly changes `OUTREACH_MODE` to `live`

Success is not message volume. It is a small number of defensible conversations, better decisions, measurable client outcomes, and a system that learns without inventing facts or exceeding authority.

