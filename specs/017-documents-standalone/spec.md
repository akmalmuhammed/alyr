# Documents 4: standalone mode ("ALYR Invoices")

Status: built in ALY-141 (package 4 of the Documents feature, epic ALY-137). Decision: D-042 ("As built (ALY-141)"). It sits on the engine (`specs/011-documents-engine/spec.md`), sales and delivery (`specs/013-documents-sales/spec.md`) and the workspace screens (`specs/015-documents-screens/spec.md`), and changes none of their guarantees. Connected mode (ALY-142, `specs/016-documents-connected`) is a different branch and is not touched here.

A business that only needs invoices and receipts, with no Orders, no Catalog and no Bookings, can sign up, write its first invoice in under a minute, send it, and be paid by a link, from a phone. The spec number is 017 because ALY-142 holds 016.

## The product

`ALYR Invoices` is a product in `catalog.py` (key `invoices`): the modules `documents` and `payments` and nothing else. English and Arabic names and a plain description. No price: the price list has no row for it, the way a free product behaves (the back office quotes what it wants per client, D-032). It is independent of Orders, the Catalog and Bookings, and a shop that has other products can add it from the Products screen like any other (`Product.offer` says when a product is offered at all).

| Switch | Default | What it does |
|---|---|---|
| `ALYR_INVOICES_FOR_NEW_SHOPS` | off | Whether `/start` offers "Invoices only" and the Products screen offers ALYR Invoices to a shop that does not have it. Off, a shop that already has it keeps it and everything else is as before. The product lead switches it on. |
| the back office | always | "Create business" lists the product like the others; choosing ALYR Invoices alone makes an invoices-only shop (no Catalog added to it) whatever the switch says. |

The preset `invoices` ("Invoices only", «فواتير فقط») is a way of its own (`way = invoices`): `presets.STEPS["invoices"] = details, first, plan, golive`.

## What an owner does, from sign-up to a sent invoice

1. **Sign up** at `/start` with an email code and choose "Invoices only". The business is made with `documents` and `payments` on and nothing else.
2. **Your details** (one screen, only the name is needed): business name, name in Arabic, commercial registration number, then (folded away) tax ID, address, phone, logo, language of documents (Arabic first by default) and a numbering prefix. A paper picture on the side draws from what is typed (the engine's own preview, nothing stored). A shop without a registration number is told it will make receipts, which say they are not a tax invoice (D-042).
3. **Make your first invoice**: one line ("AC repair 500 for Ahmed 5551 2345", or «صيانة مكيف 500 لأحمد 55512345») fills four boxes (who, phone, what, how much) and the owner checks them. The invoice is issued with an idempotency key and drawn as the real PDF, numbered INV-0001. A shop with no registration number makes a receipt instead (RC-0001) and the step says why.
4. **See what your customer gets**: "Send a test" sends it to the business's private test line (inside ALYR, nothing leaves it, D-031) and shows the WhatsApp message with the PDF. The owner can also email it to themself, copy the link, or open `wa.me` with the message written (their own WhatsApp, their own number).
5. **Plan**: nothing is charged today; a person at ALYR prices it (D-032). It says what is included, in terms of invoices, and never mentions bookings.
6. **Go live**, honest about what is not done: business details and first invoice (ticked); sending by link, email and from the owner's own phone (works today, ticked); connecting the owner's WhatsApp number so ALYR can send from it and so staff can invoice by message (not done: it waits for ALY-39, Meta); connecting a payment account so an invoice carries a payment link (not done: waits for a provider, ALY-17); inviting the team. Nothing says "coming".

A new owner is never shown the Catalog, Orders or Bookings: the navigation lists only what the shop uses.

## Fast creation, from the workspace

Everything is in `DocumentEdit.tsx` and two new screens; the engine is untouched.

* **One line first.** The form opens on "write it in one line" (the same reader as the WhatsApp command, `POST /api/documents/quick`, which only reads and fills, it never makes anything). Under it the form, filled, to check. A shop that cannot issue an invoice (no registration number) gets a receipt.
* **Remembered customers.** Typing in the customer box offers the shop's customers by name (either language, alef forms folded), company or phone digits, most recent first; a new one is saved from the form ("Save for next time") without leaving it. A customer has a name in either or both languages, a company, a registration number, a tax ID, a phone and an address; a phone is the key (a number the shop already has is the same person, never a second one) and a member of the team's number is refused. Customers have their own screen (list, search, owing filter, a page with the invoices and what is owed, "start an invoice for them").
* **Saved lines.** What the shop writes again and again (name in both languages, unit, usual price), up to 500, per shop: not the Catalog (no stock, no photos). Offered as the owner types a line's description, saved from a line with "Save for next time", used-counts keep the favourites first, archived rather than deleted. Where the Catalog is also on, its items are offered in the same list.
* **Defaults.** Notes and terms from the settings appear as the usual text for each kind. "The same as my last one" and "Make another like this" copy a document's customer and lines into a new draft (never its number or dates).
* **Phone-fast.** The price is a big-number field with the numeric keypad; a line's extra fields (discount, tax, unit) fold behind "More"; the total and Issue stay in a bar above the tabs.
* **A Customers screen and a Saved lines screen** one tap from Documents (two tabs at the top).

## By message (staff only)

A registered staff number (`items/staff.py`, the registry the Catalog's commands use) can write:

    invoice Ahmed 500 for AC repair          فاتورة أحمد 500 صيانة مكيف
    receipt Ahmed 500 cash                   إيصال أحمد 500 نقدا
    Ahmed paid 500 cash                      أحمد دفع 500 كاش

Rules (the code is `quick.py`, the pure reader; `wa_command.py`, the conversation; `wa_words.py`, the words in both languages):

* **Only staff.** The router asks for a staff number before the command module is asked at all, and the module checks again. A customer's message gets the ordinary customer reply, byte for byte, whatever it says (a test compares).
* **Never a guess.** A name that fits one customer is that customer; one that fits several is a numbered list; one that fits none asks for a phone number or "Skip". "AC repair 500 for Ahmed" and "Ahmed 500 for AC repair" are both read by looking at who the shop's customers are; a phone number written right after some words says those words are the person. Two numbers and no currency word is a question. Nothing is issued before a Yes.
* **The confirmation** says what ALYR understood, with Yes, Edit and Cancel. A second Yes is the same document (the command holds the idempotency key). Edit asks for the sentence again.
* **Undo** for ten minutes: a credit note that cancels it, in words that say so. A payment recorded against the invoice cannot be undone by message (recorded payments are append-only), and the confirmation says so before the Yes. The word "undo" is shared with the Catalog's commands: whichever staff change is newer answers it.
* **A customer who has never written to the shop's number cannot be messaged first** (consent, hard rule 5). The reply says so, gives the link and a `wa.me` link to send it from the owner's own phone. The shop is never blocked.
* **A receipt** for money received ("Ahmed paid 500 cash") is made as the shop's receipt, against the customer's open invoice when there is exactly one it fits. Where the credit-ledger module is on, "Ahmed paid 200" is the ledger's.
* **No new template.** Everything is an ordinary message inside the staff member's own window, which the staff member opened by writing.
* Works in the simulator today. On a real number it works only when the shop's number runs through ALYR (ALY-39).

State is in `document_commands` (migration 0044): one open command per staff number, expiring after 15 minutes.

## The payment link, the QR code and the receipt

* **When an invoice gets a link.** An invoice made by hand (not from a credit sale), for a customer who is a contact of the shop, with something owing, in a shop with the `payments` module, and either a provider connected (none can be yet) or a developer machine, where the stand-in pay page stands for the gateway. On a real server today no invoice gets a link and the paper says nothing about paying online: it never claims what is not true.
* **The link** is a `payment_requests` row that belongs to the document (migration 0044: `document_id`, one per document). The QR code in the reserved corner of the paper and the Pay button on the hosted page are that one link (`/pay/<shop>/<payment>`, which now names the invoice it pays).
* **The QR code** is made by `core/qr.py`, written for this (byte mode, versions 1 to 10, error correction M, all eight masks scored). No new dependency. It is tested by structure, by the Reed-Solomon property of every block, and by decoding with jsQR (the web test decodes matrices the encoder made, and the browser run decodes the real PDF of an invoice and compares it with the link). A link too long for version 10 is refused, never cut.
* **Paid.** The pay page reports the payment; `paylink.on_paid` writes it as a payment recorded against the invoice (method `link`, once, however often the gateway reports it) and the receipt follows by the shop's settings, exactly as for a payment taken by hand. The invoice's paper does not change.
* **Moved on.** A payment taken by hand changes what the link asks for (or closes it when nothing is owed); cancelling the invoice with a credit note closes it. A customer is never asked for more than is owed.
* ALYR never holds the money (hard rule 3): the link goes to the shop's own gateway account.

## What the API gained

| Route | For |
|---|---|
| `GET/POST /api/documents/saved-lines`, `PUT/DELETE .../{id}`, `POST .../used` | saved lines (DELETE archives; `used` counts a use) |
| `GET /api/documents/customers/all`, `GET/PUT /api/documents/customers/{id}`, `POST /api/documents/customers` | the Customers screen and saving from the form |
| `POST /api/documents/quick` | reads one line, fills the form |
| `POST /api/onboarding/test-send` | the first invoice to the test line |
| `GET /api/onboarding/state` | `documents: {first, has_registration, email_ready, whatsapp_connected}` |

All behind `require_module("documents")` and the existing roles: owners and admins do everything; an agent sees and changes the lists their role allows (customers and lines are the shop's, a tenant-isolated table each, row-level security forced).

## Migration 0044

`contacts` gains `name_ar`, `company`, `registration_number`, `tax_id`, `address`, `address_ar` (all optional); new `saved_lines` and `document_commands` tables (RLS forced, grants to the application role only); `payment_requests.document_id` (foreign key, unique); `manual_payments.method` accepts `link`.

## The demo shop

`python -m alyr.seed_catalog_demos --only salem` makes **Salem Maintenance** («سالم للصيانة»), an AC repair business in Doha, with four saved lines, three customers, a staff number for the message demo and a small book of papers (an unpaid invoice with its payment link, a paid one with its receipt, an unpaid one for a company, a walk-in receipt). An issued document cannot be deleted, so the shop is made once; a second run leaves it as it is. See `docs/demo.md`.

## Deviations from the brief

* **A customer needs a phone to be saved** from the form's "Save for next time" and to receive anything; a customer typed with a name alone is written on the paper but is not a contact of the shop, so a payment link needs a saved customer. The brief said "inline create"; the phone rule is the engine's (a contact is keyed by phone).
* **Customers are `contacts` rows** (the Catalog's and the inbox's table), with six new optional columns, not a new customers table, so a customer who writes in on WhatsApp and a customer who is invoiced are one person.
* **The owner's private test customer** (onboarding) is a contact on the test line, kept out of the customers list, the picker and name matching.
* **"Free for now"** is a product with no price rather than a price of zero: the back office quotes what it wants per client.

## Tests

| What | Where |
|---|---|
| The encoder: structure, Reed-Solomon, capacities, determinism, jsQR decode | `test_qr.py` (6), `qrDocument.test.mjs` |
| The reader: invoice and receipt sentences in both languages, phone and amount rules, ambiguity, what it refuses | `test_documents_quick.py` (18 groups) |
| The product, the way, the switch on and off, the back office, bundle independence | `test_documents_standalone_product.py` (16) |
| Customers, saved lines, clean phone, roles, isolation between shops | `test_documents_standalone_data.py` (22) |
| The payment link, the QR on the paper, the pay page, paid once, moved on, closed | `test_documents_paylink.py` (13) |
| The WhatsApp command in both languages, staff only, byte-for-byte customer reply, undo, ambiguity | `test_documents_standalone_wa.py` (31) |
| The demo shop | `test_demo_salem.py` (6) |
| The wa.me link | `documents.test.mjs` |
| The scripted browser run | `scripts/documents-standalone-browser-check.mjs` (headless Edge, 375 px, English and Arabic, light and dark, axe-core on every state, targets of 44 px, no sideways scroll) |

## Not built, on purpose

Sending from the owner's own WhatsApp number (ALY-39); a payment provider (ALY-17); connected mode (ALY-142); credit-account payments matched to invoices (a founder decision since ALY-146); tax (off by default, no VAT in Qatar today); a customer statement screen; importing customers.

## Open questions

* Does ALYR want to quote a setup fee for a free invoices-only client (D-032)? Today the plan step says a person prices it.
* The WhatsApp consent: a shop that tells ALYR "my customer asked for WhatsApp" is attesting, which is the same pattern as the Catalog's; confirm with the lawyer (ALY-51).
* Who switches `ALYR_INVOICES_FOR_NEW_SHOPS` on, and when, is the product lead's call.
