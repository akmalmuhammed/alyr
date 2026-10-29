# Payment adapters: one door for every payment provider

Status: package 1 built in ALY-17 (the interface, keys kept encrypted, signed webhooks, the simulator gateway). Decisions: D-072 (the three doors), D-044 (the shop is always the merchant of record; ALYR never holds money) and the three-door plan approved by the founder on 28 Oct 2026 ([Qatar payment partners](https://claude.ai/artifact/1aAdUxVz4ru8Z7X6vkHr56), Linear ALY-5). No real provider yet: the first one comes when SADAD or Noqoody issue sandbox keys. Until then, production lists no provider and every shop's payment link behaves exactly as before.

## Why

Every order on ALYR can end in a payment link. Today the link opens a stand-in page that moves no money. Shops will get paid online through one of three doors, and every door ends in an account in the shop's own name:

1. **Connect your own account** (model A, ALY-157): a shop that already has SADAD, Noqoody, Dibsy, SkipCash or Tap pastes its keys.
2. **ALYR-assisted sign-up** (ALY-156): ALYR submits the shop's form to a partner. The result is again the shop's own account, connected the same way as door 1.
3. **Opened by API** (model B): only once a provider proves the shop gets its own merchant account and payouts.

All three arrive at the same place: a **payment account** connected to the shop, used through one **adapter** per provider. The pay page, receipts, the ledger and the reports never know which provider or which door a shop used. A second provider is a new file in `gateways/`, not a change to any module.

## What a provider adapter does

`src/alyr/gateways/base.py` defines it. Every adapter has:

| Part | What |
|---|---|
| `name`, `title` | A key (`sadad`) and the name owners see |
| `fields` | What the owner pastes: each field's key, its label in English and Arabic, and whether it is a secret |
| `live` | Whether it may be offered outside a developer machine. The simulator is never live |
| `check(keys)` | Proves the keys work with one harmless call. Raises `BadKeys` or `Unavailable` |
| `create_checkout(keys, payment)` | Makes the provider's payment page for one payment request. Our payment's ID is the merchant reference, so asking twice gives the same page |
| `read_webhook(keys, headers, body)` | Proves a webhook came from the provider (its signature, with the shop's own keys) and says which payment it is about. Never trusted for the amount or the state |
| `status(keys, ref)` | Asks the provider what happened to a payment: paid, pending or failed, and the amount |
| `refund(keys, ref, amount)` | Gives money back, in full or in part (used by ALY-159) |

Opening an account by API (door 3) is not in the interface yet, on purpose: no Qatar provider has shown it works for a shop's own account. It is added with the first provider that does.

## How a payment goes through

1. A module asks for a payment link (`core/payments.request`). The row in `payment_requests` is written in the module's transaction. A shop with a connected account gets the account's provider on the row, and a job (`payments.checkout`) is queued in the same transaction; a shop without one gets the stand-in, as today.
2. The job asks the provider for its payment page and keeps the provider's reference and page address on the row. Nothing slow happens inside a request.
3. The customer opens the same ALYR link as today (`/pay/<shop>/<payment>`). With a provider page ready, the Pay button goes there; while the job is still running the page says it is getting the payment ready and looks again. The stand-in text ("Test payment page. No money moves.") shows only for the stand-in.
4. The provider calls `POST /api/payments/hooks/<shop>/<account>`. The signature is checked with that account's keys; a webhook that fails is refused with 401 and nothing is written. A good one is recorded once (`payment_events`, unique per account and event) and queues `payments.sync`.
5. The sync job asks the provider for the payment's state. Only then is the payment marked paid, through the same `complete_payment` the stand-in uses: the order is settled, the receipt made, the customer told in WhatsApp. A payment the provider says was for another amount is not marked paid; its row says `amount_mismatch` for the back office (ALY-158). A payment still pending is asked again later (the job retries).

The webhook body is never trusted for the amount or the state: only the provider's own answer to `status` is. That is also what makes a provider whose webhooks are not signed usable later.

## Keys are secrets

- Stored encrypted with AES-256-GCM (`core/payment_keys.py`, the `cryptography` package). The key comes from `ALYR_PAYMENT_KEYS_KEY` (32 random bytes, base64), kept in Secret Manager in production. The account's ID and the shop's ID are bound into each sealed value, so a sealed value copied to another row or another shop does not open.
- A developer machine uses a built-in key. Anywhere else, without the setting, connecting is refused with a clear message and nothing is stored; the API still starts, because payments being off must not stop the rest (fail safe: it closes, it does not open).
- Never sent back: the API answers with the provider, the state, and a hint (the last four characters of the first secret field). Never logged, never in a job's payload (a job carries IDs only).
- If the sealing key changes, the keys no longer open: the account turns to `failed` with the problem `keys_unreadable` the first time a job needs it, and the shop connects again.
- Replacing keys is connecting again: the old account is disconnected in the same transaction and its sealed keys are wiped. Disconnecting wipes them too.

## The workspace API (owners and admins only)

| Call | What |
|---|---|
| `GET /api/payments/providers` | The providers that may be connected here, with the fields to paste. Production lists only live ones (none yet) |
| `GET /api/payments/account` | The shop's account: provider, state (`checking`, `connected`, `failed`), the problem if any (`bad_keys`, `unavailable`, `keys_unreadable`), the key hint, the webhook address to paste into the provider's dashboard, when it was connected. `null` when there is none |
| `POST /api/payments/account` | `{provider, keys}`. Checks every field is there, seals the keys, answers at once with state `checking`, and queues `payments.check_account`, which calls the provider and sets `connected` or `failed` |
| `DELETE /api/payments/account` | Disconnects and wipes the keys. New payment links go back to the stand-in. A link already sent on that account can no longer be confirmed by ALYR, so its page says it no longer works and to ask the shop for a new one; a payment the provider took after that shows only in the provider's own dashboard |

An agent is refused (403); a request without a session is refused (401). The screen for these calls is ALY-157's.

## Tables (migration 0062)

- `payment_accounts`: tenant-owned with Row-Level Security like every other. One account that is `checking` or `connected` per shop at a time (a partial unique index).
- `payment_events`: every webhook accepted, once (unique `account_id, event_id`). Kept as the record of what the provider said.
- `payment_requests` gains `account_id`, `provider_ref`, `checkout_url` and `gateway_status`.

## The simulator gateway

`gateways/simulator.py` stands in for a provider the way the simulator channel stands in for WhatsApp. Its keys look like `sim_...`; anything else is "wrong keys". Its payment page is kept in memory, and `POST /sim/gateway/<ref>/pay` (a developer machine only) marks it paid and sends the signed webhook to the webhook route over HTTP, so the tests run the whole path: keys checked by a job, payment page made by a job, webhook in, status asked, order paid, customer told.

## Not in this package

- A real provider (SADAD or Noqoody first; the applications are drafted in `payments/partner-applications-2026-10-28.md` in the project files).
- The connect screen and its guide per provider, and the QAR 1 test payment (ALY-157).
- Refunds in the workspace and payout records (ALY-159), holds and capture (ALY-160), the back office's exceptions queue (ALY-158).
- A provider row in `docs/data-residency.md`: added with each real provider, before it goes live (hard rule 2).
