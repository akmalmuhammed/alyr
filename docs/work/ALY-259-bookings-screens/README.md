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
