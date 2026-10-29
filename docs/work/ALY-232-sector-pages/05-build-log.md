# Build log: sector pages and owner guides (ALY-232, ALY-233)

Worktree `D:\alyr-sector`, branch `aly-232-sector-pages` from main 5be053b. Built out-site
served on port 3141 (`pnpm site:serve --port=3141`). Edge profile `C:\t\sectorprof`.

## Stage 1: the build (commit 14e056a)

**Done.**
- `site.ts`: `SECTORS`, `GUIDES`, their keys in `PATHS` (`for-bakeries`, `guides`,
  `guide-stop-losing-whatsapp-orders`, ...), `sectorPage()`, `guidePage()`, `pageKind()`.
- Words in `copySectors.ts` and `copyGuides.ts`, imported by `copy.ts` as `sectors` and
  `guides`, with their meta under the page keys, so copy parity and the banned-word check read
  them. English and Arabic.
- Pages: `SectorPage.tsx` (breadcrumb, H1 as the owner's question, the answer, "Book a
  check-up" with the trade's own message, the product tags; your day today; the same
  afternoon (the homepage's day split, `DaySplit.tsx`); what we set up, product by product;
  the guide; questions) and `GuidePage.tsx` (the guide as an article: byline with a `<time>`,
  "In short", steps, "With ALYR" last, the trades it serves; the index). `pages.css`, tokens
  only.
- Routes: `/for/[sector]`, `/guides`, `/guides/[guide]` and the `/ar` pages,
  `generateStaticParams` with `dynamicParams = false`; a social card per English page.
- Structured data: WebPage + BreadcrumbList + FAQPage for a sector; Article (author the
  organisation "ALYR team", `datePublished`/`dateModified` in Doha time) + BreadcrumbList for a
  guide; CollectionPage for the index. No image on the Article: the card's address carries a
  build hash that the JSON-LD cannot know; Google lists `image` as recommended, not required.
- Sitemap: `x-default` added beside `en` and `ar` (every page; the pages' own `<link>`s
  already had it).
- Footer: a row of the six trades and Guides. Homepage: each business panel that has a
  sector page links to it ("See the page for bakeries").
- `build-site.sh` reads its list of pages from `PATHS` (`scripts/site/pages.mjs`), so a page
  added there is published with its card. `llms.mjs` writes a copy for every sector page and
  guide, and llms.txt lists them.
- `pages.test.mjs`: the H1 is a statement, the answer is under 80 words, each guide's "In
  short" is 100 words or fewer and starts within the first 20, dates in Doha time, the
  structured data has no price, offer, rating or person.
- The `.tag` styles moved from `home.css` to `kit.css` (shared now); the homepage is unchanged.

**Decisions while building.**
- The opening is on the canvas, not Carbon: a sector page is an audience page, and the first
  thing on it is an answer to read, not a product demo.
- The figure reuses the homepage's rows (same customers, same order numbers): one drawing of
  one afternoon per trade across the site. Groceries had no tab, so it has its own rows with
  no business names.
- No `/for` index page: the homepage's "By business" is that index, and each breadcrumb
  points there.
- The guide's excerpt is not repeated on the sector page (content audit rule 12, say it once):
  the title and "Read the guide" only.
- The banned-word check caught "coming", "reads", "soon" and «يعرف» in ordinary sentences;
  reworded rather than allow-listed. The test caught one "In short" at 105 words.

**Checks.** `tsc --noEmit` clean, `pnpm lint` clean, `pnpm test` 83 pass, `pnpm site:check`
all four pass (build, parity, banned words, 2,838 links).

**Next.** The two critics (06, 07), rulings (08), fix pass.

## Stage 2: critics and rulings (06, 07, 08)

Two critics ran in parallel on the built out-site (port 3141), neither reading the other.
Design (06): no P0, six P1, ten P2. Copy, claims and Arabic (07): one P0, six P1, 29 P2.
The creative director's rulings are in `08-rulings.md`.

## Stage 3: fix pass (commit 8c5785a)

**Applied.**
- Copy P0-1: the grocery sample's "Promise recorded · Pays Thursday" (a promise to a named day,
  which is not built) is now a credit sale recorded with the new balance sent.
- Copy P1: fashion says "show customers what is still available" (not "answer every message");
  its Agent row names what the Agent screen shows (best sellers, sold out or low now), not the
  Sunday report's "what did not sell"; the no-shows guide's "With ALYR" claims the
  confirmation, the reminder and the count only; the salon and home services closing calls say
  "a chat on your own phone"; the Arabic home services H1; «في الوقت نفسه» for one booking at a
  time.
- Copy P2: all but those ruled otherwise (P2-1 changed to "The same hour", P2-19 to "how it
  would work for your bakery, on your own phone", P2-20 to a static alt from the copy).
- Design: the answer beside the question on the grid and the drawing right under the opening
  (at 1440 × 900 the question, the answer, the Volt button and the top of the drawing are in
  the first screen; at 1280 × 720 the button is at about 560 px); the figure opens as a plate
  with its lead naming the buttons; the guide in the Questions section's start column
  (`QuestionsBlock` `aside`); end columns from column 5; the H1 on the display-sm step; the
  problem marks a hairline dash, not the pending dot; "+ Agent" kept whole in one `<bdi>`;
  guides on the grid's start, "In short" as a rule, steps in `--text`; the index's date under
  each title; 44 px crumbs and footer links; tokens for type, leading, tracking and rules.
- Shared, on purpose: the day split's phone height 23 → 24.5 rem (its buttons no longer cover
  the fifth row; the homepage too) and its ALYR side on `--dark-surface` (in dark it now stands
  apart from the faded side; in light the change is one step and hard to see).
- Footer: "For your business" shown as the row's label, short trade names, the current page
  underlined, Guides beside Questions. Homepage: the link to the trade's page sits in the
  panel's foot row, before the outlined button; Arabic with a verb.
- Docs: D-057 (addresses, proposed), `docs/brand.md`, `docs/status.md`, the lane brief,
  `alyr-site-page` ("Sector pages and owner guides", and step 6 of "Adding a product page" now
  says the build reads `PATHS`), `components.md` (the footer).

**Not applied, and why.**
- Design P1-5 (a Groceries tab on the homepage): a homepage change, for the founder.
- Design P2-6 (the fold's rest point): the homepage's tuned value; a sample's reference is
  cut by the fold at rest on a laptop, as on the homepage.
- Copy P2-20 per-page alt: `generateImageMetadata` would move the cards' addresses; the alt
  is a static line from the copy instead. Arabic pages keep the homepage's English card.
- The Meta template condition on reminders and entry notices (07, "conditions said
  elsewhere"): a site-wide question, for the founder.

**Checks (25 Oct 2026, the built out-site on port 3141).**
- `pnpm exec tsc --noEmit` clean; `pnpm lint` clean; `pnpm test` 83 pass.
- `pnpm site:check`: build, EN/AR parity (7,050 strings), banned words and prices (clean),
  internal links (2,826) all pass. The banned-word check caught "as soon as" ("soon") once more;
  reworded.
- axe (`pnpm site:a11y`): no serious or critical issue on `/`, `/ar` and all 20 new pages, at
  1440 and 390, light and dark.
- Lighthouse mobile, lowest of 2: `/` 94 (LCP 2.42 s), `/for/bakeries` 98 (2.41 s),
  `/ar/for/bakeries` 98 (2.41 s), `/guides/stop-losing-whatsapp-orders` 99 (2.26 s);
  Accessibility 100 and CLS 0 on all four.
- 320 px: `scrollWidth` 320 on all 20 new pages and on `/` and `/ar`.
- Looked at: the openings at 1440 (EN, AR), 1280 and 390 dark; the figure at 390 dark; the
  homepage's business panel at 1440 (EN) and 390 (AR).

**Not checked.** Without scripts (the capture script cannot turn them off: the figure then
rests at 42 % on a phone too, as on the homepage); a real keyboard walk; a screen reader; Safari
and a real iPhone; the Products menu open on the new pages; the Arabic by a native speaker.

## Stage 4: main merged, the founder's go-ahead (28 to 29 Oct 2026)

**Main merged twice** (PR #139 was out of date): the company page and privacy policy
(`/company`, `/privacy`), the footer naming alyr software W.L.L. (CR 255539), the pace and
motion always on (D-058, D-059), the hero film (D-062), PostHog (D-070). Kept their work:
`PATHS` lists the plain pages first, then the sectors and guides; `build-site.sh` keeps
main's `plain="company privacy"` and lists every other page from `PATHS`
(`scripts/site/pages.mjs company privacy`); `structuredData.ts` keeps main's WebPage for the
plain pages as a `plain` kind of `pageKind()`; `llms.mjs` keeps the company and privacy copies;
the footer's site row is Questions, Guides, then the company's pages. Main's day-split changes
(the pace tokens) merged with this branch's two.

**The founder's decisions** (`00-founder-decisions.md`): D-057 accepted; the guides dated
28 Oct 2026; the Arabic published as a draft; a Groceries tab.

**The Groceries tab.** A new `home.business.rows` entry (`groceries`, after Bakeries, a
`basket` line icon), its afternoon the rows the groceries page drew before (no business
names; staff Rafi and Joseph), so `/for/groceries` now reads `row: "groceries"`. One quick
critic (`09-critique-groceries-tab.md`): no P0; P1-1 (a line repeated from the groceries page)
and P2-1 to P2-7 applied (the split's label is "The same hour" everywhere now; the basket's
handle flat-topped like the crate). Not applied: the tab row's scroll on a deep link, which
predates this change.

**Checks (29 Oct 2026).** `tsc --noEmit` clean; `pnpm lint` clean; `pnpm test` 83 pass;
`pnpm site:check` all five pass (build, EN/AR parity 7,686 strings, banned words, 3,294 links,
the pace); axe: no serious or critical issue on `/`, `/ar` and all 20 new pages.
Lighthouse mobile, lowest of 3: `/` 80 (LCP 3.16 s), `/for/groceries` 95 (2.86 s), `/guides`
96 (2.71 s), Accessibility 100 and CLS 0. Below the LCP budget, but **main is the same**:
`origin/main` built in a throwaway worktree on the same laptop gave `/` 83 (3.29 s) and `/chat`
95 (2.86 s). The new pages match main's product pages; the homepage's drop came with main
(the hero film, the consent prompt), not with this branch. For the site lane to look at
separately.

