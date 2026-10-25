# ALYR Shelf and ALYR Docs: messaging for the two product pages

| | |
|---|---|
| **Category** | marketing |
| **Date** | 2026-10-20 |
| **Status** | Partly superseded |
| **Where it lives** | `docs/site-products-2/02-messaging.md` on main |
| **Lane** | Site and brand |

## Question it answered
What words (English final, Arabic draft) should `/shelf` and `/docs` use, and what changes across the rest of the site when Shelf and Docs join and Payroll leaves?

## Key findings
- Positioning. Shelf is "bookkeeping that keeps itself": every sale takes its stock in the same step, so the last item sells only once; it comes with every product, like ALYR Agent. Docs is "the paper that follows the sale": receipts, invoices and credit notes, Arabic first, gapless numbers, final once issued. The CR rule is framed warmly: no CR, receipts that say so; invoices once the CR number is added.
- Names and descriptors: Shelf "Items and stock" / «الأصناف والمخزون» (the product's own tab names; «المنتجات» is already taken by the suite menu); Docs "Receipts and invoices" / «الإيصالات والفواتير». The founder's line "Everything you sell, on one shelf." becomes «كل ما تبيعه، في مكان واحد.» in Arabic, so «رفّ» does not read as a translated product name.
- Recommended heroes. Shelf: "Everything you sell, on one shelf. / Every sale counts the stock down." Docs: "Payment in, receipt out. / Every number in order. Every paper final." Each page has two ranked alternatives with reasons (for example "The last cake sells once" was too bakery-specific for groceries and wholesale).
- Full page copy for both: tabbed demos in the product's exact words, three "how it works" stories each (the last one sells once; a staff phone marks it sold out; an unpaid order gives stock back; a payment becomes a receipt; a sale on account becomes an invoice; a mistake becomes a credit note), the screen with callouts, everything it does, "Not yet", who it is for, works with, questions, closing call, meta.
- One fictional sample business for both pages, Qirfa Bakery, with items from the seed and one invented item marked as such. It warns not to use the engine's sample customer, whose family name is on the retired list.
- Docs framing: present tense, never "today", "now", "live", "turn it on" or "coming"; even the "Everything it does today" heading drops "today". "Sends it" rests on one stated condition: the PDF goes in the chat only inside WhatsApp's 24-hour window, because the three document templates are not submitted.
- Exact legal lines. May say: "Arabic first, and Arabic always on documents for consumers"; "ALYR never deletes an issued document"; "ALYR does not give tax advice". Must not say: any compliance claim, a retention period, "tax invoice" or VAT, e-invoicing or the tax authority, invoices without a CR, live card payments.
- Site-wide changes: order Chat, Bookings, Agent, Accounts, Shelf, Docs; Payroll removed everywhere; "Early access" becomes "Set up for you" / «نجهّزه لك»; new "works with" rows on every page; stale lines fixed (`/accounts` "Not yet", `/agent` cash line, `/bookings` deposits, `/chat` "receipt" meaning a confirmation message).
- Claims table: 26 Shelf claims (most "True", import and export "Gated" until tried in real Excel), 26 Docs claims (almost all "Built, hidden"), 5 site-wide. With the offer on, the "+QAR 150 per product" lines name only Chat, Bookings and Accounts; Shelf is included and Docs has no price.
- Found for other lanes: first-person product replies ("I will send you...") and the stock log actor "Assistant" break the honesty rules; the workspace uses «المتجر» where the site says «المحل».
- Not checked: native Arabic review (ALY-66), the founder's name check of Qirfa, the product itself was not run, lengths at 320 px, offer-on and WhatsApp contact states.

## What we decided because of it
- D-046 (21 Oct, founder 20 Oct): the two pages, the six-product order, Payroll off the site, "Set up for you", Shelf and Agent "With every product", the offer-on pricing change. D-046 lists this file's [F] lines (routes, the tax line under "Not yet", whether Docs can be a first product) as open for the founder.

## What changed since, and conflicts
- Homepage lines here (suite body and rows, "By business" rows, how-it-works step 2, the `which-product` FAQ) were written for the D-037 homepage. D-056 and D-048 rebuilt and folded the homepage (now "The tech team your business never had."), so check `copy.ts` before reusing any of them.
- "FIG 0N" captions on figures: replaced by a single "Sample" mark (founder, 24 Oct, brand.md).
- `03-visuals.md` (same folder, same day) draws different sample details: an item 214 "Saffron cake", receipt RC-0042 for QAR 169 paid in cash, a Monday date for the Shelf figure. This file uses items 104 to 131, RC-0042 for QAR 64, and Saturday 17 Oct. The build has to pick one set.
- It updates `agent-dashboard/06-messaging.md` (17 Oct) on the stale `/agent` and `/accounts` lines and on Payroll and "Early access".

## Use it for
- Any wording on `/shelf` or `/docs`, and the claim and condition behind each line (section 6).
- The legal "may say / must not say" table before writing anything about receipts, invoices, tax or Arabic on documents.
- The offer-on price wording once Shelf and Docs are in the line-up (Appendix A).
