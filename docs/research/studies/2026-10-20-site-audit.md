# alyr.qa Site Audit

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-20 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (HTML page): https://claude.ai/artifact/XVMBtSU74N4SXccyFYUETC. It mentions full team reports (seo.md, messaging.md, design.md, growth.md, arabic.md) in a session audit folder; those were not in this source |
| **Lane** | Site and brand |

## Question it answered
How good is alyr.qa (10 pages, English and Arabic), and what should be fixed, in what order? Five teams audited it: SEO and AI search, messaging and copy, design and UX, growth and conversion, Arabic and Gulf fit.

## Key findings
- Verdict: "A well-built site that nobody can find and nobody can reach."
- Not indexed: 0 results for site:alyr.qa on Bing; no Search Console. ChatGPT's search draws mostly on Bing.
- Email is the only contact path on all 10 pages; about nine homepage buttons open a mail app. Only 2 of 16 competitor sites offer one-tap WhatsApp contact.
- 0 of 10 pages have structured data; all Arabic pages share the English social card.
- Mobile time to main content 2.8 to 4.4 s against a 2.5 s target; each page preloads six fonts.
- Strengths: Lighthouse accessibility 100 on every page, 0 axe violations in 40 runs, 0 layout shift, full pages without JavaScript, correct hreflang.
- "Your business just got an agent" read as AI to every team; an AI model asked could not tell whether ALYR uses AI. The Arabic headline implied a person does the work.
- Over-claims: "runs on WhatsApp's official Business Platform" (no shop runs yet), a /chat demo reply the product would not send, "prices go on this page soon", "no commission" outside the offer switch, moved bookings and invoices that are not built.
- One WCAG 2.2 failure axe cannot catch: the sticky bar hides keyboard focus on phones. The Command Fold is invisible in dark mode (1.17:1).
- Growth: 11 of 16 competitors lead with a free trial; 13 of 14 competitor software sites show prices; only one (Setmore) offers a refund guarantee, none tied to a result. Visa's 2026 study: money owed is Qatar small businesses' top pain (46%).
- Plan in five phases: fix what is wrong; get found and contacted; tell the story (problem before product); content and field kit; a CR-day switch for prices, legal name and listings.
- Ten founder decisions, including: get ALYR's own WhatsApp number now; rename "ALYR Agent" (suggested "ALYR Today") or attach "works by rules you can check"; change the headline (example "WhatsApp orders and bookings, set up for you."); "ALYR Credit" instead of "Accounts"; an Arabic form of the name; Search Console and Bing.
- Conflicts it found in our own docs: the growth plan's founder-led posts go against D-043; DMARC reports went to a founder-named address; introduction.md claims payments; Payroll showed "Coming".

## What we decided because of it
- D-047 (22 Oct) answered the "agent reads as AI" finding: the homepage opens on the owner's problem, and "agent" appears only beside its rules, with no AI words and no "Is it AI?" question.
- D-046 removed Payroll from the site.
- Other items (WhatsApp number, Search Console, structured data, Arabic cards) are not recorded as decisions on main.

## What changed since, and conflicts
- Its proposed headline was not taken; D-047 chose "Stop losing orders in the chat." and D-048 replaced that with "The tech team your business never had."
- "ALYR Agent" kept its name (D-035, D-047); the rename to "ALYR Today" and "Accounts" to "Credit" were not adopted.
- It assumes prices wait for the CR (D-034); the 22 Oct audit says the CR is done. That gap is between sources, not settled here.
- D-043 is on the unmerged `company-introduction` branch, not on main.

## Use it for
- The SEO, speed, accessibility and Arabic findings, the competitor counts, and the phased plan. Check each item against the live site before acting; some may be fixed already.
