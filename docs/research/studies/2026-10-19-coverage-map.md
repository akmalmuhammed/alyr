# Coverage map: what each sector needs and what ALYR has

| | |
|---|---|
| **Category** | customers |
| **Date** | 2026-10-19 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (an interactive HTML page, not a Claude Docs document): https://claude.ai/artifact/9uKT9ZSMEHzLbt4eoGKWzn, titled "Alyr Coverage Map" |
| **Lane** | Product |

## Question it answered
For ten kinds of Qatar small business, which solutions does each need to run, and where does ALYR stand on each one today? It is a working sheet with a table by sector and a matrix of every sector side by side, as of 19 Oct 2026.

## Key findings
- It splits what a small business needs into 22 layers in four groups: Customers (get found, talk to customers, catalog, orders, bookings, quotes, rentals, marketing), Money (online payment, card in the shop, deposits and refunds, credit), Operations (stock, delivery, counter sales, team) and Back office (reports, invoices, bookkeeping, payroll, licences, financing).
- ALYR's state on 19 Oct: 6 covered (catalog, orders, credit and collections, stock, team, reports), 4 partly covered (get found, talk to customers, bookings, delivery), 11 missing (quotes, rentals, marketing, online payment, deposits, counter sales, invoices, bookkeeping, payroll, licences, financing), and 1 left to partners (card in the shop).
- Pilot blockers it named: the shop's own WhatsApp number (ALY-39, with a 360dialog account as the backup, ALY-77) and a real payment provider (ALY-17). The plan was to connect the shop's own payment account so the money goes straight to the shop and ALYR never holds funds.
- Ten sectors in three tiers. Tier 1: bakeries and dessert shops, wholesale traders on credit, abaya, perfume and gift boutiques. Tier 2: caterers and event setups, home services, cafeterias and baqalas. Tier 3: salons and spas, restaurants on delivery apps, clinics, travel and typing offices.
- Readiness counts a sector's must-haves (covered 1, partly a half, missing 0). The page computes it; worked out from its data: cafeterias 75%, bakeries 67%, wholesale 58%, boutiques, restaurants and travel offices 50%, salons 40%, home services 33%, caterers 29%, clinics 25%.
- The weakest sectors (caterers, home services) wait on one missing piece: a quote flow (request, price, accept, deposit, balance). The page planned it for Dec 2026 to Jan 2027 as the core of "Occasions", with rentals built on top of it.
- Build versus partner: do not build a full POS (connect to Foodics and others), do not build a ledger (export to Zoho Books, QuickBooks, Tally), keep the bank or SADAD card terminal, e-invoicing through a GTA-accredited partner, payroll as a WPS file the bank uploads, financing as lender referrals with consent (2028).
- Timing it gave: quotes Dec 2026 to Jan 2027; invoices and licence reminders Q1 2027; marketing (contacts, opt-in broadcasts, loyalty) early 2027; payroll 2027; POS, bookkeeping, delivery driver view, stock purchasing and the marketplace "after 10 paying".
- What each sector uses today, as the page records it: bakeries use the WhatsApp Business app, Instagram, Foodics or Slant POS and the delivery apps; wholesalers use Tally or an ERP, Excel price lists and post-dated cheques; boutiques use Instagram with some Salla, Zid or Shopify and payment links; salons use Fresha (local in Qatar since July 2025); online sellers have had to offer electronic payment since March 2026.
- Clinics are flagged for health data rules (PDPPL) not yet checked by the lawyer.
- Sources it cited: the ALYR repo (`docs/status.md`) as of 19 Oct 2026 for status, and the go-to-market analysis for sector needs and current tools. Items not sourced there are marked as assumptions to check in the first interviews.

## What we decided because of it
- Nothing directly. It is a snapshot to steer pilots and build order.

## What changed since, and conflicts
- Statuses are out of date. Per the repo layout on 24 Oct, the documents engine (receipts, invoices, credit notes; specs/011, specs/013, D-042) and the pricing pack (delivery fees, discounts, costs; specs/014) now exist, so "invoices" and "delivery fees by area" are no longer plain gaps. Check `docs/status.md` before quoting any row.
- Payment providers: the page names Tap, MyFatoorah, SkipCash or Sadad. The repo's hard rule names SADAD, SkipCash and Dibsy. See "Alyr payment layer: analysis and strategy" (20 Oct) for the current view.
- Positioning: D-048 makes ALYR the small business's tech team, with WhatsApp one product among several. The page's layer view fits that framing well.
- Target: every owner-run business, Qatar first then the GCC (D-043). The tiers here are an order of approach, not a limit. D-024 already widened the first buyer to businesses that book, order, pay and track.
- Overlaps closely with "Alyr go-to-market: priority businesses, their tech stack, and the solution map" and "Alyr solution maps" (both 19 Oct), which supplied the sector needs, and with "ALYR sector playbooks" (18 Oct).

## Use it for
- Choosing which sector a pilot fits best, and what a sector will ask for that ALYR does not have.
- The build-versus-partner line for POS, bookkeeping, card terminals, e-invoicing, payroll and lending.
- Refresh the statuses from `docs/status.md` first.
