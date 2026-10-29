# 027 · Self-serve onboarding for order businesses

Linear ALY-164 (the path) and ALY-168 (the test order). Decision D-063. Builds on spec 018 (the onboarding engine, D-049), spec 022 (nothing is paid first, D-053) and spec 024 (pay on collection, D-055). The audit of 20 Oct (`docs/research/studies/2026-10-20-self-serve-onboarding-audit.md`) named this the largest gap before go-live.

## What it is for

A bakery, restaurant, grocery, shop or fashion seller can go from `/start` to a finished test order on their own, in one sitting, and land on a go-live list that says what is left. Today only appointment businesses can: every order business is created with the `assisted` way, sees one screen ("ALYR will set up the rest with you"), and a setup request lands in `/ops`.

One flow serves both doors (D-049): a client who signs up alone and a client the founder creates from the `/ops` console in person go through the same steps. The sales link and assisted mode (ALY-216, ALY-215) are later (founder, 28 Oct).

## The way and the types

A third way of working, `orders`, beside `appointments` and `assisted`. It belongs to the types whose modules are `inbox, orders, payments`: **restaurant, bakery, grocery, shop, fashion**. **Wholesale** (credit, price groups) and **travel** (requests) stay `assisted`.

Whether a type is offered self-serve is still the switch in `/ops` (D-032): `self_serve`, `with_alyr` or `hidden`. **Nothing changes for any shop until the founder switches a type**, and the default stays `with_alyr`. What changes is that the switch can now be set to `self_serve` for an order type (it was refused: "no self-serve screens yet").

## The steps

`orders`: `products`, `handover`, `try`, `plan`, `golive`. (Appointments: `services`, `hours`, `try`, `plan`, `golive`.) The plan comes after the test, as in spec 022. Account and business details come before, as for every way.

Every step is a thin screen over an API that already exists, so nothing is built twice and the workspace's own screens stay the place for the rich version.

| Step | The owner does | It calls | Readiness check it feeds |
|---|---|---|---|
| `products` | Sees the type's sample items. **Keeps** one (it stops being a sample and goes live), changes its name or price, removes the samples, or adds their own items (name and price, up to a few). A link opens the Catalog for photos, sizes and the file import | `GET/POST /api/items`, `PUT /api/items/{id}`, `POST /api/items/{id}/adopt`, `POST /api/items/samples/remove` | `content` (one live item) |
| `handover` | Chooses **pickup**, **delivery** (a flat fee, free over an amount) or both, and **how customers pay**: cash, bank transfer, card machine. Paying online by card is not on this screen: it needs the shop's own payment account, so it is chosen later, in the go-live list, once that account is live (D-039: nothing unbuilt is shown) | `PUT /api/features/delivery_fees`, `PUT /api/delivery`, `PUT /api/orders-payment-ways`, `PATCH /api/onboarding/steps/payments` | `payments` |
| `try` | Plays their own customer on the private test line: asks for the menu, opens the real order page from the link, orders two items, places it, marks it ready and reads the confirmation. Ending the test cancels it and gives its stock back (ALY-168, next pull request) | the test chat, the order page, `POST /api/orders/{id}/status` | `test` |
| `plan`, `golive` | As today | as today | `price`, `paid`, `whatsapp` |

**Why there is no `hours` step for order businesses.** The order page does not read the shop's opening hours. When an item can be ordered is decided by **the item's own schedule** (windows, lead days, a cut-off: `modules/items/schedule.py`), and the type's starting notice rule (a bakery: one day, before 6 pm) is a starting value for new items, not a stored shop setting. Opening hours (`business_hours`) are read by bookings and by the Agent's charts, and the readiness check requires them only for bookings. So an hours screen would collect numbers nothing uses. It waits until something reads them (a "closed now" reply, an open/closed state on the order page), and a one-time notice and cut-off rule across the menu waits for a stored shop-level starting rule. Until then the Catalog's item form opens on the schedule for a bakery (`focus`), where each item's rule is set.

## What is new in the API

- `presets.py`: `way="orders"` for the five types, `STEPS["orders"]`, and `SELF_SERVE_WAYS = ("appointments", "orders")` so `core/pricing.py` (`type_settings`, `way_for`, `save_type`, `can_self_serve`) asks one question instead of naming appointments.
- `core/onboarding.py`: `create_business` does **not** file a setup request for the `orders` way and starts the business on `products`; `state()` carries the way's steps; `update()` accepts the new step keys (they come from `STEPS`).
- **No new endpoint and no migration.** `tenants.onboarding_way` is plain text, and every step writes through the existing APIs above. (ALY-168 adds `orders.is_test`, spec 028.)

## Rules

- **Nothing is hidden behind the way.** The same data the steps write is the data the workspace shows; an owner can leave `/start` at any step and the rest is in the workspace.
- **Resume:** the step is saved on the business (`onboarding_step`), so a refresh or a day later opens the same step.
- **Roles:** only the owner is in `/start`; the endpoints keep their own manager checks.
- **At a thousand shops:** every call is per shop, nothing is kept in a server's memory.
- **English and Arabic** for every word, phone first, light and dark; the words live in `copy.ts` against one type so a missing Arabic line fails the type check.

## Not in this spec

- **Money.** The setup fee for a self-serve client, when the first charge is taken, and the site's price text wait until the bank and payment side is done (founder, 28 Oct). The plan and pay steps stay as D-053 and PR #127 built them.
- **Terms and privacy at sign-up** (ALY-167), **resume reminders** (ALY-171) and **abuse controls** (ALY-220): what must be true before sign-up opens. Sign-up stays closed (`ALYR_SIGNUP_OPEN`) until then.
- **Opening hours and a notice and cut-off rule for order businesses** (see above): they wait until something reads them or a shop-level starting rule is stored.
- **Delivery zones** by area: the step sets a flat fee; zones are in the Catalog's Delivery screen.
- **Per-shop templates** (ALY-172) and the **first-week plan** (ALY-173): they wait on Meta and the commercial registration.
- **Wholesale and travel** keep the assisted path.

## Checks

`apps/api/tests/test_order_onboarding.py`: a bakery created on the `orders` way starts on `products` and no setup request is filed; an order type can be switched to self-serve in `/ops` and wholesale and travel cannot; the default for every type is unchanged; keeping a sample, adding an item, choosing pickup and delivery and choosing cash and transfer turn the readiness checks `content` and `payments` green; the way's steps survive a refresh (resume). The web steps are checked in a real headless browser with `scripts/order-onboarding-browser-check.mjs` (a new bakery through the real sign-up; at 375 px in English and Arabic, light and dark, and at 320 px: nothing scrolls sideways, every target is 44 px, every field has a name, axe finds nothing; unticking every sample turns Continue off with a reason; an own item with no Arabic name is refused in words; what Continue saves is read back from the API; the handover's choices survive a reload). `scripts/golive-truth-check.mjs` for every order type comes with the test order, when the way is switched on.
