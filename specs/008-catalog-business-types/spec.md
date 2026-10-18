# Spec 008: Business-type templates for the Catalog (what each type of business starts with)

Status: built in ALY-107 (package 6 of the Catalog, ALY-101). Decision: D-039 ("As built (ALY-107)"), with D-031 (self-serve onboarding and its starting setups per type). The engine is `specs/001-catalog-engine/spec.md`, the screens `specs/002-catalog-screens/spec.md`, price groups and SKU `specs/003-price-groups-and-sku/spec.md`, WhatsApp `specs/004-catalog-whatsapp/spec.md`. **This page is what the import and export (ALY-108), the customer order page (ALY-112) and the reports (ALY-109) read** to learn what a shop's type calls its Catalog and how it is laid out: the section "For the other packages" lists the fields and says which are stable.

**Hidden until go-live, by one setting.** Nothing here shows until `Settings.catalog_for_new_shops` (`ALYR_CATALOG_FOR_NEW_SHOPS`, default **false**) is switched on, which is the go-live sweep's one step (ALY-113). With it off, onboarding of every type behaves exactly as before the Catalog: no `catalog` module, no samples, no categories, no starting values, and the three types that exist only for the Catalog (bakery, grocery, fashion) are not offered. With it on, every business created from then on gets its type's catalog. It decides for new businesses only: it never switches anything on for a shop that exists. Nothing on any screen says "coming" or "beta" (a test reads the words).

## What a type brings

`apps/api/src/alyr/presets.py` says which types have a Catalog (`Preset.catalog`, or none) and which exist only for it (`requires_catalog`); `presets_catalog.py` holds everything an owner or customer can read, English and Arabic side by side and grouped by type so the Arabic can be reviewed type by type (ALY-66). The module itself is declared apart from `Preset.modules` (the seeds and the quote read that), and `Preset.modules_for(catalog_on)` adds it, and what the type's catalog needs (`Preset.with_catalog`: `orders` for wholesale).

| Type (key) | The section is called | A new item runs out as | Low stock at | A sold-out item on the order page | Alerts on | Order page layout | Starts with |
|---|---|---|---|---|---|---|---|
| Restaurant and café (`restaurant`) | **Menu** «القائمة» | on or off (`switch`) | 3 | greyed | sold out | `menu` | 4 categories, 6 sample dishes: sizes and extras, halal and vegetarian tags |
| Bakery and home kitchen (`bakery`, new) | **Menu** | a number each day (`daily_limit`), ordered 1 day ahead before 18:00 | 3 | greyed | low stock, sold out | `menu` with a pickup date | 5 categories, 6 samples: a cake with two sizes and daily limits, a made-to-order cake, savouries, pastries, sweets, bread |
| Grocery and baqala (`grocery`, new) | **Products** «المنتجات» | counted (`count`) | 10 | left out | low stock, sold out | `list` with quick quantity | 5 categories, 6 samples by kilo, piece and pack |
| Fashion and gifts (`fashion`, new) | **Products** | counted | 2 | greyed | low stock, sold out | `grid` | 5 categories, 6 samples: sizes and colours each with its own stock, a pre-order gift box |
| Shop and retail (`shop`) | **Products** | counted | 5 | greyed | low stock, sold out | `grid` | 4 categories, 6 samples, some with sizes |
| Wholesale and trading (`wholesale`) | **Price list** «قائمة الأسعار» | counted, sold by the pack | 20 | greyed | low stock, sold out | `table` with quick quantity, "same as last order", the SKU | 4 categories, 6 samples with pack sizes and minimum orders; **also the `orders` module**, so customers have an order page |
| Salon, spa, clinic, home services | **Products** (optional) | on or off | 3 | greyed | none | `grid` | 1 to 2 categories, 2 to 3 samples of products sold at the counter |
| Travel and documents | none | | | | | | no catalog: no module, no screen, no navigation entry, no mention |

* **Appointment businesses** (salon, spa, clinic, home services) keep their bookings flow unchanged (a test compares their services and hours with the preset's). Their Catalog is for products sold beside the services, and says it is optional; it is one row on the go-live list ("Add your products (optional)"), never a step of onboarding. **Photos for the services themselves are not built**: a service is a row of the bookings module and has no photo; that needs the bookings screens (ALY-27).
* **Wholesale gets the `orders` module as well as `catalog`** when the setting is on (`Preset.with_catalog`), because its customers order from the price list: it has an order page in the table layout, price groups decide each customer's price, and a customer the shop has given a credit limit puts an order on their account (the ledger takes the sale and the credit limit holds; a test places one through the store API at the customer's group price). Its credit accounts, inbox and payment links are unchanged. With the setting off wholesale is exactly as before, with no orders module. Giving it orders does not change the price drafted for it (its inbox and payment links already counted as ALYR Chat beside ALYR Accounts; a test compares the two drafts).
* **The review in onboarding** (`gets`, plain words, both languages) lists what the type brings: the section, the starting rule, the sold-out look, the alerts and the order page. Its numbers are the settings' numbers (a test checks that the low-stock number in a sentence is the setting, and that a sentence about alerts exists exactly when an alert is on). What it says about the order page (a photo grid, a size picker, a pickup date, a link for every item to share) is what ALY-112 must deliver; ALY-113 should check those sentences against the finished page before it switches the setting on.

## Sample items

Each type can start with believable samples, in both languages. **Safe by construction:**

* **Marked.** `items.is_sample`, shown as **Sample** («تجريبي») on every one in the owner's list, with the price called "Example price". The list has a **Samples** filter and a banner, "N sample items show how this looks. Their names and prices are examples, and customers never see them", with **Remove all samples**.
* **Never for sale.** The database refuses a sample that is not a draft (`items_sample_is_draft`), so a sample cannot reach the order page, the chat, the reports or a customer, whatever any code does. Tests read the store page, the owner's test chat and the older product list.
* **No photo.** Nothing is stored, downloaded or copyrighted: the screen draws a tile from `sample_key` (three plain shapes, a few lines of arithmetic in `_workspace/CatalogSample.tsx`, the same tile every time, in the workspace's own colours).
* **One step to remove** them all: `POST /api/items/samples/remove` deletes every item that is still a sample, in one statement, and writes the record. Items the owner has made their own stay.
* **The owner's to take.** Saving a sample in the edit sheet (`PUT /api/items/{id}`), putting their own photo on it, or **Keep it as mine** (`POST /api/items/{id}/adopt`) makes it theirs: the mark goes and it stays a draft until they put it on sale (which needs a real price, a name and the Arabic name, as for any item). **Nothing else may change a sample**: its switch, its status, its stock and count, its group prices and a bulk action are refused with `sample_item` (the bulk preview lists it as skipped with the reason), the WhatsApp staff commands do not see samples at all, and a customer asking for one in the chat is shown nothing.
* A sample takes no SKU and no stock, takes no part in duplicate-name warnings, and is left out of the Orders screen's older product list. Samples count towards the shop's item limit.

## The API

Additions only; nothing was renamed or removed.

### `GET /api/items/setup` (signed-in staff; where `catalog` or `orders` is on) → the shop's hints

```json
{
  "type": "bakery",
  "section": {"name": "Menu", "name_ar": "القائمة", "sub": "...", "sub_ar": "..."},
  "optional": false,
  "layout": {"style": "menu", "pickup_date": true, "quick_quantity": false, "same_as_last": false, "show_sku": false},
  "sold_out": "grey",
  "new_item": {"rule": "daily_limit", "unit": "piece", "lead_days": 1, "cutoff": "18:00"},
  "low_stock_at": 3,
  "alerts": {"low_stock": true, "sold_out": true},
  "focus": ["schedule"],
  "report_lines": ["make_tomorrow", "sold_out_now", "top_items"],
  "samples": 6
}
```

| Field | Meaning | For |
|---|---|---|
| `type` | the shop's business type, or `""` | all |
| `section` | what the shop calls its Catalog, with the line under the title; a shop with no type of its own gets "Catalog" | ALY-108 (the template's name and sheet titles), ALY-112 (the page's heading), the workspace |
| `layout.style` | `menu` photos by category with the dish's options, `grid` photo grid, `list` compact rows, `table` a table | ALY-112 |
| `layout.pickup_date` | the customer is asked for the day the order is for (items ordered for a date) | ALY-112 |
| `layout.quick_quantity`, `same_as_last`, `show_sku` | a plus and minus on each row; "same as last order" one tap away; the code beside the name | ALY-112 |
| `sold_out` | `grey`: a sold-out item stays visible, greyed; `hide`: it is left out. The shop's own setting | ALY-112 |
| `new_item` | how a new item starts: its rule, what it is sold by, and a bakery's notice and cutoff (`lead_days` and `cutoff` are null unless the shop's new-item rule is the type's own) | the item form |
| `low_stock_at`, `alerts` | the starting values, as the shop has them now | settings |
| `focus` | the folded parts of the item form that start open on a new item: `options`, `schedule`, `variants`, `groups` | the item form |
| `report_lines` | what the weekly report should say for this type (`sold_out_now`, `top_items`, `never_ordered`, `make_tomorrow`, `reorder`, `low_stock`, `back_in_stock`, `fast_movers`, `dead_stock`, `bookings_only`). **Nothing reads it yet**; it is for ALY-109 | ALY-109 |
| `samples` | how many items are still samples | the list |

`PUT /api/items/setup` (owners and admins) changes what the type started the shop with and nothing else: `{"sold_out": "grey"|"hide", "new_item_rule": "always"|"switch"|"count"|"daily_limit", "alerts": {"low_stock": bool, "sold_out": bool}}`; only what is sent changes; an unknown value is refused with 422.

### Other places the wording and layout are read (stable)

* **`GET /api/workspace`**: the Catalog's entry in `nav.products` is labelled with the section's name in both languages (it is "Catalog" for a shop with no type). Where the section is "Products", the suite's own entry in `nav.account` (key `products`) is labelled "ALYR products" («منتجات ALYR») so two entries do not share a name (D-039 keeps them apart). The orders module's setup step `products` reads "Add your menu" («أضف القائمة»), "Add your products" or "Add your price list" and points at the Catalog.
* **`GET /api/store/{slug}`**: a `catalog` object, `{type, section: {name, name_ar}, layout, sold_out}`, for a shop with the Catalog on; `null` otherwise. Nothing private (no stock number, alert or sample). **The page's own `unavailable` list is unchanged**: ALY-112 decides whether to show it greyed or leave it out by `sold_out`.
* **`GET /api/onboarding/state`**: `catalog`, for the owner's review: the hints above plus `gets` (the plain-words list, `[{en, ar}]`) and `starting_categories`; `null` where the shop has no Catalog.
* **`GET /api/onboarding/types`**: unchanged in shape. Bakery, grocery and fashion appear only while `catalog_for_new_shops` is on; the back office's price list shows every type.
* **`GET /api/items`**: each item has `sample` and `sample_key`; `counts` has `sample`; the filter `filter=sample` lists them. A sample is in no other filter (not in Drafts, Stock or Low stock), so the owner's own drafts are theirs.

### Routes

`POST /api/items/samples/remove` (whoever may edit items) → `{removed}`; `POST /api/items/{id}/adopt` (whoever may edit items) → the item. The activity record has `adopted`, and `deleted` with `sample: true` for each one removed.

## What the owner sees

* **Navigation, title and the line under it** use the type's words in both languages; the Catalog's own sentences no longer name "the Catalog" (they say "Settings", "your items"), so they read right under "Menu" or "Price list". `Catalog` and `title` are one prop from the shell.
* **Onboarding.** An order business sees "Here is what you are getting" at its assisted step (instead of the line that says screens are still being built, which is kept for the setting-off case): the section, the type's six or so plain sentences, the samples and how to remove them. An appointment business sees one optional row on the go-live list.
* **The item form** opens the type's own parts first on a new item, and a new item starts the way the type says (a bakery's: a number each day, one day's notice, before 18:00).
* **Settings** has a part for what the type started: sold-out items greyed or left out, how a new item runs out, and two switches for the WhatsApp alerts (a switched-off alert stays quiet: `modules/items/alerts.py` reads it).

## Migration 0031

`items.is_sample`, `items.sample_key` and the check `items_sample_is_draft`; `shop_settings.sold_out_display` (`grey` or `hide`), `new_item_rule`, `alert_low_stock` and `alert_sold_out`. The defaults are what every shop has today (greyed, on or off, both alerts on), so no existing shop behaves differently. A shop that did not come through onboarding with the setting on (made in the back office, say, or the demo shop) has those plain defaults and no categories or samples; the wording still follows its `business_type`. Applying a type's catalog to a shop that exists (`modules/items/template.apply`) has no screen; ALY-113 can call it for shops it switches on.

## How it is checked

`apps/api/tests/test_catalog_business_types.py` (through real onboarding: email code, token, HTTP, PostgreSQL) and `test_catalog_business_types_demo.py` (the demo shop and the chat simulator):

* **The setting off**: all eight old types are created with exactly their old modules, no samples, no categories, no settings row, no `catalog` in the navigation or the onboarding state; the type list is today's list in today's order; a new type is refused; an existing shop is not changed when the setting is later switched on.
* **The setting on, every type** (`test_each_type_starts_with_its_own_catalog`, ten parametrised cases, and travel on its own): modules, the navigation's name in both languages, the starting rule, low-stock number, sold-out look, alerts and layout, the starting categories with Arabic names, the samples (marked, drafts, bilingual, example prices, no photo, no stock), and the review's words.
* **Per type**: a bakery's daily limits, lead time and cutoff, made-to-order item; a grocery's units and left-out sold-out items; a fashion seller's sizes and colours with stock of their own and a pre-order; a restaurant's required size and priced extras and its alerts; a wholesaler's pack sizes, minimum orders and price groups, its order page in the table layout, and an order on account at the customer's group price with the credit limit holding (`test_a_wholesale_shop_made_with_the_setting_on_orders_on_account_at_its_group_price`); a salon's bookings unchanged; travel's nothing.
* **Nothing half-finished**: samples never reach the order page, the owner's test chat or the older product list; the database refuses a sample that is for sale; nothing but the owner opening a sample can change it (switch, status, stock, count, group prices, bulk); saving one makes it theirs and it can then be put on sale; **remove all samples** is one call and keeps the owner's own items and the starting categories; one shop's samples are not another's; an agent cannot remove samples; staff commands and customers on WhatsApp never find a sample; every word has an Arabic line and none says coming, soon or beta; the review's numbers are the settings' numbers.
* **The alerts**: with low stock off nothing is sent for a low item but a sold-out item is still told, and the other way round; a shop that never chose has both on.

`scripts/business-types-browser-check.mjs` (headless Edge, 375 px, English and Arabic, light, dark for two types; axe-core on the review, the list, a sample's sheet and the settings): for each type it signs a new owner up through the real onboarding API and looks at the review (or the go-live row), the navigation, the title, the samples with their tiles and the banner, a sample's sheet, the settings, and removing every sample in one tap.

Not checked: a real phone and its keyboard; the Arabic by a native speaker (ALY-66); the sentences about the order page against the finished order page (ALY-112 is built in parallel); Meta; more than ten shops at once.

## For the other packages

* **Import and export (ALY-108)**: read `section.name`/`name_ar` for the template's name, `layout.show_sku` to put SKU, pack size and minimum order first, `new_item` for the default rule and unit of a row that leaves them empty, and the type's starting categories (`GET /api/onboarding/state` `catalog.starting_categories`, or `GET /api/items/categories`). An imported item is never a sample.
* **The order page (ALY-112)**: read `catalog` on `GET /api/store/{slug}`: the heading, the layout style and its flags, and `sold_out`. A sample is never in `products` or `unavailable` (they list live items only).
* **Reports and alerts (ALY-109)**: `report_lines` per type; the two alerts are the owner's switches (`shop_settings.alert_low_stock`, `alert_sold_out`; `template.alert_on`). A sample is a draft, so it is out of every count of live items.
* **The go-live sweep (ALY-113)**: flip `ALYR_CATALOG_FOR_NEW_SHOPS`; check the order-page sentences in `gets`; decide for shops that exist (`template.apply`).
