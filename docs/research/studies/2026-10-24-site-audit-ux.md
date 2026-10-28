# Site audit, UX: small text, page length and the path to the action

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-24 |
| **Status** | Current |
| **Where it lives** | `docs/site-audit/01-ux.md` on main. Decisions in `00-decisions.md`, the fixes in `04-ux-build-log.md` (Linear ALY-223) |
| **Lane** | Site and brand |

## Question it answered
On the live alyr.qa (all 14 pages, English and Arabic, at 1440 and 390 px), how much small and secondary text is there, which of it can go, why are the pages so long, and what gets in the way of the one action?

## Key findings
- Which code was live: the live site served branch `aly-210-tech-team-homepage` (PR #105, not merged), not the branch the brief named. That branch's own `status.md` still said "not published".
- Samples were marked as fictional 27 times in text: 14 FIG captions, 12 "Sample conversation" notes and one under line. The homepage spotlight said it three ways around one figure. Recommendation: put one "Sample" mark in each drawing's own window or phone header. It travels with a screenshot, sits where the eye already reads the shop's name, and is never said twice. Only two captions stay, where the drawing needs words.
- Small-text inventory with a verdict per item (Remove, Keep, Shorten, Merge): 553 items across the seven pages, down to 364 (−34%). The homepage drops from 110 to 62 (−44%).
- Repetition: 9 eyebrows on the homepage and 6 to 8 on each product page, most in 11 to 12 px mono capitals that repeat the heading below or the bar above. Information was set in 11 px mono capitals (for example "SALES THIS WEEK" ×16). "Behind the scenes" lines repeated on 4 pages each.
- Length: the homepage was 17,716 px at 1440 and 21,380 px at 390. The pinned, tilted products "room" alone was 4,848 px. "What a check-up finds" and "By business" told the same story. Product pages used a literal section padding (256 px at 1440) instead of the token.
- Phones: product pages opened on words, not the product. On /bookings the demo starts at about 540 px, and /docs runs a 6-line H1 into a 9-line lead. The demo and flow drawings opened empty. /agent's opening was 4,046 px. There were three sticky layers on the homepage, and clipped sideways strips with no scroll cue.
- The action had two names: "Book a check-up" on the homepage and "Email us" on product pages for the same mail link. The header's section links left the product page. /chat had no Questions section.
- Against a decision: "is next" and "Next for ALYR Bookings" lines broke D-039 (nothing coming). There were three names for one screen ("Insights", "ALYR Agent", "home screen"). The Doha clock was decoration. Glowing dashes in the flow read as glow.
- Top five, with estimated heights: Sample marks in the chrome; remove repeating eyebrows, numbers and tags; unpin the products into six plain rows (homepage about 14,640 px at 1440); one rhythm for the product template; and phones show the product, then the action. With the fold, the homepage would reach about 12,600 px at 1440.

## What we decided because of it
- The founder decided on 24 Oct (`docs/site-audit/00-decisions.md`). He chose "Book a check-up" everywhere and folded the homepage: the problems go into the By business tabs, and the Why ALYR table shrinks to one line in the hero lead. That was recorded as an update to D-048, along with the products as six unpinned rows.
- The "Sample" mark replaces FIG captions, and the skills (`alyr-design`, `honesty.md`, `components.md`, `alyr-site-page`, `alyr-design-review`) were updated. Honesty rules stayed the same.
- The build log (`04-ux-build-log.md`, ALY-223) applied the marks, the action name on every page (product openings included, in a follow-up), the inventory, the fold, the product template rhythm and the phone fixes.

## What changed since, and conflicts
- Nothing overrides it yet. The audit itself labelled its homepage fold as going against D-048's written order; the founder then updated D-048 to match.
- The build added a "Book a check-up" button in each product page's opening and a sticky bar on phones, which the audit had warned about (P1-a). That was the founder's call after the first pass.
- Not checked by the audit: dark mode, reduced motion, 320 px, keyboard, axe and Lighthouse. The after heights were estimates; the build log has the measured ones.

## Use it for
- The "Sample" mark rule and why it replaced FIG captions.
- The inventory verdicts, when you add text to a page: the test is whether it repeats a heading, the bar or another page.
- Page-length and phone first-screen budgets for product pages.
