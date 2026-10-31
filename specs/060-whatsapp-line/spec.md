# 060 · A business's WhatsApp line: check, test, trail and one screen for all of them

Linear ALY-166 · Decision D-145 · Builds on spec 023 (attaching a number) and spec 019 (WhatsApp ways, D-050) · Continued by specs 061 (templates), 062 (health) and 063 (Embedded Signup)

## What it is for

Attaching a number (spec 023) proves that Meta knows it. It does not prove that a customer's message
reaches ALYR, that ALYR's reply reaches a phone, or that anyone could tell, in a month, who attached
what and what has happened to the line since. With fifty shops on fifty lines the founder cannot open
fifty chats to find out. This is the part that makes a line something ALYR can look at and trust.

## What exists before this (checked 31 Oct 2026, `main` at 35b02157)

| Need | Where it is | Gap |
|---|---|---|
| Attach a Meta number from `/ops`, after Meta shows it CONNECTED | `core/whatsapp_attach.py`, migration 0053, `POST /api/admin/businesses/{id}/whatsapp/number` | None for attaching itself |
| One Meta row per shop, one shop per number, the app role cannot write `channel_numbers` | migration 0053 (security definer functions) | None |
| An audit entry for attach and detach | `platform_audit` (`whatsapp.attached`, `whatsapp.detached`) | Global log only; nothing per line; nothing for checks |
| Credentials | One token for every number on ALYR's own account: `ALYR_META_ACCESS_TOKEN`, in Secret Manager in production, never in the database | A shop with its own account has no place for its own token: spec 063 |
| Proof the line works | None | A number could be attached, show "done", and never receive or send |
| A view of all lines | None | Only the onboarding board's "Meta number attached" line |
| A person's instructions | `meta-tech-provider.md` covers ALYR's approval, not one shop's number | `docs/runbooks/whatsapp-line.md` |

## How it works

1. **Attach and detach** are as in spec 023, and each is now also a row on the line's trail
   (`whatsapp_line_events`, with who did it). The detach handler passes the staff member's name
   (one argument; the route is otherwise unchanged).
2. **Check** (`POST /api/admin/businesses/{id}/whatsapp/line/check`) asks Meta, with no database
   transaction open: the number (`GET /{number-id}?fields=display_phone_number,verified_name,status,
   quality_rating,name_status,code_verification_status`), the numbers on the account
   (`GET /{waba-id}/phone_numbers`) and the apps subscribed to its webhooks
   (`GET /{waba-id}/subscribed_apps`). It then reads ALYR's own records: has a customer's message
   ever arrived on this number (`contacts.last_inbound_at`) and has one of ours gone out
   (`messages.status` sent, delivered or read). It reads only; it sends nothing to anyone and changes
   nothing at Meta. Each answer is one entry, `ok` true, false, or null for "cannot tell yet".
   A refused token stops the check at the first question, with the reason in words.
3. **Test message** (`POST .../line/test {contact_id}`) sends one ordinary text through the outbound
   layer (hard rule 5) to a **member of the shop's own staff**: a `staff` contact who linked their
   phone (`core/staff_link.py`) and wrote to this number in the last 24 hours. Nobody else can be
   chosen, and a customer is never offered. A shut window is refused before anything is recorded, with
   what to do. The test text is the shop's name and one sentence, in the person's language.
4. **State.** A line is `unchecked`, `problem` (a check failed, or the test did not go), `waiting`
   (every check passes, no customer's message or none of ours yet) or `working`.
5. **One screen**, `/ops/whatsapp` (English and Arabic, RTL), lists every line with its state, last
   check and last customer message, and opens each one for its checks, the test and its trail.
   `GET /api/admin/whatsapp/lines` is the list; `GET .../whatsapp/line` one line with its staff and
   trail.

## Data

Migration 0105. `whatsapp_line_events` (append only for the app role) and `whatsapp_line_state`, both the
business's own, forced row-level security, deleted with it (`core/erase_rules.py`).
`admin_whatsapp_lines()` is the staff-only read across businesses. The trail holds states and counts:
never a customer's name, number or words, and never a token.

## Rules

- Meta is asked only to read. Nothing in this spec writes to Meta.
- The test message goes only to a staff contact of the same shop, on this line, with its window open.
- No secret is stored, logged or returned. The check's `error` text is Meta's message, cut to 200 characters.
- Every action is on the audit log (`whatsapp.checked`, `whatsapp.test_sent`) and the line's trail.

## Checked

`tests/test_whatsapp_line.py`, against `tests/fake_meta.py` (a stateful fake of the Graph API; nothing
reaches the network): a healthy line, a number Meta shows as flagged, a refused token, a number not
on the account and a missing or foreign webhook subscription, a line with no account ID, the local
checks, nothing secret stored, the test through the outbound layer in English and Arabic, who may and
may not be sent a test, a refused send, the trail in order, detach clearing the state, the list and its
counts, one business unable to read another's trail, staff only.
Not checked: a real Meta account. The first real check is the one in the runbook, run by a person.

## Not here

Registering a number through the API (`/register`), subscribing an account to webhooks (spec 063),
templates (061), quality and limits (062), a shop's own token (063).
