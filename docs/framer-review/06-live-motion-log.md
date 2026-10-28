# 06 · The live Agent figure: build log

Branch `aly-hero-live-motion` (from main, with origin/main merged on 25 Oct), worktree
`D:\alyr-live`. No Linear issue was given. Preview ports 3163 (dev) and 3164 (built site);
3165 to 3173 served throwaway copies for the LCP bisect. Edge profile `C:\t\liveprof`.
Lean path of `alyr-design-review` (one figure, the founder's decision already taken); the
two critics were not run.

## The founder's decision (25 Oct 2026, relayed in the brief)

The homepage hero's ALYR Agent figure (and `/agent`'s, which reuses it) may move
continuously: the one exception to "plays once". Conditions: a pause/play control with its
name in English and Arabic; it stops off screen, in a hidden tab and with reduced motion; the
static HTML is the settled state; one event every 3 to 5 s; Volt only on what just became
true, fading back; no flashing; transforms and opacity only; CLS 0. Recorded as D-058 and in
`alyr-design/motion.md`, "The one exception".

## What was built

- **Scripts in `copy.ts`** (`agent.samples.*.live`, both languages): what each sample does
  after 16:20. Bakery: welcome menu (16:22), order page to Reem K. (16:23), order #1442
  received, QAR 145 (16:27), booking reminder (16:30), "Needs a look: 3 orders need
  confirming" (16:43, #1442 is then over the 15 minutes the engine waits), ready message for
  #1439 (16:45), order confirmation for #1442 (16:48, back to 2). Salon: booking page,
  booking confirmation (today 18:45), welcome menu, booking details, "Needs a look" (quiet
  regular), the 18:45 booking's reminder at 16:45 (two hours before, as `bookings/service.py`
  sends it). Home services: welcome menu, booking page, booking confirmation (Saturday 10:00),
  booking details, "Needs a look" (late cancellations). Every event is one the product sends
  (`orders/service.py`, `bookings/service.py`, the chat modules). No payment reminder is shown
  being sent: they go only when someone presses Send reminders.
- **`_site/live.ts`** works the dashboard out from the engine's sample, never from numbers
  typed into the copy: messages sent and booking reminders; orders and sales, today's bar and
  the percentages against last week by 16:20 (`view.py`'s rounding; last week's sales from the
  week's own bars, last week's orders from the shown 11%); booked for the next 7 days, new
  bookings and the booked day; the needs counts and their summary sentence; waits in the
  engine's format ("1 h 11 min" / «1 س 11 د»); the clock and the caption's time.
  Checked: 50 → 51 orders, QAR 8,520 → 8,665, 11% → 13%, 20% → 22%, 183 → 189 messages,
  7 → 8 reminders; salon 18 → 19 booked, 32 → 33 new, 88 → 93; home services 5 → 6 booked.
- **`AgentFigure.tsx`**: the HTML is the settled 16:20 state (the old version drew the feed
  hidden and the count low, then played it). After the load event and 1.5 s, and only while
  the figure is on screen (IntersectionObserver), the tab visible and reduced motion off, one
  event every 4 s (5 s on a phone). The settled list keeps its place, unseen and still read by
  screen readers; the live rows (`aria-hidden`) are drawn over it and placed with `translate`
  (a column, or the settled list's own cells in the hero's row of events between 48 and
  82 rem); a row that no longer fits fades out. At the end the changed parts fade out, the
  opening takes their place and fades in, and the script starts again. The pause button sits
  beside the status chip, drawn from the first paint and shown only while it moves.
- **`AgentDashboard.tsx`** (shared with the product, opt-in `live` prop the workspace never
  sets): a changed figure rolls inside its own inline box, a word holding a figure stays
  whole, a count that went up gets one Volt rule that fades; a bar grows by `scale`;
  `summaryRoom` draws the longer sentences unseen in the summary's place so its height never
  changes (the Arabic dual «طلبان» becoming «3 طلبات» took one more line on a phone).
  The separator space now sits inside each sentence, so a changed sentence moves nothing.
- **`_site/liveStyle.ts`**: all the new rules, as one `<style>` React puts in the head.
  `agent.css` is as on main; `agentfig.css` lost the old play-once feed rules.

## Decisions taken while building

- The founder's example "1 order needs confirming" assumed an empty Needs list; the sample
  already has 2, so the row's count goes 2 → 3 and back to 2, with the summary sentence.
- No eyebrow "Paused" state: the chip keeps "ALYR · Running"; only the button changes.
- Waits keep growing with the clock (the sample's two waiting customers are not answered in
  the script), so the longest wait reaches 1 h 16 min by 16:48. Honest, and visible.
- **LCP.** The first build moved `/`'s simulated LCP from 2.41 to 2.56 s. Two causes, found by
  swapping built files between two served copies: a `:is()` selector holding descendant
  selectors (matched against every element), and the render-blocking CSS growing at all
  (padding the built `agent.css` with 240 bytes of comment alone moved a cold run from 2.50
  to 2.63 s). Fixed by writing selectors out and inlining the live styles. Lessons in
  `verify.md` and `motion.md`.

## Checks (on the built site, `out-site`, served compressed)

- `pnpm site:check`: pass (build, EN/AR parity, banned words and prices, links).
  `pnpm exec tsc --noEmit` and `pnpm lint`: clean.
- axe 4.14 (`pnpm site:a11y`) on `/`, `/ar`, `/agent`, `/ar/agent`, 1440 and 390, light and
  dark: no issues. Also axe while moving and while paused on the four pages: none.
- Keyboard: the pause button is reached by Tab (13th stop on `/`), 44 × 44, Volt focus ring;
  Enter pauses (nothing changed in 9 s), Space plays again (moved within 5 s); its name is
  "Pause the sample" / "Play the sample", «إيقاف حركة المثال» / «تشغيل حركة المثال».
- Lighthouse mobile, lowest of 3: `/` Performance 98, LCP 2.41 s, CLS 0; `/ar` 97, 2.41 s;
  `/agent` 98, 2.41 s; `/ar/agent` 98, 2.41 s; Accessibility 100 on all. Cold single runs on
  `/`: 2.48 to 2.51 s, against main's 2.50 to 2.52 s on the same machine (main itself sits on
  the 2.5 s line in a cold run).
- Layout shifts over a whole cycle (40 s, PerformanceObserver, no screenshots): none from the
  figure on `/` 1440 and 390, `/ar` 390 and 1024, `/agent` 1440, `/ar/agent` 390.
  No horizontal scroll at 320 in either language, during the cycle.
- Stops: tab hidden after 8 s, nothing moved for 12 s; scrolled away after 8 s, nothing moved
  for 14 s; reduced motion, nothing moved and the button hidden; no scripts, the full settled
  state and no button.

## Screenshots and recording (not committed)

`docs/framer-review/shots-live/`:
- `home-{en,ar}-{1440,390}-{light,dark}-*.png`: the hero at four moments (opening, the
  order in, 3 orders need confirming, confirmed);
- `agent-{en,ar}-{1440,390}-{light,dark}-*.png`, `agent-en-1440-light-salon-13s.png`,
  `agent-ar-1440-dark-homeservices-14s.png`;
- `nojs-*.png`, `reduced-en-1440-light-06s.png`, `kbd-*-focus.png`;
- `hero-live-1440.webp`: about 14 s of the hero at 1440, 16:22 to 16:43, from screencast
  frames (CDP) assembled with ffmpeg;
- `before/`: the hero before this work; `dev/`: working captures.

## Not checked

- Safari and Firefox (Edge only); a real phone (emulated 390 and 320 only).
- A screen reader by ear (the live rows are `aria-hidden`; the settled list stays readable).
- 768 px Arabic during the cycle by eye (English 768 was looked at; CLS measured at 1024 AR).
- The Arabic of the new lines by a native reviewer (ALY-66), and the new sample names
  (Reem K., Maha J., Khalid A., Noura S., Layla A., Fahad M., Saad R.) are first name and
  initial only, not checked against anyone.
- The live site: nothing deployed.
