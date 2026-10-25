# ALYR Shelf and ALYR Docs: visual direction

20 Oct 2026, design lead. Read-only step: no code changed. `00-founder-decisions.md` wins over this file, then `01-truth.md`, then `alyr-design`. Captures are in `review/viz/`; the engine's real RC-0042 (A4, roll, no-CR, invoice) is in `review/viz/engine/`.

## 0. References (brief)

- **Seen, Stripe Invoicing:** the real hosted invoice is the hero, and the same invoice later lands on a phone. *Ours:* the paper is the hero of Docs, and the same RC-0042 shows up in the chat.
- **Seen, Shopify Inventory:** count discs and status chips on product cards; "Total received 0 of 2". *Ours:* one count stepping **because of a sale**, not a cloud of cards.
- **Seen, Ramp:** a flying document and a ticker of live counters ("agents at work"). *Avoid.*
- **Seen, Zoho, Square Retail, Foodics home:** stock photos of people, floating KPI cards, ratings, confetti. *Avoid.*
- **Not seen:** Toast (bot check) and the Foodics inventory page (redirected).

The lesson: the vivid pages show **one real object changing state**.

## 1. Motion grammar (both signatures)

- **Tokens:** `--dur-1` 120, `--dur-2` 240, `--dur-3` 480, `--dur-4` 720 ms; `--stagger` 60; `--ease` for arrivals, `--spring` for presses. To **arrive** is `translate: calc(var(--dir)*var(--travel)) calc(-1*var(--travel))` → 0 with opacity, over `--dur-3`.
- **Trigger:** the existing `SiteMotion` observer (`data-reveal`) adds `.is-in`. The figure is CSS keyframes under `.motion .sig.is-in`, with **no JavaScript of its own**.
- **The HTML is the end state.** Start states exist only under `.motion .sig:not(.is-in)`. Without scripts, or with reduced motion, the figure shows the finished triptych. The one 1 → 0 step holds both digits: "0" by default, and "1" only as the motion start state, `aria-hidden`.
- **Plays once and ends before 3 s,** so no pause control is needed. A sentence in `copy.ts` tells screen readers what happened.
- **One Volt mark per figure,** when something is confirmed. "Sold out" is never red (`--bad` is product-only).
- **RTL:** columns mirror through the grid, travel through `--dir`, and the 45° wipes through `[dir="rtl"]` polygons. Time runs right to left.

## 2. ALYR Shelf

### 2.1 Signature: "The last one" (FIG 01)

**Placement:** a new section straight after the Carbon hero, on the light canvas, full width (`id="moment"`).

**Sample:** Qirfa Bakery, Monday 19 Oct 2026. Item 214, **Saffron cake / كيك الزعفران**, sold as "A number each day", 6 a day, sample price QAR 45. Two customers order on their accounts, **Mariam Saleh** (A) and **Aisha Hamad** (B). Account orders take stock at once, so no payment appears.

**At 1440:** phone A in columns 1–3, the stock card in 5–8, phone B in 10–12, on one hairline rule with crosses. In Arabic, A is on the right.

| t (ms) | Move | Words (EN / AR, product copy) |
|---|---|---|
| 0–480 | A arrives; B at +60; the card at +120 | Row "Saffron cake · QAR 45.00 · **Only 1 left today**" / «المتبقي اليوم 1 فقط»; bar "Put it on my account" / «سجّله على حسابي» |
| 600–720 | Both bars pressed at the same moment (`.98`, `--dur-1`, `--spring`) | "Placing your order…" / «جارٍ إرسال طلبك…» |
| 960–1440 | A row wipes into the stock log (clip-path from the top) | "**Sold** · −1 · order #1452 · by Customer · 16:42" / «مبيع · −1 · الطلب رقم 1452 · بواسطة العميل» |
| 1200–1560 | "1" leaves up along 45°; "0" arrives from the opposite diagonal (+120) | Large tabular **0**, "of 6" / «من 6» |
| 1560–1800 | **Volt:** the row's tick fills once (`.6 → 1`, `--spring`) | none |
| 1680–1920 | Phone A shows its result | "Order #1452 received" · "It has been added to your account." |
| 1800–2280 | Phone B: the row greys (opacity .48), the stepper becomes "**Sold out**" / «نفد», and a notice rises | "Saffron cake is sold out" / «نفد كيك الزعفران» · "Fix the items marked above to continue." |

No wires or pulses: the figure is about the count.

**Caption:** "FIG 01 · The last saffron cake sells once · Fictional bakery" / «الشكل 01 · آخر كيكة زعفران تُباع مرة واحدة · مخبز غير حقيقي».

**At 390:** A, then the card, then B, stacked on a rule down the inline-start edge. The phones are cropped to the row and the bar (about 260 px each). Same timings.

### 2.2 Tabbed demo (hero, `ProductDemo`)

| Tab | Chat | Panel | Caption, one hard fact |
|---|---|---|---|
| 01 Code | "214 x2" → card "Item code 214", Confirm / Change, then Place order | "214 · Saffron cake × 2", "Only 4 left today" | "214, #214 and «رقم ٢١٤» find the same item." |
| 02 Sold out | Staff: "sold out saffron cake" / «الكيكة خلصت» → "Done: Saffron cake is now sold out. Customers cannot order it." with Undo | Menu row → Sold out | "Undo works once, for the person who sent it." |
| 03 Stock | (panel only) | Opening count 6; Sold −1 ×3; Wasted −1 "Spoiled" by Yusuf | "The log only adds rows; none can be edited." |
| 04 Weight | "305 x0.5" → "Khalas dates, 0.5 kg", quick amounts 0.25 · 0.5 · 1 kg | Row 305 | "Sold by kg, g, L, ml, m or tola." |

Leave the pay-link hold to "What's in it" (it needs the stand-in page).

### 2.3 Other sections

| Section | Drawing | Caption | Component |
|---|---|---|---|
| How it works | Stories "A sale counts itself" (work lines: "Item code 214 found", "Today 3 → 2 · sold", "Low at 2: managers told once a day"); "Staff mark it sold out"; "A new day" (back to 6, with nothing run) | none | `FlowDiagram`, copy only |
| The screen | `/app/catalog`, "Menu" / «القائمة», Items tab: 6 rows (code, photo tile, both names, price, "A number each day · 6", Live / Sold out / Draft); the toolbar. Callouts: code from 101 never reused; Arabic name before sale; rule; Sold out filter; Import / Export | "FIG 02 · The Menu, Items · Fictional bakery" | **New `CatalogScreen`**, `_site/Sheets.tsx`, on `Frame`/`.ws-*` |
| Under it (`extra`) | Stock tab, "Recent changes", ending "balance 0" | `pk-also-cap` | **New `StockLog`**, `Sheets.tsx` |
| The order page (a second `ScreenBlock`) | Two phones: sold out **greyed** and **left out** (the list then opens on "Cardamom bun · Only 2 left today"); a small third phone shows "Order before 6 pm for tomorrow" | "FIG 03 · The order page, sold out greyed or left out · Fictional bakery" | **New `OrderPageScreen`**, `_site/PageDrawings.tsx`. It revives the orphaned `.d-row`, `.d-add`, `.d-stepper` and `.d-bar` CSS, plus a new `.is-out` state |
| Inside / Not yet | Not yet: barcodes, batches and expiry, suppliers, photos for each size, a command by code, maps | | `InsideBlock` |

**Photos:** a flat `--d-wash` tile with its slot in mono ("1 · COVER"). No stock or generated food images. A callout tells the truth: "Up to 8 photos; location and camera data removed." Real photographs of a real cake are the founder's call.

## 3. ALYR Docs

### 3.1 Signature: "A payment becomes paper" (FIG 01)

**Sample, from the engine** (`render/sample.py`, A4, `ar_en`): **RC-0042**, مخبز قرفة / Qirfa Bakery, «19 أكتوبر 2026». Lines: bread 12 × 3.50, large date cake 2 × 45.00 − 5.00, coffee, delivery; **total «169.00 ر.ق»**, Cash · نقدًا. The customer is **Aisha Hamad / عائشة حمد** (see §6.1).

**At 1440:** the workspace crop in columns 1–4, the A4 in 5–9 (the largest element), the WhatsApp phone in 10–12. These mirror in Arabic, but **the paper never mirrors**: it is Arabic-first on both pages, because that is the document.

| t (ms) | Move | Words (EN / AR) |
|---|---|---|
| 0–480 | Window arrives (`.aw`, monogram ق) | "Record a payment" / «تسجيل دفعة»; "Money you took yourself. ALYR never holds money; this writes it down, with who and when."; QAR 169.00; Cash, selected; "Make the receipt", ticked |
| 600–720 | "Record the payment" / «سجّل الدفعة» pressed (a Carbon `ws-btn is-primary`, never Volt) | |
| 720–960 | The result rises | "Payment recorded. Receipt RC-0042 made." / «سُجّلت الدفعة وصدر الإيصال RC-0042.» |
| 960–1680 | **The paper draws:** a wipe along the fold's diagonal from the top inline-end (`--dur-4`) | |
| 1080–1920 | Contents rise in reading order, 60 ms apart, **each Arabic text 60 ms before its English twin**: shop, إيصال/Receipt, RC-0042, the date, lines, totals | |
| 2040–2520 | A document bubble arrives, below Aisha's own message minutes earlier (the 24-hour window is visibly open) | "RC-0042.pdf · 1 page · PDF"; "Receipt RC-0042 from Qirfa Bakery: QAR 169.00. Thank you. You can also open it online: alyr.qa/d/…" / «إيصال رقم RC-0042 من مخبز قرفة بمبلغ 169.00 ر.ق. شكراً لك. …» |
| 2640–2880 | **Volt:** the delivery row ticks once | "Sent · WhatsApp" / «أُرسل · واتساب» |

**Caption:** "FIG 01 · A cash payment becomes receipt RC-0042 · Fictional bakery" / «الشكل 01 · دفعة نقدية تصبح الإيصال RC-0042 · مخبز غير حقيقي».

**At 390:** the sheet and its result, then the **80 mm roll** in place of the A4, then the bubble.

### 3.2 The paper (FIG 03): convincing, and still ALYR's

A **new `PaperBlock` section** shows the A4 and the roll side by side: one document, two papers. **New `_site/Paper.tsx` (`PaperA4`, `PaperRoll`) and `_site/paper.css`.**

- **Live HTML text, not a PNG.** It stays sharp, the browser shapes the Arabic, it themes, and it weighs only kilobytes. The figure is `inert`, with one sentence describing it.
- **The engine's layout, element by element:** the shop block at the inline-start, with «إيصال» / Receipt opposite; a 2 px rule; label pairs "الرقم · No."; Arabic table headings over small English ones; the totals band; Notes and Terms in two columns; the foot "Document code 9F3A 7C21 D0B4 11E8 · صفحة 1 من 1 · صدر عبر ALYR".
- **Numbers:** tabular Instrument Sans, each amount one `<bdi>` run, «ر.ق» after it. Under the A4, a mono **series rail**: RC-0040 · RC-0041 · **RC-0042** · RC-0043 on a dashed slot marked "next" / «التالي». That is gapless, shown with the solid-and-dashed rule.
- **The ALYR frame:** the paper keeps square corners (true to print). It sits on a `--surface-subtle` plate with the 45° cut, crosses at the corners, and **mono dimension lines** ("210 mm", "297 mm", and "80 mm" over the roll), like a working drawing.
- **A4** keeps 210:297 at about 5 columns; on phones, only its top 45% (head, number, customer, two lines). **The roll** (`thermal80`) is about 300 px wide and full length, "12 قطعة × 3.50" under each line, the total large. Its dashed separators belong to the paper (`--doc-rule`, inside the paper only), and the space kept for a later QR stays blank.
- **New tokens, both themes:** `--doc-paper`, `--doc-ink`, `--doc-ink-2`, `--doc-rule`, `--doc-band`. In dark mode the paper is turned down one ramp step, never inverted, at 4.5:1 or better.

### 3.3 Tabbed demo (hero)

`demo.note`: "Sample conversation with a fictional bakery. A document is sent on WhatsApp when the customer has written in the last 24 hours."

| Tab | Chat | Panel | Caption, one hard fact |
|---|---|---|---|
| 01 Receipt | The RC-0042 bubble and its caption | Record a payment → "Receipt RC-0042 made." | "Numbers never skip: the next receipt is RC-0043." |
| 02 Invoice | Khalid Nasser: "Put it on my account" → "Invoice INV-0017 from Qirfa Bakery: QAR 169.00. Thank you." | INV-0017 · Part paid · Sent | "An invoice needs the shop's CR; without one, ALYR issues receipts." |
| 03 Correct | "Credit note CN-0003 from Qirfa Bakery: QAR 85.00. It cancels a document we issued before." | Edit INV-0017 → "This document has been issued and can no longer be changed. To correct it, issue a credit note." → CN-0003, "Goods returned" | "Issued paper never changes; a correction gets its own number." |
| 04 Link | (panel only) | The `/d/` page on a phone: Receipt RC-0042 · Paid / مدفوع · Download PDF | "The link works for 90 days and shows nothing about the customer." |
| 05 Paper | (panel only) | Print: A4 · A5 · 80 mm roll | "One document on A4, A5 or an 80 mm roll; it does not change." |

### 3.4 Other sections

| Section | Drawing | Caption | Component |
|---|---|---|---|
| How it works | Stories "A payment on account" (ties to /accounts), "An order on account", "A cancelled order". Work lines: "Series RC · next 0042 · taken under lock", "Arabic first", "PDF drawn · 1 page", "Within 24 hours: sent" | none | `FlowDiagram` |
| The screen | `/app/documents`, "Documents" / «المستندات», newest first: RC-0042 Aisha Hamad Paid · Sent; INV-0017 Part paid; CN-0003 "Cancels INV-0017"; INVLUS-0007 (Lusail branch); RC-0041. Callouts: series, kind, payment, delivery, branch | "FIG 02 · Documents · Fictional bakery" | **New `DocumentsScreen`**, `Sheets.tsx` |
| The paper | §3.2 | "FIG 03 · Receipt RC-0042 on A4 and an 80 mm roll · Fictional bakery" | `PaperBlock` |
| Once issued (new section) | Two `/d/` phones: INV-0017 "Cancelled by credit note CN-0003"; CN-0003 "Against INV-0017" | "FIG 04 · A correction, as the customer sees it · Fictional bakery" | **New `DocLinkScreen`**, `PageDrawings.tsx` (`Phone`, `CxTop`) |
| No CR (in Inside) | The receipt's foot note, at A4 scale: "…This document is a receipt and is not a tax invoice. ALYR does not give tax advice." | "FIG 05 · A receipt from a shop with no CR · Fictional bakery" | `PaperA4` crop |
| Not yet | E-invoicing, statements as a full flow, recurring documents, a QR to pay | | `InsideBlock` |

**The bubble** is a **new `.wa-doc`** in `site.css`, on the `--wa-*` tokens: a page glyph from the icon grid, the file name in mono, "1 page · PDF", and the caption. No WhatsApp logo.

## 4. Phones, themes, RTL, budget

- **390 and 320:** the signatures stack. Grid tracks use `minmax(0, 1fr)`; phones crop and never shrink. Probe `scrollWidth` at 320 in both languages; no "…" on Arabic names.
- **Dark:** only `--d-*`, `--doc-*` and `--wa-*`, with no dark rules of their own. The paper's plate takes a hairline. The Volt tick on light carries a `--line-strong` ring, for 3:1.
- **RTL:** `[dir="rtl"]` polygons for the wipe, the plate cut and the glyph; `<bdi>` around "214 x2", "RC-0042" and every amount. Fix in passing: `drawings.css` uses `:dir(rtl)` (lines 13, 161, 202).
- **Budget:** the hero stays as on /accounts, with the H1 as the LCP, never faded from 0. Each signature is HTML and CSS, under 6 KB of CSS, with no new JavaScript and no raster images on either page. Sections below the hero use `content-visibility: auto` with a `contain-intrinsic-size`. Targets: LCP under 2.5 s, CLS under 0.05, Lighthouse mobile at least 90.

## 5. What not to do

- No barcodes, QR codes or scan glyphs: they are not built, and the roll's QR space stays blank.
- No stock or generated photos (shelves, cakes, boxes, people, tills). No 3D, glow, gradients, confetti, ratings, logo walls or counters.
- Nothing that implies Docs is on: no "today", "now", "live", "turn it on" or "coming"; no Volt "Issue and send"; no "tax invoice", VAT, e-invoicing or retention period.
- No payment flow on Shelf. A payment link in a Docs drawing appears only with the stand-in note.
- No WhatsApp logo or brand green; no "assistant", "smart" or first-person lines.
- Never stamp "Cancelled" on an issued PDF. A cancellation shows on the `/d/` page and in the list.

## 6. Found while reading (other lanes)

1. `render/sample.py` names the customer "Fatima Al-Kuwari", a family name retired in `honesty.md` §5, and this sample goes to Meta. Use Aisha Hamad. Its CR "100200" looks plausible, not "visibly not real".
2. The stock log actor "Assistant" / «المساعد» (`catalogCopy.ts`) and "…I will send you…" (`items/wa_text.py`) break the no-AI and first-person rules. Don't draw either.
3. A JSON export from `document_samples` would let the site draw RC-0042 from the engine, as it already does for the Agent's samples.
4. `alyr-print` still says invoices and receipts are "Not built". Fix it in the build PR; this step changes no files.
