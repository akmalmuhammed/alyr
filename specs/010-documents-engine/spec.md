# Documents 1: the engine

Status: built in ALY-138 (package 1 of the Documents feature, epic ALY-137). Decision: D-042. Later packages that sit on this one: ALY-139 (receipts and invoices from sales, and delivery), ALY-146 (workspace screens), ALY-141 (standalone mode), ALY-142 (connected mode, per-shop invoice authority), ALY-143 (quotes, statements, credit notes, recurring, export), ALY-147 (ALYR's own invoices), ALY-145 (country packs, parked).

A shop can issue a receipt, an invoice, a quote, a delivery note, a statement, a credit note, a deposit receipt or a proforma at the moment of sale. The paper is numbered without gaps, carries Arabic when it is for a consumer in Qatar, can never be changed after it is issued, and is a PDF the shop can hand over or print on A4, A5 or an 80 mm roll. The shop's accountant, or another system, takes it from there.

This package is the engine only: the tables, the numbering, the issuing service and its API, the shop's document settings, the preview, the PDF. It has no screen and no hook into orders, bookings or the ledger, and the module is off for every shop.

## What is true in the law, and how sure we are

All secondary sources, read on 19 Oct 2026. None is legal advice; the lawyer's answers are ALY-51.

| Fact | Where it comes from | How sure |
|---|---|---|
| Qatar has no VAT today. | Consultancy notes on the e-invoicing law (PwC Middle East, KPMG, Sovos, May to June 2026) say a VAT regime is anticipated and not in force. | Fairly sure. Tax is therefore in the model and off by default. |
| The Cabinet approved a draft e-invoicing law and its executive regulations on 6 May 2026. It is not yet enacted, no technical specification is published, and the model (clearance, reporting) is not announced. Analysts expect 2027. | KPMG and PwC alerts of May 2026, Sovos, Comarch. | Sure of the approval, unsure of everything after it. D-008 stays: parked. Sequential numbers and a clean, hashed record are what a later serializer needs. |
| Consumer invoices must be in Arabic: MEC Circular No. 5 of 2016, under consumer protection Law No. 8 of 2008, and MOCI's obligations on merchants. | Gulf Times and Qatar Tribune reports of 2016 and 2017. | The existence of the rule: sure. **Its exact wording: not confirmed.** One report says Arabic must be the *main* language of an invoice; another that Arabic must be *available in addition to* other languages. We enforce the weaker reading (Arabic cannot be switched off for a consumer) and warn on the stronger one (a consumer document that leads in English). Whether the circular is still in force and unamended is not confirmed. Question for the lawyer. |
| Commercial books and the documents behind them are kept ten years, and in Qatar. | Trade-portal summaries (Lloyds and Bank of Scotland trade pages, quoting Commercial Companies Law No. 11 of 2015); template sites. | **Not confirmed**: no article was read. `kinds.RETENTION_YEARS = 10` and `RETENTION_CONFIRMED = False`; the API says "10 years, not confirmed". An issued document is never deleted whatever the answer is. "In Qatar" is one more reason the PDFs are in the database, not in R2. |
| A shop with no commercial registration (CR) number should not issue a tax invoice. | The product lead's brief. | Our reading: such a shop issues receipts, and each says so (below). Ask the lawyer whether it may issue an invoice at all, and whether a home-business licence is enough. |
| Saudi ZATCA, UAE Peppol and Oman Fawtara are separate regimes. | Known. | Country packs (ALY-145), parked. A document already carries a currency and its exponent, a language setting and a hashed canonical content, which is what they would attach to. |

## The decisions in this package

1. **One table for eight kinds.** `documents`, `document_lines`, `document_files`, `document_settings`, `document_series` (migration 0033). What differs between kinds is a small table in `kinds.py` (needs a customer, needs a CR number, how it records money, what its second date is called), not an `if` ladder.
2. **Money is whole minor units** (dirhams: 1 QAR = 100), `bigint`, as in orders and the ledger. Currencies carry their exponent (QAR 2, KWD 3), copied onto the document. A quantity is `numeric(12,3)`. Rounding is one rule, half up per line (price times quantity, less the discount; tax on that), and it is a `CHECK` on the line, so the code and the database cannot drift (a test runs 400 random lines through both). No float exists in the code that handles money (a test reads the source), the schema has no float column (a test reads the catalogue), and the API refuses `10.5` and `10.0` for an amount (`StrictInt`).
3. **Tax is in the model, off by default.** A line has a rate in basis points and a tax amount; a shop turns tax on in its settings; with it off a line with tax is refused. An invoice is called "Tax invoice" only when it carries tax *and* the seller has a tax number; otherwise it is "Invoice". Tax is exclusive of price; inclusive pricing is for the country pack that needs it.
4. **The PDF is stored in the database**, in `document_files` (insert-only), not in R2. Hard rule 2 and `data-residency.md` say R2 holds product photos and "never customer data, documents or ID photos"; an invoice carries a customer's name and phone number. It also makes the number, the PDF and the hash commit together or not at all. A document is 25 to 60 KB. A Qatar object store behind the existing `Store` interface (`core/storage.py`) is the move when volume asks for one (25,000 to 40,000 documents is 1 GB); the interface was not used now because its only production backend is R2 and its keys are photo keys.
5. **The logo and the stamp are kept in the settings row** (small PNGs, checked by `core/images.py` like a product photo: by content, no SVG, no metadata, no animation), not fetched from a store at draw time. A document remembers their SHA-256, not their bytes; its PDF has them drawn in.

## Numbering

`document_series`: one row per shop, kind and series, with a prefix (letters and digits, `INV`), padding, whether the count restarts each year, and the last number. Issuing, in the issuing transaction:

1. lock the series row (`select ... for update`, `numbering.LOCK_SERIES`),
2. work out the next number from what the row says now, and write it back,
3. draw the PDF, store it, hash the content, flip the status.

A failure at any step rolls back the transaction and the counter with it: no number is spent. Postgres sequences are not used because they do not roll back. The number is `PREFIX-0042`, or `PREFIX-2026-0042` where the series restarts each year (the year is the shop's local year: a document issued at 01:00 on 1 January in Doha is already the new year, though it is 22:00 on 31 December in UTC). The time of issue is taken *after* the lock, so numbers and times run in the same order.

Guards in the database, so the application can be wrong without a duplicate or a hole being stored: a trigger lets a counter move up by exactly one, or restart at 1 when the year has gone forward; a unique index on `(shop, number)`; a unique index on `(shop, kind, series, year, seq)`; and the issue trigger demands that the document's `seq` is the counter's current value.

Cost of the lock: the PDF is drawn while it is held, so a series issues about 3 to 7 documents a second (a draw is 140 ms for an A4 page and up to 280 ms for A5 and the roll, which are drawn twice to measure them; best of 20, warm, in the API's image on a laptop). A shop issuing one every few seconds is fine; a connected POS issuing in bursts would want the draw moved before the lock with the number written afterwards, which means drawing the number as a later stamp. Not needed now.

## Immutability

A trigger on `documents` refuses every UPDATE and DELETE of a row whose status is `issued` or `void`, except one: `issued` to `void`, which may change only `status`, `voided_at` and `voided_by_document_id`, and only when issued credit notes that point at this document add up to all of it. A trigger on `document_lines` refuses any insert, update or delete when the parent is not a draft (it locks the parent `for share`, so a line cannot slip in while another transaction issues). `document_files` takes no update or delete (the application role has no privilege, and a trigger stops the owner). The issue transition itself is checked in the database: lines present, totals equal the lines' sums, payments equal what is recorded as paid, the PDF exists and its SHA-256 matches, the number is the counter's, and for a credit note the credited sum stays at or under the invoice.

Proved as the application role, and as the table owner, in `test_documents_immutability.py` (47 tests): every column, a no-op update, delete, every line change, the PDF, the three ways the application might try to switch the trigger off, a void with no credit note, with a partial one, with another document's.

## The hash

SHA-256 of the issued content as canonical JSON (`canonical.py`): sorted keys, no spaces, UTF-8 with Arabic as Arabic, money as integers, quantities as three-decimal text, instants in UTC with microseconds, UUIDs as text, no floats (a float raises). In it: who sold, to whom, every line, the totals, payments, notes, terms, the number, the dates, the currency, the language, the source and the link to a credited document, and the document's own id. Not in it: the look (layout, colour, the pictures' bytes; only their hashes, inside the seller), who pressed the button, the status (a voided invoice has the content it had). `hash_version` is stored; a later layout of the JSON is a new version. `GET /api/documents/{id}/verify` recomputes it from what is stored and checks the PDF's SHA-256. The first 16 digits are printed at the foot of the paper (a later package turns them into a QR code). A test pins the hash of a fixed example, so a quiet change to the canonical form is caught.

## Issuing and the API

All under `/api/documents`, behind `require_module("documents")` (403 for a shop without it).

| Call | Who |
|---|---|
| `GET /meta`, `GET /` (list; filters kind, status, q), `GET /{id}`, `GET /{id}/pdf` | anyone; an agent sees only the documents they made |
| `POST /` (a draft; with `issue: true` and an `Idempotency-Key`, issued in one request), `PUT /{id}`, `DELETE /{id}` (drafts only) | anyone; an agent edits only their own |
| `POST /{id}/issue` | owner, admin; an agent only when the shop has allowed it (`agents_may_issue`, off) and only their own draft |
| `POST /{id}/credit-note`, `GET /{id}/verify`, `GET /{id}/activity` | owner, admin |
| `GET/PUT /settings`, `PUT/DELETE /settings/{logo|stamp}`, `GET /series`, `PUT /series/{kind}/{series}` | owner, admin |
| `POST /preview` | anyone, for their own draft or any kind |

An `Idempotency-Key` (8 to 80 characters) makes a retried issue return the document it already issued, with `replayed: true`; the same key on another document is 409; six identical requests at the same moment make one document (an advisory lock on the key). Without a key, issuing twice is 409 `already_issued`. Errors carry a `code`, the English words in `detail` and the Arabic in `message_ar`. Every step is on the activity record (`subject = 'document'`) with who and, for changes of settings, what (never the bank details' text).

What each kind needs before it gets a number (`kinds.py`, `prepare.check_issuable`): lines; a total above zero (a delivery note and a statement may be zero); a customer for all but a receipt and a credit note; a receipt paid in full; a deposit receipt with an amount received; no payment on a quote, a proforma, a delivery note or a credit note; a reason on a credit note; the seller's name; and, for an invoice or a proforma, a CR number.

**A shop with no commercial registration number issues receipts.** It cannot issue an invoice or a proforma (422 `registration_needed`, with words that say to add the number or issue a receipt), and every document it issues says "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice." The rule is enforced where the number is taken, so no screen can bypass it.

**Arabic and consumers.** A document has an audience (consumer or business; the shop's setting is the default). Arabic cannot be switched off for a consumer: saving the settings, making a draft and issuing all refuse an English-only consumer document with `arabic_required`. A business document may be English only. Also warned (not refused): a line with no Arabic description, a seller with no Arabic name, notes or terms with English and no Arabic, and a consumer document that leads in English.

**Credit notes.** A credit note is a new numbered document (`CN-0001`) that points at the invoice, receipt or deposit receipt it cancels, in whole (once, no lines) or in part (lines; the sum of credit notes cannot pass the original). When they add up to all of it the original becomes `void`; it stays, with its number, its PDF and its hash. Only an owner or admin can issue one.

## Branches and cash rounding (added to ALY-138 on 19 Oct)

**Branches.** A shop with more than one place gives each its own series of numbers. `document_branches` holds the shop's places: `main` (the shop itself, always there, never off) and any others with a key, a code (1 to 4 capitals or digits, chosen once), a name in both languages and, if wanted, their own address and phone. A branch's series is the kind's prefix plus its code: `INV-0042` for the main place, `INVLUS-0007` for the branch whose code is LUS (a series key is the branch's key, so the counters, the locks and the guards are the ones above). A draft names its branch (`branch`, default `main`); the branch must exist and be switched on; on issue the branch's address and phone replace the shop's in the seller copy, and the paper says "Branch: Lusail". A branch is switched off, never deleted; a credit note is still issued from the branch of the invoice it cancels, even if the branch is off. Owners and admins set branches up (`GET/PUT /api/documents/branches/{key}`); two branches issue at the same moment without waiting for each other.

**Cash rounding.** `cash_rounding_minor` in the settings: 0 (off) or 5, 10, 25, 50, 100 minor units. For a receipt, an invoice or a deposit receipt the total is taken half up to the nearest step, and the difference is the document's `rounding_minor`, its own line on the paper ("Rounding", `+0.02` or `-0.02`), never inside a price (`gross - discount + tax + rounding = total` is a CHECK). A receipt is paid at the rounded total, so the screen reads the draft's totals before it records the payment (a payment of the unrounded amount is refused as `overpaid` when it rounds down). A credit note that brings the credited amounts up to the original's takes the original's rounding with it, so credit notes can add up to a rounded document and void it; a partial one has none. Money is still to the currency's own decimals (QAR 2); the rounding rule per line is above.

## Settings

`document_settings`, one row per shop, made on first use: the seller (name in both languages, CR, tax ID, licence number, address, phone, email), currency, tax on or off and a default rate, languages (`ar_en` Arabic first, `en_ar`, `ar`, `en`), the default audience, layout (A4, A5, thermal 80 mm), the brand colour, a logo, a signature or stamp, which optional things show (SKU, discounts, the customer's tax ID, bank details, signature, "Issued with ALYR"), the bank details, header and footer in both languages, terms and notes per kind in both languages (copied onto a document that has none of its own), whether agents may issue, and the cash rounding. The seller and the customer are copied onto a document when it is issued, so a later change never rewrites one. A brand colour is refused if it is under 3:1 against white (too pale to print as a rule) and used for the title only if it reaches 4.5:1; otherwise the title is Carbon.

## The PDF: the spike

Hard requirements: Arabic shaping, joining, diacritics and bidi including mixed Arabic, Latin and Western digits in one line; tables in RTL; A4, A5 and 80 mm; an embedded OFL Arabic font; small and fast; runs in the API's image and on CI on Linux without paid services; no network at draw time; deterministic.

One sample page (Arabic with diacritics, an Arabic line with an invoice number, a phone number and a date, a mixed Arabic and English table, a total with «ر.ق», A4 and 80 mm), drawn by each candidate in the API's own Docker image (`uv` on Python 3.13, Debian bookworm slim), read back with poppler and looked at as PNG, on 19 Oct 2026.

| | fpdf2 2.8.9 + uharfbuzz 0.56 (chosen) | WeasyPrint | reportlab + arabic-reshaper + python-bidi | headless Chromium |
|---|---|---|---|---|
| Shaping and joining | Right (HarfBuzz) | Right (Pango, HarfBuzz) | Right: presentation forms | Not tried |
| Diacritics | Right, placed by the font's GPOS | Right, best of the three | **Wrong**: marks float and collide (no GPOS) | Not tried |
| Bidi, mixed text | Right for free text; wrong around the Unicode isolates (we do not use them: numbers are their own runs) | Right | Right via python-bidi | Not tried |
| RTL table | By hand: the columns are placed from the page's start edge | Native CSS | By hand | Native CSS |
| Text read back | Glyph order; letters right, order guessed by the reader | Same | **Presentation forms** (searching the PDF for a word fails) | Same family |
| System libraries | **None.** Pure Python plus a 2 MB HarfBuzz wheel | Pango, pangoft2, harfbuzz-subset: an `apt-get` step in CI and in the image | None | A browser, about 250 MB, and a process per draw |
| Draw time of the sample | 75 ms (the real documents: 140 to 280 ms, two passes included) | 124 ms, but 1.2 s to import | 9 ms | not measured |
| File | 25 KB | 17 KB | 32 KB | not measured |
| Deterministic | Yes: same bytes for the same input (fixed creation date, no random ids) | Not tested | Not tested | Not tested |
| Licences | fpdf2 LGPL-3.0, uharfbuzz Apache-2.0 | BSD-3 | BSD | BSD |

Chosen: **fpdf2 with uharfbuzz.** It is the only one that is both correct on every hard requirement and installs from wheels, so it runs in CI (`uv sync --locked`, no apt) and in the existing image with no change. WeasyPrint draws marginally better diacritics and gives CSS tables for free, and would have been the pick if a system package were free to add; here it would change CI and the image for a gain nobody can see on paper. reportlab fails on diacritics. Chromium was not built or measured: its size and a browser process per document answer "lightest" on their own. fpdf2 is LGPL-3.0; we import it unmodified as a library, which the licence permits, and it is replaceable (the drawing is behind `render(doc) -> bytes`).

What fpdf2 does not do well, and what we did about it: its bidi code mishandles the Unicode isolate characters, so none is used; a bare phone number inside an Arabic sentence is reordered by any bidi algorithm ("+974 5555 0100" becomes "0100 5555 974+"), so every number, phone number, identifier and amount is drawn as a run of its own and the Arabic is placed around it (a test fails if a drawn string mixes Arabic with such a number); a string with any Arabic in it is set wholly in IBM Plex Sans Arabic (which carries the Latin glyphs), because splitting a string between two faces broke the diacritics' placement. The text layer of a PDF is glyph order, so extraction of Arabic is guessed by the reader (every PDF engine has this); a later package may add `ActualText` marked content for exact search and copy.

Fonts: IBM Plex Sans Arabic and Instrument Sans (the brand's, `docs/brand.md`) and IBM Plex Mono for the code, all SIL Open Font Licence 1.1, in `modules/agent/fonts/` with their licence files (the report card draws with the same files). Embedded as subsets; nothing is fetched while drawing. Colours come from `brand.py`, which the design check enforces.

### How it was looked at

I looked at the PNGs of every case in the gallery (A4, A5 and the roll; Arabic first, English first, Arabic only, English only; branded with a logo, stamp, signature, bank details and header and footer; the unregistered note; a credit note; a long table over three pages; the preview with its watermark; an amount too large for its column), found and fixed: the table heading repeating on a page with no rows; the totals' amounts sitting under the labels in the mirrored layout; labels aligned to the wrong edge in Arabic; a currency symbol running off the page; the signature costing a whole extra page (it now sits beside the totals); A5 overflowing; and an Arabic discount line in which "-5.00" came out as "5.00-". The PNGs are not committed (they are reproduced by drawing the sample documents in `render/sample.py`).

## What the document looks like

A restrained page. At the top the seller (logo, name in both languages, CR and licence, address, phone and email); against the other edge the title, large, in the shop's colour when it can be read; a heavy rule; a strip of the number, the date (written out: «19 أكتوبر 2026», "19 Oct 2026") and the due or valid-until date; the customer, and what was paid or what is being credited; a table of lines with the item number, description in each language, quantity and unit, unit price, discount, tax and total (a column appears only if something is in it, SKU only if the shop wants it); the totals box with the total on a wash, large; notes, bank details and terms in two columns (Arabic against the right, English against the left); the registration note; the signature and stamp beside the totals; and a foot on every page with the document's code, "Page 1 of 2" and "Issued with ALYR" (off if the shop likes). Arabic first mirrors the whole page. The bottom corner at the start edge, a 22 mm square, is left empty and kept free by the layout (no block may reach it; one that would starts the next page): the place for a later payment or verification QR code. The 80 mm roll is one centred column with "quantity × price" under each description and the total at the other end, as long as it needs to be.

## Tests

| What it proves | Where |
|---|---|
| Numbers run per kind and shop; prefix, padding, yearly restart (and the Doha midnight); a failed issue gives its number back (a failed draw, and a failure after the number is taken); twenty at once give twenty numbers with no duplicate and no hole; with some failing, no hole; the counter cannot be wound back or skipped by the application | `test_documents_numbering.py` (14) |
| The same scenario breaks when the row lock is taken out of the statement | `test_..._breaks_when_the_row_lock_is_taken_out` (the suite proves its own sensitivity) |
| Immutability at the database as the application role and as the owner | `test_documents_immutability.py` (47) |
| Hash reproducibility, field by field sensitivity, pinned value, tamper detection | `test_documents_hash.py` (50) |
| Drafts, issue, idempotency (and six at once), credit notes (whole, part, over, again), roles, the module off, the language rule, the registration rule, the preview takes no number, RLS isolation | `test_documents_flow.py` (38) |
| Money: rounding against Postgres on 400 random lines, no float anywhere, tax off, three-decimal currencies | `test_documents_money.py` (32) |
| Settings and the logo | `test_documents_settings.py` (10) |
| Branches (own series, own address on the paper, switched off, codes, two at once) and cash rounding (the steps, halves, only the cash kinds, the database's sum, credit notes adding up to a rounded document) | `test_documents_branches_rounding.py` (28) |
| Arabic shaping and joining by ink, diacritics, mixed text, numbers never inside Arabic, mirrored tables, margins, wrapping, pages, the roll, the free corner, colours, embedded fonts, bytes the same every time, speed, and the layout of ten documents against golden files | `test_documents_render.py` (81) |

The golden files (`tests/golden/documents/`) hold every drawing call with its place in millimetres. `ALYR_UPDATE_GOLDEN=1 uv run pytest tests/test_documents_render.py -k reviewed` rewrites them; read the diff and look at the pictures before committing.

### Mutation checks

Each thing below was broken on purpose, the tests named run, and the break undone (19 Oct 2026, on a scratch database, in Docker):

| What was broken | What failed |
|---|---|
| `for update` taken out of the statement that reads the counter (`numbering.LOCK_SERIES`) | 3 of 14 numbering tests: twenty issues at once (duplicates and failed requests), some failing while others issue, and the test that shows the scenario breaks without the lock (it also asserts the statement still has the lock). The database's unique index kept a duplicate number from being stored |
| The trigger `documents_guard` not created | 39 of 135: every column of an issued document, a change that changes nothing, delete, the owner's attempts, the attempts to switch the guard off, a void with no credit note, a draft made to look issued, and two hash tests (the stored hash and tampering) |
| `seller` left out of the canonical content | 3 hash tests: the pinned hash, the seller field's sensitivity, and the stored hash of an issued document (the last once; it was also a flaw in the test, which read the printed code too loosely, and is fixed) |
| Rounding half to even instead of half up | 5 money tests: four cases of the rule and the 400-line comparison with Postgres |
| The consumer Arabic rule removed | 2 flow tests (settings, a single document) |
| Text shaping switched off | 18 render tests: the four joined words, the width, mixed text, the currency, the preview and all ten golden layouts |
| The advisory lock on the idempotency key removed | 1: six identical requests at once |
| Invoices allowed without a CR number | 1: the registration rule |

In the numbering break, the duplicate was never stored: the second request's INSERT met the unique index and failed. That is the design: the lock gives every request a number; the index is what makes a bug in the lock cost a failed request, not a duplicate on paper.

## Not built, on purpose

Screens (ALY-146); issuing from orders, bookings and credit payments, and delivery (ALY-139); the standalone and connected modes and per-shop invoice authority (ALY-141, ALY-142); sending, sharing, a public verification page, export and recurring invoices (ALY-143); ALYR's own invoices (ALY-147); the payment and verification QR (the corner is reserved); a line photo (the setting's other half: photos live in the public store and a document must draw with the network off, so a small copy is taken at issue in a later package); ActualText for exact search and copy; metering of documents for a later charge (the table has what a meter needs: shop, kind, issue date); a Qatar object store; country packs.

## Open questions

1. **For the lawyer (ALY-51).** The exact wording and force of MEC Circular 5 of 2016: Arabic as the *main* language, or Arabic *in addition*? If main, English-first consumer documents should be refused, not warned. Whether a seller without a CR number may issue an invoice at all, and what a home-business licence changes. The retention period and whether it must be kept in Qatar (the database is the only copy of a PDF; backups follow the database's). Whether "Receipt" with a note is the right word for what an unregistered seller hands over.
2. **For the founder.** Whether the "Issued with ALYR" line stays on by default (it is a small piece of marketing on the shop's paper; the shop can turn it off). Whether an agent should see only the documents they made (done here), or the shop's list without amounts.
3. **For the native Arabic reviewer (ALY-66).** Every word is in `modules/documents/words.py`, English and Arabic side by side, written as formal Modern Standard Arabic; "إشعار دائن" for credit note, "إشعار تسليم" for delivery note, "فاتورة أولية" for proforma, «ر.ق» and the other currencies' symbols are the ones to check first.
4. **Engineering.** Whether to draw before taking the lock for busy connected shops (above). Whether tax-inclusive prices are needed before a country pack.
