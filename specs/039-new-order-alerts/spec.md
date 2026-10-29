# 039 · Staff told about a new order on WhatsApp

Go-live checklist (50 clients, 29 Oct) item 42 · tracked under ALY-266 (Linear's free issue limit is reached) · Decision D-079 · Builds on D-039 (staff numbers and the manager alerts) and D-064 (the owner's test order)

## What it is for

A new order shows only on an open workspace screen. A shop whose staff are at the counter, in
the kitchen or out on a delivery does not keep the workspace open, so an order waits until
somebody looks. The staff already talk to the shop's number on WhatsApp (the Catalog's staff
numbers, D-039), and the managers are already told there about low stock and refunds. A new
order should reach them the same way.

## Who is told

- **The staff numbers the owner marks for "New orders"**, a switch beside "Manager" in the
  Catalog's settings (staff numbers), and on the form that adds a number. `contacts.order_alerts`,
  migration 0071, off by default.
- **Nobody until the owner marks a number.** Unlike the stock alerts there is no fallback to the
  managers or the report's numbers: a busy shop would be sent a message per order on numbers that
  never asked for one.
- **Not for the owner's own test order** (D-064): it is counted nowhere and tells nobody.
- **Never another shop's staff:** the job runs inside the order's own shop.

## What they get

Inside the number's 24-hour window, an ordinary message:

```
New order 1043 · QAR 85
From Ahmed

2 x Croissant (Large)
1 x Latte

Delivery to Al Waab on 2026-11-02 · Not paid yet
Confirm it in ALYR: https://app.alyr.qa/app/orders?show=unconfirmed
```

- At most eight lines of the order, then "and 3 more".
- The customer's name, unless the shop only knows their number.
- How it goes (pickup, or delivery with its area and day), the table when there is one, and how it
  is paid.
- In the staff member's language (English or Arabic), with the price written the way that
  language writes it.

Outside the window, the utility template `order_new_staff`, which Meta must approve first
(ALY-172): "New order at {{1}}: order {{2}} for {{3}}. {{4}}. Open ALYR to confirm it." The fourth
value is what the order holds and how it goes. Until the template is approved, a number outside
its window is not reached; the order is still on the workspace's screen.

## How

- Placing an order (`orders/service.create_order`: the order page, the chat, "same as last time")
  queues the job `orders.staff_alert` in the order's own transaction, only when some number is
  marked. Placing the order never waits for WhatsApp.
- The job (`modules/orders/staff_alert.py`) reads the order as its tracking page does and sends
  each marked number its message through the outbound layer, which checks consent and the window
  (registering a staff number is its agreement to the shop's own notices, D-039).
- Turning the switch on or off is on the activity record, like a change to "Manager".

## Not in this

- **A push notification on the owner's phone** from the workspace. Web push goes through Google's
  and Apple's servers, outside Qatar, so it needs an entry in `docs/data-residency.md` and the
  founder's decision first. The owner's own number is the shop's WhatsApp number (Meta
  coexistence), so the owner is reached by marking a second number, or by the workspace.
- New bookings, and a quiet time at night (an order at 23:00 is still told at once: a restaurant
  open late needs it).
