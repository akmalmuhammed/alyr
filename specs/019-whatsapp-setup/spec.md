# 019 · How a business gets onto WhatsApp

Linear ALY-217 · Decision D-050 · Builds on spec 018 (the onboarding engine, D-049)

## What it is for

The go-live list's last step is the WhatsApp number. Before this, the owner only chose a way
and the step waited. Now each way says what the owner must have ready, the step waits only
once it is all ready, and it says honestly on whom it waits: Meta or ALYR. ALYR says from the
back office when it is connecting, or why it failed.

## The ways

| Way (key) | Offered to owners | What the owner has ready |
|---|---|---|
| A new number (`new_number`) | yes | the new number (not on WhatsApp yet, can get a text or call); the name customers see; a Meta business portfolio; a card in Meta |
| Move my number, keep my app (`move_number`) | yes | the number used now; WhatsApp Business app 2.24.17 or newer; the phone at hand on the day; accepting what changes in the app; a Meta business portfolio; a card in Meta |
| My own account with another provider (`own_account`) | yes | the number on that account; admin of the portfolio that owns it, to share it with ALYR; access to the current provider; a payment method on the account |
| ALYR's shared number (`alyr_number`) | no, waits on the founder | nothing |

The words, in English and Arabic, are in `apps/api/src/alyr/core/whatsapp_setup.py` so the
owner's screen and the back office show the same sentence.

What moving a number changes, from Meta's page (checked 23 Oct 2026): groups stay in the app
and are not shared; broadcast lists become read-only; disappearing, view once and live
location messages switch off in one-to-one chats; linked computers are signed out; the phone
must open the app at least every 14 days or the link drops; up to six months of one-to-one
chats copy over within 24 hours; 20 messages a second.

## States

`none` (no way chosen) → `preparing` (something not ready) → `waiting_on_meta` (all ready,
ALYR cannot connect this way yet) or `queued` (all ready, ALYR can start) → `connecting`
(ALYR set it) → `connected` (the business has a Meta row in `channel_numbers`). ALYR can set
`failed` with a reason at any point after preparing; the owner reads the reason.

On the go-live list, the WhatsApp check is `waiting` in `waiting_on_meta`, `queued` and
`connecting`, `done` when connected, and `todo` otherwise.

Which ways ALYR can connect is the setting `ALYR_WHATSAPP_WAYS_OPEN` (comma separated). Empty
by default: until Meta approves ALYR as a Tech Provider (ALY-52), every way waits on Meta.

## Data

`whatsapp_setup`, one row per business (RLS forced): the number in international form, the
display name, the ticked keys, ALYR's state and note, who changed it and when. The way itself
stays the `whatsapp` step's choice in `onboarding_steps`. Every change adds a `whatsapp` event
to `onboarding_events` naming what changed, never the number. `admin_onboarding()` returns the
row so the board needs no per-business call.

A Qatari eight-digit number gets +974; `00` becomes `+`. Anything else not in international
form is refused with a message in the owner's language.

## API

- `PATCH /api/onboarding/whatsapp` (owner or admin of the business): `way`, `phone`,
  `display_name`, `ready` (the ticked keys of the chosen way). Answers the go-live list; the
  WhatsApp check carries `setup`.
- `PATCH /api/admin/businesses/{id}/whatsapp` (ALYR staff): the same fields for assisted
  onboarding, plus `state` (`connecting`, `failed`, or empty) and `note` (needed for
  `failed`). Audited as `onboarding.whatsapp`, without the number.
- `GET /api/admin/onboarding` rows carry `whatsapp` with the status, number, name and needs.

## Screens

- `/start`, go live: under the chosen way, its status sentence, the ticks and the number
  (and name) fields with Save. Phone width first; English and Arabic.
- `/ops/onboarding`: a "WhatsApp to connect" tab (queued, connecting, failed); in a business's
  steps, its way, number, name, what is ready, and Start connecting / It failed (with why) /
  Clear.

## Not in this spec

Attaching the number (ALY-166) and Embedded Signup (ALY-39), which write the Meta row; ALYR's
shared number and the routing it needs; telling the owner by email or WhatsApp when the state
changes (a follow-up issue; the sign-up reminder, ALY-171, is the nearest).
