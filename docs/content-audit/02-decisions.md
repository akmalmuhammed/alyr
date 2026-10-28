# Content audit: founder decisions

25 Oct 2026, in chat, on the table in `01-audit.md`. They override it.

| Row(s) | Decision |
|---|---|
| All rows not listed below | **Apply as proposed**, English and Arabic (the Arabic stays a draft until ALY-66) |
| 5, footer | **Keep** "We do the tech. You run the business." / «علينا التقنية، وعليك شغلك.» |
| 18, home ALYR Agent H2 | **Keep** "Every day, see what changed / and what to do next." |
| 80, /docs hero fact "No CR yet? Receipts that say so" | **Remove** the fact. Don't replace it. The no-CR rule is still explained where the page needs it (What's in it, questions), in plain words |
| Every "rule" on the public site | **Remove the "rule" wording from the site** (the founder: "a new user will not understand what's rule"). See below |

## What "remove the rule part" covers, on the public site only

- **Copy:**
  - "by rules you can check" / «بقواعد…» in the hero and any lead;
  - the hero fact "Every suggestion shows its rule";
  - "Flagged by rule" in the agent feed (it becomes "Flagged" / «تنبيه», or the item's own words);
  - FAQ answers that explain rules;
  - meta descriptions;
  - `llms.txt` (regenerated from copy).
- **/agent:** the "The rules" section and its product-bar link go. Row 59 is superseded. Row 58's "How a suggestion is made" can stay, written in plain terms ("what it counts and compares"), never "rule".
- **Drawings on the site:** the "RULE · …" line under each suggestion card in the Agent dashboard showcase and the feed. Add a showcase-only prop to `_agent/AgentDashboard` (for example `ruleLine={false}`, default true) and pass it from the site. **The product's own workspace keeps its rule lines.**
- **What still holds:** suggestions must still not read as AI. No AI words. "Agent" never claims to understand or think. Suggestions say what was counted or compared, in plain words ("QAR 3,400 owed for over 30 days").
- **Skills:** update `alyr-design` (`honesty.md`, `components.md`) and `alyr-site-page`. On the public site, suggestions are shown without rule lines (founder, 25 Oct). The product keeps them.

## The pattern rules

Add the audit's proposed pattern rules (section 4 of `01-audit.md`) to `alyr-site-page` and to `scripts/site/banned-words.json` where they are mechanical. Keep the hero slogan, and rows 5 and 18, on an allowlist with a reason.
