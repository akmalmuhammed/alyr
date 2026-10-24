# The homepage's rhythm in code: proposals 2 to 5

24 Oct 2026. Branch `aly-homepage-rhythm`, cut from `main` at dbb3b94 (what is live), worktree
`D:\alyr-rhythm`. The founder approved proposals 2 to 5 of `01-proposals.md`; proposal 1
("One shop, six products") is being prototyped in Framer first, so the products section is
left exactly as it was. No Linear issue was given. Preview server: `pnpm site:serve` on port
3163; Edge profile `C:\t\rhythmprof`. Screenshots in `shots-code/` (not committed).

Lean path of `alyr-design-review` (four bounded changes to existing sections, no new
section): no research or critics; the checks of stage 9 are below.

## P2. Show the dashboard once

Done. The hero keeps the dashboard and the feed. The ALYR Agent section no longer repeats the
screen's opening sentence ("Week so far: 50 orders…"): it opens on **Needs you now** and the
**suggestions with their reasons**, across the window, numbered 1 and 2. "See the whole
screen" («اعرض الشاشة كاملة»), a native `<details>` that works without scripts, opens the
rest (the sentence, Done for you, the four numbers, the week, hours, items, money owed),
numbered 3 and 4 where the callouts point. The callouts went from five to four and follow
the new order; the two about the comparison became one ("Like with like… with percentages
only when both weeks have 20 or more"), and the last two wait with the parts they explain.

- `copy.ts`: `home.spotlight.more` (type and both languages), the callouts reordered.
- `HomePage.tsx`: the spotlight passes `more`.
- `agentfig.css`: the spotlight's marks renumbered, the closed state, the disclosure's
  style, the callouts kept beside the window; the old phone-only cut is replaced by the
  disclosure at every width.
- On phones the hero's crop also shows Needs you now (it stops after Done for you), so the
  phone still sees that part twice; the suggestions are new to the reader there.

## P3. Vary how sections open

Done. Three openings instead of one (`home.css`, "how sections open"; markup in
`HomePage.tsx`):

| Section | Opening |
|---|---|
| How we work | **Split**: the heading on the start side, the lead on the end column (columns 8 to 12), standing on the heading's last baseline |
| By business | **Full**: the heading alone, on one line across the grid at 62rem and up (it balances onto two where it does not fit) |
| One order, start to finish | **In the plate**: no cross rule; the heading, lead and link open inside the Carbon plate, above the tabs |
| ALYR Agent | **Split**: eyebrow and heading at the start, the lead and "See ALYR Agent" on the end column at the heading's baseline |
| The products | Unchanged (P1 is in Framer) |
| Trust, Questions | Unchanged: they already open differently (a figure beside; a sticky side heading) |

The gap under a section rule is `--space-5` on the homepage (was `--rule-gap`, 56 px at
1440), and the space between an opening and its content `--space-4` or `--space-5`. Section
top to its content at 1440 (EN): How 269 px, By business 231, One order 340 (the tabs inside
the plate), ALYR Agent 384 (its lead is four lines on the end column; the switch is the
first content). It was about 450 for each.

All values are tokens; one new pattern (`.open-split`, `.open-full`, `.open-plate`) and no
new breakpoint. Below 62rem every opening stacks.

## P4. The rule breaks

Done, on the homepage and wherever the same component is used:

| Break | Fix | Where it also applies |
|---|---|---|
| `.fx-pulse`: three radial-gradient glows with a literal `rgb(183 243 74 / .45)`, looping every 1.2 s | One solid Volt tick cut at 45° (`.fx-signal`) that travels the wire in use **once per step** (`--dur-4` + `--dur-3`, `--ease`), remounted per step; moved by `translate`, not `inset`; mirrored in Arabic; vertical on phones. The lit node's glow (`box-shadow` with a literal) is gone; the wire in use is solid `--volt` instead of a literal at 55% | `FlowDiagram` on every product page's "How it works" (`/chat`, `/bookings`, `/agent`, `/accounts`, `/shelf`, `/docs`, both languages) |
| The drawn "Pay QAR 38" in the Chat crop is Volt and cannot be pressed | `d-btn is-line`, the outline | The drawn order page's "Confirm" button (`PageDrawings.tsx`) on the product pages, same rule. The Agent dashboard in showcase mode (site only: the homepage, `/agent`, `/agent-sample`) drew its first suggestion's button in Volt; in showcase it is now the outline (`AgentDashboard.tsx`, one condition; the workspace is unchanged) |
| How we work's number discs are Volt | Carbon discs with white mono numbers (`--carbon`, `--on-band`, the `--mark-ring` ring, Volt only in dark, as `.co-n`); the rail's fill keeps the Volt progress | `/agent`'s step 3 disc (`.pk-step-n`) was Volt too: now Carbon |
| Two Volt buttons at the closing call (header and call) | `SiteMotion` sets `data-at-closing` on `<html>` while `#contact` is on screen; the header's button is then the outlined twin, drawn in the band's colours when the header is Carbon over the call | Every page (the closing call is in `Shell`) |
| "ALYR Agent reads the orders…" (banned verb) | "counts" / «يحسب» | |

The Arabic line is a draft for the native review (ALY-66). Not changed, and why: the feed's
status dot still lights once with one ring whose keyframe carries a literal colour
(`agentfig.css` `af-light`; it plays once, which the rules allow); `/bookings` says "ALYR
reads your hours", which is reading data, not understanding, and the proposal did not list
it; the plates' dotted grids carry literal greys (decoration the proposal did not list).

## P5. One order opens on a finished frame

Done (`FlowDiagram.tsx`). The figure is drawn, in the HTML and until it is read, on the
first story's **last** step: Sara's chat with the order page, the order and the
confirmation; ALYR's six lines of work; order #1442 on the team's screen; "06 / 06 She gets
the confirmation". It was step 1: one message, two lines and "Nothing new yet". Once 60% of
it is on screen (or its top is past the middle, for a phone where it is taller than the
screen) and motion is wanted, it goes back to step 1 and plays forward, as before, with the
pause control. With reduced motion it never plays: it stays finished, a story picked from
the tabs opens finished too, and the steps are read one tap at a time. Without scripts it is
the finished frame.

The same component is every product page's "How it works" (`FlowSection`), so all six pages
(both languages) open their flow finished too. The other demos already opened finished
(`ProductDemo`, site audit F2); `ChatXray` draws each scene finished; `LastOne` and
`PaymentPaper` have the end state in their HTML. None other opened empty.

## Verification (24 Oct 2026, on 6e7308a; the later commit only touches docs, skills and the allowlist)

- `pnpm site:check`: build, EN/AR parity (6,112 strings), internal links (1,134) pass;
  banned words passes after removing the allowlist entry for the old "reads" line.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `node scripts/design-check.mjs`: clean.
- `pnpm site:a11y --runs=3`: axe on all 14 pages, 1440 and 390, light and dark: 56 runs,
  no issues. Lighthouse mobile, lowest of 3: `/` Performance 95, Accessibility 100, LCP
  2.41 s, CLS 0; `/ar` 98, 100, 2.41 s, 0.
- Page height (same probe, before → after): `/` 1440 12,154 → 10,958 px; 390 16,614 →
  15,732; 320 18,111 → 17,116. `/ar` 1440 12,046 → 10,807; 390 15,893 → 15,006.
- No horizontal scroll at 320 in either language (`scrollWidth` = 320).
- Section top to content at 1440, before → after (EN): How 408 → 269, By business 309 →
  231, One order 424 → 324, ALYR Agent 487 → 368. Arabic: 410 → 296, 336 → 245, 461 → 311,
  502 → 335.
- Screenshots in `shots-code/` (not committed): How, By business, One order, ALYR Agent, the
  products' Chat crop and the closing call, EN and AR, light and dark, 1440 and 390, reduced
  motion (48); full pages of `/` and `/ar` at 1440 and 390; `/chat` and `/agent`'s "How it
  works" in both languages; `wip/` has the motion runs (the flow playing, the closing call's
  header outline with motion on).

## Not checked

- A real iPhone or Safari (Chromium Edge only); a screen reader beyond axe.
- The flow's tick and the start at 60% timed in a run without screenshots (seen in captures
  only); the moment it goes from the finished frame back to step 1 has not been judged by the
  founder.
- The header's outline at the closing call on a phone (the header has no button below
  62rem; the bar hides there already) and with scripts off (both stay Volt then).
- The Arabic of the changed lines (callouts, «يحسب», «اعرض الشاشة كاملة») is a draft for ALY-66.
- 1024 and 1280 widths for the split openings; keyboard pass through "See the whole screen".
