# Spec 013: Decimal and weight quantities ("Sold by weight or volume")

Status: built in ALY-149 (a child of ALY-101), the first Catalog feature pack, in two pull requests: the first holds the storage, the stock engine, the checkout and the API; the second holds the screens and the WhatsApp chat. Decision: D-039, "As built (decimal quantities)". The Catalog it extends is `specs/001-catalog-engine/spec.md` (engine), `005` (order page), `006` (files), `010` (order by code) and `012` (the feature engine, which this is the first pack of).

Until now every quantity was a whole number and the unit `kg` was a label. A customer could not order 0.5 kg of dates, 250 ml of oud or a 1.5 kg cake, and a shop could not hold 12.5 kg. That blocked bakeries, grocers, perfume and oud shops, flowers and jewellery by the gram, fabric by the metre: anything loose. The founder's rule for packs like this one: **one core system; everything specific to a trade is a switchable feature; a shop that does not use it behaves identically.**

## What a customer and an owner get

* A feature **Sold by weight or volume** (`decimal_quantity`, group "Sizes, choices and prices"): *let customers order 0.5 kg or 250 ml.* **A new shop** of the **grocery** or **bakery** built-in type starts with it on; a new shop of any other type starts with it off, including "Shop & retail" (a perfume or oud shop switches it on in Features, one switch, or a template made in the back office starts with it on). **Every shop that exists keeps its form**: migration 0039 writes `decimal_quantity` OFF for each of them, so nothing about an existing shop changes until its owner switches the feature on.
* A **unit** on each item: piece, pack, box, portion, hour (counted, whole numbers, as before) and the **measures** kg, g, litre (`l`), ml, metre (`m`) and tola. The first six keys are the ones stored since migration 0022; `g`, `l`, `ml`, `m` and `tola` are new (`l` and `m` are the keys the Documents engine uses).
* A **step** and a **smallest order** on each item sold by a measure: *sold in steps of 0.25 kg, at least 0.25 kg.* Nothing new is stored: they are the item's `pack_size` and `min_order` columns, which are now decimals. A measure with no step is sold in whole units, exactly as a kg item was.
* On the **order page**: a stepper that moves by the step, **quick quantities** (0.25 / 0.5 / 1 for kg and litre; 100 / 250 / 500 for g; 50 / 100 / 250 for ml; 0.5 / 1 / 2 for metre and tola, those that the item's step and minimum allow) and a typed amount. The item says "per kg". The cart, the review, the tracking page and the WhatsApp messages say "0.5 kg".
* In **stock**: received, wasted, counted and adjusted take decimals (`12.5`), the log shows them, low-stock numbers and alerts say "3.5 kg left".
* In the **chat**: an item code with a quantity: `214 x0.5`, `214 ×٠٫٥`, `214 x 0,5`; staff: `stock dates 12.5`.

## Quantities are exact

| Where | Type |
|---|---|
| PostgreSQL | `numeric(14,3)`: three decimals, never a float |
| Python | `int` when whole, `Decimal` (no trailing zeros) when not: `modules/items/qty.py` `norm`. The database connection reads every `numeric` that way (`db.py`), so stock `3` is the Python `3` it was before, and `12.5` is `Decimal('12.5')`. A float given to a `numeric` parameter raises. |
| JSON, out | a number: an integer when whole (`3`), else a decimal number with at most three places (`0.5`, `12.25`), never an exponent, never a string |
| JSON, in | a number **or** a string (`"0.5"`, `"٠٫٥"`, `"0,5"`); integers keep working; a number is read by its decimal text (0.1 is 0.1); more than three places is refused (`too_many_places`). `quantity_field(...)` in `qty.py` is the one request type |
| Web | thousandths as whole integers (`Math.round(n * 1000)`); no floating-point arithmetic on a quantity or an amount; typed text is read by `readQty` |

Where quantities appear in the API: `quantity` on cart lines, order lines, order items; `on_hand`, `left`, `daily_limit`, `low_stock_at`, `opening_stock`, `counted`, `delta`, `balance_after` on stock; `pack_size`, `min_order` on items. All follow the table.

## The units (`qty.py`, `UNIT_LIST`)

| Key | English | Arabic | Short (English / Arabic) | Fractions |
|---|---|---|---|---|
| piece, pack, box, portion, hour | Piece, Pack, Box, Portion, Hour | قطعة، عبوة، علبة، حصة، ساعة | none | no |
| kg | Kilogram | كيلوغرام | kg / كغ | yes |
| g | Gram | غرام | g / غ | yes |
| l | Litre | لتر | L / لتر | yes |
| ml | Millilitre | مليلتر | ml / مل | yes |
| m | Metre | متر | m / م | yes |
| tola | Tola | تولة | tola / تولة | yes |

The Arabic is a draft until ALY-66. A counted unit carries no suffix ("3 x Dates", as ever). A measure carries its unit **when the item is sold in fractions** (its step or smallest order is a fraction, `quantity.show_unit`: "0.5 kg", «0.5 كغ», and "1 kg" for the same item); a kilo item sold in whole numbers reads "3" as it always did, so no existing item changes how it reads. A quantity that is itself a fraction always carries its unit. Digits are Western in both languages, with a point for the decimal mark, no thousands separator in a line ("12.5", "1250"), as the rest of the workspace. One helper writes a quantity: `qty.fmt` / `qty.with_unit` in Python, `fmtQty` in `_customer/qty.ts`.

## One rounding rule

A line costs **the price of one times its quantity, rounded half up to a whole dirham, once per line**; an order's total is the sum of its rounded lines; its ledger entry, its payment link and the weekly report use that total. `qty.line_total(price, quantity)` is that rule and nothing else may compute a line (the web's `lineTotal` is the same rule in thousandths integers, tested against a table shared with the API). The Documents engine rounds the same way (`modules/documents/money.py`), so an order and the invoice made from it agree to the dirham. SQL sums use `round(price * quantity)` (PostgreSQL rounds a numeric half away from zero, which is half up for amounts above zero).

Table (price of one in dirhams, quantity, line): 1250 x 0.333 = 416.25 -> 416; 1250 x 0.5 = 625; 333 x 0.5 = 166.5 -> 167; 199 x 1.5 = 298.5 -> 299; 1 x 0.499 = 0.499 -> 0; 1 x 0.5 = 0.5 -> 1; 4999 x 2.25 = 11247.75 -> 11248.

## Rules (`qty.check_range`, `qty.check_lots`)

For each cart line, in this order, with the item's unit, step (`pack_size`) and smallest order (`min_order`):

| Code | When | Sentence (English) |
|---|---|---|
| `bad_quantity` | a counted unit: zero, negative, over 999, more than three decimals | Choose a quantity of X between 1 and 999. (unchanged) |
| `bad_amount` | a measure: the same | Choose a quantity of X above zero, up to 999. |
| `not_whole` | a fraction of a counted unit | X is sold by the whole piece. Choose a whole number. |
| `below_minimum` | under the smallest order | The least you can order of X is 0.25 kg. |
| `off_step` | a measure that is not a whole number of steps | X is sold in steps of 0.25 kg. Choose 0.75 kg. |
| `not_pack_multiple` | a counted unit sold by the pack (unchanged) | X is sold in packs of 6. Choose 12. |

A measure with no step is sold in whole units (`off_step`, "steps of 1 kg"): an owner opts an item into fractions by giving it a step. The item's `quantity` object (`rules`) tells the page: `{measure, step, min, fractions, chips}`.

## Storage (migration 0039)

Order lines, stock holds, the stock log (`delta`, `balance_after`), a day's allowance, a size's `on_hand` and `daily_limit`, an item's `pack_size`, `min_order` and `low_stock_at`, and the shop's and the templates' `low_stock_at` become `numeric(14,3)` with the value they had. `min_order >= 1` becomes `> 0` (0.25 kg is a smallest order). `order_items.unit` keeps the unit a line was ordered in and `unit_shown` whether it is written beside the quantity (false for every older line, which reads as it always did). The unit lists widen (`g`, `l`, `ml`, `m`, `tola`), and the documents' list gains `ml` and `tola`. Constraints: the database refuses a fraction on a counted unit in an item's step and smallest order and in an order line (check constraints), and in a size's stock and daily limit and a day's allowance (a trigger that looks the item up only when a fraction is written). Stock is still never below zero; the stock engine is unchanged in shape: one conditional `UPDATE` moves the number and writes the log row in the same statement. Row-level security is untouched; no table is made or dropped. Safe on a populated database: tested on a database built to 0037 with orders, holds and a stock log (`tests/test_decimal_migration.py`).

## Features and guards

* `decimal_quantity` has no dependency. Off hides and stops, never deletes: with it off the form does not offer the new units or a fractional step, and a new item (or an edit that adds one) that uses them is refused with `feature_off`; an item that has them keeps working, and a shop that switches it off can still sell what it set up.
* "Pack sizes and smallest orders" (`pack_rules`) governs counted units; for an item sold by a measure its step and minimum belong to this feature. The files' pack and minimum columns exist when either feature is on.
* A shop with no row for the feature gets its template's value (spec 012). Migration 0039 writes an OFF row for every shop that exists, so only a shop made after it can start with the feature on.

## The API

* `GET /api/items` and `/api/store/{slug}`: each item has `unit`, `pack_size`, `min_order` and a `quantity` object `{measure, step, min, fractions, chips}`; a variant's `on_hand`, `left` and `daily_limit` may be decimals; `GET /api/items/units` (workspace) lists the units with names in both languages.
* Cart lines, `POST /api/store/{slug}/cart/check` and `/orders`: `quantity` is a number or a string. A refusal is the usual `{code, message, message_ar, lines}`; the line carries `unit` for a measure so numbers can be written with it.
* Orders: every line has `quantity` and `unit`; `line_text` is the rounded line.
* Stock: `POST /api/items/{id}/stock` takes `quantity` as a number or a string; `counted` likewise; a fraction for a counted unit is refused (`not_whole`), as is more than three decimals.
* Settings: `low_stock_at` may be a decimal.

## Files (spec 006)

Import and export carry the quantity columns as decimals: **Units in a pack** (a pack of 6, or a step of 0.25), **Smallest order**, **In stock**, **Low-stock number**, **Per day**. A cell is read like a price: Western or Arabic digits, `.` or `,` or `٫` for a decimal mark, up to three places; a fraction on a counted unit is an error on the row. The unit words gain Gram, Litre, Millilitre, Metre and Tola in both languages. The columns are written as numbers; a round trip (export, import) changes nothing (`tests/test_decimal_files.py`). Item codes and the other columns are unchanged.

## Not built / left for later

* The weekly report's "best sellers by units" adds quantities of different units together (3.5 kg and 5 pieces); a ranking by money is unaffected.
* Gold by weight with a price per gram that moves daily is a price rule (the pricing builder's work); a tola is a unit here and nothing converts it to grams.
* Barcodes and scales (a weight printed on a label) are an extension point.
* Cost and margin per unit (spec 014).
* The Arabic is a draft until ALY-66.
