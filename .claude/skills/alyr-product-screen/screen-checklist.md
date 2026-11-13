# Screen checklist

Run this on every product screen (workspace, back office, sign-in, sign-up, customer pages)
before you ask for review, and paste the block at the end into the pull request. It is the
"Done when" of [SKILL.md](SKILL.md) made concrete, for the redesign ([ui-rules.md](ui-rules.md)).
Tick only what you did; write what you did not do under "Not checked". A box you cannot tick is
not a failure; a box ticked without looking is.

Look at the screen, do not assume: run it in a browser (`scripts/browser-kit.mjs` and the
`*-browser-check.mjs` scripts show how; headless Edge, instant scroll, the colour scheme passed
explicitly every time).

## 1. Who sees it, and what is real

- [ ] **Roles.** Opened as an owner, an admin, a staff member with the agent role and, for
      `/ops`, ALYR staff; each sees only what `ui-rules.md` section 16 allows. An agent
      receives per-order totals only: aggregates (open-orders total, spent, owes, band
      figures) and margin are absent from the **response**, not hidden in the page. A screen
      for owners and admins shows an `Empty` to anyone else.
- [ ] **The API fields it draws exist.** Every figure, column and state on screen is returned
      by a real endpoint today. A drawn thing with no endpoint is not built (D-039), not faked,
      not given a "coming" label.
- [ ] **No place model.** One workspace is one place: no place switch, no per-place column,
      filter or total.
- [ ] **Nothing from the unbuilt list.** No pay-ALYR screen (billing, pay to go live, bank
      details, card checkout for ALYR's own fee), no setup fee, no invented price, no nav item
      for a screen that does not exist.
- [ ] **Never:** ALYR pooling or paying out merchants' money, lending, a per-message fee, a free plan or
      trial, a ranking of staff (people are alphabetical), review gating, "approve all",
      editing an issued document (a credit note corrects it), maps or driver tracking, a
      password (sign-in is an email code), ALYR staff reading conversations (the back office
      shows counts), loyalty points, customer logos or testimonials.

## 2. The look: no literals

- [ ] **One Volt button on the screen** (counting the topmost layer: a drawer or dialog's
      Volt, not the page's behind it). No icon, arrow or spinner on it. No Volt Tag, disc or
      chart series. The Volt is not repeated in a table's rows.
- [ ] **Tokens only.** `node scripts/design-check.mjs` passes (no hex, no font name), and
      `node scripts/ui-check.mjs` (planned, added with the kit) passes: no `font-size`,
      `border-radius`, `padding`, `margin` or `gap` in px that is off the scales in
      `ui-rules.md` section 5 and 6, no `box-shadow` outside `--shadow-float`, no new button,
      pill, tab or table system, no `.sh-main`-style override of an old class.
- [ ] **Components from `_ui/`.** No part copied or restyled in the screen's CSS; a missing part
      was requested (`ui-rules.md` section 20). Class names carry the area's prefix.
- [ ] **Layout and anatomy.** One of the three layouts; title row, then at most one banner,
      then filters, then the work; at most one Carbon band, never with a Stat row beside it.
- [ ] **Density.** Row heights 44, 52 or 60 only; controls 28, 32, 36 or 44; nothing under 11
      px; weights 400, 500, 600; spacing steps from the scale; radii 2, 4, 6, 8, 10.
- [ ] **Colour means state.** Volt dot is happening now or just done, green healthy, amber
      waiting, red failed; each beside a word; text on a soft fill uses the `-text` tokens.
- [ ] **Numerals.** Mono for ids, times, dates, phone numbers and money in cells and key-value
      rows; Instrument Sans tabular for figures from 24 px and amounts inside sentences.
- [ ] **Sample mark** once, only on a sample business, in the sidebar head, app bar or customer
      header; none on a real business.

## 3. Every state

Draw or run each that applies, and say which do not apply.

- [ ] Loading (skeleton rows at the loaded heights; no layout shift)
- [ ] Empty, first run (a dashed slot with the one action) and empty, filtered (`Empty`)
- [ ] Error (a `bad` Banner with the reason and "Try again"; field errors beside the field)
- [ ] Offline (a Banner, saving disabled, nothing promised that does not happen)
- [ ] Confirm for every action that ends something (a dialog that says what happens)
- [ ] No permission (control absent; a direct address shows an `Empty`)
- [ ] A long name, a long Arabic string, a large number, a zero, a refusal from the server in
      the shop's words
- [ ] A poll does not re-animate or move the scroll position

## 4. Both languages, both themes, every width

- [ ] **English and Arabic.** Every string is in `T = {en, ar}` or the area's copy file;
      `lang` and `dir` are on the screen's root; the screen mirrors (sidebar, drawer, columns,
      pager, notch, band cut, chart time axis); numbers, money, ids, phone numbers and ranges
      are in `<bdi>`; Arabic is one size up and is not truncated with "…". Arabic is a draft
      until the native review: say so in the PR.
- [ ] **Light and dark,** from tokens only; the band, the soft fills and the scrim checked in
      dark.
- [ ] **1440 and 390** (and **320** for customer pages, sign-in and sign-up): no horizontal
      scroll in either language (`document.documentElement.scrollWidth` equals the width).
- [ ] **Phone.** Cards instead of a table; the bottom action bar; inputs 16 px and 44 high;
      the tab bar. Also 768 and 1024 where the layout changes tier.
- [ ] **Reduced motion** shows the end state; nothing loops or pulses.

## 5. Targets, focus, contrast, structure

- [ ] **Targets 44 by 44** on a phone and on a coarse pointer for every interactive control
      (probe at 390).
- [ ] **Focus is visible** on every control, in both themes, by keyboard from top to bottom;
      dialogs and drawers trap and return focus; Escape closes them.
- [ ] **Contrast AA** in both themes: 4.5:1 for text, 3:1 for controls, borders that carry
      meaning and large text. Measured, not judged by eye. `axe` run on the screen at 1440 and
      390, both themes, zero serious or critical.
- [ ] **Headings** in order, one `h1`, panel titles at the host's level; live regions for
      changing counts; every icon-only button has a name in both languages.

## 6. Words and numbers

- [ ] **Copy through `T = {en, ar}`** or the copy file; nothing inline. Sentence case, the
      middle dot as separator, no em dashes, no exclamation marks, British spelling.
- [ ] **Honesty grep** over the screen's strings, English and Arabic: none of AI, smart,
      intelligence, assistant, bot, predicts, forecast, learns, knows, magic, powered, health
      score, "Ask ALYR", "free replies", "At risk", "SKU", "coming", "soon", "beta", "new" as a
      badge, "planned", "not yet". The wording test
      (`apps/api/tests/test_no_unfinished_wording.py`) and `pnpm test` pass.
- [ ] **Format helpers only** (`alyr-design/format.md`): `money`, `formatTime`, `formatDate`,
      `duration`, `range`, `phone`, `orderNo`, `bookingNo`, `count`. No `toLocale*`, no printed
      `*_text` field, no `.00`, no em dash as an empty value ("None"), `07:00–22:00` ranges.
- [ ] **Counted numbers say how** ("By rule: ..." in the panel footer); percentages only when
      both periods count 20 or more.
- [ ] **Sample data** is the fictional set (the brief's names, order numbers from #1001,
      bookings from 101, dates on their true weekdays); no retired name, no real person.

## 7. Checks that run

- [ ] From `apps/web`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` (if a
      route changed); from the repo: `node scripts/design-check.mjs`. From `apps/api`:
      `uv run --no-sync ruff check` and the relevant tests if the API changed (through the real
      path: real PostgreSQL, HTTP in and out).
- [ ] The e2e specs and the browser checks that touch the screen still pass, or were updated in
      the same change (they assert words, roles, URLs and class names).
- [ ] `docs/status.md`, the lane brief and the Linear issue say what is done and what is not.

## 8. Screenshots

- [ ] Screenshots of each state, in both languages and both themes, at 1440 and 390, saved
      **outside the repository** and sent to the founder. They are not committed. Nothing is
      published without his yes.

## Pull request block

Paste into the description and fill it in.

```
## Product UI checklist
Screen / route:
Layout: dashboard | workbench | table + drawer | full page
Roles opened as: owner | admin | agent | ALYR staff
API fields drawn (endpoint, field):
Components used (from _ui/): 
Requests filed (component, token, rule):

Volt buttons on screen: 1   Band: 0 or 1   Banner: 0 or 1
design-check: pass   ui-check: pass | not available yet
States covered: loading, empty (first run), empty (filtered), error, offline, confirm, no permission
Languages: en, ar   Themes: light, dark   Widths: 1440, 390 (320)
axe (serious or critical): 0 at 1440 and 390, both themes
Targets 44 on phone: probed   Focus: keyboard pass   Contrast: measured
Honesty grep: clean   Format helpers: used   Copy: T = {en, ar}
Tests run: pnpm lint, tsc, pnpm test, pnpm build, <area checks>

Not checked:
- (always list: what you did not run, which roles, which states, which widths, which
  language review is still draft)

Screenshots: sent to the founder, not committed.
```
