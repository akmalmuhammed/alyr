# ALYR design system, step 0: audit of what exists

Written 17 Oct 2026 on branch `aly-design-system` (from `main` at `020187b`). This step is read-only: no code was changed. It inventories everything ALYR has built that a visitor, an owner or a customer sees, as the base for one design system that every page, screen and asset follows, enforced by Claude Code skills.

Paths are relative to `apps/web/app/` unless they start with `apps/`, `docs/`, `scripts/` or `.claude/`. `file:line` refers to the commit above.

**Before any of this is codified:** ALY-61 (Carbon and Volt, or the playbook's cobalt) is still open and labelled Needs Akmal, and D-025 is still "Proposed". Everything built uses Carbon and Volt, and this audit assumes it. The lane brief says no new branded material until that is decided. Writing the tokens file and the skills is new branded material in that sense, so step 1 needs the founder to close ALY-61 first (section 6.4).

---

## 1. Tokens in use

### 1.1 Where tokens are defined today

There is no tokens source in the repo. `site.css:2` says its tokens come from `06_UI_UX_System/Design_Tokens/tokens.css` on the branch `codex/alyr-native-foundation`, which must never be merged (`docs/brand.md` "Where the source is"). Values were copied by hand into eleven places:

| # | Where | Scope | Dark mode | Reads `data-theme`? |
|---|---|---|---|---|
| 1 | `_site/site.css:7-105`, dark `:113-165` and `:167-213` | public site | yes, two blocks | yes |
| 2 | `_site/drawings.css:8-27`, dark `:31-50`, `:52-69` | drawn product screens on the site (`--d-*`), "copy the product's own" | yes | yes |
| 3 | `_site/kit.css:8-14` (`main`) | type scale and section rhythm | n/a | n/a |
| 4 | `_site/home.css:15-19` | homepage grid | yes | yes |
| 5 | `_agent/agent.css:11-38`, dark `:42-59` | ALYR Agent dashboard (`--ag-*`) | yes, wrapped in `:where()` | yes |
| 6 | `globals.css:1-24`, dark `:26-50` | product, old screens | `prefers-color-scheme` only | **no** |
| 7 | `(product)/_workspace/shell.css:6-33`, dark `:34-49` | workspace and ops (`.sh`) | media query only | **no** |
| 8 | `(product)/_customer/customer.css:6-38`, dark `:39-59` | customer pages `/s /b /pay /t` (`.cx`) | media query only | **no** |
| 9 | `(product)/start/start.css:5-38`, dark `:39-59` | onboarding (`.ob`) | media query only | **no** |
| 10 | `apps/api/src/alyr/modules/agent/card.py:45-54` (`THEMES`) | Sunday report card | carbon and paper themes | n/a |
| 11 | `apps/api/src/alyr/core/mail.py:67-75`, `modules/report.py:339-352` | sign-in and report emails | none | n/a |

There are also literals in TSX: `_site/brand.tsx:9` (VOLT), `_site/socialCard.tsx:30-31,42,82`, `_site/document.tsx:32` (theme-color pair), `icon.svg`, `app/[[...section]]/page.tsx:156,434`, `ops/Shell.tsx:52`, `_customer/Frame.tsx:37` and `agent-sample/page.tsx:50`.

### 1.2 Colour: the brand palette and every name it goes by

| Value | Brand name | Site | Drawings | Agent | Product (globals / .sh / .cx / .ob) | Python and TSX |
|---|---|---|---|---|---|---|
| #15171a | Carbon | `--carbon` :9, `--text` :19; dark `--surface` :118, dark `--dark-canvas` :135 | `--d-ink` | `--ag-ink` :13 | `--fg`, `--accent` (globals :8,10); `--ink` (.sh :12); hard-coded at shell :241, customer :68,177, start :126,179,244,268,287 | card `bg` (carbon), `ink` (paper); mail.py text; `brand.tsx`, `icon.svg`, `socialCard.tsx` as `#15171A` |
| #b7f34a | Volt | `--volt` :10 | (uses `--volt`) | `--ag-volt` :22 | `--action` (globals :13); `--volt` (.sh :15); literals in 4 TSX files | card `volt`; `brand.tsx:9`; `socialCard.tsx:30` |
| #a5e238 / #8fc42d | Volt hover / pressed | `--volt-hover` :11, `--volt-pressed` :12 | | | **#c4f865** as hover at start.css:127 (lighter, not darker) | |
| #151a0f | text on Volt | `--on-volt` :30; literal :606 | | `--ag-on-volt` | `--action-fg`, `--on-volt` (.cx); literal shell :130,174,225 | |
| #f6f7f3 | Paper | `--canvas` :16 | | | `--bg` (globals :4); `--raise` (.sh, .ob) | card paper `bg`; mail.py background; `document.tsx:32` |
| #eceee9 | (none) | | `--d-chat` | | **`--canvas`** (.sh :7): same name as the site's Paper, different colour | |
| #f2f3ef / #f7f8f5 | (none) | | `--d-bg`, `--d-raise` | | `--bg`, `--raise` (.cx :7,9) | |
| #ffffff | Surface | `--surface` :17, `--window` :33 | `--d-card` | | `--surface`, `--sheet`, `--card` | mail.py panel |
| #eef0ec | Surface subtle | `--surface-subtle` :18 | | | `--sunk`, `--accent-soft` (globals) | |
| #5f666d | Muted text | `--text-muted` :20; dark `--line-strong` :123 | `--d-ink-2` | `--ag-ink-2` | `--muted`, `--ink-2` | card paper `ink2`; mail.py muted; `socialCard.tsx:82` |
| #646a71 | (none) | | `--d-ink-3` | | | |
| #8a918b | Line strong / pending | `--line-strong` :24, `--pending` :29 | | `--ag-ink-3` :15 | | |
| #8a9096 / #8a9199 | (none: near-copies of #8a918b) | literal :612,656,716,910,918 | dark `--d-ink-3` | | `--ink-3` (.sh :14) | |
| #d8dcd7 | Line | `--line` :21 | | | `--line` (globals :7) | |
| #dcdfda / #e3e6e1 | (none) | | | | | card paper `rule`; mail.py rule |
| #a7adb5 | Concrete | `--concrete` :13; dark `--text-muted` :121 | dark `--d-ink-2` | dark `--ag-ink-2` | dark `--muted`, `--ink-2` | card carbon `ink2`; `socialCard.tsx:31`; literal home.css:94, agentfig :57 |
| #2a2e33 | Graphite | `--graphite` :14; dark `--line` :122 | dark `--d-bezel` | | dark `--accent-soft` | |
| #f3f5f0 | Dark text | `--dark-text` :44; dark `--text` :120 | dark `--d-ink` | dark `--ag-ink` | dark `--fg`, `--ink`; literal customer :68 | card carbon `ink` |
| #6a9320 | Focus (light) | `--focus` :25 | | | not used: product focus is Carbon (globals :64) | |
| #3f6a0b | Volt ink | | `--d-volt-ink` | `--ag-volt-ink` | `--volt-ink` (.sh :16) | |
| #6f767e | | | | dark `--ag-ink-3` | dark `--ink-3` | |

**Dark surfaces: 13 near-black greys where the brand names three.**

| Value | Used as |
|---|---|
| #0a0b0d | drawings dark `--d-bg`; .sh/.cx/.ob dark canvas |
| #0e1012 | site dark `--canvas`; site light `--dark-canvas`; globals dark `--bg` |
| #131518 | drawings dark `--d-card`; .sh dark `--sheet` |
| #15171a | site dark `--surface` |
| #191c1f | site `--dark-surface`; globals dark `--surface` |
| #1a1d21 | drawings and .sh dark `--raise` |
| #1b1e22 | site dark `--surface-subtle` |
| #1d2024 | site dark `--band` |
| #202428 | site `--dark-subtle`; globals dark `--sunk` |
| #23272b | site dark `--dark-surface` |
| #262a2f | site dark `--window` |
| #2f3338 | card carbon `rule` |
| #32373c | site `--dark-line`; globals dark `--line` |

**Untokenised greys on Carbon blocks in the site:**

| Value | Where |
|---|---|
| #555d65 | `site.css:352,594,652,654,717,718,922,995` |
| #6b7480 | `site.css:925,943`, `home.css:79,84`, `agentfig.css:80,85`, `kit.css:105` |
| #c4c9cf | `agentfig.css:64` |
| #d5d9dd | `home.css:93` |
| #fff | about 25 places |
| #050505, #3a3f45 | phone bezel, `site.css:542` |

These are the Carbon-block text ramp, used everywhere and never named.

**Status colours** exist only in the product: `--ok` #2d7d46, `--warn` #a96400, `--bad` #b42318, each with a `-soft` tint and dark values (`globals.css:15-20,39-44`, copied into .cx). start.css adds `--danger` #b42318 / #ff8a80, which does the same job as `--bad` with a different dark value. ops.css falls back to `#fff4e5`. The brand has no status colours.

**The WhatsApp palette** appears three times with identical values: site `--wa-*` (`site.css:57-80`, dark `:142-164`), globals `--chat-bg`, `--bubble-*` (`:21-23`), and start `--wa-wall`, `--wa-them`, `--wa-me`, `--wa-head` (`:20-23`). Two values diverge: start's light `--wa-head` is #f0f2f5 against the site's #ffffff, and customer.css:89 uses WhatsApp's brand green #25d366, which the site rules out (`docs/site-redesign/03` claims table: "no WhatsApp logo or green").

**Volt-wash alpha:**

| Where | Light | Dark |
|---|---|---|
| site | .18 | .12 |
| .sh | .18 | .10 |
| .cx | .20 | .12 |
| .ob | .20 | .10 |
| drawings | .22 | .12 |

**Volt usage by rule** (`docs/brand.md` "Rules"): the main action, the current state, confirmed progress, one signal. The rules are followed on the site and in the Agent, where `agent.css:3-5` names exactly three Volt marks, and on the card (the busiest day's bar and the logo plane). In the product the rules break in two places. Volt is a pulse ring at `shell.css:104` and `customer.css:194`, and an infinite pulse at `start.css:238`. And the workspace `.sh .btn.primary` is Carbon while globals `.btn.primary` is Volt, so "primary" means two different things.

### 1.3 Type

**Families.** Instrument Sans, IBM Plex Sans Arabic and IBM Plex Mono everywhere, loaded three different ways:

| Consumer | How | Variables | Weights |
|---|---|---|---|
| Site, `document.tsx:12-26` | next/font | `--font-instrument` (with the `wdth` axis), `--font-plex-arabic`, `--font-plex-mono` | Arabic 400/600 (arabic+latin), Mono 500 |
| Product, `(product)/layout.tsx:6-8` | next/font | `--font-sans`, `--font-arabic`, `--font-mono` | Arabic 400/500/600 (arabic only), Mono 400/500 |
| Agent, `agent.css:25-27` | reads either set through fallbacks | | |
| Social card, `socialCard.tsx:16-18` | TTF files | | InstrumentSans-SemiBold, IBMPlexMono-Regular |
| Card, `card.py:34-43` | its own TTF copies in `apps/api/src/alyr/modules/agent/fonts/` | | 400/600, Mono 400 |
| Email, `mail.py:67-72` | **Arial and Courier New** | | |

Product fallbacks lack the site's "Aptos", "Segoe UI Variable" and "Cascadia Mono" (`site.css:82-84`). The product layout sets `<html lang="en">` for Arabic screens too (`(product)/layout.tsx:21`).

**Sizes:**

| Consumer | Scale |
|---|---|
| Site | Fluid and rem. `kit.css:9-11`: `--display` clamp(2.75rem,1.4rem+5vw,5.5rem), `--h2` clamp(2rem,1.3rem+2.6vw,3.25rem), `--h3` 1.375rem. `home.css:13`: body 1.0625rem; `site.css:222`: 1rem. Small steps .6875 / .75 / .8125 / .875 / .9375rem. Around 25 distinct values across the site files, including 7 one-off clamps in `site.css` and `.890625rem`. |
| Drawings | px, to match the product: 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 17, 22 (`drawings.css`) |
| Agent | the only written scale: 11 / 13 / 15 / 18 / 28 / 56px, with 24 and 20 as exceptions (`agent.css:7-9`) |
| Product | 24+ px sizes with half-pixel steps (10.5 to 42), no tokens; body 15px / 1.45 (`globals.css:58-59`) |
| Card | 31 minimum (≈9.5px on a phone), 32, 33, 44, 48, 132 (`card.py:28-32` and layout) |
| Social card | 22, 26, 56 to 88 computed (`socialCard.tsx:36`) |

**Weights.**

| Consumer | Weights |
|---|---|
| Site | 430 body (`site.css:224`), 500, 560, 600, 620, 640, 650, 700 (one) |
| Agent, product, card | 400 / 500 / 600 only |
| Email | 700 |

The Agent resets to 400 inside the site (`agentfig.css:10`).

**Line height.**
- Site: 15 distinct values from .86 to 1.8. Arabic is reset to 1.25 for display and 1.7 to 1.75 for body (`kit.css:20`, `home.css:14,46,53`).
- Agent: 1 / 1.25 / 1.3 / 1.4 / 1.45.
- Product: 15 values.

**Letter-spacing on mono labels.**
- Site: .09em at 12px (`.eyebrow` `site.css:247`, `.mono-k` `kit.css:23`), .08em at 11px (`.cap` `:705`).
- Agent: .08em at 11px.
- Product: .06 to .08em at 11px.
- Card: 1.6 units at 32.
- Social: 2px.

Arabic resets tracking to 0 and drops capitals in every consumer. The site does it in `site.css:262` and per class; the card in `card.py:201`.

### 1.4 Space, radius, rules, shadow

| Token | Defined | Duplicated or diverging |
|---|---|---|
| Rhythm | `docs/brand.md` extensions: 8, 16, 24, 40, 64, 104 px; sections `--sec` clamp(3.5rem,7vw,6rem) (`kit.css:13`) | Site CSS uses about 25 distinct spacing values (.1875, .3125, .4375, .5625, .9375rem among them) and none is a token. The Agent is on 4 and 8 with 56 between sections (`agent.css:9`). Product spacing is all literal px. Card margin 56, gutter 24. |
| Layout | `--gutter` clamp(1.25rem,4vw,3rem), `--wide` 80rem, `--header` 4.5rem (`site.css:102-104`); 12 columns with `--col-gap` 1.5rem (`kit.css:12`) | Product has no layout tokens. |
| Radius | Site controls 2px (`.btn` `site.css:278`); panels .5rem / .75rem; phone 1.75rem / 34px; dots 50% | Agent: 2, 4, 8px. Product: globals 6 to 99px; shell 2 to 18 (14 values); customer 4 to 22 (11); start 4 to 999. Buttons: 6 / 9 / 15 / 999 against the site's 2. Email 16px. Card: no radius. |
| Rules | Solid means true today; dashed means a slot waiting to become true (`docs/brand.md`). Hairline 1px `--line`; the strong Agent rule is 1px `--ag-ink` (`agent.css:17`). Section rule with crosses (`kit.css:31-37`); `.rule-dashed` (`:39`). | Dashed colour varies: `--line-strong`, `--line` (`home.css:116`, `kit.css:122`), #6b7480 (`home.css:84`), #555d65 (`site.css:654,922`), `--ag-dash` 30% ink. Dash width 1px, but 1.5px at `home.css:194`. Product uses inset box-shadow rings instead of borders (21 times in shell.css). Card rules 2px. |
| Shadow | `--menu-shadow`, `--window-shadow` (`site.css:31,35`); `--d-lift`, `--d-float` (`drawings.css:23-24`) | `--lift` and `--float` in .sh, .cx and .ob with different offsets and alphas (shell :18-19; customer :24-25). Literal shadows: `agentfig.css:115`, `drawings.css:197`. |
| Cut and notch | `--notch` 12px / 9px on `.btn` (`site.css:275,282`); `--cut` 6rem / 3rem plate (`agentfig.css:98,123`; `site.css:487`); 34px phone (`drawings.css:74`); `--fold` (`site.css:683`) | The product uses the cut as decoration only (`shell.css:76-77,152-153`, `customer.css:70-71`). No product button is notched. |

### 1.5 Motion, breakpoints, z-index, focus

| Token | Defined | Duplicated or diverging |
|---|---|---|
| Ease | `--ease` cubic-bezier(.16,1,.3,1) (`site.css:86`); GSAP `expo.out` (`Choreography.tsx:20`); `--ag-ease` (same) | **`--ease` in `.sh` is cubic-bezier(.2,.8,.2,1)** (`shell.css:20`): same name, different curve. GSAP `power3.out` for the magnetic button (`Choreography.tsx:121`). |
| Spring | `--spring` `linear()` (`site.css:98`) | **`--spring` in `.sh` is cubic-bezier(.34,1.4,.64,1)** (`shell.css:21`). |
| Durations | `--dur-1..4` 120/240/480/720 (`site.css:93-96`), `--stagger` 60ms | **A second scale in the same file:** `--fast` 160, `--medium` 280, `--slow` 480 (`site.css:87-89`), still used 26 times. About 30 literal durations across site CSS (60ms to 6.5s); GSAP literals 0.72 / 0.48 / 0.06. Product: literal .15 to 1s; staggers 55ms (shell) and 60ms (customer). |
| Travel | `--travel` 12px, `--dir` ±1 (`site.css:99-100,106`) | The product does not use `--dir`; RTL motion is duplicated by hand. |
| Plays once | `docs/brand.md` Motion; `01-research` E7 "no endless pulses" | `.cx-status` (`customer.css:190`), `.ob-pulse` and `.ob-live` (`start.css:238,306`) pulse forever. `globals.css` has no reduced-motion rule. |
| Breakpoints | Site: 22.5, 24, 30, 47.99/48, 53, 61.99/62, 68, 74.99, 81.99rem; height 57.5rem | Agent: container queries at 48rem (`agent.css:318,345`). Product: 720 / 860 / 1100px (globals), 56rem (shell, ops), 40rem (customer), 640 / 1024 / 1280 / 1440px (start). Only 48rem is shared. |
| z-index | Site: -1, 1, 2, 15 (product bar), 20 (header), 30 (contact bar), 100 (skip link) | Product: 1, 4, 5, 10, 20, 21, 50. No scale. |
| Focus | `:focus-visible` 2px `--focus`, offset 2, radius 2 (`site.css:236`); buttons offset 3 (`:304`); Volt on Carbon header (`:353`) | Agent: 2px `--ag-ink`, radius 4 (`agent.css:70`). Product: 2px Carbon (`globals.css:64`), radius 6 or 8; inputs use a ring shadow `0 0 0 1px ink, 0 0 0 4px volt-wash` (`shell.css:224`) or `0 0 0 2px ink` (start). Three focus styles. |

### 1.6 RTL selectors

The code uses four ways of saying "Arabic":

| Selector | Where |
|---|---|
| `[dir="rtl"]` | 99 uses across site and product CSS |
| `:dir(rtl)` | 8, in `drawings.css` only |
| `[lang="ar"]` | 62 uses in the site |
| `:lang(ar)` | 15, in `drawings.css` |

The 08-site-log records a `[dir="rtl"]` shorthand outranking `li + li`, so the choice is not only cosmetic: the four selectors have different specificity.

---

## 2. Components and patterns

| Component | Files | When it is used |
|---|---|---|
| Logo, Symbol | `_site/brand.tsx:22,49` | Header and footer on the site; `/start` (`start/page.tsx:11`). The horizontal logo has a minimum width of 140px. |
| The mark's polygons, copied | `brand.tsx`, `icon.svg`, `socialCard.tsx:52-56`, `card.py:62-77` (LOGO_PLANES), `app/[[...section]]/page.tsx:156`, `ops/Shell.tsx:47`, `_customer/Frame.tsx:32` | Seven copies of one drawing. `mail.py:70` retypes "ALYR" in Arial 700 instead, which breaks "never retyped". |
| Interface icons | `brand.tsx:96` (24px grid, 1.7px stroke, square caps, mitred joins); `ThemeSwitch.tsx:15` (same line) | Site |
| Other icon sets | app `Icon` (`page.tsx:147`, 1.7); `OpsIcon` (`ops/Shell.tsx:39`, 1.7); `Glyph` (`Frame.tsx:17`, 2); start `Ico` (`page.tsx:65`, 1.8); Agent `Arrow`, `Chevron`, `Tick` (`AgentDashboard.tsx:94-117`, 1.5 and 2); `AgentFigure.tsx:99` (2); CSS-drawn ticks at 2.4 to 3 (`drawings.css:84,155,178,190`, `shell.css:174`, `customer.css:132,182,200`) | Five icon components, four stroke weights. The tick path is repeated in five files. Unicode arrows ("← All clients", `ops/Clients.tsx:177`) do not flip in RTL. |
| Volt button with the 45° notch; outlined twin | `.btn`, `.btn-volt`, `.btn-line`, `.btn-sm` (`site.css:270-318`); `ContactButton` (`Contact.tsx:24`) | One Volt button on screen at a time; the twin is a second way in further down a page. |
| Product buttons | `.btn` (`globals.css:74`), `.sh .btn` (`shell.css:125`), `.cx-btn` (`customer.css:159`), `.ob-btn` (`start.css:119`) | Four systems, no notch. |
| Link with arrow | `.link` (`site.css:317`) | |
| Signal mark | `.signal` (`site.css:268`), the logo's Volt plane | Before product names in eyebrows and the product bar. |
| Pending dot and status line | `.dot-pending`, `.status-line` (`site.css:327-333`); `ContactPending` (`Contact.tsx:56`) | Something not yet available. Never an error box. |
| Contact states | `Contact.tsx`, `site.ts:6-20`; duplicated helper `contactHref` (`Shell.tsx:15`) next to `contactLink` (`Contact.tsx:12`) | WhatsApp, then email, then pending. |
| Header | `.top` (`site.css:336-375`), `Shell.tsx` | Sticky, z 20; turns `--band` over Carbon sections (`[data-on-dark]`). |
| Products menu | `ProductsMenu` (`Shell.tsx:23`), `.pm` (`site.css:376-434`) | Native `<details>`, the suite in order; Payroll on a dashed rule with the pending dot. |
| Theme switch | `ThemeSwitch.tsx`, `.ts-*` (`site.css:435-459`), script in `document.tsx` | 44px icon in the header; a row in the phone menu. |
| Product bar | `ProductBar` (`ProductKit.tsx:20`), `kit.css:74` | Under the header on product pages; sticky, z 15. |
| Product page template | `ProductHero`, `FlowSection`, `ScreenBlock`, `InsideBlock`, `WhoBlock`, `WorksBlock`, `QuestionsBlock` (`ProductKit.tsx`) | `/chat`, `/bookings`, `/agent`, `/accounts`. |
| Tabbed demo | `ProductDemo.tsx`, `.demo-*` (`site.css:517-612`) | Product heroes. Plays only while on screen, can be paused. |
| How it works | `FlowDiagram.tsx`, `.fx-*` (`site.css:874-1017`) | Product pages. Allowed to keep moving. |
| Drawn WhatsApp chat | `.wa-*` (`site.css:535-676`), `ReportPhone.tsx` | `/chat` and the report. WhatsApp's own colours, no logo. |
| Phone frame | `Phone` (`Frames.tsx:9`), `.d-phone` (`drawings.css:73`), with a 45° cut | Customer pages drawn on the site. |
| Customer page chrome, twice | Site `CxTop` / `CxFoot` (`Frames.tsx:19,32`); product `Frame` (`_customer/Frame.tsx`) | The site redraws the product's frame by hand, with tokens copied into `drawings.css`. |
| Workspace window | `.aw-*` (`drawings.css:213-230`), `--window` | Workspace screens on the site. |
| Drawn workspace screens | `Sheets.tsx` (`BookingsScreen`, `CreditScreen`), `Drawings.tsx` (crops), `PageDrawings.tsx` | Product pages. Hand-drawn copies of `_workspace/Screens.tsx`. |
| FIG caption | `FigCaption` (`Drawings.tsx:19`), `.cap` (`site.css:703-719`) | Every drawing: "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY". |
| Numbered marks and callouts | `.co-n` (`kit.css:70`), `drawings.css:301-308` | Carbon discs; a Volt ring in dark. |
| Section rule with crosses; dashed rule | `.rule`, `.rule-dashed` (`kit.css:31-40`) | Above every section. |
| The fold | `.band-fold` (`site.css:678-701`) | Into the Carbon band and at the top of the closing call. |
| Carbon plate | `.af-plate` (`agentfig.css:90-136`), `.product-in` (`site.css:487-492`) | Hero figure; product page opening. |
| Closing call | `.cta`, `.cta-mark` (`site.css:640-660`) | Every page. |
| Sticky contact bar | `.bar` (`site.css:728-744`) | Phones under 53rem, after the hero's button has gone; hides the header's Volt button. |
| FAQ | `.qa` with `details` and `::details-content` (`kit.css:42-66`) | Questions on every page. |
| Agent feed, sample switch | `AgentFigure.tsx`, `agentfig.css:16-89`; `ReportSwitch.tsx` | Homepage hero, spotlight, `/agent`. |
| Agent dashboard | `AgentDashboard.tsx`, `agent.css`; samples in `_agent/samples/` | Workspace home (`app/[[...section]]/page.tsx:8`), the site (showcase mode), `/agent-sample`. **The only component shared by site and product.** |
| Dashboard blocks | header and summary; Needs you now; Done for you; the numbers (KPI strip); suggestions; week chart; busiest hours; top items; money by age; team; report line (`agent.css:90-312`) | Ruled sections, no tiles. Volt marks three things. |
| Charts | Agent week bars with a ghost bar for last week, hour tints, age bar (`agent.css:217-298`); `.agebar` (globals); `.tm-bar`, `.tm-meter` (Team) | Three chart vocabularies. |
| KPI and stat strips | `.ag-kpi-*`; `.sh-stat` (unused); `.ops-stats`; `.tm-stat`; `.hero-facts` (`home.css`); `.pk-facts` (`kit.css:98`) | |
| Report card | `card.py` (1080×566, carbon and paper); site `_site/report/*` (AVIF, WebP, PNG via `scripts/site-report-images.mjs`) | WhatsApp, the site, Meta's template sample. |
| Social card | `socialCard.tsx`, `opengraph-image.tsx`, `(site)/*/opengraph-image.tsx` | English only (`next/og` cannot set Arabic). |
| Setup checklist | `.sh-setup`, `.sh-gauge`, `.sh-steps` (`shell.css`; `page.tsx:388-406`); `.ob-checks` (`start/page.tsx:672`); `.cx-track` | Three step-list designs. |
| Workspace shell | `.sh-side`, `.sh-top`, `.sh-tabbar`, `.sh-palette` (`page.tsx:567-664`) | `/app`; reused by `/ops`. ops.css overrides shell.css by import order. |
| Tables, pills, inbox, forms | globals.css classes restyled under `.sh-main` (`shell.css:299-319`); inputs in 7 places | Working screens (`Screens.tsx`). |
| Duplicated helpers | `initials()` ×4, `qar` ×3, `Linked` ×2, switch ×2, chat bubble ×3, composer ×3, avatar ×4, empty state ×5 | See section 5. |
| Words helpers | `Text.tsx` (`lines`, `rich`), `.money`, `.ref`, `.pname` (`site.css:320-324`); Agent `Rich` | Keep amounts, references and names whole and in `<bdi>`. |

---

## 3. Content rules already decided

| Rule | Source |
|---|---|
| **Voice.** Sentence case, short, declarative, name the result. One idea a sentence, under 20 words, "you", the owner's outcome, numbers over adjectives. No "Learn more", "unlock", "supercharge", "Contact us for pricing". Links say what happens. | `docs/brand.md` Rules; playbook (`docs/site-redesign/_playbook-extract.txt` 123-171); `docs/agent-dashboard/10` P2-6 |
| **Who speaks.** ALYR is the agent; ALYR Agent is its screen. "Agent" never carries a sentence alone: the screen shows "RULE ·" or says "by rules you can check". The trust section speaks as ALYR, with no founder name or photo. | `docs/agent-dashboard/11-rulings` P0-1; `06-messaging` §1; D-034 |
| **No-AI words.** Until a model is in the product, nothing says or implies AI: AI, smart, learns, understands, thinks, intelligence, predicts, knows, notices, "I noticed", assistant, agentic, forecast, health score, top performer, business intelligence; no sparkles, shimmer, typing dots, "thinking…", avatars or first person. Write "By rule: …". This covers sample data and "Is it AI?" denials too. | D-012, D-035; `agent-dashboard/00`, `01-research` E1, `03-build-brief` §5, `06` §5; enforced only in API tests (`apps/api/tests/test_report_card.py:27,84`, `test_agent.py:127`, `test_agent_samples.py:100`) |
| **Playbook never-say and vocabulary.** Seamless, revolutionary, disrupt, synergy; no competitor names; nothing implying ALYR is WhatsApp or Meta. Say customers, orders, set up, your team, payment link. Arabic: تتبّع, إطلاق مبكر, غير حقيقي; avoid ديون, خوارزمية, وكيل, مساعد. | playbook 123-199; `06` §6.1 |
| **Honesty and captions.** No invented metrics, logos or testimonials. Every drawing has a FIG caption that says sample and fictional once. Percentages only when both weeks count 20 or more. No "paid through ALYR links". Dates fall on real weekdays. | `docs/brand.md`; `copy.ts:541,2404`; D-035, D-038; `site-redesign/03` C7 |
| **Must not claim.** Live on WhatsApp; Meta partner; card payments live; keep your number; free messages; the Sunday report as running ("once WhatsApp approves the report's wording"); 48 hours; free pilot; hosted in Qatar; a local team; registration; response times; the refund beyond that month's fee; written Arabic replies; clinics and health data. | `site-redesign/03` §3; `06` §5; `07`; `10`; `11-rulings`; D-025, D-037 |
| **Prices behind the offer switch.** `NEXT_PUBLIC_ALYR_OFFER=on` (`site.ts:21-26`) turns on the price section, hero price, money-back lines, price question and Price link; until then `factsNoOffer`, `descriptionNoOffer`, `nOffer`. From QAR 449, plus QAR 150 a product, Agent included. Open: setup QAR 1,500 on the site against 2,500 in the back office. | D-034, D-035; `copy.ts:884` |
| **Contact states.** WhatsApp, then email, then pending, at build time. Email: "Email us", "A person from ALYR replies." and the address, no response time. "Our WhatsApp line opens soon" once, in the questions. The WhatsApp prefill is in Gulf register on purpose. | `site.ts:6-20`; `Contact.tsx`; `copy.ts:518-530`; `site-redesign/08` P1-4; `07` P1-10 |
| **Arabic register.** Modern Standard Arabic everywhere except the owner's own prefill. The playbook allows Gulf Arabic on social and WhatsApp and formal MSA on contracts and invoices. | `08-rulings` P1-12; playbook 201-221 |
| **Currency.** Western digits, a space, then «ر.ق», in `<bdi>`; no "QAR" on `/ar`. API `money()` does this with a no-break space (`apps/api/src/alyr/modules/agent/words.py:51`). **But `fmt_qar` (`core/normalise.py:33`) writes "QAR 1,234" in both languages**, and the WhatsApp templates, ledger, reminders, workspace (`Screens.tsx:212`) and the site's drawings of them use it. | `07` P1-8; `06` §6 |
| **Digits.** Western for money and times everywhere. Exception found: `apps/api/src/alyr/modules/ledger/service.py:146` hard-codes «٩٠». | `05-build-log`; `03` C8 |
| **`<bdi>`.** Around money, order numbers, ALYR, runs of Latin words, number ranges. | `docs/brand.md` Smaller rules; `Text.tsx:3-13` |
| **Gender.** ALYR is feminine («تجهّز ALYR»); every product name is masculine singular. | `06` §6.1; `07` P1-10; `10` P1-8 |
| **Product names.** Latin in both languages, case kept, never broken (`.pname`), each with a plain Arabic descriptor; "Agent" never translated. | D-025, D-035; `apps/api/src/alyr/catalog.py:249-310` |
| **Agreement and plurals.** `counted()` handles Arabic 1, 2, 3-10 and 11+ (`apps/api/src/alyr/core/words.py:24`). `agree()` handles 1, 2 and 3+ for verbs and pronouns (`modules/agent/words.py:130`). Whole templates, never assembled fragments; no count after a preposition; «صباح كل يوم أحد». **Divergence:** `noun_after` (`words.py:63`) uses 2-10 where `counted` uses 3-10. | D-035; `06` §6.1; `07` P1-9 |
| **RTL marks.** Each WhatsApp Arabic line opens with U+200F; the card wraps lines in RLE…PDF; the site adds a mark after each bold run until the engine does. | D-038; `12-report-card-log` stages 1, 2, 5 |
| **Arabic type.** Never tracked or in capitals; display 1.25, body 1.7; no kashida; headings never split by character; every cut mirrored; ▲▼, logo and clocks not mirrored. | `docs/brand.md`; `04-brief` §7, §9 |
| **Fictional names only.** Qirfa Bakery / مخبز قرفة, Dafira Salon / صالون ضفيرة, Zilal Cooling / ظلال للتكييف, Aisha Hamad, Mariam Saleh, Khalid Nasser, Omar Ali, Al Noor Electricals. Renamed after collisions: Sadaf, Nasma, Ruwaa Dental, Al-Kuwari, Al-Emadi, Al-Naimi. Still to check by hand: Dafira, Zilal, Palm Court Offices, Bluefin Events, Ward Events, Tamr Café. | D-035, D-037; `10`; `08-site-log` open items |
| **Product order.** Chat, Bookings, Agent, Accounts, Payroll, everywhere (`site.ts:59`, `catalog.py`). **Conflict:** D-039 says nothing "coming" is shown at go-live (ALY-113), while `docs/brand.md` still specifies Payroll's coming row. | D-035, D-037, D-039 |
| **Words live in copy.** Every site word is in `copy.ts`; components hold none. The product has `start/copy.ts` only; elsewhere inline `T = {en, ar}` objects, and `/ops` and `/login` are English only. Nothing checks this. | `CLAUDE.md` Conventions; lane brief "Never" |

---

## 4. Processes that worked

### 4.1 The cycle

Run twice: the homepage (`docs/site-redesign/00` to `09`) and the suite (`docs/agent-dashboard/00` to `11`).

1. **Founder decisions** (`00`), written first and ranked above everything else.
2. **Research** (`01`): references, patterns, what to avoid.
3. **Product truth** (`site-redesign/03`): what is built, what is live, the claims table. This turned out to be the most valuable document, because every claim the critiques caught was checked against it.
4. **Messaging** (`02`, `06`): every line in both languages, with a rule for each choice.
5. **Brief** (`04`, `07`): order of authority, budgets, the check matrix.
6. **Build**, with a staged log (`05`, `08`).
7. **Two independent critiques**: design (`06`, `09`) and copy plus Arabic (`07`, `10`). Each uses P0, P1 and P2, ends with the five changes that would lift it most, and lists what was not checked.
8. **Rulings** by the creative director (`08`, `11`): apply, adapt or reject each finding, with a reason.
9. **Fix pass**, logged with what was not applied and why.

The dashboard had one critique (`05`). The report card had none: the founder reviewed it directly.

### 4.2 Checks run each time, and what each caught

| Check | How | Caught |
|---|---|---|
| Screenshots: every page × EN/AR × 1440/390 (and 320) × light/dark, plus reduced motion | `docs/site-redesign/baseline/shoot.mjs` (headless Edge over DevTools, no dependencies; `--scheme` must always be passed because the laptop is in dark mode) | Phone crops, the fold, dark band contrast, menu layout, the Products menu squeeze (by eye) |
| 320px overflow probe | `shoot.mjs --eval` reading `scrollWidth` | 347px English homepage; sample switch; status chip |
| axe-core 4.14, zero serious or critical | Injected by `C:\t\suite\snap.mjs` (outside the repo); `content-visibility` forced visible | Dim statement words, heading order, scrollable regions, the placeholder in the report phone |
| Direct contrast scan | A script over text under CSS filters | WhatsApp grey on sent bubbles |
| Lighthouse 12 mobile: Performance ≥ 90, Accessibility 100, CLS < 0.05, LCP < 2.5s, motion JS < 70KB | `C:\t\tools` against `out-site` behind a brotli server (`C:\t\fix\serve.mjs`); without compression LCP read 6.2s | Hero fade delaying LCP, leading to `scripts/site-defer-scripts.mjs` |
| Element-by-element comparison with `/agent-sample` | Computed styles | Site `h3` and `ag-` leaks into the dashboard |
| Claims table read against `docs/status.md` | Copy critique | Payments, the report, number keeping, the refund, clinics, the social card price with the offer off |
| Name search | By hand | Sadaf, Nasma, real family names |
| Build | `scripts/build-site.sh`: static export, deferred scripts, `_headers`, a grep for `127.0.0.1`, `/sim/` and `/api/ledger` | API addresses leaking into the static site |
| CI | `.github/workflows/ci.yml`: gitleaks, ruff, pytest, `pnpm lint`, `tsc --noEmit`, `pnpm build` | `next-env.d.ts` missing for image types |
| API tests | AI-words regex; minimum card type 31; no "…"; sample JSON matches the engine; RLM on every Arabic line | Arabic measured too wide (cut lines), ellipses |

axe, Lighthouse and the plan runner live outside the repo, under `C:\t\`. A cloud session cannot run them.

### 4.3 Recurring failures, as rules to write

| Failure | Where recorded | Rule for the system |
|---|---|---|
| A header rule (`.top-nav a`) overrode the Products menu cards on the live site | commit `a117e24` (PR #54), fix at `site.css:404` | Components carry their own scope class, and containers never style a bare `a`, `li` or `h3`. The Agent's `:where()` reset (`agent.css:61-68`) is the pattern. Every review captures every menu open. |
| `.ag ul` at (0,1,1) beat the component's margins; `[dir="rtl"]` outranked `li + li`; site `h3` leaked into `.ag` | `agent-dashboard/05` P0-3; `08-site-log` | One RTL selector (`[dir="rtl"]`, or logical properties); resets in `:where()`; a specificity budget of one class. |
| `next-env.d.ts` absent in CI, so image imports had no types | commit `abbaec0` (`_site/report/images.d.ts`) | Any new asset type gets a committed `.d.ts`; CI runs `tsc` before `build`, so test it that way locally. |
| `next/og` cannot order or space Arabic | `site-redesign/05` stage 1; `08-site-log` P1-8 | Arabic images are rendered with resvg and RTL embeddings, as the card does; never `next/og`. |
| Arabic lines cut short, bidi runs reversed ("Noor A.", "0–30", «4:30 م», bold Latin names) | `12-report-card-log` stage 4; `08-site-log`; `05` stage 2 | Measure Arabic as joined (0.86); a test for no ellipsis and a minimum size; `<bdi>` and marks for every Latin run, number and range. |
| Claims creeping in, every round | `07` P0-1 to P0-3; `10` P0-1, P1-2, P1-5; `08-site-log` | Every customer-facing line is checked against the claims table before review. The table becomes a skill reference, checked each time against `docs/status.md`. |
| Dark contrast at 1.05:1 (band, window on the plate) | `06` P1-8; `09` P2-8 | Dark surfaces come from the ramp with a stated contrast step; never pick a near-black by eye. |
| 320px overflow, three times | `06` P0-1; `08` stage 7; `09` P1-4, P1-6 | 320 is in the matrix, with an automated `scrollWidth` probe. |
| The failsafe killed motion; capture artefacts were mistaken for bugs | `06` P2-10; `09` P1-3; `05` stage 7 | Document the capture method in the review skill; always pass the colour scheme. |
| Real business names | `10` P0-2, P1-6 | A name list with "checked on" dates; new names need a check. |

---

## 5. Inconsistencies and gaps

**The workspace diverges from the brand.** The colour values are mostly the brand's, but under four sets of names:
- One name means two colours: `--canvas` is Paper on the site and #eceee9 in the shell.
- `--ease` and `--spring` share names across files but are different curves.
- Buttons have four shapes, none notched, with radius up to 999px.
- Focus is Carbon, not the site's green or Volt.
- Type is 24+ px sizes with no scale.
- Status colours (ok, warn, bad, danger) exist outside the brand.
- Some things pulse forever.
- `/login` says "Alyr" in the old style; the `/whatsapp` header says "Alyr · Demo 1" (`docs/brand.md` open table).
- `docs/brand.md` says "the rest of the product screens are on ALYR tokens", which is true of the values and not of the system.

**Dark-mode coverage.**
- No product screen reads `data-theme`, so a visitor who picks light on the site and signs in gets the device's theme.
- Product dark surfaces (#0a0b0d, #131518, #191c1f) are not the site's (#0e1012, #15171a).
- The email has no dark styles.
- The card's carbon theme is a third dark (#15171a with #2f3338 rules).
- `globals.css` alone sets `color-scheme: dark`.
- Every consumer hand-keeps two identical dark blocks, the rule `docs/brand.md` states and nothing checks.

**Icons are drawn several ways:**
- five icon components;
- strokes of 1.5, 1.7, 1.8, 2 and 2.4 to 3;
- the tick in five files;
- the mark's polygons in seven files;
- Unicode arrows and "×" in text, not mirrored.

The design system's `03_Icon_System` is the stated source (`docs/brand.md`), but only `brand.tsx` follows it.

**Duplicated components:**
- the customer page frame (site `Frames.tsx` against product `_customer/Frame.tsx`);
- the workspace screens redrawn on the site (`Sheets.tsx`, `Drawings.tsx` against `Screens.tsx`);
- the token blocks: drawings copy the product's, the product copies globals;
- `contactHref` and `contactLink`;
- `initials` ×4, `qar` ×3, `Linked` ×2;
- three chat bubbles, three composers, four avatars, five empty states, three step lists, three stat strips.

The redrawn screens can drift from the product they claim to show. The Agent is the counter-example: one component, two homes, samples captured from the engine.

**Undocumented:**
- The Carbon-block text ramp (#555d65, #6b7480, #8a9199, #c4c9cf, #d5d9dd).
- The product's status colours.
- The `--fast`, `--medium` and `--slow` scale.
- The Agent's type scale, which is written only in a CSS comment.
- The card's palette (#2f3338, #c9ccc6, #3a3e44, #dcdfda, #2c2f33, #d6d9d3).
- The email palette (#e3e6e1).
- Spelling: `copy.ts` is British; nothing says so.
- Punctuation: the "·" separator and no em dashes.
- Breakpoints.
- z-index.
- `docs/brand.md` contradicts itself on chats ("a neutral chat with no messaging app's logo or colours" in the extensions table, WhatsApp's own colours under Light and dark) and on Payroll's coming row against D-039.

**Surfaces with no rules yet.** Only the playbook, which belongs to the other look, covers them:

| Surface | What exists | What is missing |
|---|---|---|
| Email | Two inline-HTML templates (`mail.py:54-77`, `report.py:329-355`): Arial, a retyped wordmark, no dark mode, English then Arabic | Layout, logo image, type fallbacks, Arabic placement, dark |
| Slides | Playbook: 1920×1080, at most 25 words a slide | Everything in this system |
| Social posts | Playbook only | Templates, Arabic, captions for samples |
| Printed QR cards and leave-behinds | Playbook: A5 bilingual | Everything; no QR code exists in the code |
| Invoices and receipts | Not built (D-032, D-033); `packages/compliance` planned; playbook says formal MSA | Layout, legal fields, e-invoice compliance |
| WhatsApp templates | `apps/api/src/alyr/core/templates.py` (17 templates, en and ar), inline strings in modules | A written voice for messages; currency per language; staff replies are English only (`ledger/chat.py:160-191`) |

---

## 6. Proposed structure

### 6.1 One tokens source

**Format.** A single file, `design/tokens/alyr.tokens.json`, in the W3C Design Tokens Community Group format (`$value`, `$type`, `$description`; check the current spec before building). Three tiers:

```json
{
  "color": {
    "carbon": { "$type": "color", "$value": "#15171a", "$description": "Command surface, logo, primary ink" },
    "volt":   { "$type": "color", "$value": "#b7f34a", "$description": "Signal only: main action, current state, confirmed progress, one highlight" }
  },
  "semantic": {
    "canvas":     { "$type": "color", "$value": "{color.paper}",
                    "$extensions": { "qa.alyr": { "dark": "{color.ink-950}", "contrastOn": "text" } } },
    "text-muted": { "$type": "color", "$value": "{color.grey-600}",
                    "$extensions": { "qa.alyr": { "dark": "{color.concrete}", "minContrast": 4.5 } } }
  },
  "component": {
    "band": { "$type": "color", "$value": "{color.carbon}", "$extensions": { "qa.alyr": { "dark": "#1d2024" } } }
  },
  "font": { "sans": {}, "arabic": {}, "mono": {} },
  "size": { "display": {}, "h2": {}, "h3": {}, "body": {}, "small": {}, "label": {} },
  "space": {}, "radius": {}, "rule": {}, "shadow": {},
  "duration": {}, "ease": {}, "breakpoint": {}, "z": {}, "focus": {}
}
```

1. **Primitives:** Carbon, Volt and its hover and pressed, Paper, Concrete, Graphite, one named grey ramp that absorbs the 13 near-blacks and the Carbon-block ramp, status hues, and the WhatsApp palette as its own group, marked as WhatsApp's.
2. **Semantic,** with light and dark: canvas, surface, surface-subtle, text, text-muted, line, line-strong, focus, signal, pending, on-volt, volt-ink, ok, warn, bad. Each carries its minimum contrast, so the check can test it.
3. **Component:** band, window, mark-ring, the Agent's `ag-*`, card-specific values.

The type scale is one ramp that both site and product use: rem and clamp for the site, plus a fixed px equivalent for the product's dense screens and the card's 1080 canvas. Arabic line heights and "no tracking" sit beside each size.

**Generator.** `scripts/tokens-build.mjs`: plain Node, no new dependency. It writes generated files, each headed "generated from design/tokens, do not edit":

| Output | Consumer | How it reads it |
|---|---|---|
| `apps/web/app/_tokens/tokens.css` | Site, product, Agent | Imported first by `_site/document.tsx` and `(product)/layout.tsx`. `:root` light, then the two dark blocks, written identically by the script, so "keep them identical" stops being a manual rule. |
| `apps/web/app/_tokens/aliases.css` | Old names during migration | `--fg: var(--text)`, `.sh { --ink: var(--text) }` and the like. Deleted file by file as each consumer moves; the check counts what is left. |
| `_agent/agent.css` | Agent | Keeps its `--ag-*` hooks. Their defaults become `var(--text, #15171a)`, with the fallback filled in by the generator, so the component still works anywhere. |
| `apps/web/app/_tokens/tokens.ts` | `next/og`, `brand.tsx`, `document.tsx` theme-color, inline SVG | `import { color } from "../_tokens/tokens"` |
| `apps/api/src/alyr/brand.py` | `card.py` `THEMES`, `mail.py`, `report.py` | `from alyr.brand import COLOR, CARD`. A committed module, not a file read at run time, so the API's container does not need the repo. |
| `design/tokens/figma.json` | Figma variables | Imported into the library (6.3). |

The logo and the mark's polygons go in the same folder (`design/brand/mark.json`). All seven copies are generated from it or checked against it.

**Drift check.** `scripts/design-check.mjs`, run by `scripts/check.sh` and by the CI `web` job:

1. Regenerate into a temporary folder and diff against the committed outputs. Fail if they differ.
2. Find colour literals (hex, rgb, hsl, named) in `apps/web/app/**/*.{css,tsx,ts}` and `apps/api/src/**/*.py` outside the generated files. Fail on any not in `design/tokens/allow.json`, which records each exception with its reason (the WhatsApp drawing, for example). The current literals go into a baseline that may only shrink.
3. Fail on any `prefers-color-scheme` or `data-theme` rule outside the tokens files.
4. Report `font-size`, `border-radius`, `z-index` and duration values that are not on a scale, with counts, as a ratchet.
5. Fail if the mark's polygons in any file differ from `mark.json`.
6. Words: JSX text in `_site/` and `(product)/` outside copy files. Check whether `react/jsx-no-literals`, from the plugin `eslint-config-next` already brings, can do this before writing anything. Also one AI-words list shared by the API tests and a scan of both `copy.ts` files.
7. Fail if both `[dir="rtl"]` and `:dir(rtl)` are used.

### 6.2 The skills

The format follows `.claude/skills/weekly-review/SKILL.md`: a folder with `SKILL.md`, `name` and `description` in the frontmatter, numbered steps, and a closing "Never" line. Reference files sit beside it, and the generated `tokens.md` comes from the JSON so the skill never restates a value by hand.

| Skill | Description (what triggers it) | Contents |
|---|---|---|
| `alyr-design` (core) | "ALYR's design system: tokens, type, colour, Volt, the 45° cut, rules, motion, light and dark, Arabic and RTL, honesty. Use before making or changing anything a visitor, owner or customer sees: a page, a screen, CSS, a component, an image, a message, an email, a deck or a printed piece." | Ten rules on one page: Volt means four things; solid true, dashed waiting; the cut mirrored; one Volt button; tokens only, no literals; dark from tokens; plays once; words in copy; fictional and captioned; Arabic rules. Then which content skill to load next. Files: `tokens.md` (generated), `voice.md` (voice, no-AI list, vocabulary, spelling, punctuation), `arabic.md`, `honesty.md` (claims table, names with dates checked, captions, offer switch, contact states), `components.md` (section 2 as a catalogue), `motion.md`, `checks.md` |
| `alyr-site-page` | "Build or change a public ALYR page or section under `apps/web/app/_site`, `(site)` or `(site-ar)`." | Product page template, header, Products menu, product bar, contact states, offer switch, FIG captions, drawn screens, 12 columns and breakpoints, motion stack (CSS, then GSAP after load), the build and publish rule |
| `alyr-product-screen` | "Build or change a workspace, back office, onboarding or customer page screen under `apps/web/app/(product)`." | Shell, tables, forms, buttons (the notch question for the founder), status colours, empty states, setup checklist, dense type scale, theme following the site's switch, copy files per screen, Arabic and RTL, the Agent as the shared component |
| `alyr-whatsapp-message` | "Write or change any WhatsApp message ALYR sends: a Meta template, an automatic reply, a reminder, the Sunday report caption." | Template categories and the outbound and consent rules (pointer to `CLAUDE.md`); whole templates per language; `counted`, `agree`, `money`; RLM; WhatsApp bold; must-not-claim; length limits; tests to add |
| `alyr-email` | "Write or change an email ALYR sends: sign-in, the weekly report, anything to an owner." | Table layout, logo as an image (never retyped), font fallbacks, the email palette from `brand.py`, Arabic block order and `dir`, plain-text twin, dark mode |
| `alyr-generated-image` | "Render an image from code: the report card, social and Open Graph cards, share images." | resvg for anything Arabic, never `next/og`; fonts bundled; minimum type; Carbon and Paper themes; mirroring; size budgets; regeneration scripts (`report_samples.py`, `site-report-images.mjs`) |
| `alyr-print` | "Design a printed piece: QR cards, counter cards, leave-behinds, invoices, receipts." | Starts as a list of decisions for the founder (sizes, paper, legal fields, e-invoice rules from `packages/compliance`); the logo minimum and clear space; MSA for documents |
| `alyr-deck-and-social` | "Make slides or a social post for ALYR." | Grid, type at slide and post sizes, one sample business, captions, Arabic posts, no claims; shared with the Growth lane |
| `alyr-design-review` | "Review ALYR work before it ships: run the checks, then two independent critiques and rulings." | The cycle in 4.1; the matrix (pages × EN/AR × 1440/390/320 × light/dark × reduced motion, every menu open); `shoot.mjs` usage and pitfalls; axe and Lighthouse budgets (move the tools from `C:\t\` into a script the repo owns, or document that cloud sessions cannot run them); claims-table pass; names pass; P0/P1/P2 format; rulings; what was not checked |

### 6.3 What the Figma library should mirror

Code is the source; the Figma library is generated from `design/tokens/figma.json` and never edited by hand. `docs/stack.md` says design is built in code, with Figma Free only for hand-offs, and ALY-76 already uses Figma, so this is a mirror, not a second source. Check Figma's current variables import before relying on it.

- **Variables:** Primitives; Semantic with Light and Dark modes; Component.
- **Text styles:** Latin and Arabic pairs per step.
- **Effect styles:** lift, float, window, menu.
- **Grids:** 12 columns at 1440, 390 and 320.
- **Components:** the Volt button and its outlined twin with the notch (with RTL variants); FIG caption; solid and dashed rules with crosses; pending dot and status line; the signal; the fold; the Carbon plate; phone frame; workspace window; WhatsApp bubbles in both themes; the Agent's blocks; numbered marks; the product bar and Products menu; the report card at 1080×566 in both themes; the social card at 1200×630; the logo and symbol from the master, with the new R once proofed; the icon set at 1.7px.

### 6.4 What only the founder can decide first

1. **Close ALY-61:** Carbon and Volt or cobalt. Everything above assumes Carbon and Volt.
2. **Whether product buttons take the 45° notch,** and whether the product follows the site's theme switch. Both are a visible change to screens owners use.
3. **Where the design system's master lives from now on.** Today it is a branch that must never be merged (ALY-124 plans moving it out). This proposal makes `design/tokens/` in this repo the master and the branch an archive.

---

## Not checked

- The design system's files on `codex/alyr-native-foundation` (not opened, so the original `tokens.css` was not compared).
- The playbook itself (only the repo's extract).
- Running pages: nothing was built, served or captured.
- Every line of `copy.ts` against the rules.
- Every product TSX file line by line; the product audit sampled them.
- The Arabic itself (not reviewed by a native speaker).
- Figma's and the DTCG spec's current documentation.
- `apps/web/app/sitemap.ts`, `robots.ts` and the 404 page's social image (the 404's `localhost:3000` warning is known from `08-site-log`).
