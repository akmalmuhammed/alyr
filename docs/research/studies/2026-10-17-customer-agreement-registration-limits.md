# Customer agreement notes: what ALYR may not do before its commercial registration

| | |
|---|---|
| **Category** | sales |
| **Date** | 2026-10-17 |
| **Status** | Current |
| **Where it lives** | `docs/company/customer-agreement/notes.md` on branch `origin/aly-98-customer-agreement` (PR #47, ALY-98, not merged). The agreement draft beside it is deliberately not copied or summarised here |
| **Lane** | Company |

## Question it answered
Can ALYR sign customers, take money or advertise a priced service before it holds a Qatar commercial registration (CR)? And where do the homepage, the back office and the product disagree with the draft agreement? It is research for a Qatar-qualified lawyer, not legal advice, and no lawyer had read it.

## Key findings
- **No signing and no money before the CR.** Commercial Register Law No. 25 of 2005, art. 7: no person may trade before registering. Penalty (art. 16): up to 6 months' prison and/or a fine of up to QAR 200,000, and the court may close the business. Official text read.
- **A priced monthly subscription offered to many shops is trading.** Commercial Law No. 27 of 2006: advertising a business to the public makes someone a trader (art. 13); only a one-off deal does not (art. 14). Applying this to ALYR is inference.
- **A contract signed now binds the founder personally.** A company has no legal personality until publicised, an LLC may not start business until registered, and people who contract for an unformed company are personally and jointly liable (Companies Law No. 11 of 2015, arts. 5, 8, 233). No rule was found that lets an LLC adopt a contract signed earlier.
- **Selling online needs MOCI's e-commerce licence** (Ministerial Decision No. 25 of 2026, in force 16 Mar 2026). "Website" includes social media, the applicant must already hold a CR, the fee is reported as QAR 500, and the site must show the CR and licence numbers, contact details, a return policy and complaints handling.
- **Payment needs a CR.** QNB and SADAD merchant services ask for one, and payment into a personal account is still trading without a CR.
- **What to do until the CR:** show owners the price and agree a result in principle, but sign nothing as ALYR and take no fee, deposit or subscription into any account. The most a shop can sign is a short non-binding letter of interest worded by the lawyer. Ask the lawyer whether a priced homepage counts as holding out as a trader.
- **After the CR:** the trade name and CR number in Arabic on papers (fine up to QAR 50,000), Arabic or bilingual invoices, a bank account, payment providers, the e-commerce licence and a returns and complaints page.
- **Consumer law probably covers small businesses** (Law No. 8 of 2008 does not exclude them). Misleading terms are banned, ads and invoices must be in Arabic, and fines reach QAR 1,000,000. So the Arabic version of the agreement is needed before anyone signs, with Arabic prevailing as recommended.
- **Site and product mismatches found:** the money-back headline is broader than the term (only the first month's subscription is refunded, and the Arabic «المبلغ» reads wider still). The 7-day notice to stop was missing from the page. "A payment link is offered" reads as live. The back office promised "first month free", which contradicts the agreement. Setup is QAR 2,500 in the back office against QAR 1,500 on the page.
- 16 questions for the lawyer, including signing before registration, standard-form terms under Civil Code arts. 105–107, the liability cap, PDPPL controller and processor terms, whether salon or clinic bookings are special-nature data, and Arabic prevailing.

## What we decided because of it
- D-034 update (17 Oct): prices, the money-back lines and the price question stay off the published site until the CR. `NEXT_PUBLIC_ALYR_OFFER=on` turns them on later. The founder chose this over waiting for the CR and over publishing prices now.
- The term "stop at the end of any month, with 7 days' notice" was added to D-034 (17 Oct).
- D-043 and every later plan use the letter of interest as the most that can be signed before the CR.

## What changed since, and conflicts
- Still the governing reading. The CR was submitted to MOCI and was still awaited on 19 Oct (D-043); check `docs/status.md`.
- D-051 (23 Oct, a client pays before products open, by bank transfer recorded by staff) depends on the CR: no transfer can be taken before it.
- Some product gaps it listed have moved on (hosting, D-013 and later; a go-live date, `tenants.live_at` in D-049 and D-051). Recheck before relying on section 4.
- The Meta pricing point was unconfirmed (service messages possibly charged from 1 Oct 2026); recheck.

## Use it for
- Before any sales step, ad, price, offer or signature before the CR.
- Briefing the lawyer (ALY-32, ALY-51): the 16 questions and the sources section.
- Checking the site's price and money-back wording on the day the offer switch goes on.
