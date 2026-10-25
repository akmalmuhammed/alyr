# Alyr payment layer: analysis and strategy

| | |
|---|---|
| **Category** | strategy |
| **Date** | 2026-10-20 |
| **Status** | Draft (not yet decided) |
| **Where it lives** | Claude artifact (Claude Docs): https://claude.ai/artifact/TLviTw2JP5K9AD9TaVJsw2, titled "Alyr payment layer: analysis and strategy" |
| **Lane** | Product |

## Question it answered
How should a shop on ALYR take card payments from its customers without ALYR holding the money, and can ALYR open the shop's payment account for it instead of coaching each shop by hand? Which provider should ALYR partner with, and how can ALYR earn from payments?

## Key findings
- The shop is always the merchant of record: its name is on the card statement, its bank receives the payout, and it carries refunds and disputes. ALYR creates the payment link, records the result and never touches the money.
- Collecting customers' money and paying it on to shops is a regulated payment service under the Qatar Central Bank's Payment Services Regulation (Circular 23 of 2021). A licence takes about 6 to 12 months. QCB's 2025 annual report lists 14 licensed fintechs: 9 merchant acquirers (Pay2M, Noqoody, SkipCash, MyFatoorah, Dibsy, SADAD, "7", Tess Payments, Tap), 3 e-money issuers and 2 buy-now-pay-later firms.
- Three models. A: the shop brings its own provider and pastes its keys (the existing plan, ALY-17). B: ALYR opens an account in the shop's name through the provider's API (recommended default). C: ALYR collects and splits as a marketplace (only later, and only after the lawyer clears it, because ALYR would become the merchant of record).
- Partner pick: Tap Payments first, as "ALYR Payments, powered by Tap". It is QCB-licensed, licensed in all six GCC countries, and the only Qatar-licensed provider found with public documentation for platforms opening merchant accounts (its Lead and Merchant account APIs). SADAD second (published prices, direct NAPS debit, accounts it says open in under an hour). MyFatoorah in reserve.
- What would change the pick: Tap cannot open Qatar accounts through its API or needs paper forms per shop; poor NAPS debit success (SADAD claims Tap routes NAPS through an intermediary, unverified); a price clearly above 2.5% or payouts slower than a week.
- Global providers do not fit a Qatar home business today: Stripe does not accept Qatar businesses (the UAE is its only Middle East country), and Checkout.com, Adyen and others serve large merchants. Stripe Connect is the design to copy.
- Fees on published prices: SADAD 2.5% (Amex 3%) with a QAR 2.50 minimum, QAR 2 per refund, gateway API QAR 99 to 199 a month; Dibsy 2.5% plus QAR 1, payouts twice a week. A QAR 120 cake costs about QAR 3 on SADAD, QAR 4 on Dibsy. QCB caps in-store debit card fees at 1.1% (0.5% for micro merchants).
- Payment habits: most residents pay with NAPS debit cards, so any provider must accept NAPS online. In March 2025, 58% of card and instant payment value went through POS terminals, 27% through e-commerce and 14% through Fawran (QNA, from QCB). Fawran has no open API for ALYR yet. WhatsApp in-chat payments exist only in India and Brazil.
- Banks: QNB, CBQ and Doha Bank give merchants an ID and API passwords for their online gateways, which may share one Mastercard Gateway adapter (unverified per bank). Bank terminals have no public API, so ALYR records counter card payments by hand and later matches the bank's settlement report. Banks take 2 to 4 weeks to onboard (per SADAD) and cannot open accounts through an API, so they do not replace model B.
- A home business needs a trade licence for card payments. The MOCI home licence covers 63 activities; its cost is unverified (QAR 300 per a July 2024 cut, versus QAR 1,500 to 2,000 a year per a SADAD guide). ALYR should keep unlicensed sellers on cash and transfer.
- How ALYR could earn, best first: a revenue share from the provider; a platform fee inside the payment if the provider allows it (the playbook's default is 0.5%, so QAR 100 a month on QAR 20,000 of online sales); the fee added to the monthly bill. It cites the 19 Oct revenue study: payments are about 82% of Toast's revenue and about 78% of Shopify's.
- What ALYR builds: a payment adapter (ALY-17) with "open account" and "authorize" added; a "Get paid online" form that checks photos and IBAN check digits; account states (not started, sent, needs a fix, live, paused); refunds, deposits and card holds; later dispute packs and a payouts view. The pay page, part payments, payments by hand and refund alerts already existed. ALYR stores references, statuses and amounts, never card data.
- Rollout: talks with Tap and SADAD before the commercial registration; sign in the registration week, with a real QAR 1 NAPS payment and a credit card payment refunded the same day; pilot gate of form to live payments in under 48 hours with no staff help; at 10 paying shops, at least half of online orders paid by ALYR link. It lists 12 questions for providers, the first five deal-breakers.
- ALYR's own subscription: through ALYR's own merchant account at the same provider, with the shop's card saved for monthly billing.
- Sources it cited: Gulf Times, M Advisory (QCB's own PDF could not be read automatically), QatarsTalk, FinTech Futures, Tap's site and developer docs, SADAD's pricing and guides (marked as marketing), MyFatoorah docs, Dibsy, Wamda, MENA Startup Digest, Marhaba, Stripe, Meta's developer docs, QNA, Qatar Tribune, CBQ, QIB, Mastercard Gateway docs and Fatora. Many points are marked unverified, including Tap's Qatar fees, payout times, whether providers accept a home licence, surcharge rules and the legal line for model C.

## What we decided because of it
- Nothing recorded in docs/decisions.md on this check. The self-serve onboarding audit refers to D-044 (payments) as an open pull request; it is not in docs/decisions.md.
- It is consistent with hard rule 3 (non-custodial payments, each merchant on its own gateway account, references only). Hard rule 3 names SADAD, SkipCash and Dibsy; Tap as the main partner is not decided.

## What changed since, and conflicts
- ALYR's own billing: the study proposes card billing through ALYR's own merchant account. The Client onboarding plan (23 Oct) proposes Tap or SADAD in Qatar and Paddle abroad. D-051 (23 Oct) records what happens today: the client pays by bank transfer and staff record it, until online payment exists (ALY-5, ALY-188). None of the card options is decided.
- D-051 makes clients pay the setup fee and first period before products open; any provider chosen for ALYR's billing has to support that.
- Prices are quoted per client (D-032), from QAR 449 a month with setup from QAR 1,500 (D-034). The study's revenue ideas (platform fee, marketplace fee) are not priced or decided. There is no free plan or trial, and no prices, contracts or provider agreements before the commercial registration.
- Its revenue reasoning draws on WhatsApp and small business revenue models: global study (19 Oct). Its point that Tap works in all six GCC countries overlaps with Selling across the GCC from Qatar and the Alyr global expansion plan (20 Oct).
- The Client onboarding plan keeps "Pay ALYR" and the shop's "Take payments" as two separate steps, and never blocks go-live on the shop's payments. This study is about the second.
- D-048 (23 Oct) positions ALYR as the small business's tech team, with WhatsApp as one product among several. Payment links stay a module of Chat and Bookings (D-035).

## Use it for
- Choosing a payment provider, preparing provider talks (the 12 questions), or building ALY-17.
- Checking what ALYR may and may not do with money under QCB rules, before any payment feature.
- Fee examples and the earning options, once the commercial registration allows prices.
