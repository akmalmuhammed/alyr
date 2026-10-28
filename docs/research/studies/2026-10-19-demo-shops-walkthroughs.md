# Demo shops and five-minute walk-throughs for sales visits

| | |
|---|---|
| **Category** | sales |
| **Date** | 2026-10-19 |
| **Status** | Current |
| **Where it lives** | `docs/demo.md` (19 Oct) and `docs/demo-walkthroughs.md` (18 Oct) on main. Built in ALY-110 (D-039) |
| **Lane** | Customers |

## Question it answered
How can the founder show the Catalog (ALYR Shelf) to an owner with a shop that looks like their own, and what should a five-minute demo show? It is a sales tool and runbook, not market research.

## Key findings
- Seven fictional demo shops, each with a fortnight of orders, cancellations, deliveries and stock counts: a restaurant (29 items), a bakery (23), a grocery (29), fashion and gifts (20), a home and gadgets shop (23), a wholesaler (23) and a salon (19). Every name, person, phone number and amount is invented, and nothing can reach a phone.
- Each shop shows the features that type of owner cares about. The restaurant has a breakfast window and daily limits; the bakery has cake sizes and next-day orders; the grocery has weights, deliveries, waste and a price change; fashion has sizes and made-to-order lead times of 3 and 4 days; the wholesaler has price groups (cafe, hotel), minimum orders and credit limits; the salon has services, counter sales and bookings, with no order page.
- Travel and documents businesses have no Catalog. Spa, clinic and home services have no demo shop; the salon stands in for services.
- `scripts/demo.sh shops` makes or resets all seven, and refuses to run on a database that is not clearly local. History is written for the 14 days up to "now", so run it before each demo.
- Every walk-through has the same four beats: the list (sold-out, low and draft items), change a number (stock received or counted, logged with your name), order as the customer at phone width (375 px), and see it land (stock goes down, then comes back once on cancel).
- The salesperson's line for beat 1: "This is what you see when you open the app in the morning."
- Limits to say plainly: payment in the demo is the local test payment, with no money. WhatsApp parts (ordering by item code, reminders) run in the simulator; the `/whatsapp` page itself shows the original sample shop only.

## What we decided because of it
- It supports D-039 (the Catalog complete before go-live) and the in-person sales model of D-034 and D-043.

## What changed since, and conflicts
- The public name of the Catalog is now ALYR Shelf (D-046), but the workspace keeps "Catalog", so the docs are still right.
- The demo shop names differ from the site's single sample business (Qirfa Bakery, brand.md) and from the agent samples (Qirfa, Dafira, Zilal). That is fine for a live demo, but do not mix them on public material.
- D-051: a real client pays before products open. The demo shops are seeded open and are not affected.

## Use it for
- Before a sales visit: reset the shops and follow the walk-through for the owner's business type.
- Checking Catalog screens or the order page against realistic data.
