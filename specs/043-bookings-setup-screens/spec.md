# Spec 043: The bookings setup screens (services first)

Status: stage 1 (services) built on branch `aly-259-bookings-services` and stage 2 (opening hours and days off) on `aly-259-bookings-hours`, stacked on it (Linear ALY-259), one pull request each, not merged. Decisions: D-140, D-141. Stage 3 (the desk: walk-ins and moving a booking, with the customer told) is on `aly-259-bookings-desk`, stacked on stage 2 (D-142); stage 4 (the people and chairs, and the order of both lists) is on `aly-259-bookings-people`, stacked on stage 3 (D-143). Builds on spec 026 (resources, D-069) and spec 033 (people and chairs, deposits, the day view, D-084).

## Where we start

Specs 026 and 033 gave a salon, barber, spa, clinic or home-services shop the engine and the day view: bookable people and chairs with their own hours, a day view for staff, deposits and the review request. What an owner could not do from the workspace, after the sign-up had given them its starting services and hours, was **run the services**: rename one, change its price or length, add one, hide one, say who does it. The routes existed (`POST /api/services`, `PATCH /api/services/{id}`, `POST /api/services/{id}/active`, `PUT /api/services/{id}/resources`); no screen used them except a row for each service's deposit. The audit before go-live expected every salon to ask for this first.

## Who and where

Owners and admins only (the routes use `require_manager`; agent-role staff read the list and nothing else). The Bookings tab's bar has **Set up bookings** beside **Add a walk-in**. It opens the setup in place of the day, with **Back to the day**. The setup is one part at a time, as buttons under the title: **Services**, **Hours** (stage 2), **People**, **Deposits**. A shop with no services is told so on the day view and in the walk-in form, with a button to add the first (an agent is told to ask the owner).

## Services

| Action | API | Notes |
|---|---|---|
| List, hidden too | `GET /api/services` | each with `resource_ids` (empty: everyone who takes bookings) and `upcoming` (bookings still to come); the booking page's list has neither |
| Add | `POST /api/services` | name, name in Arabic, length, price, deposit and `resource_ids`, in one transaction |
| Change | `PATCH /api/services/{id}` | any of the same; `resource_ids` left out leaves who does it as it is, an empty list opens it to everyone |
| Hide or show | `POST /api/services/{id}/active` | the answer carries the new list |

Rules, in the API and again in the page's own words before anything is sent:

- A name is needed (`bad_name`). The Arabic name is optional; an Arabic page shows the English one when it is empty.
- The length is a whole number of minutes from 5 to 600 (`bad_duration` on the page; the database's check behind it). The booking page offers times on the shop's 30-minute step whatever the length.
- The price is typed in QAR ("80", "12.5", Arabic digits and the Arabic decimal mark too) and stored in dirhams, read from the text and never through a float. Empty means no price is shown (stored as 0).
- A deposit is none, a fixed amount from QAR 1 and not over the price (when the service has one), or a share of the price from 1% to 100% (`bad_deposit`). A share of a service with no price asks nothing, so it is refused (`deposit_needs_price`). The check is on the **whole** service: a price cannot be lowered under a fixed deposit by a change that names only the price.
- Who does it: everyone who takes bookings, or only the people or chairs ticked (at least one). Asked only when the shop lists people or chairs. Someone switched off since is dropped from the choice. The booking page is told who does each service (`doers` on each service: every active person or chair for a service nobody was chosen for, else the chosen ones) and offers exactly those; a service limited to one chair is booked on that chair with no question asked.
- A shop may list up to 100 services (`too_many_services`).

**Hiding is not deleting.** A hidden service leaves the booking page and cannot be booked or asked for times; the bookings on it stay. When there are bookings still to come the screen says how many, and asks, before hiding. The list marks a hidden service and keeps it, so it can be shown again. If every service is hidden the screen says customers have nothing to book.

**Bookings keep what they were made with.** The name was already copied. The deposit was already worked out once. Migration 0100 adds `bookings.price`, filled by a trigger when an insert gives none, so the price a booking was made at is kept however it was made. What is left to pay, a receipt or invoice made from the booking, and the Agent's value of the week ahead read it.

## The words and the screen

Every word is in `bookingsCopy.ts`, English and Arabic against one type. The form checks before sending and says what is wrong in the page's language, beside the buttons; an API refusal shows the same way. Money on the screen is written by `_customer/price.ts` («QAR 80», «80 ر.ق», Western digits). A key moves to the form's first field when it opens and back to the button that opened it when it closes. Inputs and buttons are 44 px tall on a phone; the list is one column on a phone and up to three on a laptop; nothing scrolls sideways at 320 px.

## Not built in this stage

- **Opening hours and days off** (stage 2, below), **walk-ins and moving a booking with the customer told** (stage 3, below), **adding and retiring a person or chair** (stage 4, below).
- **Reordering services** (stage 4, below).
- **An audit trail of settings.** Nothing in the activity record says who changed a service or a price (D-140).
- **A photo or a description for a service.**
- **A service that only some days or hours offer.**
- **Retiring a person or chair who is the only one doing a service** (stage 4, below).

## Checks

- `tests/test_bookings_services.py` (17): the whole service made in one request and nothing half made, the refusals, the price held over a fixed deposit, who does it (the chosen chair takes the booking, and the booking page offers only the people who do a service), hide and show with bookings kept and not bookable, the price a booking was made at kept across a price change (and the trigger alone), agents refused, another shop's service refused, the 100 limit.
- `bookingsServiceForm.test.mjs` (11): prices read from text without a float, Arabic digits, what is refused, the form turned into the request.
- `scripts/bookings-owner-flow-browser-check.mjs`: a new salon signs up through the real sign-up API; the owner adds a service with a deposit (every refusal in words), changes the price, hides and shows it; a customer books it on `/b/<slug>`; the owner sees it on the day. English and Arabic, 1440, 390 and 320 px, light and dark, axe, 44 px targets, no sideways scroll.
- `scripts/bookings-day-browser-check.mjs` follows the new setup layout.

## Stage 2: opening hours and days off (D-141, migration 0101)

### Opening hours

The **Hours** part shows the shop's week, a day at a time, Sunday first (`BookingsWeek.tsx`, `bookingsWeekLogic.ts`). A day is open or not; an open day has one or more periods, each a time to a time, and a **break in the middle of the day is two periods**. **Same hours every day** copies the first open day to the week (nothing is saved until Save hours). The same editor is used for one person's or chair's own hours under **People** (it starts from the shop's hours when they have none of their own, so a person who works the shop's hours but not on Thursdays is a few clicks, not a blank week).

| Action | API | Notes |
|---|---|---|
| Read the shop's week | `GET /api/hours` | periods, as before |
| Replace the shop's week | `PUT /api/hours` | the whole week at once |
| Replace one person's or chair's week | `PUT /api/resources/{id}/hours` | an empty week means they work the shop's hours |

Checked on the page (the day is named in the message) and again in the API: every period closes after it opens (`bad_hours`) and two periods of one day do not overlap (`bad_hours_overlap`; touching, one closing at 13:00 as the next opens, is allowed). The API checks before it deletes, so a refused week leaves the old one. Free times, the booking page and the day view follow at once: they read the same hours.

### Days off

A **day off** is a range of the shop's own calendar days, first to last inclusive, for **the whole shop** (Eid, a holiday, a closure) or for **one person or chair** (their leave). `booking_closures` (migration 0101; forced row-level security; made and removed, never edited; a person's own closures go with the person if they are ever deleted). The days are the shop's days, like opening hours, so a closure on the 5th is the 5th in the shop's time zone whatever the server's clock says.

| Action | API | Who |
|---|---|---|
| List the ones not over yet, soonest first | `GET /api/closures` | any staff |
| Add | `POST /api/closures` (`first`, `last`, `resource_id`, `reason`, `reason_ar`) | owner, admin |
| Remove | `DELETE /api/closures/{id}` | owner, admin |

What a day off does:

- **Customers cannot book it.** `free_times` offers nothing on a closed day (the whole shop's, or the person's own), and the same check sits behind picking a person or chair, so an old list of times cannot book it either. A person on leave is not offered while the other chair still is.
- **Staff still can.** A staff member can write a visit down on a closed day (a regular who comes by on Eid), the way they can outside opening hours today; the day view shows the day as closed.
- **It never cancels or moves a booking.** Bookings already inside it stay booked. Adding a day off says how many are still booked inside it, each one in the list shows the count, and **Open the day** goes to the first of those days in the day view, where the owner moves or cancels them (the customer is told, by the paths that exist).
- **The booking page says why.** A closed day shows "The shop is closed this day: Eid al-Fitr. Try another day." (the reason in the customer's language when the owner wrote both; without a reason, no colon). The page's data lists the whole shop's closed days (`closed_days`, and `closed` on a day's times); a person's leave is never listed there, and its reason is never shown to customers: that person's times are simply not offered.
- **The day view says closed.** A shop with people shows each column as "Closed: reason" (or "Day off" for a person whose own week leaves the day out); a shop with none shows its one lane that way.
- **Limits.** At most 366 days in one closure, 200 not yet over in all, a last day that is not before the first, and not wholly in the past (`bad_closure`, `too_many_closures`, `closure_past`).

### Not built in stage 2

- **Special hours on one date** (open late on one Thursday), **buffers between visits**, **shifts across midnight** (a period closes by 23:59), **repeating closures** (Eid moves, so each is added when it is known).
- **Changing a day off**: remove it and add it again.
- **A message to customers who already booked** a day that is then closed. The owner moves or cancels each, and the customer is told by the same paths as any move or cancel (stage 3 checks them).

### Checks (stage 2)

- `tests/test_booking_hours_closures.py` (18): a break is two periods and nothing is offered in it; overlapping periods are refused and the old week stays; a person's own week can have a break; a closed day offers nothing and says why; nobody can book it even with a time taken before; a range, taking one away, one that has begun; a booking inside a closure stays and is counted; staff can still write a visit on a closed day; a person on leave is not offered and the other chair still is; the refusals; only days to come are listed; the day view says closed; the booking page lists the shop's closed days and never a person's leave; closures follow the shop's own calendar day (a shop 14 hours ahead of UTC); agents refused; another shop cannot see or remove them. A mutation check: take the closure test out of the engine and four of them fail.
- `bookingsWeekLogic.test.mjs` (9): a week as seven days and back, a break, the day named in a refusal, the same hours every day, a day off's dates.
- `scripts/bookings-owner-flow-browser-check.mjs --stages 1,2`: the owner puts a break on Sunday (an overlap is refused in words naming the day), adds a day off on the day of a customer's booking (it says one booking is still booked, the booking stays, the day view says closed and why), the customer's page says the shop is closed that day and why, one person's leave, and taking the closure away. English and Arabic, 1440, 390 and 320 px, light and dark, axe, 44 px targets, no sideways scroll.

## Stage 3: the desk, walk-ins and moving a booking (D-142)

The routes existed (spec 033); the forms were bare: a name and a number typed every time, a move by typing a time and hoping, and "the customer is told" said whether or not they were. Stage 3 keeps every route and changes what staff see. The forms are in `BookingsDeskForms.tsx` and the small functions in `bookingsDeskLogic.ts`. Any staff member can use them, agents too.

### Writing a visit down

**Add a walk-in** opens a form with the service, the person or chair (Anyone free by default), the time (this minute by default, any minute allowed, never a taken person) and a line under it saying when the visit ends. The customer is **found, or made**:

- **Found.** Typing two letters of a name, or three digits of a number, lists the shop's customers who match, under the name field (`GET /api/bookings/customers?q=`: name or part of the number, at most six, never the owner's own test customers, wildcard characters read as plain text). Choosing one fills the booking in their name; **Use someone else** puts the fields back.
- **Made.** A new name and number (a number is needed: every customer record can be reached, so a record without one cannot exist). A number that is already the shop's is found, not duplicated. Qatar's eight digits get 974.
- **Here now** (ticked by default) writes a walk-in down and sends nothing: the customer is standing there. Unticked, it is a booking by phone: the customer is sent the confirmation by the notice that already exists (`booking_confirmed`) and a reminder is queued.

### Moving a booking

**Move** shows where the booking is now ("Now 10:00 with Chair 2"), a day, a person or chair, and the **free times** for that booking's service on that day for that person or anyone (`GET /api/bookings/{id}/times?day=&resource_id=`: the engine's free times, the booking's own time not counted against it, the day's closure said when there is one) as buttons. Choosing one fills the time; **Or write any other time** still takes any minute, the way a walk-in can. A refused move (the person is taken then) says so in words and changes nothing. The customer is told by `booking_moved`.

### Cancelling

**Cancel** is as before (a paid deposit is kept or refunded by the shop's rule, or by the shop's choice), and the customer is told by `booking_cancelled`, or `booking_cancelled_deposit` when there is a deposit to say something about (written in D-084, not yet submitted to Meta: inside the customer's 24-hour window it goes as a plain message, outside it waits for the template).

### Was the customer told

Moving, cancelling and writing down a booking by phone answer with `told: {sent, reason, phone}`. The outbound layer takes a message or refuses it (hard rule 5), so the screen says which:

| | The screen says |
|---|---|
| Taken (`sent`) | "Moved. The customer is told on WhatsApp." (the delivery itself can still fail later: that shows on the Not sent screen) |
| Refused: `no_consent` (a customer typed in at the desk, who has never written) | "The customer has not agreed to WhatsApp messages yet, so nothing was sent. Tell them yourself: 9745…" |
| Refused: `opted_out` (they said stop) | "The customer asked not to be messaged, so nothing was sent. Tell them yourself." |
| Refused: `billing_paused` (ALYR's sending for the shop is paused) | "…cannot be messaged while ALYR's messages for this shop are paused…" |
| A walk-in | nothing: no message was meant to be sent |

**Before** the action the form says the same where the customer cannot be messaged (`consent` comes with every booking in the day view), so staff know to call before they press. **The move or the cancel always happens**: a message that cannot go never holds the shop up, and the refused message is on the record as blocked (and on the Not sent screen).

### Not built in stage 3

- **Recording that a customer agreed on the phone.** A customer typed in at the desk has not agreed to messages, so a phone booking for them sends no confirmation and no reminder until they write first. Letting staff record "agreed by phone" is a consent record made on someone's behalf: it needs the founder's decision, and probably the lawyer's, so nothing is built (D-142).
- **A walk-in with no number.** The identity layer needs a number (or a WhatsApp ID) for every customer.
- **A deposit link for a booking staff made.** Staff bookings ask no deposit (spec 033).
- **Finding a customer in any Arabic spelling** (the order page folds them; the desk's search is plain text, either language).
- **Moving several bookings at once**, for example when a person is off: each is moved on its own.

### Checks (stage 3)

- `tests/test_bookings_desk.py` (18): a move says the customer was told, and says it was not (never agreed, said stop) with the number; the move happens anyway; the same for a cancel and for a booking by phone for a new customer; a walk-in sends nothing and says nothing; the list carries where consent stands; a booking being moved does not block its own time; the times follow the person asked for; a closed day is said; a time the screen offered is taken; any other minute is allowed; finding a customer by name and by part of the number; one character, blanks and wildcards find nobody; test customers are not offered; an agent can do all of it; another shop sees nothing and can move or cancel nothing.
- `bookingsDeskLogic.test.mjs` (6): a visit's end, the sentences in both languages (reasons, the number, Western digits in Arabic), a reason nobody wrote words for.
- `scripts/bookings-owner-flow-browser-check.mjs --stages 1,2,3`: a walk-in for a customer found by typing three letters, a booking by phone for a new customer (warned before, told nothing was sent after, the confirmation on the record as blocked), a move to a chosen free time with the customer told, a move and a cancel for a customer who cannot be messaged (the number shown before and after, the cancel done all the same), the forms at 390 px light and dark. English and Arabic, axe, 44 px targets, no sideways scroll.

## Stage 4: the people and chairs (D-143)

The People part had the routes' bare minimum: a name, a kind, a switch, their own hours. Stage 4 says what each person does and has ahead, stops a retirement that would strand a service, and puts the lists in the order the owner wants. The routes are the same, with `GET /api/resources` and `GET /api/services` carrying more.

- **What each does and has ahead.** Every person or chair shows "Does every service" or "Does: Haircut, Colour" (in the services' own names, in the page's language) and "Booked ahead: 3" (`does`, `does_all` and `upcoming` on `GET /api/resources`; a hidden service is not counted). Who does a service is still set on the service (Services): this is the same fact from the other side.
- **Retiring (not taking bookings).** Switching someone off keeps the bookings they have and stops new ones. With bookings still to come the screen asks first and says they stay ("move or cancel them from the day"; new bookings go to someone else). A retirement that would leave a service with **nobody** to do it is refused (`service_needs_someone`, 409, naming the services): a service the owner limited to this one would still be offered on the booking page with no time to book. The owner chooses someone else for it under Services, or hides it, first. The last active person or chair still cannot be retired (`last_resource`).
- **The order.** Up and down buttons (44 px, named for the one they move) put the people and chairs in order, and the services in order (`PUT /api/resources/order`, `PUT /api/services/order`: the whole list once each, hidden services included, or `bad_order`). The people's order is the day view's columns, the booking page's list, and **who "anyone" takes first** (the engine already took the first free one in the shop's order); the services' order is the booking page's list.
- **The first one added.** "Add a person or chair" says the first one takes over the bookings already made, and the answer says how many (`adopted`): "Added. Bookings still to come, now with them: 3. Move any you want elsewhere from the day."
- **Limits and names.** A person or chair needs a name (`bad_name`); a shop may list up to 50 (`too_many_resources`).

### Not built in stage 4

- **A person's own login or calendar** (spec 033, not in scope), **assignment by least busy**, **a person's photo**.
- **Setting who does a service from the person's side.** It is set on the service; the person's row shows the result and says where to change it.
- **Moving a retired person's bookings in one step.** Each is moved from the day on its own (stage 3).

### Checks (stage 4)

- `tests/test_bookings_people.py` (12): what each does and has ahead (a hidden service is not counted); nobody is retired who is the only one for a service, and the other chair can be; the last one still cannot be; retiring keeps the bookings and stops new ones; the first one added takes over the bookings and says how many; a name and a limit; the order is kept and "anyone" takes the first; an order must name every one once; services in order with the hidden ones; agents can read and nothing more; another shop cannot reorder this shop's people.
- `bookingsReorder.test.mjs` (3).
- `scripts/bookings-owner-flow-browser-check.mjs --stages 1,2,3,4`: the people list says what each does and has ahead, retiring the only chair for a service is refused naming the service, a chair is put first, a chair with a booking ahead is retired after a question and the booking stays, a person is added, the services are put in order; the screen at 390 px light and dark. English and Arabic, axe, 44 px, no sideways scroll.
