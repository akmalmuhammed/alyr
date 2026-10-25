# Alyr homepage and product pages audit

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-22 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (Claude Docs document): https://claude.ai/artifact/TbyaX8z9ApjG8CFMfqFE4i |
| **Lane** | Site and brand |

## Question it answered
Line by line, what should change on the homepage and the four product pages (Chat, Bookings, Agent, Accounts) to win a first paying shop? Every line got a verdict (Keep, Change, Fix now), checked against the growth playbook, the priority customers, pricing decisions and what is actually built.

## Key findings
- Method: read every line of copy.ts (main at 647d77d, 20 Oct), built the site with the offer switched on, ran axe-core and page-weight counts at 390 px and 1440 px. Not done: Lighthouse, a screen-reader pass, a real phone, native Arabic review.
- Top five: the only way in is email and the money-back offer is hidden behind flags; the first screen sells the dashboard, not the owner's problem; some claims run ahead of what is live; no proof of a real person or company; the Chat page, the flagship, is the weakest product page (no price, no questions, no "Not yet" list).
- Hero proposal, option A (recommended): "Stop losing orders in the chat." Option B kept "agent" with a concrete body.
- Priority customers: bakeries first, wholesale second, boutiques; salons and restaurants Tier 3. The page led with restaurants and salons. It drafted bakery and wholesale rows.
- Claims table: "runs on WhatsApp's official Business Platform" (Meta verification not submitted), "every consent is on record" (bug ALY-115 can delete a STOP record), payment links open a test page, reminders outside 24 hours need approved wording, "Everything listed here is built" (built is not live). Safe wording given for each.
- "Agentic" ladder: only about two of six planned flow steps are true today.
- Price: show "First month: QAR 449 + setup from QAR 1,500" (about QAR 1,949 or more), and align with the back office's QAR 2,500 setup default. Add a worked result example (a bakery: 20 orders through the chat in 30 days).
- Measured weights: homepage 1,018 KB (EN) and 1,053 KB (AR), 22 requests, about 17,000 px tall at 390 px; product pages 869 to 922 KB; 0 axe violations on all six pages measured.
- Search: no JSON-LD, English share card on Arabic pages, product titles 63 to 68 characters (cut off), home description 278 characters.
- Persuasion and ethics: risk reversal and clear pricing rated strong; loss framing contested and kept out; the site passes the playbook's four-question ethics test.
- Ranked fix list of 27 items (11 quick wins, 9 next, 7 waiting), plus five founder decisions: hero A or B, a named person on the page, the setup fee, a founding-shop offer, the date to switch the offer on.

## What we decided because of it
- D-056 took the option A hero ("Stop losing orders in the chat.") and the "agent shown, never claimed" rule; its "not true yet" list (no reply promise, no named person, no "hosted in Qatar", no card payments as live) matches this audit's claims table.

## What changed since, and conflicts
- The hero was replaced by D-048 ("The tech team your business never had.", "Book a check-up").
- It states "The CR is done" (and the improvement table says done since 21 Oct). The content playbook and films doc of 24 Oct still plan around "before the CR". This card records both; docs/status.md is the place to check.
- It proposes naming a person on the page, which would reverse D-034; not decided.
- Its segment priority (bakeries, wholesale) differs from the Brand & Growth Playbook's restaurants-first audience.

## Use it for
- The claims-versus-reality table, the per-line verdicts on product pages, Arabic wording points for ALY-66, and the ranked fix list. Re-check each claim against docs/status.md first.
