# 09 · The hero film: build log

28 Oct 2026, Site and brand lane. Branch `aly-hero-film` from `origin/main` (2221f51), worktree
`D:\alyr-film`. No Linear issue was given. Preview ports: 3151 (the built site), 3152 to 3169
(throwaway servers for Lighthouse, main's build on 3158), 3153 (a dev server, stopped); never
3100. Edge profiles `C:\t\film*`. Lean path of `alyr-design-review` (the founder chose the design
on the prototype; the two critics were not run). Not merged, not published.

## The founder's decision (28 Oct 2026, relayed in the brief)

After four Framer prototypes of the hero (`D:\alyr-doodle\docs\doodle-study\03-pro-brief.md`):
"go with D and publish to home page". D is "Explainer: one afternoon at Qirfa, in the product"
(`04-d-log.md`). Recorded as **D-062**: the hero is the film; the hero's live ALYR Agent figure
(D-058) leaves the hero (the Agent section's figure and `/agent`'s stay as they were); "the
product is the illustration" in motion.

## What was built

| File | What it is |
|---|---|
| `_site/filmScript.ts` | The script: event times, the clock, the canvas (world rects, lanes), the camera (the prototype's, ported), the editor's light, captions, and `tracks()`: one keyframe track per moving part. `filmCss()` writes them as CSS |
| `_site/HeroFilm.tsx` | Server: the figure, its first line for screen readers, the plate (SVG with the band edge), the canvas clip, the last shot, the week caption, the closing fold's cover, the bar (shop, the one Sample mark, the clock), Pause (`LoopToggle`) |
| `_site/FilmDash.tsx` | Client: the real `AgentDashboard` (showcase, `headings={false}`, `ruleLines={false}`), its top only; 16:19 worked out from the engine's sample with `live.ts` (new `undo` on an event); rolls to 16:20 when told |
| `_site/FilmScenes.tsx`, `FilmCanvas.tsx`, `FilmCaption.tsx` | The rest of the canvas, drawn after load in its own chunk: Inbox, Sara's chat, Orders, Menu › Stock, Bookings, Noor's chat, Credit accounts, Lina's chat, the lanes' names, the captions, the clock's earlier minutes |
| `_site/film.ts` | When it plays: after load, writes the tracks, starts them in two frames, aligns them; Pause; off screen and hidden-tab stops; reduced motion; the dashboard's two moments; re-aligns when the layout crosses 48rem |
| `_site/film.css` (in `home.css` by `@import`), `filmStyle.ts` | The still's styles (render-blocking, about 6 KB raw), and the canvas's (written in after load) |
| `_site/copyFilm.ts` | Every word of the canvas, English and Arabic (`copy.ts` imports it for the hero and the checks) |

The windows are the products frame's drawings (`sf-win`, `sf-row`, `sf-msg`, `sf-slots`,
`sf-line`, `sf-owed`, `sf-stock`, suite.css), so the film and the frame never drift; new CSS only
for what the frame has no drawing of (the Orders table, the stock log, the flag).

### Layout (what I chose)

- **1440 and wider:** the text on the start side: the headline (two lines, `min(--display, 5.4vw)`,
  never wrapping), the lead, "Book a check-up" and "See how we work", who replies, then the facts
  one under the other (as a row they ran into the plate at 1024). The plate is the prototype's:
  1000 × 724 at full size, from 1.5rem under the header to the hero's foot, bleeding off the end
  edge, cut by the fold from its top inline-end (x 724) to its bottom inline-start; the fold
  passes about 150 px clear of "had." at 1440. The hero is as tall as the plate.
- **62 to 90rem:** the same, the stage scaled by `--fz` (0.7, 0.76, 0.84, 0.92) on the token
  breakpoints; at 1024 the lead is held to 30rem so its first line stays clear.
- **48 to 62rem (tablet):** the text, then the plate under it at the end side (`--fz` 0.72).
- **Below 48rem:** the text, then the plate full width under it with the 3rem cut corner, the
  phone stage (390 × 360) scaled to the screen (0.82 at 320, up to 1.2 below 768); the day name
  drops from the bar.
- The headline is not the page's largest paint on Lighthouse's phone: the lead is, on main and on
  this branch alike (the headline's two lines are separate boxes). Unchanged.

### The still (what I chose): the week so far

Reduced motion, no scripts, and the first paint all show the ALYR Agent home at 16:20, under
"WEEK SO FAR". Not the three-lanes shot: at its scale (0.49) the windows are texture and their
text is unreadable as a still; the home screen is read at a glance, is the founder's stated
ending ("Week so far: 50 orders, QAR 8,520"), and is the dashboard sample's own moment. The film
starts from that frame, so nothing jumps; it then closes the fold and opens on 15:58.

## The story, and one sample world

Thursday 15 Oct 2026 (a Thursday), Qirfa Bakery. 36 s a loop at pace 1.3 (`64 × --play-4`).

| s | Clock | Shot | What happens | Caption |
|---|---|---|---|---|
| 0–3.1 | 15:58 | Three lanes | Aisha I. writes "Is my order ready?" (her #1436 has been ready since 13:20); her row tops the Inbox (Volt wash) and waits | THREE LANES · AT ONCE |
| 5.2 | 16:00 | Bookings | Noor A.'s reminder goes, two hours before her 6:00 pm cake tasting (booked Sunday); the tick | REMINDER SENT · 2 H BEFORE |
| 9.85 | 16:09 | Menu › Stock | Lina F.'s #1441 (2 items, QAR 97, on account) takes the last cheesecake: 1 → 0, Sold out, the log row; #1441 lands New; her chat gets "received" and "Put on your account. Your balance is now QAR 97."; owed QAR 12,878 → 12,975, 4 → 5 customers | STOCK 1 → 0 · SOLD OUT |
| 13.55 | 16:11 | Orders | Yusuf presses Confirm on #1441; it turns Confirmed; ALYR tells Lina | #1441 · CONFIRMED BY YUSUF |
| 16.25 | 16:13 | Sara's chat | "Hi, I'd like to order for pickup"; the order page goes back at once | ORDER PAGE SENT · AT ONCE |
| 20.35–22.45 | 16:15–16:18 | Three lanes, closer | #1440 (Omar A.) marked ready, then done when he collects (on account); Maha J. books 6:30 pm (booking 113, confirmed); "Needs a look: QAR 3,400 owed 30+ days, not reminded in 7 days" | lane tags |
| 25.25–26.95 | 16:19 | Sara's chat, Orders | "Ordered 7 items, QAR 98", "Order #1442 received: 7 items, QAR 98."; #1442 lands New | ORDER #1442 · 7 ITEMS, QAR 98 |
| 30.15 | 16:20 | ALYR Agent home | 49 → 50 orders, QAR 8,422 → 8,520, 182 → 183 messages (one Volt rule), waits 47 → 48 and 32 → 33 min | WEEK SO FAR |
| 34.6–35.94 | | | the fold closes; the canvas goes back to 15:58 under it; it opens on the three lanes | |

**Every number agrees** with the bakery's Agent sample at 16:20 and with the others:
- 50 orders, QAR 8,520: before 16:09 the week had 48 orders and QAR 8,325; #1441 (97) and
  #1442 (98) make 8,520.
- Thursday's QAR 1,102 by 16:20: #1442 98, #1441 97, #1440 64, #1439 46, #1438 112, #1437 255,
  #1436 58 (730), and #1431 to #1435 the other 372 (#1434 holds two cheesecakes).
- The cheesecake: six a day at QAR 85 = 510, sold −2 (#1434, 10:12, balance 4), −3 (#1437,
  13:40, balance 1), −1 (#1441, 16:09, balance 0).
- 2 orders need confirming, the oldest for 33 min: #1438 (Mariam S., 15:47) and #1439 (Rania H.,
  15:52), New for over 15 minutes (the engine's rule); #1441 is confirmed at 16:11 and #1442 is
  one minute old.
- 2 customers waiting, the longest 48 min: Tariq Z. (15:32) and Aisha I. (15:58).
- 2 orders ready for over 2 hours: #1436 (Aisha I., since 13:20, "3 h") and #1437 (Meera V.).
- Owed QAR 12,975 by 5 customers; 0–30 days QAR 6,678 (6,581 before Lina's order).
- 183 messages, 7 booking reminders (Noor's at 16:00 among them).
- The Inbox at 16:19 shows Sara 16:19, Omar 16:17, Maha 16:16, Lina 16:11, Noor 16:00: the
  products frame now shows the same three newest.
- Every message is the product's own wording (`orders/service.py` received, confirmed, ready,
  complete; `bookings/service.py` confirmed and reminder, with `_when_text`'s formats: "Thu 15
  Oct, 6:30 PM", «15/10 18:30»; the on-account line).

## Honesty fixes and sample changes

1. **No receipt.** RC-0039, "Receipt sent", the receipt paper and Omar's PDF are gone; nothing is
   paid in the film (no "Paid": #1440 and #1441 are on account, the rest not paid). The Money
   lane is now credit owed with "Needs a look" and an order confirmation that put an order on an
   account: both are things the live site already shows as real.
2. **One #1442** (Sara M., 7 items, QAR 98, 16:19), as the order flow and the products frame have
   it. `/agent`'s live sample had a second #1442 (Reem K., QAR 145, 16:27): it is now **#1443**
   (both its lines, both languages). Its first event, a welcome menu at 16:22, is now "Order
   confirmation sent · Order #1442 from Sara M." (the team confirms Sara's order before it has
   waited 15 minutes, so the needs count stays right). Its ready message at 16:45 is now for
   **#1435** (Khalid A.), because #1439 is Rania H.'s, still New at 16:20.
3. **The team confirms.** Orders arrive New; the film shows Yusuf's press on Confirm (the button
   darkens, the row turns Confirmed, a Volt wash, "CONFIRMED BY YUSUF"); Mark ready and Mark done
   are pressed the same way. ALYR sends the messages.
4. **Numbers add up.** The prototype's seam (six cheesecakes at QAR 185 = 1,110 against
   Thursday's 1,102) is fixed by the cheesecake's price: **QAR 85** sitewide (`copyShelf.ts`, four
   places, both languages; the Shelf page and the products frame's tile show it). The log's order
   numbers now run in time order (the prototype had #1439 at 13:40 before #1438 at 15:47).
5. **The products frame** (`SuiteFrame`, `copy.ts`): its inbox's two rows under Sara are Omar's
   16:17 and Maha's 16:16 (were Lina 16:09 and Noor 16:00), and its Bookings tile shows 6:30 pm
   taken in ink (`taken`, `.sf-slot.is-taken`), so the frame at 16:20 agrees with the film.
6. The usual rules: no AI words; nothing "coming"; one "Sample" mark, in the plate's bar; no
   WhatsApp branding or green (the chats are the product's own windows); names are a first name
   and an initial.

Left as they are, and why: `/agent`'s settled feed (16:00, 16:04, 16:09, 16:13, 16:18) is a
selection of the afternoon and does not list the film's 16:11, 16:15 to 16:17 or 16:19 events;
`/shelf`'s own story ("The last one", orders #1450 to #1452 at 16:05) is another figure set and
another day.

## Arabic: new drafts for ALY-66

All of `copyFilm.ts` `filmAr` (the figure's name and first line, «الخميس», the lanes «الطلبات،
الحجوزات، المال», the tags, the captions, «المحادثات» / «كل المحادثات», the day names, the nine
customers' names (سارة م.، عمر ع.، مها ج.، لينا ف.، نور أ.، عائشة إ.، رانيا ح.، مريم س.، طارق ز.،
ميرا ف.), their messages in the product's Arabic wording, the account line «تم تسجيله على حسابك.
رصيدك الآن 97 ر.ق.», the Orders screen's words from `Screens.tsx`'s Arabic, the stock log rows);
`loop.names.film` «إيقاف حركة الفيلم» / «تشغيل حركة الفيلم»; the products frame's two rows (عمر ع.
16:17, مها ج. 16:16); `/agent`'s live lines «الطلب رقم 1442 من سارة م.، مع صفحة تتبّعه», «الطلب
رقم 1443 من ريم ك.…», «الطلب رقم 1435 لخالد ع. جاهز للاستلام». Amounts are the number, then
«ر.ق», in `<bdi>`, Western digits.

## Performance: what it took

Measured with alternating Lighthouse runs (mobile, simulated) on main's build and this branch's,
each on its own fresh compressed server, as 08 did.

| | Main (`/`) | Film (`/`) | Main (`/ar`) | Film (`/ar`) |
|---|---|---|---|---|
| Performance | 98, 98, 98, 98 | 98, 98, 98, 98 | 98, 97, 98, 98, 98 | 98, 98, 98, 97, 98 |
| LCP | 2.41, 2.26, 2.41, 2.41 s | 2.41, 2.41, 2.26, 2.41 s | 2.41, 2.41, 2.41, 2.26, 2.41 s | 2.41 s × 5 |
| CLS | 0 | 0 | 0 | 0 |
| TBT | 15–38 ms | 12–31 ms | 34–66 ms | 13–65 ms |

The first run of `/` on each fresh server is left out above (main 91 / 2.56 s, film 78 / 4.09 s):
the server's first compression of a page, not the page. Accessibility 100 in every run.

How it got there:
1. The first build drew the whole canvas into the HTML: `/` LCP 2.71–2.79 s, TBT +80 ms. The
   film's markup also rode in the RSC payload (+5 KB gzipped) and in hydration.
2. Only the still is in the HTML now; the canvas is drawn after load in its own chunk, its words
   in `copyFilm.ts` in that chunk. `/` LCP back to main's; `/ar` stayed 0.15 s behind.
3. `/ar`'s gap was one round trip: Lighthouse's model fits main's Arabic HTML (43,752 bytes)
   in two TCP windows, and the film's (45,074) needed a third. The dashboard island now gets the
   engine's sample by reference (deduplicated with the Agent section's) and works out 16:19
   itself, and the clock's earlier minutes are drawn by the canvas: the Arabic page is now 124
   bytes (brotli) smaller than main's, the English 265.
4. TBT: on this site **every DOM insertion re-styles the whole page**, because of its
   `:root:has(...)` rules (measured: one insertion costs 10 to 20 ms on a 4× slowed phone, about
   1 ms with those rules removed). (Corrected 28 Oct 2026: the cause was the Agent figure's
   `:has(.af-more:not([open]))` rules, not the `:root:has(...)` ones; see "For the founder", 6.)
   So the canvas goes in as one commit, its windows unlaid (`content-visibility: hidden`) until
   they start, the parts start in two frames, and the film
   starts half a live beat (2.6 s) after the page settles, as the old hero's first event did. Once
   running, the film is CSS only: no React work per beat (main's live hero re-rendered every
   5.2 s, about 110 ms each on a slowed phone).
5. The closing fold was first a large Carbon square sliding behind a clip; axe took it for the
   header's background (3 contrast failures while playing). It is now a `clip-path` on a
   stage-sized cover.

## Checks

- `pnpm site:check`: build, EN/AR parity, banned words and prices, 1,368 internal links, the
  pace: pass. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (80 pass),
  `scripts/design-check.mjs` (450 files clean), `tokens-build.mjs --check`: clean.
- **axe** (`pnpm site:a11y --no-lighthouse --pages=/,/ar`, the still): no issues, 1440 and 390,
  light and dark, both languages. With motion on (a script of mine, axe-core from the repo):
  playing and paused, the same 8 combinations: no issues.
- **Behaviour** (headless Edge, motion allowed, no screenshots): it starts at the still (31.83 s)
  and plays; Pause holds the frame for 3 s, the name becomes "Play the film", `data-paused` is
  set, Play moves it again; scrolled 3,000 px away it holds, and plays on return; a hidden tab
  (simulated `visibilitychange`) holds it, and it plays when visible; the Pause control is
  79 × 44 px; reduced motion: the still, no Pause control; no scripts: the still, the control
  `hidden` in the HTML.
- **Layout shift over a whole loop** (42 s, PerformanceObserver): `/` 1440 and 390: none. `/ar`
  390 and 1440: one shift each, 0.00004 and 0.00001, horizontal, inside the drawing (a row of the
  Orders screen; the Stock window's contents). Cause not found. Lighthouse CLS 0.
- **Volt:** never more than two marks on screen (sampled every 150 ms over a loop at `/` 1440 and
  `/ar` 390: at most one counted above 0.3 opacity).
- **320 px:** `scrollWidth` 320 on `/` and `/ar`, film playing.
- **Pace:** no literal durations; `scripts/site/allow/pace.json` lost the hero entrance's nine
  exceptions (the entrance is on the pace now).

## Decisions taken while building

1. **Pause holds the frame** (as a film does) instead of finishing every move, as the other
   looping figures do; written into motion.md.
2. **The film has its own controller** (`film.ts`), not `loops.ts`: it is one infinite timeline,
   not a play, hold and fade cycle. Same stops, same Pause words, same CSS-after-load rule.
3. **The film's dashboard leaves out the sentence against last week** ("Orders up 11%, sales up
   20%…"): its percentages change width as they roll (9% → 11%) and moved the words after them.
4. **The facts stand one under the other beside the film** (a quiet line on phones).
5. **The hero's entrance is on the pace** (`1.3 × --play-4`, `--play-4`, `--play-stagger` beats).
6. **The products frame's inbox rows and 6:30 pm** were changed to match the film (above).
7. Times are written at pace 1.3 and become fractions of the loop, so `--pace` scales the whole
   film; the camera's holds and moves are the prototype's, kept as fractions too.

## Departures from the rules (for the founder)

- Values that are not tokens: the stage's sizes (1000 × 724, 390 × 360), the canvas's world
  units, the camera's views and holds, the dims (10–25%, 50–96% in the wide shots), the Volt
  holds (about 1.9 s), the `--fz` steps per breakpoint. Durations, eases, stagger and travel are
  the tokens.
- A Carbon plate behind the hero's text side (the fold has split a section before, never sat
  beside the H1).

## Files on the laptop (not committed)

`docs/framer-review/shots-film/` (9.9 MB):
- `en-1440-light-{a-three-lanes-15.58, b-team-confirms-16.11, c-lanes-at-once-16.18,
  d-order-1442-16.19, e-week-so-far-16.20}.png`;
- `ar-1440-light-{a-three-lanes-15.58, c-lanes-at-once-16.18, d-order-1442-16.19,
  e-week-so-far-16.20}.png`;
- `en-1440-dark-{c-lanes-at-once-16.18, e-week-so-far-16.20}.png`,
  `ar-1440-dark-b-team-confirms-16.11.png`;
- `en-390-light-stock-16.09.png`, `en-390-dark-order-1442-16.19.png`,
  `ar-390-light-lanes-16.18.png`, `ar-390-dark-week-so-far-16.20.png`,
  `en-320-light-team-confirms.png`;
- `en-1024-light-stock-16.09.png`, `ar-1024-light-order-1442-16.19.png`;
- `en-1440-light-reduced-motion-still.png`, `en-390-light-reduced-motion.png`;
- `en-1440-light-products-frame.png` (the frame's new rows and 6:30 pm);
- `loop-en-1440-light.mp4`: one full loop, 36 s at 25 fps, every frame seeked exactly (the
  dashboard's roll runs on its own clock in that capture, so it looks slower than live).

Every image was looked at.

## For the founder

1. The screenshots and the recording; a publish (`pnpm site:deploy` on his yes).
2. The still: the week so far (above). The three-lanes shot is one setting away (`STILL`).
3. New sample names (first name and initial): Rania H., Meera V. (and Tariq Z., Aisha I., Omar
   A., Lina F., Maha J., Noor A., Mariam S. from the prototype); booking numbers 112 and 113;
   orders #1434 to #1442; Yusuf as the staff member who confirms.
4. The cheesecake's price is now QAR 85 everywhere (was 185).
5. The Arabic of every new line (ALY-66).
6. Worth a separate fix: the homepage's `:root:has(...)` rules make every DOM change re-style the
   whole page. (Corrected 28 Oct 2026, branch `aly-has-style-recalc`: a bisect by rule found the
   cause in the Agent figure's four `:has(.af-more:not([open]))` rules in `agentfig.css`, not the
   `:root:has(...)` ones, which cost nothing measurable; the four are rewritten.)

## Not checked

- Safari, Firefox, a real phone and touch (headless Edge only); a mid-range phone's frame rate.
- A real hidden tab (simulated with `visibilitychange`); a screen reader by ear; the Pause control
  by keyboard by hand (a native button; axe and a scripted click).
- 768 px and 1280 px by eye (1024, 1440, 390 and 320 were looked at; the `--fz` steps between
  were not each captured).
- The cause of the two tiny horizontal shifts on `/ar`.
- The live site: nothing deployed. The critics (design, copy and Arabic) were not run, and no
  native Arabic review.
- Long sessions: memory over many loops; a laptop on battery.
