# Brief: sector pages and owner guides (ALY-232, ALY-233)

## Order of authority

`CLAUDE.md` hard rules; `00-founder-decisions.md`; `docs/decisions.md`; this brief;
`alyr-design`; `alyr-site-page`; taste.

## Scope

New: six sector pages, a guides index and three guides, each in English and Arabic.
Changed, small: the footer (a row for the sectors and the guides), the homepage's business
panels (a link to their sector page), `structuredData.ts`, `site.ts` (`PATHS`, `SECTORS`,
`GUIDES`), `document.tsx` (only if needed), `sitemap.ts` (`x-default`),
`scripts/build-site.sh` (nested pages), `scripts/site/llms.mjs` (sector and guide copies).
Must look as before: every other part of the homepage and every product page.

## Addresses (D-057, proposed)

`/for/bakeries`, `/for/salons`, `/for/groceries`, `/for/restaurants`, `/for/home-services`,
`/for/fashion`; `/guides`, `/guides/stop-losing-whatsapp-orders`,
`/guides/cut-no-shows-with-reminders`, `/guides/keep-track-of-who-owes-you`; Arabic under
`/ar/...` with the same Latin slugs, as `/ar/chat` does. Why: one prefix per kind of page
keeps sector pages apart from product pages (`/chat` is a product, `/for/restaurants` an
audience) and from any future product name; "for bakeries" reads as the owner's search; Latin
slugs in Arabic keep one address per page across languages, as the site already does, and
avoid percent-encoded Arabic in shared links. No `/for` index: the homepage's "By business"
is that index, and every sector page's breadcrumb points to it.

## Sector page, top to bottom

1. **Opening** on the canvas (light; product pages open on Carbon, so an audience page reads
   differently): a breadcrumb (ALYR / By business / the sector), the H1 as the owner's
   question turned into a statement, the answer in two or three sentences (`answer`), the one
   Volt "Book a check-up" (`data-hero-cta`, the sector's own prefill), and "What we would set
   up" with the product tags.
2. **The same afternoon** (the day split, `FoldSplit` from the homepage, its rows reused;
   groceries has its own): the figure opens with the machine line, is marked "Sample" once.
3. **Your day today**: four lines in the second person (the sector's opener in the owner's
   words).
4. **What we set up for {sector}**: one row per product, suite order with Agent and Shelf
   last, one sentence each, a link to the product page. A limit, if any, as a status line
   with the pending dot (salon, home services, restaurant).
5. **Guide**: one link row to the guide for this trade.
6. **Questions** (FAQPage), four or five.
7. **Closing call** (Shell) with the sector's own title and body.

## Guide page

Breadcrumb; H1; a line with "Guide", the author "ALYR team" and the date (`<time>`); **In
short** (first 100 words, the answer); sections as h2 with steps; **With ALYR** last, built
features only, with links; the sector pages it serves; closing call. A readable measure
(about 40 rem), no figure.

## Guides index

H1, a lead, the three guides as rows: title, date, the short answer's first sentence.

## Do not

Prices, offer, free, AI words, "rule", questions outside Questions, colon reveals in labels,
a second Volt button, a carousel, new colours or tokens, a `/for` index, Gulf dialect on the
pages (MSA), invented numbers or quotes attributed to real owners, clinic or health lines,
delivery apps or competitors by name, WhatsApp logo or green on ALYR surfaces.

## Engineering

Words in `copySectors.ts` and `copyGuides.ts` (imported by `copy.ts`, so parity and the
banned-word check read them). Components hold no text. Dynamic routes with
`generateStaticParams` and `dynamicParams = false`; a social card per English page.
Logical CSS, tokens only, one new stylesheet `pages.css`. Static HTML complete without
scripts.

## Checks

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm site:check`, `pnpm site:a11y`
(axe on every page; Lighthouse on one sector page and one guide), `pnpm site:shots` for the
new pages at 1440 and 390 in both themes and languages, 320 probes, no scripts.

## Worktree

`D:\alyr-sector`, branch `aly-232-sector-pages`, a free port from `pnpm site:serve`, Edge
profile `C:\t\sectorprof`.
