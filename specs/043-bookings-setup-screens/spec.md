# Spec 043: The bookings setup screens (services first)

Status: stage 1 (services) built on branch `aly-259-bookings-services` (Linear ALY-259), one pull request, not merged. Decision: D-140. Later stages (opening hours and days off, walk-ins and moving a booking with the customer told, the people and chairs polish) add to this spec in their own pull requests. Builds on spec 026 (resources, D-069) and spec 033 (people and chairs, deposits, the day view, D-084).

## Where we start

Specs 026 and 033 gave a salon, barber, spa, clinic or home-services shop the engine and the day view: bookable people and chairs with their own hours, a day view for staff, deposits and the review request. What an owner could not do from the workspace, after the sign-up had given them its starting services and hours, was **run the services**: rename one, change its price or length, add one, hide one, say who does it. The routes existed (`POST /api/services`, `PATCH /api/services/{id}`, `POST /api/services/{id}/active`, `PUT /api/services/{id}/resources`); no screen used them except a row for each service's deposit. The audit before go-live expected every salon to ask for this first.

## Who and where

Owners and admins only (the routes use `require_manager`; agent-role staff read the list and nothing else). The Bookings tab's bar has **Set up bookings** beside **Add a walk-in**. It opens the setup in place of the day, with **Back to the day**. The setup is one part at a time, as buttons under the title: **Services**, **People**, **Deposits** (stage 2 adds **Hours**). A shop with no services is told so on the day view and in the walk-in form, with a button to add the first (an agent is told to ask the owner).

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
- Who does it: everyone who takes bookings, or only the people or chairs ticked (at least one). Asked only when the shop lists people or chairs. Someone switched off since is dropped from the choice.
- A shop may list up to 100 services (`too_many_services`).

**Hiding is not deleting.** A hidden service leaves the booking page and cannot be booked or asked for times; the bookings on it stay. When there are bookings still to come the screen says how many, and asks, before hiding. The list marks a hidden service and keeps it, so it can be shown again. If every service is hidden the screen says customers have nothing to book.

**Bookings keep what they were made with.** The name was already copied. The deposit was already worked out once. Migration 0100 adds `bookings.price`, filled by a trigger when an insert gives none, so the price a booking was made at is kept however it was made. What is left to pay, a receipt or invoice made from the booking, and the Agent's value of the week ahead read it.

## The words and the screen

Every word is in `bookingsCopy.ts`, English and Arabic against one type. The form checks before sending and says what is wrong in the page's language, beside the buttons; an API refusal shows the same way. Money on the screen is written by `_customer/price.ts` («QAR 80», «80 ر.ق», Western digits). A key moves to the form's first field when it opens and back to the button that opened it when it closes. Inputs and buttons are 44 px tall on a phone; the list is one column on a phone and up to three on a laptop; nothing scrolls sideways at 320 px.

## Not built in this stage

- **Opening hours, days off and holidays** (stage 2), **walk-ins and moving a booking with the customer told** (stage 3, the routes exist), **adding and retiring a person or chair** (stage 4, the routes exist).
- **Reordering services.** They are shown in the order they were added.
- **An audit trail of settings.** Nothing in the activity record says who changed a service or a price (D-140).
- **A photo or a description for a service.**
- **A service that only some days or hours offer.**
- **Retiring a person or chair who is the only one doing a service** does not warn (stage 4).

## Checks

- `tests/test_bookings_services.py` (16): the whole service made in one request and nothing half made, the refusals, the price held over a fixed deposit, who does it (and the chosen chair takes the booking), hide and show with bookings kept and not bookable, the price a booking was made at kept across a price change (and the trigger alone), agents refused, another shop's service refused, the 100 limit.
- `bookingsServiceForm.test.mjs` (11): prices read from text without a float, Arabic digits, what is refused, the form turned into the request.
- `scripts/bookings-owner-flow-browser-check.mjs`: a new salon signs up through the real sign-up API; the owner adds a service with a deposit (every refusal in words), changes the price, hides and shows it; a customer books it on `/b/<slug>`; the owner sees it on the day. English and Arabic, 1440, 390 and 320 px, light and dark, axe, 44 px targets, no sideways scroll.
- `scripts/bookings-day-browser-check.mjs` follows the new setup layout.
