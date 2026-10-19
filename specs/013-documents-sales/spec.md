# Documents 2: receipts and invoices from sales, payments by hand, delivery

Status: built in ALY-139 (package 2 of the Documents feature, epic ALY-137). Decision: D-042 ("As built (ALY-139)"). It sits on package 1, the engine (`specs/011-documents-engine/spec.md`), and changes nothing in it that a shop can see: the engine's immutability, numbering and hash are as they were. Still hidden: the module `documents` is off for every shop and in no product; the back office can switch it on for one shop to try it. Screens are ALY-146.

This package is the **native way in** (ALYR's own orders, bookings and credit accounts make documents, and staff can write down a payment taken by hand) and the **way out to the customer** (WhatsApp, a hosted link, email, resend). Standalone and connected modes, quotes, statements, export and a payment QR are later packages.

## What now happens, for a shop with the module on

| Event | What is made | Who gets it, by default |
|---|---|---|
| An order is paid (the payment link reports it) | A receipt of the order's lines, paid by "payment link" | The customer: a WhatsApp document message inside their 24-hour window, a template with the PDF as its header outside it; an email if the customer has an address on file |
| An order is put on the customer's credit account | An invoice, unpaid | Same |
| A payment lands on a customer's credit account (their payment link, or staff in the chat) | A receipt that says what is left on the account | Same |
| A receipt or invoice made for an order exists and the order is cancelled | A credit note against it, once, linked; the original becomes void; in the cancellation's own transaction | Same |
| Staff mark an order, a booking, an invoice or a customer's balance as paid (cash, bank transfer, cheque, card terminal) | The payment is written down (who, when, how, a reference); the order becomes paid; a receipt, or a deposit receipt for a part-payment on a booking | Same |
| Staff ask for an invoice for any order or booking | The invoice (the same one the credit sale made, if it did) | Per the shop's send setting |
| Staff cancel an issued document with a reason | A credit note for all of it; the document is void and stays | Only if they ask to notify |

A shop without the module behaves exactly as before. Every hook begins by asking whether the module is on; if not, nothing is written, nothing is queued, nothing is said (test: `test_a_shop_without_the_module_is_exactly_as_before`).

**Bookings.** ALYR's bookings have no payment step today (the page books a visit; there is no deposit). So the booking receipt comes from the hand-recorded payment: the first part-payment on a booking makes a deposit receipt (the total is the service's price, the paid amount is what was taken, the balance is what is left), and the payment that completes it makes a receipt listing every payment. A booking cancelled does not cancel its receipt by itself: whether a deposit is given back is the shop's business, and a person cancels the document (`/cancel`) when it is.

## The rules every hook keeps

1. **Only with the module on** (see above).
2. **Once.** Each document is issued with an idempotency key made of what it is for: `receipt:order:<id>`, `invoice:order:<id>`, `receipt:payment:<id>` (a ledger entry's or a recorded payment's), `credit-note:<document id>`, `invoice:booking:<id>`. The engine takes an advisory lock on the key, so a payment reported twice, six at the same moment, or a retried job finds the document that is already there. A document that is not new is not sent again.
3. **It never breaks the sale.** A hook runs in the sale's own transaction behind a savepoint. If the document cannot be made (an invoice for a shop with no CR number, a customer with no name, the PDF engine down), the sale goes ahead, the number is not spent, and `document_skipped` with the reason goes on the activity record of the order, booking or account.
4. **Cancelling is one transaction.** The credit note is issued after the order row is locked and its status changed, in the same transaction; if anything after it fails (the refund alert, say) the cancellation and the credit note roll back together.
5. **Cash rounding is for cash.** A receipt for a payment link, a transfer, a cheque or a terminal is the exact amount; a cash payment recorded by hand is for the rounded total, and the document says so on its own line. A credit note that completes the cancellation takes the rounding with it (the engine's rule).

The issuer on the paper is "ALYR" for an automatic document, the person's name for a payment they recorded, and whoever cancelled for a credit note. The documents are issued as the shop, so an agent who is allowed to record a payment is allowed the receipt that goes with it; the agent still cannot cancel anything or change settings.

## Payments recorded by hand

`POST /api/documents/payments` with an `Idempotency-Key` (required). Body: `subject` (`order`, `booking`, `invoice`, `credit`), `id`, `amount_minor` (leave out to pay what is owed), `method` (`cash`, `bank_transfer`, `cheque`, `card_terminal`; the paper says "Card" for a terminal), `reference` (80 characters), `receipt` and `send` (true, false, or the shop's settings). Rows go in `manual_payments`: append-only (a trigger refuses update and delete, even for the table's owner; only the receipt it produced may be written once, later), unique per shop and key, with who recorded it and when.

| Subject | Effect | Refused when |
|---|---|---|
| `order` | The order becomes paid, a pending payment link shows as paid, the stock it held is sold; the receipt is for the order's lines | cancelled, already paid, on a credit account (409); the amount is not the whole total (422) |
| `booking` | A deposit receipt for a part-payment, a receipt when it is paid up | cancelled, already paid (409); more than is owed (422); a service with no price needs an amount |
| `invoice` | A receipt for the payment; for a credit sale's invoice the customer's ledger is paid down too | not an issued invoice (409); more than is still owed on it (422) |
| `credit` | The ledger takes the payment and the receipt says what is left | nothing owed (409); more than the balance (422) |

Who: owners and admins; an agent only when `agents_may_record_payments` is on (`payment_not_allowed`, 403 otherwise). `POST /api/documents/payments/{id}/receipt` makes the receipt of a payment that was recorded without one (the shop had that receipt off, or `receipt` was false); asking again returns the same.

## Delivery

`document_deliveries`: one row per attempt, per channel, to one recipient. A WhatsApp row reads its state from its `messages` row, which Meta's reports already keep up to date, so there is one truth: **queued, sent, delivered** (read counts), **failed**, **blocked** (with the reason: `no_consent`, `opted_out`). An email row keeps its own (`queued`, `sent`, `failed`); nothing reports back on an email. The owner sees one state per document (`none`, `queued`, `sent`, `delivered`, `not_delivered`) on `GET /api/documents` and `GET /api/documents/{id}`, and every attempt at `GET /api/documents/{id}/deliveries`.

**WhatsApp.** Inside the customer's 24-hour window the PDF goes as a WhatsApp document message with a short caption in their language (the fact in the shop's name, the amount, a thank-you, the link on its own line followed by a space so the phone does not take the full stop into it; an Arabic caption opens with U+200F and writes «127.00 ر.ق»). Outside it the PDF is the header of an approved UTILITY template. Both go through `Outbound.send`: consent, the window and the limit are checked there like for every message; a refused one is recorded as blocked, shown as "not delivered", and not retried; a channel failure is retried by the job queue with growing delays up to six tries, then marked failed. A customer who said stop gets no document even inside the window (`consent.refusal` refuses the new `document` kind). Meta's payload is built from the stored PDF uploaded at send time with the Media API (`POST /{phone-number-id}/media`, type `application/pdf`; checked against Meta's pages, 20 Oct 2026: a document message takes an `id` or a `link`, `filename` and a `caption` of at most 1,024 characters, 100 MB; media IDs last 30 days). The PDF is private, so it is uploaded, never hosted.

**Templates**, written and **not submitted** (the founder's go, and `templates_sync --create` is not to be run for them until he says so): `document_receipt` (also carries a deposit receipt), `document_invoice` and `document_credit_note`, each in English and Arabic, utility, four blanks (number, shop, amount, link), a document header with a sample PDF that the sync asks the engine to draw when it needs one (a made-up bakery's receipt, invoice and credit note in each language, `alyr.document_samples`; no PDF is kept in the repository, where `*.pdf` is ignored on purpose; `python -m alyr.document_samples <folder>` writes them to look at). `document_credit_note` is a third template beyond the brief's two: "your receipt" would be the wrong word for a refund. The sync learned `DOCUMENT` headers (`format: DOCUMENT`, `header_handle`); the send shape for a template's document header (`{"type": "document", "document": {"id", "filename"}}`) follows Meta's document-message page and third-party integrations: **Meta's own page for template headers did not load, so that one shape is unconfirmed until the first approved template is sent.**

**Email.** The PDF attached (base64, as Resend takes it), a subject in the customer's language ("Receipt RC-0042 from Qirfa Bakery", «إيصال رقم RC-0042 من مخبز قرفة»), a plain-text twin that says what the HTML does, the sender "Qirfa Bakery via ALYR" at ALYR's address with replies to the shop's own address if it has one, and the hosted link. Only when the customer has an address on file (`contacts.email`, put there by `PUT /api/documents/customers/{id}/email` for now; the contacts screen is ALY-53) or staff type one; never to a reserved example domain (`mail.deliverable`, now shared with the weekly report). A failed email is retried by its own job (six tries) and then shown as not delivered. The email is plain: no logo image (the logo's home is a founder decision, `alyr-email`), no button, no tracking, light colours only (the brand has no dark email tokens yet).

**The hosted link.** Every send mints a link to `/d/<shop>?t=<token>`. The token is the order and booking links' (`core/links.py`) with a third purpose, `document`: HMAC-signed over the shop, the purpose, the document's ID and an expiry (`ALYR_DOCUMENT_LINK_DAYS`, 90). An order link or booking link opens nothing there and this opens nothing there; another shop's link is worthless; a bare ID is not read anywhere. The page sends the token in the header `X-Order-Link`, never in a request's address. `GET /api/d/<slug>` answers with the shop's name and either the document (number, kind, date, lines, totals, how it was paid, whether it was cancelled and by which credit note: no customer name, phone, email, branch, staff name or hash) or a calm "expired" or "not valid" with the words in both languages; `GET /api/d/<slug>/pdf` needs a good link. Both are `private, no-store` and `noindex`. The page (`apps/web/app/(product)/d/[slug]`): phone first, in the document's lead language (Arabic first) with a switch, a Download PDF button that fetches the file with the header and saves it, and the shop's name; a link that stops working while the page is open turns into the expired page.

**Send and resend.** `POST /api/documents/{id}/send` (`channels`, `phone`, `email`, `language`): to the customer, again as often as wanted, or (owners and admins) to another number or address typed here; audited as `sent` or `resent` on the document's record with the channels and "customer" or "another recipient", never the number. A number that is not a contact is recorded as blocked (`no_consent`): ALYR never starts a conversation with someone who has not agreed to one. A send already waiting to the same place is returned, not doubled. A cancelled document is not sent (its credit note is).

**Settings** (added to `document_settings`, on the activity record with from and to): `auto_receipt_on_payment`, `auto_invoice_credit_sales`, `auto_deposit_receipt` (all on), `auto_send_whatsapp`, `auto_send_email` (on; email only when there is an address), `send_mode` (`automatic` or `manual`: documents go out at once, or only when staff press send), `agents_may_record_payments` (off). The three "auto" document switches apply to hand-recorded payments too (a person can still ask for the receipt later, or say `receipt: true`).

## Tables (migration 0038)

`manual_payments`, `document_deliveries` (RLS forced; the app role can read, insert and update, and a trigger makes a recorded payment append-only; a unique index allows one automatic delivery per document and channel), seven columns on `document_settings`, `contacts.email`, and `message_media` may now hold `application/pdf`.

## Tests

144 new tests (the whole suite: 2,046 passed, 2 skipped, on my own scratch database after merging main), all through the real path (real PostgreSQL, the HTTP API, the job queue and a recording stand-in for the WhatsApp channel; the email provider is a mock transport):

| What it proves | Where |
|---|---|
| A receipt per paid order, once however often or fast the event fires (6 at the same moment); gapless numbers across simultaneous orders; the module off changes nothing; the shop's switches; an invoice per credit sale; a payment on a credit account; a credit note on cancel, exactly once, linked, in the cancellation's transaction (it rolls back with it); a document that cannot be made never stops the sale | `test_documents_sales_hooks.py` |
| Manual payments for each subject; roles; the idempotency key (retried, six at once, reused, missing); amounts and refusals; cash rounding; deposit then final receipt; the append-only record; RLS | `test_documents_manual_payments.py` |
| WhatsApp inside the window (a PDF with a caption) and outside it (the template with the PDF header), English and Arabic; no consent; stopped; a failing channel and its retries; delivered, read and failed reports; one automatic send per document; send by hand; to another number; email (attachment, language, example domains, retry, not set up, twice); Meta's payload shapes; the PDF upload | `test_documents_delivery.py` |
| The hosted link: good, expired, tampered, edited, wrong purpose (order, booking), wrong shop, bare ID, draft, forged ID, no module; headers; what the page may and may not say; a document link opens nothing on the order or booking page | `test_documents_links.py` |
| A week of a shop's life: paid by link and by hand, a booking with a deposit, credit sales and payments, cancellations, every event fired again; the exact set of fifteen numbered documents, gapless per kind, nothing twice, both languages in every PDF, each sent once in the customer's language | `test_documents_week.py` |
| The three templates follow Meta's rules and are utility; the sync gets their sample PDFs from the engine (and none is kept in the repository); the sync describes a document header | `test_documents_templates.py` |

### Mutation checks

Each thing below was broken on purpose, the tests that should notice were run on a scratch database in Docker, and the break was undone (20 Oct 2026):

| What was broken | What failed |
|---|---|
| The hooks issue without their idempotency key (a fresh key each call) | 4 hook tests: the hook called again, two payment events at the same moment (six callers), the same order asked for as an invoice (it shares the credit sale's key), a payment entry hooked twice. **The week-of-activity test did not fail**: there, a repeated payment is stopped upstream (the payment link is already paid) and the on-request path has its own key, so that test proves the whole week and not the key |
| `orders.cancel_order` no longer asks for the credit note | 10: the credit note on cancel (paid order, credit sale, twice, four at once), the atomicity test, attribution, the activity record, the week, and the cash-rounding cancel |
| An automatic delivery inserted without `ON CONFLICT` (the unique index is then what answers) | 1: the shop's settings send a document once however often it is asked (the database raises a unique violation) |
| A recorded payment's idempotency key not looked up | 3: a retried request, six identical requests at once, a key reused for something else |
| `links.read` stops checking the purpose | 8, in four files: a document-ID token made for the order or booking page opens nothing here, a document link opens nothing on the order or booking pages, and the order and booking link tests of ALY-112 and ALY-133. The forwarded-order-link test did not fail: an order token's ID is a contact's, and no document has it, so the page says "not valid" anyway; the test that makes a token for the document's own ID with another purpose is the one that bites |
| The shop left out of the link's signature | 3 of `test_links.py` (worthless at another shop, tampered or foreign, orders nothing). **The document link test for another shop did not fail**: a token for my shop's document read at the other shop is stopped a second time by row-level security (the row is not found), so the two defences cover each other |
| A customer who said stop still gets a `document` message | 1: the rule in `consent.refusal` (the end-to-end send to such a customer stays blocked either way, because a template to a revoked customer is already refused) |
| The page gives away the customer | 1: what the page may say |
| An agent may record a payment whatever the shop says | 1 |
| A link payment is rounded like cash | 1 |
| The module switch is not asked before issuing | 2: a shop without the module is exactly as before, and switching it off stops the hooks |

The first attempt at the rounding mutation changed a default that the code overwrites two lines later, and nothing failed; it was a bad mutation, not a gap, and the second one (the overwriting line) is the row above.

## Not built, on purpose

Screens for any of this (ALY-146): the settings, the payments, the delivery state and the send buttons are API only. The standalone and connected modes (ALY-141, ALY-142). Quotes, statements, export (ALY-143). A payment QR. A booking that is paid by a customer (no payment step exists in bookings). A credit note when a booking is cancelled. A voided invoice does not take its sale off the customer's ledger (cancel the order for that). Ending one customer's link on its own. Rate limits on the public page (ALY-116). A real WhatsApp send, a real email, a real phone: nothing here reached Meta, Resend or a person.

## Open questions

1. **Founder.** The 90-day life of a document link (a receipt is looked for months later; an order link is 60). Submitting the three templates to Meta. Whether `document_credit_note` stays as a third template.
2. **Lawyer (ALY-51), unchanged from package 1.** Whether a document sent to a customer must carry anything more; the retention period applies to the stored PDF as before.
3. **Engineering.** The first approved template with a document header should be sent to a real phone to confirm the shape of the header parameter. `contacts.email` has no screen; ALY-53.
