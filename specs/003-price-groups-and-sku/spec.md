# Spec 003: Customer price groups (wholesale) and SKU

Status: built in ALY-127 (package 2b of the Catalog, ALY-101). Decision: D-039, release 1 ("customer price groups for wholesale"; the details this page fixes are in D-039's "As built (ALY-127)"). The engine under it is `specs/001-catalog-engine/spec.md` and the screens are `specs/002-catalog-screens/spec.md`. **This page is the contract the customer order page (ALY-112) builds on**: the section "For the customer's order page" lists every field it may read, and says which are stable.

Hidden until go-live like the rest of the Catalog: the routes answer where `orders` or `catalog` is switched on, the screens are inside the Catalog (module `catalog`, off for every shop), and nothing says "coming" or "beta".

## What it does

* A shop has **price groups** (Retail, Wholesale, Staff...), each with a name in English and in Arabic. Exactly one is the shop's **default**; every shop has it (the migration made it for the shops that existed, and one is made on first use for a shop created later). The default group **is** the normal price: it has no price rows of its own, it can be renamed and never removed.
* A **customer** (a contact) is in one group, or in none, which means the default. Staff set it (`PUT /api/price-groups/customers/{contact id}`); an import (ALY-108) writes `contacts.price_group_id` the same way.
* An **item**, or one of its sizes and colours, can have a **price for a group**. A group with no price for something pays the normal price, so a shop prices only what differs.
* The customer's group decides the price in the **order page**, the **cart check**, the **order** and the **payment link**. The order keeps a copy of the group's name and the price of every line, so changing a group, a price or a customer's group later never rewrites an old order.
* A **SKU** is an optional code on an item and on each size or colour, unique within the shop, searchable in the Catalog list, copied onto each order line and shown in the workspace's order list.

## Which price a customer pays

For one line (an item, a size if it has sizes, chosen extras), in this order, the first that applies:

1. the customer's group has a price **for that size** (an absolute price, replacing the item's price and the size's difference);
2. the group has a price **for the item**: that price **plus the size's price difference**;
3. the **normal price**: the sale price while a sale is on, else the price, plus the size's difference.

Then the extras the customer chose are added, as before. The default group, a customer in no group and a page opened with no customer always pay (3).

* **A group price replaces a sale price.** It is the price agreed with that kind of customer. A group without a price for the item pays the sale price like everyone else. (So a wholesale price above a retail sale price is possible; the owner sees both in the edit sheet.)
* Bulk price changes (`price_percent`) change the normal price only; group prices are absolute and stay as they are.
* A price is above zero; an item's group price plus a size's difference must stay above zero.
* A group is **archived**, never deleted, when it is removed: its customers go back to the default group (written on each customer's record), its prices and history are kept and no longer used, and its name can be used again.

## Tables (migration 0026)

| Table | Holds |
|---|---|
| `price_groups` | name, name_ar (both always filled: a group named in one language uses it for both), `is_default` (one per shop, partial unique index), `sort`, `archived_at`. Names are unique among groups in use, ignoring case |
| `item_group_prices` | group, item, optional variant, price. One row per (group, item) and per (group, variant) |
| `item_group_price_history` | every set or removal (price null) of a group price, with who and why. Added and read, never changed |
| `contacts.price_group_id` | the customer's group; null is the default group |
| `orders.price_group_id`, `price_group_name`, `price_group_name_ar` | the group the order was charged under, named as it was then (orders before groups have empty names) |
| `order_items.sku` | the size's SKU, else the item's, as it was when ordered |
| `items.sku`, `item_variants.sku` | the code, blank for none, at most 40 characters, one line |

Every new table has `tenant_id`, forced row-level security, a policy and the isolation tests (`tests/test_price_groups.py`, `test_tenant_isolation.py`). Grants: the app may read, add and change groups, and replace group prices; it may only read and add to the history. (It may delete from `price_groups` only because the demo shop's reset does; no route does.)

## SKU

* A SKU is trimmed and its inner spaces collapsed; blank means none; any number of items have none. Case does not matter: `ts-100` is `TS-100`.
* **Unique within the shop across items and sizes.** The unique indexes (`items_sku`, `item_variants_sku`) keep each table clean; the check across the two tables is in the app (`service._check_skus`), under a lock per shop, so two saves at the same moment cannot both take a code (tested). The refusal is `422 sku_taken` and names what has the code ("The SKU “TS-100” is already used by Shirt (Small)"); the same code twice inside one item is `sku_repeated`; over 40 characters is `bad_sku`.
* An **archived item keeps its SKU** (and a size switched off keeps its own): clear it on the old item to use it again. The refusal says which item has it.
* A form that leaves a size's `sku` out keeps the one it has; sending it empty clears it.
* The item list (`GET /api/items?q=`) matches the SKU of an item and of any of its sizes, as part of a code, ignoring case.

## API

### For the customer's order page (stable)

Only additions to what ALY-102 shipped; nothing was renamed or removed.

`GET /api/store/{slug}?c={contact id}` (the customer's link; without `c` the page shows the default group's prices). *Since ALY-112 the customer is identified by the signed token (`?t=`, or the header `X-Order-Link`; `token` in a request body), never by a contact ID: read `c` and `contact_id` below as that token (`specs/005-order-page-v2/spec.md`).*

| Field | Meaning |
|---|---|
| `group` | `{id, name, name_ar, is_default}`: the group whose prices this page shows |
| `products[]`, `unavailable[]` | as before, plus below |
| `products[].price`, `price_text` | **what this customer pays for the item** (their group's price if it set one, else the normal price) |
| `products[].price_source` | `"group"` when the group set the price, else `"normal"` |
| `products[].normal_price`, `normal_price_text` | only when `price_source` is `"group"`: what the default group pays |
| `products[].list_price` | a price to show crossed out: the usual price while a sale is on, or the normal price when the customer's group pays less than it; else null |
| `products[].sku` | the item's code, `""` for none |
| `products[].variants[]` | as before, each with `price` (this customer's price for that size, **already including** the size's difference), `price_source`, `normal_price` (only for a group price) and `sku` |

`POST /api/store/{slug}/cart/check` takes the cart as before and now also **`contact_id`** (optional; without it the default group's prices). The answer is as before plus `group` (as above). Each line that is `ok` also has `price_source` (`"group"` or `"normal"`), and a line priced by a group has `normal_unit_price` and `normal_unit_price_text`. `unit_price`, `line_total` and `total` are the customer's own.

`POST /api/store/{slug}/orders` and `POST .../orders/repeat` take `contact_id` as before; the customer's group decides every price and the answer gains `price_group: {id, name, name_ar, is_default}`. A line's `expected_price` is compared with **the customer's own** price: if staff moved the customer to another group after the page was drawn, the order is refused with `price_changed` and the new price, like any other price change. The payment link's amount (`GET /api/pay/{shop}` with the pay link's token → `amount`) is the order's total, so it is the group's. `GET /api/track/{shop}` with the tracking link's token shows the lines as charged.

Not stable, and not for the page: the `id` of a group is not a secret but a page must not offer a choice of group; the group comes from the customer. Knowing a customer's link (`?c=`) is what shows their prices, as it already is what lets them order on credit (the order link is a capability, D-016).

### For the workspace

`/api/price-groups` (owners, admins and agents may read; owners and admins write):

| Call | Does |
|---|---|
| `GET /api/price-groups` | `{groups: [{id, name, name_ar, is_default, sort, customers}], can_manage}`, the default first |
| `POST /api/price-groups` | `{name, name_ar}` (at least one) → `{group}`. 422 `price_group_name_taken`, `price_group_name_needed`, `price_group_name_long`, `too_many_groups` (20) |
| `PUT /api/price-groups/{id}` | rename (the default too) |
| `DELETE /api/price-groups/{id}` | archive; `{moved}` customers went to the default group. 422 `default_group` for the default |
| `PUT /api/price-groups/customers/{contact id}` | `{group_id}` (null or the default's id: the default). 404 for a customer this shop does not have; 422 `unknown_group` |

`/api/items`: an item has `sku` and `group_prices` (`[{group_id, variant_id, price, price_text}]`, groups in use only); a size has `sku`. `POST`/`PUT /api/items` take `sku` (null or empty clears) and `group_prices` (`[{group_id, variant_id, price}]`: the rows listed are set, a `price` of null removes one; saved in the same transaction as the item, so one refusal undoes the whole save), and a variant takes `sku`. Also `GET`/`PUT /api/items/{id}/group-prices` and `GET /api/items/{id}/group-price-history`. Refusals: `default_group_price`, `unknown_group`, `unknown_variant`, `bad_group_price`, `repeated_price`, and for codes `sku_taken`, `sku_repeated`, `bad_sku`. Editing needs the right to edit items; a group's own settings need an owner or admin.

`GET /api/orders` (workspace): each order has `price_group: {name, name_ar, is_default}` (null before groups) and each line `sku`, `price`, `price_text`. `POST /api/orders/{id}/status` is unchanged. `GET /api/inbox/conversations/{id}`: `customer.price_group_id` (null: the default). A customer's change of group is on their record as the action `price_group` (`{from, to}`).

## Screens (inside the Catalog, `specs/002-catalog-screens/spec.md` has the rest)

* **Edit sheet:** a SKU field under the names; a SKU field on each size or colour; a "Prices by group" part (closed until something is set) with one card per group in use: the price for the item (the normal price is shown as the hint) and, for sizes already saved, one price each. A field left empty means the group pays the normal price. The History part also lists the group prices' changes.
* **Catalog settings:** "Customer price groups": the default group (renamable, not removable) and the others with their customer counts; add, rename, remove (the confirmation says how many customers go back to the default).
* **Where staff edit a customer:** the workspace has no customer-details screen yet (contacts and labels, ALY-53, are not built). The only place a customer's own record is changed is the header of the conversation in the inbox (who handles it, open or closed), so a **price group** picker is there, shown when the shop has more than one group, read-only for agents.
* **Orders list:** a pill with the group's name for an order not charged the default group, and the SKU beside each line.
* The list and the cards show the SKU in small type. English and Arabic with right-to-left, light and dark, phone width first; every word is in `catalogCopy.ts` (the inbox picker's and the order list's two words are in `Screens.tsx`'s own two languages). The Arabic is a draft until ALY-66.

## How it is checked

`apps/api/tests/test_price_groups.py` (27 tests, PostgreSQL, HTTP): the default group; both names; who may manage; module gating; removing a group; a customer's group on their record; **a wholesale and a retail customer ordering the same item at the same moment are each charged their own price and the order shows the group**; fallback to the normal price (an item, a size, a sale); the page, the cart check, the account order, the pay amount and "same as last time"; an order keeps its price, SKU and group name after everything changes; history; refusals; **two shops cannot see each other's groups or prices** (at the database and through the API); SKU rules, the race between two saves, search, the order's copy; the migration on a database that already has shops and orders, as a superuser and as an owner that row-level security applies to.

`scripts/catalog-browser-check.mjs` (headless Edge, 375 px, English and Arabic, 80 checks each; axe-core finds nothing on the settings sheet, the prices by group or the conversation header): the SKU fields, a group added, refused when repeated and renamed in the settings, a price for the group on an item and a size (saved and shown again), a customer put in the group from the conversation, their order page showing the group's price and another customer's the normal one, and the order list showing the group and the SKU.

Not checked: a real phone or on-screen keyboard; the Arabic by a native speaker; a shop with hundreds of groups' worth of customers (the limit is 20 groups); import (ALY-108) and export of SKUs and group prices.

## Left for other packages

The customer order page (ALY-112): a wholesale layout (the fields above), showing the SKU, and offering sizes (the current page ignores them). Import and export with SKU and group columns (ALY-108). The template per business type that asks for a SKU (ALY-107). A contacts screen with the group on it (ALY-53). Barcodes (not in release 1, D-039).
