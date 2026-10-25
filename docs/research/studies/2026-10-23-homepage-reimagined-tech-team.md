# ALYR homepage, reimagined: your business's tech partner

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-23 |
| **Status** | Current |
| **Where it lives** | Claude artifact (Claude Docs document): https://claude.ai/artifact/3RQLGYUDG9We9yQMJc1gqh |
| **Lane** | Site and brand |

## Question it answered
How does the homepage change if ALYR presents itself as the small business's tech team, not a WhatsApp tool? It rewrites every homepage line (with Arabic drafts) and adds a visual audit of the live page.

## Key findings
- New message: ALYR is the technology team a small business could never afford. It checks how the business runs, sets up the tools that fix it, shows the owner every week what changed and what to do next, and keeps improving it with them.
- Hero: "The tech team your business never had." (two alternatives offered: "Big-company technology. Built for your shop." and "You run the business. We run the tech."). Main action and header button "Book a check-up". The agent leaves the hero.
- The spine of the page becomes a loop: check, set up, see, improve, then again. "Flagged by rule" becomes "Needs a look", with the reason on the line under it.
- New sections: "Why ALYR" (a big company, you today, with ALYR, four rows) and two new questions ("Is ALYR just a WhatsApp tool?", "What is the check-up?": about an hour's visit and a short list of what costs time or money).
- "Rule" becomes "reason" or "why" in homepage copy. Left out on purpose: "AI", "consultant" as a title, "0 to 100", "any business", unprovable growth figures.
- Visual audit (23 Oct, published build c55e35c8, Chromium at 390×844 and 1440×900): 22,866 px on phone (27 screens), 17,796 px on desktop, 2,365 words; aim about 13 phone screens and 1,100 words.
- Other measurements: Agent section 4.6 phone screens; products band pinned for 3.9 desktop screens; 64 type size and weight pairs on the phone page; 7 pinned elements on desktop (suggest 3); phone chrome takes 15% of the screen; first content 0.76 s locally; axe clean; layout shift 0.009 to 0.012. Not checked: Safari, a real iPhone, a slow network.
- Claims needing the founder's OK: the check-up itself, "every month we go over your numbers with you", and "what we find in most shops" (say "often" until enough visits).

## What we decided because of it
- D-048 (founder, 23 Oct, "implement it"): the tech-team positioning, H1 "The tech team your business never had.", one action "Book a check-up", the loop, "rule" to "reason", the visual audit's pinned panels cut from seven to two.

## What changed since, and conflicts
- D-048's 24 Oct update folded the page further: "What a check-up finds" became each business tab's "Today" list; the "Why ALYR" table became one line in the hero lead; the products are six plain rows, no longer pinned; "Book a check-up" is the action on every page. The new order is hero, how we work, your business, one order, ALYR Agent, products, price, trust, questions.
- Still open from D-048: the check-up's price, keeping the monthly look at the numbers, the Arabic review (ALY-66). The films doc records founder answers (check-up free, keep the monthly review) that are not yet in docs/decisions.md.
- Replaces D-056's hero ("Stop losing orders in the chat.").

## Use it for
- The reasoning and the word-by-word English and Arabic behind the live homepage, and the visual-audit numbers as a baseline. Read D-048's update alongside it, since the page order changed after this source.
