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

## Stage 4 · site-wide

- Homepage: the suite rows and corners for ALYR Shelf (two order-page cards at true size, "Only 1 left today" and a greyed "Sold out") and ALYR Docs (the top of RC-0042, Arabic first); the suite body ("ALYR Agent and ALYR Shelf come with every one. Choose the rest."); the meta description; By business (Restaurants gain Shelf, Home services gain Docs and "a receipt for each payment", Shops and wholesale gain Shelf and Docs and "stock counted on every sale"); how it works step 2; the which-product answer. The fifth "Bakeries" row (02 §5.4, [F]) was not added: the section stays at four.
- Works-with rows in both directions on every product page (02 §5.5).
- Stale lines (02 §5.6): /accounts "Not yet" now says statements of account, and that invoices and receipts that say how a customer paid belong to ALYR Docs, "which we set up with you"; /agent's trust answer says the sales figures count orders, not cash taken at the counter; /bookings' deposit line; /chat's "Pay from a link" says "a message confirming payment"; /chat's staff demo says «الإيصال» (two places).
- With the offer on (Appendix A): the first-product line, the combinations, the monthly includes, the more-products answer and the Bookings and Accounts facts name the priced products only; Agent and Shelf are "included".
- Prose that named Payroll or "Early access": `voice.md` (the suite's order, the names), `arabic.md` (the descriptors, the term row), `honesty.md` (the intro, the must-not-claim rows for Docs and Shelf), `alyr-site-page` (adding a page; a signature figure in the template), `alyr-print` (receipts and invoices are built, in ALYR Docs), `alyr-deck-and-social`, `docs/brand.md`. The skills were wrong for this work in those places; fixed here.
- `D-046` records the founder's 20 Oct decisions (open pull requests hold D-043 to D-045).

## Stage 5 · polish and checks (built site)

Fixed after looking at every section of both pages, both languages and themes, 1440, 390 and 320 (captures in `shots/b1` to `b6` on the dev server, `shots/final` on the built site):
- The signature figures stopped playing when read after 4 s: the head script's failsafe removes `motion`. `SiteMotion` now clears it on a page with a `[data-sig]` figure once it has hydrated (the observer that plays it is then running). Measured with no screenshots after a 9 s wait: it still plays.
- Bidi: the English twins on the paper read in their own direction (the date, "No.", the notes); a code with its quantity in the site's Arabic sentences is one isolate; the link line under an Arabic caption is isolated; customer messages carry no right-to-left mark.
- Words: "From now on" and the chat's "Today" chip left the Docs page (founder: no "today", "now"); the Arabic headline keeps «كل بيع» together; "1 kg" and "2 kg" never break.
- Layout: the demo's paper had no width (a container in a centred grid); the order-page phones sit side by side; four "What's in it" groups in four columns; FIG 03's A4 shows its top on phones while the roll is read at true size; 320 px: a 3 px overflow on /shelf, the stock pill on one line, taller phone crops; a status chip lost the space before "CN-0003" (text in a flex box).
- Last pass: the figure's grid tracks no longer grow with a phone's content (a 14 to 19 px overflow at 320 once the count pill stopped wrapping); the pill may take two lines there; Arabic Latin runs with digits ("A4") stay whole (`Text.tsx`); "108 x2" and "131 x0.5" never break in English prose.
- Left as it is: on phones the figure plays as one, so Mariam's phone has finished by the time it is scrolled to (03 asks for the same timings at 390); the Documents screen's marks 1 to 3 sit on column heads that the phone layout hides, as on /bookings; the drawn WhatsApp header cuts a long shop name with "…" at 320 (Latin, every product page, existing).

### Checks, on the built site (`scripts/build-site.sh`, served with gzip on port 3118)

- `pnpm lint` clean; `pnpm exec tsc --noEmit` clean; `node scripts/design-check.mjs` 413 files clean; `tokens-build.mjs --check` up to date; `build-site.sh` 154 files, `out-site/shelf.html`, `docs.html`, `ar/shelf.html`, `ar/docs.html` and both social cards present; `sitemap.xml` lists all fourteen addresses.
- **axe-core 4.14** (scrolled through, content-visibility forced visible): /shelf, /ar/shelf, /docs, /ar/docs at 1440 and 390, light and dark (16 runs); /, /chat, /bookings, /agent, /accounts at 1440 light; /ar and the four Arabic product pages at 390 dark; after the last fixes /shelf, /ar/docs and / again in all four. **No violations of any impact.**
- **Lighthouse 12, mobile** (simulated throttling, Edge), two runs each, lower shown: /shelf 98 · 100 · 100 · 100, LCP 2.4 s, CLS 0, TBT 10 ms; /docs 98 · 100 · 100 · 100, LCP 2.4 s, CLS 0, TBT 10 ms; / 98 · 100 · 100 · 100, LCP 2.4 s, CLS 0, TBT 10 ms; /ar/shelf and /ar/docs the same (LCP 2.3 to 2.4 s). The LCP is the hero lead, waiting for the web fonts, as on the other pages.
- **320 px** (`scrollWidth`, both languages, all seven pages): 320 everywhere. No Arabic line ends in "…" on the new pages.
- **Motion**, measured with no screenshots: Shelf's parts arrive at 0, 60 and 120 ms (done by 600), "Placing your order…" at 720 to 840, the 0 at 1.6 s, Aisha's result by 1.83 s, Mariam's notice by 2.08 s; Docs' result by 0.87 s, the paper's first rule by 1.41 s, the bubble by 2.32 s, "Sent" by 2.79 s. Both plays once and still play after a 9 s wait. Reduced motion and no scripts: both figures complete (captured).
- Captures (not committed): `shots/final/` (both pages, both languages, light and dark, 1440, 390 and 320, in parts; each figure mid-run, finished in dark, reduced motion, no scripts, 390 mid-run), `shots/final2/`, the menus and the homepage in `shots/b5/`, every demo tab in `shots/b6/`.

## For the product lane (not changed here)

1. `catalogCopy.ts` `actors` prints "Assistant" / «المساعد» on stock log rows (no-AI list); `items/wa_text.py` has first-person replies ("I will send you the payment link", «لم أستطع التراجع»).
2. The chat writes Arabic prices as "QAR 26" (`fmt_qar`); the drawings write «26 ر.ق».
3. `render/sample.py` names its customer with a retired family name and prints a 5555 phone and a made-up CR; these samples also go to Meta with the document templates.
4. The real order page tints "Sold out" with `--bad`; the site does not.
5. `ProductDemo` prints Arabic clock times in Eastern digits (all product pages, existing).

## Open for the founder

1. **Publishing**, after review and merge: the go-ahead, for both pages together (00).
2. **Arabic review** (ALY-66): all of both pages' Arabic and every changed shared line. Least sure: «أرقام متتالية بلا فجوات», «ومع كل بيع، ينقص المخزون تلقائياً», «ما على الرف» in the Shelf screen heading (02 offers «ما لديك الآن، وكل تغيير عليه.»), «أرقامَ من يحمل», the order section's «باهتاً … أو محذوفاً», and the product's own «يمكنك أيضاً فتحه» on an invoice.
3. **Names**: Qirfa Bakery's manual check (Instagram, Maps, the trademark register) is still open; the Bin Mahmoud address and the Lusail branch are invented details of it.
4. **[F] lines kept as 02 wrote them**: the routes `/shelf` and `/docs`; the Docs "Not yet" line "Tax on documents, and any government e-invoicing system" (cut it if the page should say nothing of tax); "Import from a spreadsheet (Excel or CSV)" as the brief allows, though a real Excel file has not been imported yet.
5. **Not built from 02's options**: the fifth "Bakeries" row in By business; "Does it use my WhatsApp catalog?" in the Shelf questions (02: only if owners ask it).
6. With the offer on: whether ALYR Docs can be a first product at QAR 449 (the page says nothing of its price).

## What was not checked

- Real phones, Safari and Firefox: every capture is headless Edge.
- Screen readers by ear; only axe and the accessibility tree.
- The Arabic by a native speaker.
- The offer switch on (`NEXT_PUBLIC_ALYR_OFFER=on`): its lines were rewritten and type-checked, not built or looked at.
- The WhatsApp and "opens soon" contact states.
- axe on /chat, /bookings, /agent and /accounts in dark at 1440 and light at 390 (each was run in one of the two).
- Widths between 390 and 1440 other than 1024 (the menu) and the 75 rem layouts by reading the CSS.
- Lighthouse on desktop.
- The engine's real PDF was not rendered for this page (the paper follows `review/viz/engine`, rendered by the design lead on 20 Oct).
