# Spec 005: The customer's order page, version 2 (share links, QR codes, signed links)

Status: built in ALY-112 (package 4 of the Catalog, ALY-101). Decision: D-039 ("As built (ALY-112)"). The engine under it is `specs/001-catalog-engine/spec.md`, the prices are `specs/003-price-groups-and-sku/spec.md`, the workspace side is `specs/002-catalog-screens/spec.md`. This page says what a customer sees and can do, what the API gives the page, how a link proves who the customer is, and how it is checked.

**Hidden until go-live, and nothing changes for a shop without the Catalog.** The new page is shown only for a shop that has the `catalog` module switched on, which is no shop until the go-live sweep (ALY-113). A shop without it keeps the page it always had (`LegacyOrder.tsx`: a list by category, + and -, a bar at the bottom), with two changes it needed anyway: the customer is identified by a signed token, and amounts are written in the page's language. Nothing says "coming" or "beta" (a test reads every file).

## Two kinds of link

| | Public link | One customer's link |
|---|---|---|
| Looks like | `/s/<shop>`, `?item=<id>`, `?cat=<category>`, `?table=<label>` | `/s/<shop>?t=<token>` |
| Who can open it | Anyone | Anyone who holds it, until it runs out |
| Prices | The normal prices (the default group's) | The customer's own (their price group) |
| Can order | No. It offers "Order on WhatsApp" to the shop's number, with the word the chat answers (`Order`, or `Order table 7`) | Yes, by link or on account |
| Carries a customer | Never | A signed token, never the contact's ID |
| Made by | The Share sheet in the workspace Catalog; the QR codes | The order chat (`modules/orders/chat.py`), the seed |

A public link never carries a contact ID or a token. A bare `?c=<contact id>` (the old link) grants nothing: the API ignores it, shows the normal prices and refuses an order (there is no compatibility shim; there were no real customers).

### The token (`core/links.py`)

`<payload>.<mac>`, both base64url without padding.

* payload: version byte `1`, the contact's ID (16 bytes), the expiry (4 bytes, Unix seconds, big endian), the table label (UTF-8, at most 20 characters, may be empty);
* mac: the first 16 bytes of HMAC-SHA256 over `"alyr-order-link-v1\0" + shop ID + payload`, with the secret `ALYR_LINK_SECRET`.

The shop's ID is inside the signature, so a token made for one shop is refused at another. The table label is signed, so a link printed for table 7 cannot be edited into table 3. The check is constant-time and happens before anything in the payload is trusted. Refusals: `malformed`, `bad_signature`, `expired`. A customer who opens an old or broken link sees why and how to get a new one ("Message the shop on WhatsApp"); the API answers `403` with the codes `bad_link` and `expired_link` in both languages.

* **Expiry:** `ALYR_LINK_DAYS`, 60 to start. A longer life is kinder to a customer who scrolls back in their chat; a shorter one limits what a leaked link is worth. The founder's to tune.
* **The secret:** at least 32 characters. On a developer machine (`ALYR_ENV=local`) an empty one falls back to a built-in value, which is public (it is in the repository) and protects nothing. Anywhere else the API **refuses to start** without it (`check_secret` runs in the app's startup), and `mint` and `read` refuse too. Changing the secret ends every link already sent; that is also how a leak is answered today (a single customer's link cannot be revoked on its own: left out, see below).
* **What a token unlocks:** the customer's price group, "same as last time", ordering, and ordering on their credit account. Every public store route that used to take `contact_id` takes `token` instead (`cart/check` makes it optional).
* **Not covered:** the booking page's `?c=<contact id>` (`/b/<shop>`) is a different page and is unchanged; it should follow (a new issue).

## What the API gives the page (`routes/store.py`, `modules/orders/page.py`)

All public, all under `/api/store/{slug}`, all answering only where the shop has the `orders` module on.

| Call | Does |
|---|---|
| `GET /{slug}` | The page: `shop` (names, timezone, whether it has the Catalog, its WhatsApp number), `settings`, `group`, `categories` (in the owner's order, with Arabic names and counts), one page of `items` (`limit`, `offset`, `q`, `category`; no `limit` means all), `total`, `customer` (first name, language, whether they may use an account, whether they have a last order), `link` (`none`, `ok`, `invalid`, `expired`, with the sentence in both languages), `table`. Also the old `products` (orderable) and `unavailable` lists, for the page that was there before |
| `GET /{slug}/items/{id}` | One item with every photo, for its sheet and for a link that points at it |
| `POST /{slug}/live` | What changed on the items being looked at: whether each can be ordered, what is left, the price, the words about its hours. Small on purpose. `gone` names items that are no longer on the page |
| `GET /{slug}/share` | What a pasted link previews: title, description, price, the photo at 800 px with an absolute address, the item's or category's own URL. Always the normal prices |
| `POST /{slug}/cart/check` | As before, with `token` instead of `contact_id` |
| `POST /{slug}/orders`, `.../orders/repeat` | As before, with a required `token`; `table` is new on an order |

### What an item row says

* **A page at a time.** The first page (48) comes with the HTML; "Show more" asks for the next. Search and a category ask the API when not everything is loaded; when it is all loaded the page filters on its own, with a copy of the folding (`_customer/fold.ts`, tested against the same cases as `items/text.py`, `specs/005-order-page-v2/fold-cases.json`).
* **Photos:** `cover` (320 px `src`, a `srcset` of every size, its box `w` and `h`, and `medium`, the 800 px file) and, for one item, `photos`. A photo that is `pending`, `failed` or missing is a quiet tile, never a broken image.
* **Prices:** `price` is what this customer pays for the item (spec 003); an item with sizes also has `price_min` and `price_max` (a range writes both ends, never "from": Qatar's rules treat "prices start from" as misleading, see below); a sale or a group price comes with `list_price`.
* **Stock is not published.** `left` is a number only when it is true and small: more than none and no more than the shop's low-stock number (5 to start), so "Only 3 left" is shown when it is so, and a competitor cannot read the shop's stock. A sold-out item has `left` 0.
* **Plain words for hours** (`note`, `{en, ar}`, `modules/items/notes.py`, built from the same schedule the checkout enforces): "Ready from 5 pm", "Ready tomorrow from 6 am", "Available until 11 am", "Order before 2 pm for tomorrow", "Order before 6 pm on Tue 20 Oct for Fri 23 Oct", "Order ahead: next available tomorrow", "Not available right now". A made-to-order item has `order_for_dates`, the days it can be ordered for.
* **Sold out:** greyed with "Sold out", or left out, as the shop chose (`sold_out_display`, new in the Catalog's settings). Items outside their hours are always listed, with when they are back.
* **Pack sizes** (new refusal `not_pack_multiple`, in the cart check): an item whose unit is not a box or a pack and whose pack size is above one is ordered in whole packs, so the page steps by the pack and the checkout says "sold in packs of 12. Choose 12". A box or a pack is already the pack: it counts by one. (Open for the founder: was the pack size meant to force multiples, or only to inform?)

### New shop settings (`shop_settings`, migration 0029; Catalog settings sheet)

`sold_out_display` (`grey` or `hide`), `wholesale_layout` (the compact table for every customer), `whatsapp_number` (digits with the country code; "5555 0100" becomes 97455550100). And on `orders`: `table_label`, set from the signed token or, for a public link's label, from the request; shown to staff on the orders list and on the customer's tracking page.

## What a customer sees

1. **Opening the page.** The shop's name and monogram lead; the title; who is ordering (their first name) and the table if there is one; for anyone without a link, one calm card says to start on WhatsApp and the bar offers the one Volt button, "Order on WhatsApp" (`wa.me/<number>?text=Order`, or `Order table 7`). A link that has expired or is wrong says so, in words, above the menu.
2. **Finding things.** A search box that finds Arabic in the spellings people write (alef with or without hamza, ya and alef maqsura, ta marbuta and ha, the marks, Eastern digits); category chips (a chip filters); the owner's category order; the list grouped by category, a photo in a box that has its shape before the file arrives, the name, a line of description, the price, how many are left when few, and the words for its hours.
3. **Adding.** A simple item has a "+" that becomes a stepper (44 px targets); the first tap adds the smallest order or a whole pack; the stepper stops at what is left and says why. An item with sizes or required choices opens its sheet: every photo, the whole description, the sizes with their prices, the extras, tags, unit, pack, smallest order. A missing required choice is marked on the choice, named in words and read out ("Choose Size for Pizza."); nothing is added until it is made.
4. **Reviewing, before paying.** The bar says how many and how much, and "Review order". The review asks the shop again about the whole order, every time it opens and every time it changes. A price that moved shows "Was QAR 3, now QAR 4" and needs a tap to accept; an item that sold out says so and offers others from its category; a quantity above what is left offers "Change to 4"; an item outside its hours says when it is back; after a cut-off the next day it can be ordered for is offered ("Use Tue 20 Oct"); a made-to-order item asks which day. Pay and "Put it on my account" are enabled only when everything is clear, and nothing has been charged before that. While the page is open and in front, a price or availability change in the order flags it ("Something in your order changed. Please review it before you pay.").
5. **Same as last time.** One tap orders the last order again. What can no longer be ordered is left out and named, and prices that moved are listed; the rest is ordered and can be paid for at once.
6. **Paying.** The pay page knows `pending`, `paid` and `expired`. A released order says "This order was released", "Nothing was charged", and offers "Order again", which brings the customer back to the shop with their own link if the tab still has it. A Pay that is refused because the hold ran out turns the page into that state; it never stays a dead button.
7. **Live.** Every 20 to 30 seconds while the tab is in front (never while hidden; at once when it comes back after a while), `POST /live` for the items on screen and in the order. A change is applied without moving the page, and announced politely: for what is in the order, by name; for the list, "Availability updated."

## Wholesale layout

For a customer whose price group is not the default, or when the shop turns on `wholesale_layout`: a compact table with the SKU, the name with its unit or pack, the group's price and a quantity stepper, one row per item and per size (an item with a required choice opens its sheet). On a phone each row is two short lines inside the screen's width (SKU and price above, name and stepper below), checked at 375 and 320 px; on a laptop it is a table with a header. It keeps `role=table` semantics either way.

## Money in Arabic

One helper, `_customer/price.ts`, writes every amount on the customer pages; the API's English `*_text` fields are never shown on an Arabic page, and the API's own Arabic sentences write money with `fmt_qar_ar` (`core/normalise.py`).

* English: `QAR 24`, `QAR 24.50`, `QAR 1,234`. Arabic: `24 ر.ق`, `24.50 ر.ق`, `1,234 ر.ق` (the amount, then «ر.ق», Western digits, in `<bdi>`).
* **What the rule says** (checked 18 Oct 2026): Law No. 8 of 2008 (consumer protection), Article 17, requires labels and advertisements under Articles 7, 8 and 11 to be in Arabic, with other languages allowed beside it. The Ministry of Commerce and Industry's reminder of 14 Sep 2021 asks every retail outlet, virtual platform and licensed home business to display the list of prices of goods and services clearly and prominently in Arabic. A news report of March 2026 says the Ministry treats "prices start from" as misleading. Nothing found names a digit style or a currency abbreviation. Sources: Qatar Tribune, "Commercial facilities must display price list in Arabic" (14 Sep 2021); Gulf Times, "MEC reaps benefits of Arabisation initiative"; Marhaba, "Talabat services suspended for 1 week due to misleading price display" (Sep 2025); Emarat Al Youm, 5 Mar 2026. These are news reports and a ministry summary, not the statute's text: the wording should be checked against the official legal database before launch.
* **What is chosen, and why.** Western digits and «ر.ق» after the amount: it is how Qatari companies write it online (Vodafone Qatar's Arabic site, «450 ر.ق»), it is ALYR's own rule for Arabic (`alyr-design`), and it reads the same in a WhatsApp message and on the page. The Arabic locale `ar-QA` would give Arabic-Indic digits and «ر.ق.» (`Intl.NumberFormat("ar-QA", { style: "currency", currency: "QAR" })` gives «٢٤٫٠٠ ر.ق.»); that is a one-line change in the helper if the reviewer (ALY-66) prefers it.
* **No "from".** An item with sizes shows both ends («12 – 18 ر.ق», `QAR 12 – 18`), and the sheet lists each size's price.

## The workspace side (inside the Catalog, hidden with it)

* **Share** on every item that is on sale, beside its switch; on the category picker when a category is chosen; and in the Catalog's header for the whole menu. It opens a sheet: the link, "Copy link", "Send on WhatsApp" (`wa.me/?text=`), a note that says what the preview shows and where an ordering customer is sent (or that the number is missing, with a way to the settings), a QR code with "Download SVG", "Download PNG" and "Print", and **Tables**: "1-12, A1, A2" makes a code for each, with the table number in the link, each downloadable, and "Print all".
* **Printing** uses a print-only layer (the page's own fonts and tokens, always dark ink on white, whatever the theme): shop name in both languages, the code, the table in both languages, a line in each language, the link in small type and "Set up by ALYR · alyr.qa" as the print skill asks. English left, Arabic right, each complete.
* **QR codes** are drawn in the browser by `qrcode-generator` 2.0.4 (MIT, no dependencies, about 15 KB gzipped, loaded only when the Share sheet opens): error correction M, a quiet zone of four modules, dark on light, never inverted. `qr.test.mjs` reads back with an independent decoder (jsQR, a dev dependency) the link of the whole menu, of tables, of an item, of an Arabic category (percent-encoded ASCII) and of a very long one.
* **Settings:** sold-out items greyed or left out; the compact price list for everyone; the shop's WhatsApp number.
* **Orders** show the table.

## Words, and Arabic

Every word of the order page is in `_customer/order/copy.ts`, both languages written against one type; the share and settings words are in `catalogCopy.ts`; the sentences about items, hours and refusals come from the API in both languages (`items/text.py`, `items/notes.py`). The Arabic is a draft until a native speaker reviews it (ALY-66). The page opens in the customer's own language (from their link, else `?lang=`, else the phone's), and has a language switch.

## How it is checked

* `apps/api/tests/test_links.py` (tampered, malformed, expired, wrong-shop and missing tokens; the built-in secret only on a developer machine; the server refusing to start; a bare contact ID granting nothing; a public link carrying no customer), `test_order_page.py` (categories in order, pages, Arabic search spellings, stock told only when small, sold out greyed or hidden, the words for hours and cut-offs in both languages, photos in every state, sizes and ranges, group prices only on the customer's own link, the refresh, previews, tables, pack sizes, Arabic sentences without "QAR", the released pay link), `test_fold_cases.py`; the old suites updated to tokens (`tests/order_links.py`).
* `apps/web/app/(product)/_customer/customer.test.mjs` (the folding against the server's cases, the price format, the cart's rules) and `_workspace/qr.test.mjs` (QR codes read back), run by `pnpm test`, in CI and in `scripts/check.sh`.
* `scripts/order-page-browser-check.mjs`: a real browser (headless Edge) at 375 px, in English and in Arabic, light and dark, against a fictional kitchen of 30 items with photos drawn by a script. It walks plan scenarios 1 to 7, 11, 12 and 14 on the page, the released pay link, the wholesale table at 375 and 320, the live refresh and its pause, the keyboard, the previews a crawler reads, and runs axe-core on each state. Results and the throttled performance run are in the pull request.

## Left for other packages

* The order page's own use of WhatsApp: "tell me when it is back" (ALY-106). The Meta catalog sync.
* A single customer's link cannot be revoked on its own (a per-customer counter would do it); the secret ends them all. The booking page still uses the bare contact ID.
* A real phone, VoiceOver and TalkBack, Safari, the Arabic read by a native speaker, a print of the QR sheet scanned from paper with two phones (the print skill's own bar), and the number to put on a shop's cards (the founder's, per shop).
