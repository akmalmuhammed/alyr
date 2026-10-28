# 018 · The onboarding engine: one readiness check, step owners, stages

Linear ALY-165 (with the event record of ALY-169 and the step owners of ALY-215). Decision D-049. Plan: the client onboarding plan of 23 Oct 2026 (Claude Doc "Client onboarding plan", section "The onboarding setup table", rows B2 and B7).

## Why

Every client, whether they set up alone (door 1), with ALYR beside them (door 2) or from a link the founder sends after a visit (door 2b), goes through the same steps. What differs is who does each step. Before this, `/start`, the workspace and the back office each had their own idea of what was left, nothing said whether a business was actually ready, and nothing recorded which steps a business passed or when.

## What it is

1. **One check, `core/readiness.py`.** Six checks, each worked out from the business's own data, never typed in:

   | Key | Passes when | Applies to |
   |---|---|---|
   | `content` | one live item, or one active service | orders, the Catalog, bookings |
   | `hours` | opening hours exist | bookings |
   | `test` | the owner's test customer has an order or a booking (a cancelled test booking counts) | orders, bookings |
   | `price` | the client accepted a quote | every business |
   | `payments` | the owner chose cash and transfer, or the payment connection is live | every business |
   | `whatsapp` | the business has a Meta channel number | every business |

   Status is `done`, `todo`, or `waiting` (the owner chose online payments or a WhatsApp way, and it waits on a provider, Meta or ALYR).

2. **Who owns a step.** `onboarding_steps.owner` is `client` or `alyr`. The owner hands a step to ALYR from the go-live list ("Ask ALYR to do it") or from the workspace's existing Ask ALYR; staff take it on or hand it back from the board. Staff can write what holds a step up; the owner sees it on their own list.

3. **Choices.** WhatsApp: `alyr_number`, `new_number`, `move_number` (Meta's coexistence: the WhatsApp Business app keeps working), `own_account`. The owner's screen offers the last three; ALYR's shared number waits on the founder's decision (ALY-217). Payments: `cash_transfer`, `online`.

4. **Stages.** `setting_up`, `ready` (everything except WhatsApp is done), `live` (everything is done). The first time a business is ready and the first time it is live are kept on `tenants` (`ready_at`, `live_at`) through `record_own_stage`, which only ever sets them once and only for the business in scope. Live is never taken back: it starts the money-back clock (D-034) and, later, billing (ALY-218).

5. **The record.** `onboarding_events` is append-only (the app role may insert and read, never change or delete): `done`, `undone`, `owner`, `blocked`, `unblocked`, `choice`, `ready`, `live`, who did it and whether it was ALYR. No customer data. The funnel screen that reads it is ALY-169.

6. **The board.** `admin_onboarding()` returns every business with its milestones and the last state the check saw, so `/ops/onboarding` lists everyone without opening each business. "Check now" runs the check for one business as its owner would see it. Today lists every step ALYR owes a client, urgent after two days.

## API

| Route | Who | What |
|---|---|---|
| `GET /api/onboarding/readiness` | anyone in the business | run the check, answer stage, checks, what is left |
| `PATCH /api/onboarding/steps/{key}` | owner or admin | `owner` (client or alyr), `choice` |
| `GET /api/admin/onboarding` | ALYR staff | the board and the count per stage |
| `GET /api/admin/businesses/{id}/readiness` | ALYR staff | check one business now |
| `PATCH /api/admin/businesses/{id}/steps/{key}` | ALYR staff | `owner`, `blocker`, `choice`; audited in the same transaction |

## Not in this spec

Terms acceptance (ALY-167) and the shop's own templates (ALY-172) become checks when they exist. The funnel screen and time to first real order (ALY-169). Assisted mode's consent and time-limited access (ALY-215). The guided split-screen layout for every step (ALY-214). Attaching a number (ALY-166) and Embedded Signup (ALY-39).
