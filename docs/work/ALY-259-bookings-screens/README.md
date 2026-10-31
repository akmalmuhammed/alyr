# ALY-259: the bookings setup screens

Pictures of each stage's screens, taken by `scripts/bookings-owner-flow-browser-check.mjs` in headless Edge on a local stack (a fictional salon, "Noor Hair Studio", made through the real sign-up). Laptop pictures are 1440 px wide, phone pictures 390 px; names say the language (`en`, `ar`) and, where it matters, the theme. The spec is `specs/043-bookings-setup-screens/spec.md`; the decisions are D-140 onward in `docs/decisions.md`.

## Stage 1: services (D-140)

| Picture | Shows |
|---|---|
| `en-02-services-1440`, `ar-02-services-1440` | the services list, English and Arabic (right to left) |
| `en-03-add-service-error-1440` | adding a service: a refusal in words, nothing sent |
| `en-05b-who-does-it-1440` | editing a service: who does it, once the shop lists chairs |
| `en-08-owner-sees-booking-1440` | the day view after a customer booked that service on `/b/<slug>`: it is on the chair that does it |
| `en-09-services-390-light`, `ar-09-services-390-light` | the list on a phone |
| `en-10-add-service-390-dark` | the add form on a phone, dark |
| `ar-05c-who-does-it-390` | who does it on a phone, Arabic |
| `en-06-booking-page-390` | the customer's booking page offering the service the owner added |

## Stage 2: opening hours and days off (D-141)

| Picture | Shows |
|---|---|
| `en-11-hours-1440`, `ar-11-hours-1440` | the week a day at a time, English and Arabic (right to left) |
| `en-12-hours-overlap-1440` | two periods that overlap, refused in words that name the day |
| `en-14-closure-added-1440` | a day off added on the day of a booking: the screen says one booking is still booked |
| `ar-15-day-closed-1440` | the day view of that day: the shop is closed and why, the booking is still there |
| `en-11-hours-390-light`, `ar-11-hours-390-light` | the week on a phone, a break on Sunday |
| `en-12-days-off-390-dark`, `ar-12-days-off-390-light` | the add-days-off form on a phone |
| `en-16-booking-page-closed-390` | the customer's booking page on a closed day: it says why |

## Stage 3: the desk (D-142)

| Picture | Shows |
|---|---|
| `en-18-walk-in-find-1440` | typing three letters finds the customer the shop has |
| `en-20-phone-booking-warning-1440`, `ar-20-phone-booking-warning-1440` | a booking by phone for a new customer: the form says before it is added that nothing can be sent |
| `en-21-move-free-times-1440` | moving a booking: where it is now and the free times as buttons |
| `en-22-move-form-390` | the move form on a phone, the number to call shown |
| `en-23-cancelled-not-told-1440` | after a cancel for a customer who cannot be messaged: nothing was sent, the number to call |
| `en-24-walk-in-390-dark` | the walk-in form on a phone, dark, with the matching customer under the name |

## Stage 4: the people and chairs (D-143)

| Picture | Shows |
|---|---|
| `en-25-people-1440` | each person says what they do and what is booked ahead, with order buttons |
| `en-26-retire-refused-1440` | retiring the only chair for a service is refused, naming the service |
| `en-27-people-reordered-1440` | a chair put first |
| `en-28-chair-retired-1440` | a chair retired after a question: it keeps its booking |
| `en-29-services-reordered-1440` | the services in a new order |
| `ar-30-people-390-light`, `en-30-people-390-dark` | the people on a phone, Arabic and dark |
