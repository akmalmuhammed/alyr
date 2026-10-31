# Pricing page brief for the site session (`/pricing`, `/ar/pricing`) — for ALY-301

Not built, not published. Goes live only when the founder says yes (prices public, D-034 and the offer switch).

**Why.** Paddle's website review wants the product and what it costs to be visible, with the terms, refund
policy and privacy policy linked in the navigation.
Source: https://www.paddle.com/help/start/account-verification/what-is-domain-approval

**Content (English and Arabic, same structure):**
1. One headline: what ALYR does for a small business in Qatar (use the live homepage wording).
2. The plan and its price: `[TO DECIDE: QAR 449 by transfer and USD 129 by card, or one price]`; USD 15 for each
   added product (D-074); no setup fee (D-092); month to month, stop with 7 days' notice.
3. What is included each month (agreement clause 2.2: updates, team sign-ins, the weekly report, a person who
   answers, changes to menu, prices and hours on request).
4. The first month back if the agreed result is missed: link to `/refund`.
5. How to pay: card through Paddle (merchant of record, charges in US dollars, sales tax handled) or bank transfer.
6. Footer links on every page: Terms, Refund policy, Privacy, Contact; the legal name "alyr software" and CR 255539.

**Rules to keep.** The site checks (`pnpm site:check`) ban unlisted prices and words and require English and
Arabic parity: update `copy.ts` in both languages together. The prepared offer copy that still names a setup
fee (`price.setup`, `price.firstMonth`, the agreement block) must change to match D-092 before it goes live.
Keep the business name identical everywhere it appears.
