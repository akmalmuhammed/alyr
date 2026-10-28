# Product truth for the homepage redesign: what is built and what may be claimed

| | |
|---|---|
| **Category** | marketing |
| **Date** | 2026-10-16 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/site-redesign/03-product-truth.md` on main (Linear ALY-56) |
| **Lane** | Site and brand |

## Question it answered
What had ALYR actually built on 16 Oct 2026, what state was each piece in, and what may the homepage say or show about it? It also mapped how the public site was built, so the redesign would not break it.

## Key findings
- No business used ALYR. There was no customer, no pilot, no registered company and no agreed price. Every name, number and testimonial on the page had to be absent or clearly fictional.
- Only one live round trip had happened, on Meta's test number on 12 Oct: a welcome menu, an order (#1001, QAR 179) paid on the stand-in page, and a booking made and confirmed. Everything else was built and tested on the simulator only (207 tests). That included the workspace, team inbox, tracking, credit reminders and the weekly report.
- There was no payment gateway. The pay page was labelled "Test payment page. No money moves." A shop could not connect its own WhatsApp number (ALY-39). There was no AI: replies matched keywords and buttons, and anything else went to a person.
- Feature inventory, with a state for each item (Live on test number, Built on simulator, API only, Not built). It covered orders, bookings (one customer at a time per shop, no deposits), payments, tracking (no delivery or maps), credit accounts (three reminder tones by age: under 60, 60+ and 90+ days), the team inbox and accountability, the weekly report (API only, never sent to an owner) and the workspace (local only, no sign-up).
- 17 contradictions (C1 to C17). The worst one: the homepage figure showed one free-text message becoming a table booking, an order and a payment, which the product cannot do. Others: the /chat demo used words the product does not use, a sample date fell on the wrong weekday, Arabic samples used Eastern digits where the product writes Western ones, and /chat promised "keep your number" and "paid straight to you".
- The real product's words, in English and Arabic, for designers to draw from: chat messages, the 17 templates for after the 24-hour window, status names, the screens and the weekly report format.
- A "must not claim" table with safe wording for each item. It ruled out customers, logos and counts; "live on WhatsApp"; keeping your number; "paid straight to your account" or provider logos; free messages; 48 hours, free pilot or any price; AI or "smart" replies; delivery tracking; sign-up; "hosted in Qatar"; certifications, 24/7 support or response times; "Meta partner"; "a local team"; "registered"; and case studies.
- Technical map of the site: three root layouts and their routes, the `_site` components, how `copy.ts` is typed, the tokens and classes in `site.css` (which ones /chat shares), the publishing path (static files on Cloudflare via `build-site.sh`), and the constraints (static only, words only in `copy.ts`, logical CSS, reduced motion, no-JS).
- Design audit of the 16 Oct homepage. Keep: the brand's own look, the diagonal reveal, Arabic as a first-class page and the honesty markers. Weak: the product was buried, the promise was generic, three fictional businesses, the call to action was a dead end, and the page was about 6,000 px tall on desktop.

## What we decided because of it
- The build brief (`04-brief.md`) ranks it third in authority, after the founder's decisions and the brief. Every claim in the redesign was checked against it.
- Its "must not claim" table became the honesty rules: the design-system audit called it the most valuable document of the cycle, and it lives on in the `alyr-design` skill's `honesty.md`.
- It shaped D-034's framing: early access, set up by ALYR, and nothing described as live for businesses.

## What changed since, and conflicts
- **The product moved on a lot.** The Catalog was built (D-039, now ALYR Shelf). Documents arrived (D-042, ALYR Docs). There is a suite led by ALYR Agent (D-035, D-037, D-046), self-serve onboarding (D-031, D-049, D-050) and payment before products open (D-051). The inventory and the "two products" count are out of date.
- **One sample business.** The demo shop it named (Al Noor Electricals) is no longer the homepage's sample business; that is Qirfa Bakery (`brand.md`).
- **Prices:** the "any price" ban was replaced by D-034 (from QAR 449), and prices then went behind the offer switch until the commercial registration (17 Oct).
- **Many C-items were fixed** in later passes: the Zaitoon figure was replaced, and Payroll's "coming" row was removed by D-046.
- **The technical map is out of date.** The site now has 14 pages, `design/tokens.json` (D-040), GSAP, generated JSON-LD and `llms.txt` (site audit, 24 Oct).
- **Still valid as rules:** no customers or logos, no AI words, no "hosted in Qatar", no "Meta partner", no live card payments until a gateway is connected, and one fictional business marked as a sample.

## Use it for
- As a model for the claims-table method: a state key, file references and safe wording for each claim. Redo it against the current `docs/status.md`; do not reuse its states.
- The real chat and template wording, when you draw WhatsApp screens.
- Background on why each honesty rule exists.
