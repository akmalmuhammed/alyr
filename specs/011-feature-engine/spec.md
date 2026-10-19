# Spec 011: The feature engine (one Catalog, configured for each kind of business)

Status: built in ALY-148 (a child of ALY-101). Decision: D-039, "As built (feature engine)". The Catalog it configures is `specs/001-catalog-engine/spec.md` (engine), `002` (screens), `003` (price groups, SKU), `004` (WhatsApp), `005` (order page), `006` (import and export), `007` (reports), `008` (business types, now one kind of template) and `009` (scenarios).

The founder's words (18 Oct 2026): *develop the system first, later configure it according to the business, enable and disable features.* Before this work every business type already switched on different modules, wording, rules, layouts, alerts and sample items, but all of it was fixed in code: a shop could not change its type, rename its section, switch a part of the form off, or add a field of its own. Serving a new kind of client meant editing `presets_catalog.py`. After it, the Catalog is **one system** and a kind of business is **a configuration of it**: which features are on, what the section is called, how the order page looks, which categories and fields it starts with. A configuration is data an owner (or the back office) changes at any time.

**This page describes the first of two pull requests.** It holds the registry, the per-shop table, the Features screen, the section's name and layout, and every consumer of a feature. The second (custom fields, changing a shop's type, templates made in the back office) is `ALY-148`'s second pull request and extends this page when it merges.

## The registry (`apps/api/src/alyr/capabilities.py`)

One list, in code, of everything the Catalog can do. Owners never see the word "capability": they see **features**, in plain words, grouped by what they do. Each entry has:

| Field | Meaning |
|---|---|
| `key` | stable, `snake_case`, used in the table, the API and the files |
| `name`, `hint`, `changes` | English and Arabic: what it is called, what it is for, and what appears on the screens when it is on |
| `group` | how the Features screen groups it (How items run out, Sizes choices and prices, Your order page, Messages to you, Sharing, More about each item) |
| `affects` | where it acts: `form`, `list`, `order_page`, `import_export`, `reports`, `chat`, `alerts`, `settings` |
| `depends_on` | other features it needs (`pickup_date` needs `schedule`) |
| `default` | on or off for a template that says nothing |
| `config`, `choices` | a value beside the switch (`sold_out_display`: `{"mode": "grey"}`, or `"hide"`) |
| `core`, `built`, `always_on` | see below |

Three kinds:

* **Core** (always on, never toggled): names in two languages, photos, price and sale price, the stock log, categories, SKU, import and export. The Features screen lists them under "Always included".
* **Switchable** (built): `rule_switch`, `rule_count`, `rule_daily_limit`, `schedule`, `pickup_date`, `variants`, `options`, `price_groups`, `pack_rules`, `quick_quantity`, `same_as_last`, `show_sku`, `sold_out_display` (a choice, always on), `low_stock_alerts`, `sold_out_alerts`, `back_in_stock`, `share_links`, `table_qr`, `tags`, `custom_fields`. (`custom_fields` is registered and on; what it does arrives with the second pull request, and it affects nothing yet.)
* **Extension points** (named, not built): `decimal_quantity`, `cost_margin`, `discounts`, `delivery_fees`, `bundles`, `suppliers`, `barcode`, `batch_expiry`, `serial_imei`. They are **hidden everywhere**: they have no words, no API returns them, no template can carry one, nothing can switch one on (`unknown_feature`), and `tests/test_feature_registry.py` fails if one acquires text. To build one: write what it does and its consumers (form part, order page, file columns, report, chat), set `built=True` and give it words. Nothing else changes, and **no migration is needed**: a shop with no row for a feature gets its template's value.

## Per-shop features (migration 0034)

`shop_features (tenant_id, key, enabled, config jsonb, set_by 'template' | 'owner', updated_by, created_at, updated_at)`, primary key `(tenant_id, key)`, row-level security forced, the `tenant_isolation` policy, grants `select, insert, update, delete` (delete only so a demo shop can be reset).

* **Resolution** (`modules/items/features.py`, `load(conn)` → `Features`): the shop's row if it has one, else its template's value, else the registry's default. A feature is on only if everything it `depends_on` is on. `on(key)` is false for anything not built. Every consumer asks this; none reads the business type.
* **Seeded** at onboarding (`template.apply` → `features.seed`, from the shop's template, `set_by = 'template'`) and, for every shop that exists, by the migration.
* **`set_by`** is `'owner'` for anything an owner or ALYR's staff chose. A later re-apply of a template never touches an owner's value.
* **Changing one** (`PUT /api/features/{key}`, owners and admins): switching a feature on switches on what it needs; switching one off switches off what needs it; the answer says what moved. Each change is on the activity record (`subject = 'catalog'`, action `features`, who, from-to, and the ones that moved with it). A change that changes nothing writes nothing.

### The migration (0034): nothing changes for any existing shop

For every row of `tenants` it writes a row for every stored feature. Every part of the form and the order page's four extras were always there, so they are on. The two alerts and the sold-out look are copied from the shop's `shop_settings` (alerts on and greyed when the shop has no settings), and a value that is not the one the shop's type starts with is marked `owner`. The legacy columns `shop_settings.alert_low_stock`, `alert_sold_out` and `sold_out_display` stay in the table and are **no longer read**. Four columns are added to `shop_settings` (`section_name`, `section_name_ar`, `layout_style`, `template_key`; empty means the template's). It is safe to run again, and was tested on a database built to the previous migration with data in it, as a superuser owner and as an owner that does not bypass row-level security (`tests/test_feature_engine_migration.py`).

## Templates (`apps/api/src/alyr/shop_templates.py`)

A template says which features start on, what the section is called, how the order page lays out, how a new item runs out, and the starter categories (starter custom fields arrive with the second pull request). **The ten business types that have a catalog, and a plain "Any other business", are built-in templates**, made from `presets_catalog.py` so that a shop of a type behaves as it did. Travel, and a business made in the back office with no type, use the plain template.

### The four things an order page can offer

`pickup_date`, `quick_quantity`, `same_as_last` and `show_sku` were declared per type in `presets_catalog.Layout` and returned by `/api/items/setup`, but **the order page never read them**: it always asked for the day when an item is made to order, put a plus and a stepper on every row, offered "same as last time" to a customer with an earlier order and showed the SKU on the item sheet and in the table. The work's rule is that no shop behaves differently by default, so **every type starts with all four on** (what the page did), and the declared per-type values were removed. They are now real:

| Feature | On | Off |
|---|---|---|
| `pickup_date` | the review asks for the day when an order holds an item made to order | nobody is asked; the order is for the earliest day the shop can do it, and the review says so |
| `quick_quantity` | a plus and a stepper on every row | the row's button opens the item and the customer adds from there (the wholesale table keeps its steppers: they are its input) |
| `same_as_last` | "Order the same as last time" on the page; `POST /api/store/{slug}/orders/repeat` works | the card is gone and the route answers 403 `feature_off` |
| `show_sku` | the code on the item sheet and as a column in the table | neither |

`report_lines` (declared per type, never read) is removed. The weekly report's Catalog lines follow the features (`report.shown_lines`): what sold out and who asked for it need a way of running out; the low-stock line needs counted stock; best sellers and what did not sell are every shop's. An older stored report with no `show` list reads as before.

## What off means

**Off hides a feature and stops it applying to new things. It never deletes or changes anything already made, and an item that already uses it keeps working.**

* **The item form** hides a part (sizes, choices, times, tags, prices by group, pack size and smallest order) when its feature is off and the item has none of it. An item that has it still shows it. A way of running out whose feature is off is not offered for a change, but an item already on it keeps it. A new item's usual start falls back to "always available" when its rule is off.
* **The API refuses new use** with `422 feature_off` and a message in both languages: `POST /api/items` with a part whose feature is off; `PUT /api/items/{id}` that adds a part the item does not have, changes to a way that is off, or adds a lead time while `pickup_date` is off; a new price group or putting a customer in one (back to the normal price is always allowed). Internal paths (undo, bulk, the staff commands, the demo seeds) are not gated: they restore or move what exists.
* **Files**: a column of a feature that is off is left out of the export and the templates, unless an item of the shop still uses the feature (then the data is still in the file). An upload with such a column is read, the column noted ("left out: Tags and allergens is switched off, switch it on in Features") and left out, and the plan's hash covers it.
* **The order page** reads `catalog.layout` (style, the four extras) and `catalog.features`; `tags` off blanks tags and stops tag search; `sold_out_display` is the shop's choice.
* **Home cards**: "Sold out now" is left off a shop where nothing can run out; "Low stock" off one that does not count stock. The Agent's Catalog block follows.
* **WhatsApp**: with `back_in_stock` off the sold-out card has no "Tell me when back" button and the request is not taken; with an alert off the managers are not messaged, and the one message after an import leaves it out.
* **Share and QR codes**: `share_links` governs the links and the Share actions; `table_qr` the QR codes for the counter and the tables.

## API

| | |
|---|---|
| `GET /api/features` (any staff) | `{groups: [{key, name, name_ar, hint, hint_ar, features: [{key, name, name_ar, hint, hint_ar, changes, changes_ar, group, affects, enabled, own, depends_on, needed_by, set_by, updated_by, updated_at, kind: "switch" \| "choice", config, choices, in_use: {count, text, text_ar} \| null}]}], core: [...], template: {key, name, name_ar, builtin}, can_manage}` |
| `PUT /api/features/{key}` (owner, admin) | `{enabled?: bool, config?: {mode: "grey" \| "hide"}}` → `{changed: [{key, from, to}], ...the same view}`. 422 `unknown_feature` (a core feature, one not built, one that does not exist), `always_on`, `bad_choice`; 403 for anyone else |
| `GET /api/items/setup` | adds `template`, `section.custom`, `section.template_name`, `layout_custom`, `features` (key → on) and removes `report_lines`; `layout` carries the four extras from the features |
| `PUT /api/items/setup` | adds `section_name`, `section_name_ar` (up to 40 letters; empty goes back to the template's, each language on its own) and `layout_style` (`menu`, `grid`, `list`, `table`; empty is the template's); `sold_out` and `alerts` now write the shop's features |
| `GET /api/store/{slug}` | `catalog.layout` (style and the four extras) and `catalog.features` (`tags`, `variants`, `options`, `pack_rules`, `price_groups`, `table_qr`, `custom_fields`) |

## Screens

* **Catalog → Features** (owners and admins): the section's name in English and Arabic and the order page's layout (in a fold, with the current values as its summary), a search over every feature (Arabic spellings folded), then the groups. Each feature has its switch, what it is for, **what this changes** and where (chips: Item form, Items list, Order page, Excel and CSV files, Weekly report, WhatsApp chat, Messages to you, Settings), how many items use it ("12 items use this. They keep it."), what it needs, and "Set by you" when the owner chose it. A switch is saved the moment it is pressed, with a message that names what moved with it. Phone first; English and Arabic with right to left; light and dark.
* **The workspace** navigation and the screen's title use the shop's chosen name, and so does the customer's page.
* **The item form**, **Share**, the settings' price groups and the order page follow the features as described above.

## How a founder serves a brand-new kind of client with this pull request

Create the shop (back office or onboarding) as the closest type, open Catalog → Features, switch off what the business does not use, rename the section, choose a layout. Starting a *template* for the next client of the same kind, changing a shop's type, and starter custom fields are in the second pull request.

## How it is checked

* `tests/test_feature_registry.py`: the registry's invariants (words in both languages, no jargon or promise, dependencies first, extension points hidden and mute, every template covers exactly the stored features).
* `tests/test_feature_engine_identical.py`: **for each of the eleven business types, a shop made through the real onboarding path is compared with `tests/golden/types_before_features.json`, captured by running `origin/main` before this work**: navigation, home cards, `/api/items/setup`, settings, categories, what the order page is told, whether a full item (sizes, choices, a daily limit, tags, pack size, a lead time) is accepted for every way of running out, the columns of the export and the template file, onboarding's review, samples. The differences are the deliberate ones only (the four extras, `report_lines`, the new keys), written in the test.
* `tests/test_feature_engine_migration.py`: 0034 on a database with data, twice, for every type and for what an owner had changed.
* `tests/test_features_api.py` and `test_features_wording.py`: the screen's answer, the cascade, the record, who may change what, isolation between shops, off and on for each feature (the form's guards, the order page, the files, the report, the cards, the chat, the alerts), the section's name and layout.
* The browser: `scripts/feature-engine-browser-check.mjs`.

## Not built, not checked

A real phone and screen reader; the Arabic by a native speaker (ALY-66); a try with a real owner; the screens in Safari. The extension points above.
