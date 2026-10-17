# Spec 001: Catalog engine (items, variants, stock, holds)

Status: built in ALY-102 (package 1 of the Catalog, ALY-101). Decision: D-039. The plan with the 30 scenarios is the Eraser file named there; this page is what the code does, so the next packages (ALY-103 to ALY-113) can build on it without reading all of it.

Nothing here is visible to an owner or a customer yet. No module is registered in `catalog.py`, so the Products screen and the navigation show nothing new; the Catalog's API answers where the `orders` module is switched on.

## Naming

An owner's sellable things are **items** in code (`modules/items`, not to be confused with `catalog.py`, which is ALYR's own product registry, D-027). The old `products` table was **renamed to `items`** in migration 0022 and kept its IDs; `order_items.product_id` became `item_id`. The order page still calls the same thing `product_id`, and `/api/products` still works, so nothing that reads them had to change.

## Tables (migration 0022)

| Table | Holds |
|---|---|
| `items` | name and description in both languages, category (text), price, sale price with dates, unit, pack size, minimum order, tags, status (`draft` `live` `hidden` `archived`), availability rule, `photo_id` (a slot; ALY-103 owns what it points at) |
| `item_categories` | the owner's order and Arabic name for a category; optional, items name their category in text |
| `item_variants` | every item has at least one: stock (`on_hand`), price difference, daily limit, `photo_id`. An item without sizes has one unnamed `is_default` variant, added by a trigger so any insert gets it |
| `item_option_groups`, `item_options` | a required choice (size) or priced extras (cheese), per item |
| `item_schedules` | when an item can be ordered (below) |
| `item_price_history` | every price an item has had, with who. Added and read, never changed |
| `stock_movements` | the stock log: `opening` `received` `sold` `cancelled_restocked` `wasted` `counted` `adjusted`, with who, when, why and the number after. Added and read, never changed |
| `variant_day_stock` | a daily-limit variant's allowance for one shop day: the total of that day's movements |
| `stock_holds` | stock taken for one order line: `held` (until `expires_at`), `committed` or `released` |

`order_items` gained a copy of the variant (`variant_id`, `variant_name`, `variant_name_ar`), the Arabic name, the chosen `options` (names and prices as ordered) and `fulfil_on`; `orders` gained `fulfil_on`. `shop_settings` gained `hold_minutes` (30) and `day_starts` (00:00). `payment_requests.status` gained `expired`. `activity.subject` gained `item`.

Every new table has `tenant_id`, forced row-level security and the isolation tests. An item that has been ordered cannot be deleted: `order_items.item_id` is `on delete restrict`, and the API archives it.

## Availability

One rule per item, and an optional schedule on top.

| Rule | Orderable when |
|---|---|
| `always` | live. Made to order, services. Has no switch |
| `switch` | live and `available` is on. What every existing product became, so shops behave as before |
| `count` | live, the switch is on, and a variant has stock |
| `daily_limit` | live, the switch is on, and the day's allowance is not used. A new shop day starts again from the limit, with nothing to run |

**Schedule.** Rows without dates are the usual week; a row with `valid_from`/`valid_to` (Ramadan, a holiday) replaces the usual week on those days; `closed` removes the item on them. An item is one of two kinds, told apart by its rows:

* ordered **now** (no `lead_days`, no `cutoff`): orderable while the shop's clock is inside a window (`opens` to `closes`, on its `weekdays`). The refusal carries `next_at`.
* ordered **for a date** (`lead_days` or `cutoff`): the customer chooses the day. The order must be placed `lead_days` before it and before `cutoff` on that day: "order before 6 pm for tomorrow" is `lead_days = 1`, `cutoff = 18:00`. Without a chosen day the earliest one is used. A day that is too late is refused with `after_cutoff` and `next_date`. A daily limit then counts against the day the order is for.

`pure rules`: `schedule.py` (no database), `availability.py`, `clock.py` (the shop's local clock and day start). Weekdays count from Sunday as 0, like `business_hours`.

## Stock (`stock.py`)

The number shown is the total of the log. One SQL statement changes the number only if it stays at zero or above **and** writes the log row (`update ... where on_hand + delta >= 0` inside a CTE that inserts the movement). So the last item sells once, and two people changing one item at once both count: each statement adds to whatever the number is by then. `on_hand` also has a `check (on_hand >= 0)`. `stock.mismatches()` compares every number to its log and should always be empty; the tests call it.

A shelf count (`counted`) records the difference from the system with a reason, and a count that agrees is recorded too.

## Checkout (`cart.py`, `orders/service.py`)

1. `cart.check` looks at every line and says what is wrong with each: for sale at all, schedule (and the date), which variant, required options, minimum order, enough stock (the same item on two lines is counted together), and the price the customer was shown (`expected_price`). It changes nothing. `POST /api/store/{slug}/cart/check` exposes it.
2. `create_order` refuses a cart with any bad line, answering **every** line, so the customer keeps the rest of the cart: `detail.lines[]` has `ok`, `code`, a sentence in English and Arabic, and the details to act on (`left`, `max_quantity`, `new_price`, `next_at`, `next_date`, `group_id`, `alternatives`).
3. It then takes the stock for all lines in one savepoint (`stock.reserve`), lines in a fixed order. A shortfall that appeared in between (another customer got there first) puts everything back and answers as in 2.
4. Only then is the order written, with a copy of each line's variant and options.

| Code | Status | Meaning |
|---|---|---|
| `unavailable` | 422 | not live, switched off, gone (the first order page's answer) |
| `sold_out`, `not_enough` | 409 | `left` and `max_quantity` say how many |
| `price_changed` | 409 | `old_price`, `new_price` |
| `not_now`, `closed`, `after_cutoff`, `not_that_day`, `past` | 409 | `next_at` or `next_date` |
| `variant_required`, `variant_unavailable`, `option_required`, `option_invalid`, `option_too_many`, `below_minimum`, `bad_quantity` | 422 | the line to fix |
| `over_limit`, `no_account` | 409, 403 | credit account, as before |

**Same as last time**: `POST /api/store/{slug}/orders/repeat` orders the customer's last order again. Lines that cannot be ordered are left out and named (`left_out`), the rest is ordered at today's prices (`price_changes` lists any that moved).

## Holds (`items/holds.py`, `orders/holds.py`)

A line of a **counted** item (rules `count`, `daily_limit`) gets a hold. A pay-link order is held for the shop's `hold_minutes`; a credit-account order is committed at once; payment (`ledger.complete_payment`) commits the hold. Orders with no counted stock hold nothing and never expire, exactly as before.

When a hold runs out unpaid, the order is cancelled, its stock goes back (`cancelled_restocked`), its payment link becomes `expired` (paying it answers 409) and the customer is told (the existing `order_cancelled` template outside the window). Three things make sure it happens after downtime: a job per order at its expiry (the job queue runs everything due when the worker starts); the job releases **every** expired hold in its shop, not only its own; and the worker sweeps every shop at start and every five minutes.

Cancelling an order (`orders/service.cancel_order`) returns the stock if the order was not made yet (`new`, `confirmed`); a `ready` or `done` order keeps its stock sold unless staff say `restock`. If it had been paid, the answer says `refund_due` and the activity record keeps `refund_due`: the shop refunds from its own payment account. A cancelled order cannot be moved on.

## API

Workspace (`routes/items.py`; owners and admins edit, everyone on the team flips switches, records stock and counts):

`GET/POST /api/items`, `GET/PUT/DELETE /api/items/{id}` (delete archives an item with orders), `POST .../status`, `POST .../switch`, `POST .../stock`, `POST .../count`, `GET .../stock-log`, `GET .../price-history`, `GET/PUT /api/items/categories`, `GET/PUT /api/items/settings`.

Kept working on the same items: `GET/POST /api/products`, `POST /api/products/{id}/availability`, `POST /api/orders/{id}/status`. Public: `GET /api/store/{slug}` (now also `unavailable`), `POST .../cart/check`, `POST .../orders`, `POST .../orders/repeat`.

## Decided in this package (inside D-039)

* The table is **renamed**, not extended beside, so one name means one thing.
* The Arabic name is required to go live through `/api/items`. `POST /api/products` keeps its first, permissive behaviour until the screens replace it.
* The first variant added to an item takes over the item's own stock (its default variant becomes that variant). Variants left out of a save are switched off, never deleted.
* An item's changes (created, edited, switched, archived) are on the activity record with who made them.

## Left for the other packages

* Photos: only the `photo_id` slots exist (ALY-103). Workspace screens, undo and bulk actions (ALY-104). The order page, search and share links (ALY-112): it must handle `expired` payments (the pay page knows only `pending` and `paid`), the `unavailable` list and `cart/check`.
* WhatsApp (ALY-106): staff commands, "tell me when it is back", telling waiting customers when a hold is released, telling the owner by message that a refund is due, a customer's own cancel entry point (the service takes `team.CUSTOMER`).
* Low-stock and sold-out alerts, meters and report lines (ALY-109). Import and export (ALY-108). Templates by business type (ALY-107).
* **Customer price groups for wholesale** are in release 1 (D-039) but in none of the packages' lists; they need a table and a customer field, and a package to own them. SKU and barcode numbers likewise.
* Cancelling an order that was put on a credit account does not reverse the ledger sale. That is how orders already worked; it is a separate issue.

## Acceptance

Scenarios 1 to 12, 18, 19, 21, 22, 27 and 29 of the plan pass as automated tests: `apps/api/tests/test_catalog_scenarios.py`, one test (or more) each, named `test_scenario_NN_...`. The model, rules and API are in `test_items.py` and `test_items_schedule.py`; the migration on a database that already has orders, run as a superuser and as an owner who does not bypass row-level security, is `test_catalog_migration.py`.
