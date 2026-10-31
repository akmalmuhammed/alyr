# Brief for a Qatar-qualified lawyer (ALY-51)

Prepared 28 Oct 2026 for the founder to send to a lawyer. It asks for a **written opinion**
on the numbered questions below. Everything in "The facts" is checked against the
company's documents and the code; nothing here is legal advice, and nothing in it has been
reviewed by a lawyer yet.

## The company

- **alyr software W.L.L.** (الير للبرمجيات ذ.م.م.), a limited liability company owned by one
  person, Qatar. Commercial registration 255539, registered 26 Oct 2026. Tax registration
  5009341769. Registered activities: designing and programming special software (620102),
  retail sale via the internet (479120). Head office: Doha.
- Trades as **ALYR**. Website https://alyr.qa (company details: https://alyr.qa/company).

## What ALYR does

ALYR is software for small businesses in Qatar (bakeries, salons, shops, wholesalers). A shop
uses it to answer customers on WhatsApp, take orders and bookings, send payment links, keep
credit accounts ("who owes what") and see a weekly report. One system serves every shop;
each shop's records are kept apart inside the database itself.

- **WhatsApp** goes only through Meta's official WhatsApp Business Platform (Cloud API).
  ALYR's business was verified by Meta on 28 Oct 2026 and it has started Meta's "Tech
  Provider" onboarding, which lets shops connect their own WhatsApp numbers to ALYR.
- **Payments.** ALYR never holds, pools or moves a shop's money. Each shop uses its own
  account with a Qatar payment gateway (SADAD, SkipCash or Dibsy); ALYR creates a payment
  link on that account and stores only the payment's reference and status, never card
  numbers.
- **Messages ALYR starts** (reminders, confirmations) go out only to customers who agreed,
  inside WhatsApp's rules; anyone who writes STOP is not messaged again.

## Where the data is

| Service | What it receives | Where |
|---|---|---|
| Google Cloud, Doha region (`me-central1`) | The database: shops, their staff, their customers' names, WhatsApp numbers or user IDs, messages, orders, bookings, balances, payment statuses | Qatar |
| Meta (WhatsApp Business Platform) | Every WhatsApp message to and from a shop, with the numbers and names; receipts and invoices sent as PDFs | Outside Qatar |
| Cloudflare | The website and the pages customers open from WhatsApp (order, booking, payment, receipt), in transit | Global network, outside Qatar |
| Resend | Emails ALYR sends: staff sign-in codes, weekly reports to owners, receipts or invoices a shop emails its customer | European Union |
| Zoho Mail | ALYR's own mailboxes (hello@, akmal@, security@alyr.qa), which may hold a customer's message to us | Outside Qatar |
| The shop's own payment gateway | Payment links and their results | As the gateway provides |

The full register, with the legal basis we assumed for each row, is `docs/data-residency.md`.
No AI model receives customer data today.

## Documents to read

1. **Privacy policy**, published 28 Oct 2026: https://alyr.qa/privacy (Arabic:
   https://alyr.qa/ar/privacy). Drafted by the company without a lawyer.
2. **Customer agreement**, draft (between ALYR and a shop), especially section 9 "Your data and
   data protection": `docs/company/customer-agreement/agreement.md` on pull request #47, and
   its open questions in `notes.md` beside it.
3. **Data residency register**: `docs/data-residency.md`.
4. **Decision D-013** in `docs/decisions.md`: our reading of the law so far.

## The questions

**A. Privacy policy (https://alyr.qa/privacy)**

1. Is the policy enough for Law No. 13 of 2016 (PDPPL) as a public notice, for both groups it
   covers: ALYR's clients and their staff (ALYR as controller), and the shops' customers (ALYR
   as processor for the shop)? What is missing or wrong?
2. Is it right to describe ALYR as a **processor** for the shops' customers' data, and the shop
   as the controller? Is Meta the shop's processor under Meta's own terms, and does the
   policy need to say more about Meta?
3. Is listing the outside services with their regions (the table above) a sufficient basis
   for sending that data outside Qatar, or is consent, a contract clause or a notice to the
   regulator needed for each one?
4. Are our timings acceptable: answering a rights request within 30 days; a copy of records on
   request within 30 days of a shop leaving; deletion 60 days after it leaves; backups gone
   35 days after that; telling a shop of a breach "without delay"?
5. The policy is in English and Arabic. If they differ, which governs, and must the policy say
   so?

**B. Data across borders** (already in ALY-51)

6. Does the PDPPL require a private software company to host its small-business customers'
   data in Qatar? (Our production database is in Google Cloud's Doha region; the question is
   about the outside services above.)
7. If ALYR later sends message text to an AI model hosted outside Qatar, what is needed:
   consent wording, a privacy impact assessment, contract terms?
8. Are salary data and QID numbers treated differently (for a future payroll product)?
9. What must the customer agreement and the shop's own notice to its customers say about Meta
   as a processor?

**C. Payments and lending** (added 28 Oct 2026)

10. Does the Qatar Central Bank payment services regulation (Circular 23/2021) require a
    licence for software that only creates payment links on each shop's own gateway account
    and never touches funds? What would change the answer: showing payout reports,
    reconciling payouts to orders, taking a revenue share from the gateway?
11. Does QCB's data-handling rule cover storing payment references and order data outside
    Qatar, in addition to the PDPPL? (Merchant data is in Doha; this is about outside services
    such as email and message providers, and error trackers if we add one.)
12. Can ALYR share a shop's order history, which holds its customers' details, with a licensed
    lender to get the shop an advance offer? What consent is needed from the shop owner and
    from the shop's customers, and is aggregated data alone enough?

**D. Licensing**

13. Does selling through shops' WhatsApp chats and payment links need the MOCI e-commerce
    licence or registration, for ALYR, for the shops, or both?
14. The CR lists "retail sale via the internet" (479120), which ALYR does not do itself. Is
    that activity needed for what ALYR does, or should it change?

**E. Requests from public authorities**

15. Is our short policy (`docs/company/authority-requests.md`) enough? Who in Qatar can lawfully
    demand a private company's data, and when can or must ALYR challenge a request? We told
    Meta we have no process for challenging one yet.

## What we ask for

- A written answer to each numbered question, or a written "not required".
- For the privacy policy (questions 1 to 5): a marked-up copy, or the exact changes.
- A quote and a date before starting.

## Not in this brief

The customer agreement's full review (its own questions are in `notes.md` on PR #47), and
employment matters.
