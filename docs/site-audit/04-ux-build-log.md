# 04 · Build log: the site audit's UX and agent-experience fixes

ALY-223. Builder: the Site and brand lane, worktree `D:\alyr-ux`, branch `aly-site-audit-fixes`,
cut from `aly-210-tech-team-homepage` at c22a5e0 (what is live, PR #105). Dev server port 3115;
static servers 3116 (the baseline `out-site`) and 3117 (this branch); Edge profile
`C:\t\uxfixprof`. Probes and the measuring scripts live outside the repo in `C:\t\uxfix`.

Order of authority: `CLAUDE.md`'s hard rules, `00-decisions.md` (the founder, 24 Oct), then
`01-ux.md` and `03-ax.md`, then the skills.

## Baseline (c22a5e0, built here with `build-site.sh`, served compressed)

Page heights in px, light, after a full scroll (the audit's probe). They match the live
measurements in `01-ux.md`.

| Page | en 1440 | en 390 | ar 1440 | ar 390 |
|---|---|---|---|---|
| `/` | 17,716 | 21,380 | 17,467 | 20,429 |
| `/chat` | 8,729 | 10,999 | 8,819 | 10,933 |
| `/bookings` | 8,738 | 11,718 | 9,036 | 11,648 |
| `/agent` | 10,308 | 13,940 | 10,454 | 14,148 |
| `/accounts` | 8,840 | 11,351 | 8,962 | 11,352 |
| `/shelf` | 10,462 | 14,004 | 10,546 | 13,766 |
| `/docs` | 10,709 | 15,024 | 10,688 | 14,552 |

Small-text items by the audit's probe (`C:\t\uxaudit\probe.js`: blocks under 15.5 px or in
mono, outside drawings, captions counted, screen-reader-only text left out), en 1440, each page
with its shared header, menus and footer: `/` 191, `/chat` 129, `/bookings` 112, `/agent` 90,
`/accounts` 118, `/shelf` 127, `/docs` 114, total 881. The audit's inventory counts the same
pages by hand, with the shared items once: 553. Both are given again after the build.

## Stages

### Stage 1 · "Sample" marks in the chrome, machines told first (founder decision 3; `01-ux.md` §0; `03-ax.md` A1)

Done:
- `SampleMark` (`Frames.tsx`, `.mark-sample` in `site.css`): a small outlined mono tag, "Sample" /
  «مثال», from the tokens (`--fs-micro`, `--tracking-label`, `--line-strong`, `--radius-sm`; on
  Carbon `--band-rule` and `--on-band-quiet`). Arabic in Plex Sans Arabic, no capitals, no
  tracking. `aria-hidden`: machines get the figure's first line instead.
- Where each mark went: the homepage hero window's bar (the spotlight and `/agent` keep the
  switch's "Sample business"); every drawn workspace window (`Sheets.tsx` `Frame`, both Bookings
  windows, Credit, Stock and its log, Documents); the Shelf and Docs signature figures' window
  bar; `/agent`'s opened card, which gained the workspace window's bar to carry it; the flow
  figure's tab row, after Pause; a demo tab with no phone, in its panel's top; the ALYR side of
  the homepage's fold split. Drawn phones say "Sample business" / «نشاط توضيحي» under the name
  (`businessMeta` in every demo, the report's `meta`, the X-ray phone).
- Gone: 14 FIG captions, every "Sample conversation with a fictional …" note (demos and
  flows, 9 per language), the spotlight's under line, the second captions under the Bookings
  and Shelf windows, the tab numbers in the demos and flows. Kept, without a number, ending
  "· Sample": the trust pair, the agreement (offer on) and the Docs no-CR foot. `Caption` is now
  `{ text }`; `fig` is `{ sample, business, note }`.
- Machines (A1): each sample figure's first child is an `sr-only` `figcaption` (or `p`): "Sample
  screen of a fictional bakery. The names and numbers are made up; they are not ALYR's results."
  (per sample, `agent.samples.*.fictional`; `fig.note` for Dana Home Services on `/chat`). The
  three kept captions are now the figure's first child, shown below by `.fig-cap-end`. Every
  drawing sits in a `data-nosnippet` box (on a `div`, where Google reads it). The Agent dashboard
  takes `headings={false}` on the site: its titles render as `p`, so no sample number is in the
  page's outline (`_agent/AgentDashboard.tsx`, a small change in the Product lane's file; the
  workspace keeps its headings).
- Skills: `alyr-design` principle 5, §4 and §9; `honesty.md` §4 (the mark, and "machines read
  it first"); `components.md` (the mark and the caption rows); `alyr-site-page` (description,
  Do, Done when); `alyr-design-review` (the review standard); `alyr-product-screen/agent-dashboard.md`
  and `alyr-deck-and-social` (two lines each that still asked for FIG captions).

Decisions while building: one mark per crop was rejected for the homepage products until stage 5
decides the rows (see there). The Docs signature figure's phone keeps "Business account": the
figure is marked once, in its window bar.

### Stage 2 · "Book a check-up" on every page (founder decision 2; `01-ux.md` A1)

Done: `Shell` takes the action from `home.final` (`action` "Book a check-up" / «احجز فحصاً لمشروعك» (header on phones «احجز فحصاً»)
as the homepage already had it, `short` "Check-up" below 62rem) unless a page names its
own, so the header button, the closing call's button and the phone's sticky bar say it on the
homepage and all six product pages, in both languages. It is the same `contactLink` (the mail
link in the email state). The price section's button (offer on) says it too. `nav.cta` (the
old "Email us" / "Message us" / "Talk to us" header names) is gone; `contact.email` still names
a contact button that is given no label (none on these pages now).

Not added: a hero button or a sticky bar on the product pages. Their openings have no button
today and the founder's list names the places the homepage has; adding them would push the demo
out of the phone's first screen (`01-ux.md` F1) and add a sticky layer (P1-a). For the founder,
if he meant a new button there too.

### Stage 3 · The inventory (`01-ux.md` §1, R1, R2, R3, C1, C2), both languages

Done, by `01-ux.md`'s verdicts:
- Shared: the Products menu (and the phone menu) shows a state only on ALYR Agent and ALYR
  Shelf ("With every product"); the Doha clock is gone (`DohaTime.tsx` deleted, `footer.doha`).
- Eyebrows that repeat a heading or the bar: 46 removed per language (every product page's
  How it works, The screen, What's in it, Who it's for, The products, Questions; `/agent`'s How
  it works, The Sunday report, The rules; `/chat`'s Why it helps; the Shelf and Docs signature
  eyebrows; the homepage's hero, Why, How, What a check-up finds, By business, One order, The
  products, Questions). Kept: the Trust question, the spotlight (now "ALYR Agent · With every
  product", C2), the Price eyebrow (offer on) and each product opening's state, now the state
  alone ("Set up for you", "With every product"; the bar above names the product). Section
  eyebrows are optional in the types. The homepage hero's eyebrow stays in `copy.ts` for the
  social card only; the product cards build "ALYR Bookings · Set up for you" from the name and
  the state, so every card reads as before.
- Homepage: fact 1 "We come to your shop, in Qatar"; How loses its note (it stays as the Price
  status line) and the "Every month" list (`how.month` deleted); By business's list head is
  "Today"; the salon note ends at "right for one chair"; the tally reads "In Sara's order";
  the trust facts lose their mono labels; the flow lanes keep only "Business Platform".
- Product pages: the flow lanes likewise; the Chat pillars lose 01 to 04; who-tags gone on
  Chat, Bookings and Accounts and set in 14 px body type on Agent, Shelf and Docs (`.tags span`,
  `--fs-note`); `/agent`'s one-line "For your team" group joins the first; "Not yet" gone from
  Bookings and Agent, Accounts keeps live payments and statements; inside notes shortened to
  "Everything listed here is built." (Agent, Shelf: "With every ALYR product. …"; Accounts
  keeps "above the line"); `/chat`'s X-ray caption keeps only "The phone shows the feature you
  are reading."
- R3: Bookings' "Behind the scenes" keeps its own two lines and closes with "How ALYR handles
  WhatsApp's rules, consent and your records" → `/#trust` (`InsideSection.rules`). Consent
  stays where it is the product's own (`/chat`, `/accounts`, Docs' document messages).
- C1 (D-039): "Several at once is the next step for Bookings" and "whether it fits yet" are out
  of the chairs question on `/` and `/bookings` and of Bookings' who line.

New Arabic lines (ALY-66 review): «نأتي إلى محلك في قطر»، «اليوم»، «في طلب سارة»،
«ALYR Agent · مع كل منتج»، «نجهّزه لك»، «مع كل منتج»، «كل ما في هذه القائمة مبنيّ في المنتج.»،
«مع كل منتج من ALYR. كل ما في هذه القائمة مبنيّ في المنتج.»، «يعرض الهاتف الميزة التي تقرؤها.»،
«كيف تتعامل ALYR مع قواعد واتساب والموافقة وسجلاتك»، and the shortened chairs answer.

### Stage 4 · The homepage fold and the products as rows (founder decision 4; `01-ux.md` L1, L2)

Done:
- **What a check-up finds** is gone as a section (`home.problems`, `Problems`, its CSS). Each
  By business tab's "Today" list is now written from the six problems, row for row with its
  "With ALYR" list: bakery (lost orders, "Is my order ready?", regulars who owe), wholesale
  (prices in a spreadsheet, lost orders, shops who owe), fashion (the same questions, lost
  orders), restaurants (lost pickup orders, "Is my order ready?", office lunches owed), salons
  (the same questions, the empty chair, no idea how the week compares), home services (the
  calls, parts, contract customers who owe). The product tags under each tab are still the
  links into each product.
- **Why ALYR** is gone as a table (`home.why`, `Why`, its CSS); its strongest line is the hero
  lead: "Big businesses have consultants and an IT team for this. You have us: we check how
  your business runs, set up what it needs, and keep improving it with you." / «للشركات الكبيرة
  مستشارون وفريق تقنية لهذا العمل، ولمشروعك ALYR: نفحص كيف يسير عملك، ونجهّز ما يحتاجه،
  ونواصل تحسينه معك.»
- **The products** are six plain rows (`.suite-row` in `room.css`; `ProductRoom.tsx` deleted
  with the pinned index, the tilted desk, its camera and the corners' one-shot plays): name,
  descriptor, the state only on Agent and Shelf, the sentence and its link, the corner at true
  size with its own "Sample" mark (one per corner, since each is its own drawing once the desk
  is gone), then the two notes. The corners sit in `data-nosnippet` boxes after an `sr-only`
  line saying they are the fictional bakery's. "All six, on one screen." and the 01–06
  numbers are gone.
- `docs/decisions.md`: D-048 gains its 24 Oct update (the fold, the new order, one action
  name, nothing pinned). `alyr-site-page`'s homepage section is rewritten to match.

Measured at once (en): `/` 12,191 px at 1440 (was 17,716).

### Stage 5 · The product template and phones (`01-ux.md` top five #4 and #5: L3, F1, F2, P1-b, P1-c)

Done:
- `.sec` pads with `--sec` (was a literal `clamp(4.5rem, 10vw, 8rem)`, 256 px at 1440); the
  phone override that only restated 3.5rem is gone.
- Duplicate captions: the second windows' captions on Bookings and Shelf went in stage 1
  (they stay as the windows' `aria-label`s).
- Leads: every product lead is three lines or fewer at 390 in both languages (measured: en 3,
  ar 2; at 320 the Docs lead is 4 in English, the rest 3 or fewer). New leads: Chat "ALYR
  Chat adds an order page and updates to your chat, and one inbox for your whole team.";
  Bookings "Customers pick a free time in the chat. ALYR confirms at once and reminds them two
  hours before."; Agent "What needs you now, how your week is going, and up to three
  suggestions, each with its rule."; Accounts "Record credit in one line. One press sends
  reminders whose tone follows how late the payment is."; Shelf "Photos, prices and sizes in
  Arabic and English. Every sale counts the stock, so the last one sells once."; Docs (the
  audit's line) "When a payment is recorded, ALYR Docs issues the next numbered receipt, Arabic
  first, final once issued." The conditions they dropped are still on the page: Docs' 24 hours
  in its Receipt tab caption and the CR rule in "No CR yet?"; Accounts' pause on a promise in
  its demo and flow; Bookings' "your team marks who came" in its Came tab and facts.
- Demos and flows open on their first step finished: the HTML's first tab (and the flow's
  first step) is no longer hidden behind its arrival animation; messages arrive one by one only
  once the figure has moved on (`data-moved`). On a phone the demo's chat starts under its day
  chip, so the first message is in the first screen (it sat at the bottom of a 31rem phone).
- The product bar on phones (≤ 30rem) keeps "How it works" and "What's in it" only
  (`.pbar-extra`); wider it keeps every link.
- `/agent` on a phone stops after Needs you now, Done for you and the four numbers; a native
  `<details>` "See the whole screen" / «اعرض الشاشة كاملة» opens the rest (`.af-more`,
  `:has()`; a browser without `:has()` shows the whole screen, as before).

### Stage 6 · JSON-LD from the copy (`03-ax.md` A4)

Done: `_site/structuredData.ts`, rendered once per page by `Shell` as
`<script type="application/ld+json">` ("<" escaped). Organization (name, url, logo, the
homepage's meta description in the page's language, email, `areaServed` Qatar,
`knowsLanguage` ar and en) on every page; WebSite on `/` and `/ar`; on each product page a
SoftwareApplication (name, descriptor as `alternateName`, the page's own meta description,
url, `BusinessApplication`, `Web`, `inLanguage`, `countriesSupported` QA, `provider` ALYR) and a
BreadcrumbList (ALYR › the product); FAQPage from the questions the page shows, filtered by
the contact and offer states as the page filters them (none on `/chat`, which has no
questions). Never `offers`, `price`, `aggregateRating`, `review`, `legalName`, `taxID`,
`address` or `sameAs`; ALYR Docs is described by its meta description, which never says
available.

Checked (`C:\t\uxfix\ld.mjs` on the built `out-site`, all 14 pages): one block each, parses,
only the properties listed above, no forbidden property, every FAQ question and answer is
visible text on its page, each product's description equals its meta description, the
breadcrumbs are in order. The properties were checked against schema.org's own type pages
(SoftwareApplication, Organization) on 24 Oct. Not run: Google's Rich Results Test and
validator.schema.org, which need a public address; no rich results are expected anyway (FAQ
results are for government and health sites, software results need a price and a rating).
`alyr-site-page` says how a new page gets its structured data.

### Stage 7 · Verification (`alyr-design/verify.md`), on the built `out-site` served compressed

Two defects found and fixed in this pass: `/chat`'s pillars kept a 2.25rem number column on
phones after their numbers went (the section grew from 984 to 2,160 px at 390; now one column),
and the X-ray's "What ALYR checks" label was 3.5:1 on Carbon (axe; now `--on-band-faint`).

**Page heights, px** (light, after a full scroll; before → after):

| Page | en 1440 | en 390 | ar 1440 | ar 390 |
|---|---|---|---|---|
| `/` | 17,716 → 12,154 | 21,380 → 16,638 | 17,467 → 12,046 | 20,429 → 15,917 |
| `/chat` | 8,729 → 8,175 | 10,999 → 10,491 | 8,819 → 8,304 | 10,933 → 10,444 |
| `/bookings` | 8,738 → 7,755 | 11,718 → 10,490 | 9,036 → 8,056 | 11,648 → 10,489 |
| `/agent` | 10,308 → 9,373 | 13,940 → 11,453 | 10,454 → 9,504 | 14,148 → 11,606 |
| `/accounts` | 8,840 → 8,022 | 11,351 → 10,421 | 8,962 → 8,208 | 11,352 → 10,462 |
| `/shelf` | 10,462 → 9,578 | 14,004 → 13,449 | 10,546 → 9,649 | 13,766 → 13,129 |
| `/docs` | 10,709 → 9,826 | 15,024 → 14,366 | 10,688 → 9,792 | 14,552 → 13,908 |

**Small text.** The audit's probe, measured, en 1440, each page with its header, menus and
footer: 881 → 670 (`/` 191 → 142, `/chat` 129 → 102, `/bookings` 112 → 78, `/agent` 90 → 66,
`/accounts` 118 → 85, `/shelf` 127 → 105, `/docs` 114 → 92); the same at 390: 787 → 550. By the
audit's own hand inventory (shared items once), 553 → about 361: its 364 with every verdict
applied, less the fold (−11: the problems' lead, product links and "More we find", the Why
table's column heads), plus the six "Sample" marks on the products' corners and the fold
split's (+7) and `/agent`'s "See the whole screen" on phones (+1). The hand figure is an
estimate from the tables, not a recount of every page.

**Checks.**
- axe-core 4.x (`C:\t\tools`), all 14 pages, light at 1440 and dark at 390, after a full
  scroll with motion finished: 0 serious or critical, nothing else reported.
- 320 px, both languages, all 14 pages: `scrollWidth` 320 everywhere; the only boxes past the
  edge are the homepage's business tabs inside their own sideways row. Targets under 44 px:
  `/chat`'s X-ray feature buttons (262 × 24), unchanged from ALY-209 and not touched here.
- No scripts (390, all 14): every page complete, nothing hidden by a reveal, the demos'
  first messages in the HTML (Chat 3, Bookings 2, Accounts 1, Shelf 2, Docs 2), JSON-LD present.
- Reduced motion (1440, all 14): nothing in the first screen at opacity 0.
- Menus: the Products menu open at 1440 and the phone menu open at 390, light and dark, on
  `/`, `/ar`, `/bookings`, `/ar/agent`: six products each, a state only on Agent and Shelf.
- `/agent` at 390: closed, the grid shows Needs you now, Done for you and the four numbers;
  open, all eight parts.
- Sample marking in the served HTML (`C:\t\uxfix\figs.mjs`): every figure and every demo and
  flow on the 14 pages says "fictional" before its first number, and no figure holds a heading.
- JSON-LD (`C:\t\uxfix\ld.mjs`): see stage 6.
- Lighthouse 12 mobile, simulated throttling, two runs each: `/` 98 / 100 / 100 / 100, LCP
  2.4 s, CLS 0; `/agent` 98 / 100 / 100 / 100, LCP 2.4 s, CLS 0; `/docs` 98 / 100 / 100 / 100,
  LCP 2.4 s, CLS 0 (Performance / Accessibility / Best practices / SEO).
- `pnpm lint` clean; `pnpm exec tsc --noEmit` clean, also without `next-env.d.ts`; `pnpm test`
  80 pass; `bash scripts/build-site.sh` passes (156 files); `node scripts/design-check.mjs`:
  418 files clean, 5 allowed exceptions.
- Words: the built pages grepped for the AI list (English and Arabic), "coming", "next step for",
  "Payroll", "Early access", FIG numbers and "Sample conversation": none (the Arabic hits were
  «تذكير», and "one next step with its rule" describes the report's content). "QAR" appears only
  inside drawn samples.

Screenshots (not committed) in `docs/site-audit/shots/`: `f/` first screens of all 14 pages at
1440 and 390, light and dark, and full pages light at 1440 and 390; `v/` the 320 first screens,
no-script and reduced-motion views, the menus open, `/agent`'s disclosure closed and open; `s1-`
to `s5-` the stage checks.

## For the founder

- Screenshots above; nothing is published.
- Whether "Book a check-up" should also get a hero button and a sticky bar on the product
  pages (stage 2: not added). Answered 24 Oct: yes, built in the follow-up at the end.
- The Arabic of every new line (ALY-66), listed in stages 3 to 5.
- The hand inventory's estimate (about 361) against the probe's measured 670 of 881: if a
  stricter count is wanted, it needs a page-by-page recount.

## Not checked

- A real iPhone or Android; Safari and Firefox (`:has()` drives `/agent`'s disclosure; without
  it the whole screen shows).
- The WhatsApp contact state and the offer-on state (the price section's caption and button
  were changed but not looked at with the offer on).
- Keyboard paths beyond the menus opening (Tab order through the demos and the disclosure was
  not walked).
- The Agent component against `/agent-sample` element by element: the only shared change is
  `headings={false}`, which the workspace does not pass.
- Google's Rich Results Test and validator.schema.org (need a public address).
- 1024 and 1280 spot checks.
- Motion timing in a run without screenshots.

## Follow-up · "Book a check-up" in every product page's opening, and the phone's bar (24 Oct)

The founder approved what stage 2 left open: every product page (`/chat`, `/bookings`,
`/agent`, `/accounts`, `/shelf`, `/docs` and their `/ar` pages) gets the homepage's
treatment, the Volt button in the opening and the phone's sticky bar, exactly as the homepage
has them. Lean path of `alyr-design-review` (one component and its behaviour, no new words):
no critics. The ALY-223 work below this was already on alyr.qa when this started (its JSON-LD
answers on `https://alyr.qa/bookings`); this follow-up is not published. Static server 3121,
Edge profile `C:\t\btnprof`; probes in `C:\t\btn` (outside the repo).

Done:
- `ProductKit.tsx` `HeroAction`: under the lead in `ProductHero` (Bookings, Agent, Accounts,
  Shelf, Docs) and in `/chat`'s own opening; `ContactButton` with the homepage's words
  (`home.hero.action`: "Book a check-up" / «احجز فحصاً لمشروعك») and the same mail link,
  wrapped in `data-hero-cta`. None while the contact state is pending. No new keys in `copy.ts`.
- `Shell` renders the phone's bar on every page (the `bar` prop is gone); its behaviour moved
  from `HomeMotion` to `SiteMotion`, unchanged: up once the opening's button has scrolled
  away, down while the closing call (or the footer below it) is on screen, and
  `data-hero-gone` on `<html>`. The existing `site.css` rules then hold on every page: while
  the opening's button is on screen the header's is its outlined twin; while the bar is up the
  header's is hidden. One Volt button on screen at a time.
- On phones (≤ 30rem) the button is the column's width, as the homepage's; the opening's gaps
  around it are a little tighter (head gap 1.25rem, demo 1.75rem above) so the demo's first
  message still starts in the first screen.
- New, on every page including the homepage: with reduced motion the bar appears and goes
  without sliding (`transition: none`).
- `alyr-site-page` now names the button in the opening's row and has a row for the phone's
  bar, so a new product page gets both.

Checked (built `out-site`, served compressed; `C:\t\btn\probe.log`, `axe.log`):
- Behaviour, all 14 pages, at 390 and 320 (light), 390 dark with reduced motion, and 1440: at
  the top the bar is down and the header's button is the twin; past the opening's button the
  bar is up and the header's hidden; with the closing call 8 px into the screen, at the
  closing call and at the end the bar is down; back at the top, down again with the twin. At
  1440 the bar is not displayed and the header's button turns Volt once the opening's has
  gone. With reduced motion the bar's transition is 0 s.
- Size: the bar is 69 px tall with its padding (plus the safe-area inset on a phone that has
  one), its button 350 × 48 at 390 and 280 × 48 at 320, inside the screen, words not cut, in
  both languages; the opening's button 48 px tall on phones, 52 at 1440.
- 320 px, both languages, all 14 pages: `scrollWidth` 320; nothing past the edge except the
  homepage's business tabs inside their own sideways row (as before).
- The demo's first message at 390 × 844, reduced motion (before → after, by the button's
  height and gap): English 696 → 744 px from the top (`/chat` 708, `/docs` 781), Arabic about
  740 → 788. It still starts in the first screen; in Arabic about 56 px of it shows. `/agent`'s
  dashboard was already below the first screen on phones.
- No scripts (390, all 14): the opening's button is there with its words; the bar stays
  hidden; the header's button is the twin (as on the homepage without scripts).
- axe-core: all 14 pages, light at 1440 and dark at 390, after a full scroll: 0 violations of
  any impact. The opening's button, the bar (up) and the header, in light and dark at 390 on
  all 14 pages: 0 violations.
- Lighthouse 12 mobile, simulated throttling, `/bookings`, three runs: 98 / 100 / 100 / 100,
  98 / 100 / 100 / 100, 97 / 100 / 100 / 100 (Performance / Accessibility / Best practices /
  SEO), LCP 2.3 s, CLS 0, TBT 70 to 130 ms.
- `pnpm lint` clean; `pnpm exec tsc --noEmit` clean; `pnpm build` passes; `bash
  scripts/build-site.sh` passes (156 files); `node scripts/design-check.mjs`: 418 files clean,
  5 allowed exceptions.

Screenshots (not committed) in `docs/site-audit/shots/buttons/`: for each product page and
language, the first screen at 1440 and 390 in light and dark, the bar up at 390 in light and
dark (and with reduced motion), the closing call at 390 with the bar gone, the first screen
and the bar at 320; the homepage's bar at 390 for comparison.

Not checked: a real iPhone (the safe-area inset is read from the CSS, not seen on a notch) or
Android; Safari and Firefox; the WhatsApp and pending contact states (the button and bar
follow `ContactButton`, which hides in pending); the offer-on state; the keyboard path
through the opening, not walked; 1024 and 1280 spot
checks; `pnpm test`; motion timing of the bar's slide in a run without screenshots.

CI on e25a3f2 (run 40096959389): the `web` job stops at `pnpm audit --prod --audit-level high`
on new Next.js advisories (next 16.0.0 to 16.4.0, patched in 16.4.1; 1 high, 2 critical), so
CI's lint, test, types and build were skipped; they pass locally. Not caused by this change; the
Next.js upgrade is its own task. Also seen, not changed: at the closing call the header's
button is Volt beside the closing call's own (the bar is down there), on the homepage as on
every page.
