# 035 · Clients pay ALYR by card, through Paddle

Linear ALY-180. Decision D-074. Builds on D-053 (nothing paid first: the setup fee and the first period are asked at go-live) and D-032 (the price ALYR prepares and the owner accepts). Not a shop's customers paying the shop: that is D-044, D-072 and spec 033.

## What it is for

Today a client pays ALYR only by bank transfer, cash or cheque, and ALYR's staff record it by hand in `/ops`. A client abroad, or one who would rather use a card, has no way to pay at once, and renewals are never charged by themselves. Paddle is the provider the founder chose for card payments (20 Oct, ALY-180; account made 29 Oct). Paddle is the merchant of record for the card payment, so ALYR never holds a card number and Paddle handles the card rules and sales tax.

## What the owner sees

- On the go-live list, under "Pay to go live", a **Pay by card** button above the bank transfer details, with one line: Paddle charges in US dollars, the amount now, then the plan's amount every period, and that renewing can be stopped at any time. Only while nothing has been paid by hand: a client who paid part by transfer pays the rest the same way.
- Pressing it prepares the checkout (a few seconds) and opens `/app/billing?_ptxn=txn_...`, ALYR's billing page, where Paddle's own secure window opens over the page. The billing page only opens the owner's own open checkout, whatever the address says.
- When Paddle says it is done, the page waits for ALYR to record the payment and then says "Paid. You can go live." with a link back to the go-live list, where the `paid` line is now done.
- English and Arabic; Paddle's window is opened in the same language.

## What ALYR's staff see (`/ops`, a client)

- The card payment in the payments table beside the ones recorded by hand: "Card (Paddle)", what it covers in riyals, what Paddle took in dollars with tax, and Paddle's transaction ID as the reference.
- A **Card payment** switch for the client: the platform setting, Paddle, or off (bank transfer only). It is on the audit log.
- The latest card checkout: preparing, open, paid, could not be made (and why), or **Paddle took a different amount**, which is never recorded as paid and is for staff to look at in Paddle.

## How it works

- **Amounts.** Paddle has no Qatari riyal, so a card payment is in US dollars. Each price-list item can carry a dollar price (`price_items.price_usd`, US cents, edited in `/ops` beside the riyal price). The founder chose on 29 Oct: **USD 129 a month for the first product** (Chat, Bookings, Accounts) and **USD 15 for each added product**. A quote line still at its item's riyal list price takes that item's dollar price; a product added at the "each extra product" price takes that item's; any other line (priced by hand, a member, the setup fee while it has no dollar price) is its riyal price at the peg (QAR 3.64 to USD 1), rounded up to the cent. The quote's discount and period apply as they do to the riyals (`pricing.usd_totals`). What the checkout covers stays in dirhams; what Paddle is asked to charge is kept beside it in cents, fixed when the checkout is made.
- **Who decides the amount.** The owner can only write "I want to pay by card" (`card_checkouts`, a row with nothing filled in, held by its row-level security policy). A job on a back-office connection reads the accepted quote, fills in the amounts and asks Paddle for a transaction (`POST /transactions`, non-catalog items, tax category `saas`, collection mode automatic, custom data `{"alyr_checkout": <id>}` and nothing else about the client). An open checkout is reused for 12 hours for the same quote.
- **Payment.** Paddle's webhook (`POST /api/billing/paddle/webhook`) is checked for its `Paddle-Signature` (HMAC-SHA256 of `ts:body` with the destination's secret, signed within five minutes, any `h1` matching while Paddle rotates the secret) and only queues a job, so Paddle gets its answer within its five seconds. Events about nothing of ALYR's are answered 200 and ignored. The job reads the transaction back from Paddle; when it is `paid` or `completed`, in dollars, with no discount and a subtotal of exactly what ALYR asked, it adds a `client_payments` row (method `card`, provider `paddle`, the transaction ID unique, so a webhook that comes twice records once). Anything else marks the checkout `mismatch` and records nothing.
- **Renewals.** Paddle copies the custom data to the subscription and to every renewal. A renewal of the checkout's subscription, for exactly the plan's charge, is one more payment of one period. Subscription events record its ID and status (active, past due, cancelled) on the checkout.
- **Switches.** `ALYR_CARD_BILLING=paddle` offers the card to every client, only while `ALYR_PADDLE_API_KEY`, `ALYR_PADDLE_WEBHOOK_SECRET` and `ALYR_PADDLE_CLIENT_TOKEN` are all set (Secret Manager's placeholder `unset` counts as not set); `clients.card_billing` (`off` or `paddle`, null follows the platform) is the per-client switch. `ALYR_PADDLE_ENVIRONMENT` is `sandbox` until the founder goes live.
- **The page's security policy.** `/app/billing` alone may load Paddle.js from `cdn.paddle.com`, frame `buy.paddle.com` and `sandbox-buy.paddle.com`, and allow the payment sheet in that frame (Apple Pay, Google Pay). The go-live button goes there with a full page load so that policy applies.
- Migration 0064: `price_items.price_usd` (129 and 15 set); `client_payments` gains the method `card`, `provider`, `provider_ref` (unique per provider), `paid_currency`, `paid_amount`; `clients.card_billing`; `card_checkouts`.

## Not in this spec

- **Going live with Paddle.** Paddle must approve `app.alyr.qa` as a website, ALYR needs public terms, privacy and refund pages, payout details and account verification, and the customer agreement waits for the lawyer (ALY-98). Until then the environment is the sandbox.
- **What happens when renewals stop.** A past-due or cancelled subscription is shown, and nothing closes (D-053). What ALYR does about a client who stops paying is spec 040 (ALY-218, D-080).
- **Changing the plan.** A new accepted quote does not change a running Paddle subscription; staff change it in Paddle for now. Upgrades, downgrades and refunds through ALYR are later work.
- **Local providers.** A Qatari card provider for clients in Qatar (Noqoody or SADAD, after the live test, D-072) is a second value of the same switch, with its own adapter.
- **Paying the rest by card** after part was paid by hand.

## Still to prove in the sandbox (the founder's keys)

That a checkout with a one-time and a recurring item charges the setup once and renews only the plan (Paddle's documents imply it; the tests use a fake Paddle), that the overlay opens under the page's security policy, the webhook signature against a real destination, and Paddle's Arabic checkout.

## Checks

`tests/test_card_billing.py`: the dollar prices of a quote (first product, added product, a member and the setup at the peg, a discount over three months, a line priced by hand at the peg); a save of an item that leaves out the dollar price keeps it, and setting and clearing it is on the audit log. Then on the real path (PostgreSQL, the job runner, HTTP in, Paddle played by an `httpx.MockTransport` that answers what developer.paddle.com documents, webhooks signed as Paddle signs them): a card checkout from go-live with the setup once (at the peg) and the plan monthly at USD 129, nothing about the client sent but the checkout ID, the same checkout reused; a paid transaction records one payment however many times the webhook comes, settles the `paid` check, shows in `/ops` with what Paddle took; a renewal adds one period once; a different amount is never recorded and is marked for staff; another subscription's renewal is not recorded; an unsigned, wrongly signed or old webhook is refused with 401, and one about nothing of ALYR's is answered and ignored; the per-client switch is on the audit log and hides the card, a part paid by hand hides it, the platform switch and missing or placeholder keys hide it; Paddle refusing the checkout marks it failed and Pay can be pressed again; an owner cannot write an amount into a checkout (row-level security).
