# ALYR brand in this repository

ALYR is the company. The WhatsApp product is its first product (decision D-023). **The brand is Carbon and Volt** (D-040, the founder, 17 Oct): the playbook's cobalt, lowercase "alyr", "a" mark and its typefaces are retired. This page says where the brand lives, which rules the public site follows, and what is still open. It is a pointer, not a copy of the design system.

**Every value lives in `design/tokens.json`**: colour in light and dark, faces, type scales, spacing, radii, rules, the cut, shadows, motion, breakpoints, z-index and focus. `scripts/tokens-build.mjs` generates the CSS, TypeScript and Python every page, screen, card and email reads, and `scripts/design-check.mjs` fails CI on a hard-coded colour or font. How to use it: `design/README.md`.

## Design system: the rules live in skills

This page tells the story of the brand and why each rule exists. The rules an agent follows
when it makes anything with the ALYR brand on it live in Claude Code skills, in
`.claude/skills/`, and the values live in `design/tokens.json` (ALY-126):

| Skill | For |
|---|---|
| `alyr-design` | The core: principles, tokens, type and grid, components, motion, light and dark, RTL, Arabic, accessibility, honesty, verification, the recurring failures |
| `alyr-site-page` | Public pages, the product page template, adding a product page |
| `alyr-product-screen` | Workspace, back office, onboarding and customer pages; ALYR Agent's dashboard |
| `alyr-whatsapp-message` | Replies, notices, templates and the report card's message |
| `alyr-email` | Emails ALYR sends |
| `alyr-generated-image` | The report card, social cards and other images drawn by code |
| `alyr-print` | QR cards, leave-behinds, invoices |
| `alyr-deck-and-social` | Slides and social posts |
| `alyr-design-review` | The design cycle: research, brief, build, two critics, rulings, fix, verify, publish |

The look is Carbon and Volt (the founder, 17 Oct 2026, ALY-61; D-040 with the tokens); the
playbook's cobalt is retired and its voice kept. When this page and a skill disagree, fix
whichever is out of date in the same pull request.

## Where the source is

The approved design system (v1.0) and strategy are on the branch `codex/alyr-native-foundation`, under `ALYR_Main/ALYR_Design_System` and `ALYR_Main/ALYR_Brand_HQ`. **Never merge that branch into `main`.** It shares no history with `main` and contains other projects. Copy the asset you need and say where it came from.

| In this repo | Copied from the design system |
|---|---|
| `apps/web/app/_site/brand.tsx` (logo, symbol, icons) | `02_Logo_System/01_Master_SVG`, `03_Icon_System/UI_Icons_SVG` |
| `design/tokens.json` (every colour, type, space and motion value; first copied from there by hand into `site.css`, now the source) | `06_UI_UX_System/Design_Tokens/tokens.css` |
| `apps/web/app/icon.svg` | `04_App_and_Favicon/02_Favicon/favicon.svg` |
| `apps/web/app/_site/fonts/InstrumentSans-SemiBold.ttf`, `IBMPlexMono-Regular.ttf` (the social card only, read at build time; SIL Open Font Licence) | `asset-continuity-web/public/alyr/fonts/` on the same branch |

## One brand (D-040)

The founder's **Brand & Growth Playbook** (a Claude Docs document in the founder's account, 11 Oct 2026) sets the positioning, voice, content and sales plan; those still apply. Its visual identity (cobalt blue, a colour per product, lowercase "alyr", the rounded "a" mark, Bricolage Grotesque and Geist) was not chosen: Carbon and Volt is ALYR's look (D-040, which settles D-025's open question).

## Rules the public site follows

- **Logo.** Drawn point for point from the master artwork, with one change: the founder had the R redrawn on 12 Oct 2026 (full stem, chamfered bowl, tighter counter). The master SVGs on the design-system branch, and everything made from them (cards, letterhead, social covers), still carry the old R and need regenerating; the new R also needs the designer's proof before print or trademark filing. Never retyped, redrawn, stretched or recolored. Carbon on light, white on Carbon, each with the Volt plane. The horizontal logo is never narrower than 140 px; below that, use the symbol.
- **Volt means one of four things:** the main action, the current state, confirmed progress, or one strategic signal. Never body text on a light surface, never a decorative background.
- **Type.** Instrument Sans for Latin, IBM Plex Sans Arabic for Arabic, IBM Plex Mono for small labels and identifiers. Arabic is never letter-spaced and is set with looser line height than Latin.
- **Layout.** Light first, Carbon for command moments, rules and whitespace before cards, asymmetry over centering.
- **Motion.** One signature gesture: things arrive along the logo's 45° diagonal, settle, and one Volt signal confirms them. Everything plays once, except what follows the scroll (the two progress rules on the homepage). Hover movement is 1 to 2 px. With reduced motion, nothing travels and nothing plays by itself. Two figures on the ALYR Chat page are allowed to keep moving, because they explain the product: the demo and the how-it-works flow. Both play only while on screen, can be paused, and stay still with reduced motion. The homepage's motion system is below.
- **Voice.** Sentence case, short and declarative, name the result. No "Learn more", no "unlock", no "supercharge".
- **Honesty.** No invented metrics, logos or testimonials. Sample screens are labelled as samples and use a fictional business.
- **Words.** Every word is in `apps/web/app/_site/copy.ts`, in English and Arabic. Components hold no text.

One deliberate addition: `--line-strong` (`semantic.line-strong` in the tokens) is darker than the design system's strong border, which is only 2.1:1 on Paper and too faint for controls.

## Extensions adopted with the 2026 homepage (ALY-56)

The homepage is "a working drawing of an owner's business" (`docs/site-redesign/04-brief.md`). These are additions to the design system, recorded here; the logo, symbol and wordmark are unchanged, and there is still one accent colour.

| Extension | Rule |
|---|---|
| Fluid type scale | Display `clamp(2.75rem, 1.4rem + 5vw, 5.5rem)` at 1.0 (on two-column widths also capped at `min(5.75vw, 5.2rem)`, and at `5.1vw` between 62 and 84 rem where copy and figure take six columns each, so the headline ends before the hero plate); H2 `clamp(2rem, 1.3rem + 2.6vw, 3.25rem)`; H3 1.375rem; body 1.0625rem at 1.55; mono 0.75rem, tracked +0.08em in English only. Arabic: same sizes, display 1.25, body 1.7, never tracked or set in capitals |
| Rhythm | 8 px steps: 8, 16, 24, 40, 64, 104; sections `clamp(3.5rem, 7vw, 6rem)`; section rules leave `clamp(2rem, 4vw, 3.5rem)` below them |
| Colour, two additions only | `--volt-wash` (the product's pale Volt, for the current row) and `--pending`, a hollow grey dot for something not yet available. The pending contact state is a status line with that dot, never an error box or a disabled button |
| Solid and dashed rules | A solid rule is true today; a dashed rule is a slot waiting to become true (the next products, "When you need more", the agreement's blank) |
| The 45° cut corner | On the main button (the arrow sits under it and moves 1 px along the diagonal when pressed), its outlined twin (`btn-line`, a 1.5 px line along the same notch, for a second way in further down the page), the drawn phones, the agreement, the shop monogram and the hero plate. Every cut and diagonal is mirrored in Arabic, because `clip-path` does not flip |
| The fold | The page's signature: three Carbon planes with the symbol's gaps (a 6 px Paper line across and a 6 px line down the 45° diagonal), at the entry to the Carbon band and again at the top of the closing call. The page shows through the gaps, so the fold stays drawn |
| The hero plate | The hero figure sits on a Carbon plate with its top start corner cut at 45° (6 rem) and a 0.5 rem Paper slit along the same angle above the order record |
| `--band` | The Carbon blocks: the band, the plate, the closing call and the ALYR Chat page's two panels. Carbon in light mode, `#1d2024` in dark mode so it still stands apart from the dark page; the header turns `--band` while it sits over a full-bleed one |
| FIG captions | Every product drawing has a mono caption on a hairline ending in a tick: "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY" (Arabic: its own words, no capitals) |
| One sample business | Qirfa Bakery / مخبز قرفة on every homepage figure, with sample prices said so |
| Money | Tabular figures; amounts and "ALYR" sit in `<bdi>` and never break (`Text.tsx`) |
| Drawn chats | A neutral chat with no messaging app's logo or colours |
| Light and dark | Every public page has both, and a switch in the header (below) |

### Motion system (homepage)

- **Tokens** (`site.css`): durations `--dur-1` 120 ms, `--dur-2` 240, `--dur-3` 480, `--dur-4` 720; `--ease` `cubic-bezier(.16, 1, .3, 1)` for things arriving (`expo.out` in GSAP); `--spring`, a `linear()` spring for things the visitor presses; `--stagger` 60 ms; one travel vector at 45° (`--travel`, `--dir` is -1 in Arabic).
- **Stack.** CSS for the hero's entrance (it runs before hydration), hovers, presses, springs and one-shot arrivals keyed on `.is-in`. GSAP 3.15 with ScrollTrigger and SplitText (`Choreography.tsx`) loads after the page's load event, only when motion is wanted: it says when things arrive, splits headings into lines (never characters, and Arabic headings are not split), scrubs the two progress rules and leans the main buttons 2 to 3 px toward a fine pointer. Cross-document View Transitions keep the header still while the next page arrives along the diagonal; the theme switch uses the same wipe, mirrored (below). No smooth-scroll library, no WebGL.
- **Nothing hidden in the HTML.** A script in `<head>` adds `motion` before the first paint unless reduced motion is asked for; start states exist only under that class, and a 4 s failsafe removes it if the page never hydrates; hydration replaces that with a 10 s one, so a slow phone keeps its motion. The published pages start the framework's scripts after the first paint (`scripts/site-defer-scripts.mjs`, run by `scripts/build-site.sh`). Reduced motion runs no timeline and shows every end state.
- **Budget** (Lighthouse mobile on the built site): Performance at least 90, Accessibility 100, CLS under 0.05; JavaScript added by the motion layer under 70 KB gzipped.

## Light and dark (added 17 Oct 2026)

Every public page, in both languages, has a light and a dark theme. Light is still the brand's first impression; dark is the same system turned down, not a second look.

**Behaviour.**
- The site follows the visitor's device until they use the switch. The choice is kept in `localStorage` (`alyr-theme`, `light` or `dark`) and applies on every page in both languages. With no choice stored, a change of the device's setting is followed at once.
- A script in `<head>` (`document.tsx`) puts the stored choice on `<html>` as `data-theme` before the first paint, so a stored dark choice never flashes light. The same script answers the switch, so it works before the framework's scripts start (they start after the first paint). Without JavaScript the switch is not shown and the page follows the device.
- `theme-color` follows the theme: the page sets one pair for the device (`#f6f7f3`, `#0e1012`), and a choice adds its own tag first in `<head>`. The page's own tags are never edited, because React would add copies when it hydrates.

**The switch.**
- A 44 px icon button beside the language link: the moon while the page is light, the sun while it is dark, so the glyph names what pressing it does. Its name says the same: "Switch to dark mode" / «التبديل إلى الوضع الداكن», and the light pair. Drawn on the 24 px icon grid in the icon set's line (1.7 px, square ends, mitred corners); the moon's bite comes in along 45° from the top end.
- On phones it is a row in the menu, under the language link, with the short label shown ("Dark mode" / «الوضع الداكن») and the full one as its name. The phone's bar already holds the logo, the one Volt action and the menu, and in Arabic the action's label is the longest; a fourth control would crowd it at 390 px and not fit at 320. Choosing a theme is rare and set once, and a row with words is clearer than one more icon.
- Over the Carbon header state it turns Concrete, white on hover, with a Volt focus ring.

**The moment.** Pressing it, the new theme sweeps in along 45° from the switch's own corner (top inline-end, so top left in Arabic), with its edge on the button notch's angle: the page navigation's wipe, mirrored. A same-document View Transition, `--dur-3` on `--ease`. The header is part of the page for it, and nothing else transitions while the colours change; the switch's glyph turns 45° as the other comes in. Without View Transitions, or with reduced motion, the theme simply changes.

**Rules for dark.**
- **Tokens only.** A token's dark value sits beside its light one in `design/tokens.json`; the generator writes the two identical dark blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`) into `apps/web/app/_tokens/tokens.css`. `[data-theme="light"]` keeps a page light on a dark device. A component never has a dark rule of its own: if it needs a colour that changes, add a token. The switch itself follows this (`--night`, `--when-light`, `--when-dark`). **The product screens follow the same switch** (D-040): `(product)/layout.tsx` applies the stored choice before the first paint.
- **Surfaces.** Canvas `#0e1012`, surface `#15171a`, lines `#2a2e33`, strong lines `#5f666d` (3.3:1). Text `#f3f5f0`, muted text `#a7adb5`. Carbon blocks lift to `--band` `#1d2024`, with a hairline closing a full-bleed one; inside a block, wells sit a step under it (`#15171a`) and panels a step over it (`#23272b`), as they do in light.
- **Volt** stays a signal: the main action, the current state, confirmed progress. The focus ring is Volt in dark (green `#6a9320` in light).
- **The drawn WhatsApp chat** on the ALYR Chat page takes WhatsApp's own dark chat screen (`#0b141a` behind, `#202c33` received, `#005c4b` sent, `#e9edef` text), still with no WhatsApp logo. The time in a sent bubble is a shade lighter than WhatsApp's (`#b3cdc9`) to keep 4.5:1, and a shade darker in light (`#5f6f79`) for the same reason.
- **Contrast.** AA in both themes, checked with axe-core and, for text under a filter (the chat bubbles), by a direct scan.

## The suite on the site (added 17 Oct 2026, ALY-99, D-037)

The site presents ALYR as a suite, led by ALYR Agent: the homepage and a page per product (`/chat`, `/bookings`, `/agent`, `/accounts`, and from 21 Oct `/shelf` and `/docs`, ALY-205), in both languages. ALYR Shelf is the Catalog's public name, ALYR Docs the Documents module's (founder, 20 Oct 2026). Payroll is not on the site until it is built. Each product's state is "Set up for you" / «نجهّزه لك»; ALYR Agent and ALYR Shelf say "With every product" / «مع كل منتج». Build notes in `docs/agent-dashboard/08-site-log.md`.

**The Products menu** (`Shell.tsx`, `site.css` `.pm`). On wide screens a panel under the header spans the page: the six products in the suite's fixed order (Chat, Bookings, Agent, Accounts, Shelf, Docs), each on a solid Carbon rule with its one line and its state in mono, three to a row on a narrow laptop. It is a native `<details>`, so it opens by keyboard and without JavaScript; the script in `<head>` closes it on Escape (focus back on its button), a click outside, a link chosen inside or focus leaving, and keeps one menu open at a time. On phones the same list is the first group of the menu. The footer lists the products in the same order.

**ALYR Agent's figure** (`AgentFigure.tsx`, `agentfig.css`). The real `AgentDashboard` in showcase mode, from the samples captured from the engine, set in a **workspace window**: a bar with the shop's monogram (Volt corner), its name and the screen, on `--window` (white in light, `#262a2f` in dark, a step above the plate) with a `--window-line` hairline. Three settings:
- *Homepage hero:* on the Carbon plate (top start corner cut at 45°, mirrored in Arabic), cropped to its first screen with a fade, out of the tab order (the next section shows it whole). Beside it on wide screens, under it from 82 rem down, and first on phones (chip and the newest three events, then the window, which ends after "Done for you"): **the live feed**.
- *Homepage spotlight:* the whole screen on the page, with the sample switch (Bakery, Salon, Home services; shown only when scripts run) opening on the salon so the second look is a different business, and numbered marks on its parts that match the callouts beside it. Numbered marks are Carbon discs with white mono numbers (a Volt ring in dark): a number is not an action.
- *`/agent`:* on its Carbon block, with the switch and the feed, which follows the sample.
- On phones the four numbers sit two by two (in showcase they are not links, so a sideways scroller would hold nothing to focus).

**The live feed.** What ALYR did that afternoon, one event at a time: a mono time, a filled Volt tick (a flag by rule gets a drawn tick, since it needs the owner), the event in the product's own words, and for a flag its rule line on a Volt hairline. The "Done for you" count beside it steps up with each event it counts; a flag counts nothing. Newest event on top, so the latest flag and its rule line are in the first screen. A status chip "ALYR · Running" whose dot lights once, with one ring. The hero builds in one order: the plate, the window, the chip, its dot, then the events from 1.2 s. The static HTML carries the count before the feed, so it only ever counts up. It plays once, in under 5 s, when the feed is on screen, and again whenever the visitor picks another sample. Without JavaScript or with reduced motion it is composed. Only events the product performs and logs: the menu and the links it sends back, an order confirmation, a booking reminder, an item flagged by a rule.

**The product page template** (`ProductKit.tsx`, `kit.css`; 01-research D). A bar under the header (the product's name with the signal, its sections; solid, sticky, fades at the far edge on phones; no call to action, since the header's Volt button is just above). The opening on the Carbon block: eyebrow with the state, a two-line headline (second line Concrete), the lead, the tabbed demo, three facts on one rule. How it works from both sides (`FlowDiagram`). The screen used every day, drawn at true scale in the workspace window (`Sheets.tsx`), with numbered marks and callouts beside; on phones it scrolls sideways as the workspace does. Everything it does today by audience, then **Not yet** below a dashed rule, each item with the hollow pending dot. Who it's for, as rows with what each uses. **Works with the rest of ALYR**, ruled rows in the suite's order without the page's own product, Payroll dashed. Questions. The closing call, which now opens with the fold on every page.

**Smaller rules.**
- A heading can name where its lines break (a line feed in `copy.ts`, `lines()` in `Text.tsx`).
- In an Arabic sentence, a run of Latin words (a sample customer's name) and a number range ("0–30") sit in `<bdi>`, so a trailing full stop or a range never lands on the wrong side.
- Product names keep their case in Arabic eyebrows (no capitals in Arabic, and "ALYR Agent" stays as written), and a product's name never breaks across two lines (`.pname`).
- The dashboard on the site is the product's, untouched: the `ag-` class prefix belongs to it, so no site drawing uses `ag-`, and a page's heading rules stop at `.ag` (`:not(.ag h3)`). Checked element by element against `/agent-sample` in both themes and languages.

## Open before the site goes public

| Item | Owner |
|---|---|
| ALYR's own WhatsApp number (`NEXT_PUBLIC_ALYR_WHATSAPP`) so the call to action is "Message us on WhatsApp". Until it is set the pages offer hello@alyr.qa (the default of `NEXT_PUBLIC_ALYR_CONTACT_EMAIL`); set that to an empty value and they say the line opens soon. The founder confirms the address forwards | Founder |
| The price is decided (D-034); "live in 48 hours" and a free pilot stay off the site (D-025). The look is decided (D-040) | Founder |
| Native review of all Arabic copy | A native reviewer |
| Check every product claim on the page against what is live (see `docs/status.md`): keeping your number, payment links through your own gateway, and the product on Meta's platform are designed and built on the simulator, not yet running live | Founder |
| Hosting for the site. Vercel's free plan forbids commercial use; Cloudflare, where the domain already is, allows it | Founder |
| Legal company name and its Arabic form, trademark clearance, privacy notice and terms pages | Founder |
| Leftovers of the earlier styling in the product: `/login` shows "Alyr" in the old plain style, and the `/whatsapp` demo header says "Alyr · Demo 1". The product screens' colours, faces and type sizes come from the tokens (D-040); their four button systems and five icon sets do not yet follow one design (`docs/design-system/01-tokens-log.md`, next step) | Product lane |
