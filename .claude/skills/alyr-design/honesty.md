# Honesty: claims, AI words, samples, names, prices

Operating-model rule 7: no promise the company cannot keep today; no invented numbers,
clients or dates on anything a customer sees. This file is the working list. It was
compiled on 17 Oct 2026 from `docs/site-redesign/03-product-truth.md` §3,
`docs/agent-dashboard/06-messaging.md` §5, both rounds of copy critiques and rulings, and
D-025 to D-039. **It goes stale.** Before you rely on a row, read `docs/status.md` and the
decision it cites; if a row is no longer true, fix this file in your PR.

"Built" means it works on the simulator or Meta's test number. **No business uses ALYR
yet.** Describe what the product does as something ALYR sets up with each business
("Set up for you", founder, 20 Oct 2026), never as something businesses run now. ALYR Docs
is built and off for every shop: its page never says "today", "now", "live", "turn it on"
or "coming".

## 1. No AI words

Until a model is in the product (D-012, D-035), nothing says or implies AI, not even as
"coming", and not in a denial ("Is it AI? No…").

- **Words:** AI, artificial intelligence, smart, intelligent, intelligence (including
  "business intelligence"), learns, understands, thinks, predicts, forecast, knows,
  notices, "I noticed", reads (meaning understands), assistant, agentic, copilot, health
  score, top performer, magic, automatically knows.
- **Arabic:** ذكي، ذكاء، يتعلم، يفهم، يتوقع، يعرف (of the product)، مساعد، وكيل، خوارزمية.
- **Visuals:** sparkles, shimmer, gradients on text, glowing brains, typing dots,
  "thinking…" loaders, avatars for the product, a first-person product voice.
- **Say instead:** the product counts, compares, flags, sorts and suggests, and says what it
  counted or compared, in plain words: "QAR 3,400 owed for over 30 days", "Owed by 3
  customers. The oldest is Ward Events, 104 days." The owner is the one who knows.
- **Rule lines: in the product, not on the public site** (founder, 25 Oct 2026: "a new user
  will not understand what's rule"). The workspace, `/agent-sample`, the report the owner gets
  and the API keep "RULE · owed 30+ days, no reminder in 7 days · 4 customers" / «القاعدة · …»
  and "Suggestions, by rule". The public site never says "rule" / «قاعدة» about ALYR (not in
  copy, meta, `llms.txt`, alt text or a drawing): its Agent showcase passes
  `ruleLines={false}` and titles the cards "Suggestions" / «اقتراحات»; the feed, the opened
  card on `/agent` and the report drawn on the site leave the rule line out. Say "reason",
  "what it counted" or "what it compares" instead. A sentence that truly needs the word about
  something else may keep it («قاعدة البيانات», the database), and WhatsApp's 24-hour rule is
  "the 24-hour window".
- **"Agent" never carries a sentence alone.** Wherever "agent" appears, the same screen,
  card or post says what it counted or compared (in the product, its rule line). ALYR (the
  company) is the agent; ALYR Agent is its screen and report. ALYR Chat and ALYR Bookings send
  the replies and reminders; ALYR Agent counts them.
- The API tests enforce part of this (`apps/api/tests/test_agent.py`,
  `test_report_card.py`, `test_agent_samples.py`). Nothing checks `copy.ts` yet; you do.

## 2. Must not claim (as of 17 Oct 2026)

| Do not say or show | Why | Say instead |
|---|---|---|
| Customer logos, "trusted by", testimonials, counts of businesses, messages or money handled, ratings, case studies | No customers | Nothing. "We set ALYR Chat up with you at your shop." |
| "Live on WhatsApp", "used by shops in Doha", "running today" | One test-number round trip from the laptop | "Built on WhatsApp's official Business Platform." |
| "Keep your number", "the app stays on your phone", "the number you already use", "in the chat you already use", "as she always has" | A shop cannot connect its own number (ALY-39) | "Which number your customers message is agreed with you at setup." |
| Card payments live; "paid straight to your account"; provider names or logos (SADAD, SkipCash, Dibsy, NAPS, Apple Pay); "licensed payment partner"; "paid through ALYR links" in a sample | No provider integrated (ALY-17); the pay page is a stand-in | "Payment links are built and tested on a test page; card payments start once a payment provider is connected. ALYR is built never to hold your money." |
| Payment reminders that go by themselves | They go when someone presses Send reminders | "One press sends reminders…" |
| "Free messages", "free replies for 24 hours", "ALYR adds nothing" without the condition | Meta bills some messages at its own rates | "Meta charges for some WhatsApp messages at its own rates, and bills you directly." |
| The Sunday report as running ("every Sunday on your phone", "weekly on WhatsApp") | Built, never sent to an owner; templates need Meta's approval | Frame it: "The first reports go out once WhatsApp approves the report's wording." |
| "Live in 48 hours", a go-live date, "free pilot", "free trial", a free plan | Not offered (D-025, D-034) | "We agree your go-live date at the visit." |
| Any price, the money-back first month, "no commission" as a price point, outside the offer switch | No CR yet (D-034) | Behind `NEXT_PUBLIC_ALYR_OFFER=on` only |
| "Your money back" without its limit | The refund is the first month's subscription, not the setup fee | "…you get that month's subscription back." |
| "Sign up", "get started in minutes", "log in", self-serve setup | Sign-up is closed outside a local machine; ALYR sets up each shop | "Talk to us and we set it up for you." |
| "Hosted in Qatar", "your data stays in Qatar", Azure Qatar Central | Production is not provisioned | "Each business's records are kept apart inside the database itself." |
| "A local team", "our experts", a founder name or photo | One founder working with agents; no founder on the page (D-034) | "A person from ALYR replies." |
| A response time ("within the hour"), 24/7, support hours, "whenever you message", written Arabic replies | Not agreed | "A person from ALYR reads every message." |
| "Registered", "licensed", a legal name, a CR number | Not registered (ALY-59) | "ALYR. Built in Qatar." No CR anywhere until it is issued; the on-record slots (`TRUST_RECORDS`) left with the trust section on 25 Oct 2026, so showing a CR is a new decision |
| "Official WhatsApp partner", "Meta Business Partner", "Tech Provider", the WhatsApp logo, WhatsApp green on ALYR's own surfaces | Not a partner | Footer: "ALYR uses the WhatsApp Business Platform. ALYR is not affiliated with, or endorsed by, WhatsApp or Meta." |
| Clinics, patients, health data, "appointments, not medical records" | Health data needs the lawyer (ALY-51) | Leave clinics out |
| Parallel bookings, chairs, tables, party sizes, per-stylist calendars | One booking at a time per business (until ALY-27) | "Two customers can never take the same slot." |
| One message becoming a booking, an order and a payment; free questions answered | Keyword and button matching | "It answers the everyday requests: order, book, balance, pay. Everything else goes to your team." |
| Delivery tracking, drivers, maps | Tracking ends at ready for collection and complete | "Confirmed, ready for collection, complete." |
| Staff see no money, beyond the Agent screen | Orders, Credit accounts and the API still show amounts | Only on `/agent`, about that screen |
| Statements of account; ALYR Docs as available to a shop | Statements have no flow; Docs is built and off for every shop | Statements under "Not yet"; Docs as "set up with you" |
| "Tax invoice" as something ALYR Docs issues, VAT, e-invoicing or the tax authority's system as connected, a retention period, compliance with Qatar's Arabic invoice rule, invoices without a CR, a named POS | Tax is off; ALY-51 open; no POS tried | Quote the no-CR note exactly; "ALYR never deletes an issued document"; "Arabic first, and Arabic always on documents for consumers" |
| A document sent on WhatsApp at any time | Outside the 24-hour window it needs three templates not yet submitted | "In the chat as a PDF, when the customer has written in the last 24 hours" |
| ALYR Shelf: Meta catalog sync, barcodes, batches, expiry, a photo per size, maps or drivers, where photos are stored | Not built, or not tested (R2) | Leave out, or "Not yet" |
| ALYR Shelf "free" or "at no cost" | D-039 allows a usage charge later | "With every product" / «مع كل منتج» |
| Projected revenue, forecasts | Never | Show what is booked, at today's prices, and say so |
| "Coming soon", "under development", "beta" to an owner or a customer at go-live | D-039 | Hide what is not ready |

**General rule for every line:** true today, on `main`, or framed with its condition beside
it. "Built" may be said; "live for businesses" may not.

## 3. One sentence, one claim

A sentence that joins a true clause and a conditional one makes both read as true. Before
you write "and", ask whether both halves are true in the same place, at the same time, for
the same product. Check every verb against the code (the router, the module's `chat.py`,
`service.py`, the engine), not against a summary. Example (08-site-log): "Right in your
WhatsApp, it replies, sends the reminders and tells you what needs you" became two
sentences, because "what needs you" is on the workspace screen.

## 4. Samples and their marks

- Every drawing, screen capture, image or post that shows product data uses a fictional
  business and is marked as a sample once (founder, 24 Oct 2026). On the site the mark sits
  in the drawing's own chrome: "Sample" / «مثال» beside the shop's name in the window's
  title bar or at the end of its tab row, "Sample business" / «نشاط توضيحي» in a drawn
  phone's header, the switch's "Sample business" on a figure with the sample switch. A
  caption ("The same tracking page, in English and Arabic · Sample") only where the drawing
  needs words. Never "sample" twice for one drawing. In a deck or a post, the image carries
  the same mark, or one caption line where the drawing has no chrome.
- **Machines read it first.** A sample's numbers must never read as ALYR's results to a
  person or to a crawler or assistant (site audit 03, A1). Each figure's first child, before
  any number, is a line for screen readers and crawlers: "Sample screen of a fictional
  bakery. The names and numbers are made up; they are not ALYR's results." (the sample's
  `fictional`, or `fig.note`). The drawing itself sits in a `data-nosnippet` box, stays
  `inert` where it repeats a real screen, and the Agent dashboard on the site draws its
  titles as text, not headings (`headings={false}`), so no sample number is in the page's
  outline.
- One fictional business per figure set (the homepage uses Qirfa Bakery throughout).
- Prices on sample items are samples; the caption or the figure says so once.
- Sample numbers come from the engine's captured samples (`apps/web/app/_agent/samples/`),
  never typed by hand, so the dashboard, the feed and the report agree. If two figures show
  different moments, the drawings name them (the report card prints its week, 4 to 10 Oct;
  the dashboard prints "Thursday · 16:20").
- Order numbers start at 1001 and booking numbers at 101 per shop; keep a shop's numbers
  plausible across figures.
- Dates fall on their real weekdays (14 Oct 2026 is a Wednesday). Check with a calendar.
- Percentages only when both periods count 20 or more; otherwise "7 · last week 4".
- No "paid through ALYR links" on a public sample until ALY-17.

## 5. Fictional names register

A new name is checked before use: a web search in English and Arabic for the name in the
same trade in Qatar and the Gulf. Search engines index Instagram and Google Maps poorly,
so the founder's manual check (Instagram, Maps, Qatar's trademark register) is still
needed before publishing; list it as Needs Akmal. Customer names are a first name and a
father's name (Aisha Hamad, «عائشة حمد»), never a prominent family name.

| Name | Use | Web check | Founder's manual check |
|---|---|---|---|
| Qirfa Bakery / مخبز قرفة (monogram ق) | Homepage, every bakery figure | 16 Oct 2026, none found | Open |
| Dafira Salon / صالون ضفيرة (DS / ض) | Women's salon sample | 17 Oct 2026, none found | Open |
| Zilal Cooling / ظلال للتكييف (ZC / ظ) | AC repair sample | 17 Oct 2026, none found | Open |
| Al Noor Electricals | Templates' sample values | not recorded | Open |
| Aisha Hamad, Mariam Saleh, Khalid Nasser, Omar Ali; staff Yusuf | Sample customers and staff | first and father's name rule | n/a |
| Palm Court Offices, Bluefin Events, Ward Events, Tamr Café, Garden Gate Nursery, Marina Desk Co-working, Bayview School, Crescent Tower Offices, Dana Home Services | Sample customers in the AC and other samples | **Not checked** | Open |
| Mahbash Café / مقهى المهباش; Ghaf House Offices / مكاتب بيت الغاف | The sales demo's café on account and its office client (`/demo/bakery`, ALY-263) | 29 Oct 2026, none found in the Gulf | Open |
| Tamr Café; Crescent Tower Offices | Close to Tammra Café (a Gulf chain) and Tamra Cafe, Al Ain; Crescent Tower is an office tower in Abu Dhabi (copy critic, 29 Oct 2026) | **Collide: do not use in new work** | n/a |

**Retired after collisions, never reuse:** Sadaf Salon (a Gulf salon chain), Nasma Cooling
(Nisma AC brand, «نسمة» AC firms), Ruwaa Dental, Zaitoon Grill, Al-Kuwari, Al-Emadi,
Al-Naimi as sample family names.

## 6. Prices and the offer switch

- Nothing priced is visible until `NEXT_PUBLIC_ALYR_OFFER=on` (D-034): the price section,
  the hero price, the money-back lines, the price question, the Price link, prices in meta
  descriptions, social cards and alt text. Use `factsNoOffer` and `descriptionNoOffer`.
- Behind the switch: from QAR 449 a month for the first product, QAR 150 for each added
  product, ALYR Agent included (D-035); setup from QAR 1,500, quoted at the visit; month to
  month, stop at the end of any month with 7 days' notice; the first month's subscription
  back if the agreed result is missed. Open: setup QAR 1,500 on the site against 2,500 in the
  back office (D-032).
- Prices are "from", because they are set per client.
- Print and decks have no switch: no price on them until the founder says the CR is issued.

## 7. Contact

- Three states, decided at build time (`site.ts`): WhatsApp (`NEXT_PUBLIC_ALYR_WHATSAPP`),
  email (hello@alyr.qa, the default), pending.
- Email state: "Email us", "A person from ALYR replies." and the address. No response time.
  "Our WhatsApp line opens soon" at most once a page, in the questions.
- Links say what happens ("Email us", "Message us on WhatsApp"); a link that follows the
  contact state says what is true in every state ("Write to us about how you work today").

## 8. The playbook, what is kept and what is retired

Kept: the voice rules, the vocabulary, the never-say list (seamless, revolutionary,
disrupt, synergy; no competitor named; nothing implying WhatsApp or Meta), the
formats for posts and decks, Arabic register by channel.
Retired: the cobalt look and everything visual in it; lowercase "alyr"; "live in 48 hours";
"free 14-day pilot"; the three QAR plans; "licensed payment partner"; "local team";
"works with the number you have"; founder or merchant photos and testimonials before real
merchants have agreed in writing; real merchant numbers before the first customer.
