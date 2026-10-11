# Hermes handoff for ALYR

Hermes is connected to ALYR Growth OS through five layers:

1. `.hermes.md` automatically teaches stable ALYR identity, architecture, authority, and roadmap context when Hermes starts in the project.
2. `memory/ALYR_MEMORY_SEED.md` proposes a small set of durable facts for reviewed persistent memory.
3. `skills/alyr-prospecting/` teaches the repeatable operating procedure and loads detailed references only when needed.
4. The `alyr_market` MCP server provides live prospects, pipeline, approvals, events, clients, and projects.
5. `prompts/` defines the mode and objective for bootstrap, daily, weekly, research, delivery, and permissioned-outreach runs.

Changing metrics never belong in memory or prompts. Hermes reads them from Growth OS at the start of every run.

## Connect and validate on Windows

```powershell
cd "C:/Users/akmal/OneDrive/Documents/alyr/ALYR_Lead_Intelligence"
npm run build
hermes config path
hermes mcp test alyr_market
hermes mcp list
npm run smoke:hermes
```

Merge `config.windows.example.yaml` into the active profile printed by `hermes config path`; do not overwrite unrelated provider or platform settings. WSL users should merge `config.wsl.example.yaml` instead. Restart Hermes or run `/reload-mcp` after a config change.

Expected state:

- server `alyr_market` is enabled;
- 13 tools are selected;
- the `alyr-prospecting` skill is enabled;
- memory and skill writes require review;
- `OUTREACH_MODE` remains `disabled`.

## First teaching session

Start Hermes from this project directory and run:

```text
/alyr-prospecting Run the ALYR bootstrap readiness audit in hermes/prompts/ALYR_HERMES_BOOTSTRAP.md. Read only. Do not create or send anything.
```

Review the report and the proposed memory seed. Approve only stable facts worth remembering; never save live counts as memory.

The complete founder operating model, responsibilities, human gates, cadence, learning loop, and readiness checklist is in `ALYR_HERMES_OPERATING_MODEL.md`.

## Normal workflows

| Need | Prompt | Default mode |
|---|---|---|
| Current founder picture | `ALYR_HERMES_DAILY_COMMAND.md` | Read only |
| Prospect/account research | `ALYR_HERMES_REVENUE_OPERATOR.md` | Research and internal tasks |
| Human-permissioned drafting or approved execution | `ALYR_HERMES_PERMISSIONED_OUTREACH.md` | Draft or exact approved IDs |
| Client/project truth | `ALYR_HERMES_DELIVERY_OPERATOR.md` | Controlled confirmed updates |
| Weekly growth and delivery review | `ALYR_HERMES_WEEKLY_REVIEW.md` | Read only |

Useful direct command:

```text
/alyr-prospecting Find five verified Doha hospitality prospects with strong ALYR fit. Prepare account briefs and internal next-step tasks. Do not send anything.
```

The first governed research cycle is documented in `output/ALYR_FIRST_GOVERNED_CYCLE_2026-07-16.md`.

## Authority and outreach

Hermes can research, verify, add source-attributed public contacts, create internal tasks, prepare permitted drafts, record confirmed events, and maintain real account/project state. It cannot grant permission, approve its own communication, invent outcomes, or bypass suppression.

Live email requires reviewed SMTP configuration. Live WhatsApp requires a Meta Cloud API configuration, explicit opt-in, and an approved template. Keep secrets outside Git. Change `OUTREACH_MODE` to `live` only after ALYR completes legal review, sender ownership, permission capture, suppression, template, approval, and pilot testing.

Even in live mode, execution fails unless the action is separately human-approved and the current permission and suppression checks pass.

Official references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files
- https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
- https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/cron

