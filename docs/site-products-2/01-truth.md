# ALYR Shelf and ALYR Docs: product truth for the public pages

20 Oct 2026. Read from `origin/main` at 647d77d and open PRs #98, #87 and #97. Three read-only sweeps (Shelf, Docs, site fit), condensed by the creative director. `00-founder-decisions.md` overrides this file. `docs/status.md` is partly stale. Several rows still say "in a pull request" for merged work: Catalog ALY-136, -148, -149 and -150, and Documents ALY-139, -142 and -146. Treat `git log` as the truth.

**General truth for both pages.**
- No shop is live. ALYR has no CR, and sign-up is closed.
- WhatsApp has run only on Meta's test number (one round trip on 12 Oct). A shop cannot connect its own number yet (ALY-39).
- Hosting is the founder's laptop behind a tunnel; always-on hosting is in PRs #51 and #52.
- Card payments are not live. The pay page is a labelled stand-in; PR #97, the payments model, is planned only.
- Arabic is a draft until a native review (ALY-66).

What may be said, per `honesty.md`: "built", "we set it up with you". What may not: "live for businesses", "today", "now".

---

## 1. ALYR Shelf (the Catalog module)

**What it is.** A module that belongs to no product, included with ALYR. It is on for new shops (`catalog_for_new_shops=True`) and for existing shops (migration 0032), except the travel and documents types. The back office can switch it off per shop. It is not priced on its own (D-039).

**Workspace names**, chosen by business type:

| Business type | English | Arabic |
|---|---|---|
| Restaurant, bakery | Menu | القائمة |
| Grocery, fashion, shop, salon, spa, clinic, home services | Products | المنتجات |
| Wholesale | Price list | قائمة الأسعار |
| No type | Catalog | الكتالوج |

- Route `/app/catalog`, with the tabs "Items" / «الأصناف» and "Stock" / «المخزون».
- Toolbar: Import / Export, Discounts, Delivery, Features, Settings.
- Home cards: "Sold out now" / «نفدت الآن», "Low stock" / «مخزون قليل».

**Built on main** (each can be drawn; quotes are the product's own words):
- **Items.**
  - Fields: English and Arabic names, description, category, price with a sale price, dates and price history, unit, tags, SKU, and an item code (from 101, never reused).
  - Status: draft, live, hidden or archived. An item with order history is archived, never deleted. The Arabic name is required before an item can go on sale.
  - Up to 8 photos per item, with a cover. Each is checked, its location and camera data are removed, and it is saved as WebP at 320, 800 and 1,600 px. They are stored on R2; the live R2 smoke test has not been run, so say nothing about where photos are stored.
- **Sizes and colours** («المقاسات والألوان»), each with its own stock and price difference.
- **Choices and extras** («الخيارات والإضافات»). An item with required extras is sent to its page from the chat.
- **Availability rules:**
  - always;
  - an on/off switch;
  - counted stock;
  - "A number each day" («عدد في اليوم»);
  - "Times it can be ordered" («أوقات الطلب»), with lead time, cut-off and date overrides.

  The order page speaks plainly: "Ready from 5 pm", "Order before 2 pm for tomorrow".
- **The stock log** only ever adds rows: opening, received, sold, cancelled and restocked, wasted, counted, adjusted, each with who, when and why. **The last item can only sell once**: one database step moves the count only if it stays at or above zero, and race tests prove it.
- **Pay-link holds.** A pay-link order holds its stock for 30 minutes (the shop can change this). If it is unpaid by then, the order is cancelled, the stock goes back and the customer is told. Credit-account orders are committed straight away. A cancellation restocks once.
- **Sold out on the order page:** the shop chooses greyed or left out (grocery starts with left out). Labels: "Sold out" / «نفد», and "Only {n} left" / «المتبقي {n} فقط» at or under the low-stock number.
- **Sold by weight or volume:** kg, g, L, ml, m and tola, with quick amounts such as 0.25, 0.5 and 1 kg. The chat reads `214 x0.5`. It is on for new groceries and bakeries.
- **Ordering by item code in WhatsApp:**
  - The customer can send `214`, `#214`, `214 x2, 305`, `214 (black M) x2`, «رقم ٢١٤», a SKU, a link or a name.
  - The reply is a card "Item code {n}" / «كود الصنف {n}» with Confirm / Change, then Place order / On my account / Empty order.
  - Five unmatched codes in ten minutes, voice notes and "talk to a person" all go to the team inbox.
- **"Order on WhatsApp" button** on the order page, once the shop has added its number. It opens `wa.me` with the order written out.
- **Staff on WhatsApp**, for registered staff numbers only:
  - Commands: «نفذ شاورما» / "sold out shawarma", "back shawarma", "stock abaya black M 5" (this sets the count), "price shawarma 12", "undo". The Arabic verb can also come last, as in «الشاورما خلصت».
  - Replies: "Done: {name} is now sold out. Customers cannot order it.", "Done: {name} now has {n} in stock (it was {before})."
  - Each reply has an Undo button, usable once, by the same person.
  - A photo with a caption such as "Mixed grill 35" becomes a draft: "Saved as a draft: … It is not on sale until an owner confirms it."
- **Price groups for wholesale.** A group's price replaces the sale price. The group is set from the inbox conversation.
- **Built but off by default** (say "when you switch it on", or leave out):
  - Discounts and coupons: percent, fixed, buy N get M, or by code ("coupon RAMADAN10").
  - Delivery and pickup: areas with fees, free over an amount, a minimum, days and a cut-off. No maps, no drivers.
  - Cost price and margin, seen by owners and admins only. It warns when a price is below cost.
- **Shop templates by business type.** Starting rules: a bakery has a number each day, ordered a day ahead before 6 pm; a grocery has counted stock, low at 10, left out when sold out. Sample items are marked Sample and removed all at once.
- **Your own fields** (up to 20), and a Features screen that switches each capability.
- **Import and export:** Excel or CSV with English or Arabic headings, a preview of every row, one undo, and photos from a zip. Not yet tried in real Excel.
- **Alerts:**
  - Low stock and sold out go to managers once a day, never between 22:00 and 07:00.
  - "Tell me when it is back" asks the customer once.
  - Outside the 24-hour window both need templates that are **not submitted**.
- **Share links and QR codes** for the order page.
- **The weekly report** has Shelf lines (sold out this week, most sold, did not sell). They are in the email and the API, **not** in the WhatsApp card's caption.

**Not built, never claim:**
- Meta catalog sync, with no code (D-039: only if proved for Qatar numbers).
- Barcodes, batches, expiry, serial numbers, suppliers, bundles (registered, hidden).
- Photos for each variant.
- A staff command by code ("sold out 214").
- Maps or drivers.
- That photos are hosted in Qatar.

---

## 2. ALYR Docs (the Documents module)

**Status.** Engine, sales hooks, workspace screens and connected mode are all merged (#85, #88, #92, #94). **The module is off for every shop** and in no product; the back office can switch it on for one shop. PR #98 (open) adds standalone mode and a product named "ALYR Invoices". **The founder has named it ALYR Docs** (flagged on #98). The workspace section is "Documents" / «المستندات», at `/app/documents`. Its intro reads: "Receipts, invoices and the rest: numbered, in Arabic and English, and sent to your customers." / «إيصالات وفواتير وغيرها: مرقّمة، بالعربية والإنجليزية، وتُرسل إلى عملائك.»

**Kinds** (prefix, English, Arabic):

| Prefix | English | Arabic | Note |
|---|---|---|---|
| RC | Receipt | إيصال | |
| INV | Invoice | فاتورة | needs the shop's CR |
| QT | Quotation | عرض سعر | |
| DN | Delivery note | إشعار تسليم | |
| ST | Statement of account | كشف حساب | no flow yet; don't feature it |
| CN | Credit note | إشعار دائن | |
| DR | Deposit receipt | إيصال عربون | |
| PF | Proforma invoice | فاتورة أولية | needs a CR |

Paper sizes are A4, A5 and an 80 mm roll. Currency is QAR by default, and other Gulf currencies are display only.

**Built on main, hidden** (true behaviour to draw):
- **Numbers never skip.** Each shop, kind and series has one counter, taken under a lock, so a failed issue gives its number back: INV-0042, or INV-2026-0042 when the series restarts each year. **Branches** each have their own series (INV-0042 / INVLUS-0007), with the branch's address and phone on the paper.
- **Cash rounding** to 5, 10, 25, 50 or 100 dirhams (off by default). It is a line of its own, "Rounding" / «تقريب», never hidden in a price.
- **Arabic first by default** (`ar_en`). On a consumer document Arabic cannot be switched off; a business document may be English only. Formal Arabic, Western digits, «ر.ق» after the amount.
- **A shop with no CR issues receipts**, never invoices, and the paper says: "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice." Tax is off; "tax invoice" is never used while it is.
- **Issued paper cannot change.** The database refuses any edit. A credit note covering the whole document voids it. Nothing is deleted. The content is hashed, and the seller and customer are copied onto the paper at issue. Refusal text: "This document has been issued and can no longer be changed. To correct it, issue a credit note."
- **Made from sales automatically** (each is a switch, all on by default once the module is on):
  - a receipt when an order is paid by link;
  - an invoice when an order goes on a credit account;
  - a receipt for a payment on a credit account;
  - a credit note when a receipted order is cancelled.

  Each is issued once even if the event fires twice, and a failure never stops the sale. **The only payment link today is the stand-in page**, so "when a customer pays" must not imply live card payments.
- **Payments recorded by hand** (cash, transfer, cheque, card terminal) make a receipt, or a deposit receipt for part of a booking. Agents may record payments only if the owner allows it.
- **Delivery:**
  - **WhatsApp inside the 24-hour window:** the PDF itself, with the caption "{Title} {number} from {shop}: {amount}. Thank you. You can also open it online: {link}".
  - **Outside the window:** templates (receipt, invoice, credit note) that are **written but not submitted to Meta**. Until they are approved, it falls back to email.
  - **Email:** the PDF attached, from "{shop} via ALYR", in plain text. It needs the customer's email address, and no screen collects one yet.
  - **Hosted link page `/d/…`:** a signed link valid for 90 days, with a Download PDF button and "Paid" / «مدفوع» or "Balance due {x}" / «المتبقي {x}». The page shows nothing about the customer.
  - No real send to a real phone or a real email has been made.
- **The PDF** is drawn by fpdf2 with HarfBuzz (Arabic correctly shaped) in the brand fonts, and kept in the database, never on R2. Screens show it as page pictures (PDFium). The paper carries "Issued with ALYR" / «صدر عبر ALYR», which the owner can remove.
- **Connected mode:** another POS or accounting tool sends its sales by API or CSV, and the shop decides, per kind, who owns the numbers. A paper with an outside number says: "Issued by the seller's own system… Delivered by ALYR." No named POS connector, and no real POS has been tried.
- **In PR #98 only (not on main)** — don't draw these unless #98 merges first:
  - quick creation from one line ("AC repair 500 for Ahmed");
  - the staff WhatsApp command «فاتورة أحمد 500 صيانة مكيف», with Yes / Edit / Cancel and a ten-minute undo by credit note;
  - remembered customers;
  - a QR to pay, shown only where a payment page works.

**Never claim:**
- That Docs is available or switched on today.
- E-invoicing, or meeting the General Tax Authority's system (D-008 parked).
- "Tax invoice", or VAT.
- "Compliant with Qatar's Arabic invoice rule". The circular's exact wording is unconfirmed (ALY-51); you may say "Arabic first, and Arabic always on documents for consumers".
- A retention period (ten years is unconfirmed). Say "ALYR never deletes an issued document."
- Invoices for a shop without a CR.
- That an unregistered seller may issue invoices.
- Live card payments.
- Statements or quotes as a full flow, or recurring documents.
- Delivery by WhatsApp at any time (that needs the templates).
- That it works with a named POS.

---

## 3. Fit with the site (what changes elsewhere)

- **The product list.** `site.ts` `PRODUCTS = ["chat","bookings","agent","accounts","payroll"]` drives the Products menu (desktop and phone), the homepage suite section, the footer and the "works with" rows on every product page.
  - Remove `payroll` everywhere (founder, 20 Oct), and add `shelf` and `docs`.
  - Widen `Exclude<ProductKey,"payroll">` (copy.ts:228), the `meta` key union (385) and `pages` (434).
  - Remove the hard-coded `key === "payroll"` (HomePage.tsx:190).
- **The labels.** Every "Early access" / «إطلاق مبكر» becomes "Set up for you" / «نجهّزه لك»; Agent and Shelf say "With every product" / «مع كل منتج». Every Payroll "Coming" / «قريباً» line goes (copy.ts 511, 514, 539, 661, 1326, 1702, 1862, 2263 and their Arabic twins).
- **Lines that go stale:**
  - /accounts "Not yet" (copy.ts 2237, AR 4102): "Statements and invoices." and "Recording how a customer paid" are built now (hidden). Reword to point to ALYR Docs without claiming it is on.
  - /chat 1239: "a receipt the moment it is paid" means the WhatsApp confirmation, not a Docs receipt. Leave it, or clarify it.
  - /chat's staff demo Arabic says «الفاتورة» where the English says receipt (2915, 3079). Fix it to «الإيصال».
  - Homepage meta and FAQ `which-product` list three products. Add Shelf and Docs where natural.
- **New pages need:**
  - routes in both groups;
  - `PATHS`;
  - `pages="chat bookings agent accounts"` in `build-site.sh` (line 25), which also drives the social cards: each English page has its own `opengraph-image.tsx`;
  - the sitemap and metadata, which read `PATHS`.
- **Prices behind the offer switch:** the "+QAR 150 per product" lines would contradict Shelf ("included") and Docs (no price item). With the offer on, reword them to name the priced products only.
- **Sample businesses** (honesty.md register): Qirfa Bakery, Dafira Salon and Zilal Cooling are checked. The demo shops in `docs/demo.md` (Zaytoun Kitchen, Hanan's Oven, Najma Baqala, Layali Abaya & Gifts, Safwa Home, Rawda Trading, Lumi Salon) are **not** in the checked register. Use Qirfa Bakery for both pages where it fits (a bakery sells by count and by weight, and takes orders on account). If a grocery or fashion example is needed, propose a name and check it.

## 4. Real moments worth drawing

**Shelf:**
1. The last item: two customers, one stock, one sale, and the other told "Sold out".
2. A sale arriving, and the stock log gaining a "sold" row, the count stepping down by itself.
3. Staff send «الكيكة خلصت» (or "sold out saffron cake"), get the reply "Done… sold out" with Undo, and the order page greys it.
4. Ordering by code in the chat: "214 x2", the Confirm card, then Place order.
5. The item editor: photos, Arabic and English names, sizes, availability "A number each day", ordered a day ahead before 6 pm.
6. Sold by weight: "Dates, 0.5 kg" with quick amounts.
7. A pay-link hold: unpaid after 30 minutes, the stock comes back by itself.
8. A photo with a caption becoming a draft item.

**Docs:**
1. A payment arriving, a receipt issued and sent in WhatsApp as a PDF with its caption.
2. The bilingual paper, Arabic first, with the gapless number RC-0042 and "Issued with ALYR".
3. The no-CR rule: a receipt with its "not a tax invoice" note, plus the friendly refusal when such a shop asks for an invoice.
4. Issued means final: a correction becomes a credit note that voids the invoice ("Cancelled by credit note CN-0003").
5. Branches with their own series (INV-0042, INVLUS-0007), and the cash rounding line.
6. The hosted link page with "Paid" and Download PDF.
7. Connected mode: another system sends its sales, and ALYR delivers its paper.

**Renders from the real engine:** `uv run python -m alyr.document_samples <folder>` in `apps/api` writes receipt, invoice and credit note PDFs for Qirfa Bakery (RC-0042, INV-0017, CN-0003). `render/sample.py sample_doc(...)` covers bilingual layouts, A5 and thermal paper; `render/raster.py` turns them into PNGs. Shelf screens can be captured from `scripts/catalog-browser-check.mjs` and `scripts/order-page-browser-check.mjs`, but those use the unchecked demo names, so the site should draw its own screens with Qirfa Bakery, as the other product pages do.
