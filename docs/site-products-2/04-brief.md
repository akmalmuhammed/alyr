# ALYR Shelf and ALYR Docs pages: build brief

21 Oct 2026. The creative director's brief for the site builder.

**Order of authority:**
1. `00-founder-decisions.md`
2. this brief
3. `01-truth.md` (truth and must-not-claim)
4. `02-messaging.md` (the words)
5. `03-visuals.md` (the drawings and motion)
6. the skills: `alyr-design`, `alyr-site-page`, `alyr-design-review`

## Build

1. **`/shelf`, `/ar/shelf`, `/docs` and `/ar/docs`.** Use the product page template (`ProductKit`, the product bar, the tabbed demo, `FlowDiagram`, "everything it does", "works with", questions, closing call), with 02's words and 03's drawings.
   - Use the recommended hero options unless a critic finds a problem.
   - Build each page's signature figure exactly as 03 specifies. It plays once, with no new JavaScript where 03 says so. With reduced motion or no scripts, it shows the finished state.
2. **The new drawings 03 names:**
   - Shelf: `CatalogScreen` and `StockLog` in `Sheets.tsx`, and `OrderPageScreen` in `PageDrawings.tsx`.
   - Docs: `DocumentsScreen` in `Sheets.tsx`, `DocLinkScreen` in `PageDrawings.tsx`, `PaperA4` and `PaperRoll` in `Paper.tsx`, and `.wa-doc` for the PDF message bubble.
   - Add the `--doc-*` colour tokens to `design/tokens.json` in both themes, and regenerate. The drift check must pass.
   - Draw the paper from the product's real wording (01). Where a real engine render helps you check the layout, render it with `uv run python -m alyr.document_samples` in Docker. The site still draws its own HTML, so it stays light and stays in both themes.
3. **Site-wide changes from 02 §3:**
   - `PRODUCTS` drops `payroll` and adds `shelf` and `docs`. Use the order Chat, Bookings, Agent, Shelf, Accounts, Docs, unless 02 argues for another.
   - Update the Products menu (desktop and phone), the footer, the homepage suite section, the "works with" rows on every product page (both directions), the homepage meta and FAQ, the /accounts "Not yet" lines and the /chat «الإيصال» fix.
   - "Early access" becomes "Set up for you" / «نجهّزه لك» everywhere; Agent and Shelf say "With every product".
   - Reword the offer-on lines as 02's appendix says. The offer switch stays off.
   - Widen the types, remove the hard-coded `payroll` checks, and add routes, `PATHS`, `build-site.sh` `pages=`, social cards and the sitemap, following the `alyr-site-page` checklist.
4. **Honesty:**
   - Docs never says "today", "now", "live", "turn it on" or "coming".
   - No "tax invoice", no e-invoicing, no retention period, no named POS.
   - Never imply WhatsApp delivery at any time, or live card payments.
   - The no-CR rule says receipts first, and invoices once registered.
   - Shelf says nothing of Meta catalog sync, barcodes or expiry, or where photos are stored.
   - No AI words.
   - One fictional business per figure set, Qirfa Bakery wherever it fits. Any other name gets checked and recorded in `honesty.md`'s register, or is flagged for the founder.

## Verification

Follow `alyr-design`'s `verify.md` matrix for the four new pages and every page whose shared parts changed (`/`, `/chat`, `/bookings`, `/agent`, `/accounts`):
- both languages, light and dark, at 1440, 390 and 320;
- reduced motion and no scripts;
- the Products menu open, desktop and phone;
- each signature figure captured mid-run and finished;
- axe with zero serious or critical issues;
- Lighthouse mobile on `/shelf`, `/docs` and `/`: LCP under 2.5 s, Performance 90 or above, CLS under 0.05;
- `pnpm lint`, `pnpm exec tsc --noEmit` in a clean state, `pnpm build`, `bash scripts/build-site.sh` and the token drift check.

## Workflow

- Worktree `D:\alyr-home`, branch `aly-shelf-documents-pages`, cut from main. Merge `origin/main` before you start and again before the PR. Confirm the branch before every commit.
- Never touch other worktrees. Never use port 3100. Don't read `.env` files.
- Commit after each stage (plumbing and labels, Shelf, Docs, site-wide, polish) and log each in `05-build-log.md`.
- Screenshots go to `shots/`, not committed. Use the profile `C:\t\shelfprof`.
- Push and open a PR. Don't merge or deploy.

## Rulings on the copywriter's open points (21 Oct)

- **Heroes.** Use 02's recommended heroes. Shelf: "Everything you sell, on one shelf. / Every sale counts the stock down." Docs: "Payment in, receipt out. / Every number in order. Every paper final." Descriptors: «الأصناف والمخزون» and «الإيصالات والفواتير».
- **Docs "sends it to your customer".** Always name the channel and its condition. The sentence gives the PDF in the WhatsApp chat while the customer's conversation is open, or by email or a link. Say it once in plain words, in a question or a fact. Never write "sent on WhatsApp" without the condition.
- **Shelf "included".** Say "With every product" / «مع كل منتج». Never "free" or "at no cost": D-039 allows a usage charge later.
- **Shelf import.** "Import from a spreadsheet (Excel or CSV), with a preview of every row before anything is saved" is built and may be said. Make no claim about other tools' formats.
