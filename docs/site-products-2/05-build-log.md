# ALYR Shelf and ALYR Docs pages: build log

ALY-205, branch `aly-shelf-documents-pages` (worktree `D:\alyr-home`), from `origin/main` at 647d77d (up to date on 21 Oct, nothing to merge). Spec: `04-brief.md`, with `00` to `03`. Newest at the bottom.

Preview: a dev server on port 3117 (`ALYR_DIST_DIR=.next-preview`); captures with a puppeteer-core script in headless Edge, profile `C:\t\shelfprof`, outside the repo. Screenshots in `shots/`, not committed.

## Start, 21 Oct

- Read `docs/status.md`, `docs/operating-model.md`, the lane brief, `CLAUDE.md`, the skills (`alyr-design` and its reference files, `alyr-site-page`, `alyr-design-review`), `00` to `04`, `docs/agent-dashboard/08-site-log.md` and `docs/design-system/01-tokens-log.md`.
- No Linear issue was named. Created ALY-205 (Site and brand, Alyr Launch) for this work.
- Product truth re-read from the code where the pages quote it: `_customer/order/copy.ts`, `ItemCard.tsx` and `ui.tsx` (the order page's cards, the blank photo tile, "Only 1 left today", "Sold out", "Placing your order…"), `catalogCopy.ts` (Stock tab, its kinds and reasons), `items/wa_text.py` (staff replies, the code card), `items/text.py` (the 30-minute cancellation), `items/notes.py` (order times), `items/stock.py` and `holds.py` (a daily-limit sale writes a "sold" row; a hold's cancellation writes "cancelled_restocked", shown as "Put back"), `documents/words.py`, `delivery_words.py`, `documentsCopy.ts`, `(product)/d/[slug]/page.tsx`, `seed_qirfa.py` (item codes 101 to 113 in menu order: 104 croissant, 108 saffron slice, 109 kunafa cheesecake, 110 and 111 celebration cakes).

## Where 02 and 03 disagree, and what was built

The brief puts 02 (words) above 03 (drawings). Where they differ, 02's facts are used in 03's drawings:

| Topic | 02 | 03 | Built |
|---|---|---|---|
| Shelf's signature item | Pistachio kunafa cheesecake, 109, QAR 185, 6 a day, Sat 17 Oct | Saffron cake, 214, QAR 45, Mon 19 Oct | 02's item and date in 03's figure |
| Who gets the last one | Aisha (#1452); Mariam is told | Mariam (A) | Aisha, as 02's flow and demo say |
| Item codes in the demo | 108, 131 | 214, 305 | 108, 131 (the seed's real order; 131 is 02's invented maamoul) |
| RC-0042 | 2 saffron slices and a croissant, QAR 64.00 | bread, cake, coffee, delivery, QAR 169.00 | QAR 64.00 |
| Shelf FIG 02 | the Stock tab with one item's recent changes | the Items tab | the Stock tab (`CatalogScreen`, the brief's name) with `StockLog` under it |

Also changed while building:
- **Order numbers.** 02 puts RC-0042 on order #1452 and INV-0017 on #1451, but on the Shelf page #1452 is Aisha's kunafa cheesecake on Saturday. The Docs papers are dated Monday 19 Oct, so their orders are #1461 (RC-0042) and #1462 (INV-0017).
- **Docs story 2, step 4 dropped** ("Omar pays part of it, QAR 100"): story 3 then cancels the same INV-0017 in full, which a part payment would contradict. The receipt for each payment on account stays in "What's in it" and "Works with".
- **The code card's last line** is the product's one-line form, "Tap Confirm to add this to your order." (`check_ask`); 02 used the plural form for one line.
- **No phone, email or CR number on the drawn paper.** The engine's sample prints a 5555 phone, a made-up CR and a licence number; a 5555 number can be a real Qatari mobile, and 02 says draw no CR rather than invent one. The paper keeps the shop's name and address (Bin Mahmoud, Doha).
- **Sold out is never red on the site.** The real order page tints "Sold out" with the product's `--bad`; the drawing greys the card and says "Sold out" in ink (03 §1).
- **Drawn buttons that cannot be pressed are outlined** ("Put it on my account", "Download PDF"), never Volt: the header's button is the page's one Volt button.
- **Customer messages carry no right-to-left mark.** The product puts U+200F before its own Arabic lines (kept in the drawn replies); a customer types plain "108 x2". In the site's own Arabic sentences a code with its quantity is one left-to-right isolate, and the link line under a drawn caption is isolated too.

## Stage 1 · plumbing and labels

- `site.ts`: `PRODUCTS` is Chat, Bookings, Agent, Accounts, Shelf, Docs (02 §1 argues for this over the brief's default, keeping the fixed order and `catalog.py`'s module order; the brief allows it). `PATHS.shelf`, `PATHS.docs`; `productPath()` always returns a path; `INCLUDED` (Agent and Shelf) for the "+" tags.
- Payroll removed everywhere: the menu, the phone menu, the footer, the suite, every "works with" row, `payrollSr`, `footer.coming`, the `Exclude<ProductKey, "payroll">` type, the dashed menu and row styles that only Payroll used.
- "Early access" / «إطلاق مبكر» became "Set up for you" / «نجهّزه لك» on the menu states and the eyebrows; the inside notes and the homepage note say "We set ALYR … up with you at your shop" (02 §5.3). The Sunday report's eyebrow drops the label.
- The Products menu has six columns, three to a row under 75 rem.
- `Text.tsx` keeps "ALYR Shelf", "ALYR Docs" and document numbers (RC-0042, INVLUS-0007) whole.
- Tokens: `component.document` (`--doc-paper`, `--doc-ink`, `--doc-ink-2`, `--doc-rule`, `--doc-band`) with dark values, regenerated; the drift check passes.
- `drawings.css`: every `:dir(rtl)` became `[dir="rtl"]` (03 §4, the one RTL selector).
- `build-site.sh` `pages=` gains `shelf docs`; routes, metadata and a social card for each page.
- `ProductDemo` draws an "event" line as a chip, a document message (`WaDoc`), the A4 paper or a document's page in its panel; a row can wrap (`wrap`) instead of being cut with "…". Drawn messages keep their line breaks.

## Stage 2 · ALYR Shelf

- `copyShelf.ts` (both languages, typed), `ShelfPage.tsx`.
- Signature FIG 01, "The last one" (`LastOne.tsx`, `moment.css`): Aisha's phone, the Stock screen, Mariam's phone on one rule with crosses. Timeline exactly 03's, every delay a number of `--stagger` steps: arrivals 0 to 600 ms, both bars pressed at 600, "Placing your order…" at 720, the Sold row wipes in at 960, 1 leaves along 45° at 1200 and 0 arrives at 1320, the Volt tick at 1560, Aisha's "Order #1452 received" at 1680, Mariam's row greys and her notice rises at 1800, all done by 2.3 s. No JavaScript of its own.
- `CatalogScreen` and `StockLog` (`Sheets.tsx`), `OrderRow`, `OrderPageScreen`, `OrderPhone`, `PhotoTile` (`PageDrawings.tsx`), which revive the orphaned `.d-row`, `.d-add`, `.d-stepper` styles. The photo slot is the product's own blank tile with its image glyph: no stock or generated food.
- FIG 03 the order page, greyed and left out, on two phones.

## Stage 3 · ALYR Docs

- `copyDocs.ts`, `paperData.ts` (RC-0042 and the paper's labels, shared by both languages and small enough for the demo's client bundle), `DocsPage.tsx`.
- `Paper.tsx` and `paper.css`: the A4 and the 80 mm roll as live HTML, the engine's layout element by element (shop at the inline start, «إيصال» / Receipt opposite, a 2 px rule, label pairs, Arabic headings over English, the totals band, notes, the foot with the document code, «صفحة 1 من 1» and «صدر عبر ALYR»). Type on the A4 scales with the sheet (container units). The paper is `dir="rtl"` on both pages. The plate is cut at 45°, with crosses and mono dimension lines; the series rail ends on a dashed "next" slot with the pending dot.
- Signature FIG 01, "A payment becomes paper" (`PaymentPaper.tsx`): Record a payment (a Carbon button, never Volt), the result, the paper wiping along the fold's diagonal from the top inline-end (a registered `--wipe` length on a polygon, mirrored), its contents rising in reading order with each Arabic line 60 ms before its English twin, the PDF bubble under Aisha's own message nine minutes earlier, and one Volt tick, "Sent · WhatsApp", at 2.64 s. On phones the roll replaces the A4.
- `DocumentsScreen` (`Sheets.tsx`), `DocLinkScreen` and `DocLinkPhone` (`PageDrawings.tsx`), the `.wa-doc` bubble (`site.css`, on the `--wa-*` tokens, the page glyph from the icon grid; no WhatsApp logo).
- FIG 03 the paper, FIG 04 a correction as the customer sees it, FIG 05 the no-CR note beside "No CR yet? Receipts, and they say so."
