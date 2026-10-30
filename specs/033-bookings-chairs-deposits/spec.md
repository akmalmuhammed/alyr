# Spec 033: Chairs and staff with their own hours, the day from the screen, deposits, and the review request

Status: built on branch `aly-27-chairs-deposits` (Linear ALY-27), one pull request, not merged. Decision: D-084. Builds on spec 026 (the bookable-resources engine, ALY-258, D-069), whose branch is merged into this one, so this pull request carries both.

The founder decided on 29 Oct to build this before the salon sales demo (ALY-264, `docs/sales/demo-salon.md` on `aly-demo-salon`).

## Where we start

Spec 026 gave the engine: a shop may list resources, the database refuses two bookings on one resource (`bookings_no_overlap` per `coalesce(resource_id, tenant_id)`), and a shop with none is unchanged. It had no screens, no hours of a resource's own, no customer choice, no deposits, and staff could not add a walk-in or move a booking from the workspace.

## 1. Resources with their own hours, and "anyone" or a person

- A resource is a **person** (a stylist, a technician) or a **place** (a chair, a room): `booking_resources.kind`. People are named in messages as "with Reem"; places as ", Chair 2".
- **Its own working hours** (`resource_hours`, weekday, opens, closes, several periods a day). A resource with none works the shop's opening hours. One with some works only those (a day with no row is its day off).
- **Free times** are computed per resource: a start is free if one resource that does the service is working then and has no booking overlapping it. The page shows one list of times for "Anyone", or one person's times.
- **The customer chooses** "Anyone" or one of the people or places that do the service, on the booking page, when the shop has more than one. "Anyone" takes the first free one in the shop's order.
- **Unchanged:** a shop with no resources (one lane, as before); the database guard; the shop's lock (one booking at a time per shop decides who gets a time).

## 2. The day from the workspace

The Bookings tab opens on **a day view by resource**: one column per resource (one list for a shop with none), each booking a card with its time, customer (first name and initial), service, status, deposit, and its actions. A day picker moves between days. The filtered list the Agent links to (`?show=unmarked`, `no_show`, `repeat_no_show`) is kept as it was.

| Action | Who | API | On the record |
|---|---|---|---|
| Add a walk-in or a booking taken by phone | any staff | `POST /api/bookings` (service, resource or anyone, start, an existing customer or a name and phone) | `booked` with `by staff`, `walk_in` |
| Move to another time or resource | any staff | `POST /api/bookings/{id}/move` (`starts_at`, `resource_id`) | `moved`, with the resource |
| Cancel | any staff | `POST /api/bookings/{id}/cancel` (`refund` for a paid deposit) | `cancelled`, with what became of the deposit |
| Came / didn't come | any staff | `POST /api/bookings/{id}/outcome` | `completed` / `no_show`, and the deposit |
| Deposit refunded (by the shop, from its own account) | owner, admin | `POST /api/bookings/{id}/deposit-refunded` | `deposit_refunded` |
| Resources, their hours, deposits, the deposit rule, the review link | owner, admin | `/api/resources...`, `PUT /api/resources/{id}/hours`, `PATCH /api/services/{id}`, `PUT /api/bookings/settings` | (settings) |

Staff place a booking at any minute (a walk-in arrives at 4:10 pm), outside the shop's grid and lead time, but never on a resource that is taken: the same lock and the same database guard. A walk-in sends no message (the customer is standing there); a booking by phone sends the confirmation and schedules the reminder, like one from the page. Staff bookings ask no deposit.

## 3. Deposits

- **Per service, optional:** none, a fixed amount, or a percentage of the price (`services.deposit_kind`, `deposit_value`). The amount is worked out once, when the booking is made, and kept on the booking.
- **The shop's rule** (`shop_settings`): what happens to a paid deposit on a no-show (`keep` or `refund`), on a late cancel (`keep` or `refund`), and how many hours before the visit a cancel counts as late (24 by default). A cancel earlier than that is always refunded. The rule is copied onto the booking (`deposit_terms`) when it is made, so a later change of rule does not change what the customer agreed to.
- **Shown before paying:** the booking page shows the deposit on the service and the rule, in words, beside the confirm button; the pay page shows it again.
- **By pay link:** a booking that asks a deposit is made and held (it blocks the time) for the shop's hold time (`shop_settings.hold_minutes`, 30 minutes unless changed: the Catalog's pay-link hold); the customer gets the pay link on the page and in the chat. Paid in time, the booking is confirmed and the reminder is scheduled. Not paid, a job at the end of the hold (and the worker's sweep, which catches a lost job) releases the time, cancels the booking, expires the link and tells the customer. The pay link's state is claimed first, in the same order a payment takes, so a payment and a release cannot both win.
- **A deposit receipt (Docs):** a paid deposit makes a deposit receipt for a shop with Documents on and its deposit-receipt setting on, once (key `receipt:booking-deposit:<id>`), and counts against the final bill: a later receipt, invoice or payment recorded by hand for the booking includes it.
- **The stand-in:** the pay link opens ALYR's test payment page ("Test payment page. No money moves."). Card payments go live with the shop's own payment provider (hard rule 3; ALYR never holds the money). The booking page, the pay page and the workspace say so.
- **The deposit's states:** `none`, `due` (link sent, held), `paid`, `expired` (not paid in time or cancelled unpaid), `kept` (by the shop's rule), `refund_due` (the shop owes it back), `refunded` (the shop says it did). ALYR never moves money: "refund due" is a note to the shop, which refunds from its own account and marks it.

## 4. Messages, reminders and the Agent know the resource

The confirmation, the reminder, the move and the "my booking" answer name the resource ("Blow-dry with Reem, Thu 30 Oct, 5:00 PM"). The existing templates carry it inside the blank that already holds the service or the time, so their approved wording does not change. New templates, written in `core/templates.py` and **not submitted to Meta** (the founder's go): `booking_deposit_due`, `booking_deposit_paid`, `booking_released`, `booking_cancelled_deposit`, `review_request`. The Agent's repeat no-show line names who the customer is booked with, and its "done for you" counts review requests.

## 5. The review request

- **Per shop, off by default.** The owner turns it on and enters the shop's Google review link (`shop_settings.review_requests`, `review_link`, an `https://` address).
- **When:** a booking marked "came", or an order marked done (collected or delivered). Not the owner's test order.
- **What:** one WhatsApp message in the customer's language: thanks for that visit or order, and the link. Inside the 24-hour window it goes as a plain message; outside it, as the `review_request` template (utility: it names one visit or order and has no offer, which Meta's guidelines ask for; checked 29 Oct 2026). The outbound layer checks consent and stop as for every message.
- **At most one per customer per 30 days,** decided under a per-customer lock, and written in `review_requests` (append-only).
- **No review gating.** Every customer is asked the same way. ALYR never asks first whether they were happy and sends only the happy ones to Google: Google's policy forbids selectively asking for positive reviews. Anyone can reply in the chat, and the owner reads the reply in the inbox.
- On the activity record (`review_requested`), and counted in the Agent's "done for you".

## Tables (migration 0076)

`booking_resources.kind`; `resource_hours` (tenant, resource, weekday, opens, closes); `services.deposit_kind`, `deposit_value`; `bookings.deposit`, `deposit_state`, `deposit_terms`, `hold_until`, `walk_in`; `payment_requests.booking_id` (one pending link per booking); `shop_settings.deposit_no_show`, `deposit_late_cancel`, `deposit_cancel_hours`, `review_requests`, `review_link`; `review_requests` (append-only). Every new table carries the tenant column with forced row-level security and the standard policy; the append-only one is granted select and insert only. The contact merge copies `review_requests` forward.

## The seed

Dafira Salon (`seed_bookings.py`) gets three stylists (Reem, Huda, Noor, each with her own days off), its history spread across them, extra visits in the days ahead so two or three are at the same time, deposits on Hair colour (QAR 50) and Hair treatment (25%), the rule "keep on a no-show or a cancel within 24 hours", and Documents on so a deposit makes a receipt. The fictional names are first names only.

## Not in this spec

- Screens for services (name, price, length) and the shop's opening hours: still through the API.
- Days off by date (holidays) and buffers between visits.
- A resource linked to a login (a stylist's own calendar).
- Staff taking a deposit link for a booking they made (they can record a payment by hand in Documents).
- A real gateway: card payments wait for the shop's payment provider (ALY-17, D-044).
- Submitting the new templates to Meta.

## Checks

`tests/test_booking_resources.py` (spec 026) and `tests/test_bookings_chairs_deposits.py` (this spec), through the real routes, the engine and PostgreSQL; the concurrency tests hold a booking open inside its transaction and watch the database (`tests/concurrency.py`) for the second request waiting, and one runs with the shop's lock removed to prove the database alone refuses the double booking. `scripts/bookings-day-browser-check.mjs` opens the day view, the walk-in form and the booking page at 390 and 1440 px, English and Arabic.
