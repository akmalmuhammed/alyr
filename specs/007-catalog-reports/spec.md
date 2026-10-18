# Spec 007: The Catalog in the weekly report, on the home screen and in the back office

Status: built in ALY-109 (package 8 of the Catalog, ALY-101). Decision: D-039 ("As built (ALY-109)"); the report it extends is D-030, the price list it must not touch is D-032, the dashboard is D-035. The engine is `specs/001-catalog-engine/spec.md`, the screens `specs/002-catalog-screens/spec.md`, WhatsApp `specs/004-catalog-whatsapp/spec.md`.

Nothing here is visible to an owner until the go-live sweep (ALY-113): the report section, the home cards and the record of demand all run only for a shop whose **`catalog` module is on**, and that module is off for every shop. The back office's Usage view is for ALYR staff and shows no price. Nothing says "coming" or "beta".

## 1. The weekly report (`modules/items/report.py`)

A section like the others (`SECTIONS` in `modules/report.py`, key `catalog`, between the orders and the bookings). It is in the stored week (`weekly_reports.sections`), the workspace's `/api/reports/weekly`, and the owners' email. **Not in the WhatsApp card's caption** (see "Left for others").

Each line is left out when it has nothing to say; a section with no lines is left out of the report (the engine's `render` now skips a section whose `lines` is empty, which no other section can be). Lists show at most three names and end "and 4 more" (Arabic agrees with the count: «وصنف واحد آخر», «وصنفان آخران», «و5 أصناف أخرى», «و12 صنفاً آخر»). Names are in the reader's language (Arabic falls back to the English name). A sale is a line of an order that was **not cancelled**, the same orders the Orders section counts, so a cancelled order (including one taken off a customer's ledger by ALY-128) is not a sale.

| Line (English) | What it is | Left out when |
|---|---|---|
| `Sold out this week: Cable 2.5 mm (2 days), LED flood light 100 W (2 days, still out), Socket 13 A double (13 hours) and 1 more` | Items on sale now that were sold out for an hour or more in the week, longest first, each with how long (nearest hour under a day, nearest day after), "still out" when they had not come back by the week's end | nothing sold out for an hour |
| `Customers who asked for something sold out: 3 (Cable 2.5 mm 2, LED flood light 100 W 1)` | Distinct customers in `sold_out_asks` this week, and the two items most asked for with how many customers asked | no asks |
| `Low on stock now: Cable 1.5 mm (3 left)` | Items the Catalog's **Low stock** filter holds today (at or below the item's own number, else the shop's), the lowest first, with the least left of any low size. Today's figure, as "still owed" is in the credit section | nothing low |
| `Most sold: Switch 1 gang (35), Breaker 16 A (10), Socket 13 A double (5)` and `Biggest earners: Cable 2.5 mm QAR 675, Distribution board 12 way QAR 555, Switch 1 gang QAR 315` | The top three items by units and by value (lines of orders not cancelled, `price × quantity`). When the same items lead both, one line: `Most sold: Dates (3, QAR 30), Figs (2, QAR 10)` | nothing sold |
| `Did not sell this week: Breaker 63 A three pole, Cable 1.5 mm, Cable 4 mm and 1 more` | Items on sale (live) that no order of the week held, leaving out any that were sold out that week (they could not sell). Menu order. Only in a week in which something sold, so a closed week does not list the whole menu | nothing sold, or everything sold |

The Arabic of all six lines is in `report.py` (a draft until ALY-66). The headline for the one-line template summary is `4 items sold out` / `نفد 4 أصناف`, else the low-stock count, else the best seller, else `no items sold out`.

There is **no comparison with the week before**, which the other sections carry: these lines are lists, not one figure to compare, so the week before is not read (`before` is `{}`).

### How long an item was sold out (`modules/items/spells.py`)

Nothing records "sold out" as an event, and one way an item runs out (a new day for a daily limit) has no event at all, so it is worked out from the two logs that are never edited:

* **Switched off:** the activity record's `switched_on` / `switched_off` rows (written by `service.set_available`, and, since ALY-109, by `update_item` when the switch is saved with the item). The state at the start is the opposite of the first flip after it, or the item's switch now when there is none.
* **Counted stock (rule `count`):** each stock movement carries `balance_after`; the number at the start is what is on hand now less every movement since. Out when every size that can be sold has none.
* **Daily limit (rule `daily_limit`):** each shop day starts with every size at its limit; each movement of the day carries what is left of it. Out from the movement that leaves nothing until the day ends, or a later movement that puts some back; a limit of zero is out all day.

An item is sold out while it is off **or** out of stock (as `listing.is_sold_out` counts). Only time since the item went live counts (a draft with no stock is not "sold out"; the activity record says when it went live), only live items that are not "always available", and a total under an hour is left out as a correction. The week is cut at now when it has not ended (the week so far). Limits per size are today's, not as they were.

### The record of demand (`modules/items/demand.py`, migration 0030)

`sold_out_asks (tenant_id, contact_id, item_id, day, via, created_at)`, primary key (contact, item, day): **once per customer, item and day**, whatever the number of tries. `via` is `order_page` or `whatsapp`. Forced row-level security; the app role can read and add, not change or delete. Written, only when the `catalog` module is on and only for a customer (staff are not demand) and an item on sale, by:

* the order page's **cart check** with a customer (`POST /api/store/{slug}/cart/check` with `contact_id`), for a line refused as sold out (`sold_out`) or switched off (`unavailable` on a live item); not for a price that moved, a missing choice, a schedule or too few left;
* an **order refused** for the same reason and **"same as last time"** with something that could not be ordered again. A refused order is rolled back with everything it wrote, so the route writes the asks afterwards in a transaction of its own, best effort: a failure is logged and never changes what the customer is told;
* the **chat** showing a customer an item that is sold out (the card with "Tell me when back") or asking to be told about one.

`stock_watches` ("tell me when back") is not the same thing and is left as it is: a watch needs the customer's agreement, and the ask is written before it.

## 2. The home cards ("Sold out now", "Low stock")

Declared with the module in `catalog.py` (`Card(..., count="sold_out", href="/app/catalog?show=sold_out")`; a card whose number one SQL expression cannot give names its own `count`). Two readers:

* `GET /api/workspace/home` returns them with the other modules' cards (`value`, `text`, `label` in both languages, and `href`).
* **ALYR Agent** (`GET /api/agent`): the view has a `catalog` block (`title`, `cards[]` with `label`, `value`, `text` and `href`, or `null` when the shop has no Catalog module), drawn by `AgentDashboard` as a "Catalog" section under the numbers, not in showcase mode. A card with nothing to show is a number and no link (`href: null`).

Each number is `listing.counts` (`modules/items/listing.py`), **the same tally as the Catalog list's filter chips**, so the number on the card is the number of rows in the list it opens; a test asserts it against `/api/items?filter=…`. Tapping a card opens `/app/catalog?show=sold_out` or `?show=low_stock`; the Catalog applies the filter (`Catalog.tsx`, the `show` prop). Agents see the cards (they flip switches and count the shelf).

## 3. The back office's Usage view (`/ops/usage`)

`GET /api/admin/media/usage/history?months=6` (ALYR staff only, the same checks as the rest of the back office; 1 to 24 months) returns `storage`, `alert` (`level` ok / warn / over, `percent`, `used_gb`, `free_gb`, `at_percent` against R2's free 10 GB, today's figure) and `months`, newest first, each with `month`, `current`, `shops[]` (business, items `active_items`, `photos`, `gb`, `peak_gb`, `uploads`, `duplicates`, `refused`) and `totals`. It reads the meters `media_usage` already keeps (ALY-103); nothing new is stored and **nothing is priced**: there is no price, no QAR, no billing. Charging by usage waits for the founder and goes through the price list (D-032).

The screen (`ops/usage/page.tsx`, "Usage" in the console's main navigation): the total against 10 GB with its state ("Within the free tier", "Past the alert line" at 80%, "Over the free tier") and a gauge with the 80% mark; a month chooser (newest first), a sort chooser (stored, business, items, photos, uploads) and its direction; the businesses with a column of the change in stored gigabytes since the month before; a "Month by month" table of the totals with a small bar for the trend. At phone width each business is a card. English only (the console has no Arabic).

## 4. Also changed

* `service.update_item` writes a `switched_on` / `switched_off` activity row when the switch is saved with the item, so the report's arithmetic sees every flip.
* The workspace remembers its language on the device (`localStorage`, `alyr-workspace-lang`): each screen is a new page component, so a link inside the workspace (a card, a row in Needs you now) sent an Arabic reader back to English. Found in the browser run of the cards.
* `scripts/catalog-browser-check.mjs` presses the language button only when the page is not already in the language it wants, since the choice is now kept.

## Acceptance

* `apps/api/tests/test_catalog_reports.py`: a week of demo activity (orders, two cancellations including one reversed on a credit account, three kinds of sold-out, customers asking) gives exactly the six English lines and the six Arabic lines; the section is absent for a shop without the module (the report reads exactly as before, less the block); the lines are left out when empty; the lists are capped with the right Arabic agreement; durations; the three ways of running out, a count corrected in minutes, a draft that went live mid-week; the record of demand written once per customer, item and day from the cart check, a refused order, "same as last time" and the chat, and not for staff, drafts, other reasons or a shop without the module; row-level security.
* `tests/test_catalog_cards.py`: the cards equal the rows of the lists they open, in both languages, for owners and agents, and are absent without the module.
* `tests/test_catalog_usage.py`: the history, newest first, with totals; the alert levels; read-only; a signed-out visitor gets 401 and a shop's owner or agent 403.
* `scripts/catalog-reports-browser-check.mjs`: in headless Edge at 375 px and laptop width, English and Arabic, light and dark, the cards equal the API's numbers and open the filtered list, the Usage view shows the API's figures, sorts and changes month, nothing scrolls sideways and axe-core finds nothing on the screens built here.

## Left for others

* The WhatsApp card's caption (`modules/agent/week.py`) has one line per product and no Catalog line; the Catalog is in no product. Putting a line there is a decision about the card (D-038).
* Arabic review (ALY-66): every word of the section is in `report.py`, the cards' in `catalog.py`.
* A week-on-week comparison for these lines, if the owner wants one.
* Charging by usage (the founder's decision, D-032), per-shop caps, and a language switch on a phone that does not need the search palette (ALY-129).
