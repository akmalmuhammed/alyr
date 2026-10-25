# Homepage design research: patterns, sections and art direction

| | |
|---|---|
| **Category** | design-brand |
| **Date** | 2026-10-16 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/site-redesign/01-design-research.md` on main (Linear ALY-56) |
| **Lane** | Site and brand |

## Question it answered
How should the new homepage look and move, so that it shows the real product, earns trust without customers, and does not look like every other 2026 software site? It was the visual input to the creative director's build brief (`04-brief.md`), next to the messaging and product-truth studies.

## Key findings
- Sources: 8 sites rendered in a browser on 16 Oct (Linear, Stripe, Ramp, Mercury, Lama Lama, Why Zero, Tamara Arabic, Careem Arabic), 6 read as text only (Attio, Granola, Mercury, Tabby Qatar, Foodics Arabic, Awwwards' Sites of the Month), plus earlier knowledge marked as "reported".
- 16 patterns, each tied to an ALYR version. The main ones: a hero with the copy beside a working product at true scale (Ramp, Attio, Granola); real screens drawn in HTML with an engineering-style "FIG" caption (Linear, Lama Lama); a chat line becoming a record, revealed along a 45° edge; a stepped story with a sticky figure (Attio, Linear); one two-tone statement (Linear, Stripe).
- Brand devices it proposed: a visible 12-column grid made of rules, not cards. A solid rule means "true today" and a dashed rule means "a slot waiting to become true". A 45° cut corner taken from the Command Fold logo. Volt only where something becomes true.
- Price as a spec sheet: one large number with a ruled list of fees. It noted that no competitor in the messaging study shows a QAR price. The money-back first month was to be drawn as a page from the agreement, with a folded 45° corner.
- Trust before customers: plain, checkable facts and open disclosures (Mercury's "not a bank" bar, Tabby and Foodics naming their licences). It suggested a founder photo; the founder later rejected that.
- Arabic as a first language, not a translation. Lessons from Tamara (round chips the Arabic overflows) and Careem (English left on the Arabic page). Rules: Arabic display line height 1.25 and body 1.7, no letter-spacing or kashida, Western digits for money and times, `<bdi>` around money and order numbers, and every cut mirrored.
- Ten things that look dated in 2026: gradient ribbons and glow, bento grids of icon cards, logo walls and counters, tilted 3D phones and glass, AI sparkles, stock photos and Gulf clichés, WebGL and loaders, pop-ups, carousels, and "01 02 03" on things that are not steps.
- Critique of the 16 Oct homepage, top three: the product was not on the first screen; the main button did not ask for a message; the "line being set up" box read like an error. It also said the hero sat close to Ramp (lime button, faint grid, big grotesque headline).
- Extensions for the brand: a fluid type scale (display `clamp(2.75rem, 1.4rem + 5vw, 5.5rem)`), an 8 px rhythm (8, 16, 24, 40, 64, 104), no second accent colour, tabular figures for money, and one signature transition (three dark planes along 45°, about 600 ms).

## What we decided because of it
- The build brief (`docs/site-redesign/04-brief.md`, 16 Oct) adopted most of it: the "working drawing" art direction, the 45° cut, solid and dashed rules, FIG captions, the type scale and rhythm, and the Volt rules. It added a GSAP motion layer that the research did not ask for.
- These extensions were recorded in `docs/brand.md`. D-040 (17 Oct) then kept the Carbon and Volt look and moved every value into `design/tokens.json`.
- D-034 (16 Oct) is the founder's side of the same redesign. It settled the price, the setup fee, the money-back month, and no founder name or photo.

## What changed since, and conflicts
- **FIG captions are gone.** Since 24 Oct, each drawing carries a small "Sample" mark in its own window or phone header (`docs/site-audit/00-decisions.md`, `brand.md`). A caption is kept only where a drawing needs words.
- **Founder photo (P11) rejected.** D-034 has no name and no photo, and the trust section speaks as ALYR.
- **One fictional business.** The research said "a cafe"; the brief made it a bakery, and today it is Qirfa Bakery on every homepage figure (`brand.md`).
- **The price sheet and agreement (P9, P10) are hidden.** Prices stay off the public site until the commercial registration (D-034 update, 17 Oct). They show only when the offer switch is on.
- **The hero changed three times.** The order-page phone was replaced by ALYR Agent at work (D-037), then the owner's problem (D-056), then "The tech team your business never had." (D-048).
- **The live clock was removed.** The Doha clock (P8, P14) came out in the 24 Oct site audit as decoration.
- **Dashed "coming" slots were dropped.** Dashed slots for products that are coming conflict with D-039 (nothing "coming" is shown). Payroll left the site (D-046). The dashed rule survives only for things that are not true yet.
- **Fewer pinned panels.** D-048 and the site audit cut the pinned panels to none on the homepage.
- **Still in force:** the Volt rules, rules before cards, the 45° cut, the Arabic rules, the "dated in 2026" list and the contact states.

## Use it for
- Any new public page or section: the pattern list (P1 to P16) gives a reason and a build note for each device.
- Explaining why a brand device exists, such as the 45° cut, dashed rules or one Volt mark.
- The "ten things that look dated" list and the Arabic lessons, before you approve a new design.
