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
