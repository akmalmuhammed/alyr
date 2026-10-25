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
