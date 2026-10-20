# Spec 014: The pricing pack (discounts and coupon codes, delivery and pickup, cost price and margin)

Status: built in ALY-150 (a child of ALY-101), in three pull requests that stand on each other: **1. discounts**, **2. delivery**, **3. cost and margin**. Decision: D-039, "As built (pricing pack)". It adds three switchable features to the feature engine (`specs/012-feature-engine/spec.md`); the Catalog it prices is `specs/001-catalog-engine/spec.md` (engine), `003` (price groups), `004` (WhatsApp), `005` (order page), `006` (import and export), `007` (reports) and `010` (ordering by code).

The audit of 18 Oct 2026 found the gaps this fills: only a dated sale price and customer-group prices existed; there were no coupon codes or cart discounts; an order carried `fulfil_on` and `table_label` and no delivery, no fee; an item had no cost, so there was no margin anywhere. For a bakery, a home kitchen, a shop and a fashion seller these are among the first things they ask for.

The founder's rule (18 Oct) holds: **one core system; everything specific to a kind of business is a switchable feature the founder can turn on later for a client; owners never see the word "capability".** The three are the registry's old extension points `discounts`, `delivery_fees` and `cost_margin`, now built, with plain words in both languages, **off by default for every shop and every template**, so no existing shop behaves differently (`tests/test_feature_engine_identical.py` is unchanged and green; the only test edits are the ones the new features force and are listed in the PR).

## Money: one set of rules (all three parts)

* **Units.** Every amount is a whole number of minor units (dirhams, 100 to the riyal) in `bigint`, as everywhere in ALYR (`fmt_qar`). A percentage is `numeric(6,3)` in SQL and `Decimal` in Python. **No float touches an amount**: `totals.line_total` refuses one. (The brief asked for "numeric in SQL" for money; the whole database stores money as integer minor units, which is exact and what every report and the payment amount already read, so the new columns follow it. A percentage is numeric.)
* **Quantity.** A line's price is `round_half_up(Decimal(quantity) * unit_price)` (`totals.line_total`). Today a quantity is an integer, so it is the product. When the exact-decimal quantities of spec 013 merge, this one function is the only place that changes, and the property test already runs with decimal quantities.
* **The one rounding rule.** *A percentage is worked out once per rule, on the amount it applies to, and rounded half up to a whole dirham. That whole discount is then shared among the lines it covers by largest remainder* (ties to the earlier line), so the lines add up to it exactly and no line takes off more than it costs. It is not rounded line by line: three lines of 5 dirhams at 50% off are 7.5 in all, so 8 off, shared 3 + 3 + 2; rounding each line would have given 9, more than was worked out. `tests/test_pricing_totals.py` has this case.
* **Order of things.**
  1. An item's price is what the Catalog says: the sale price while a sale is on, or a customer price group's price (**a group's price replaces a sale price**, spec 003: it is the price agreed with that kind of customer), plus the extras the customer chose. *The brief wrote "the better of sale and group price"; the merged rule is "the group's price replaces", and changing it would change what existing shops charge, so it is kept and said here. Say if you want it changed.*
  2. Discounts come off the goods, one rule after another, each on what the ones before left.
  3. Delivery is added; it is never discounted. (Part 2.)
  4. `total = subtotal - discounts + delivery fee`. The order stores all four and a database check keeps them honest (`orders_total_adds_up`).
* **Floor.** The goods are never taken below QAR 1 (or below the goods themselves if they cost less than QAR 1): a discount can make an order cheap, never free, never negative.
* **What is shown is what is charged.** One function prices a cart for the order page's review, the chat's draft and the order itself (`modules/orders/totals.py`, called through `orders.service.price_cart`). The page sends the total it showed (`expected_total`); an order that now comes to something else is refused with the new figures (`total_changed`) instead of charging more or less than was shown. The payment request, the ledger entry on account and the customer's message all use the stored total. Tests: the property test (4,000 random carts with random rules, decimal quantities, delivery) and the end-to-end tests in `test_discounts.py`.

## 1. Discounts and coupon codes (pull request 1, migration 0040)

Feature `discounts` ("Discounts and coupon codes", «الخصومات ورموز القسائم»). Off: invisible and inert everywhere. Every route answers `422 feature_off`; the order page and the chat know nothing of codes; rules that exist are kept and do nothing; no report line.

### The rules

`discount_rules`, forced row-level security. A rule is a **coupon** (a code the customer types) or **automatic** (needs no code). It gives a **percentage** (more than 0, at most 100, up to three decimals), a **fixed amount**, or **"buy N, get M free"** (every N + M units, M are free; per line, whole units, no rounding). It applies to **the whole order** or to **chosen items and categories** (a category matches in any case). It can have a **minimum order** (judged on the goods before any discount), a **total limit** and a **limit per customer**, a **start and an end**, **a price group it is only for**, and whether it is **stackable**.

* **Codes.** Capitals, Western digits, no spaces, 3 to 24 letters or numbers (Arabic letters allowed). Matching forgives case, spaces, dashes and Arabic spellings: «ramadan 10», «RAMADAN-10» and «Ramadan10» are one code, and one shop cannot hold two of them (`code_key`, unique). A code that has been used cannot be renamed.
* **States** the owner sees: scheduled, active, paused, used up, ended. *Ending* is for good (it sets the end to now); a copy starts a new one. A paused rule can be resumed; an ended one cannot.
* **Limits.** The total limit can never be set below the uses it already has. The database checks `uses <= usage_limit` itself.

### Which rules apply

Every automatic rule and every code the customer typed (at most three per order) is a candidate. A candidate must be open (active, started, not ended, uses left, the customer's group, the customer's own limit), cover something in the cart, and meet its minimum. **Two applied rules must both be stackable**; otherwise the combination that takes the most off wins, ties going to the customer's own code and then to fewer rules. A stackable pair applies one after the other, each on what is left (10% then 10% of 100.00 takes 10.00 then 9.00). A code that loses says why in plain words ("This code cannot be used together with TWENTY20."). A rule that would take nothing off is not applied and says so.

### Reasons, in both languages

`coupon_unknown`, `coupon_paused`, `coupon_not_started`, `coupon_ended` ("This code ended on 3 Mar."), `coupon_used_up`, `coupon_used_by_you`, `coupon_group`, `coupon_no_match`, `coupon_minimum` ("Minimum order QAR 100 for this code."), `coupon_not_combined`, `coupon_no_effect`, `coupon_too_many`, `total_changed`. All the sentences are in `modules/items/discount_text.py`, built from the code and its details, so a screen that acts on the code and one that only shows the sentence never disagree. Dates are the shop's wall clock; money is «QAR 100» in English and «100 ر.ق» in Arabic.

### Using a rule: race-safe

Placing an order claims each applied rule inside the order's own transaction (`discounts.claim`): `update discount_rules set uses = uses + 1 where id = $1 and status = 'active' and (usage_limit is null or uses < usage_limit) and (ends_at is null or ends_at > now)`. Two orders for the last use meet at the row lock; the loser matches no row and is refused with `coupon_used_up`, and its whole order (stock included) is rolled back. A customer's own limit is counted after the row lock, so two simultaneous orders of one customer cannot both slip under it. Rules are claimed in a fixed order so two orders using two codes cannot deadlock. **Cancelling an order** (the customer, staff, or the hold running out: one door, `orders.service.cancel_order`) marks its discount rows returned and gives the uses back once.

### On the order (a snapshot)

`orders.subtotal` and `orders.discount_total`; `order_items.discount` (what came off each line); `order_discounts` (one row for each rule used: code, name, the rule in words in both languages, its type and numbers, the amount). Nothing is read back from the rule, so editing, pausing or ending a rule never rewrites an order. `subtotal` is null on an order made before this (it then equals the total). The workspace's orders list, the tracking page and the customer's confirmation message show the discount; an order without one reads exactly as before (the extra keys are absent, not zero).

### Where the customer meets it

* **Order page**: a coupon box in the review (Part 1 web), the discount line by line and in the total before payment, each code's verdict with its reason, an automatic discount named as an offer on the page (`GET /api/store/{slug}` gains `pricing.discounts.offers` only while the feature is on).
* **API**: `POST /api/store/{slug}/cart/check` and `/orders` take `coupons` (and `/orders` takes `expected_total`); the check answers with `pricing` (`subtotal`, `discounts`, `discount_total`, `goods`, `coupons` with `ok`, `reason`, `message`, `message_ar`) and each line with `discount` and `line_total_after`.
* **Chat**: «coupon RAMADAN10», «use promo code RAMADAN10», «كوبون رمضان10», «عندي كود خصم RAMADAN10», in any order with filler words; the code goes into the draft, the draft shows "Items", "Discount (CODE): -QAR 20" and the total, the order is placed at that total (`wa_coupon.py` reads, `wa_order.py` decides). A code typed before any item is kept. A code that ends while the customer decides is dropped and said. Words that merely mention a discount ("can I get a discount") are not taken for a code. With the feature off a message with a code word is nobody's business and goes where it always went.

### Owner API and screen

`/api/discounts` (owners and admins only, reading too: the list holds how much was given away): `GET` (every rule with state, uses, `given`; `given_total`), `POST`, `PUT /{id}`, `POST /{id}/pause|resume|end`. Every change is on the activity record (`discount_added`, `discount_changed`, `discount_paused`, `discount_resumed`, `discount_ended`). The Catalog gets a **Discounts** screen when the feature is on.

### The weekly report

One line in the Catalog section, only while the feature is on and something was given: *Discounts given this week: QAR 120 on 6 orders (RAMADAN10 4, EID25 2).*

## 2. Delivery and pickup (pull request 2, migration 0041)

Feature `delivery_fees` ("Delivery and pickup", «التوصيل والاستلام»). Off: invisible and inert everywhere; every `/api/delivery` route answers `422 feature_off`; the order page, the chat and the orders list know nothing of it; no report line; an order made with it off has `fulfilment` null and no fee. **No maps, no geocoding, no driver dispatch:** a customer chooses pickup or delivery, picks an area from the shop's list and writes the address in words.

### The shop's settings

* **Pickup** on or off and **delivery** on or off (`delivery_settings`). At least one stays on (`need_one`); delivery on needs a zone or a flat fee to charge by (`need_fee`).
* **Zones** (`delivery_zones`): a name in English and Arabic, a **fee**, a **free-over** amount (delivery is free once the goods *after discounts* reach it), a **minimum order** (also judged on the goods after discounts), optionally **the days it delivers on** (Sunday is 0; empty is every day) and a **daily cut-off**. At most 30. A zone taken away is archived, never deleted (orders keep its name as it was), and the last place a shop delivers to cannot be archived while delivery is on and there is no flat fee (`last_zone`).
* **The flat fee** is one fee for the whole shop. With no zones it *is* the delivery ("Delivery"); with zones it is the last choice, "Other areas". The owner screen: Catalog, Delivery. Everyone on the team may read it; owners and admins change it; every change is on the activity record.

### What the customer is offered and charged

At review the customer chooses (when both are offered; with one way only nobody is asked), then an area (the list shows each fee, "free over QAR 200", the days and the cut-off), writes the address (needed for the order, not for the review) and, if they like, a note. **The fee is its own line** after the discounts, with the zone's name, and is never discounted; `total = subtotal - discounts + fee`. The goods keep their QAR 1 floor; the fee is on top.

* **The delivery day** is the first allowed day that is not before the day the goods are ready (a made-to-order item's date), honouring the cut-off: an order placed after the cut-off is delivered from the next delivery day. It is shown to the customer and kept on the order (`delivery_on`). A zone with no delivery day in the next fortnight is refused (`delivery_no_day`).
* **Refusals**, in both languages: `fulfilment_required`, `pickup_off`, `delivery_off`, `zone_required`, `zone_unknown`, `address_required`, `delivery_minimum` ("Delivery to Al Wakra needs an order of at least QAR 150."), `delivery_no_day`. The review shows them beside the choice and keeps Pay off; the order refuses with 422.
* **On the order** (a snapshot): `fulfilment` (`pickup`/`delivery`), the zone's id and its name in both languages as they were, the address, the note, the day, the fee. The database keeps `total = subtotal - discount_total + delivery_fee` and refuses a pickup with a fee or an address. The workspace orders list, the tracking page, the customer's confirmation message (inside the 24-hour window; the approved template carries the total, which includes the fee) and **documents made from the order** (a delivery line, and each line's discount) show it.
* **Chat**: placing asks "Pickup or delivery?" with two buttons, then the area as a list message (each with its fee), then asks for the address as an ordinary message, then shows the draft with the fee, the address, the day and the total, and Place order places it at that total. A one-area shop skips the list; a one-way shop skips the first question. Saying "pickup" or "delivery" again changes the choice. Everything in English and Arabic.
* **The "Order on WhatsApp" link** (readable mode) carries the choice in the message; the codes-only mode, which the chat reads, is unchanged.
* **Report**: *Deliveries this week: 2 orders, QAR 30 in delivery fees (1 pickup).* A cancelled order is not counted.

## 3. Cost price and margin (pull request 3, migration 0042)

Feature `cost_margin` ("Cost price and margin", «سعر التكلفة والهامش»). Off: no cost route answers (`422 feature_off`), no field, no column, no report line, and an order keeps no cost.

### Who sees it: owners and admins only

**Agents never see a cost or a margin, and neither do customers.** It is kept in two ways. *Where it lives:* costs are in `item_costs`, `item_cost_history` and `order_item_costs`, not in the tables of items, sizes and order lines, whose rows are listed, copied and sent to staff and customers in many places; only `modules/items/costs.py` and the owner-only routes read them (a test fails if another file starts to). *Where it is shown:* every route in `routes/costs.py` answers 403 to anyone who is not an owner or admin whether or not the feature is on; the item save answers `cost_warnings` to managers only; the export, the template and the import's plan carry the column only for a manager of a shop that keeps costs, and a manager's import preview opened by an agent is recomputed without it; the weekly report goes to the owner and the admins, not to staff numbers (the WhatsApp card is made from other figures). `tests/test_cost_leaks.py` puts a recognisable cost in a shop and walks 35 places an agent can read, the export and template as an agent, an agent's upload with a cost column, a manager's preview opened by an agent, the customer's pages and API, the chat's cards and every message the shop ever sent, looking for the number and for the words that carry it.

### The cost

* A cost is per unit, in dirhams, for the item and, where a size or colour costs something else, for it; a size with no cost of its own costs what the item costs. History is kept like the price's (who, when, why).
* **Margin** of a unit = the price now (the sale price while a sale is on, the size's difference included) minus the cost; as a share of the price, rounded half up to one decimal. Priced extras ("cheese") are not counted: their cost is not kept, so a line's margin treats them as nothing, and the screens say extras are not included.
* **A price under the cost is a warning, never a block**: the item save and the cost save answer with the message in both languages ("The price QAR 50 is below what it costs you (QAR 60). You can still save it.").
* **Stock valuation** on the Stock tab: counted stock x cost, one number, and how many items have stock and no cost kept (not in the number).
* **Files**: a last column "Cost price (QAR)" in the export and the template; an import can set an item's cost or a size's (an empty cell keeps what there is; a value equal to what the size already costs does nothing, so a round trip changes nothing and sizes keep following the item); the preview shows "Cost price: QAR 40 → QAR 45.50"; the undo puts costs back unless they were changed since.

### On an order, and in the report

An order keeps what each unit cost when it was placed (`order_item_costs`), so its margin stays right when the cost or the price changes later. An order placed while the feature was off has none and is left out of every margin, and said to be. **An order's margin** = what the goods brought in after discounts less what they cost then (delivery fees are not margin); owners see it on each order in the workspace (`GET /api/orders/margins`), flagged "some items have no cost kept" when it is incomplete. **The weekly report** (owners and admins) gains: *Estimated gross margin: QAR 1,240 (31.0%) on 18 orders*; *N orders had items with no cost kept, so those items are not in the margin*; *Sold for less than they cost: ...*; *Low margin (under 10%): ... (5.0%)*. A cancelled order is not a sale.

## Where the three meet the Catalog's other rules

* **A shop needs the Catalog's order page.** These features act only where the `catalog` module is on (every shop but travel and documents since ALY-113). A shop that still has the older order page (orders without the Catalog) is never given a discount, a fee or a cost it could not show: for it all three are off, whatever was switched (`features.PRICING_PACK`).
* **Price groups, sale prices, extras** are the Catalog's (spec 003): decided first. **Stock and holds** are untouched: a discount does not change the stock taken.
* **Cancelling** an order gives back a coupon use once, keeps its delivery and discount snapshot, and (as before) takes its sale off a credit account at the order's total.
* **The ledger and the payment** always use the stored total. **Documents** made from an order (ALY-139) carry each line's discount and a delivery line, so the paper adds up to the order.
* **Templates made in the back office** can switch any of the three on for every shop made from them (the registry lists them).

## How it is checked

* `tests/test_pricing_totals.py`: the rounding rule, sharing a discount among lines, the floor, scope, minimum, buy-N-get-one (also with decimal quantities), every reason, stacking and its tie-breaks, delivery free-over, and a property test of 4,000 random carts with random rules.
* `tests/test_pricing_property.py`: 60 random carts with random codes and delivery through HTTP and PostgreSQL: what was shown = what was stored = what the payment asks for, and `total = sum(line prices x quantities) - sum(line discounts) + fee`.
* `tests/test_discounts.py`: off and inert; a coupon end to end with its snapshot; every refusal in both languages; the order refused and nothing changed; the races (the two orders for the last use; eight for three; one customer's two orders; the conditional update alone, with the lock watcher proving the two met); cancelling (the customer, staff, the hold running out); the owner's rules; the activity record; the report line; the chat in English and Arabic; the back-office template.
* `tests/test_delivery.py`, `test_delivery_migration.py`: the fee rules, the cut-off and days, discounts together, the snapshot, the chat, the report, the migration with data.
* `tests/test_cost.py`, `test_cost_files.py`, `test_cost_leaks.py`, `test_cost_migration.py`: the cost, margin and history; warnings; order snapshots; valuation; the report; files and their undo; who sees what.
* `tests/test_discounts_migration.py`, `test_delivery_migration.py`, `test_cost_migration.py` build a database up to the previous migration, fill it with shops, items and orders, apply the migration (as a superuser and as an owner that does not bypass row-level security) and check that nothing existing changed.
* `tests/test_documents_pricing.py`: a receipt for a discounted, delivered order adds up.
* **Nothing existing behaves differently.** `tests/test_feature_engine_identical.py` and its golden file are unchanged and green. The tests that had to change are listed in the pull request and each is one of: a test that used "discounts" as its example of a feature that is not built (it uses `bundles`), a test that said every feature is on by default (the pricing pack is off), the migration test's list of features added after it, and the export tests' column list (the cost column is added to a file after the usual ones, only for managers).
* Browsers: `scripts/pricing-browser-check.mjs`, `scripts/delivery-browser-check.mjs`, `scripts/cost-browser-check.mjs` (headless Edge, 375 px, English and Arabic, light and dark, axe-core).

## Not built, not checked

Buy N get M across different items; a coupon sent to a customer by name or in a link; a "you could save" nudge; a delivery fee by distance, a map or live driver tracking; a time slot for delivery; the cost of priced extras; a supplier or batch cost; cost in the WhatsApp staff commands; the margin on the home screen. Not checked: a real phone and on-screen keyboard; the Arabic by a native speaker (ALY-66); Meta (nothing was sent or submitted: no new template); a real gateway; the decimal quantities of spec 013 (the arithmetic is written for them and tested with decimals, but the integer columns are the ones on main).
