# 040 · What happens when a client stops paying

Linear ALY-218 (go-live checklist item 39). Decision D-080. Builds on D-053 (nothing is paid first: the setup fee and the first period are asked at go-live), D-074 (card payments and renewals through Paddle, spec 035), D-033 (ALYR never deletes a client's data) and D-034 (cancel with seven days' notice).

## What it is for

Until now a client paid once, at go-live, and nothing said what happens a month later. A plan that renews by card renews by itself, but a client who pays by transfer has to be reminded, and a client who stops paying, or asks to cancel, needs one clear answer that ALYR's staff do not have to work out by hand each time.

## The rules

- **The clock starts at go-live.** The plan's first period starts the day the client's first business goes live, and each period is paid in advance. What the client has paid, less the setup fee, buys whole periods from that day: one month each, or three, or whatever the accepted price says. The day after the last paid one, the next is due.
- **Paid up** (`active`): the paid time runs past today, or the payment is waived (a pilot, a demo).
- **Past due** (`past_due`): the next period is not paid. Everything keeps working. The owner is emailed the day after the due date (a card renewal Paddle takes on the day is recorded first), and again three days before sending pauses.
- **Paused** (`suspended`): after the grace period, **14 days** (`ALYR_BILLING_GRACE_DAYS`), ALYR pauses what it sends for the client's businesses on WhatsApp: the chat's automatic replies, notices and templates. A reply someone types in the inbox still goes, inside the customer's 24-hour window, so the shop can still answer by hand. The owner can sign in, see everything and pay. Nothing is deleted and nothing closes. The owner is emailed once. `ALYR_BILLING_PAUSE_SENDING=false` turns pausing off for everyone (clients then stay past due).
- **Paying lifts it at once.** Recording a payment in `/ops`, or Paddle's renewal arriving, works the state out again in the same transaction.
- **Cancelling.** Staff record that a client asked to cancel, and how (an email, a call). It takes effect in seven days. The owner is emailed the day. On that day sending pauses the same way, and if the client pays by card, ALYR cancels the Paddle subscription so it charges nothing more. Staff can undo it, before or after; a Paddle subscription already cancelled cannot be restarted, so the client then pays by transfer.
- **Before go-live** nothing falls due: the first payment is the go-live check `paid` (D-053). Without an accepted price there is no plan.

## What the owner sees

At the top of the workspace, for the owner and an admin, in English or Arabic:
- past due: "Your payment is due", the amount, the day sending pauses, and how to pay by transfer with their reference;
- paused: "Automatic WhatsApp replies are paused", since when, that the workspace and data are all there and typed replies still go, and how to pay;
- cancelling: "Your plan ends on (day)";
- ended: "Your plan has ended".

A message the pause held back shows in the inbox and on a document as not sent, with the reason.

## What ALYR's staff see (`/ops`)

- In the client list, a pill for a client that is past due, paused or cancelled, and the day a cancellation takes effect.
- On a client: the plan's state, the day it is paid through, what is owed, the day sending pauses, since when it is paused; **Cancel in 7 days** with how the client asked, and **Undo the cancellation**. Both are on the audit log.

## How it works

- `core/subscription.py`: `state` is a pure function of the accepted price, what was paid, the go-live day, the cancellation day and today (in Qatar). `refresh` writes the state onto the client (`clients.billing_state`, `sending_paused_at`, `sending_paused_reason`) on a back-office connection.
- The outbound layer reads `sending_paused_at` for the business in scope in one query and records a refused message as `blocked` with the reason `billing_paused`. `OutboundMessage.typed` marks the inbox's replies.
- The worker checks every client with an accepted price every hour (`keep_billing_checked`). Each email is recorded in `billing_notices` (one of each kind per date) before it is sent, so a restart or a second worker never sends it twice. Emails go to the client's contact address in the owner's language, never to a reserved address.
- Cancelling at Paddle is a job (`billing.card_cancel`, `POST /subscriptions/{id}/cancel` with `effective_from: immediately`), queued in the same transaction that marks the checkout `canceling`.
- Migration 0075: the client's billing columns and `billing_notices` (back office only, forced row-level security).

## Not in this spec

- **Refunds** of a period paid past the cancellation day, and the 30-day money back (D-034): staff do them by hand for now.
- **Upgrades and downgrades** mid-period, and a new accepted price changing a running Paddle subscription (spec 035).
- **Paying a renewal by card after paying by transfer**: the card is offered only for the first payment (spec 035). A Paddle customer portal link for changing the card is later work.
- **WhatsApp messages to the owner about billing**: email only, so the reminder never depends on the channel being paused.

## Checks

`tests/test_subscription.py`: the rules by themselves (a month later on the 31st, due on the day, paused on day 14, two months owed, a part payment, pausing off, before go-live, no price, waived, a three-month plan, a cancellation on its day). Then on the real path (PostgreSQL, HTTP in, mail and Paddle played by fakes on their transports): a client a month past go-live is emailed once, warned three days before the pause, paused after it with an automatic message refused and a typed reply sent, the workspace still open and saying what is owed, and recording the payment lifts the pause at once; the email is in Arabic for an Arabic owner; a cancellation is refused without a note, keeps its first day, is on the audit log, is emailed once, pauses sending on its day and cancels the Paddle subscription once, and undoing it starts sending again; an owner cannot change their own client's pause or read the notices. Browser: the banner in each state at 375 px in English and Arabic, and Cancel and Undo in `/ops`.
