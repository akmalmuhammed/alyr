# ALYR Shelf and ALYR Docs: design and motion critique

21 Oct 2026. Independent design critic (`alyr-design-review`), PR #102, branch `aly-shelf-documents-pages`, built site at http://localhost:3105. No code edited. The screenshots are in `review/design/` (not committed), taken with headless Edge on profile `C:\t\critA3`.

**Counts:** 1 P0, 5 P1, 11 P2.

## Verdict

Both pages are in the family. The template, the menu, the footer, the suite and the "works with" rows read as one suite of six, and the craft of the drawn screens and the paper is high. The two signature figures are the right idea and run in the right order. But on every width they play almost entirely below the fold, so the moment that should sell each product happens unseen. The Docs page also tells each story three times and is 56% longer than /bookings. Fix the trigger and the figures' fit, cut the repetition, and choose one plate style, and these pages are ready to ship.

## P0

**P0-1 · The signature figures play out of sight.** Both pages, every width, both languages.
- **Measured:** SiteMotion adds `.is-in` at 8% visibility. When Shelf FIG 01 starts at 1440×900, only 162 of its 605 px are on screen. Docs FIG 01 shows 178 of 860 px, Shelf at 390 shows 213 of 1,340 px, and Docs at 390 shows 256 of 1,891 px. Each plays out in 2.0 to 2.8 s, so by the time it is scrolled into view it has finished.
- **Docs also cannot fit:** with the section heading at the top, the cause ("Record the payment"), the result, the PDF and the Volt "Sent" tick are all below the fold (`docs-1440-light-moment-t1900.png`). Framed by itself the figure is 780 px tall (`docs-1440-light-moment-figure.png`).
- **On phones:** Mariam's "Sold out" and Docs' "Sent" have finished before anyone reaches them.
- **Fix:**
  1. Give `[data-sig]` its own observer in `SiteMotion.tsx`: `{ threshold: 0.6 }` at ≥ 62rem, or `rootMargin: "0px 0px -35% 0px"`.
  2. Make Docs FIG 01 fit `100svh − header − bar`. Crop the A4 at its totals band, since FIG 03 shows the whole page: `.pf-a4 .pp-sheet { aspect-ratio: 210 / 200 }`, with the dashed crop edge that `.is-crop` already has. Add `.pf .sig-stage { align-items: start }`.
  3. Below 62rem, give each `.sig-part` its own `data-m` and key its delays on its own `.is-in`: `.motion .lo-a.is-in …`, `.lo-card.is-in …`, `.lo-b.is-in …`. This stays CSS-only, and the HTML is still the end state.
  - Screens: `shelf-1440-light-moment-t1300.png`, `docs-1440-light-moment-t700.png`, `docs-390-light-moment.png`.

## P1

**P1-1 · Docs repeats every story three times, and Shelf twice.**
- **Height at 1440:** /docs is 13,651 px and /shelf 11,667 px, against /bookings at 8,738 and /accounts at 8,840.
- **Docs repeats:**
  - RC-0042 on A4 appears in the "The paper" demo tab, FIG 01 and FIG 03.
  - No CR appears in its demo tab, FIG 05, its own section, and Inside.
  - The correction appears in the "Correct" tab, the flow's "A correction" and FIG 04.
- **Shelf repeats:** "The last one" is a demo tab, the flow's tab 01 and FIG 01.
- **Fix:**
  - Docs: drop the demo tabs "The paper" and "No CR". Fold `#cr` into `InsideBlock`, as 03 §3.4 specified: the FIG 05 crop beside the "No CR number on file" line.
  - Shelf: drop the demo tab "The last one", which leaves 4 tabs, as 03 §2.2 asked.
  - Target ≤ 10,500 px for Docs.
  - Screens: `docs-1440-light-full.png`, `bookings-1440-light-top.png`.

**P1-2 · Two plate styles on one page, and one of them is rounded.**
- **The rounded plates:** Shelf FIG 03 (`.pk-phones`), Docs FIG 04 (`.pk-phones`) and FIG 05 (`.pk-cr-plate`) use `border-radius: var(--radius-lg)`. These are new in this PR; no other page has them.
- **Against:** Docs FIG 03 uses the cut plate with crosses (`.pp-plate`), and "Rounded panels and pills are not ALYR" (alyr-design §1.4).
- **Fix:** move `.pp-plate` into `kit.css` as `.pk-plate`, with the cut, the crosses and the `[dir="rtl"]` polygon, and use it for all three. Delete both `border-radius` lines.
- Screens: `shelf-1440-light-order-page.png`, `docs-1440-light-issued.png`, `docs-1440-light-cr.png`.

**P1-3 · The paper's small type cannot be read.**
- **Measured:**
  - FIG 01's A4 labels are 8.3 px at 1440, and its table sub-heads about 7 px.
  - FIG 03's A4 at 390 is 5.1 to 7 px.
  - FIG 05, the one paper whose words are the point ("…is a receipt and is not a tax invoice"), is 8.6 px at 390.
- **Fix:**
  - FIG 05: `.pk-cr-plate .pp-noncr { font-size: max(2.7cqi, var(--fs-small)) }` and `.pk-cr-plate .pp-note .pp-sheet { font-size: max(2.7cqi, var(--fs-caption)) }`.
  - Below 48rem, FIG 03 shows the roll at true size and the series rail. In place of the A4, show its head only, at a width where labels reach `--fs-micro`, or a 210 mm dimensioned outline.
  - FIG 01: the crop in P0-1 enlarges the A4 by about 1.3×.
  - Screens: `docs-390-light-paper.png`, `ar-docs-390-light-cr.png`.

**P1-4 · The Arabic heroes show no product in the first screen.**
- **Measured at 1440×900:** the Arabic H1s take four lines, and the demo tabs sit at y 865 on /ar/shelf and /ar/docs. English /shelf has them at 725 and /bookings at 634. English Shelf also runs to four lines, because "Everything you sell, on one shelf." is wider than `.pk-title { max-width: 18ch }`.
- **Fix:**
  - Add `[lang="ar"] .pk-title { max-width: 24ch }`, so «كل ما تبيعه، في مكان واحد.» and «تُسجَّل الدفعة، فيصدر الإيصال.» each fit one line.
  - For English Shelf, add a `wide` hero option that sets `max-width: 21ch`, used by /shelf only, so the other pages are unchanged.
  - Recheck 390 and 320 for orphans.
  - Screens: `ar-shelf-1440-light-top.png`, `ar-docs-1440-dark-top.png`, `shelf-1440-light-top.png`.

**P1-5 · At 320 the Shelf figure's row collapses in Arabic.**
- **What happens:** «تشيز كيك الكنافة بالفستق» wraps to three lines, and the "Only 1 left today" pill becomes a three-line black block beside the stepper.
- **Fix:** under 24rem, `.lo-row { grid-template-columns: auto minmax(0,1fr) } .lo-end { grid-column: 1 / -1; justify-items: start }`, and restore `white-space: nowrap` on `.lo-row .d-pill.few`.
- Screen: `ar-shelf-320-light-moment.png`.

## P2

1. **The parts do not stand on one line.**
   - **Where:** FIG 01 on both pages. The labels sit at three heights (Docs at 511, 649 and 679 px). The construction rule runs behind the parts at mid-height, so it shows only in the gaps, as a stray line.
   - **Fix:** `.sig-stage { align-items: start }` and `.sig-rule { top: auto; bottom: 0 }`, so the three parts hang from one label line over one baseline.
   - Screen: `docs-1440-light-moment-figure.png`.
2. **Aisha's end state contradicts the card.** Her row still says "Only 1 left today" with a live stepper while the card says 0. **Fix:** fade `.lo-a .lo-pill, .lo-a .lo-step` with `sig-out` at `28 * var(--stagger)`, as Mariam's do.
3. **Volt on a warning.**
   - **Where:** the Shelf flow panel's "Only 1 left today" chip and the demo's "Put back" row (`tone: "signal"`). Low stock and stock given back are not "true or done".
   - **Fix:** a neutral tone; keep Volt for the confirmed Sold row.
   - Screen: `shelf-1440-light-how.png`.
4. **Dark-mode paper glares.**
   - **What:** `--doc-paper` dark (#e3e6e1) on an A4 of 520 × 735 px is the brightest thing on the page.
   - **Fix:** step the paper to `{color.grey.873}`, the band to `.807`, and the rule one step darker. ink-2 #555d65 stays above 4.5:1.
   - Screens: `docs-1440-dark-moment.png`, `docs-1440-dark-paper.png`.
5. **Captions disagree.** FIG 02 says "Sample data, fictional bakery"; FIG 01, 03, 04 and 05 say "Sample, fictional bakery". Use one.
6. **Callout 3 breaks a column.** In the Shelf Stock screen, callout 3 sits inside row 1 and pushes its buttons 36 px left of the other rows. **Fix:** `position: absolute; inset-inline-end: -1.75rem` in the row gutter. Screen: `shelf-1440-light-screen.png`.
7. **The Arabic menu's states are ragged.** The Agent card's state sits 20 px above the others. **Fix:** `.pm a.pm-link { grid-template-rows: auto auto 1fr auto } .pm-state { align-self: end }`. Screen: `ar-docs-1440-dark-menu.png`.
8. **A bare amount on the A4.** The A4 party row's third column shows "64.00" with no label or «ر.ق». Add the engine's label pair, or drop it.
9. **FIG 05 has no crop edge.** The totals band floats with no sign of the receipt above it. Add the dashed crop line at the top, and start the crop from the last line item.
10. **Demo tab names mix forms.** Shelf has "Sold out", "By code" and "Unpaid"; Docs has "Receipt", "The paper" and "No CR". /bookings uses verbs (Book, Confirm, Remind). Name the tabs as verbs; the copy critic owns the words.
11. **Literals instead of tokens.**
    - **Where:** `moment.css` has 11.5 px and 12.5 px, radii of 14 px and 18 px, .375rem, and `font-weight: 650`. `paper.css` sets the roll in px.
    - **Fix:** use `--fs-*`, `--radius-*` and `--weight-*`. If the roll needs true-scale sizes, add them to `component.document` as tokens.

## What holds up

- **The Products menu:** six columns at 1440, 3 × 2 at 1100, and a six-row phone menu with 49 px rows. By keyboard, Enter and Space open it, Tab runs through all six products, Escape closes it and returns focus to the button, and tabbing out closes it.
- **The footer, the homepage suite and the "works with" rows:** six products, in order, in both directions, with crops at true size (`home-1440-light-suite2.png`).
- **Motion order and timing:** within 15 ms of 03 (Shelf's 0 at 1,309 ms, Docs' Sent at 2,645 ms); each ends under 3 s with one Volt mark.
- **The Docs wipe:** the paper drawing itself along the fold's diagonal is vivid and on brand (`docs-1440-light-moment-t700.png`).
- **RTL:** the parts mirror, the paper stays Arabic-first, and the inset rules and cuts flip. Reduced motion shows complete end states.
- **The checks I ran:** axe 4.14 found no violations on five runs. `scrollWidth` is 320 on all four pages.

## The five changes that would lift the pages most

1. Fire each figure once it is 60% visible, make Docs FIG 01 fit one screen, and on phones run each part when it arrives (P0-1).
2. Cut the Docs page by about 3,000 px: drop two demo tabs and fold No CR into Inside (P1-1).
3. Use one cut-corner plate for every figure (P1-2).
4. Make the paper legible: a type floor on FIG 05, the roll only on phones, and a cropped, larger A4 in FIG 01 (P1-3).
5. Write the hero lines so each half fits one line in Arabic and in English Shelf, which brings the demo into the first screen (P1-4).

## Not checked

- No scripts: the capture script has no option for it. The builder captured it.
- Lighthouse.
- Safari, Firefox and real phones.
- Screen readers by ear.
- 1024 and 1280 for the figures. Of the in-between widths, only the 1100 menu was checked.
- Offer on.
- The WhatsApp and "opens soon" contact states.
- axe beyond five runs.
