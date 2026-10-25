# Alyr self-serve onboarding audit

| | |
|---|---|
| **Category** | sales |
| **Date** | 2026-10-20 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (Claude Docs): https://claude.ai/artifact/KTB4p7RVeNQpfj32W1KCei, titled "Alyr self-serve onboarding audit" |
| **Lane** | Product |

## Question it answered
Can a business sign up to ALYR, set itself up and take a real customer order with no help from ALYR, in Qatar or in another country? If not, what blocks it, in what order should the gaps be fixed, and what would a fully guided onboarding look like?

## Key findings
- Short answer: no. No business could onboard and take a real order alone on 20 Oct. Autonomy scored 1.9 out of 5 in Qatar and 1.3 outside Qatar (average of 25 capabilities, 0 meaning ALYR must do it or it does not exist, 5 meaning any owner finishes it alone in minutes).
- The gap is the wiring, not the product. The content tools (catalogue import, stock, features, delivery, QR codes) averaged 3.3; connections and money averaged 0.8.
- What blocked a Qatar shop, hardest first: no way to connect a WhatsApp number (no Embedded Signup, ALY-39; ALYR not yet a Meta Tech Provider, ALY-52; not even a back-office button); nothing hosted (the API ran on a laptop behind a tunnel, sign-up closed outside a local machine); sign-in codes could not be emailed without the email provider key (ALY-74); ordering businesses (bakery, restaurant, grocery, shop, fashion, wholesale) could not self-serve at all; and no online payment (cash, transfer and credit accounts worked).
- Also missing: terms and privacy at sign-up, ALYR's own billing (accepting a quote charged nothing), and message templates approved on each shop's own WhatsApp account (32 templates on ALYR's test account, 31 still pending on 13 Oct, 9 more not submitted).
- An appointment business (salon, spa, clinic, home services) could finish every setup screen alone on a laptop, including a test booking on a private simulator line. Bookings served one customer at a time per shop (ALY-27).
- Ten items had to be done before the first shop goes live. The top of its ranked scorecard: hosting, WhatsApp number connection, sign-in, the ordering path in onboarding, templates per shop, terms at sign-up, a go-live readiness check, a test order for order businesses, opening hours for ordering shops, and a sign-up link from the site.
- Outside Qatar the product assumes Qatar in about ten places: amounts formatted as QAR (about 190 uses; Kuwait, Bahrain and Oman use three decimals), time zone never asked, phone numbers default to +974, areas are nine Doha districts, Qatar payment providers only, English and Arabic only, no VAT (UAE 5%, Saudi 15%, Bahrain 10%, Oman 5%; Saudi needs ZATCA e-invoicing). The documents engine already handles seven currencies and is the pattern to copy.
- Fourteen things no screen covered, the first five deciding whether WhatsApp onboarding works at all: Meta's limits on a new number, the card each shop must add in Meta, which WhatsApp the shop uses today, templates per shop, and the Tech Provider cap of about 10 new shops per 7 days until app review (ALY-76). Others: importing existing customers with consent, starting the catalogue from where the menu already lives, abuse, resume links, the person who is not the owner, Ramadan and Eid settings, leaving cleanly, a measurable money-back result for order businesses, and a funnel.
- Target: an onboarding agent. The owner answers six questions, sends a photo of the menu, approves a few lists, and in one sitting has a connected number, a live catalogue, a test order and a QR card; a first-week plan follows. Rule: the agent proposes, the owner approves, the existing engine writes. No customer personal data goes to a language model, and a model in the product needs a new decision replacing D-012.
- Today against the target, Qatar: average 1.7 now, 3.3 for a pilot with the founder beside the owner, 4.8 for the agent. The WhatsApp number and online payment stay low even for pilots because they depend on Meta and the payment partner. Fallbacks: a Solution Partner number at about EUR 49 a month (ALY-77), and cash or transfer.
- For the first 10 shops the founder or an advisor is the onboarding agent, in person. Every pilot set up by hand should follow the steps the agent will later run.
- It proposed 13 issues (N1 to N13), created in Linear on 20 Oct under ALY-163 as ALY-164 to ALY-177. N1, self-serve onboarding for order businesses with bakery first, was the largest before go-live. The agent and a Kuwait country pack come after 10 paying shops.
- Sources it cited: the repository at commit de59739 (20 Oct, after PR #96), the code files and docs it names, decisions D-007, D-012, D-013, D-031, D-032, D-034, D-039 and D-042, the go-live checklist, the data-residency file, the Linear issues listed, open pull requests (#97 for payments, #79, #71, #51, #52, #47), and a GCC expansion study. Nothing was run against a live Meta number or a payment provider.

## What we decided because of it
- D-049: one onboarding engine with a readiness check that decides ready and live. The audit's proposed readiness check (N2, ALY-165) and funnel (N6, ALY-169) became part of it, through the Client onboarding plan.
- D-050: each WhatsApp way has its own list of what to have ready. It answers the audit's point about asking which WhatsApp a shop uses first.
- The issues ALY-164 to ALY-177 were created from it.

## What changed since, and conflicts
- It is a snapshot of main on 20 Oct. The onboarding engine, the readiness check, the go-live states and the WhatsApp ways were built after it (D-049, D-050, per the Client onboarding plan of 23 Oct). Check the current code before relying on any score.
- Its target says the price is published automatically for standard types and billing starts at go-live. D-051 (23 Oct) overrules the billing part: a client pays the setup fee and the first period before any product opens. The money-back clock still starts at Live (D-034). Prices are quoted per client (D-032), from QAR 449 a month with setup from QAR 1,500 (D-034); there is no free plan or trial, and no prices or contracts before the commercial registration.
- The onboarding agent depends on using a language model, which D-012 does not allow today, and on a data-residency entry (hard rule 2). Not decided.
- It mentions D-044 (payments: cash, transfer and credit accounts are enough to go live) as an open pull request. On this check D-044 is not in docs/decisions.md. The Alyr payment layer study (20 Oct) covers the same ground.
- Its country findings overlap with Selling across the GCC from Qatar and the Alyr global expansion plan (both 20 Oct). It follows the GCC study's advice to test Kuwait first, after 10 paying Qatar shops.
- D-048 (23 Oct) positions ALYR as the small business's tech team, with WhatsApp as one product among several. The audit treats WhatsApp ordering as the whole product; the onboarding gaps it lists still apply.
- Target market: every owner-run business, Qatar first, then the GCC (D-043). The audit names bakeries as the recommended first segment.

## Use it for
- The list of what an owner meets in the first two weeks that no screen covers.
- The country assumptions to remove before selling outside Qatar.
- The design of a future onboarding agent and its safety rules.
