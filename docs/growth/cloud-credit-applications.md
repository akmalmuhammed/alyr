# Cloud credit applications: Microsoft for Startups and Google for Startups

Linear ALY-55 · Growth lane · Checked 16 Oct 2026 against both programmes' official pages (links at the end). Programme terms change without notice; re-check the official page on the day you apply.

This file has three jobs: say which programme to apply to first and why, list exactly what each one asks for, and give answers ready to paste that show ALYR well and truthfully.

---

## 1. The short answer

| Order | Programme | What we get now | Why this order |
|---|---|---|---|
| **1** | **Microsoft for Startups** | **USD 1,000 in Azure credits the day the account is set up**, then up to USD 150,000 over time as we show real use | Our production target is Azure Qatar Central (D-013), so these credits pay for the exact servers we plan to run, in Qatar. No investor needed to start. |
| **2** | **Google for Startups Cloud Program, Start tier** | **Up to USD 2,000 in Google Cloud credits for one year**, USD 200 in training credits, Google Workspace Business Plus free for 12 months for a new sign-up | Fits our stage exactly (working product, not yet funded). Google also has a region in Doha (`me-central1`). Useful for a second environment, backups or experiments. |
| Later | Microsoft up to USD 150,000, or Google Scale tier up to USD 200,000 | Large credits | Microsoft unlocks more with "verified progress, service adoption, and sustained Azure usage", or faster with a referral code from an investor or accelerator in its Investor Network. Google Scale needs institutional or venture funding (a SAFE counts; angels, grants and friends-and-family do not). |

**Do not apply for Google's AI tier.** It requires an AI-first company, meaning AI in "your startup's foundational structure and strategy and not only as a productivity/bolt-on layer". ALYR's assistant is deliberate, rule-based and reliable on purpose. Claiming AI-first would be untrue and would likely get the application rejected or flagged.

### What blocks us today

| Item | Microsoft | Google | Who | Status |
|---|---|---|---|---|
| An email address at **@alyr.qa** | Strongly advised | **Required.** "Your company website domain must match your email domain and the email domain associated with your billing account." | Founder (DNS on Cloudflare) | Missing (ALY-60) |
| Public website on the same domain | Asked ("if available") | Required | Done | https://alyr.qa is live in English and Arabic |
| Registered company name and address | Asked on the full application: "Registered startup name (must match your legal documents)" | Not stated, but "founded within the last 24 months" is checked | Founder | Not registered (ALY-59) |
| A payment card | Required for Azure sign-up; not charged unless credits run out and you choose pay-as-you-go | Required for a Google Cloud billing account | Founder | Founder enters it; Claude never does |
| Phone and email verification | Both required | Email | Founder | |

**Recommendation.** Set up the @alyr.qa address now (section 4, step 1). Then apply to Microsoft without a referral code straight away: the USD 1,000 starter credit only needs the Azure account. Apply to Google once the @alyr.qa address and a billing account exist. Do the full Microsoft business form when the company is registered, so the legal name matches.

---

## 2. What each programme offers and requires (official wording)

### Microsoft for Startups

Source: Microsoft Learn, "What is Microsoft for Startups?" (updated 5 Aug 2026) and "Activate Azure Credits" (updated 29 May 2026).

**How it works now.** One entry point with benefits that grow. The old "Founders Hub" portal was replaced on 29 May 2026; new startups apply and activate through the Azure portal.
- Apply at https://startups.microsoft.com and choose **Get started**.
- Without an investor referral code: you go straight to Azure account creation and get **USD 1,000 in starter credits** immediately.
- With a 10-character referral code from an Investor Network partner: you fill in personal and business details, credits of USD 1,000 start at once, and the application is reviewed "within 3 business days" for expanded credits.
- "Unlock up to $150K in Startup credits over time as your startup demonstrates verified progress, service adoption, and sustained Azure usage."
- Credits must be activated within 90 days of accepting the programme agreement.

**Eligibility (all must be true).**
- Develop a software-based product or service owned by the company. **ALYR: yes.**
- Privately held and for-profit. **Yes.**
- Headquartered in a country where Azure services are available. **Yes, Qatar (Azure Qatar Central).**
- Not more than USD 350,000 in lifetime free Azure credits. **Yes, none so far.**
- Not raised Series C or later. **Yes.**
- Not an educational institution, government organisation, **consultancy, or agency**. **See the warning in section 6.**
- Not involved in cryptocurrency mining. **Yes.**

**What the full application asks for.** Contact email, phone and time zone (both verified). Registered startup name matching legal documents, primary industry, website, registered business address. Then the Azure account: country (cannot be changed later), name, billing address, card.

### Google for Startups Cloud Program

Source: cloud.google.com/startup/benefits and cloud.google.com/startup/faq (read 16 Oct 2026).

| | Start tier (ours) | Scale tier (later) |
|---|---|---|
| For | "Digital-native startups with a working MVP, a clear business model, and plans to seek venture funding soon" | "VC-funded startups ready to grow and scale" |
| Requirements | Technology startup planning to seek venture funding soon. Founded within the last 24 months. No Google Cloud credits yet beyond the free trial. "Demonstrate a well-defined product roadmap and a clear vision for market disruption." | Pre-Seed or Seed raised within 5 years, or Series A within 12 months. Founded within 5 years. Not more than USD 5,000 in Google Cloud credits so far. |
| Credits | Up to USD 2,000, valid one year | Up to USD 200,000: year 1 covers 100% up to USD 100,000; year 2 covers 20% up to another USD 100,000 |
| Also | USD 200 Google Skills credits; Google Workspace Business Plus free for 12 months for new sign-ups | USD 500 training, USD 12,000 Enhanced Support, a Startup Success Manager, Maps credits |

**Before applying.** "Have your 18-character Google Cloud billing account ID and ensure the business email in your application matches your startup's public website domain."

**Funding proof.** Google asks for links to public sources about equity investments. "Funding via private equity, government innovation grants, prize funding, crowdfunding, angel, and friends & family funding will not qualify a startup for Scale but will be evaluated for other program tiers."

**Not accepted.** Companies that have IPO'd or been acquired, educational institutions, government entities, nonprofits, personal blogs, **dev shops, consultancies, agencies**, crypto mining.

**Decision time.** "Within a few business days", or 10 days or more if reviewed by hand. If rejected, write to cloudstartupsupport@google.com.

**What credits cover.** Google Cloud services (Compute, Cloud Run, Cloud SQL, BigQuery, Gemini and others). Not Workspace, Maps or Ads (those come as separate benefits), and not third-party or Marketplace products.

---

## 3. How reviewers decide, and how ALYR answers each test

Neither programme publishes a scoring sheet. These are the tests their own pages describe, and the evidence we already have.

| What they check | Where it comes from | ALYR's evidence |
|---|---|---|
| A real software product the company owns | Microsoft eligibility; Google "working MVP" | Running end to end on WhatsApp's official Cloud API since 12 Oct 2026, on Meta's test number until the company is registered. Real phones ordered, paid and booked. Full rehearsal on 16 Oct: every message delivered and read. |
| Not an agency or consultancy | Both exclusion lists | One multi-tenant platform; each shop switches modules on. Setup is onboarding for our own software, not custom work (see section 6). |
| A clear business model | Google Start | Monthly subscription per WhatsApp number with team seats included (planned: QAR 490 and QAR 890 a month, D-017), plus a one-off setup fee. |
| A product roadmap and a market to change | Google Start | Product 1 (ALYR Chat) now, Product 2 (payroll and staff documents) next, one platform underneath. Built for Qatar first, Arabic and English from day one. |
| Plans to seek venture funding soon | Google Start | The founder decides this honestly before applying. If the answer is "yes, after the first paying customers", say exactly that. |
| Domain and identity match | Google, automated | Website, email and billing account all on alyr.qa. |
| Verified progress and real usage | Microsoft, for credits beyond the start | Production on Azure Qatar Central, with costs charged against the credits every month. |

---

## 4. Step by step

### Step 1 (both): an email address at alyr.qa

Free route, about 15 minutes, all on accounts the founder already has.
1. In Cloudflare, open **alyr.qa → Email → Email Routing** and turn it on. Cloudflare adds the mail records itself.
2. Create the address **akmal@alyr.qa** (or **founder@alyr.qa**) forwarding to the founder's personal inbox, and confirm the forwarding link Cloudflare sends.
3. Create a Microsoft account and a Google account **with that address** (both let you sign up with an existing email). These become the accounts that hold the credits.
4. Put the same address on the website's contact section (closes ALY-60).

After Google accepts us, the free 12 months of Google Workspace Business Plus can replace forwarding with a real mailbox. The rule: the domain must not have had a paid Workspace plan within 31 days before applying.

### Step 2: Microsoft for Startups (now)

1. Go to https://startups.microsoft.com → **Get started now**, and sign in with the @alyr.qa Microsoft account.
2. No referral code yet: choose **Continue without a code** → **Sign up**.
3. Profile: country **Qatar** (cannot be changed later), name, email, phone; prove you are human.
4. Billing address, then the card. Spending protection is on by default, so nothing is charged unless the credits run out and you choose to pay.
5. The dashboard shows "You've unlocked $1,000 in Azure credits". Credits can take up to 24 hours to appear.
6. **Straight away:** in Cost Management, set a budget of USD 50 a month with alerts at 50% and 90%.
7. When the company is registered: complete the business profile in the Azure portal with the exact legal name and address.
8. When we join an accelerator or take investment: ask the partner whether they are in the Microsoft for Startups Investor Network and for a referral code. Microsoft does not publish the list.

### Step 3: Google for Startups, Start tier (when Step 1 is done)

1. Sign in to Google Cloud with the @alyr.qa Google account and create a billing account (the free trial is fine). Copy the **18-character billing account ID** from Billing → Manage billing account.
2. Open https://cloud.google.com/startup/benefits → **Apply now**.
3. Use the answers in section 5. Website: https://alyr.qa. Funding: "not yet funded; planning to raise after first paying customers" (only if true).
4. Expect an answer within a few business days. If it is unclear or rejected, write to cloudstartupsupport@google.com from the @alyr.qa address, briefly, with the website and a one-line description.
5. After approval, claim Google Workspace Business Plus for 12 months and move akmal@alyr.qa to a real mailbox.

---

## 5. Answers ready to paste

Use the same wording everywhere: reviewers compare the website, the form and the founder's profile. Every claim below is true as of 16 Oct 2026. Text in **[brackets]** is for the founder to fill in or confirm.

### Company name and one line

> **ALYR** · WhatsApp-native operating software for small businesses in Qatar and the GCC.

### Industry

> Software: business management (SaaS) for small and medium businesses. Sub-sectors: retail, services, food and beverage.

### Short description (about 50 words)

> ALYR turns a shop's WhatsApp number into its front desk. Customers order, book, pay and track their orders inside the chat they already use, and the team handles everything from one shared workspace that shows who is responsible for each customer. Built in Qatar, in Arabic and English, on WhatsApp's official API.

### Full description (about 150 words)

> Small businesses in Qatar already sell on WhatsApp, but on staff phones: orders get lost, nobody knows who promised what, and when an employee leaves, the customers often go with them. ALYR moves the business onto one official WhatsApp number and gives it the tools behind the chat. Customers tap a link to order from the shop's catalogue, book a time, pay by link, and follow their order on a tracking page, all from inside WhatsApp. Staff answer from a shared inbox where every conversation, order and booking has one person responsible, and the owner sees replies, sales and missed customers per person. Shops switch on only the modules they need, on one multi-tenant platform. ALYR Chat runs end to end on WhatsApp's official Cloud API, with all 32 message templates approved by Meta in English and Arabic. The next product, payroll and staff documents, plugs into the same workspace.

### The problem

> A typical small business in Doha runs its customer service on the personal WhatsApp accounts of two or three staff. The owner cannot see conversations, who handled an order, or which customers were left without an answer. Orders are written down by hand, payment is chased one by one, and bookings clash. Big platforms are built for enterprises and in English; delivery apps take a large commission and own the customer relationship.

### The solution

> One official WhatsApp number per business, with the operations behind it: an order page, bookings with real free times, payment links, a customer tracking page, credit accounts with polite reminders, and a team inbox. Every item has a named owner and an uneditable activity record, so the owner can see who is doing what. Customers never install anything.

### Product stage and traction (update before sending)

> Working product, running end to end on WhatsApp's official Cloud API since 12 October 2026 (on Meta's test number until our own business number is verified). Real phones have placed and paid orders, made bookings and received every update. Meta has approved all 32 of our message templates in English and Arabic. The platform has [190] automated tests running on every change, tenant isolation enforced in the database, and a public website at alyr.qa. [Pilot status: e.g. "Two Doha businesses have agreed to a pilot starting in November." Only write this when it is true.]

### Business model

> Monthly subscription per WhatsApp number with team seats included, so every staff member has their own login and their own record [planned launch prices QAR 490 and QAR 890 a month], plus a one-off setup fee for connecting the number and loading the catalogue. WhatsApp message fees are passed through at cost. Later revenue comes from payment processing through partner gateways and from additional products on the same platform.

### Market and why now

> Qatar and the wider GCC, where WhatsApp is the main way customers reach local businesses. Two changes make this the right time. Meta's Cloud API lets any business use WhatsApp officially, with approved templates and buttons. And Qatar's digital-economy push is moving small businesses off paper and personal phones. We start with the shops that already sell in the chat. [Add one sourced market figure only if you have the source, e.g. the number of registered SMEs in Qatar from a government publication.]

### Why us (team)

> Founded by [Akmal Muhammed], who builds the product end to end with AI-assisted engineering under strict, documented engineering rules: every change reviewed and tested, decisions recorded, customer data isolated per business. [Add relevant background: years in Qatar, industry experience, previous roles.] Being in Doha means we design for how local shops actually work: Arabic and English, cash and credit accounts, staff from many countries.

### Technology, and how we will use the credits

**Microsoft (paste in the business profile or any "how will you use Azure" field):**

> ALYR runs as a Python API and background worker with PostgreSQL, behind a Next.js web app. Production will run in Azure Qatar Central so that merchant and customer data stays in Qatar: Azure Database for PostgreSQL (with row-level security for tenant isolation), Azure Container Apps for the API and worker, Azure Key Vault for secrets, and Azure Monitor for alerts. Credits will cover our production environment through our first paying customers.

**Google (paste in any "how will you use Google Cloud" field):**

> We will use the Doha region (me-central1) for a staging environment and off-site backups of our PostgreSQL database, and Cloud Run for preview environments. Merchant data stays in Qatar.

### Roadmap (next 12 months, in phases, not dates)

> 1. ALYR Chat with pilot businesses in Doha: orders, bookings, payments, tracking, team inbox.
> 2. Connecting each business's own WhatsApp number through Meta's Embedded Signup, and a Qatar payment gateway.
> 3. Bookable staff for salons and clinics, broadcasts with customer opt-in, routing conversations by language.
> 4. Product 2: payroll and staff documents, in the same workspace.

### Funding

> Bootstrapped. [We plan to raise a pre-seed round after our first paying customers.] (Google's Start tier asks for plans to seek venture funding soon. Write this only if it is the plan.)

---

## 6. Avoid these rejections

1. **Looking like an agency.** Both programmes exclude consultancies, agencies and dev shops. Our homepage describes ALYR as a company that will offer services over time. On every form, describe ALYR as a **software platform with modules**, and call setup "onboarding". Do not list "web development", "consulting" or "digital transformation services" as what we sell. The `/chat` product page should be the link reviewers see first.
2. **A Gmail address.** Google rejects a domain mismatch automatically. Use @alyr.qa everywhere: application, billing account, website contact.
3. **A legal name that does not match.** Microsoft's full form wants the registered name. Until registration, use only the no-code starter path; do not invent a company name or address.
4. **Claiming what is not true.** No invented pilots, revenue, users, investors or market numbers. Reviewers check the website, and later investors read the same answers.
5. **Prior credits.** Google Start requires no Google Cloud credits beyond the free trial. Do not redeem any other Google promo first.
6. **Letting credits lapse.** Microsoft: activate within 90 days. Google Start: valid one year. Start when we are ready to move production, not months before.
7. **Data rules.** Credits do not change our hard rules. Production with merchant data runs in Qatar (Azure Qatar Central, or Google Doha for backups). No AI or analytics service outside Qatar receives customer data unless `docs/data-residency.md` lists it with a legal basis.

---

## 7. Getting the large credits

| Route | What it unlocks | What to do |
|---|---|---|
| Real Azure usage over time | Up to USD 150,000 from Microsoft | Run production on Azure Qatar Central and keep the business profile current. Microsoft may assign a point of contact. |
| An accelerator or investor in Microsoft's Investor Network | Higher Microsoft credits earlier | Qatar Science & Technology Park (QSTP) announced a partnership making its incubated startups eligible for Microsoft for Startups. Ask QSTP, and any accelerator we join, whether they hold Investor Network referral codes. |
| Institutional or venture funding (a SAFE counts) | Google Scale tier, up to USD 200,000 | Apply for Scale within 12 months of a Series A, or within 5 years of a pre-seed or seed round, with public links to the investment. |

---

## 8. After approval

- Write down the credit amount, the expiry date and the account that holds them in `docs/stack.md`.
- Set budget alerts on day one (Microsoft: Cost Management; Google: Billing → Budgets).
- Move production in the order D-013 sets: database first (dump and restore), then the API and worker, then the web app.
- Tell the go-live lane, which owns hosting (ALY-63).

---

## Sources (read 16 Oct 2026)

- Microsoft Learn, What is Microsoft for Startups?: https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview
- Microsoft Learn, Activate Azure Credits: https://learn.microsoft.com/en-us/startups/build/azure-getting-started/activate
- Google Cloud, Startups program eligibility and benefits: https://cloud.google.com/startup/benefits
- Google Cloud, FAQs about the Google for Startups Cloud Program: https://cloud.google.com/startup/faq
- QSTP and Microsoft partnership for Qatar-based startups: https://www.gccbusinessnews.com/qstp-join-forces-with-microsoft-to-support-qatar-based-startups/
- Google Cloud Doha region launch (Qatar News Agency): https://www.qna.org.qa/en/News-Area/News/2023-06/05/google-cloud-opens-new-cloud-region-in-doha
