# Client onboarding plan

| | |
|---|---|
| **Category** | sales |
| **Date** | 2026-10-23 |
| **Status** | Partly superseded |
| **Where it lives** | Claude artifact (Claude Docs): https://claude.ai/artifact/8bo68pdxsRcRsD7sEQrHWe, titled "Client onboarding plan" |
| **Lane** | Product |

## Question it answered
How should a new client get from first contact to a live business on ALYR, whether they sign up alone or ALYR sets them up? It also asked what the founder's own outline missed, what can be built before Meta and hosting are ready, and how the same flow holds at 100, 1,000 and 10,000 clients.

## Key findings
- One onboarding engine with three ways in, not two flows. Door 1 is self-serve (choose products, create an account, pay, a "workspace is ready" email, guided setup). Door 2 is assisted: the same steps, with ALYR staff owning some of them. Door 2b is a sales link: the founder builds a quote in the back office after a visit and the owner lands at the pay step. Since the founder sells in person, the plan expected most of the first 10 clients to come through 2b.
- Five changes to the founder's outline: create an email-verified account before payment; email a one-time sign-in link, never a password (sign-in is already passwordless, D-022); "onboarded" means the first real order or booking, not a ticked checklist; hosting gates door 1 as much as Meta does (on main at 20 Oct, sign-up was closed outside a local machine); and there are two payment flows, "Pay ALYR" and the shop's own "Take payments", with different partners and timing.
- A table of 19 onboarding pieces, in four groups: before the workspace (product pages, product picker with live quote, account, terms, pay ALYR, activation job, ready email), guided setup (split-screen guide, step engine, content, test order, WhatsApp number, shop payments, go-live gate), the assisted door (assisted mode, sales link), and after (first week, back office, offboarding with 7 days' notice). The live quote it describes: QAR 449, QAR 150 per added product, plus a setup fee.
- Gaps it ranked as most costly if skipped: the two payment flows; account before payment; owners set up from a phone, so the guide needs a phone layout from day one; the shop's existing WhatsApp number; a billing lifecycle (failed payment, pause, cancel, money-back claim, refund, bilingual invoice); step ownership with a log; onboarding events from the first client; a resettable demo workspace; "invite someone to do this step"; abuse controls; native Arabic at every step; and a reply promise for stuck owners.
- Four outside gates: hosting (Azure and credits, ALY-55), Meta (ALY-6, ALY-52), a payment partner and bank account (ALY-5), and the lawyer (ALY-32, ALY-98). Everything else could be built and tested on the simulator now.
- It proposed three go-live states: set up, ready and waiting for WhatsApp, live. It recommended charging the setup fee at activation and the monthly fee from Live, so a client is never charged a month for a line ALYR has not connected. It also recommended hosting on any container host now instead of waiting for Azure credits, with care over data residency.
- Back office build order: onboarding board, Client 360, subscriptions and billing, activation log, assisted mode, leads and sales links, funnel and revenue, messaging health, roles. Staff never see customer conversations (D-033), and staff actions go to an audit log.
- Scale: at 100 clients ALYR hand-holds most; at 1,000 self-serve is the default; at 10,000 partners onboard in their own name. The worker sends about 3 to 4 messages a second against an estimated 20 to 40 at peak. Cost to serve was estimated at about USD 8 to 10 per shop per month at 1,000 shops, against the QAR 449 plan. These figures are estimates from the go-live checklist, not measured.
- Billing at 100 clients: bank transfer and payment links recorded by hand, with Paddle named for clients abroad. Online card payment for ALYR via Tap or SADAD once a partner deal exists.
- WhatsApp, checked against Meta's pages on 23 Oct: four ways to connect (a new number; move the shop's number and keep the app, which Meta calls coexistence; the shop's own account with another provider; ALYR's shared number). Coexistence needs WhatsApp Business app 2.24.17 or newer, copies six months of one-to-one chats within 24 hours, and runs at 20 messages a second. Each business pays Meta for its own messages, so a card in Meta is a step on every way. ALYR's shared number is not offered and waits on the founder.
- Build order: the engine first, then door 2 and the back office, then the guided setup, then door 1 (once hosting and the email key exist), then the Meta work, then online card payment. It proposed 15 new tickets (T1 to T15) with sizes.
- Seven decisions for the founder, answered on 23 Oct: 1, 2, and 4 to 7 yes; 3 changed (see below). The decisions: account before payment; the setup fee (1,500 or 2,500, full for assisted clients, low for self-serve); when money starts; a same-working-day reply promise; host before Azure credits; Cloudflare Access in front of the back office; new number by default for the first 10 clients.
- Sources it cited: the repository at main (20 Oct), Linear epics ALY-163 and ALY-79, decisions D-031 to D-035, the self-serve onboarding audit and the go-live checklist, and Meta's developer pages for the WhatsApp ways. Nothing was measured on a running system.

## What we decided because of it
- D-049: onboarding is one engine with three doors, and a readiness check decides ready and live (the founder: "start building this").
- D-050: each WhatsApp way has its own list of what to have ready, and its state is honest about Meta.
- D-051: a client pays before their products open. This came from the founder's answer to the plan's third question.

## What changed since, and conflicts
- The plan's recommendation on money (setup fee at activation, monthly fee from Live) was overruled by the founder's answer, recorded as D-051: the owner pays the setup fee and the first period before any product opens. The 30-day money-back result is still counted from Live (D-034, D-051). The plan's line "a client is never charged a month for a line ALYR has not connected" no longer holds.
- The setup fee question (1,500 or 2,500) stays open in the plan. D-034 shows "from QAR 1,500, quoted at your visit"; D-032's draft quote starts at QAR 2,500.
- Prices are quoted per client (D-032), from QAR 449 a month with setup from QAR 1,500 (D-034). D-017's 490 and 890 plans are superseded. There is no free plan or trial, and no prices or contracts before the commercial registration.
- Paddle for clients abroad and a card link for ALYR's own billing are proposals, not decisions. The Alyr payment layer study (20 Oct) suggests charging ALYR's subscription through ALYR's own merchant account at the same local provider instead. Today a client pays by bank transfer recorded by staff (D-051).
- D-048 (23 Oct) positions ALYR as the small business's tech team, with WhatsApp as one product among several, and "Book a check-up" as the one action. The visit-first, sales-link door fits that better than door 1's "choose products" start.
- The plan builds on the Alyr self-serve onboarding audit (20 Oct) and agrees with it on the gates (hosting, email, Meta, terms). The audit's target of billing from go-live is overruled the same way by D-051.
- Target market: every owner-run business, Qatar first, then the GCC (D-043).

## Use it for
- Building or changing onboarding, the readiness check, the go-live states, assisted mode or the sales link.
- The back office build order and the list of gaps before opening self-serve sign-up.
- The four WhatsApp ways and what an owner must have ready for each (recheck Meta's rules before relying on them).
