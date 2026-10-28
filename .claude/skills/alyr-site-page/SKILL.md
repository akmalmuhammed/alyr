---
name: alyr-site-page
description: Build or change a public ALYR web page or anything on it. Use for the homepage (/ and /ar), the product pages (/chat, /bookings, /agent, /accounts, /shelf, /docs and their /ar pages), adding a new product page, the sector pages (/for/...) and owner guides (/guides), the header, Products menu, theme switch, product bar, footer, closing call, contact states, the offer switch, the "Sample" marks on drawings of product screens, the "works with" rows, the sitemap, metadata and social cards, and anything under apps/web/app/_site, apps/web/app/(site) or apps/web/app/(site-ar), or scripts/build-site.sh. Load alyr-design first.
---

# A public ALYR page

The public site is static HTML on Cloudflare, built from Next.js by `scripts/build-site.sh`.
Three root layouts: `(site)` English, `(site-ar)` Arabic (`lang="ar" dir="rtl"`), `(product)`
the app. Their CSS never mixes. Every word is in `apps/web/app/_site/copy.ts`. The Site and
brand lane owns these files (`docs/lanes/site-and-brand.md`).

## Before you start

1. Load `alyr-design` and read it.
2. Read `docs/brand.md` (the story and the site's extensions) and the lane brief's "Now".
3. Read the decisions behind the page: D-034 (product first, prices off until the CR),
   D-035 (the suite), D-037 (the site presents the suite), D-038 (the report card), D-039
   (nothing "coming" at go-live).
4. Check every claim you will make against `docs/status.md` and the code
   (`alyr-design/honesty.md`).
5. Work in your own worktree on a branch named after the Linear issue; never in
   `D:\alyr whatsapp`, never on port 3100.
6. For a new page or a redesign, run the full cycle in `alyr-design-review` (research, truth,
   founder decisions, brief, build, critics, rulings, fix).

## The homepage

The homepage presents ALYR as the small business's tech team (D-048, ALY-210, after D-047;
folded on 24 Oct 2026, D-048's update, ALY-223). In order (`_site/HomePage.tsx`, `home.css`,
words under `home` in `copy.ts`):

1. **Header** with the Products menu (a state only on ALYR Agent and ALYR Shelf, "With every
   product"), By business, How we work, Questions, the language link, the theme switch and
   the button "Book a check-up" (`home.final.action`; its `short`, "Check-up", below 62rem so
   the line never overflows). Every page's header, closing call and sticky bar say the same
   (`Shell` takes them from `home.final`). Price only with the offer.
2. **Hero:** no eyebrow on the page (`hero.eyebrow` is the social card's only), H1 "The tech
   team your business never had.", then one row under it: the lead on the start side, which
   carries the one line of why ("We check how your business runs, set up what it needs and
   keep improving it with you. It is the work a large company has an IT team for."), "Book a
   check-up" and "See how we work" (to `#how`), who replies, and the facts as one quiet line
   (one under the other beside the film), all on the start side; on the far side **the film**
   (D-062, the founder, 28 Oct 2026; `HeroFilm.tsx`, `alyr-design/motion.md`, "The hero
   film"): a Carbon plate cut by the fold, clear of the headline, from under the header to the
   hero's foot, with one afternoon at Qirfa Bakery in the product's own screens, three lanes
   at once, ending on the real ALYR Agent home at 16:20 (`ruleLines={false}`), which is also
   the still. One "Sample" mark in the plate's bar, Pause at its end; it stops off screen, in
   a hidden tab and with reduced motion. Its stage steps down with the screen (`--fz`); on a
   tablet it sits under the text, and on a phone under the text, full width, with the plate's
   cut corner. The hero's live Agent figure (D-058) is now `/agent`'s only.
3. **How we work** (`#how`, ALY-226, the founder's yes on the Framer prototype, 25 Oct 2026;
   `HowCards.tsx`, `how.css`): four cards, check, set up, see and improve, each a still Carbon
   canvas cut at 45° (mirrored) holding one drawn window of the product for Qirfa Bakery, then
   its title and two lines (`home.how.steps`; the scenes' words in `home.how.scenes`, the
   numbers on See and Improve from the engine's sample, the earlier values derived from them).
   One "Sample" mark, in Check's window. Four in a row from 75rem, two by two from 48rem,
   stacked below. Each scene plays as its canvas is half in view (a row staggered
   4 × `--play-stagger` apart), holds its finished state while its new words are read, fades
   and plays again, each card on its own cycle (founder, 26 Oct 2026: motion always on;
   `loops.ts`, `loopStyle.ts`); a hover, keyboard focus or press of its canvas (a `button` over
   the drawing) replays a resting card at once. One Pause control under Improve, on the line of
   "Then we check again.", stops all four. Under the row a solid line draws each time Improve
   plays: down from under Improve, along the row's foot, up the page's gutter and along 45°
   onto Check's cut, which takes one Volt line;
   "Then we check again." under it (the founder's words; no "every month"). On phones the
   line runs up the gutter from under the last card. The HTML is every finished state and the
   line is drawn; without scripts or with reduced motion nothing plays. Then a line button
   and "What we need from you".
4. **Your business** (`#business`, `BusinessTabs.tsx`): one tab per business type plus
   "Something else"; each panel has an anchor (`#bakery`, `#wholesale`, `#fashion`,
   `#restaurant`, `#salon`, `#home-services`, `#other`), the "Today" list (what a check-up
   finds, in the problems' own words: lost orders, the same questions, "Is my order ready?",
   the empty chair, regulars who owe, not knowing how the week compares), "With ALYR" row for
   row, the products it would use, and a line contact button whose message names that
   business (`ContactButton message`). Panels are server HTML: stacked without scripts, one
   cell with scripts so the page below never moves. The tabs are cards with a line icon
   (`brand.tsx`). Each panel opens on **the day split by the fold** (`FoldSplit.tsx`,
   `room.css`, ALY-209): the owner's WhatsApp chats on faded paper and the same customers as
   ALYR keeps them on Carbon (marked "Sample"), row for row (`chats` and `orders` on each
   `BusinessRow`; keep the unread counts adding up to the header's, and every status one ALYR
   really shows). A 45° fold between them is dragged, moved with the keys (a `role="slider"`
   handle) or sent across by "Today" and "With ALYR"; it sweeps once when first read. Phones
   rest on "With ALYR" and swipe.
5. **One order, start to finish** (`#see`): the `/chat` flow figure (`FlowDiagram`) told for
   Sara at Qirfa Bakery, on a cut-corner Carbon plate whose top holds the section's heading,
   lead and link (no cross rule), marked "Sample" at the end of its tab row, and the tally of
   who did what. Every step shown is built; keep the tally's counts true to the steps. The
   flow opens on a finished frame (its first story's last step) and plays from step 1 once
   60% of it is on screen; with reduced motion it stays finished.
6. **ALYR Agent** (eyebrow "ALYR Agent · With every product") with numbered callouts and the
   sample switch (its "Sample business" label is the mark), opening on the bakery. The hero
   already shows the screen's opening sentence, so this section shows it only inside "See the
   whole screen": it opens on Needs you now and the suggestions with their reasons (marks 1
   and 2), and the disclosure (a native `<details>`) opens the rest, marks 3 and 4 and their
   callouts. Show the dashboard's sentence once per page. Not pinned.

**Section openings vary** (framer-review P3, 24 Oct 2026): a split opening (heading at the
start, lead and link on the end column at its last baseline: How we work, ALYR Agent), a full
one (one heading line across the grid, its lead under it if it has one: By business, the
products), and the heading inside the figure's plate (One order). Never give two neighbouring
sections the same opening, with no exception (the founder, 25 Oct 2026, took the products off
ALYR Agent's split), and land each section's content within about 300 px of its top at 1440
(`.open-split`, `.open-full`, `.open-plate` in `home.css`).
7. **The products: "One shop, six products"** (framer-review P1, the founder's yes on the
   Framer prototype; `SuiteFrame.tsx`, `suite.css`, words in `home.suite.frame`). A full
   opening (the heading across the grid, the lead under it), then one Carbon plate cut at 45°
   (mirrored): a bar with Qirfa Bakery, the frame's
   one "Sample" mark and "Thursday · 16:20", then six tiles in the suite's order: Chat (8
   columns) and Bookings; Agent, Accounts, and Shelf over Docs. Two columns on a tablet, one on
   a phone. Each tile is one link named "{name}, {descriptor}" (and its state), holding a
   fragment of the product's real screen (`inert`, cropped hard at the tile's edge, no fade)
   and its name, descriptor and arrow. Numbers come from the engine's sample (`_agent/samples`),
   Shelf's page copy and `paperData.ts`, never retyped; the Agent tile titles its card
   "Suggestions" and draws no rule line. **Every tile is finished before it is seen**, at
   every width; at 60% in view its moment plays (CSS keyed on `is-in`, which loops.ts adds;
   each animation fills backwards, so its first frame is the earlier state), done by about
   1.4 s at pace 1.3, then holds, fades and plays again, each tile on its own cycle, 8 beats a
   tile apart (founder, 26 Oct 2026: motion always on); hover or focus replays a resting tile.
   One Pause control at the bar's end (the bar keeps 5 rem for it) stops all six. The HTML is
   the end state, so without scripts or with reduced motion nothing plays and every tile is
   finished. The one Volt fill is the chosen slot. Then the two
   notes. Nothing is pinned. The six plain rows of 24 Oct and their crops are gone. Then **Price** (offer on: the price, examples by trade, setup,
   the first month, what every month includes, the agreement), **Questions** (the
   first `faq.shown` open to read, the rest under "More questions"; a `#q-...` link opens the
   fold), the **closing call**, the **footer** (no clock).

Gone on 25 Oct (the founder, ALY-226): the trust section, "What you can check before you
start", with its six facts, the on-record slots and the tracking pages in two languages;
and the rail of four numbered steps under How we work.
Gone on 24 Oct and not to come back without the founder: the Why ALYR table, "What a check-up
finds" as its own section, the pinned products room, eyebrows that repeat a heading or a
header link, numbers on tabs and indexes, FIG captions. Gone on 25 Oct (the content audit,
`docs/content-audit/`): `/agent`'s "The rules" section and its product-bar link, and every
rule line drawn on the site.

"Agent" on the homepage always sits beside what it counted; no AI words, no «وكيل» (the Arabic
says ALYR «تتولى عنك العمل المعتاد»), no "Is it AI?" question. Say "reason", "what it
counted" or "what it compares", never "rule" / «قاعدة», on any public page, in its meta or in
`llms.txt` (founder, 25 Oct 2026; `alyr-design/honesty.md` §1). Nothing on the homepage is
pinned.

`/chat`'s "What's in ALYR Chat" is the phone with X-ray (`ChatXray.tsx`, `xray.css`,
ALY-209): the list beside a pinned phone that shows the feature being read; "For your team"
brings the team's workspace in behind it, "Behind the scenes" turns the phone to X-ray with
the message's path through ALYR. Each item's `scene` in `copy.ts` must show only what is
built (a payment link opens the test page; STOP's reply is `core/consent.py`'s own words).
Without scripts it is the three columns.

## The product page template

Every product page uses `_site/ProductKit.tsx` and `kit.css`, in this order:

| Block | Component | Rule |
|---|---|---|
| Product bar | `ProductBar` | Name with the signal and its sections; sticky; no call to action |
| Opening on Carbon | `ProductHero` | Eyebrow with the state, a two-line H1 that names the result (second line Concrete), the lead, the page's one Volt button "Book a check-up" (`HeroAction`: `home.hero.action`, the homepage's contact link, `data-hero-cta`; the column's width on a phone), a tabbed demo (`ProductDemo`), three facts on one rule. Cut corner, not rounded |
| Signature figure (optional, after the opening) | `LastOne.tsx`, `PaymentPaper.tsx`, `moment.css` | One real object changing state (03-visuals of `docs/site-products-2`): three parts hanging from one label line over a rule, CSS keyframes keyed on `.is-in` on each part, every duration a `--play-*` token and every delay a number of `--play-stagger` beats (`alyr-design/motion.md`, the pace), one Volt mark, done by 1.8 s; the HTML is the end state. `data-sig` (not `data-m`) gives it its own trigger (`loops.ts`): on a wide screen the whole figure starts once 60% of it is on screen or its top is past the middle; on a phone each part starts as it arrives, its delays counted from its own first beat (`--t0`). Then it keeps playing (founder, 26 Oct 2026): it holds while its result is read, fades and plays again as one figure, with one Pause control above the end of its label line (`data-loop`, `LoopToggle`). It keeps `motion` past the 4 s failsafe. Measure that it starts and ends in view (`--eval`, no screenshots). It must fit one screen at 1440 × 900 |
| How it works, from both sides | `FlowSection` (`FlowDiagram`) | The customer's steps and the business's, in the product's real words. Each step dwells for its title and work lines at 230 words a minute (the pace, `alyr-design/motion.md`): a long work line makes a long step |
| The screen used every day | `ScreenBlock` | The real workspace screen at true scale in the workspace window, numbered Carbon callouts beside it; on phones the workspace's phone layout (cards), never a sideways table with no cue |
| What's in it | `InsideBlock` | Everything it does today by audience, titled "What's in {product}" ("What's in ALYR Chat" / «ما يتضمنه ALYR Chat»); a figure beside it if the page needs one (`children`); then **Not yet** below a dashed rule with the pending dot, only for an item whose absence would make another line untrue (D-039: nothing coming is shown). Leave `notYet` out otherwise |
| (each part tells one thing) | | The demo, the signature, the flow and "What's in it" each tell a different part; a story drawn three times is cut, not squeezed. A product page stays near the family's height (about 8,800 px at 1440, plus a signature figure) |
| Who it's for | `WhoBlock` | Rows by business type with what each uses; tags in suite order |
| Works with the rest of ALYR | `WorksBlock` | Ruled rows in the suite's order without the page's own product |
| Questions | `QuestionsBlock` | Titled "Questions" / «أسئلة», as the header link; native `<details>`, an `id` per question; "Can I use it on its own?", "How long does setup take?" |
| Closing call | `Shell` | The fold at its top, the contact block in its state |
| Phone's contact bar | `Shell`, `SiteMotion` | As on the homepage (founder, 24 Oct 2026), below 53rem: up once the opening's `data-hero-cta` button has scrolled away, down while the closing call or the footer is on screen; 44 px button, `env(safe-area-inset-bottom)`, no slide with reduced motion, down without scripts. One Volt button on screen: the header's is the outlined twin while the opening's is in view or while the closing call is on screen (`data-at-closing`, set by `SiteMotion`), and hides while the bar is up (`site.css`). A page whose opening has no `data-hero-cta` never shows the bar |

Each page has its own English social card (`(site)/<page>/opengraph-image.tsx` through
`_site/socialCard.tsx`). Arabic pages share the English homepage card until Arabic cards are
drawn with resvg (`alyr-generated-image`).

## Adding a product page

**First, may it exist?** A product gets a page only when it is built and the founder has
said so (D-039: nothing "coming" is shown to an owner or customer at go-live; on 20 Oct
2026 the founder took Payroll off the site until it is built). **"A coming-soon page for
ALYR Payroll" is therefore not something to build**, and nothing names it. Stop, label the
issue "Needs Akmal", and ask: is it built and in the catalogue as live, and does he want its
page now? A product that is built but still off for shops can have a page only on his word,
and then its page never says it is available (ALYR Docs, 20 Oct 2026).
You may draft its words and claims in the work folder (`docs/work/ALY-NN-.../`) for his
review; nothing goes into `copy.ts` or a route.

Once a product is built and approved, the page needs every one of these, or it is built and
silently not published, or published and not linked:

1. **`_site/site.ts`:** its key and both addresses in `PATHS` (feeds the canonical link,
   hreflang, the language link and the sitemap); keep `PRODUCTS` in suite order
   (`productPath()` returns `PATHS[key]`; every product listed has a page). If it comes with
   every product, add it to `INCLUDED`.
2. **`_site/copy.ts`, both languages, typed:** `meta.<key>` (title, description,
   `descriptionNoOffer`) and the `meta` key union; a `pages.<key>` type and both objects;
   `products.items.<key>` (name, descriptor, line, state) for the menu; `works.rows.<key>`
   on every other product page; the homepage suite row (`home.suite.rows` is typed by every
   `ProductKey`), its business tags and the Products menu line. A page with a lot of words
   can keep them in its own copy file (`copyShelf.ts`, `copyDocs.ts`) that `copy.ts` imports.
3. **The page component** `_site/<Name>Page.tsx` from `ProductKit` blocks.
4. **Routes in both groups:** `app/(site)/<key>/page.tsx` and
   `app/(site-ar)/ar/<key>/page.tsx`, each with `siteMetadata(locale, "<key>")`.
5. **Social card:** `app/(site)/<key>/opengraph-image.tsx`.
6. **`scripts/build-site.sh`:** nothing to add. It reads its list of pages from `PATHS`
   (`scripts/site/pages.mjs`, since ALY-232): the HTML in both languages, the social card and
   the deferred-scripts step. It fails if an English page's card is missing.
7. **Homepage:** its tile in `SuiteFrame.tsx` (`FRAGMENT`), drawn from the product's real
   screen, with its moment in `suite.css` and its place in the plate's grid at each width.
8. **Menu, footer and "works with" rows** read `PRODUCTS` and `productPath`, so they turn into
   links once step 1 is done; check each, in both languages, with the menu open.
9. **Check:** `pnpm site:check` passes (from `apps/web`: `build-site.sh`, EN/AR parity,
   banned words and prices, internal links); `out-site/<key>.html`,
   `out-site/ar/<key>.html` and the card exist; `sitemap.xml` lists both addresses; the
   language link lands on the same section.
10. **Docs in the same PR:** `docs/brand.md` (the suite on the site), `docs/status.md`, the
    lane brief's "Now", and a decision entry if it changes a recorded decision (check the
    next free D-number on `origin/main` right before committing).

## Sector pages and owner guides

Added 25 Oct 2026 (ALY-232, ALY-233, D-057; reviewed by two critics, `docs/work/ALY-232-sector-pages/`).
Words in `copySectors.ts` and `copyGuides.ts`; pages `SectorPage.tsx` and `GuidePage.tsx`;
styles `pages.css`; routes `/for/[sector]` and `/guides/[guide]` with `generateStaticParams`.

- **A sector page answers first.** Breadcrumb, then the owner's main question said as a
  statement (no question mark) on the start seven columns and its answer (under 80 words) on
  the end five, then the one Volt "Book a check-up" with that trade's own message and the
  products as tags. It opens on the canvas, not Carbon: an audience page is read, not demoed.
- **Then the drawing, at once:** the trade's hour split by the fold (`DaySplit.tsx`, the
  homepage's rows, or the trade's own `day`), marked "Sample" once, its machine line first.
  Its lead names the buttons as they read; never "start side" or "end side".
- **Then** "Your day today" (the opener in the owner's words, as statements), "What we set
  up" (one row per product, only what is built, a limit as a pending status line), and the
  Questions with the trade's guide in their start column (`QuestionsBlock`'s `aside`).
- **A guide** is an article on the grid's start: title, a byline with `<time>` ("Guide · ALYR
  team · date"), "In short" (100 words or fewer, the whole answer, checked by
  `pages.test.mjs`), steps that work without ALYR, then "With ALYR" once, last, describing
  only what is built and never claiming a step of the guide that the product does not do.
- **Structured data:** WebPage + BreadcrumbList + FAQPage for a sector; Article (author the
  organisation "ALYR team", dates in Doha time) + BreadcrumbList for a guide; CollectionPage
  for the index. Never a person, a price or a rating.
- **A new trade or guide:** add its key to `SECTORS` or `GUIDES` in `site.ts` and its words in
  both languages; the routes, sitemap, footer row, machine copies, build and checks follow.
  A clinic never gets a page (health data, D-043).
- Found by the critics, keep out: a sample that shows a feature the product lacks (a promise
  to pay on a named day); "every" where ALYR answers only some messages; "free" for an open
  time; a line repeated from the homepage word for word.

## Do

- Draw the product's real screens in its exact words (status names, buttons, times as it
  prints them); prefer samples captured from the engine to hand drawings.
- One sample business per figure set; every drawing marked "Sample" once in its own chrome
  (`SampleMark`; a drawn phone's header says "Sample business"), and its figure's first line
  saying, for machines, that the business is fictional (`alyr-design/honesty.md` §4). A
  caption only where the drawing needs words.
- The contact block from `Contact.tsx`; prices only through `OFFER_LIVE`.
- Structured data from `_site/structuredData.ts` (rendered by `Shell`): Organization,
  WebSite on the homepage, SoftwareApplication and BreadcrumbList on each product page,
  FAQPage from the questions the page shows. Built from the page's own words; never
  `offers`, a price, a rating, a review, a legal name, an address or `sameAs` before they are
  true. A new product page gets it by having its `meta`, `products.items` and `faq` entries.
- Logical CSS; `[dir="rtl"]` only for what cannot mirror; every cut mirrored.
- Name heading line breaks in copy; check 320 px.
- Static HTML first: anything live (clock, steppers, observers) runs after hydration and the
  HTML is complete without it. No server code, no `cookies()`, `headers()`, API calls.
- Images imported from code (they land in `_next/static`), plain `<img>` with width and
  height, or `next/image` with `unoptimized`. There is no `public/` folder on the site.
- Keep the page's own JavaScript small; GSAP only where it is already used.

## Don't

- Put a word in a component, including `aria-label`s, alt text and captions.
- Show a price, a coming product, AI wording or a must-not-claim line.
- Style a bare element from a container (`.top-nav a` once broke the Products menu), or
  reuse the Agent's `ag-` class prefix in a site drawing.
- Add a second Volt button, a carousel, a pop-up, a cookie banner, a logo wall, a counter,
  a third-party script or analytics (also a data-residency question).
- Add a dependency without a one-line reason in the PR.
- Deploy. Publishing is the founder's yes each time: his approval of the `production`
  environment in GitHub (`site deploy` workflow), or `pnpm site:deploy` on his laptop
  (`docs/runbooks/site-deploy.md`). A pull request gets a preview address on its own.

### Words that read as written by a machine

From the content audit (`docs/content-audit/01-audit.md` §4, applied 25 Oct 2026 at the
founder's word). Before and after: "Numbers that never skip" → "Gapless numbering"; "No CR
yet? Receipts that say so" → "Receipts for shops without a CR"; "Check. Set up. See.
Improve. / Then again." → "How we work with you".

1. **Feature titles, facts, tags, menu lines and step titles are plain nouns or one plain
   sentence.** "Gapless numbering", "Receipts for shops without a CR". No slogan fragments
   ("Every paper final"), no puns on a product's name (shelf, docs, paper).
2. **One slogan per site:** the homepage H1. Every other heading names what the section holds,
   in the owner's words, and matches the link that leads to it ("How we work", "Questions",
   "What's in ALYR Docs").
3. **A two-line heading is one sentence broken in two**, never two slogans stacked.
4. **No questions outside the Questions section**: not in a heading, fact, tag, step title,
   list item or the "Who it's for" line. In Questions, ask as an owner asks ("Will my staff
   use it?"); at most one objection written as a statement per page.
5. **No stacked fragments or tricolons in headings:** no "X. Y. Z.", no "One X, one Y, one
   Z", no comma lists used as titles.
6. **No colon reveals** in headings, facts, tags, menu lines, step titles or the opening of a
   caption. In body text a colon introduces a list or an example only.
7. **No denial or contrast openers:** "No guesses and no scores.", "Not everything should be
   automatic.", "Not X, but Y".
8. **No filler words:** polite(ly), honest(ly), simply, easily, truly, really (unless it is a
   fact), powerful, beautiful; «لبقة», «بصراحة», «بكل سهولة».
9. **No grandiosity or punchlines:** "the businesses that win", "You decide." or "Nothing
   lost." standing alone at the end of a paragraph.
10. **No personification beyond what the product does:** it sends, counts, checks, records
    and pauses. It does not step back, go quiet, seal or read.
11. **The lead adds a fact the heading did not give.** It never restates it. No stage
    directions ("Follow one order through").
12. **Say it once.** A line used on two pages, or twice on one page, is reworded, unless it
    is a template label (product names, "Works with the rest of ALYR", the contact block).
13. **Eyebrows only for a product's state or a name the heading lacks.** Never an eyebrow that
    restates the heading or a header link.
14. **No "rule" / «قاعدة» about ALYR** on the public site (founder, 25 Oct 2026): say what was
    counted or compared. WhatsApp's 24-hour rule is "the 24-hour window" / «نافذة 24 ساعة».

**The check.** `scripts/site/banned-words.mjs` (in `pnpm site:check`) enforces what a regular
expression can: the word "rule" in the copy and the built site, and the `style` block of
`scripts/site/banned-words.json` in the copy (questions in labels, stacked short sentences,
"one X, one Y, one Z", colon reveals in labels, "X means X", filler, grandiosity, denial
openers, personification, stage directions, punchline closers, in both languages). Labels are
strings under the keys in `style.labelKeys`; questions, answers and sample data are skipped.
A line kept on purpose goes in `scripts/site/allow/banned.json` with its reason: under `kept`
the founder's kept lines (the hero's slogan, the footer, ALYR Agent's heading), which the
check holds to their exact words, and under `style` a reviewed hit (the products and price
headings, outside the audit, wait for the founder). Rules 2, 11 (the lead), 12 and 13 need a
reader: check them by eye.

## Done when

- [ ] Every word in `copy.ts`, both languages; `/ar` has no stray English.
- [ ] Claims checked against `docs/status.md` and `alyr-design/honesty.md`, including meta,
      social card and alt text; no AI words; samples marked once, in their chrome, with the machine line first.
- [ ] Looked at: both languages, 1440, 390 and 320, light and dark, reduced motion, no
      scripts, the Products menu and the phone menu open, every contact state touched.
- [ ] No horizontal scroll at 320; targets 44 px; focus visible; headings in order.
- [ ] `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm site:check` pass.
- [ ] `pnpm site:a11y`: axe zero serious or critical; Lighthouse mobile on changed pages
      ≥ 90, LCP < 2.5 s, CLS < 0.05 (`--pages=` for the changed ones).
- [ ] `/chat` and every page sharing a changed component still look as before.
- [ ] Docs updated; screenshots listed in the PR; "Not checked" written; founder asked
      before any publish.
