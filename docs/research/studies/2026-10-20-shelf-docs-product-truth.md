# ALYR Shelf and ALYR Docs: product truth for the public pages

| | |
|---|---|
| **Category** | marketing |
| **Date** | 2026-10-20 |
| **Status** | Current |
| **Where it lives** | `docs/site-products-2/01-truth.md` on main |
| **Lane** | Site and brand |

## Question it answered
Before writing the `/shelf` (Catalog) and `/docs` (Documents) pages, what is actually built, what is built but hidden, and what must never be claimed? Read from the code on main at commit 647d77d and three open pull requests.

## Key findings
- General truth on 20 Oct: no shop is live, there is no CR and sign-up is closed; WhatsApp has run only on Meta's test number (one round trip on 12 Oct) and a shop cannot connect its own number (ALY-39); hosting is the founder's laptop behind a tunnel; card payments are not live (the pay page is a labelled stand-in); Arabic is a draft until ALY-66. Allowed: "built", "we set it up with you". Not allowed: "live for businesses", "today", "now".
- Shelf is a module in no product, included with ALYR, on for new and existing shops (except travel and documents types). The workspace calls it Menu, Products, Price list or Catalog by business type.
- Shelf, built: bilingual items with up to 8 photos (location and camera data removed); sizes and colours with their own stock and price; choices and extras; five availability rules (always, on/off, counted, "a number each day", order times with cut-off); an add-only stock log; "the last item can only sell once" (one database step, proved by race tests); 30-minute pay-link holds; sold out greyed or left out; sale by weight; ordering by item code in WhatsApp; staff commands from registered phones with a one-time Undo; wholesale price groups.
- Shelf, built but off by default: discounts and coupons, delivery areas and fees, cost and margin (owners and admins only). Import and export exists but has not been tried in real Excel.
- Shelf, never claim: Meta catalog sync, barcodes, batches, expiry, suppliers, photos per variant, a staff command by code, maps or drivers, photos hosted in Qatar.
- Docs: engine, sales hooks, workspace screens and connected mode are merged, but the module is off for every shop. Eight kinds (receipt, invoice, quotation, delivery note, statement, credit note, deposit receipt, proforma); invoice and proforma need the shop's CR. A4, A5 and 80 mm roll.
- Docs, built and hidden: gapless numbers under a lock, with branch series; optional cash rounding as its own line; Arabic first, and always on consumer documents; a shop with no CR issues receipts with a plain "not a tax invoice" note; issued paper cannot change (the database refuses; corrections are credit notes); documents made automatically from sales; payments recorded by hand; delivery by PDF inside WhatsApp's 24-hour window, email, or a signed 90-day link page.
- Docs gaps: the out-of-window templates are written but not submitted to Meta; no screen collects a customer's email; no real send to a real phone or email has been made; no real POS has been tried.
- Docs, never claim: that it is available today; e-invoicing or the General Tax Authority's system; "tax invoice" or VAT; compliance with Qatar's Arabic invoice rule (unconfirmed, ALY-51); a retention period; invoices without a CR; live card payments; statements or quotes as full flows; delivery at any time; a named POS.
- Site fit: remove Payroll everywhere, add `shelf` and `docs` to the product list, rename "Early access" to "Set up for you", and fix stale lines on `/accounts`, `/chat` and the homepage. Checked sample names: Qirfa Bakery, Dafira Salon, Zilal Cooling; the demo shops in `docs/demo.md` are not in the checked register.
- Lists real moments worth drawing for each page (8 for Shelf, 7 for Docs) and how to render real receipt, invoice and credit note PDFs from the engine.

## What we decided because of it
- D-046 (21 Oct, founder 20 Oct): `/shelf` and `/docs` pages; Payroll leaves the site; "Set up for you" on every product; Shelf and Agent "With every product"; Docs never says it is available, and never "coming".
- It rests on D-039 (Catalog built complete, nothing "coming" shown) and D-042 (the Documents engine).

## What changed since, and conflicts
- Nothing found that overrides it. It is a snapshot of 20 Oct: the file itself warns that `docs/status.md` was partly stale and that `git log` is the truth. Recheck the general truths (CR, hosting, own number, payments, templates) and whether Docs has been switched on for any shop before reusing a line.
- PR #98 named the Documents product "ALYR Invoices"; the founder chose "ALYR Docs" (D-046). Its quick-creation and staff-command features were not on main and must not be drawn unless #98 merges.
- D-051 (23 Oct, client pays before products open) and D-048's homepage changes do not touch these product facts.

## Use it for
- Before writing or reviewing any public line about Shelf or Docs: the built, hidden and never-claim lists.
- Before choosing what to draw on either page: section 4's real moments and the engine render commands.
- As the source behind `02-messaging.md`'s claims table in the same folder.
