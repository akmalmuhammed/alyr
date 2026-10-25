# 022 · Nothing is paid first

Linear ALY-242 · Decision D-053 · Replaces spec 020 (D-051) · Builds on spec 018 (the onboarding engine)

## What it is for

Any owner can start on their own, see ALYR work, and pay only when they go live. The price
follows the products they choose.

## The flow (appointments)

1. Sign up at `/start` with an email code. The workspace is open now.
2. Services, hours, the test chat ("it works"), then the plan, then the go-live list.
3. The plan shows the price of the products chosen and what combining them saves. The owner
   accepts it. Nothing is paid here.
4. On the go-live list the owner sees "pay to go live": what is due (setup fee and first
   period), the bank details and a reference. Staff record the transfer in `/ops`.
5. The WhatsApp number is the last step (D-049, D-050). The business is live when it is connected.

Businesses ALYR sets up (`assisted`): the same steps, with ALYR owning some of them.

## Rules

- `clients.access_from` is set when the client is made; no screen or API checks it. The `402`
  of spec 020 is removed.
- `clients.payment_waived_at` (migration 0049) is set when staff waive a payment, with the
  reason in `access_note`. The check `paid` is done when the payments cover the accepted
  price or the payment is waived. It is part of "ready".
- ALYR Agent is included for every business at QAR 0. The first product keeps its own price; each
  other product is charged the price item `extra_product`, now QAR 50 (migration 0049 changes
  it only if still 150).
- `quote.together` is `None` unless a line is charged below its own list price. Otherwise
  it holds the sum at list prices (`alone`), what is charged (`price`), the saving and its
  percent. The plan screen words it as a saving, never as a made-up "was" price.

## Checked

`tests/test_access.py` (open at sign-up, plan after trying, partial and full payment, waive),
`tests/test_pricing.py` (QAR 449 + 50 each; the saving is real; no saving from an edited quote).

## Not decided / not built

- The setup fee for a self-serve client with no visit (QAR 2,500 in the price list today).
- The day of the first charge. Online payment (ALY-5, ALY-188). The email when payment arrives (ALY-213).
- Sign-in by WhatsApp code, "keep your number" as the main route, Arabic review: see the Figma plan.
