# ALYR design system, step 2: the product UI follows the redesign

13 Nov 2026, decision D-180. Step 1 (`01-tokens-log.md`) put every value in `design/tokens.json`.
This step records the decisions that let the workspace, the back office, sign-in, sign-up and the
customer pages follow the redesigned screens, and which rule in the design skills each decision
changed. The public site is not touched: it keeps its system (`alyr-site-page`).

The redesign was drawn as screens, with a kit of parts. Comparing it with the written rules found
39 conflicts. Each entry below says what was decided, which old rule it changes and which file was
edited so the skills stop contradicting each other. The rules themselves are in
`.claude/skills/alyr-product-screen/ui-rules.md`; the parts in `.claude/skills/alyr-design/components.md`
("Product UI"); the numbers and words in `.claude/skills/alyr-design/format.md`; the per-screen
list in `.claude/skills/alyr-product-screen/screen-checklist.md`.

## What was decided, as a whole

1. **The redesign's language is the product's.** Workspace, back office and customer pages follow
   it, with the resolution below for each conflict: hybrid numerals (mono for identifiers, times,
   phone numbers and money in tables and key-value rows; Instrument Sans tabular figures from 24 px
   and for amounts inside sentences); the Volt button's notch on the top inline-end corner, as on
   the site, mirrored in Arabic, every other button a 4 px rectangle; icons allowed on outlined and
   icon-only buttons and never on a Volt button (this amends D-150 for the product); icons redrawn
   in the brand's geometry (24 px grid, square ends, mitred corners) and shown at 16 px; panels at
   8 px radius with a hairline, dialogs at 10, no shadows except menu and dialog; 13 px body, 12 px
   captions, 11 px mono labels, 24 px page titles; Arabic one step up; a dashed slot for first-run
   objects and `Empty` for filtered lists; a customer page's primary button in the shop's colour
   with the footer "Set up by ALYR"; "Ask ALYR" renamed to what actually happens.
2. **One workspace is one place.** No place switch and no per-place column or filter in anything
   built; no place model is invented.
3. **Staff with the agent role see per-order totals only.** Aggregates (the open-orders total,
   spent, owes, band figures) and margin are for owners and admins, enforced on the server.
4. **The pay-ALYR screens are drawn but not built.** There is no setup fee anywhere (D-092), and a
   price on any screen comes from the real price list, never typed in.

## The conflicts

Every entry: **Decided** 13 Nov 2026 unless marked open. "Edited" names the skill or doc file
changed in the same pull request; where none, the rule already said so or the change is in code
(the foundation pull request).

### C1 · Panel shape
**Decision.** Product panels have a 1 px hairline and the `--radius-md` (8 px) radius; dialogs
`--radius-dialog` (10 px). **Changes.** "Rounded panels and pills are not ALYR" now reads as the
public site's rule. **Edited.** `alyr-design/SKILL.md` (principle 4), `alyr-design/tokens.md` (radius).

### C2 · Shell chrome
**Decision.** A white canvas, hairline panels, no shadows, a sidebar with an end hairline. The
raised, lifted "sheet" is retired. **Changes.** The workspace shell's sheet and lift shadow.
**Edited.** `alyr-design/components.md` (the old shell row says so); the CSS is replaced by the kit's shell.

### C3 · Numerals
**Decision.** Hybrid: mono for identifiers, times, dates, phone numbers and money in cells and
key-value rows; tabular Instrument Sans for figures from 24 px and for amounts in sentences.
**Changes.** "Figures are Instrument Sans with tabular digits, not mono" now reads as the site's
rule. **Edited.** `alyr-design/SKILL.md` (type), `alyr-product-screen/SKILL.md` (money, type scale),
`alyr-design/format.md` (money).

### C4 · The Volt notch on product buttons
**Decision.** The Volt button is cut on its top inline-end corner, 9 px at 28 to 36 px high and
12 px at 44, mirrored in Arabic; its other corners are 2 px; every other button kind is a 4 px
rectangle with no cut. **Changes.** "Whether product buttons take the notch is open; do not mix
shapes on one screen". **Edited.** `alyr-product-screen/SKILL.md`, `alyr-design/components.md`,
`alyr-design/tokens.md`, `design/README.md`, `docs/brand.md`.

### C5 · Icons on buttons
**Decision.** In the product an icon is allowed on outlined and quiet buttons and on icon-only
buttons, and never on a Volt button. The public site keeps "a button is its words". **Changes.**
D-150's "no icon or arrow on a button, on any page", for the product. **Edited.**
`alyr-design/SKILL.md` (principle 11), `alyr-design/components.md` (Volt button row).

### C6 · Icon geometry
**Decision.** The product's icons are drawn on the 24 px grid with square ends and mitred corners
and shown at 16 px with a stroke that reads about 1.5 px. The drawing kit's 16 px, 1.4 px,
round-cap set is retired. **Changes.** Nothing in the written rule except the render size.
**Edited.** `alyr-design/SKILL.md` (icons), `alyr-design/components.md` (Icon row).

### C7 · Pills
**Decision.** No pills in the product: tags, chips and tabs are 4 px, on customer pages too.
The only pill is a toggle's own track. **Changes.** The workspace's `.sh-pill` (radius 11) and the
customer pages' pills. **Edited.** `alyr-design/components.md` (Product UI).

### C8 · Colour for state
**Decision.** One rule: a Volt dot is happening now or just done, green is healthy or settled,
amber is waiting or late, red is failed or blocked, grey is neutral, a hollow ring is not
connected. Volt is never a Tag fill. **Changes.** The "Red and green alarms" line, which is about
alarms, not state. **Edited.** `alyr-product-screen/SKILL.md` (Status, Don't), `alyr-design/tokens.md`.

### C9 · Light page and the Carbon band
**Decision.** No conflict. One band per page, on a dashboard-layout page, with the corner cut by
`--cut-band` (28 px). **Edited.** None (documented in `ui-rules.md`).

### C10 · Weights
**Decision.** No conflict: 400, 500, 600 in the product; mono 400 and 500. **Edited.** None.

### C11 · Arabic face
**Decision.** IBM Plex Sans Arabic, as built. The drawing kit's Noto Sans Arabic was a stand-in.
**Edited.** None (the rule already said so).

### C12 · Type scale
**Decision.** Body 13 px (`--ui-small`), captions 12, labels 11, panel title 14, dialog title 15,
page title 24, stat figure 28, band figure 32 (`--ui-figure`, new). Nothing under 11. Arabic is one
step up from 11 to 15 px. **Changes.** "Body is 15 px". **Edited.** `alyr-product-screen/SKILL.md`,
`alyr-design/tokens.md`.

### C13 · Input size
**Decision.** 36 px high with 13 px text on a laptop and a fine pointer; 44 px high with 16 px text
below 48 rem and on a coarse pointer, so a phone does not zoom. **Changes.** "Inputs 16 px". **Edited.**
`alyr-product-screen/SKILL.md`, `alyr-design/tokens.md`.

### C14 · Touch targets
**Decision.** Phone variants are 44 px, carried by the component, never by a screen. **Edited.** None.

### C15 · Control borders
**Decision.** Fields and selects use `--line-strong`; buttons and chips use a new `--control-line`.
**Changes.** "`--line` is never a control border" stays; the new token covers buttons and chips.
**Edited.** `alyr-design/tokens.md`.

### C16 · Faint text
**Decision.** Placeholders and sentences use `--text-muted`; `--text-faint` is for mono labels,
timestamps and separators only. **Edited.** None (the rule already said so; now enforced in review).

### C17 · Status text on soft fills
**Decision.** New `--ok-text` and `--warn-text` (4.5:1 on their soft fills). **Edited.**
`alyr-design/tokens.md`.

### C18 · Label tracking
**Decision.** The token everywhere (`--tracking-label`), never 4% or 6%. **Edited.** `alyr-design/tokens.md`.

### C19 · Title tracking and leading
**Decision.** Page title 24/30 at -.015em; figures at -.02em, with new `--tracking-ui-*` and
`--leading-ui-*` tokens. **Changes.** The product's `clamp(26px, 36px)` heading. **Edited.**
`alyr-design/tokens.md`.

### C20 · Space scale
**Decision.** The product gets a UI scale of 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32 and 48 px
and bans 3, 5, 7, 9, 18 and 22. The site's `--space-*` stays. **Edited.** `alyr-design/SKILL.md`,
`alyr-design/tokens.md`.

### C21 · Sidebar and navigation
**Decision.** Sidebar 240 px, links 30 px (44 on touch), the current link on `--surface-subtle`,
and the current marker of a sub-link is the existing cut sliver rather than a square bar.
**Changes.** The 16 rem sidebar with 34 px links on a lifted sheet. **Edited.** `alyr-design/components.md`.

### C22 · Page title row
**Decision.** A 24/30 title, one muted sentence, no eyebrow. **Changes.** The `clamp()` h1 with a
mono eyebrow. **Edited.** `alyr-design/components.md`.

### C23 · Shadows
**Decision.** Only a menu, a popover and a dialog, with `--shadow-float`; a panel has none.
**Edited.** `alyr-design/tokens.md`.

### C24 · Scrim
**Decision.** One token, `--scrim`, with a dark value. **Edited.** `alyr-design/tokens.md`.

### C25 · Empty states
**Decision.** Both shapes: a dashed slot for a first-run object the product can make today, and
`Empty` for a list a filter or search has emptied. **Changes.** "Empty states in the real shape: ...
dashed slots", which now covers the first case only. **Edited.** `alyr-product-screen/SKILL.md`.

### C26 · Selected row
**Decision.** Selection is `--surface-subtle`; `--volt-wash` is for the live "now" row only.
**Changes.** "Pale Volt behind the current row". **Edited.** `alyr-design/tokens.md`.

### C27 · Logo
**Decision.** The shell, sign-in and sign-up use the `Logo` or `Symbol` component at a legal size,
never "ALYR" typed beside the symbol. **Edited.** None (the rule already said so).

### C28 · WhatsApp marks
**Decision.** The drawing kit's `wa` glyph is replaced by a neutral chat icon and the word
"WhatsApp"; `--wa-*` colours stay inside drawn chat bubbles only. **Edited.** None.

### C29 · Customer pages
**Decision.** The primary button is the shop's colour with white text, 44 px high, no notch and no
Volt; until a business has a colour set, the `dark` button. The footer reads "Set up by ALYR".
**Changes.** The Volt full-width button on a shop's page, "Powered by ALYR". **Edited.**
`alyr-product-screen/SKILL.md`.

### C30 · "Ask ALYR"
**Decision.** Renamed to what actually happens: a request sent to ALYR that a person reads; or the
data named ("today's numbers"). **Edited.** `alyr-design/honesty.md`, `alyr-design/format.md`.

### C31 · "At risk"
**Decision.** The counted signal is named instead ("Payment overdue", "No sign-in for 7 days");
"Churned" becomes "Stopped". **Edited.** `alyr-design/honesty.md`, `alyr-design/format.md`.

### C32 · "Free replies"
**Decision.** "Typed replies allowed for 23 more hours" or "Window open until Fri 09:27".
**Edited.** `alyr-design/honesty.md`, `alyr-design/format.md`.

### C33 · Sample names (open)
**Open.** The names in the drawings that were never checked against real businesses, and the
retired names still in some scripts, stay out of every built screen. The manual check (Instagram,
Maps, the trademark register) is not done. **Edited.** None.

### C34 · Prices and the setup fee (partly open)
**Decided.** No setup fee anywhere (D-092); a price on a screen comes from the price list.
**Open.** Which price figures the drawings should show. **Edited.** None.

### C35 · The pay-ALYR screens (open)
**Decided.** They are drawn but not built: no route and no nav entry. **Open.** When that changes.
**Edited.** None.

### C36 · Copy house style
**Decision.** Ranges take an en dash (`07:00–22:00`); an empty value is "None", not an em dash;
"Code" not "SKU"; the staff role "Agent" is kept as a role name and never used for people in a
sentence. **Edited.** `alyr-design/voice.md`, `alyr-design/format.md`.

### C37 · The rule line
**Decision.** Product panels write "By rule: ..." as a sentence in the panel footer; the ALYR Agent
dashboard keeps its RULE line until it is restyled. **Edited.** `alyr-design/honesty.md`.

### C38 · Status colours on the band
**Decision.** New `--on-band-ok`, `--on-band-warn` and `--on-band-bad`; a soft fill is never used
as text, and the dark theme is never borrowed. **Edited.** `alyr-design/tokens.md`.

### C39 · Dark theme
**Decision.** Unchanged values; Home and one dense table are drawn in dark before sign-off.
**Edited.** None.

## Still open

Not decided, so the rules do not rely on them:

- **Sample names (C33):** the manual check of the names in the drawings.
- **Price figures (C34):** which figures a screen shows.
- **The pay-ALYR screens (C35):** whether and when they are built.
- **The clock:** whether times show on a 12-hour clock. Written through one helper so it is one edit.
- **How many minutes an unpaid booking's slot is kept** before it is released.
- **Marketing consent:** how a customer's consent to offers is collected, which decides whether any
  offer audience or "send offers" screen can exist.
- **Merge rules:** when two customer records are one, and what a screen shows while they are.
- **Rules taken without a drawing:** the three tiers of breakpoints, the content column cap, Volt
  on a navigation button, Volt or `bad` on a confirm, `quiet` for every dismiss, an `ink` Tag for
  "Staff only", and the Arabic step-up (`ui-rules.md`, the last list). They close gaps and are
  easy to change.

## Next

The foundation pull request adds the tokens marked "(new)", the kit in `apps/web/app/_ui/`, the
icon set, the format helpers, a UI check (`scripts/ui-check.mjs`) and a gallery check. The site's
drawn customer pages and workspace screens (`CxTop`, `CxFoot`, `Sheets.tsx`) copy the product's
old look and, by their own rule, change when the product changes; they are not touched here and
follow once the product screens are built. This file and the rules are updated in the same
change as any rule that moves. A screen that meets something
the rules do not cover files a one-line request instead of inventing it.
