# Content audit 03: applying it

25 Oct 2026. Site and brand lane. Branch `aly-homepage-rhythm` (PR #119), worktree
`D:\alyr-rhythm`. The founder's decisions (`02-decisions.md`) over the audit's table
(`01-audit.md`). Lean path of `alyr-design-review`: words changed in place, one section removed
and two small layout fixes, so no research or critics were run. Every Arabic line is a draft
until the native review (ALY-66).

## Stage 1: the copy, and "rule" off the site

### The rows

| Rows | What happened |
|---|---|
| 1 to 4, 6 to 17, 19 to 25, 27 to 58, 60, 61, 64 to 79, 81 to 91 | **Applied as proposed**, English and Arabic, every copy of a repeated line (rows 1 to 4, 6, 12, 33, 47, 84 touch several pages) |
| 5 (footer) | **Kept**, founder: "We do the tech. You run the business." / «علينا التقنية، وعليك شغلك.» |
| 18 (home ALYR Agent H2) | **Kept**, founder: "Every day, see what changed / and what to do next." |
| 80 (/docs hero fact) | **Removed, not replaced**, founder. The /docs opening now has two facts; the no-CR rule is still said in "What's in it" (the block row 82 renamed) and in Questions |
| 59, 62, 63 (/agent "The rules") | **Gone with the section** (founder: the rules section and its product-bar link come off the site) |
| 26 (home ALYR Agent callouts) | **Not applied: goes with the rules section**, as the brief for this pass says. The callouts stay as they were ("Shows why: …", "Like with like: …"); each still holds without rule lines, since the card's own line says what it counted |
| 41 (/chat "WhatsApp's rules, handled") | **Applied with one word changed:** "WhatsApp’s 24-hour window" / «نافذة 24 ساعة في واتساب», not "rule" / «قاعدة», because "rule" comes off the site |

So **84 rows applied** as proposed (79 rewrites or removals, row 41 with "window" for "rule",
and the audit's own 5 "Keep" rows 13, 14, 15, 35, 36, left as they are), **2 kept** by the
founder (5, 18),
**1 removed without a replacement** (80), and **4 gone with the rules section** (26, 59,
62, 63): 91 in all.

Choices inside the rows:
- Row 22: "Built never to hold your money" kept, without its full stop, so the six titles
  read alike.
- Rows 29 to 31: the answers open "No." as the audit says; the rest of each answer is as it was.
- Row 32: the allow-list entries for "Our prices go on this page soon" and its Arabic are
  removed with the line; so is the one for "reads your hours, locks the time" (row 52).
- Row 43: "Take over a chat" also rewords its body, which said the replies "go quiet" (pattern 10).
- Row 84: the Docs closing call ("set your numbers and paper") and the signature's figure
  label ("The receipt") also lose "paper"; `PAPER_LABELS` and the drawing's own words are
  sample data and stay.
- Row 20 changes the hero lead the skill quoted; the skill now quotes the new lead (stage 2).

### "Rule" off the public site (founder, 25 Oct)

- **Copy:** the /agent meta description, hero lead and report body say "reason"; the hero fact
  "Every suggestion shows its rule" is removed (two facts remain); "How a suggestion is made"
  (row 58) in plain terms: "What it counts and compares", "When a count passes its minimum, a
  card says what it found and how many"; "Up to three suggestions, each opening the rows it
  counted"; both FAQ answers about suggestions now begin "From counts of your own records"; the
  flows' "It checks WhatsApp's rules" is "It checks the 24-hour window"; the RULE work lines in
  the /bookings and /accounts flows say what the screen shows ("Needs you now: 1 visit not
  marked", "Suggestion: the promised date passed, nothing paid"); the Bookings screen's callout
  and caption say "the visits it counted"; the trust link on /bookings is "How ALYR handles
  consent, WhatsApp and your records". Arabic the same: no «قاعدة», «القاعدة», «قاعدته»,
  «قواعد» left, except «قاعدة البيانات» (the database).
- **/agent's "The rules"** section, its product-bar link, its type, its CSS (`kit.css`) and its
  part in `llms.mjs` are gone.
- **The Agent showcase:** `_agent/AgentDashboard` takes `ruleLines` (default true). The site's
  `AgentFigure` passes `ruleLines={false}`, which drops the "RULE · …" line under each
  suggestion and the rule as a need's tooltip, and passes its own title "Suggestions" /
  «اقتراحات» (`agent.suggestions` in `copy.ts`) for the workspace's "Suggestions, by rule". The
  workspace and `/agent-sample` keep both.
- **The feed:** a flag shows its title ("Needs a look") and the dashboard's own line, with no
  "Why · …" line under it (`AgentFigure.tsx`; `agent.reason` and `.af-rule` are gone).
- **/agent's opened card** (`AgentPage.tsx`) draws no rule line.
- **The Sunday report drawn on the site** (`ReportPhone.tsx`) leaves out the message's last
  line, "_Rule · …_"; the card image has no rule on it. The owner's real message keeps it.
- **llms.txt:** the Agent caveat in `machine-words.json` says "counts and comparisons of the
  shop's own records".
- Still true: no AI words; suggestions say what was counted or compared.

Checked at this stage: `pnpm exec tsc --noEmit`, `pnpm lint`, banned words on the copy, EN/AR
parity (6,084 strings).
