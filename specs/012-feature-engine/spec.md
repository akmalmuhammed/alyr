# Spec 012: The feature engine (one Catalog, configured for each kind of business)

Status: built in ALY-148 (a child of ALY-101), in two pull requests. Decision: D-039, "As built (feature engine)". The Catalog it configures is `specs/001-catalog-engine/spec.md` (engine), `002` (screens), `003` (price groups, SKU), `004` (WhatsApp), `005` (order page), `006` (import and export), `007` (reports), `008` (business types, now one kind of template) and `009` (scenarios).

The founder's words (18 Oct 2026): *develop the system first, later configure it according to the business, enable and disable features.* Before this work every business type already switched on different modules, wording, rules, layouts, alerts and sample items, but all of it was fixed in code: a shop could not change its type, rename its section, switch a part of the form off, or add a field of its own. Serving a new kind of client meant editing `presets_catalog.py`. After it, the Catalog is **one system** and a kind of business is **a configuration of it**: which features are on, what the section is called, how the order page looks, which categories and fields it starts with. A configuration is data an owner (or the back office) changes at any time.

**This page covers both pull requests.** The first holds the registry, the per-shop table, the Features screen, the section's name and layout, and every consumer of a feature. The second holds custom fields (migration 0035), changing a shop's type and templates made in the back office (migration 0036); its sections start at "Custom fields".

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
* **Switchable** (built): `rule_switch`, `rule_count`, `rule_daily_limit`, `schedule`, `pickup_date`, `variants`, `options`, `price_groups`, `pack_rules`, `quick_quantity`, `same_as_last`, `show_sku`, `order_on_whatsapp`, `sold_out_display` (a choice, always on), `low_stock_alerts`, `sold_out_alerts`, `back_in_stock`, `share_links`, `table_qr`, `tags`, `custom_fields` (the shop's own fields: see "Custom fields"), `decimal_quantity` ("Sold by weight or volume", `specs/013-decimal-quantities/spec.md`, the first feature pack: off for a shop that exists, on for a new grocery or bakery).
* **Extension points** (named, not built): `cost_margin`, `discounts`, `delivery_fees`, `bundles`, `suppliers`, `barcode`, `batch_expiry`, `serial_imei`. They are **hidden everywhere**: they have no words, no API returns them, no template can carry one, nothing can switch one on (`unknown_feature`), and `tests/test_feature_registry.py` fails if one acquires text. To build one: write what it does and its consumers (form part, order page, file columns, report, chat), set `built=True` and give it words. Nothing else changes, and **no migration is needed**: a shop with no row for a feature gets its template's value.

## Per-shop features (migration 0035)

`shop_features (tenant_id, key, enabled, config jsonb, set_by 'template' | 'owner', updated_by, created_at, updated_at)`, primary key `(tenant_id, key)`, row-level security forced, the `tenant_isolation` policy, grants `select, insert, update, delete` (delete only so a demo shop can be reset).

* **Resolution** (`modules/items/features.py`, `load(conn)` → `Features`): the shop's row if it has one, else its template's value, else the registry's default. A feature is on only if everything it `depends_on` is on. `on(key)` is false for anything not built. Every consumer asks this; none reads the business type.
* **Seeded** at onboarding (`template.apply` → `features.seed`, from the shop's template, `set_by = 'template'`) and, for every shop that exists, by the migration.
* **`set_by`** is `'owner'` for anything an owner or ALYR's staff chose. A later re-apply of a template never touches an owner's value.
* **Changing one** (`PUT /api/features/{key}`, owners and admins): switching a feature on switches on what it needs; switching one off switches off what needs it; the answer says what moved. Each change is on the activity record (`subject = 'catalog'`, action `features`, who, from-to, and the ones that moved with it). A change that changes nothing writes nothing.

### The migration (0035): nothing changes for any existing shop

For every row of `tenants` it writes a row for every feature stored at the time (`order_on_whatsapp` was registered later, with the merge of ALY-136: a shop with no row for it gets its template's value, on, which is the whole point of resolving through the template; `tests/test_feature_engine_migration.py` says so). Every part of the form and the order page's four extras were always there, so they are on. The two alerts and the sold-out look are copied from the shop's `shop_settings` (alerts on and greyed when the shop has no settings), and a value that is not the one the shop's type starts with is marked `owner`. The legacy columns `shop_settings.alert_low_stock`, `alert_sold_out` and `sold_out_display` stay in the table and are **no longer read**. Four columns are added to `shop_settings` (`section_name`, `section_name_ar`, `layout_style`, `template_key`; empty means the template's). It is safe to run again, and was tested on a database built to the previous migration with data in it, as a superuser owner and as an owner that does not bypass row-level security (`tests/test_feature_engine_migration.py`).

## Templates (`apps/api/src/alyr/shop_templates.py`)

A template says which features start on, what the section is called, how the order page lays out, how a new item runs out, the starter categories and the starter custom fields. **The ten business types that have a catalog, and a plain "Any other business", are built-in templates**, made from `presets_catalog.py` so that a shop of a type behaves as it did. Travel, and a business made in the back office with no type, use the plain template.

### The four things an order page can offer (and Order on WhatsApp)

`pickup_date`, `quick_quantity`, `same_as_last` and `show_sku` were declared per type in `presets_catalog.Layout` and returned by `/api/items/setup`, but **the order page never read them**: it always asked for the day when an item is made to order, put a plus and a stepper on every row, offered "same as last time" to a customer with an earlier order and showed the SKU on the item sheet and in the table. The work's rule is that no shop behaves differently by default, so **every type starts with all four on** (what the page did), and the declared per-type values were removed. They are now real:

| Feature | On | Off |
|---|---|---|
| `pickup_date` | the review asks for the day when an order holds an item made to order | nobody is asked; the order is for the earliest day the shop can do it, and the review says so |
| `quick_quantity` | a plus and a stepper on every row | the row's button opens the item and the customer adds from there (the wholesale table keeps its steppers: they are its input) |
| `same_as_last` | "Order the same as last time" on the page; `POST /api/store/{slug}/orders/repeat` works | the card is gone and the route answers 403 `feature_off` |
| `show_sku` ("Show the item code") | the item's code (ALY-136) and the shop's SKU on the item sheet, the code as a column in the table, and the "Item code 214" line on the item's WhatsApp card | none of them; a customer who knows a code can still order by it in the chat |
| `order_on_whatsapp` (added when ALY-136 merged) | with the shop's number set, a visitor with no link of their own picks items and sends the order to the shop on WhatsApp (the message follows the shop's own `whatsapp_mode`) | the page is told there is no number: no button, no list. The setting `whatsapp_number` and `whatsapp_mode` are not touched |

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

## Custom fields (migration 0036)

A shop adds fields of its own to its items and, where it matters, to each size or colour: **Serves** (a number), **Allergens** (one of a list), **Warranty months**, **Concentration**, **Gift wrap** (yes or no), **Best before** (a date). `modules/items/fields.py`, routes in `routes/custom_fields.py`.

* **A definition** (`custom_fields`, forced row-level security): a `key` that never changes (made from the English name, or the Arabic one, and unique in the shop), a name in English and Arabic, a `kind` (`text`, `number`, `choice`, `yes_no`, `date`) and `applies_to` (`item` or `variant`), both **fixed once made** because what is written in the field would no longer mean the same, the choices of a list (each with a stable `value`, two names and `active`), a `unit` for a number ("ml"), `shown_to_customers`, `searchable`, `required`, an order. At most **20 active fields** a shop and **30 choices** a list.
* **A value** lives in a `custom jsonb` column of the item or the size, keyed by the field's key (why a column, not a table: the value is read with the row it belongs to by the list, the order page and the files, is copied to an order line as it is, takes that row's row-level security and is still queryable; the migration says so). The kind is checked in the application against the definition, in both languages: text up to 200 characters; a number with up to four decimals (Arabic digits accepted); a choice by value or by either name; yes or no; a date as `YYYY-MM-DD`.
* **Archived, never deleted.** An archived field is hidden everywhere and stops being asked for; its values stay on the items and come back if the field is brought back. "12 items use it" is shown before an owner archives.
* **Required** means needed before an item goes on sale (a draft may lack it), on every size that can be sold for a field on sizes. A file that leaves a required field empty makes a draft with a note instead of refusing the row. No starter field is required, so adding an item is as it was.
* **A name that is already a column of the files** (price, SKU, Tags, "Pack size" and their Arabic spellings) is refused with a reason, so a column header always means one thing.
* **Where a field acts**: the item form (a fold **More details**; a field on sizes appears in each size); the items list and its search when `searchable`; **the customer's page** when `shown_to_customers` (the item sheet, the size's own fields beside the size, the order page's search when searchable); the **export and the template file** (one column a field, named as the owner named it); the **import** (a column per field, every value checked, a bad value refused in the language of the file with the row and the cell, the undo puts back what changed, a required one left empty makes a draft). **Each order line keeps what the customer saw** (`order_items.custom`, a list of `{key, label, label_ar, kind, text, text_ar}`), so an order does not change when a field is renamed or archived.
* **Off** (`custom_fields` switched off in Features): the screens stop showing fields, nothing is required, and no value can be added to an item that has none; values stay, files drop the columns unless an item still holds a value.
* **Starter fields** per type (`STARTER_FIELDS` in `shop_templates.py`): restaurant (Allergens, Spice level, Serves), bakery (Allergens, Serves) and a short set for grocery, fashion, shop, wholesale, salon, spa, clinic and home, all in `STARTER_FIELDS`; the plain template has none. A new shop gets its template's fields (`set_by` nothing, not on the activity record: the start of a shop is not a change); the owner edits or archives them like any other.
* **Every change** (added, changed, archived, brought back) is on the activity record with who and what.

## Templates made in the back office (migration 0037)

`business_templates` (a global table: row-level security forced, every signed-in shop may **read**, only the back office **writes**, through `is_back_office()`) holds a template as data: key, names, a note for staff, the type it **stands on** (decides onboarding steps and the price list; empty is the plain Catalog), whether owners may choose it, the section's wording, layout, how a new item runs out, unit, low-stock number, sold-out look, a lead time, the features (on or off, each with its value), the starter categories (at most 12) and the starter fields (at most 20). `modules/items/templates.py` checks all of it, in both languages, the same way the Features screen does: a feature that needs another cannot be on without it, a way of running out whose feature is off is refused, a lead time needs the times and the pickup day. **ALYR's own templates stay in code and are read only**: "Make a copy" starts one of your own from the closest. A key is never reused and never a built-in's. Archiving stops a template being offered to anyone new; the shops that use it keep working.

A template is picked **when a shop is created** (`POST /api/admin/businesses` with `template`: the shop's type, then what the template brings; no sample items) or **later** (below). Every change in the back office is on the audit record nobody can edit (`template.created`, `template.saved`, `template.archived`, `template.restored`, `business.template`).

## Changing a shop's type

`modules/items/template_change.py`. **An owner (or an admin) may change the type at any time, and it only adds.** Catalog → Features → Change type shows the templates the shop may switch to (ALYR's types that have a catalog, and any made one that is offered to owners) and, for the one picked, **a preview that changes nothing**: what it will switch on, the categories and fields it will add (and the fields left out because the shop has the most it can), the section's new name and layout, what stays off because the owner turned it off, what stays on. The preview carries a hash; **the apply must carry it** (`preview_changed` if anything moved since), so exactly what was read is done.

* Nothing is switched off, removed or changed; what the owner set themselves (`set_by = 'owner'`) stays as they set it; a feature that needs one the owner switched off is not forced on; a name or layout the owner chose is not replaced; items, prices, stock, photos and orders are not touched.
* It records which template the shop now follows (`shop_settings.template_key`) and a `template_applied` record on the activity record (from, to, by, what was turned on, which categories and fields).
* The **business type** (`tenants.business_type`: onboarding and prices) is not changed by an owner. The back office can, with "Also change the business type" (`admin_set_business_type`), when it moves a business to a template.
* Applying the template a shop already has adds only what is missing.

## API (the second pull request)

| | |
|---|---|
| `GET /api/custom-fields` (any staff) | `{fields: [{id, key, label, label_ar, kind, applies_to, choices, unit, shown_to_customers, searchable, required, sort, archived, used_by}], active, limits: {fields, choices}, can_manage}` |
| `POST /api/custom-fields`, `PUT /api/custom-fields/{id}` (owner, admin) | a field; `kind` and `applies_to` only when making it. 422 `field_name_taken`, `field_name_needed`, `choices_needed`, `too_many_fields`, `too_many_choices`, `feature_off` (a new field with the feature off), in both languages |
| `POST /api/custom-fields/{id}/archive`, `/restore` (owner, admin) | the same view |
| `POST/PUT /api/items`, `/api/items/{id}` | `custom: {key: value}` on the item and on each variant; 422 `bad_value` and the like, in both languages |
| `GET /api/templates` (owner, admin) | `{current, choices}` |
| `GET /api/templates/preview?to=key`, `POST /api/templates/apply {to, preview}` (owner, admin) | the preview with its `hash`; the apply returns what was done |
| `GET/POST /api/admin/templates`, `GET/PUT /api/admin/templates/{key}`, `POST .../{key}/archive`, `.../restore` (ALYR staff) | `{builtin, made, registry, types, quick_start}`; a template is `{key, name, name_ar, note, based_on, offered, archived, section, section_ar, sub, sub_ar, layout_style, rule, unit, low_stock_at, sold_out, lead_days, lead_cutoff, features, categories, fields, shops}`; `from_key` on a POST copies one |
| `POST /api/admin/businesses` | adds `template` |
| `GET /api/admin/businesses/{id}/template`, `.../template/preview?to=`, `POST .../template {to, preview, set_business_type}` (ALYR staff) | the same preview and apply, for any business |
| `GET /api/store/{slug}` | each item and size carries `fields` (`[{key, label, label_ar, kind, text, text_ar, searchable}]`, only the fields shown to customers) |

## Screens (the second pull request)

* **Features → Manage fields** (the row appears when "Your own fields" is on): the list with what each field is, who sees it and how many items use it; **Add a field** (names in both languages, what goes in it, for the item or for each size or colour, a unit, the choices, who sees it, searched, needed); Edit; Archive (asked first); archived fields in their own fold with "Bring back". A failed save shows its reason beside the Save button.
* **Item form → More details** (and a box in each size for fields on sizes), required ones marked and said to be needed before the item goes on sale.
* **Customer's item sheet**: the fields the owner shows, as a short list, and a size's own beside the size.
* **Features → Change type**: the choice, the preview (what it will add, what stays), "Nothing is removed. Nothing you made is changed." and "Add these".
* **Back office → Templates** (new in the menu, English only like the rest of the back office): the quick start in words, **Your templates** and **ALYR's own**, and the editor (names, what it stands on, whether owners may choose it, section and layout wording, how a new item runs out, the features as switches that move together, starter categories one a line, starter fields). **Clients → Set up a new shop** has a Template choice; **a client's businesses table** has a Template button per business (choose, read the preview, "Add these", optionally also change the business type).

## How a founder serves a brand-new kind of client

Example: a perfume shop. Nothing is written in code.

1. **Back office → Templates.** Read the quick start: *New kind of client? Start from the closest template, switch features, save.*
2. Find the closest of ALYR's own (for a perfume shop, **Shop**) and press **Make a copy**.
3. Name it ("Perfume shop"; Arabic "متجر عطور"), say what it stands on, and tick "Owners may switch to it themselves" if existing shops should be able to move to it.
4. Words and look: section name **Fragrances** / **العطور**, a line under the title, the order page layout.
5. A new item: how it runs out, how it is sold, the low-stock number.
6. Features: switch off what this client does not use (a perfume shop has no times to order, so "Times it can be ordered" goes off and "Pickup or delivery day" goes with it); leave on what they do (sizes, tags, price groups for wholesale).
7. Starter categories, one a line: `Oud | عود`, `Floral | زهري`, `Gift sets`.
8. Starter fields: **Add a field**: *Concentration* (one from a list: Parfum, Eau de parfum), *Volume* in ml (a number, for each size), set customers see it and it is searched.
9. **Make the template.** It is in the list at once.
10. **Clients → Set up a new shop**: fill the owner's details and choose **Perfume shop** as the template. The owner signs in and finds the section, the categories, the fields and the feature set already there. They can change any of it in Catalog → Features.
11. A shop that already exists moves to it from **Clients → the business → Template**: read the preview, press **Add these**. Nothing is removed.

If the template needs something new later, edit it; shops that already use it keep what they have (a template is a start, not a rule), and moving them again adds only what is missing.

## How it is checked

* `tests/test_feature_registry.py`: the registry's invariants (words in both languages, no jargon or promise, dependencies first, extension points hidden and mute, every template covers exactly the stored features).
* `tests/test_feature_engine_identical.py`: **for each of the eleven business types, a shop made through the real onboarding path is compared with `tests/golden/types_before_features.json`, captured by running `origin/main` before this work**: navigation, home cards, `/api/items/setup`, settings, categories, what the order page is told, whether a full item (sizes, choices, a daily limit, tags, pack size, a lead time) is accepted for every way of running out, the columns of the export and the template file, onboarding's review, samples. The differences are the deliberate ones only (the four extras, `report_lines`, the new keys), written in the test.
* `tests/test_feature_engine_migration.py`: 0035 on a database with data, twice, for every type and for what an owner had changed.
* `tests/test_features_api.py` and `test_features_wording.py`: the screen's answer, the cascade, the record, who may change what, isolation between shops, off and on for each feature (the form's guards, the order page, the files, the report, the cards, the chat, the alerts), the section's name and layout.
* `tests/test_custom_fields.py`: definitions (names, kinds, places, choices, limits, name clashes, rename, never the kind), the record, who may write, isolation, a value for each kind, refused values in both languages, fields on sizes, required, archive and restore, the feature off, what customers see, search, the order line's snapshot, the export and template file, the import (every value checked, update, undo, sizes, a required one empty, a column left out when the feature is off, Arabic), starter fields for every type.
* `tests/test_templates.py`: the back office's list and registry, making a template from the closest, refused ones in both languages, built-ins read only, the audit record, who may write, a business made with a template (wording, features, categories, fields) or without, an archived one, the preview and the apply (adds and removes nothing, keeps what the owner set, needs the preview's hash, adds only what is missing), who may choose among the offered, the back office's per-business change, and **a perfume shop served by configuring, not coding**.
* The browsers: `scripts/feature-engine-browser-check.mjs` and `scripts/custom-fields-browser-check.mjs`.

## Not built, not checked

A real phone and screen reader; the Arabic by a native speaker (ALY-66); a try with a real owner; the screens in Safari; the back office in Arabic (it is English only). The extension points above. An owner on self-serve sign-up (`/start`) does not choose among made templates: they start from a type; the back office or a later change of type brings a made one.
