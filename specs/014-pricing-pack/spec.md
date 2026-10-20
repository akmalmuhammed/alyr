# Spec 014: The pricing pack (discounts and coupon codes, delivery and pickup, cost price and margin)

Status: built in ALY-150 (a child of ALY-101), in three pull requests that stand on each other: **1. discounts**, **2. delivery** (this one carries parts 1 and 2), **3. cost and margin** (to follow). Decision: D-039, "As built (pricing pack)". It adds three switchable features to the feature engine (`specs/012-feature-engine/spec.md`); the Catalog it prices is `specs/001-catalog-engine/spec.md` (engine), `003` (price groups), `004` (WhatsApp), `005` (order page), `006` (import and export), `007` (reports) and `010` (ordering by code).

The audit of 18 Oct 2026 found the gaps this fills: only a dated sale price and customer-group prices existed; there were no coupon codes or cart discounts; an order carried `fulfil_on` and `table_label` and no delivery, no fee; an item had no cost, so there was no margin anywhere. For a bakery, a home kitchen, a shop and a fashion seller these are among the first things they ask for.

The founder's rule (18 Oct) holds: **one core system; everything specific to a kind of business is a switchable feature the founder can turn on later for a client; owners never see the word "capability".** The three are the registry's old extension points `discounts`, `delivery_fees` and `cost_margin`, now built, with plain words in both languages, **off by default for every shop and every template**, so no existing shop behaves differently (`tests/test_feature_engine_identical.py` is unchanged and green; the only test edits are the ones the new features force and are listed in the PR).

**This page is written pull request by pull request.** The sections of a pull request that is not yet built say so at their head.

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

## Not built in parts 1 and 2

"Buy N get M" across different items (a mixed basket); a coupon sent to a customer by name; a coupon's own page on the order page (a link that fills the code); a customer-facing "you could save" nudge; stacking a code with a price-group-only rule is allowed only when both are stackable.

No maps, no geocoding, no driver dispatch, no distance-based fees, no delivery slots by the hour; a coupon cannot discount the delivery fee.
