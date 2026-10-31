# Paddle: what the website needs before Paddle will approve it (ALY-301)

Written 31 Oct 2026. Paddle (D-074, ALY-180) takes card payments for ALYR's own service as merchant of
record. Before it lets a checkout open from a domain, it reviews the website. Its own page says the
terms, the refund policy and the privacy policy must be easy to reach from the navigation, with the
product and what it costs visible, and that the name on the site must match the legal entity.
Source: https://www.paddle.com/help/start/account-verification/what-is-domain-approval

## Where alyr.qa stands (checked 31 Oct 2026)

| Page | State |
|---|---|
| Privacy notice `/privacy` | Live (28 Oct) |
| Terms `/terms` | 404: draft in `terms-draft.md` |
| Refund policy `/refund` | 404: draft in `refund-draft.md` |
| Pricing `/pricing` | 404: brief in `pricing-brief.md` |
| Legal name in the footer | "alyr software", CR 255539: matches the registration |

## Order of work

1. Founder reads the two drafts and fills the `TO DECIDE` lines.
2. A lawyer reads them (ALY-51 brief; ALY-98 is the customer agreement they build on).
3. The site session builds `/terms`, `/refund`, `/pricing` in English and Arabic (parity and banned-words
   checks run in `pnpm site:check`) behind the offer switch, and links all three from the footer and menu.
4. Founder says yes to publishing (prices and legal pages go public).
5. Submit the domain in Paddle (Settings, Website approval). Not before: a rejection makes the next try harder.
6. Account verification in Paddle (identity, company documents, payout bank): the founder or the registered owner.
7. Live API key, client-side token and webhook destination; secrets go to Secret Manager from the clipboard.

## Things only the founder can decide

- **Which price the public sees.** The site's prepared offer says "from QAR 449 a month" (D-034). Paddle charges
  USD 129 a month for the first product and USD 15 for each added one (D-074), because Paddle has no riyal.
  Options: show the riyal price for clients in Qatar who pay by transfer and the dollar price for card
  payments; or show one headline price. Paddle needs the price a buyer is charged to be visible.
- **Setup fee.** D-092 removed it for now; the prepared site copy still names one and must change first.
- **The agreed-result refund.** The first month back if the agreed result is missed (D-034, agreement clause 5)
  is a promise on a public page: confirm it is the wording you want.
