# Sector playbooks for seven business categories

| | |
|---|---|
| **Category** | customers |
| **Date** | 2026-10-18 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (Claude Docs): https://claude.ai/artifact/WG8F3CrkTpEoBLAuZEP2Dh, titled "ALYR sector playbooks: winning formulas, audits and feature templates for 7 business categories" |
| **Lane** | Customers |

## Question it answered
How do the best operators in seven small-business categories win, how would ALYR audit and score a business in each, and which features should be switched on per category? The seven are beauty and wellness, food, retail and social commerce, wholesale and B2B credit, clinics, home and field services, and fitness, education and membership.

## Key findings
- One template for every category, in six parts: winning formula, 12 to 20 scored audit points (0 absent, 1 manual, 2 working), improvement playbook, tool map (integrate, replace or leave alone), feature bundle, and a week-by-week conversion path. The audit, the scoring and the bundles are proposals, not facts.
- Five moves recur across all categories: be the front door on WhatsApp in Arabic and English; take the money earlier (deposits, stored cards, pay at order, credit-limit checks); run a retention loop on a trigger; keep one record; give the owner five numbers a week.
- Integration rule: where the incumbent tool has an open API (Shopify, Salla, Tally, Zoho Books, Loyverse, Mindbody, Jobber, Phorest, Zenoti), integrate. Where it is closed (Fresha), offer a read-only bridge. Where the owner uses paper, ALYR is the system of record, which it assumes is the majority case in Qatar.
- Beauty: Phorest reports no-shows falling from 5.4% to 1.9% after deposits; median salon staff utilisation is 47 to 49% against 76 to 79% at the top decile (Zenoti, vendor data). Fresha announced a Qatar launch in July 2025 and has no public API.
- Food: Qatar foodservice is about USD 2.0B (2025), independents hold 75% of value, cloud kitchens grow a forecast 17% a year (Mordor). Aggregator commissions run about 15 to 35%, Talabat 20 to 30% (no Qatar figure). Waste control returns about USD 7 per USD 1 (Champions 12.3, 2019).
- Retail: Ministerial Decision 25 of 2026 (in force 16 March 2026) requires an e-commerce licence (QAR 500), electronic payment and a published returns policy; social media counts as a website. Whether a home-licence seller also needs it is open for the lawyer.
- Wholesale: Middle East days sales outstanding was 81.1 in 2024 (PwC via Qoyod); in the UAE about 47% of B2B sales are on credit (Atradius 2026). No independent evidence was found that WhatsApp reminders collect faster.
- Clinics: text reminders lifted attendance from 67.8% to 78.6% (Cochrane). Qatar's public primary care had about 25% no-shows in 2019. Heaviest regulatory load: health and insurance data must stay out of WhatsApp and ALYR's storage, pending a lawyer.
- Field services: maintenance contracts are the structural gain (cited 55 to 65% contract margin, unverified). First-time-fix of 70 to 80% is typical. Qatar HVAC maintenance is about USD 300M (2025, indicative).
- Membership: the biggest dues leak is no payment method on file, not declined cards (Gymdesk collects 91.7%; about 5.8 of the 8.3 missing points are never attempted). Children's data needs a lawyer's answer before this category opens.
- A matrix of 15 shared features shows most are reused across categories; the booking calendar alone serves four. Proposed rollout: wave 1 credit wholesalers, retail and social sellers, home kitchens; wave 2 beauty and field services; wave 3 membership, food with POS integration, clinics.
- Open conflicts it flagged: WhatsApp rates (resellers list Qatar USD 0.0341 marketing and USD 0.0120 utility; the master plan has USD 0.0091; Meta's page differs on service-message billing), e-invoicing (draft law approved 6 May 2026, a vendor expects 1 January 2027), and the trade-name activities needing to cover assessment work.
- Evidence is weak: confidence low to moderate, mostly vendor and North American pages, no owner interview logged, so every Qatar workflow is assumed. Pages the researchers could not open: Odoo API docs, Foodics developer docs, the Ministry of Public Health licensing page, Cliniko and Open Dental API docs, Loyverse pricing, a Salonist report.
- Sources it cited include Zenoti, Phorest, Mordor Intelligence, Restaurant Dive (Paytronix, Olo), Champions 12.3, Gulf Times, Qatar Tribune, DataReportal, Crowell, Al Tamimi, Marhaba, QNA, Atradius, PwC via Qoyod, EY, Wafeq, Cochrane, HIT Consultant, Gymdesk, PushPress, IHRSA via GoCardless, Meta, respond.io, SADAD and Inc42.

The source was read in full. Its diagram (the template loop) was not opened; the text around it describes it.

## What we decided because of it
- Nothing directly. The catalog-per-business-type and feature-switch work (specs/008 and specs/012) follows the same idea of one engine with features switched on per shop, but no decision cites this study.
- D-048's loop (check, set up, see, improve) matches the study's audit, score and roadmap loop; D-048 does not cite it.

## What changed since, and conflicts
- Target: every owner-run business, Qatar first, then the GCC (D-043). The rollout waves were never adopted as a decision.
- Its gap table is out of date: the Catalog was switched on 18 Oct (ALY-113), and later work added documents and connected mode.
- Pricing and offer are now from QAR 449 a month, setup from QAR 1,500 (D-034), quoted per client (D-032), paid before products open (D-051). No free plan or trial; no prices or contracts before the commercial registration.
- "Alyr go-to-market: priority businesses, their tech stack, and the solution map" (19 Oct) ranks the same categories differently: it puts bakeries, wholesalers and boutiques first and parks salons and clinics. Both agree clinics wait for a lawyer.
- The agent features (voice-note parsing, photo-to-listing) stay blocked by the data-in-Qatar rule, and D-035 bars AI wording until a model is in the product.

## Use it for
- Building an audit checklist or a feature bundle for one of the seven categories.
- Sector numbers and the incumbent tool map (prices, API openness) before a sales visit; re-check prices first.
- The lawyer's question list for clinics, membership, cheques and home sellers.
