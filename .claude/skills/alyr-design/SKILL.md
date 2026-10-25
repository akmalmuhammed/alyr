---
name: alyr-design
description: ALYR's design system, the rules for anything that carries the ALYR brand. Load it before you make or change anything a visitor, an owner, a shop's staff or a shop's customer sees or receives, in English or Arabic. That covers public site pages and sections (apps/web/app/_site, (site), (site-ar)), workspace, back office and customer-page screens (apps/web/app/(product), _agent), CSS, colours, type, spacing, icons, motion, light and dark, RTL, copy in copy.ts or a T = {en, ar} object, WhatsApp messages and Meta templates, emails, the report card and social cards, QR cards, invoices, leave-behinds, slides and social posts. Also load it to answer "is this on brand?" or "can we say this?". It routes you to the content skill for the medium (alyr-site-page, alyr-product-screen, alyr-whatsapp-message, alyr-email, alyr-generated-image, alyr-print, alyr-deck-and-social) and to alyr-design-review before anything ships.
---

# ALYR design system

The rules every agent follows when it makes anything with the ALYR brand on it. Read this
page whole; open the linked files when the task touches them. The content skill for your
medium adds what is specific to it. Then `alyr-design-review` checks the work.

**The brand is Carbon and Volt** (the founder, 17 Oct 2026, ALY-61; recorded as D-040 with the
tokens, ALY-126). The playbook's
look is retired: no cobalt, no colour per product, no lowercase "alyr", no rounded "a" mark,
no Bricolage Grotesque or Geist, no pill buttons or 22 px card radii. The playbook's
*voice* still applies (D-025), except the promises listed as retired in
[honesty.md](honesty.md).

`docs/brand.md` tells the story and records why. This skill holds the rules. Where they
differ, the newer decision in `docs/decisions.md` wins; say so in your PR and fix the other.

## 0. Before you start

1. Read `docs/status.md`, your lane brief, and the Linear issue.
2. Pick the content skill for the medium (table below) and read it too.
3. Read the tokens: `design/tokens.json` and its README ([tokens.md](tokens.md)).
4. Read the claims you will make against `docs/status.md` today, not against old docs
   ([honesty.md](honesty.md)).
5. If the work is bigger than one small change, follow `alyr-design-review` from step 1:
   research, truth, founder decisions, brief, build, critics, rulings, fix, verify.

| You are making | Load |
|---|---|
| A public page, section, menu, product page, the header or footer | `alyr-site-page` |
| A workspace (`/app`), back office (`/ops`), sign-in, onboarding (`/start`) or customer page (`/s`, `/b`, `/pay`, `/t`) screen, or the ALYR Agent dashboard | `alyr-product-screen` |
| A WhatsApp reply, a template, a reminder, the report card's caption | `alyr-whatsapp-message` |
| An email ALYR sends | `alyr-email` |
| An image drawn by code: report card, social card, share image | `alyr-generated-image` |
| A QR card, counter card, table tent, sticker, invoice, receipt, leave-behind | `alyr-print` |
| Slides, a social post, a reel cover, a carousel | `alyr-deck-and-social` |
| A review of any of the above, or the full build cycle | `alyr-design-review` |

**Order of authority.** The hard rules in `CLAUDE.md`, then the founder's decisions (the
`00-founder-decisions.md` of the work, then `docs/decisions.md`), then the work's brief, then
this skill, then the content skill, then your own taste.

## 1. Principles

**Precision industrial minimalism.** A working drawing of an owner's business, made by an
engineer who respects the owner's time: a light canvas, a visible 12-column grid, hairline
rules, a small "Sample" mark in each drawing's own chrome, and the product's real screens at true scale in its real
words. Nothing is decoration; even the honesty labels are design. Light first; Carbon for
command moments (the band, the plate, the closing call). Rules and whitespace before cards;
asymmetry over centring.

1. **Volt only where something is true or done.** It means one of four things: the main
   action, the current state, confirmed progress, or one strategic signal. Never body text
   on a light surface, never a background for decoration, never a number disc, never a chart
   fill except the one signal (today's mark, the busiest day), never a pulse.
2. **One Volt button per view.** The page's main action is the Volt button; every other
   action is the outlined twin, a link or a quiet button. When a sticky bar's Volt button is
   up, the header's hides. A drawn button that cannot be pressed is an outline, not Volt.
3. **Solid rule means true today; dashed means coming.** A dashed rule with the hollow
   pending dot is a slot waiting to become true. Never draw something that is not built on
   a solid rule, and never show a "coming" item at go-live (D-039, ALY-113): the dashed
   language is for a slot, not for a promise.
4. **The 45° fold and the cut corner.** The Command Fold's diagonal (top inline-end to
   bottom inline-start, 45°) is the one gesture: the cut corner on the Volt button's notch,
   its outlined twin, the hero plate, drawn phones, the agreement and the shop monogram; the
   fold's three planes with the symbol's gaps at the entry to a Carbon band and the closing
   call; motion that arrives along the diagonal. Every cut is mirrored in Arabic, because
   `clip-path` does not flip. Rounded panels and pills are not ALYR.
5. **The "Sample" mark** (founder, 24 Oct 2026, `docs/site-audit/00-decisions.md`). Every
   drawing of a product screen is marked as a sample once, in its own chrome: beside the
   shop's name in the window's title bar ("Qirfa Bakery · SAMPLE / Home"), "Sample business"
   under the name in a drawn phone's header, or at the end of a figure's tab row
   (`SampleMark`, «مثال»). It travels with a screenshot. A figure with the sample switch is
   marked by the switch's label. A caption ("what it shows · Sample", no FIG number) stays
   only where the drawing means nothing without its words (the trust pair, the no-CR foot).
   For machines, the figure's first line says it is a fictional business whose numbers are
   not ALYR's results ([honesty.md](honesty.md) §4). Never "sample" twice for one drawing.
   Arabic writes its own words, no capitals, no tracking.
6. **The product is the illustration.** Real screens, real wording, one fictional business
   per figure set. No people, stock photos, skylines, dhows, coffee pots, arabesque, 3D
   phones, glass, glow, gradients, bento icon grids, logo walls, ratings or emoji.
7. **Tokens only.** No colour, size, radius, shadow, duration or ease literal outside the
   generated token files ([tokens.md](tokens.md)). If you need a value that is not a token,
   stop and add the token, in both themes.
8. **Words live in copy files, in both languages.** Components hold no text: `copy.ts` for
   the site, a copy file or `T = {en, ar}` per screen in the product, whole templates in
   the API. Arabic is written, not translated ([arabic.md](arabic.md)).
9. **Honest by construction.** Nothing a customer sees claims what is not true today, and
   nothing says or implies AI ([honesty.md](honesty.md)).
10. **Plays once.** Motion arrives, settles and confirms; it never loops, and with reduced
    motion only the end state shows ([motion.md](motion.md)).

## 2. Tokens

The single source is `design/tokens.json` (W3C design-tokens format), with its README.
Generated files are the only places values appear; each says "generated, do not edit". Use
the semantic tier, never a primitive, in components. Full list and usage:
[tokens.md](tokens.md).

- **Colour, semantic:** `--canvas`, `--surface`, `--surface-subtle`, `--text`,
  `--text-muted`, `--text-faint` (labels only), `--line`, `--line-strong`, `--hair`,
  `--focus`, `--volt` (with `--on-volt`, `--volt-ink`, `--volt-wash`), `--pending`, and
  `--ok`, `--warn`, `--bad` for the product only.
- **Colour, components:** `--band` and the `--on-band-*` ramp for Carbon blocks, `--window`,
  `--mark-ring`, `--monogram-*`; `--wa-*` (WhatsApp's own colours, drawings of WhatsApp
  only); `--d-*` (drawn product screens); `component.card`, `component.email`,
  `component.social` for the API and images.
- **Dark mode is the same system turned down, from tokens.** A component never has a dark
  rule of its own. If it needs a colour that changes, add a token with both values.
- **Contrast is a property of the token.** Its description states its bar (`--text-muted`
  4.5:1, `--text-faint` and `--line-strong` 3:1); keep it when you change a value, and measure
  it in both themes (the drift check does not test contrast). Never pick a near-black by eye:
  dark surfaces step on the ramp.

## 3. Type, spacing and the grid

- **Families:** Instrument Sans for Latin (with its width axis on the site), IBM Plex Sans
  Arabic for Arabic, IBM Plex Mono for small labels, rule lines and identifiers. Figures are
  Instrument Sans with tabular digits, not mono. Arabic mono labels switch to Plex Sans Arabic.
- **Scale:** the site's `--display`, `--h2`, `--h3`, `--fs-*` steps and the product's
  `--ui-*` steps (`--ui-input` for inputs). Use a step; never a one-off size or a half-pixel.
  Generated images have their own floor (`font.size.card.min`, `alyr-generated-image`).
- **Weights:** `--weight-regular`, `--weight-medium`, `--weight-semibold` (400, 500, 600) in
  the product, the Agent and images; the site's in-between weights from `--weight-*`. No 700.
- **Latin labels** in mono capitals, tracked by the token. **Arabic is never tracked, never in
  capitals, never italic, never with kashida**, and takes the looser line heights.
- **Spacing:** `--space-1` to `--space-7` (4, then 8 px steps); sections `--sec`, and
  `--rule-gap` under a section rule.
- **Grid:** 12 columns (`--col-gap`) up to `--wide`, inside `--gutter`; logical start and end;
  4 columns on phones; at least 16 px side gutter. Breakpoints only from the tokens' list
  (media queries cannot read custom properties, so write the listed numbers); do not add one
  for one component unless it is a container query on that component.
- **Line breaks are written, not hoped for:** name heading breaks in copy (`lines()`), keep a
  count and its noun together with a no-break space, and balance captions.

## 4. Components

Use what exists before drawing anything new; the catalogue with paths, when to use each
and what not to do is [components.md](components.md). The ones every page uses: the
Logo and Symbol (`_site/brand.tsx`, never retyped, never under 140 px wide, the symbol
below that), the Volt button and its outlined twin, the link with arrow, the signal mark,
the pending dot and status line, the "Sample" mark, section rules with crosses, the fold, the
Carbon plate, the drawn phone and workspace window, the ALYR Agent dashboard
(`_agent/AgentDashboard.tsx`, the one component shared by site and product).

Icons are drawn on the 24 px grid in one line (1.7 px, square ends, mitred corners). A
direction arrow flips in RTL (`.ico-flip`); ▲▼, the logo and clocks never mirror. Unicode
arrows and "×" in text do not flip: use the icon.

## 5. Motion

Tokens for every duration, ease, stagger and travel; every timed piece (flows, demos, figures,
reveals) on the pace, `--play-*` times `--pace`, the one setting, with a step staying up for its
words; one gesture (arrive along 45°, settle, one Volt signal). Plays once. Reduced motion shows every end state; nothing travels or
plays by itself. **Nothing is hidden in the HTML:** start states exist only under the
`motion` class that the head script adds when motion is wanted, with a failsafe that removes
it; without scripts the page is complete. Animate transform, opacity, clip-path and font
variation only. Never re-animate on a poll. Details and the figures allowed to keep
moving: [motion.md](motion.md).

## 6. Light and dark; RTL

- **Every surface has both themes**: site pages, product screens, the dashboard, generated
  images (Carbon and Paper), email where the client allows. Light is the first impression.
- On the site the theme follows the device until the visitor uses the switch
  (`data-theme` on `<html>`, applied before the first paint). Dark values live in two
  identical blocks, written by the token generator. With the tokens (ALY-126) the product
  layout reads the same stored choice (`alyr-theme`), so a visitor who picks a theme keeps it
  after signing in; until that lands, product screens follow the device.
- **Logical CSS only:** `margin-inline`, `padding-inline`, `inset-inline-start`,
  `border-inline-start`, `text-align: start`. Override under `[dir="rtl"]` only what a
  logical property cannot mirror: `clip-path`, transforms, gradients, masks,
  `transform-origin`, the 45° travel (`--dir`). One RTL selector, `[dir="rtl"]`, never
  `:dir()`, `[lang="ar"]` or `:lang(ar)` for layout: they have different specificity.
- Time runs right to left in Arabic charts (week bars, hour grids, age bars); tick labels and
  number ranges stay LTR inside `<bdi>`.

## 7. Arabic

Full rules and the term list: [arabic.md](arabic.md). The ones that break most often:
- **Modern Standard Arabic** on the site, screens, messages, documents. Gulf only in the
  owner's own voice (the WhatsApp prefill) and in social posts where the brief says so.
- **Currency is the amount, then «ر.ق»**, Western digits, in `<bdi>`: «449 ر.ق». No "QAR" on
  an Arabic page. English is "QAR 449".
- **Western digits** for money, times, counts and dates, everywhere.
- **`<bdi>`** around money, order numbers, "ALYR", product names, Latin runs and number ranges.
- **Agreement through `counted()` and `agree()`**, whole templates per language, never
  fragments joined; no count after a preposition.
- **ALYR is feminine** («تجهّز ALYR»); **every product is masculine** («يعمل ALYR Bookings»).
- **Product names stay Latin**, case kept, never broken across lines, each with its Arabic
  descriptor; "Agent" is never translated (not «وكيل», not «مساعد»).
- **Never split Arabic into characters** (SplitText, per-letter animation, letter spacing).
- **`next/og` cannot shape Arabic.** Arabic images are drawn with resvg and RTL embeddings.

## 8. Accessibility

- **AA contrast in both themes:** 4.5:1 for text, 3:1 for large text and for controls and
  their states. axe skips text under CSS filters, so scan those directly.
- **Focus** is visible on every control, from the focus token (a Volt ring on Carbon), with
  room inside the ring. Never remove an outline without a replacement.
- **Targets at least 44 × 44 px** on phones, including steppers, icon buttons, header links
  and menu rows.
- **Headings** run in order with no skips and one `h1` per page; a component placed in a page
  takes its heading level from the host (the Agent's `headingLevel`).
- **Inert figures:** a drawing that repeats a real screen is out of the tab order (`inert`)
  and its parts are not links; a scroller with nothing to focus is not a scroller. Give
  charts a sentence for screen readers inside the element, and say "up" or "down" beside
  ▲▼.
- Every `aria-label`, alt text and live-region message is in the copy file, in both
  languages. Motion over 5 s needs a pause control (WCAG 2.2.2), or it must end sooner.
- No horizontal scroll at 320 px, in either language.

## 9. Honesty

Full list, the claims table and the names register: [honesty.md](honesty.md).
- **No AI words** until a model is in the product (D-012, D-035): AI, smart, intelligence,
  learns, understands, thinks, predicts, forecast, knows, notices, "I noticed", reads (as in
  understanding), assistant, agentic, health score, top performer, business intelligence;
  no sparkles, shimmer, typing dots, "thinking…", avatars or first person. Say what was
  counted or compared, in plain words; the product shows its rule line, the public site never
  says "rule" (founder, 25 Oct 2026; [honesty.md](honesty.md) §1). "Agent" never carries a
  sentence alone.
- **Every sample is marked** as a fictional business, once: the "Sample" mark in its chrome
  for the eye, its first line for screen readers and crawlers.
- **Fictional names only, checked against real businesses** in the trade and the region
  before use, with the date of the check in the register.
- **Prices only behind the offer switch** (`NEXT_PUBLIC_ALYR_OFFER=on`, D-034) until the CR.
- **Must not claim** anything in the table in honesty.md: live on WhatsApp, card payments
  live, keep your number, free messages, the Sunday report as running, hosted in Qatar, a
  local team, registered, response times, clinics.
- **No invented metrics, customers, logos, testimonials or ratings.** Percentages only when
  both periods count 20 or more. Dates fall on their real weekdays.
- **Never imply WhatsApp or Meta affiliation:** no WhatsApp logo, no WhatsApp green on
  ALYR's own surfaces, never "partner"; the disclaimer is on every page.

## 10. Verify

Every change is looked at, not assumed. The matrix, the tools and how to run them on this
laptop or in a cloud session: [verify.md](verify.md). The minimum for any visible change:
both languages, both themes, 1440 and 390 (and 320 for anything with a layout), reduced
motion, no scripts, every menu open; lint, types, build; axe; the claims pass. Lighthouse
for site pages. Screenshots go to the founder; nothing is published without his yes.

## 11. The recurring failures, as rules

Each of these happened at least twice. Treat them as hard rules.

1. **CSS specificity against components.** A container never styles a bare `a`, `li`, `p`,
   `ul` or `h3`. Components carry their own scope class; resets go in `:where()`
   (`:where(.ag) :where(ul,ol)`), so they weigh nothing. A page rule stops at a component
   (`:not(.ag h3)`). No site drawing borrows a component's class prefix (`ag-` is the
   Agent's). One RTL selector. After any shared change, open every menu and compare the
   component element by element with its own page (`/agent-sample`).
2. **Types CI can't see.** CI runs `tsc --noEmit` before `next build`, without the
   `next-env.d.ts` a dev server writes. A new asset type (images, fonts) gets a committed
   `.d.ts` beside it (`_site/report/images.d.ts`). Run `pnpm exec tsc --noEmit` in a clean
   checkout before you push, and watch CI to the end.
3. **Truncated Arabic.** Arabic joined text is narrower than its isolated letters and
   wider than English after translation. Never measure Arabic as letters; never let a line
   end in "…"; never fix a box's width around Arabic. Test the longest string in both
   languages at the smallest size (320 px, a phone-sized image), and keep a test that fails
   on an ellipsis.
4. **Claims creep in, every round.** A builder writing under pressure turns "built" into
   "live" and "designed" into "done". Read every customer-facing line against the claims
   table and `docs/status.md` before review, again at the fix pass, and again before
   publishing, including alt text, meta descriptions and social cards.
5. **One sentence claiming two things.** A sentence that joins a true clause and a
   conditional one makes both read as true ("Right in your WhatsApp, it replies… and tells
   you what needs you": the second half happens on a screen). Split it, put each place and
   condition beside its own verb, and check each verb against the product's code, not the
   docs.
6. **320 px overflow.** Grid tracks sized to content push the page wide. Use
   `minmax(0, 1fr)` and `min-width: 0`; probe `scrollWidth` at 320 in both languages.
7. **Dark contrast by eye.** Two near-blacks a step apart read as one (1.05:1). Use the ramp's
   stated steps and give a Carbon block a hairline where it meets the page.
8. **Capture artefacts taken for bugs.** Always pass the colour scheme to the capture
   script (the laptop is in dark mode), lay out `content-visibility` sections before axe or
   a full-page shot, and read motion timing in a run with no screenshots.

## 12. Stop and ask the founder

Write exactly what is needed, label the Linear issue "Needs Akmal", and do not build
around it, when the work needs:
- a new promise, price, offer, product, page for a product that is not built, or a change
  to what is "coming" (D-039);
- a new colour, typeface, logo change, product mark, or a second accent;
- a new sample business name you could not check by hand (Instagram, Maps, the trademark
  register are his to check);
- Arabic signed off (ALY-66 is a native reviewer, not an agent);
- anything published, posted, printed or sent to a real person.

Never redraw, retype, recolour or stretch the logo; never merge
`codex/alyr-native-foundation`; never publish without the founder's yes each time.
