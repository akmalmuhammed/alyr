# 020 · A client pays before their products open

> **Superseded on 25 Oct 2026 by D-053 and spec 022.** Nothing is paid first any more; the workspace opens at sign-up. This spec stays as the record of what was built and merged.

Linear ALY-212 · Decision D-051 · Builds on spec 018 (the onboarding engine, D-049) and the
pricing and quotes of D-032

## What it is for

The founder decided on 23 Oct 2026 that a client's workspace unlocks after payment: the owner
signs up, reaches the portal, pays, and then gets their products. The account itself is made
before payment.

## The flow

1. The owner signs up at `/start`. Their account and business exist; their client has
   `access_from` empty, so the products are locked.
2. The first step is the price (`plan`). For a self-serve owner it is made from what they
   picked; for an assisted one ALYR prepares it and the page waits. The owner accepts it with
   "Accept and pay".
3. The payment panel shows what is due (the setup fee plus the first period of the accepted
   price), what is paid so far and what is left, how to pay (the bank details setting), the
   reference to write on the transfer, and that it opens the same working day. The page asks
   the API every few seconds, so it moves on by itself once ALYR records the payment.
4. ALYR's staff record the payment in the back office (`/ops`, the client's page, "Payment
   and access"). Once the payments cover what is due, `access_from` is set and every business
   of the client opens. Staff can also open it without a payment, with a reason.
5. The owner continues the setup (services, hours, the test line) and the go-live list. Its
   new check "Your products are paid for" is done once the workspace is open.

## What is locked, and what is not

Locked (`402`): every route that needs a module (`require_module`, `require_any_module` in
`routes/deps.py`). The workspace page shows one locked screen in English and Arabic with what
is due and a link back to `/start`.

Open: sign-in, `/api/workspace` (it says `open: false`), every `/api/onboarding/*` route (the
setup, the price, the readiness list, the payment), and the public pages customers use. The
public pages of a locked business have nothing to show, since nothing is set up.

## Data

- `clients.access_from` (when the products opened; empty means locked) and
  `clients.access_note` (why it opened without a payment). Migration 0048 opens every client
  that existed before it.
- `client_payments`: one row per payment ALYR recorded. Amount in dirhams, how it was paid,
  the reference the statement shows (never a card number), the day received, a note, when and
  by whom it was recorded. The owner reads their own client's rows; only the back office
  writes. Global table (like `clients` and `quotes`), checked in `test_tenant_isolation.py`.

## Rules

- Nothing is due before a price is accepted, and nothing can be recorded then.
- A payment is more than zero, made by one of the four ways, and not received in the future
  (Qatar's date).
- A payment never closes a workspace, and opening happens once. What happens when a client
  stops paying is billing (ALY-85), never a deletion.
- Every recorded payment and every opening without payment is on the audit log, with the
  amount, the way, the day and whether it opened.

## Not in this spec

- Online payment for clients (ALY-5, ALY-188).
- The email that tells the owner their products are open (the activation job, ALY-213).
- Later periods and renewals (ALY-85, ALY-218).
- Invoices or receipts from ALYR to the client.
