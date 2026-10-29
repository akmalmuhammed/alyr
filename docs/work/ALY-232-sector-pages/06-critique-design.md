# Design critique: sector pages and owner guides (ALY-232, ALY-233)

Independent design critic, 25 Oct 2026, on branch `aly-232-sector-pages` at 14e056a, against
the built `out-site` served on port 3141 (not rebuilt). Read: `alyr-design` (SKILL, components,
motion, verify), `alyr-site-page`, `docs/brand.md`, this folder's 00, 01, 04 and 05, and the
code (`SectorPage.tsx`, `GuidePage.tsx`, `DaySplit.tsx`, `FoldSplit.tsx`, `room.css`,
`pages.css`, `Shell.tsx`, `HomePage.tsx`). Screenshots are in `C:\t\designcritic-shots\`
(not in the repo); every file named below is there. Files starting `proto` are the live page
with the proposed CSS injected through `--eval`, not a build.

## Verdict

The pages are honest, clean and correct in the mechanics: no overflow at 320 in either
language, one Volt button in every view I checked, headings in order, the cut corners and arrows
mirrored in Arabic, and guides that read like real help. The weakness is the composition. The
opening uses seven of twelve columns and leaves the end half of the first screen empty, the one
drawing sits two sections down behind a lead written in CSS words ("start side", "end side"),
and from there the page is five equal 96 px bands of one shape, so it reads as a long form, not a
working drawing. Fix the opening and the figure (P1 1 to 4) and these become good pages; the rest
is polish.

## P0

None. Nothing is broken, untrue or inaccessible enough to stop the build.

## P1

**P1-1. The first screen answers in words but shows nothing, and half of it is empty.**
- Where: every sector page, opening (`.sp-open`), 1440 and 1024, EN and AR, both themes.
- What: H1 (max 22ch) and answer (max 44rem) sit in the start 7 columns; the end 5 columns of
  the first screen are blank canvas (`bak-en-1440-light.png`, `salons-en-1440-light.png`,
  `bak-ar-1440-light.png`, `rest-en-1024-dark.png`). The only evidence on the page, the day
  split, starts about 1,250 px down at 1440, after "Your day today". The brief's question (is
  the light opening right?) is answered yes, it is: an audience page should read differently from
  the Carbon product openings, and the answer is text to read. But a light opening needs the
  drawing close behind it, and the figure's Carbon half then gives the page its command moment
  without a Carbon hero.
- Fix (structure): move the figure section directly under the opening (in `SectorPage.tsx`,
  render `#afternoon` before `#today`), and lay the opening out on the grid, H1 on the start
  side, the answer on the end side at the H1's last baseline, the action row under both:
  ```css
  .sp-open { padding-block: calc(var(--sec) * .6) var(--space-6); }
  .sp-open-in { grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--col-gap); align-items: end; }
  .sp-open-in > * { grid-column: 1 / -1; }
  .sp-open-in > .sp-title { grid-column: 1 / span 7; max-width: none; }
  .sp-open-in > .sp-answer { grid-column: 8 / -1; font-size: var(--fs-body); }
  @media (max-width: 61.99rem) { .sp-open-in > .sp-title, .sp-open-in > .sp-answer { grid-column: 1 / -1; } }
  ```
  With that, at 1440 × 900 the question, the answer, the Volt button and the top of the drawing
  are all in the first screen, in both languages (`proto-bak-en-1440-opening.png`,
  `proto-bak-ar-1440-opening.png`). Then give the figure section a plate opening (heading and
  lead inside the figure's top bar, or the heading only, no end-column lead) so it does not
  repeat the opening's split shape.

**P1-2. The figure's lead is written in CSS words, and on phones it describes controls that are not there.**
- Where: every sector page, "The same afternoon" lead (`sectors.figure.body`), all widths, EN
  and AR («في جهة البداية … وفي الجهة الأخرى …»).
- What: "On the start side, the chats as they pile up today. On the end side, the same
  customers as ALYR keeps them. Drag the fold, or use the two buttons." An owner does not know
  what the "start side" is. On a phone the handle is hidden (`room.css`, under 47.99rem), only
  the "With ALYR" side shows, and there is nothing to drag (`bak-en-390-dark-fig.png`,
  `bak-ar-390-light-fig.png`). This is the figure's only explanation outside the homepage tabs,
  where the tab and panel around it did that work.
- Fix (copy, both languages, no side words): EN "Your chats this afternoon as they pile up, and
  the same customers as ALYR keeps them. Move the fold, or press Today and With ALYR." AR
  written to match, naming «اليوم» and «مع ALYR» as the buttons say them.

**P1-3. On phones the Today and With ALYR buttons cover the last row of the drawing.**
- Where: every sector page's figure (and the homepage's, the same component), 390 and 320, EN
  and AR, both themes.
- What: the two `.split-go` buttons are absolutely placed inside `.split-view` at the bottom and
  sit on top of the fifth row: "Maryam, Asked about sugar-free" and its "Aisha is answering"
  status are half hidden (`bak-en-390-dark-fig.png`, `bak-ar-390-light-fig.png`,
  `home-en-390-split.png`). On the sector page this is the page's one picture, and the covered
  row is the one that shows a person answering.
- Fix (structure): take the buttons out of the drawing. In `FoldSplit.tsx`, move the two
  buttons from inside `.split-view` into a sibling `<div className="split-bar">` after it, and:
  ```css
  .split-bar { display: flex; justify-content: space-between; gap: var(--space-2); margin-top: var(--space-2); }
  .split-go { position: static; }
  ```
  (delete `bottom` and the `inset-inline-*` on `.split-go-before` / `.split-go-after`). The
  drawing then shows all five rows at every width, and the buttons stop covering the paper side
  on a laptop too. Re-check the homepage panels in the same pass.

**P1-4. In dark mode the two halves of the drawing read as one surface.**
- Where: every sector page's figure (and the homepage's), 1440 and 390, dark, EN and AR.
- What: the paper side is `--wa-paper` dimmed by `brightness(calc(1 - var(--night) * .3))`, which
  at night lands within a step of `--band`. The before and after, the whole point of the figure,
  collapse to the Volt fold line (`bak-en-1440-dark-afternoon.png`,
  `bak-ar-1440-dark-afternoon.png`; compare `bak-en-1440-light-afternoon.png`). This is
  `alyr-design` §11 rule 7.
- Fix: stop dimming the paper at night (remove the `brightness()` term from `.split-before`'s
  `filter`, keep `saturate`), so `--wa-paper`'s own dark value carries the "faded" side, then
  measure the two surfaces. If they are still within one ramp step, give the ALYR side the
  panel token instead of the band: `.split-after { background: var(--dark-surface); }` (both
  themes from the token, no dark rule of its own). Measure in both themes before and after.

**P1-5. Groceries has no place in the index the breadcrumb sends it to.**
- Where: `/for/groceries` and `/ar/for/groceries`, breadcrumb "By business"; homepage
  `#business`.
- What: the brief has no `/for` index because "the homepage's By business is that index". It is
  not: its tabs are bakery, wholesale, fashion, restaurant, salon, home services and something
  else. Groceries is missing (it has its own rows in `copySectors.ts`), and wholesale has a tab
  but no page. A grocer who climbs the breadcrumb lands on a list without his trade
  (`groceries-en-1440-light-full.png`, `home-en-1440-business.png`).
- Fix (one of two, for the rulings): add a "Groceries and baqalas" tab to `BusinessTabs` from
  the groceries `day` rows that already exist, with its "See the page for groceries" link; or
  point the groceries breadcrumb's middle step at the footer's trades row and accept the gap.
  The first is right; it is a homepage change, so it needs the founder's yes.

**P1-6. `pages.css` says "Tokens only" and is not.**
- Where: `apps/web/app/_site/pages.css`, every new page.
- What: literal sizes, line heights, tracking and rule widths: `.sp-answer` `clamp(1.125rem,
  1.02rem + .45vw, 1.375rem)`; `.sp-guide-title` `line-height: 1.25`; `.gd-short p`
  `clamp(...)`; `.gd-h2` `clamp(1.5rem, 1.25rem + .9vw, 2rem)`, `line-height: 1.15`,
  `letter-spacing: -.02em`; `.gd-steps h3` `1.125rem`, `1.35`; `.gd-row-title` `clamp(...)`,
  `1.2`; `.gd-short` `3px` and an inset `box-shadow` as a border; `.gd-alyr` and
  `.gd-rows > li:first-child` `2px`; `.sp-mark` `.5625rem`, `.55em`, `1.5px`. Principle 7.
- Fix, token for token: `.sp-answer { font-size: var(--h3); }` (its max is already 1.375rem,
  which is `--h3`) with `var(--fs-body)` under 53rem; `.gd-h2` and `.gd-row-title`
  `font-size: var(--h3); line-height: var(--leading-heading); letter-spacing: var(--tracking-heading);`;
  `.gd-steps h3` `font-size: var(--fs-body); line-height: var(--leading-ui);`;
  `.sp-guide-title` `line-height: var(--leading-heading)`; every `2px` rule
  `var(--rule-strong)`, every `1px` `var(--rule-hairline)`; `.gd-short` as below (P2-7). Arabic
  keeps its `--leading-arabic-*` overrides.

## P2

**P2-1. One rhythm for five sections, two pairs of neighbours with the same opening, and a 281 px band for one link.**
- Where: sector pages, 1440, EN and AR (`bak-en-1440-light-full.png`,
  `salons-en-1440-light-guideq.png`).
- What: every section is `--sec` top and bottom with a hairline, whatever it holds. "Your day
  today" and "The same afternoon" are both split openings, side by side; so are the guide and
  Questions. The guide section is 281 px tall for a label, a title and a link, while the
  Questions heading column beside the next section is empty below its heading. The guide section
  is too thin to stand alone.
- Fix: put the guide into the Questions section's start column, under the "Questions" heading
  (`.faq-head`, which already stretches), as the "Owner guide" label, the title link and "Read
  the guide": give `QuestionsBlock` an optional `aside` slot rendered after `.head` and delete
  `#guide`. With P1-1 the order becomes opening, figure (plate opening), your day today (split),
  what we set up (full), questions with the guide (split): no two neighbours alike, one section
  fewer.

**P2-2. The end columns do not line up from section to section.**
- Where: sector pages, 1440. "Your day today" and the guide start at column 6 (x 623), the
  Questions list at column 5 (x 515), the figure's lead at column 8 (x 840).
- Fix: `.sp-split > :last-child { grid-column: 5 / -1; }` to match `.faq-list`, and
  `.sp-fig-head .lead { grid-column: 8 / -1; }` stays only if the figure keeps a split head
  (P1-1 removes it).

**P2-3. The H1 and every H2 are the same size.**
- Where: sector pages, all widths: `.sp-title` and `.h2` both compute to 52 px at 1440 and 32 px
  at 390. "What we set up for a home services company" is as large as the page's question
  (`hs-en-1440-products.png`).
- Fix (option for the rulings; tokens only): at the `desktop` breakpoint set
  `.sp-title { font-size: var(--display); max-width: 19ch; }` with the answer below and the
  action row on the end column (`proto2-bak-en-1440-display.png`). It reads with authority, but
  at 1280 × 720 the button lands at 722 px, just under the fold
  (`proto2-hs-en-1280-display.png`). If that is unacceptable, keep the P1-1 layout and accept a
  flat scale on answer-first pages.

**P2-4. "Your day today" uses the pending dot's shape for a problem.**
- Where: sector pages, "Your day today", all widths (`.sp-mark`, copied from the homepage's
  `.biz-mark`).
- What: a 9 px hollow ring with a 1.5 px border is the brand's "not available yet" mark
  (`.dot-pending`). Beside a pain point it says "coming".
- Fix: a short hairline dash: `.sp-mark { width: var(--space-3); height: 0; margin-block-start: .75em; border: 0; border-top: var(--rule-hairline) solid var(--line-strong); border-radius: 0; }`
  (and the same for `.biz-mark` when the homepage is next touched).

**P2-5. The "+" on Agent and Shelf tags loses its space, and reads as a suffix in Arabic.**
- Where: sector openings and homepage panels, all widths; EN "+Agent", AR "Shelf+"
  (`bakeries-en-390-light.png`, `bakeries-ar-390-light.png`).
- What: `.tag` is `inline-flex`, so the trailing space in `<span>{"+ "}</span>` is dropped; in
  RTL the "+" goes to the right of the Latin name.
- Fix: render `+ Agent` inside one `<bdi dir="ltr">`, and space it with CSS instead of a
  character: `.tag-plus { gap: var(--space-1); }`.

**P2-6. On a laptop the drawing rests with the reference column cut by the fold.**
- Where: sector figures, 1440, EN and AR: "#1046" shows as "046", "#104" in Arabic
  (`bak-en-1440-light-afternoon.png`, `bak-ar-1440-dark-afternoon.png`).
- Fix: rest where the fold crosses between rows' content, not through a reference (try
  `REST = 0.46` in `FoldSplit.tsx`), or start `.do-row`'s reference column after the fold's
  widest reach at rest. Separately for the rulings: the Volt handle is a second Volt-filled
  control in view beside the header's Volt button on a laptop. It is the homepage's accepted
  component, so I note it, not fault it.

**P2-7. The guide is a centred blog column with a boxed callout.**
- Where: the three guides, 1440, EN and AR (`g1-en-1440-light.png`,
  `g1-en-1440-light-full.png`).
- What: the 44rem measure is centred on the page, off the 12-column grid that the header and
  footer sit on ("asymmetry over centring"). "In short" is a white card with an inset-shadow
  border and a 3 px start rule. The steps' bodies, the actual instructions, are in
  `--text-muted`.
- Fix: put the measure on the grid's start: `.gd-measure { max-width: none; } .gd-head .wrap > *, .gd-body > * { max-width: 44rem; }`;
  at the `laptop` breakpoint and up, give the end columns the "For your kind of business" links
  instead of a row at the end. "In short" as rules, not a card:
  `.gd-short { background: none; box-shadow: none; padding: var(--space-4) 0 var(--space-4) var(--space-5); border-inline-start: var(--rule-strong) solid var(--text); }`.
  `.gd-steps p { color: var(--text); }`.

**P2-8. The guides index draws two dividers 96 px apart and spends three columns on one date.**
- Where: `/guides`, `/ar/guides`, 1440 and 390 (`guides-ar-1440-dark.png`,
  `guides-en-390-dark.png`).
- What: the opening's hairline (`.sp-open` border) is followed after a full `--sec` by the list's
  2 px top rule. All three guides carry the same date in a column of their own.
- Fix: `.gd-index { border-bottom: 0; } .gd-all { padding-top: 0; }`; move the date under the
  title in the row (`.gd-row-date { grid-column: 1 / -1; grid-row: 2; }` on all widths) and let
  the title take the full row.

**P2-9. Small targets in the new links.**
- Where: crumb "ALYR" 35 × 44 (EN) and 32 × 44 (AR); footer "الأدلة" 29 × 44 and «أسئلة» 31 × 44
  at 320; the sector page's guide title link 269 × 33 in Arabic (probe at 320, both languages).
- Fix: `.crumbs a, .foot-sectors a { min-width: 2.75rem; justify-content: center; }` and
  `.sp-guide-title a { display: inline-block; padding-block: var(--space-1); }`.

**P2-10. Words noticed in passing (for the copy critic).**
- The Arabic crumb says «حسب النشاط»; the header link it points to says «حسب نشاطك». Use one.
- English booking lines use "free" for available ("a free time", "only at free times", the
  guide's "a free slot"), eight times. The founder's record bans "free" on these pages for
  price; an assistant quoting "free times" next to ALYR is a needless risk. "open times" or
  "available times" (the Arabic already says «المتاحة»).

## The footer row and the homepage link (the brief asked)

**Footer row: agree, with three changes.** Every page linking every trade and the guides is the
cheapest internal-linking the visibility plan can get, and an owner who lands on a product page
finds his trade. As built it reads as a second, lighter products row with no name, wraps to four
lines at 390 (`bak-en-390-light-footer.png`), shows the current page by colour only, and puts
Guides, a different kind of page, at the end of the trades.
- Show its name: render `t.sectors.footer` ("For your business" / «لنشاطك») as a `.mono-k`
  label at the row's start (it is already the `aria-label`).
- Short names in the footer only (a `short` per sector in `copySectors.ts`: "Bakeries",
  "Salons", "Groceries", "Restaurants", "Home services", "Fashion"); the long names stay in
  titles and crumbs.
- Current page as the products row does it:
  `.foot-sectors a[aria-current="page"] { text-decoration: underline; text-decoration-thickness: var(--rule-hairline); text-underline-offset: .25em; }`;
  move Guides to the `foot-site` row beside Questions.

**Homepage link: agree, but not where it is.** "See the page for bakeries" hangs alone under the
panel's dashed foot row, on the start side, after the panel's own contact button, with dead
space below it (`home-en-1440-business.png`, `home-ar-390-business.png`). Put it in the
`.biz-foot` row before the outlined button (`.biz-foot` already wraps), or under `.biz-name` at
the panel's top where it reads as "more about this trade". The Arabic «صفحة المخابز» has no verb
where the English has one; write it as a link, e.g. «اطّلع على صفحة المخابز».

## What holds up

- The answer is in the first lines on every page, at every width, in both languages; at 390
  the question, the answer and the Volt button fit the first screen (`bakeries-en-390-light.png`,
  `bakeries-ar-390-light.png`).
- One Volt button in view everywhere I looked: the header's is the outlined twin while the
  opening's is up and at the closing call (`salons-en-1440-light-closing.png`), and hides under
  the phone's sticky bar.
- No horizontal scroll at 320 on all six sectors, the index and the guides, EN and AR
  (`scrollWidth` 320 every time). Arabic H1 at 320 wraps cleanly with no ellipsis
  (`hs-ar-320-dark.png`).
- Headings: one h1, h2 sections, guide steps as h3, no skips (sector `1222222`, guide
  `12223332233332222`).
- RTL: crumbs, the Volt notch and its arrow, the fold and its clip, the "In short" start rule
  and the step numbers all mirror (`bak-ar-1440-light.png`, `g2-ar-390-dark.png`,
  `g3-ar-390-light-steps.png`).
- The phone menu opens complete in Arabic (`salons-ar-390-menu.png`).
- Reduced motion shows the finished figure (`bak-en-1440-reduced.png`).
- "What we set up" reuses the works rows well: one sentence per product, true, linked, with the
  limit as a pending status line where it exists (`hs-en-1440-products.png`).
- The guides are genuinely useful without ALYR, and "With ALYR" comes once, last.
- The figure reusing the homepage's rows (same customers, same order numbers) is the right call:
  one afternoon per trade across the site.

## The five changes that would lift it most

1. Opening on the grid (H1 start, answer end) with the figure moved up right under it (P1-1).
2. Figure lead rewritten without side words, and the buttons taken out of the drawing (P1-2, P1-3).
3. The dark figure given two distinct surfaces (P1-4).
4. The guide folded into the Questions section and the end columns aligned, so the page has
   four sections of different shapes instead of six alike (P2-1, P2-2).
5. A groceries tab on the homepage so the breadcrumb's index is true (P1-5), and the footer row
   named and shortened.

## Not checked

- Without scripts (the capture script cannot turn them off): the figure's no-JS state and the
  homepage panels stacked.
- Real keyboard focus: `focus()` from a probe did not trigger `:focus-visible`, so the ring is
  inferred from the global `:focus-visible` rule in `site.css`, not seen. Tab order not walked.
- axe and Lighthouse (`pnpm site:a11y`), and measured contrast ratios: dark contrast judged by
  computed colours and by eye only.
- 1280 except the one prototype; 1024 only on `/for/restaurants`.
- The Products menu open on these pages; only the phone menu.
- Motion timing of the fold's sweep and the unread count; no-snippet and the machine line in
  the HTML; social cards, `llms.txt` copies, structured data.
- The quality of the Arabic (ALY-66 is a native reviewer).
- Every page in every theme at every width: sector pages were sampled (bakeries fully; salons,
  groceries, restaurants, home services, fashion at their first screen or one section).
