# Tokens

The one source is **`design/tokens.json`** (ALY-126, D-040; branch `aly-design-system` until
it merges), explained in **`design/README.md`**. Read both before you use a value. This page
is the map of names and when to use each; it holds no values on purpose. If a name here and
the file disagree, the file wins and this page is fixed in the same PR.

**State on 17 Oct 2026:** stage 1 of ALY-126 committed `tokens.json` and the README only. The
generator (`scripts/tokens-build.mjs`), the generated files and `design-check.mjs` come in
later stages. Until they land, the site's existing custom properties in `_site/site.css`
already carry most of these names (`--canvas`, `--text`, `--volt`, `--band`, `--dur-1` …):
use them, and add nothing to the product's old local blocks (`.sh`, `.cx`, `.ob`,
`globals.css`). Check `git log origin/main -- design/` to see what has merged.

## How to use them

| Where | How |
|---|---|
| CSS (site, product, Agent) | `var(--name)` from `apps/web/app/_tokens/tokens.css`, imported first by `_site/document.tsx` and `(product)/layout.tsx`. Never a hex, `rgb()` or font name in a stylesheet |
| TypeScript (`next/og`, inline SVG, `theme-color`) | `import { color, semantic, font, card, social } from "../_tokens/tokens"` |
| Python (report card, emails) | `from alyr import brand`, then `brand.CARD`, `brand.EMAIL`, `brand.FONT`, `brand.FONT_FILE`, `brand.LIGHT`, `brand.DARK` |
| A new value | Add it to `tokens.json` (with its dark value in `$extensions["qa.alyr"].dark` and a `$description`), run `node scripts/tokens-build.mjs`, commit the JSON and the generated files together |
| A check | `node scripts/design-check.mjs` (in CI and `scripts/check.sh`) fails on an out-of-date generated file, a colour literal outside them, or a font name in code. Exceptions in `design/allow.json`, each with its reason |

Use the **semantic** names in components. Primitives (`color.*`, the grey ramp named by
lightness, `grey-873`) are for the token file; the grey ramp is not emitted to CSS. The brand
names `--carbon`, `--volt`, `--volt-hover`, `--volt-pressed`, `--concrete`, `--graphite` are
emitted because the site names Volt as the action and Carbon as the band.

## Colour: semantic (light and dark switch by themselves)

| CSS name | Use | Never |
|---|---|---|
| `--canvas` | The page | |
| `--surface` | A sheet or panel on the canvas | A second canvas |
| `--surface-subtle` | A raised row, a well, a hover | |
| `--text` | Body and headings | |
| `--text-muted` | Secondary text, 4.5:1 in both themes | |
| `--text-faint` | Labels and metadata only (3:1) | A sentence |
| `--text-inverse` | Text on a fill of `--text` | |
| `--line` | Hairlines between items | Control borders |
| `--line-strong` | Controls, dashed slots, marks that must be seen (3:1) | |
| `--hair`, `--hair-strong` | Hairlines that take the colour under them | |
| `--focus` | Focus rings: moss on light, Volt on dark | Anything else |
| `--volt` (`--volt-hover`, `--volt-pressed`) | The four Volt meanings: main action, current state, confirmed progress, one signal | Text on light, a background, a numbered disc |
| `--on-volt` | Text and icons on Volt | |
| `--volt-ink` | Volt as text: dark green on light, Volt on dark | |
| `--volt-wash` | Pale Volt behind the current row | Decoration |
| `--pending` | The hollow dot for something not yet available | An error |
| `--white`, `--black` | A switch's knob, text on a status fill; masks and the darkest shadows | Surfaces |
| `--ok`, `--warn`, `--bad` and `-soft` | Status in product screens, always beside a word | The public site; the dashboard as alarms |

## Colour: components

| Group | CSS names | For |
|---|---|---|
| Band | `--band`, `--band-edge`, `--dark-canvas` (a well inside Carbon), `--dark-surface` (a panel inside Carbon), `--dark-subtle`, `--dark-line`, `--dark-text`, `--on-band`, `--on-band-soft`, `--on-band-quiet`, `--on-band-faint`, `--band-mark`, `--band-rule` | Carbon blocks: the band, the hero plate, the closing call, the product page opening; everything that sits on them. No more untokenised greys on Carbon |
| Window | `--window`, `--window-line`, `--mark-ring`, `--monogram-bg`, `--monogram-ink`, `--phone-frame`, `--phone-outline` | The drawn workspace window, numbered marks (Carbon discs, a Volt ring only in dark), shop monograms, drawn phones |
| Theme switch | `--night`, `--when-light`, `--when-dark` | The switch's glyphs, with no per-theme rules |
| Chat (`--wa-*`) | `--wa-head`, `--wa-paper`, `--wa-in`, `--wa-out`, `--wa-ink`, `--wa-soft`, `--wa-soft-out`, `--wa-link`, `--wa-tick`, `--wa-chip`, `--wa-rule`, `--wa-field`, `--wa-green`, … `--wa-brand` | Drawn WhatsApp chats only. WhatsApp's colours, never ALYR's; never with WhatsApp's logo; `--wa-brand` (its brand green) never on ALYR's own surfaces |
| Drawing (`--d-*`) | `--d-bg`, `--d-card`, `--d-raise`, `--d-ink`, `--d-ink-2`, `--d-ink-3`, `--d-wash`, `--d-chat`, `--d-out`, `--d-link`, `--d-bezel`, `--d-lift`, `--d-float`, `--grid` | Product screens drawn on the site. Due to move to the semantic surfaces (the tokens README) |
| Agent (`--agent-*`) | `--agent-bar-mix`, `--agent-ghost-mix`; the dashboard maps its `--ag-*` hooks onto the semantic tokens | ALYR Agent's bars and ghost bars |
| Card | `component.card.carbon.*`, `component.card.paper.*` (bg, ink, ink2, rule, bar, ghost, volt, edge, logo) | The report card, Python and TypeScript only |
| Email | `component.email.*` (bg, text, panel, muted, rule) | Emails, light only for now; Python only |
| Social | `component.social.*` (bg, ink, ink2, sep, volt) | The 1200 × 630 card, Carbon only |

## Type

| Tokens | Use |
|---|---|
| `--sans`, `--arabic`, `--mono` | Instrument Sans, IBM Plex Sans Arabic, IBM Plex Mono on the site (replaced by `next/font`'s variables) |
| `--font-ui`, `--font-ui-arabic` | Product screens and the Agent, in English and in Arabic |
| `font.family.email`, `font.family.email-mono` | Emails (not in CSS): clients do not load web fonts |
| `font.file.*` | The TTFs images are drawn with (OFL) |
| `--weight-regular` 400, `--weight-medium` 500, `--weight-semibold` 600 | Product, Agent, card: these three only |
| `--weight-body`, `--weight-strong`, `--weight-heading`, `--weight-display` | The site's in-between weights of the variable face |
| `--display`, `--h2`, `--h3`, `--fs-body`, `--fs-base`, `--fs-small`, `--fs-note`, `--fs-caption`, `--fs-label`, `--fs-micro` | The site's scale (fluid headings, rem steps); Arabic uses the same sizes |
| `--ui-micro` … `--ui-display` (`micro`, `caption`, `small`, `body-sm`, `body`, `input`, `title-sm`, `title`, `heading`, `heading-lg`, `display-sm`, `display`) | Product screens and the Agent; `--ui-input` (16 px) for inputs, so phones do not zoom |
| `font.size.card.min` | The report card's floor: nothing smaller on its 1080 canvas |
| `--leading-display`, `--leading-heading`, `--leading-body`, `--leading-ui`, `--leading-arabic-display`, `--leading-arabic-heading`, `--leading-arabic-body` | Line heights; Arabic always takes its own |
| `--tracking-label`, `--tracking-label-lg`, `--tracking-heading` | Latin only; Arabic is never tracked |

## Space, layout, shape

| Tokens | Use |
|---|---|
| `--space-1` … `--space-7` | 4, then 8 px steps up to the largest gap |
| `--gutter`, `--wide`, `--header`, `--col-gap`, `--sec`, `--rule-gap` | The 12-column page, the header height, section padding, the space under a section rule |
| `--radius-control` (buttons, focus rings), `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-phone`, `--radius-round` (dots) | Nearly square; the 45° cut, not a radius, is the brand's shape. No pills |
| `--rule-hairline`, `--rule-strong`, `--rule-dashed` | Solid true today, dashed coming (followed by `--line-strong` on the page, `--band-rule` on Carbon) |
| `--cut-notch`, `--cut-notch-sm`, `--cut-plate`, `--cut-plate-sm`, `--cut-fold-gap` | The button's corner, the plate's corner, the fold's gaps; mirrored in Arabic |
| `--menu-shadow`, `--window-shadow`, `--shadow-lift`, `--shadow-float` | The only shadows |
| `--z-below`, `--z-base`, `--z-raised`, `--z-product-bar`, `--z-header`, `--z-contact-bar`, `--z-skip-link` | The stacking scale |
| `--focus-width`, `--focus-offset`, `--focus-offset-control`, `--focus-on-band` | The ring: 2 px, off the element, Volt on Carbon |

**Breakpoints** cannot be custom properties in media queries: the list in `tokens.json`
(`phone-sm`, `phone`, `phone-lg`, `tablet`, `contact-bar`, `laptop`, `laptop-lg`, `desktop`,
`wide`) says which exist; write them as those numbers. The product's own breakpoints are not
on the scale yet: do not add more.

## Motion

| Tokens | Use |
|---|---|
| `--dur-1` … `--dur-4`, `--stagger` | The interaction scale: hovers, presses, menus, the theme switch, product screens |
| `--pace` | The one setting for every timed piece (1.3 since 26 Oct 2026; lower is quicker). Multiplies everything in the rows below except `--dwell-min` |
| `--play-1` … `--play-4`, `--play-stagger` | Every duration and delay inside a timed piece (flows, demos, signature figures, the products frame, reveals, heading splits); `PLAY` in `_site/pace.ts` for scripts |
| `--read-word`, `--dwell-beat`, `--dwell-min` | How long a flow's step or a demo's tab stays up, and how long a looping figure holds its finished state (`--loop-hold`, loopStyle.ts): its `--words` times `--read-word` (230 a minute), plus the beat, never under the minimum (which the pace does not change) |
| `--live-beat`, `--live-beat-phone` | The live Agent figure's beat, one product event every 4 s (5 s on a phone) times the pace; `PLAY.beat` and `PLAY.beatPhone` in `_site/pace.ts` |
| `--ease` | Things arriving (GSAP `expo.out`) |
| `--spring` | Things the visitor presses |
| `--travel`, `--dir` | How far along 45°, and the inline direction (−1 in Arabic) |
| `--fast`, `--medium`, `--slow` | The site's older scale: fold into `--dur-*` when you touch a page; never in new code |
| `--ease-product`, `--spring-product` | The product's curves until its screens move to `--ease` and `--spring`; never in new code |

## Not decided yet (from the README)

The notch on product buttons and their four systems; moving the drawn screens to the
semantic surfaces; product breakpoints and z-index. Ask before changing any of them.
