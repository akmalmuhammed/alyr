# ALYR Shelf and ALYR Docs: visual direction

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-20 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/site-products-2/03-visuals.md` on main (it refers to captures in `review/viz/`) |
| **Lane** | Site and brand |

## Question it answered
How should the `/shelf` and `/docs` pages look and move: what is each page's signature figure, how is the paper drawn, and what must the visuals avoid?

## Key findings
- References seen: Stripe Invoicing makes the real hosted invoice the hero and then shows it on a phone; Shopify Inventory shows count chips on product cards. Avoided: Ramp's flying document and live counters, and the stock photos, floating KPI cards, ratings and confetti on Zoho, Square Retail and Foodics. Toast and the Foodics inventory page could not be seen. The lesson: vivid pages show one real object changing state.
- Motion grammar for both signatures: the brand's duration tokens (120 to 720 ms), a 60 ms stagger, CSS keyframes only (no new JavaScript), the HTML is the finished state (so no-script and reduced motion show the end), plays once and ends before 3 s, one Volt mark per figure when something is confirmed, "Sold out" never red, everything mirrors in RTL.
- Shelf signature, "The last one": two customer phones and a stock card. Both press at once, one sale is written to the stock log, the count goes 1 to 0, the second phone greys the item to "Sold out". Timed step by step to about 2.3 s; it stacks at 390 px.
- Shelf supporting visuals: a four-tab demo (order by code, staff sold out with Undo, stock log, sold by weight), a new workspace screen drawing, a stock log, and order-page phones showing sold out greyed against left out. Photo slots are flat tiles, with no stock or generated food images.
- Docs signature, "A payment becomes paper": a cash payment recorded in the workspace, an A4 receipt drawing itself along the fold's diagonal (Arabic text 60 ms before each English twin), then the PDF bubble in WhatsApp and one Volt tick on "Sent". The paper never mirrors: it is Arabic first on both language pages.
- The paper is drawn as live HTML text, not an image: sharp, shaped Arabic, themeable, a few kilobytes. It follows the engine's layout element by element, sits on a plate with mono dimension lines (210 mm, 297 mm, 80 mm), and has a series rail (RC-0040 to RC-0043, the next number dashed) to show gapless numbering. New paper tokens for both themes; in dark mode the paper is turned down one step, never inverted, at 4.5:1 or better.
- Docs supporting visuals: a five-tab demo (receipt, invoice needing a CR, correction by credit note, the link page, paper sizes), the Documents screen, a "once issued" section with two link-page phones, and the no-CR receipt foot.
- Budget: the H1 stays the largest paint and is never faded from 0; each signature under 6 KB of CSS; no raster images on either page; targets LCP under 2.5 s, CLS under 0.05, Lighthouse mobile at least 90.
- What not to do: no barcodes, QR codes or scan glyphs; no stock or generated photos, 3D, glow, gradients, confetti, ratings, logo walls or counters; nothing that implies Docs is on (no Volt "Issue and send"); no payment flow on Shelf; no WhatsApp logo or brand green; never stamp "Cancelled" on an issued PDF.
- Found for other lanes: the engine's sample customer uses a retired family name and a plausible-looking CR number; the "Assistant" stock-log actor and first-person staff replies break the honesty rules; the print skill still says invoices are "Not built".

## What we decided because of it
- D-046 (21 Oct): the two pages and the "agentic feel through what the products really do" (stock counted on every sale, last item sold once, receipt issued when a payment is recorded, gapless numbers, paper that cannot change). The visual specifics here are direction for the build, not a numbered decision.

## What changed since, and conflicts
- "FIG 01 · ... · Fictional bakery" captions: replaced by a single "Sample" mark (founder, 24 Oct, brand.md). The figures stand; their caption style does not.
- Sample details disagree with `02-messaging.md` (same folder, same day): this file uses item 214 "Saffron cake", a Monday 19 Oct Shelf figure and RC-0042 for QAR 169; the messaging uses items 104 to 131, Saturday 17 Oct and RC-0042 for QAR 64. Pick one set before building.
- Otherwise consistent with D-040 (Carbon and Volt look) and the alyr-design motion rules.

## Use it for
- Before building or changing the `/shelf` or `/docs` figures, or any drawing of a receipt or invoice on the site.
- When someone proposes stock photos, QR codes, animated counters or a flying document for these pages: section 5.
- The paper-drawing approach (live HTML, dimension lines, series rail, dark-mode paper) for any future document visual, including print or social.
