# Homepage 2026: design critique

17 Oct 2026. Review of PR #45 on http://localhost:3105; no code changed. Shots in `review/design/`: viewport frames after a stepped scroll, headless Edge, profile `C:\t\critA`. Edge here defaults to dark, so light frames use `--scheme=light` and `dark-*` files are dark. Timing comes from DevTools runs without screenshots.

**Verdict.** A confident first build. The headline, the two-tone statement, the price sheet, the agreement and the Arabic mirroring are agency-level. It is not ready to publish: the English layout breaks at 320, LCP misses the brief, and the band's phone drawings are squashed. The two moves that make it ALYR, the fold and the sticky story, don't land yet.

## Your three observations

- **13,900 px: confirmed.** English is 13,934 px at 1440, Arabic 13,631, and English at 390 is 17,811 (21 screens). The Carbon band alone is 4,671 px, 34% of the page. About 1,300 px can go without losing content (P1-2, P1-6, P2-9).
- **Empty Carbon band: half right.** In a full-page capture the sticky figure is painted once, which is an artifact of the capture. In real scrolling the band is not empty, but each screen is about 75% bare dark, because one three-line paragraph gets 666 px of scroll (P1-2).
- **FIG 01 says "sample" twice and wraps: confirmed.** FIG 02, 06 and 07 do the same (P1-5).

## P0: must fix before publishing

**P0-1. At 320 px the English page is 347 px wide and the sticky contact bar slides off the screen.** This is in the Carbon band's booking figure, English, 320 wide. The booking phone overflows its column by 27 px. That widens the layout viewport to 347 × 760, so the fixed bar sits at 691–760 px on a 700 px screen and only 9 px of it shows. The booking phone is also cut at the right edge. Arabic is unaffected (320 px). Shots: `x320-en-booking-y6900.png`, `x320-en-bar-y1200.png`. The cause is that the grid tracks size to content.
Fix in `home.css`:
```css
.story-stage { grid-template-columns: minmax(0, 1fr); }
.d-strip     { grid-template-columns: minmax(0, 1fr); }
.d-days      { min-width: 0; }
```
Add `innerWidth === 320` at 320 in both languages to the pre-publish checks.

**P0-2. The fade on the hero body pushes LCP to about 3 s, even unthrottled.** Hero, both languages, all widths. Localhost: FCP 188 ms, LCP 2,964 ms on `.hero-body`; throttled (4G, 4× CPU) 4,980 ms. With the fade removed by injected CSS, LCP is 172 ms. Fonts finish at 139 ms, so the build log's font diagnosis is wrong: Chromium reports the opacity-0 paragraph late. The brief requires LCP < 2.5 s.
Fix: give the copy below the headline a keyframe that moves but does not fade.
```css
@keyframes hp-rise-solid { from { translate: 0 8px; } }
.motion .hero-body, .motion .hero-actions, .motion .hero-note, .motion .hero-facts li { animation-name: hp-rise-solid; }
```

## P1: should fix

**P1-1. The signature fold ends as a flat rectangle.** This is the entry to the Carbon band, all widths. The three planes overlap by 1 px, so once they land there is no gap, no 45° cut and no brand mark: just a straight Carbon edge (`z-fold-en-end.png`). While they move, hairline seams flicker (`z-fold-en-320ms.png`).
Fix: give the planes the symbol's gap (10 of 160 units, about 6 px on an 88 px strip). Plane 1 runs to `calc(46% - 3px)`. Planes 2 and 3 start at `calc(46% + 3px)`. Plane 2's diagonal points move 3 px toward the start and plane 3's 3 px toward the end. Mirror these in the `[dir="rtl"]` rules. Paper then shows through as a permanent fold.

**P1-2. The sticky story changes figure half a step early, and its pacing is thin.** Carbon band, both languages, 1440. `data-at` switches when the next module's 666 px *box* crosses mid-screen, when its heading is still at 83% of screen height and the visitor is reading the previous module (`en-1440-light-06-y5100.png`: "Team inbox" text, Bookings figure). Each screen holds a 22 px heading and two lines; the phone sits 335 px from the rail.
Fix:
- In `HomeMotion.tsx`, observe `[data-text] h3` with `rootMargin: "-38% 0px -52% 0px"` and read the index from `closest("[data-text]")`.
- `.story[data-story-on] .story-text { min-height: 60vh }`, which saves about 470 px.
- `.story-text h3 { font-size: clamp(1.75rem, 1.1rem + 1.6vw, 2.5rem) }`.
- `.story-text p { font-size: 1.1875rem; max-width: 26rem }`.
- `.story-stage { place-items: start center; padding-inline-end: 0 }`.

**P1-3. On phones the band's drawings are squashed or covered.** This is the Carbon band, both languages, 390.
- Tracking: the card shows only "Order received", and the person card is pushed into it (`en-390-light-07-y4900.png`, `dark-en-390-y5000.png`).
- Booking: the summary bar covers the services and "Choose a time", and the time slots peek out underneath. At 1440 too, the "Y" avatar sits outside the shop strip (`z-story-booking-en.png`, `en-390-light-09-y6300.png`).

The cause: `.d-main` children have `flex-shrink: 1`.
Fix:
```css
.d-main > * { flex-shrink: 0; }   /* content crops at the screen edge, like a real phone */
.sf-book .d-choice:not(.on), .sf-book .d-section:nth-child(3) { display: none; }  /* hides the day row; the bar's summary already says "Sun 18 Oct · 4:30 PM" */
.story-fig .d-bar { background: var(--d-card); backdrop-filter: none; }
@media (max-width: 61.99rem) { .sf-track .d-person, .sf-track .d-note { display: none; } .sf-book .sf-phone { height: 24rem; } }
```

**P1-4. The first screen tells a WhatsApp company's visitor that its own WhatsApp isn't working.** This is the hero and price call to action, both languages. "Our WhatsApp line opens soon. Until then, write to…" appears twice (`z-en-1440-hero-cta.png`).
Fix: in the email state, set `ContactNote` to `replyShort` plus the address: "A person from ALYR replies. hello@alyr.qa". Keep "opens soon" for the FAQ at most.

**P1-5. FIG captions repeat "sample", and FIG 01 wraps with an orphan.** This is the hero and band, both languages.
Fix in `copy.ts`: set `fig.fictional` to "Fictional bakery" (Arabic «مخبز غير حقيقي») and leave "sample prices" in each caption's text. Shorten FIG 01 to "Order page and its record, sample prices", which fits on one line at 512 px. Add `.cap { text-wrap: balance }`.

**P1-6. How it works has a dead zone of about 520 px at 1440.** Both languages. The report sits in columns 8–12 and the left 60% is empty for its full height (`en-1440-light-09-y7650.png`).
Fix: make the report row a 12-column grid, with 01 §2's go-live note at H3 size and a secondary `ContactButton` in columns 1–6, and the report in 7–12.

**P1-7. Without JavaScript the header is transparent everywhere.** This is the header, both languages. Over the band and the closing call the Carbon wordmark disappears and only the Volt plane of the logo shows (`nojs-en-1440-band-b.png`).
Fix: make the opaque header the default and transparent only with JS at the top:
```css
.top { background: color-mix(in srgb, var(--canvas) 94%, transparent); backdrop-filter: saturate(1.4) blur(14px); border-bottom-color: var(--line); }
.al-js .top:not([data-scrolled]) { background: transparent; backdrop-filter: none; border-bottom-color: transparent; }
```

**P1-8. Dark mode loses both Carbon moments.** This is the band and the closing call, dark mode. `#15171a` on `#0e1012` is 1.05:1, so the band, the fold and the closing panel barely separate from the page (`dark-en-1440-02-y1700.png`, `dark-en-1440-15-y12750.png`).
Fix: in the dark block, give `.band-in, .band-fold i, .story-fig, .cta` the background `#1d2024`, and give `.band-in, .cta` a `border-block: 1px solid var(--dark-line)`.

**P1-9. The hero steppers are 28 × 42 px targets on phones.** This is the hero, both languages, 390 and 320 (measured). The brief asks for 44 px.
Fix: drop the `inset-block: -7px` override and set `.d-stepper button::after { inset: -8px; }`, which gives 44 × 44 without overlap across the 18 px digit.

## P2: polish

1. **Time formats.** One page uses four: "Fri 13:10", "4:02 PM", "Wed 4:05 pm" and "14:05". Use "4:05 PM" in the drawn customer pages, unless the product really prints lowercase.
2. **Hero facts rule.** It stops at 40 rem (x = 720), which is not a column line. Set `.hero-facts { max-width: none }` so it ends at column 7.
3. **Address in sentences.** The 400 weight of Plex Mono never loads, so the address renders at 500 and reads bolder and larger than its sentence. Use `.contact-note .address { font-family: inherit; font-weight: 500 }` and keep mono only in the closing call.
4. **Button arrow.** It floats like a superscript about 12 px from the notch. Set `.btn .btn-arrow { margin-top: .5rem }` and `.btn-notch { padding-inline-end: .625rem }` so it tucks under the cut.
5. **Nav focus ring.** The ring touches the text at the sides (`z-focus-6.png`). Set `.top-nav a { padding-inline: .375rem; margin-inline: -.375rem }`.
6. **Light header over the band.** The header is a pale strip with headline text ghosting through (`en-1440-light-04-y3400.png`). Set `data-on-dark` while it overlaps `.band` or `.cta`, and switch it to Carbon at 92% with white links.
7. **Empty roadmap slots.** "Next" and "After that" are empty boxes. Add the hollow pending dot and "Not named yet", so the dashed rule reads as waiting rather than missing.
8. **Two Volt buttons on phones.** When the sticky bar is up, the header button shows too. Use `:root:has(.bar[data-show]) .top .btn-volt { visibility: hidden }`. The closing button is not full width at 390: set `.cta-actions { justify-items: stretch }` at ≤30 rem.
9. **Section rhythm.** About 330 px separates blocks at 1440. Use `--sec: clamp(3.5rem, 7vw, 6rem)` and `.rule { margin-bottom: clamp(2rem, 4vw, 3.5rem) }`, which saves about 600 px.
10. **Motion failsafe.** On throttled 4G the choreography arrived about 100 ms before the 2.5 s failsafe would fire, so slower phones will silently get no motion. Clear `__alyrMotion` in `HomeMotion`'s effect (hydration proves JS runs).
11. **Footer.** "Built in Qatar." sits at the far start of the row and the Doha time at the far end, but the brief says beside. Set `justify-content: flex-start; gap: .25rem 1.5rem`.
12. **Arabic order page.** It mixes "QAR 38" and "38 ر.ق" on one screen. Flag it for ALY-66.
13. **`/chat`.** It keeps WhatsApp-green bubbles and "ALYR adds payments, books and a website", which contradicts the homepage's unnamed slots. Queue the alignment PR.

## What holds up

- **First impression.** The headline is the best thing on the page, but the first screen still has Ramp's layout (paper, faint grid, lime button, black grotesque, UI on the right). Its only ALYR marks are a 34 px phone corner and a 12 px notch.
- **Motion.** The hero timing matches 01's P1 plan exactly. CLS is 0.000–0.012 and the Volt rail fill is right. Reduced motion gives every module its own figure (`rm-en-1440-band-a.png`).
- **Arabic.** Every cut, notch, arrow, rail and offset mirrors correctly, and nothing looks squeezed or translated.
- **Accessibility.** Headings run h1 to h4 without skips, landmarks are named, focus follows reading order and rings are visible. Muted text is about 5.6:1.
- **`/chat` and `/ar/chat`.** Nothing is broken at 1440 or 390, there is no overflow and every `/#…` link resolves (`chat-*.png`).

## The five changes that would lift the page most

1. **Make the fold the signature.** Put gaps in the band planes (P1-1), reuse the same fold at the top of the closing call, and use the dark-mode band tone (P1-8).
2. **Own the first screen.** Set the hero figure on a Carbon plate in columns 8–12, its top start corner cut at 45° (6 rem), with a 0.5 rem Paper gap at 45° between the phone and the order record. Add the hero note and caption fixes (P1-4, P1-5) and the LCP fix (P0-2). Then no one mistakes it for Ramp.
3. **Make the sticky story read in sync.** Trigger on headings, use 60 vh steps, larger step type and a centred figure (P1-2).
4. **Draw every crop like a real screen.** No shrinking, no covered content, no overflow at 320 (P0-1, P1-3).
5. **Tighten the rhythm and add a mid-page action.** Use How it works' empty half (P1-6) and the shorter section spacing (P2-9). The page drops to about 12,500 px with nothing removed.
