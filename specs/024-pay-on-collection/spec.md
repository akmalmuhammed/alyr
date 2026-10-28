# 024 · Pay on collection, and marking an order paid

Linear ALY-170 · Decision D-055 · Builds on spec 013 (payments written down by hand) and D-044 (a shop's payment step never blocks go-live)

## What it is for

A shop with no online account yet (nearly every pilot) still has to take orders. Before this, the order
page always ended in a payment link, and an unpaid link order gives its stock back after 30 minutes. So a
bakery taking cash on pickup could not use the order page at all. Now the shop says how it is paid, the page
stops asking for money, the order keeps its stock, and staff mark it paid when the cash or the transfer arrives.

## How it works

- **The shop's choice.** `shop_settings.pay_online` (default on: nothing changes for any shop) and
  `pay_later_ways` (cash, bank transfer, card machine). Turning the link off needs at least one way.
  Set from the Orders tab (owners and admins), by `PUT /api/orders-payment-ways`, or by the go-live list's
  payments choice: *cash and transfer* turns the link off and opens cash and transfer; *online* turns it on.
- **The page and the chat.** Both still ask for "link". With the link off, `create_order` makes it a *later*
  order: placed unpaid (`orders.payment = 'unpaid'`), no payment request, stock committed at once (nothing
  expires), the customer told "Pay by cash or bank transfer when you collect." in the order page's confirmation
  and in the WhatsApp message (approved template `order_received_later`, ALY-172 to register it). The page's
  button reads "Place order" instead of "Pay QAR x". Credit-account orders are unchanged.
- **Mark paid.** `POST /api/orders/{id}/paid {method, reference}` on an unpaid order, by cash, bank transfer,
  cheque or card machine. It calls `documents/payments.py` (not a copy): the order becomes paid, its stock is
  sold, it is on the activity record with who and how, a webhook goes out, and a shop with Documents on also gets
  its receipt. Owners and admins; an agent only where the shop allows it. A second tap is refused (409).
- **Counting.** The Sunday report's orders section counts it under "Paid" (it said "Paid online"; wrong now).
  The Agent's *paid by link* does not count it, which is true: it was not paid by link.
- **Cancelling** an unpaid later order gives its stock back and owes no refund.

## Checked

`tests/test_pay_later.py` (cash order end to end on a counted item; mark paid; reference; refusals; cancel;
settings rules; the go-live choice; Documents on gives a receipt) and the order page, templates, readiness,
reports, orders, documents payments and migration suites. The page change is type-checked and linted.
Not checked: the page and Orders tab in a browser; the template at Meta.

## Not here (new issues)

Offering the link *and* pay-on-collection together once a shop has an online account; the chat's own
confirmation of "paid" to the customer; a "paid" filter by method on the Orders tab; the tracking page's wording.
