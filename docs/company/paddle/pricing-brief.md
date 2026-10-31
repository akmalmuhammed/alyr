# Pricing page brief for the site session (`/pricing`, `/ar/pricing`) — for ALY-301

Not built, not published. Goes live only when the founder says yes (prices public, D-034 and the offer switch).

**Why.** Paddle's website review wants the product and what it costs to be visible, with the terms, refund
policy and privacy policy linked in the navigation.
Source: https://www.paddle.com/help/start/account-verification/what-is-domain-approval

**Content (English and Arabic, same structure):**
1. One headline: what ALYR does for a small business in Qatar (use the live homepage wording).
2. The plan and its price, DECIDED 31 Oct: show both routes. In riyals when paying by bank transfer (the first
   product and each added product, from the price list's defaults) and in US dollars when paying by card (USD 129
   the first product, USD 15 each added, D-074). Take every figure from the price list defaults (migrations 0015,
   0018, 0064 and later) and D-092, never from the older prepared copy: if `copy.ts` disagrees with the price
   list (it says QAR 50 for an added product in places; the price list says QAR 150), use the price list and name
   the difference in the pull request. No setup fee. Month to month, stop with 7 days' notice.
3. What is included each month (agreement clause 2.2: updates, team sign-ins, the weekly report, a person who
   answers, changes to menu, prices and hours on request).
4. The first month back if the agreed result is missed: link to `/refund`.
5. How to pay: card through Paddle (merchant of record, charges in US dollars, sales tax handled) or bank transfer.
6. Footer links on every page: Terms, Refund policy, Privacy, Contact; the legal name "alyr software" and CR 255539.

**Rules to keep.** The site checks (`pnpm site:check`) ban unlisted prices and words and require English and
Arabic parity: update `copy.ts` in both languages together. The prepared offer copy that still names a setup
fee (`price.setup`, `price.firstMonth`, the agreement block) must change to match D-092 before it goes live.
Keep the business name identical everywhere it appears.
