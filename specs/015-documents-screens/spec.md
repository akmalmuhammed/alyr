# Documents 3: the workspace screens

Status: built in ALY-146 (package 3 of the Documents feature, epic ALY-137). Decision: D-042 ("As built (ALY-146)"). It sits on package 1, the engine (`specs/011-documents-engine/spec.md`), and package 2, sales and delivery (`specs/013-documents-sales/spec.md`), and changes none of their guarantees: numbering, immutability and the hash are as they were. Still hidden: the module `documents` is off for every shop and in no product or starting setup; the product lead switches it on after review (the back office can switch it on for one shop to try it). With it on, every screen below works.

An owner can now see every document in a section of the workspace, open one and see it as it prints, write one by hand, issue it, send it, record a payment taken by hand, print it on another paper, cancel it with a credit note, and set up how all of it looks and is numbered, with a preview that is drawn by the engine itself from what is being typed. Phone first (375 px), English and Arabic with real right-to-left, light and dark.

## What is on the screens

| Screen | What it does | Who |
|---|---|---|
| **Documents** (`/app/documents`) | The list, newest first, a cursor so a shop with thousands opens it as fast as a shop with ten. Search by number, customer name (either language; the alef forms are folded), company, phone digits or amount. Filters: kind, status (draft, issued, cancelled), payment (paid, part paid, unpaid), delivery (not sent yet, sending, sent, delivered, not delivered), branch, a date range. A total line: how many, the total (only when one kind of sale is chosen: adding receipts to the invoices they paid would count a sale twice) and what is still owed. Each row: number, kind, customer, date, amount, and words for its states. | everyone; an agent sees only the papers they made |
| **A document** (`?d=<id>`) | The pages of the real PDF as pictures (see "Showing a PDF"), then the same facts as text: customer, items, totals, payments (the paper's and the ones recorded by hand since), related documents (a credit note links to its invoice and back; the receipts of an invoice's payments), what it came from (order 1001, booking 12), who was sent it and whether it arrived, what happened. Actions: Share, Send again, Record payment, Download PDF, Print, Cancel document. | Share and Download: whoever may read it; Send again: who may issue; Record payment: owners and admins, an agent only if the shop allows; Cancel: owners and admins |
| **Write a document** (`?edit=new`, `?edit=<id>`) | Kind (invoice, quotation, receipt, delivery note, proforma), due or valid-until date, branch, the customer (found among the shop's own, with their price group, or typed: name in both languages, phone, email, company, registration number, tax ID, addresses), lines from the Catalog (found by name, item code or SKU, priced for the customer's group, or free text), quantity, unit, price, discount, tax rate (only when the shop has tax on), live totals, how a receipt was paid, notes and terms. Save draft, Issue (a confirmation says the number it will get and that the paper locks), a refusal in words. | everyone drafts; who may issue sees Issue |
| **Document settings** (`?view=settings`) | Your business (names, CR number, tax ID, licence, address, phone, email), how it looks (A4, A5, 80 mm roll; a colour; a logo; a signature or stamp picture; which optional parts show; header and footer text), language and audience, notes and terms of each kind, numbering (prefix, digits, yearly restart, the next number, branches), money (currency, cash rounding), what happens by itself (which sales make a document, which channels send, at once or by hand), the team's rights, and the recent changes. Beside it a live preview. | owners and admins |
| **Home** | Two cards, "Unpaid invoices" and "Documents not delivered", on the ALYR Agent dashboard (and in `GET /api/workspace/home`). Each is the number of rows of the list it opens (`?show=unpaid_invoices`, `?show=not_delivered`), counted by the same query. An agent sees neither: it is the owner's money. | owners and admins |
| **Orders, Credit accounts** | A row whose sale made a receipt or an invoice gets a small link to it. | owners and admins |

## Showing a PDF

The brief asked for the engine's PDF in the page, with a fallback chosen by trying it. A PDF in an `<iframe>` or `<object>` cannot be trusted on a phone (Android's Chrome offers a download, iOS Safari shows one page in a frame that scrolls inside the page) and gives a screen reader nothing. So the screens show the PDF's pages as **pictures drawn from the same bytes**: `GET /api/documents/{id}/pdf?format=png&page=1&width=900` (and `POST /preview?format=png`), rendered by PDFium (`render/raster.py`; the page count is in `X-Page-Count`; never stored, `private, no-store`). Each picture has a sentence for a screen reader and the facts are below it as text. The PDF itself is one tap away (Download, Open, Print). The one cost is that `pypdfium2`, which the tests already used, moved from the development dependencies to the main ones (Apache-2.0 or BSD-3, a prebuilt wheel of about 3 MB; no new package in the lock file). **Not tried:** a real phone (the pictures were checked in headless Edge with a phone's width and touch).

The preview in the settings is the same: the engine's preview endpoint, as a picture, with `settings` (what has been typed and not saved) tried out on the page. It takes no number and writes nothing.

## What the API gained (all behind `require_module("documents")`)

| Call | What |
|---|---|
| `GET /api/documents` | `kind`, `status` (`draft`, `issued`, `cancelled`), `payment` (comma-separated `paid`, `part`, `unpaid`), `delivery`, `branch`, `date_from`, `date_to`, `q`, `show` (a card's preset), `limit`, `cursor`, `totals`. Answers `documents`, `next_cursor`, `has_more` and, on the first page, `totals`. The cursor is the sort key and the id of the last row (`documents_newest`, migration 0039). |
| `GET /counts` | The two numbers of the home screen, from the same function as the list. |
| `GET /customers?q=`, `GET /catalog-lines?q=&contact_id=` | The customer picker and the Catalog lookup; read only. A line is a seed: the form copies it, and from then on the line is the document's own. |
| `GET /{id}` | Also: `children` (receipts of its payments), `source_info` (which order or booking), `recorded_payments` and `now` (what it has been paid as of now). |
| `GET /{id}/pdf` | Also `layout=a5|thermal80|a4` (a copy drawn from the same stored content, never stored; the stored PDF, the number and the hash stay as they were), `download=true`, `format=png`. |
| `POST /{id}/link` | A link to copy: the signed hosted-page link of package 2; making one is on the activity record (`link_created`). |
| `POST /preview` | Also `settings` (owners and admins), `format=png`, `page`, `width`. |
| `GET /settings/activity`, `GET /settings/{logo|stamp}` | The last changes to the settings (names only, never the text of a bank detail) and the saved pictures. |
| `GET /series` | Also `next_number`. A reading, not a reservation: another document may be issued first. |
| `GET /meta` | Also `defaults` (what the form starts from, nothing secret) and `access.can_record_payments`. |
| `/api/orders`, `/api/ledger/customers/{id}/entries` | A `document` on a row whose sale made one (only for a shop with the module on; other shops are answered exactly as before). |
| `GET /api/agent` | A `documents` block like the Catalog's. |

### What "paid" means

An issued invoice never changes, so a payment recorded against it (package 2) lives in `manual_payments`. What an invoice has been paid **now** is its paper's payments plus those, and every screen, filter and card reads it that way (`listing.PAID`). **Known limit:** a payment into a customer's credit account by link, in the chat or by balance is not allocated to an invoice (the ledger keeps one balance per customer), so an invoice that was settled that way still reads as unpaid. The document's page says so beside the payments of a credit-sale invoice. The fix is a decision (allocate by oldest first, or let staff match a payment to an invoice); it is not built.

## Rules the screens keep

1. **The API decides; the screen hides.** Settings, numbering, cancel and the preview with typed settings are owners and admins; an agent drafts, sees their own papers, issues only if the shop allows, records a payment only if the shop allows. A control the person cannot use is not drawn; the API refuses it anyway (tested).
2. **Issuing and paying are asked with a key.** Each sheet makes one `Idempotency-Key` when it opens and sends it again on a retry, so a dropped connection never makes a second document or payment.
3. **Words, not codes.** Every refusal arrives from the API in both languages, saying what to do; the screen shows the language the person reads. The refusal of an invoice with no CR number shows the friendly message, a link that opens the settings with the cursor in the registration field, and an offer to make a receipt instead.
4. **Totals on screen are the engine's.** The form works lines and cash rounding with the engine's integer rule (`documentsLogic.ts`); 400 lines the Python engine worked out are the test of that (`documentsVectors.json` is written by the API's test and read by the web's).
5. **The paper is white.** The page pictures are ink on white whatever the theme.
6. **Nothing says "coming" or "beta".**

## Deviations from the brief

- **Date** is not a field: the engine dates a document the day it is issued (shop time), so the form says so. The due or valid-until date is a field.
- **Amount search** reads `127`, `127.50`, `١٢٧` as an amount of the document or what it still owes.
- **Delivery states.** "Sent", "Delivered", "Not delivered", "Not sent yet" and "Sending" (queued).
- **Print** opens the PDF (in the chosen layout) in a new tab; the browser's own viewer prints it.
- **Hosted-link send to a number that is not a customer** is recorded as blocked by package 2 (ALYR never starts a conversation with someone who has not agreed to one); the sheet says so and offers the link to copy.
- **Home cards** live on the ALYR Agent dashboard (like the Catalog's) and in `/api/workspace/home`.
- **Tax** has no screen: Qatar has none today; a line's tax rate shows only if the shop's settings have tax on (set by the API).
- **Booking deposits** have no screen (bookings have no screen of their own for payments); a deposit receipt made by the API opens like any document.

## Tests

| What it proves | Where |
|---|---|
| The list: newest first, a cursor with no gaps or repeats, a draft among the issued, the totals, search (number, names in both languages, an Arabic spelling folded, company, phone digits, amounts in Western and Arabic digits, a pattern typed as text), every filter, an agent's own papers, the cards equal the lists, the delivery filter equals the delivery summary, a shop without the module, one shop never seeing another's | `tests/test_documents_screens_api.py` (43) |
| Detail (children, source), PDF on another page size (nothing issued changes), the picture of a page (sizes, pages, a missing page, an agent refused), the preview with settings tried (no number, the checks of saving, owners only), settings activity (who, which, never the text), next numbers, the link, the customer and Catalog lookups (groups, SKU, code, sizes), the pointers from Orders and Credit accounts, `meta`, the saved pictures | same file |
| The form's totals are the engine's | `test_the_web_vectors_are_the_engines_numbers` and `apps/web/app/(product)/_workspace/documents.test.mjs` (11) |
| Every screen, in a real browser at 375 px and laptop width, English and Arabic, light and dark: the list (paging, keyboard, search, filters), a document, the sheets, the form, a draft written by hand and issued, sent, paid, printed, cancelled, the settings with the preview changing, layouts, the consumer rule, a logo, the numbering, an agent, a shop with no CR number, the home cards equal their lists; axe-core on every state | `scripts/documents-screens-browser-check.mjs` |

## Not built, on purpose

Standalone and connected modes (ALY-141, ALY-142); quotes turning into invoices, statements, recurring documents and export (ALY-143); ALYR's own invoices (ALY-147); an allocation of credit-account payments to invoices; a screen for a booking's deposit; a barcode or payment QR; a native read of the Arabic (ALY-66); a try on a real phone, a real printer or a real roll.

## Open questions

1. **Founder.** Whether an owner may switch "Issued with ALYR" off from this screen (it is on the settings, as decided on 19 Oct). Whether a credit-account payment should be matched to invoices (oldest first) so "unpaid invoices" is exact for credit customers. Which sentence the home cards should carry for a shop that sends nothing by hand.
2. **Engineering.** The pictures are 900 px wide PNGs, 60 to 120 KB a page; an image cache keyed by the document's hash (they cannot change) would make a second look free.
