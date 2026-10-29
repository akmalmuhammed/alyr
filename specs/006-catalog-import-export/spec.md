# Spec 006: Catalog import and export (Excel and CSV)

Status: built in ALY-108 (package 7 of the Catalog, ALY-101). Decision: D-039 (its "As built (ALY-108)" lists where the code fixed a detail). The engine under it is `specs/001-catalog-engine/spec.md`, the screens are `specs/002-catalog-screens/spec.md`, SKU and customer price groups are `specs/003-price-groups-and-sku/spec.md`, the Catalog on WhatsApp is `specs/004-catalog-whatsapp/spec.md`. This folder is numbered 006 because 004 and 005 were taken while it was being built. Plan scenarios 20 and 21 are the done-criterion; the issue adds "a spreadsheet of 500 items imports from a laptop and a phone".

Hidden until go-live like the rest of the Catalog: the routes answer where `orders` or `catalog` is switched on, the entry is inside the Catalog screen (module `catalog`, off for every shop), and nothing says "coming" or "beta" (a test reads every sentence the import can say).

## What the owner can do

* **Download a template** for their kind of business (any business, restaurant and café, bakery, grocery, fashion and gifts, shop, wholesale, services), as Excel or CSV, with English or Arabic column names. Three made-up examples show how to fill it; the Excel file also has a "How to fill" sheet and drop-downs for the words.
* **Download every item** the same way (`Item ID` first), as Excel or CSV, in either language: one row for each size or colour, prices, sale, unit, stock, category, tags, status, how it runs out, descriptions, and a link to each photo. Edited in Excel and uploaded again it updates exactly those items.
* **Upload** an Excel (.xlsx) or CSV file. Nothing is saved: the screen shows a **preview of every row**: what will be added, updated, left as it is, skipped, and which rows are left out and why, each with its row number, in English or Arabic.
* **Choose what happens to a name that is already in the catalog**: add another item (the default, warned), update the item with that name, or leave the row out. The preview is worked out again without sending the file again, and without reading it again: a sheet (and a zip's list of photos) is read once, when it arrives, in a worker thread and before a transaction is open, and what was read is kept with the upload until it is applied (ALY-278).
* **Add a zip of photos**, matched to rows by file name, and see how many matched, which files were not used and which cannot be photos.
* **Import**: the good rows go in; the bad rows stay out and are listed with their row and reason. The import is applied in one go, from exactly the preview that was shown, and is on the activity record with who did it.
* **Undo** the newest import, once.

## How a file is read

One row is one size or colour of an item. A row with a name starts an item; a row under it that repeats the name (or leaves it empty) and has a size or colour is another of that item's sizes. Rows with the same `Item ID` are one item wherever they are. Two separate items that happen to share a name are never merged.

The header row is found in the first ten rows (a title above it is fine) by its words, in English or Arabic, in any of several spellings (`columns.py`); a column that is not understood is named and ignored. An item is identified by its `Item ID` (what an export writes) or, for a new item, by its name.

| Column | Reads |
|---|---|
| Item ID | An item that exists in this shop. An ID that is not in this shop (another shop's export, a deleted item) is an error for that row. Leave it empty for a new item |
| Name (English), Name (Arabic) | One may be empty: an Arabic name in the English column is also used as the Arabic one, and the reverse |
| SKU, Size or colour SKU | The item's code and each size's code (ALY-127), up to 40 characters, never used twice in the shop across items and sizes (case does not matter; an archived item and a switched-off size keep theirs), nor twice in the file. A clash is an error for the row that causes it and names what has the code ("already used by Shirt (Small)"). An empty cell keeps the code; the code on an item's one unnamed size goes in the second column |
| Category | Compared ignoring case and the Arabic spellings; a new one is created and listed in the preview, one that is a letter off another is pointed out |
| Price, Sale price, Price difference | QAR, with Arabic or English digits, a comma or a space between thousands, `QAR` or `ر.ق` beside it. `1.250` is refused as ambiguous, not guessed. A sale price of `0` ends the sale |
| Sale starts, Sale ends | A date (`2026-10-31` or `31/10/2026`) |
| Low-stock number | The item's own low-stock number (ALY-106), 0 to 100,000, for an item counted in stock or by a number each day. Empty keeps the item's number, which is the shop's number from Catalog settings when it has none of its own. A number for an item that is not counted is not used, with a warning. There is no way to go back to the shop's number from a file; that is done on the item's screen |
| Sold by, Smallest order, Units in a pack | `piece kg box pack portion hour` (or the Arabic words), 1 to 999, a whole number |
| Tags | Separated by commas, semicolons, the Arabic comma or a bar |
| Status | Draft, On sale, Hidden, Archived (or the Arabic words) |
| How it runs out | Always available, On or off, Counted in stock, A number each day. Empty: counted when a stock number is given, else on or off |
| Available, Size or colour (and Arabic), In stock, Per day | Yes or No; names; whole numbers |
| Description (and Arabic), Photos | Text; file names (or an ALYR photo link from an export) separated by commas |

* **An empty cell keeps what the shop has.** A cell that is wrong leaves the whole item out and says which row; the other items are not affected.
* **An item that cannot go on sale yet** (no price, no Arabic name) is added as a **draft**, and the row says so. An item that runs out by a number each day needs that number for every size, drafts included (the engine refuses a size without), so a missing number is an error for the row, for a new item and for an update that would leave a size without one.
* **Duplicate names** are warned about (against the catalog and inside the file) and never merged; two rows are one item only when they repeat the name with a size or colour, or share an ID.
* **Stock numbers are not edits.** A stock number for a new size is written to the stock log as an `opening` movement and for an existing size as a `counted` movement (the difference is recorded), both with the reason "Import" and the person's name. A number equal to the system's writes nothing. A stock number for an item that is not counted is left out with a warning. **An import never sends the owner an alert for each item.** A stock number in a file is a count, and on any other path one that takes a live counted item down to its low-stock number or to nothing queues that item's own alert (ALY-106). The import's stock moves carry a flag (`stock.move(..., alerts=False)`, `stock.count(..., alerts=False)`, `events.stock_changed(..., alerts=False)`) that skips only those owner alerts: every other path is unchanged, and a customer waiting for an item ("tell me when it is back") is still told when an import adds stock. The undo's counts are quiet too. In their place the managers get **one message after an apply that counted stock**: "After your import, N items are low or sold out." (`import_alert.py`, a job queued in the apply's transaction). It reuses the alert rules and adds none: the managers (`staff.managers`), in their language; not between 22:00 and 07:00 on the shop's clock (it looks again at 07:00); the items it counted are recorded in `stock_alerts` like any alert, so a sale that afternoon does not say it again. There is **no new template**: it is plain text, so it goes only to a manager whose 24-hour window is open, and for one whose window is closed nothing is sent and nothing is recorded (not even a refused message in the inbox); the Low stock filter and the Home cards show the same numbers. An import undone before the job ran says nothing.
* **Formulas are never calculated.** An Excel cell that holds a formula gives the value the file saved, and the row says so (`formula_value`); a formula with no saved value is empty. A text cell that starts with `=`, `+`, `-` or `@` is kept as plain text and pointed out.
* **Photos.** The zip is only listed in the preview (nothing is unpacked or stored as a photo). After the import is applied a background job adds each photo through the same checks as any upload (type by content, size, pixels, location data removed) and puts it on its item; one that cannot be used is named with the reason and the others carry on. An item gets up to eight. With `ALYR_JOBS_INLINE=true` (the default, for a laptop) the job runs before the apply answers; on a server it runs in the worker and the result screen shows its progress. A row with no photo names takes a file called like the item. Web links are never downloaded.
* **Not in the file:** options and extras, schedules and category order (edited on screen); **customer price groups and their prices (ALY-127)**, which are about who is buying and not about the item, and a file that mixes both is easy to get wrong: the price column is the usual price, and the wholesale template says so; the shop's own low-stock number, the staff numbers and who is a manager, the "tell me when it is back" requests and the consent behind them (ALY-106), which belong to people and not to items (the importer reads and writes none of them and `core/consent.py` is not touched). An import never switches off a size, deletes an item, or touches what a column does not name.

## Files that are refused (nothing is stored)

`.xls` (old Excel) and `.xlsm` (macros) with a message that says what to save instead; a password-protected file; a file that is not a spreadsheet; a damaged zip, a bad checksum, a document type or entity declaration in the XML (found by the parser itself, so whatever the encoding and wherever it sits); an `.xlsx` or zip that unpacks to far more than it says (parts over 32 MB, 64 MB in all, a ratio over 200 for sheets and 30 for photos, more than 400 parts, more than 600 photos, a zip whose list of parts is over 1 MB, or a photo zip of more than 1,800 entries, folders and a Mac's files counted); a sheet over 5 MB (`ALYR_CATALOG_IMPORT_MAX_BYTES`), a zip over 40 MB (`ALYR_CATALOG_IMPORT_MAX_ZIP_BYTES`); more than 3,000 rows. A cell address or row number that no sheet can have (more than three letters or seven digits, or a row outside 1 to 1,048,576) is not worked out: the cell or row is placed after the one before it (ALY-278). CSV from Excel is read as UTF-8 (with or without the mark), UTF-16, Arabic Windows (cp1256) or Western Windows, separated by comma, semicolon or tab. The shop's item limit (`ALYR_CATALOG_MAX_ITEMS`) leaves out the rows that do not fit, and deletes nothing.

## Tables and API

Migration 0028 (main holds 0025 the ledger, 0026 price groups and SKU, 0027 the Catalog on WhatsApp): `item_imports` (the uploaded sheet until it is applied, its options, the optional zip until its photos are in, the counts and problem rows, what was done to each item for the undo, the photo job's progress, who and when), tenant-owned with forced row-level security.

All under `/api/items`, included before `routes/items.py` so `/export` is not read as an item's ID. Anyone signed in can download; uploading needs the right to edit items (owners and admins, and agents when the owner allows it).

| Call | Does |
|---|---|
| `GET /export?format=xlsx\|csv&lang=en\|ar` | Every item |
| `GET /import/kinds`, `GET /import/template?kind=&format=&lang=` | The templates, and the one that suits the shop's business type |
| `POST /import?filename=&on_duplicate=` | The sheet as the body; answers with the preview and its `hash` |
| `GET /import/{id}`, `POST /import/{id}/options`, `DELETE /import/{id}` | Look again, change what happens to a name that exists, throw it away |
| `PUT\|DELETE /import/{id}/photos` | Add (or take away) the zip |
| `POST /import/{id}/apply` | `{preview: hash}`: applies exactly that, in one transaction; `409 changed_since_preview` if the plan is not the one shown |
| `GET /import/last`, `GET /import/recent`, `POST /import/undo` | The newest import, the history, the one undo |

**Apply is one transaction.** If anything unexpected fails (a rule the preview could not foresee), nothing at all is changed and the message names the row. Rows the preview left out stay out; that is by design (scenario 20), not a failure.

**Undo** puts back the newest applied import: items it added are removed (archived instead if they have been ordered or moved since), items it changed get their old values, sizes and stock back (a stock number that changed since is left), and anything edited since is left alone and named. It also takes off the photos it added.

## Screens

"Import / Export" in the Catalog's action row (for everyone; the upload is only for those who may edit), a sheet with: Upload a file, the template (kind of business, Excel or CSV), the export, the language of the downloaded files, recent imports. The preview shows four counts, drafts, stock numbers, new categories, the choice for names that exist, the rows left out (open), the rows to look at, what will be added and updated (with before and after), and a Photos part for the zip. After the import: the counts, the photos coming in, the rows left out, Undo. A phone uses its own file picker. English and Arabic with right-to-left, light and dark, phone first; every word is in `catalogCopy.ts` (`imp`) and the row messages in `import_words.py`. The Arabic is a draft until ALY-66.

## How it is checked

`apps/api/tests/`: `test_catalog_files.py` (numbers and words in either language, CSV encodings, `.xlsx` read and written, zip bombs, macros, `.xls`, damaged parts, hostile numbers, and since ALY-278 cell addresses and row numbers no sheet can have, document types in any encoding, a zip that lists too many parts, and what was read kept as JSON), `test_catalog_import_scenarios.py` (**scenarios 20 and 21**), `test_catalog_import_apply.py` (stock through the log, all-or-nothing, the hash, the record, drafts, undo), `test_catalog_import_files.py` (the export reads back as no change in both languages and formats, edited exports, formulas, files from an Arabic Excel, size and row caps, the item limit, **500 items**), `test_catalog_import_photos.py` (the zip), `test_catalog_import_sku.py` (the codes), `test_catalog_import_low_stock.py` (the item's low-stock number in, out, updated, undone; an import queues no owner alert for its items, any other count still does, customers waiting are still told), `test_catalog_import_alert.py` (the one message: once, in either language, not at night, only inside the window, not again that day, not after an undo), `test_catalog_import_daily.py` (a number each day for every size), `test_catalog_import_access.py` (roles, hidden module, isolation between shops, old previews, no "coming soon"). The `.xlsx` reader and writer were also checked against openpyxl (not a dependency; run once with `uv run --with`) in both directions.

`scripts/catalog-browser-check.mjs --only import` (headless Edge, 375 px, English and Arabic; light, dark, as an agent, on a laptop; axe-core finds nothing): the four downloads, a file with bad rows previewed, imported and undone, 500 items previewed and imported and undone (phone and laptop), the export of those 500 uploaded again as no change, the Excel template uploaded as it is, a zip of photos matched and added.

Not checked: a real phone or its file picker, real Excel or LibreOffice opening the files we write (they were read back by openpyxl), a file from a real Arabic Excel (cp1256 and semicolons are covered by a test file, not by Excel), the Arabic by a native speaker, a shop near its 1,000-item limit with photos, R2 (local disk), and a worker running apart from the web server for the photo job (the job runs inline in tests and the browser run).

## Left for other packages

Customer price groups (ALY-127): group prices and a customer's group are not in the file. Category order and Arabic category names. Option groups and schedules in the file. Templates that name the section by business type (ALY-107). A back-office usage screen (ALY-109).
