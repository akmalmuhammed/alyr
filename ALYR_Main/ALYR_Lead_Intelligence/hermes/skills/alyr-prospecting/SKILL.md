---
name: alyr-prospecting
description: Operate ALYR Growth OS for Qatar market intelligence, prospect qualification, source-attributed contact research, governed outreach, client onboarding, transformation delivery, and founder reporting. Use for any ALYR request involving prospects, categories, pipeline, outreach, clients, projects, operational events, dashboards, or growth decisions.
---

# Operate ALYR Growth OS

## Load only the context needed

- Read `references/company-and-offer.md` before positioning ALYR, selecting an offer, or writing client-facing language.
- Read `references/system-and-data.md` before querying, writing, integrating, or debugging Growth OS.
- Read `references/governance.md` before contact research, outreach drafting, execution, or sensitive-data handling.
- Read `references/roadmap-and-cadence.md` for founder briefs, scheduled jobs, prioritization, client delivery, or product-roadmap work.

## Select an explicit operating mode

Use one mode per run unless the founder explicitly approves a transition:

1. `READ_ONLY_BRIEF` - inspect state and recommend decisions; make no writes.
2. `RESEARCH_AND_TASKS` - verify evidence, add source-attributed contacts, and create internal tasks only.
3. `DRAFT_FOR_APPROVAL` - create permitted drafts that remain `pending-approval`.
4. `EXECUTE_APPROVED_IDS` - execute only exact IDs supplied by the operator and already marked `approved`.
5. `DELIVERY_UPDATE` - record confirmed account, project, workstream, blocker, milestone, or KPI changes.

Default to `READ_ONLY_BRIEF` when the instruction is unclear.

## Start every run from live state

1. Call `mcp_alyr_market_alyr_command_dashboard`.
2. Call `mcp_alyr_market_alyr_market_summary` when source coverage, freshness, verification, permission, or queue detail matters.
3. State the current mode, current constraints, and whether external providers are disabled.
4. Never use old prompt metrics as current facts.

## Research and qualify

1. Define a narrow ICP using sector, municipality, ALYR service fit, public evidence, and practical ability to benefit. Do not rank on sensitive personal traits.
2. Call `mcp_alyr_market_alyr_list_prospects`; inspect no more than 25 at a time.
3. Consolidate obvious duplicates and deprioritize government entities, weak evidence, irrelevant global enterprises, and unsafe targets unless the founder directs otherwise.
4. Call `mcp_alyr_market_alyr_get_prospect` for every shortlisted account.
5. If relevant evidence is stale or queued, call `mcp_alyr_market_alyr_verify_website`. Respect robots, restrictions, and failures.
6. Separate source-listed facts, independently verified observations, hypotheses, and unknowns.
7. Produce an account brief: evidence, likely transformation problem, focused entry offer, decision-maker role to verify, risk, and next permitted step.

## Add contacts safely

Call `mcp_alyr_market_alyr_upsert_prospect_contact` only when the contact is independently verified through a public business source. Include the source URL, role, confidence, and verification date. Never guess a private destination. Adding a contact does not grant permission.

## Draft and execute outreach

1. Check permission and suppression before drafting.
2. `unknown`: create an internal `task` only.
3. `approved-business-contact`: a tailored email draft may be created for human review; WhatsApp stays blocked.
4. `opted-in`: create a suitable email or approved-template WhatsApp draft for review.
5. `opted-out` or suppressed: do nothing except report the block.
6. Call `mcp_alyr_market_alyr_create_outreach_draft`; leave it `pending-approval`.
7. Do not approve a draft. No approval tool is available.
8. Execute only when the operator names exact action IDs. Re-read the approved queue, then call `mcp_alyr_market_alyr_execute_approved_action` sequentially for those IDs.
9. Process at most five external actions in a normal run and never more than ten. Stop after repeated provider or policy errors.
10. On any stop, unsubscribe, wrong-person, or objection request, immediately call `mcp_alyr_market_alyr_suppress_prospect`.

## Record real outcomes

- Call `mcp_alyr_market_alyr_record_operational_event` only after the underlying event occurs.
- Reuse a source-stable `eventDedupeKey` on retries.
- Record provider confirmation before `outreach.sent`; record an actual reply before `outreach.replied`.
- After a confirmed win or onboarding, call `mcp_alyr_market_alyr_upsert_client_account`.
- After scope is confirmed, call `mcp_alyr_market_alyr_upsert_delivery_project` with outcome, phase, progress, workstreams, blockers, owner, and next milestone.
- Never manufacture progress, health, revenue, or completion.

## Message standard

- Identify ALYR and the commercial purpose plainly.
- Lead with one verified observation and frame the impact as a hypothesis.
- Connect it to one focused ALYR capability.
- Offer a small value-first next step: a one-page transformation snapshot or a 20-minute discovery call.
- Keep first emails between 70 and 130 words.
- Avoid false urgency, exaggerated praise, generic AI language, fabricated familiarity, guaranteed ROI, or claims that ALYR audited private systems.
- Include a clear stop route. Use Arabic or English according to verified context; when uncertain, prepare both for human selection.

## Close every run

Report:

- mode and tools used;
- accounts assessed and evidence quality;
- writes made, with IDs and dedupe keys;
- sent, failed, blocked, and skipped counts;
- what did not change;
- exact next human decision.

Confirm every write appears in a fresh command-dashboard read.

