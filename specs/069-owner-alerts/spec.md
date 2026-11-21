# 069 · The owner is told

First client (a Qatar salon), 21 Nov 2026 · Decisions D-192 (booking alerts) and D-193 (the weekly report reaches the owner; offboarding) · Audit tasks T3, T5, T27, and the wording half of T4 (`D:\alyr-first-client\audit\product.md`) · Migration 0142 · Builds on D-030 (the weekly report), D-065 (linking a staff number), D-079 (new-order alerts, spec 039) and D-028 (accountability).

## What it is for

Three things were true for a salon on 21 Nov, all found by reading the code:

1. **No owner ever got the WhatsApp weekly report.** The report goes to staff contacts with `weekly_report`; the column defaults to false and nothing set it: linking a phone (`LINK`) set only the role and the login, registering a staff number did not touch it, and the web code had no switch. Only the seeds and the demo set it. The owner got only the emailed copy.
2. **Nobody was told about a booking.** Alerts existed for orders only. A salon owner learned of a booking by opening the Bookings tab. At 11 pm nothing reached any phone.
3. **An ex-colleague's phone kept the shop's figures.** Taking a person off the team left their linked number a staff number, still on the report's list and the alerts.

## The weekly report reaches the owner (D-193)

- **Linking.** When a number that was a customer's becomes an owner's or an admin's own (`LINK <code>`), `weekly_report` and `booking_alerts` are switched on and the number agrees to the shop's messages (`consent` source `customer_initiated` from writing the code, or `staff_link` if it never answered). A number that said STOP stays stopped. An **agent** (a stylist) is never given the report: it holds the shop's money (D-035). A number the shop had already registered as staff keeps the settings the owner gave it.
- **Registering a staff number** (`POST /api/staff-numbers`) takes `weekly_report` and `booking_alerts`. Not said: off for a new number, unchanged for a number registered again (registering a linked owner twice does not switch their report off). Registering is already the agreement to the shop's notices.
- **The switches.** The Team screen's "Your WhatsApp" card gains **What ALYR sends you**: Weekly report (owners and admins), New bookings (where Bookings is on), Booking emails (owners, where Bookings is on). The two WhatsApp ones need a linked phone. `PUT /api/owner/alerts`; `GET /api/owner/whatsapp` returns the three. The Catalog's staff-numbers list gains the same two switches per number, and the add form two ticks (it is the only way for an owner to mark a number that is not their own login's).
- **The day is Sunday, 9:00, shop time, and the words never say another** (T4). It is fixed in code (`report.SEND_WEEKDAY = 6`); the founder decides whether it moves. A test reads every place where the report's day is named in what an owner reads and fails on "Monday" there.

## The owner is told about bookings (D-192)

`modules/bookings/staff_alert.py`, the twin of `modules/orders/staff_alert.py`:

- **When.** A booking a customer makes (`create_booking`, from the booking page, deposit or none) and a booking a customer cancels (`cancel_booking` with the customer as the actor: the chat). A member of staff cancelling, a desk booking and a deposit hold running out tell nobody. Never for the owner's own test booking (D-064).
- **WhatsApp**, to the staff numbers with `contacts.booking_alerts`. Inside the number's 24-hour window an ordinary message:

```
New booking 104
Blow-dry with Reem
Sat 22 Nov, 4:30 PM
From Mariam
See it in ALYR: https://app.alyr.qa/app/bookings
```

  and, for a cancellation, `Booking 104 cancelled by the customer`, the same lines and `The time is free again.` Arabic whole and right to left, each line opened with U+200F. "From" is left out when the shop only knows the number; "Deposit QAR 30, not paid yet" is added for a booking waiting for its deposit.
- **Outside the window: nothing is sent.** The templates `booking_new_staff` and `booking_cancelled_staff` are written (English and Arabic, four blanks: the shop, the number, the service with who does it, the time) and **held** (`held=HELD`): not submitted to Meta, which is the founder's go. While held, `may_send` refuses a number whose window is closed, so no message leaves outside the window and nothing fails late in `/app/unsent`. Lifting the hold (deleting `held=HELD`, then `templates_sync` once Meta has approved) is all that turns the outside-the-window send on.
- **Email**, one per event to each owner with `memberships.booking_emails` (on by default, the owner turns it off on the Team screen), through `core/mail.py` (`booking_alert_message`) and its own job per owner, so a refusal by Resend is retried without sending a second WhatsApp message. In the owner's language (`tenants.owner_lang`), with the plain-text twin. **It holds the booking's number, the service with who does it and the time, never the customer's name or phone number** (Resend is in the EU, hard rule 2; `docs/data-residency.md` has its row). Never to an example domain, never while no mail key is set.
- **Nobody is told until someone is marked** (a linked owner or admin is marked at linking), so a busy shop is never sent a message per booking it did not ask for.

## Offboarding (T27)

`core/staff_link.stand_down` is the one place a number stops being staff's: customer role, login unlinked, `weekly_report`, `order_alerts`, `booking_alerts` and `catalog_manager` off, open staff questions cleared, history kept. It is what taking a number off the staff list (`staff.remove`) and removing a person from the team (`auth.remove_member`) both do. An admin made an **agent** stops receiving the report (but keeps the booking alerts, which hold no money).

## Not done, and why

- **Moving the report to Monday.** The founder decides (T4). Every place that names the day is listed in the pull request.
- **A new-booking alert for a booking staff make by phone or at the desk.** The person making it knows; add it if an owner who is not at the desk asks.
- **Submitting either template to Meta**, and any send outside the window (the founder's go).
- **A per-shop switch for the email.** It is per owner.
- **Linking a second phone moves the report.** A new link leaves the old number a staff number with the settings it had (D-065); the owner switches it off in the staff numbers if they want.

## Tests

`tests/test_booking_alerts.py` (15: nobody until marked, the text and the Arabic, a cancellation by the customer and not by staff, off, the test booking, a booking cancelled before the job ran, the templates held and well-formed, nothing outside the window while held and the template once lifted, the email without the customer's details, in Arabic, the switch, an agent not emailed, an example address not emailed, a refused email retried with one WhatsApp message) and `tests/test_owner_alerts.py` (17: linking an owner, an agent, a listed number, a stopped number; the switches and their roles; the staff list's switches; registering; the database refusing an alert on a customer's number; offboarding by team and by list, demotion; Sunday), `apps/web/app/(product)/_workspace/ownerAlerts.test.mjs` (5).
