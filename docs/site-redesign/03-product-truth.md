# Product truth for the homepage redesign

Written 16 Oct 2026 by the Site and brand lane, on branch `aly-56-homepage-2026` (worktree `D:\alyr-home`, at `main` commit `cd8cd30`). Linear ALY-56.

This is the ground truth the new homepage is designed against: what ALYR has built, what state each piece is really in, what a page may and may not say about it, and how the current site is put together. Sources, in order of trust: the code in this repository, `docs/status.md` (last updated 16 Oct), `docs/decisions.md` (D-023 to D-030), and the live site at https://alyr.qa as captured on 16 Oct (`baseline/`).

Where the code and the docs disagree, this page says so and names the file. Paths are from the repository root.

---

## 0. The ten things to know first

1. **No business uses ALYR yet.** No customer, no pilot, no interview logged, no company registered, no agreed price. Every number, name and testimonial on the page must be absent or clearly fictional.
2. **One live round trip has happened, on Meta's test number, on 12 Oct.** A real phone got the welcome menu, an order link, placed order #1001 for QAR 179, paid it on the stand-in payment page, got both confirmations, and made and confirmed a booking. It only works while the founder's laptop, the API and the tunnel are running.
3. **Everything else is built and tested on the simulator and locally,** not seen on a real phone: the workspace, the team inbox and accountability, tracking, credit-account reminders, the weekly report.
4. **There is no payment gateway.** The pay page is a labelled stand-in: "Test payment page. No money moves."
5. **A shop cannot connect its own WhatsApp number yet** (Embedded Signup, ALY-39). "Keep your number" and "the app stays on your phone" are not true today.
6. **There is no AI in the product.** The chat answers by matching words ("order", "book", "balance", "pay", Arabic equivalents) and buttons. Anything else goes to a person.
7. **ALYR sells two products today, not one** (`apps/api/src/alyr/catalog.py`): **ALYR Chat** (team inbox, bookings, orders, payment links) and **Credit accounts** (the ledger). **Payroll and staff documents** is listed as coming. The public site folds credit accounts into ALYR Chat.
8. **The real product already looks like ALYR** (Carbon, Volt, Command Fold, light and dark). Its screens and messages are specific, bilingual and depictable: section 2 lists them.
9. **The site is static files on Cloudflare,** built by `scripts/build-site.sh` from a normal `next build`. Only `/`, `/ar`, `/chat` and `/ar/chat` are published. `/chat` shares the header, footer, call to action, tokens and many classes with the homepage (section 4).
10. **The visitor has no way to reach ALYR.** No WhatsApp number or email is set, so every call to action ends at "Our WhatsApp line is being set up. Please check back shortly." (ALY-60). The redesign must work in all three contact states.

---

## 1. Feature inventory: what an owner gets today

**State key**

| State | Meaning |
|---|---|
| **Live (test number)** | Done end to end from a real phone through Meta's test number (+1 555 638 3300), on 12 Oct, with the laptop serving the API and the customer pages through the tunnel. Not running for any business. |
| **Built (simulator)** | Built, tested in the test suite (207 tests) and on the simulator or the local web app. Not seen on a real phone. |
| **API only** | Works through the API or the chat; no workspace screen. |
| **Not built** | Do not depict as existing. |

The workspace (`/app`) and sign-in answer 404 from outside the laptop; sign-in codes are only shown on a local machine until the Resend key is set (D-029). So **every workspace screen below is "Built (simulator)" at best**, even where the chat side has gone live.

### 1.1 Orders

| What the owner gets | Where it appears | State |
|---|---|---|
| A customer writes "order" (or taps *Place an order*) and gets a personal link to the shop's order page | Chat: `apps/api/src/alyr/modules/orders/chat.py` | **Live (test number)** |
| An order page made for a phone: products by category, + and − steppers, a bottom bar with the total, *Pay QAR …* or *Put it on my account* | `apps/web/app/(product)/s/[slug]/page.tsx` | **Live (test number)**, order #1001 on 12 Oct; restyled to the ALYR design since (ALY-73) |
| The order lands in the workspace Orders screen with items, total, payment state and who looks after it; staff move it New → Confirmed → Ready → Done | `apps/web/app/(product)/_workspace/Screens.tsx` (Orders) | **Built (simulator)** |
| Every status change messages the customer | `modules/orders/service.py` `set_status` | Inside the 24-hour window: built. Outside it: needs approved templates (submitted 12 Oct; approval state not rechecked) |
| Put on account (only for customers the shop gave a credit limit; refused over the limit) | `modules/orders/service.py` `create_order` | **Built (simulator)** |
| Adding or editing products and prices | none | **Not built** (no screen; the demo catalogue is seeded). The setup checklist's "Add your menu or price list" links to the Orders screen, which cannot do it (contradiction, see 1.12) |

### 1.2 Bookings

| What the owner gets | Where it appears | State |
|---|---|---|
| A customer writes "book" (or "appointment", "reserve", "حجز", "موعد"…) and gets a booking link | Chat: `modules/bookings/chat.py` | **Live (test number)**, one booking made and confirmed 12 Oct |
| A booking page: 1 Choose a service (minutes and price), 2 Choose a day (a strip of 14 days), 3 Choose a time (30-minute steps from opening hours, at least 30 minutes ahead), optional note, *Confirm booking* | `apps/web/app/(product)/b/[slug]/page.tsx`, `modules/bookings/service.py` | **Live (test number)** |
| A time is checked again and locked when confirmed, so two customers cannot take the same slot | `modules/bookings/service.py` (`_place`, exclusion constraint) | Built |
| Confirmation in the chat, and a reminder **2 hours before** the visit | `modules/bookings/service.py` (`REMIND_BEFORE`) | Confirmation: live. Reminder: **Built (simulator)**; outside the window it needs the approved `booking_reminder` template |
| "my booking" shows the next booking with a *Cancel booking* button | `modules/bookings/chat.py` | **Built (simulator)** |
| Workspace Bookings screen: today and the next seven days, who is responsible, *Came* / *No-show* / *Cancel* | `Screens.tsx` (Bookings) | **Built (simulator)** |
| **Limits** | | One customer at a time per shop (no staff, chairs or tables; ALY-27 is next). Services and opening hours only through the API. Staff cannot move a booking or add a walk-in from the screen. No deposits. |

### 1.3 Payments

| What the owner gets | Where it appears | State |
|---|---|---|
| A payment link for an order or for an account balance, and a receipt message when paid | `modules/ledger/service.py` (`create_payment_request`, `complete_payment`), `apps/web/app/(product)/pay/[slug]/page.tsx` | **Live (test number) on the stand-in page only.** The page says: "Test payment page. No money moves. A Qatar payment gateway replaces this before launch." Method shown: "Debit card (NAPS) · test" |
| A real gateway (the shop's own SADAD, SkipCash or Dibsy account) | Connections screen shows "Payment provider · Not available yet" (`catalog.py`, `connected=""`) | **Not built** (ALY-17; provider applications ALY-5 not filed) |
| ALYR never holds the money | `CLAUDE.md` hard rule 3 | A design rule the code follows (it stores references and statuses only). True, but nothing moves today |

### 1.4 Order tracking

| What the owner gets | Where it appears | State |
|---|---|---|
| Every order message inside the 24-hour window carries "Track your order: …" | `modules/orders/service.py` (`_track_line`) | **Built (simulator)** (ALY-73, after the 12 Oct live test). Templates cannot carry the link, so a notice sent after the window arrives without it |
| A tracking page: the order number, a status chip, four steps with times, who is looking after it (first name only), the items, the total, *Pay now* if unpaid, "This page updates by itself" | `apps/web/app/(product)/t/[slug]/page.tsx`, `routes/track.py` | **Built (simulator)** |
| Delivery, drivers, maps, live location | none | **Not built.** The steps end at "Ready for collection" and "Complete" |

### 1.5 Credit accounts (a separate product in the catalogue)

| What the owner gets | Where it appears | State |
|---|---|---|
| Staff record a credit sale or a payment by sending a message from the shop's staff phone: "Ahmed 450 credit", "Ahmed paid 200" | `modules/ledger/chat.py` (`_staff`) | **Built (simulator)** |
| The customer is told about every entry, with the new balance | `modules/ledger/service.py` (`entry_notice`), template `entry_recorded` | **Built (simulator)** |
| A customer asks "balance" / "كم حسابي؟" and gets the balance and latest entries, with *Pay now*; "pay 500" pays part | `modules/ledger/chat.py` | **Built (simulator)** |
| The welcome menu (*Place an order*, *My balance*, *Pay now*) | `modules/ledger/chat.py` (`MENU`) | **Live (test number)**: this is the menu that came back on 12 Oct |
| Reminders in three tones by the age of the debt (gentle under 60 days, firm from 60, final from 90), with *Pay now* and *I'll pay within a week* buttons | `modules/ledger/service.py` (`reminder_tier`, `send_reminders`) | **Built (simulator)**. Outside the window the templates carry no buttons |
| "I'll pay within a week" pauses reminders for 7 days; nobody is reminded twice within 3 days; anyone who said stop is skipped | `modules/ledger/service.py` (`PROMISE_DAYS`, `REMINDER_COOLDOWN_DAYS`) | Built |
| Credit ledger screen: outstanding total, an ageing bar (0–30, 31–60, 61–90, over 90 days), collected through payment links, *Send reminders* (to accounts 30+ days old), each customer's entries | `Screens.tsx` (Credit ledger) | **Built (simulator)** |

### 1.6 Team inbox and accountability

| What the owner gets | Where it appears | State |
|---|---|---|
| Every chat on the shop's number in one inbox: Open / Closed, Everyone / Mine / Unassigned, unread counts | `Screens.tsx` (Inbox), `modules/inbox/service.py` | **Built (simulator)** |
| A person replies from the workspace; the assistant goes quiet for that customer until the chat is closed or handed back | `modules/inbox/service.py` (`assistant_paused`) | **Built (simulator)** |
| Staff notes (team only, never sent), saved quick replies | `Screens.tsx`, migration `0009` | **Built (simulator)** |
| One person responsible for every conversation, order, booking and credit account; handing over is recorded | `apps/api/src/alyr/core/team.py`, D-028 | **Built (simulator)** |
| An activity record nobody can edit, shown between the messages ("Yusuf took this conversation", "Customer placed order #1042, QAR 385") | `Screens.tsx` (`did`), `core/team.py` | **Built (simulator)** |
| Closing asks how it ended: Sold, Booked, Answered, Lost; Lost asks why: Price, Not available, Stopped replying, Went elsewhere, Other | `Screens.tsx` | **Built (simulator)** |
| Team report: waiting for an answer (over 10 minutes), typical first reply, conversations closed, sales looked after, per person; an alert when customers wait with nobody on them | `apps/web/app/(product)/_workspace/Team.tsx`, `core/team.py` (`WAITING_MINUTES = 10`) | **Built (simulator)** |
| Signed replies: the sender's first name under each staff reply ("— Yusuf"); off by default | `core/team.py`, `Team.tsx` | **Built (simulator)** |
| The 24-hour rule shown to staff: "Free replies allowed for 21 more hours", or a warning that only an approved template can be sent | `Screens.tsx` | **Built (simulator)** |
| **Limits** | | No live updates (the screens poll), no warning when a colleague is typing (ALY-28), no sending a template from the inbox when the window is closed |

### 1.7 Weekly result report

| What the owner gets | Where it appears | State |
|---|---|---|
| Every Sunday at 9:00 shop time, the numbers for the week before (Sunday to Saturday), one section per product switched on: Credit accounts, Orders, Bookings, Team inbox; each first line compared with the week before | `apps/api/src/alyr/modules/report.py`, `modules/*/report.py`, D-030 | **API only.** No workspace screen. Never sent to a real owner |
| Inside the window the whole report arrives as one message; outside it a one-line template, and REPORT (or «تقرير») brings the rest | `modules/report.py`, template `weekly_report` | The `weekly_report` template was added after the 12 Oct submission and must be submitted and approved |
| By email to the shop's owners, English then Arabic | `modules/report.py` (`email`) | Needs the founder's Resend key (D-029); not set |

### 1.8 Workspace

| What the owner gets | Where it appears | State |
|---|---|---|
| One workspace at `/app` with navigation built from the products the shop has: Home, then Inbox, Bookings, Orders, Credit accounts, then Products, Connections, Team | `apps/web/app/(product)/app/[[...section]]/page.tsx`, `catalog.py`, D-027 | **Built (simulator)**, local only |
| Home: "Good afternoon, Fatima. Here is Al Noor Electricals today.", the Doha clock, number tiles (Unanswered chats, Bookings today, Orders today, Paid by link today, Owed to you), a setup checklist ("Finish setting up ALYR Chat", "3 of 5 steps done"), and an *Ask ALYR* chat tile | same | **Built (simulator)** |
| Products: switch a product on or off (switching off hides screens and keeps every record) | same | **Built (simulator)** |
| Connections: WhatsApp number (connected or not), Payment provider (not available yet) | same | **Built (simulator)** |
| Search and jump (Ctrl K), a live indicator that reads "WhatsApp live" or "Simulator", phone layout with a bottom tab bar | same, `_workspace/shell.css` | **Built (simulator)** |
| Light and dark, following the device | `_workspace/shell.css`, `_customer/customer.css` | Built |
| Sign-up | none | **Not built.** ALYR staff create the shop and its owner in the back office `/ops` |
| Back office for ALYR staff: every shop, help requests, create a shop | `apps/web/app/(product)/ops/page.tsx`, `routes/admin.py` | Built; ALYR staff only |

### 1.9 Arabic and English

| What it means today | Where | State |
|---|---|---|
| A customer who writes in Arabic is answered in Arabic from then on (detected from the message, kept on the contact) | `core/normalise.py` (`has_arabic`), `modules/ledger/chat.py` | Built |
| Every chat message and template exists in both languages | `modules/*/chat.py`, `modules/*/service.py`, `core/templates.py` | Built. **Arabic not reviewed by a native speaker** (ALY-66). One Arabic template was refused by Meta on 13 Oct and reworded |
| Customer pages open in the customer's chat language (tracking) or offer a language switch; the workspace has a language switch | `(product)/_customer/Frame.tsx`, `/t/`, `/app` | Built |
| Eastern Arabic digits typed by a customer are understood ("أحمد ٤٥٠ دين") | `core/normalise.py` (`western_digits`) | Built |
| **What the real product shows in Arabic** | | Money is always written "QAR 1,850" with Western digits in chat messages (`fmt_qar`), and "1,850 ر.ق" on customer pages. Booking times in Arabic chat messages are "14/10 16:30". The public site's Arabic demo shows "١٬٨٥٠ ر.ق" and "٤:٣٠ م" instead (contradiction, 1.12) |

### 1.10 Behind the scenes (true, and depictable as principles)

| Fact | Where |
|---|---|
| Official WhatsApp Cloud API only; every webhook's signature is checked | `channels/meta.py` (`verify_signature`) |
| Consent: a customer who writes first agrees to service messages, not marketing. STOP (and Arabic stop words) stops all notices; START turns them back on | `core/consent.py` |
| The 24-hour window: inside it, ordinary messages; after it, only approved templates (17 in `core/templates.py`, each in English and Arabic) | `core/outbound.py`, `core/templates.py` |
| Every message is saved before it is sent and retried; failures go to a dead-letter list (no screen) | `core/outbound.py`, `core/jobs.py` |
| Delivered and read reports from WhatsApp are recorded | `channels/meta.py` |
| Each business is separated inside the database by forced row-level security | `migrations/0001_core.sql`, `db.py`, `tests/test_tenant_isolation.py` |

### 1.11 Not product: what the homepage offers as services

D-026 (accepted 12 Oct) put six services on the homepage: websites and online stores, customer systems, automation and integrations, dashboards and reporting, AI assistants, setup and training. **Nothing in the repository shows any of these delivered for anyone,** there is no AI in the code, the company is not registered so no licensed activities exist yet, and D-026 itself leaves open who delivers a service. The redesign can keep services only as the founder decided; it must not show portfolio work, results or delivery times for them.

### 1.12 Contradictions found

| # | What | Where | Effect on the homepage |
|---|---|---|---|
| C1 | The homepage figure shows one free-text message ("Table for 4 tonight at 8? And the mixed grill ready when we arrive.") becoming a table booking, an order and a payment "to your own account". The product matches keywords, books and orders on two separate pages, has no party size or tables, takes one customer at a time per shop, and has no gateway | `apps/web/app/_site/copy.ts` `teaser.figure`, `ChatFigure.tsx` | Replace. "Illustrative" does not cover a capability that does not exist |
| C2 | The /chat demo "Book" tab answers "Can someone come tomorrow?" with a *Choose a time* button. Real: "tomorrow" is not a booking word, and the reply is a plain link: "Pick a service and a time that suits you: …" | `copy.ts` `product.demos[0]`, `flow.stories[0]`; `modules/bookings/chat.py` | Do not repeat on the homepage; fix on /chat later |
| C3 | The /chat "Track" tab says "ready for pickup" and "Collected". Real: "ready for collection", "Complete"; tracking steps "Order received / Confirmed by the shop / Ready for collection / Complete" | `copy.ts` `product.demos[3]`; `/t/` page | Use the real words |
| C4 | The /chat "Pay" tab puts the pay link in the confirmation. Real: the pay link is in "Order #1042 received" and the receipt is "Received QAR 385 for order #1042. Thank you." | `copy.ts` `product.demos[2]`; `modules/orders/service.py`, `modules/ledger/service.py` | Use the real sequence |
| C5 | /chat facts and pillars say "Keep your number… The app stays on your phone", "Paid straight to you", "on the number you already use", "A local team" | `copy.ts` `product.facts`, `product.why.pillars` | None of these may move to the homepage (section 3) |
| C6 | The site treats credit accounts as part of ALYR Chat ("Collect" tab, teaser points). The catalogue makes **Credit accounts** its own product; ALYR Chat is inbox, bookings, orders, payment links | `copy.ts` `teaser.points`, `product.inside`; `catalog.py` `PRODUCTS` | A company homepage can show two products and one coming, which is both truer and stronger |
| C7 | "Tue 14 Oct" in the /chat demo and flow (English and Arabic). 14 Oct 2026 is a Wednesday | `copy.ts` | Any sample date on the new page must be a real weekday. Templates use "Tue 13 Oct", which is right |
| C8 | The site's Arabic samples use Eastern Arabic digits for money and times; the product writes "QAR 1,850" and "14/10 16:30" in Arabic chat | `copy.ts` (ar); `core/normalise.py` `fmt_qar`, `modules/bookings/service.py` `_when_text` | Depict real Arabic messages as the product writes them, or label as drawn |
| C9 | The welcome menu comes from the credit-accounts module. A shop with ALYR Chat but not Credit accounts gets "Thanks for your message. We will reply shortly." to "hello", and the menu's *My balance* / *Pay now* only make sense for credit customers | `modules/router.py`, `modules/ledger/chat.py` | Do not show the menu as ALYR Chat's greeting for a restaurant or salon. Product lane issue |
| C10 | The setup checklist sends "Add the services customers can book", "Set your opening hours" and "Add your menu or price list" to screens that cannot edit any of them | `catalog.py` `Step(screen=…)`; `Screens.tsx` | Product lane issue; do not depict self-serve setup |
| C11 | `docs/status.md` says 16 templates (32 submitted). The catalogue has 17: `weekly_report` was added on 16 Oct | `core/templates.py` | The weekly report cannot reach an owner outside the window until it is submitted and approved |
| C12 | `docs/brand.md` says the product screens still use the earlier maroon styling. They no longer do: `globals.css`, `_workspace/shell.css` and `_customer/customer.css` are on ALYR tokens. Leftovers: `/login` shows "Alyr" in the old plain style, and the `/whatsapp` demo header says "Alyr · Demo 1 · the credit ledger in a chat" | `docs/brand.md`; `(product)/login/page.tsx`; `_workspace/Screens.tsx` | brand.md needs updating (this lane) |
| C13 | `robots.ts` disallows `/whatsapp`, `/login`, `/pay/`, `/s/` but not `/b/`, `/t/`, `/app`, `/ops`. Low risk: none is published on alyr.qa and the product layout sets `noindex` | `apps/web/app/robots.ts` | Tidy when the homepage ships |
| C14 | The workspace *Ask ALYR* tile promises "A person replies, usually within the hour" | `app/[[...section]]/page.tsx` | Not a promise the company has agreed; do not repeat it publicly |
| C15 | The live site is the 12 Oct version. Merged and unpublished: the teaser's feature chips and "See how it works" link on the homepage, and the how-it-works figure, the "Everything it does today" list and the credit-accounts demo tab on /chat (ALY-71) | live `baseline/` vs `copy.ts` | The baseline screenshots show the live page, not the code |
| C16 | The opening "Who we work with" rows promise things no product does: "stock you can trust" (no stock), "invoices sent before the van leaves" (no invoices), "a customer list that survives a change of receptionist" (no customers screen) | `copy.ts` `who.rows` | Read as services; keep only if the founder means them as services |
| C17 | The /chat note "We connect it to your number when we set you up" | `copy.ts` `product.inside.note` | Not possible today (C5) |

---

## 2. Real product details a designer can depict

Everything here is in the code today. The fictional demo shop is **Al Noor Electricals** (النور للكهربائيات, slug `al-noor`), an electrical wholesaler on Salwa Road; owner **Fatima Al-Noor**, agent **Yusuf Rahman**; 25 invented trade customers such as Ahmed Al-Kuwari, Bilal Contracting, Lusail Interiors; products such as "Cable 2.5 mm, 100 m roll" (QAR 225) and "Breaker 16 A single pole" (QAR 18); services "Electrician site visit" (60 min, QAR 150), "Lighting consultation" (30 min, free), "Generator service" (120 min, QAR 450); hours Saturday to Thursday 8–12 and 4–9, Friday 4–9 (`apps/api/src/alyr/seed.py`).

The public site currently uses two other fictional businesses (Zaitoon Grill on the homepage, Dana Home Services on /chat). **Using the demo shop, or one fictional business consistently, means the homepage can show real screens from the running demo, labelled as a sample, instead of drawings.**

### 2.1 Names as the product uses them

| Thing | English | Arabic | File |
|---|---|---|---|
| Products | ALYR Chat · Credit accounts · Payroll and staff documents (Coming) | ALYR Chat · الحسابات الآجلة · الرواتب ووثائق الموظفين | `catalog.py` |
| Product summaries | "Your WhatsApp number as your front desk: team inbox, bookings, orders and payment links." · "Customer accounts, statements and polite reminders with a payment link." · "Salary files for the bank, and reminders before visas and licences expire." | in the same file | `catalog.py` |
| Modules | Team inbox · Bookings · Orders · Payment links · Credit accounts | صندوق الفريق · الحجوزات · الطلبات · روابط الدفع · الحسابات الآجلة | `catalog.py` |
| Workspace navigation | Home · Inbox · Bookings · Orders · Credit accounts · Products · Connections · Team | الرئيسية · المحادثات · الحجوزات · الطلبات · الحسابات الآجلة · المنتجات · الاتصالات · الفريق | `catalog.py` |
| Home tiles | Unanswered chats · Bookings today · Orders today · Paid by link today · Owed to you | محادثات بانتظار الرد · حجوزات اليوم · طلبات اليوم · مدفوع اليوم عبر الروابط · مستحق لك | `catalog.py` |
| Setup steps | Connect your WhatsApp number · Add the services customers can book · Set your opening hours · Add your menu or price list · Connect your payment provider | in the same file | `catalog.py` |
| Connections | WhatsApp number ("The number your customers message. ALYR answers on it through Meta's official platform.") · Payment provider ("Your own account with a licensed Qatari payment provider. Money goes straight to you." — shown as *Not available yet*) | | `catalog.py` |
| Customer page headers | the shop's monogram with a Volt corner, the shop name, and the page: Order · Booking · Payment · Order tracking; footer "Powered by ALYR" | طلب · حجز · دفع · تتبّع الطلب; "مدعوم من ALYR" | `(product)/_customer/Frame.tsx` |

### 2.2 The chat, word for word

Inside the 24-hour window. `{link}` is a personal link; `{shop}` the shop's name. Source files under `apps/api/src/alyr/`.

| Moment | English | Arabic | File |
|---|---|---|---|
| Greeting (any other message, when Credit accounts is on) | "Welcome to Al Noor Electricals. How can we help?" with buttons *Place an order* · *My balance* · *Pay now* | "أهلاً بك في النور للكهربائيات. كيف نقدر نساعدك؟" · *اطلب الآن* · *رصيدي* · *ادفع الآن* | `modules/ledger/chat.py` |
| No module answers | "Thanks for your message. We will reply shortly." | "شكراً لرسالتك، سنرد عليك قريباً." | `modules/router.py` |
| Order link | "Here is our order page. Pick what you need: {link}" | "تفضل، اختر طلبك من هنا: {link}" | `modules/orders/chat.py` |
| Order placed (pay by link) | "Order #1042 received." / "2 x Cable 2.5 mm, 100 m roll  QAR 450" / "Total: QAR 450" / "Pay here: {link}" / "Track your order: {link}" | "تم استلام الطلب رقم 1042." … "الإجمالي: QAR 450" / "للدفع: {link}" / "تتبّع طلبك: {link}" | `modules/orders/service.py` |
| Order placed (on account) | … "Put on your account. Your balance is now QAR 2,300." | "تم تسجيله على حسابك. رصيدك الآن QAR 2,300." | same |
| Status changes | "Order #1042 is confirmed." · "Order #1042 is ready for collection." · "Order #1042 is complete. Thank you." · "Order #1042 has been cancelled." (each but the last followed by "Track your order: {link}") | "تم تأكيد الطلب رقم 1042." · "الطلب رقم 1042 جاهز للاستلام." · "تم إنجاز الطلب رقم 1042. شكراً لك." | same, `_STATUS_TEXT` |
| Order paid | "Received QAR 450 for order #1042. Thank you." | "تم استلام QAR 450 للطلب رقم 1042. شكراً لك." | `modules/ledger/service.py` |
| Booking link | "Pick a service and a time that suits you: {link}" | "اختر الخدمة والوقت المناسب من هنا: {link}" | `modules/bookings/chat.py` |
| Booking confirmed | "Booking 214 confirmed at Al Noor Electricals: Electrician site visit, Wed 14 Oct, 4:30 PM. To cancel, send "my booking"." | "تم تأكيد حجزك رقم 214 لدى النور للكهربائيات: زيارة كهربائي للموقع، 14/10 16:30. للإلغاء أرسل «حجزي»." | `modules/bookings/service.py` |
| "my booking" | "Booking 214: Electrician site visit, Wed 14 Oct, 4:30 PM." with *Cancel booking* | "حجزك رقم 214: …" with *إلغاء الحجز* | `modules/bookings/chat.py` |
| Reminder, 2 hours before | "Reminder: booking 214 at Al Noor Electricals, Wed 14 Oct, 4:30 PM." | "تذكير: حجزك رقم 214 لدى النور للكهربائيات، 14/10 16:30." | `modules/bookings/service.py` |
| Credit sale recorded (to the customer) | "Al Noor Electricals: we recorded a credit purchase of QAR 450. Your balance is now QAR 2,300." | "النور للكهربائيات: تم تسجيل شراء آجل بمبلغ QAR 450. رصيدك الآن QAR 2,300." | `modules/ledger/service.py` `entry_notice` |
| …and to the staff member who typed "Ahmed 450 credit" | "Recorded: Ahmed Al-Kuwari, credit sale of QAR 450. Balance is now QAR 2,300. The customer has been told." (plus "Warning: this is over their credit limit of …" when it is) | English only | `modules/ledger/chat.py` |
| Balance | "Your balance is QAR 1,850." / "Latest entries:" / "09 Oct  Purchase  QAR 450" with *Pay now* | "رصيدك الحالي: QAR 1,850" / "آخر الحركات:" | `modules/ledger/chat.py` |
| Pay | "To pay QAR 1,850, open this link: {link}" / "To pay part of it, send for example "pay 500"." | "لدفع QAR 1,850 افتح الرابط: {link}" | same |
| Reminder, gentle (under 60 days) | "A friendly reminder from Al Noor Electricals: QAR 1,850 is due. Your oldest unpaid purchase was 41 days ago. Pay here: {link}" with *Pay now* · *I'll pay within a week* | "تذكير ودي من النور للكهربائيات: عليك مبلغ QAR 1,850. أقدم فاتورة غير مدفوعة منذ 41 يوماً. للدفع: {link}" · *ادفع الآن* · *سأدفع خلال أسبوع* | `modules/ledger/service.py` |
| Reminder, firm (60+) and final (90+) | "Reminder from …: QAR 1,850 is now overdue." · "Final notice from …: QAR 2,500 has been overdue for more than 90 days. Please pay or contact us today." | "تذكير من …: مبلغ … متأخر السداد." · "إشعار أخير من …" | same |
| Promise | "Thank you. We have noted that you will pay by 23 Oct. No reminders will be sent until then." | "شكراً لك. سجلنا أنك ستدفع قبل 23/10. لن نرسل تذكيرات حتى ذلك التاريخ." | `modules/ledger/chat.py` |
| Account paid | "Received QAR 500. Your balance is now QAR 1,350. Thank you." | "تم استلام QAR 500. رصيدك الآن QAR 1,350. شكراً لك." | `modules/ledger/service.py` |
| STOP | "You will not receive reminders or notices from Al Noor Electricals any more. You can still message us here. Send START to turn them back on." | "لن تصلك تذكيرات أو إشعارات من … بعد الآن. …" | `core/consent.py` |
| A signed staff reply (when the shop turns signing on) | the staff member's own words, a blank line, then "— Yusuf" | | `core/team.py` |
| REPORT from the owner's phone | the whole weekly report (2.6) | «تقرير» | `modules/report.py` |

### 2.3 After the window: the 17 approved-wording templates

All in `apps/api/src/alyr/core/templates.py`, English and Arabic, category utility. Examples:

- "A friendly reminder from Al Noor Electricals: your account has QAR 1,850 due, and the oldest unpaid purchase was 41 days ago. You can pay here: {link} . Thank you."
- "Order 1001 received: 1 x Breaker 16 A, 1 x Cable 1.5 mm. The total is QAR 179. You can pay here: {link} . Thank you."
- "Booking 101 is confirmed at Al Noor Electricals: Lighting consultation, Tue 13 Oct, 8:30 AM. To cancel, send us a message."
- "Your ALYR weekly report for Al Noor Electricals, 11 to 17 Oct: QAR 4,300 collected; 38 orders worth QAR 5,640; 41 visits, 3 no-shows. Send REPORT to read the whole report here."

The full list: three payment reminders, entry recorded, payment received (order, account), order received (pay, account), order confirmed, ready, done, cancelled, booking confirmed, cancelled, moved, reminder, weekly report.

### 2.4 Statuses and steps

| Item | Statuses, as staff see them | As the customer sees them |
|---|---|---|
| Order | New → Confirmed → Ready → Done, or Cancelled; buttons *Confirm*, *Mark ready*, *Mark done* | Received · Confirmed · Ready for collection · Complete · Cancelled |
| Order payment | Not paid · Paid · On account | Not paid yet · Paid · On your account |
| Tracking steps | | Order received → Confirmed by the shop → Ready for collection → Complete, each with a time ("Wed 4:30 pm") or "Waiting" |
| Booking | Booked · Came · No-show · Cancelled | Booking 214 confirmed |
| Conversation | Open · Closed; closed as Sold · Booked · Answered · Lost (Price · Not available · Stopped replying · Went elsewhere · Other) | never shown |
| Credit account | Promised by 23 Oct · Over credit limit · Said stop · Settled; age pills 0–30 / 31–60 / 61–90 / over 90 days | |

Order numbers start at 1001 and booking numbers at 101, per shop.

### 2.5 The screens, as they are

**Customer pages** (phone first, one column, light and dark, the shop is the brand and ALYR signs off quietly):

- **Order** `/s/`: eyebrow "Order from your chat", title "What would you like?", "Ordering as **Ahmed Al-Kuwari**" beside a WhatsApp mark, category chips, rows with a + button that becomes a − 2 + stepper, a bottom bar "3 items · QAR 385", *Pay QAR 385*, *Put it on my account*. After: "Order #1042 received", "You can go back to WhatsApp. We will message you as your order moves along.", *Track this order*.
- **Booking** `/b/`: "Book from your chat", "Book a visit", "Booking as …", numbered steps 1 Choose a service ("60 min · QAR 150"), 2 Choose a day (Today, Thu 15, Fri 16…), 3 Choose a time (a grid of 12-hour times), "Anything we should know? (optional)", *Confirm booking*. After: "Booking 214 confirmed", "You can go back to WhatsApp. We sent the details there and will remind you before the visit."
- **Pay** `/pay/`: the stand-in warning first, then "Pay Al Noor Electricals", the amount large with "QAR", Customer / For / Method rows, *Pay QAR 385*. After: "Paid QAR 385", "Thank you. You can go back to WhatsApp; your receipt is there."
- **Track** `/t/`: eyebrow "Your order", "Order #1042", status chip, a vertical four-step track with ticks and times, "**Yusuf** at Al Noor Electricals is looking after your order.", "What you ordered", total, payment pill and *Pay now*, "This page updates by itself. We also message you on WhatsApp at every step."

**Workspace** `/app` (a quiet canvas with a raised sheet; Volt only on the current page notch, the main action and live state):

- Sidebar: Command Fold mark and shop name over "ALYR", *Search or jump to* with `Ctrl K`, navigation with an unread count on Inbox, "Your products" group, "Add a product", "Account" group, the signed-in person with role and a language switch.
- Top bar: "Al Noor Electricals / Inbox", "Doha 16:20", a dot with "WhatsApp live" or "Simulator".
- Inbox: list and thread side by side; the thread mixes customer bubbles, assistant and staff replies (labelled with who sent them), dashed staff notes and small activity lines with times; *Handled by* select, *Hand back to assistant*, *Close* → "How did it end?".
- Team: "How the team is doing", Today / 7 days / 30 days, four tiles, a row per person with open and waiting, first-reply time, an outcome bar and a sales meter, and the signed-replies switch with a sample "Your order is ready for collection. — Yusuf".
- Credit ledger: the outstanding total, the four-colour ageing bar with its legend, "Collected through payment links", *Send reminders* with "To customers whose oldest unpaid purchase is 30+ days old", the customer table, the selected customer's entries.

To get real screenshots: run the demo locally (`scripts/demo.sh up`), or a second web server on port 3101 as in `docs/status.md`, and capture with `baseline/shoot.mjs`. Label every capture as a sample with a fictional business.

### 2.6 The weekly report, as it reads

The format is real (`modules/report.py`, `modules/*/report.py`); **the numbers below are invented for illustration** and must be labelled so if used.

```
ALYR weekly report: Al Noor Electricals
11 to 17 Oct

Credit accounts
Collected: QAR 4,300 from 6 customers (last week QAR 2,150)
Paid through ALYR payment links: QAR 1,850
New credit given: QAR 3,200
Payment reminders ALYR sent for you: 5
Promised to pay: 2 customers
Still owed to you today: QAR 18,450 from 14 customers
Overdue more than 60 days: QAR 6,100 from 3 customers

Orders
Orders received: 38, worth QAR 5,640 (last week 31)
Paid: QAR 2,180 for 12 orders
Put on account: QAR 3,460
Customers who ordered again: 9
Most ordered: Breaker 16 A single pole (64)
Cancelled: 1

Bookings
Customers who came: 41 (last week 37)
No-shows: 3
New bookings made: 29
Reminders ALYR sent for you: 44
Booked for next week: 18
Busiest day: Sunday

Team inbox
Customers who wrote: 57 (last week 49)
New customers: 8
Replies by your team: 112
Messages ALYR sent for you: 203
```

Rules worth showing: sections appear only for products the shop has; a quiet product gets one line ("No orders came in this week."); when money is more than 60 days late and no reminders went out, the credit section ends with "Next step: send reminders from Credit accounts."; the week is Sunday to Saturday; it arrives at 9:00 on Sunday. The Arabic heading is "تقرير ALYR الأسبوعي: …".

---

## 3. What the homepage must not claim today

General rule (operating model rule 7, `docs/brand.md`): describe what the product does only as **early access that ALYR sets up with each business**, never as something businesses are running now. Anything built on the simulator may be described as built; nothing may be described as live for businesses.

| Do not say or show | Why | Say instead (English; Arabic must be written natively in `copy.ts`) |
|---|---|---|
| Customer logos, "trusted by", testimonials, counts of businesses, messages or money handled, ratings | No customers | Nothing. Where a reassurance is needed: "ALYR Chat is in early access. We set it up with each business ourselves." |
| "Live on WhatsApp", "used by shops in Doha", "running today" | Only a test-number round trip from the founder's laptop | "Built on WhatsApp's official Business Platform." |
| "Keep your number", "the WhatsApp app stays on your phone", "on the number you already use" | Connecting a shop's own number (Embedded Signup, coexistence) is not built and needs Meta's approval (ALY-39). No business number has been connected | "Runs on WhatsApp's official Business Platform. Which number your customers message is agreed with you at setup; we go through Meta's requirements with you first." (The founder should confirm even this before it is published.) |
| "Paid straight to your account", "your own gateway", SADAD / SkipCash / Dibsy / NAPS / Apple Pay names or logos, "licensed payment partner" | No provider signed or integrated; the pay page is a stand-in | "Payment links in the chat, built and tested on a test page. Real payments go through your own account with a Qatari payment provider; that connection is not live yet. ALYR is built never to hold your money." |
| "Free messages", "free replies for 24 hours" | Meta may bill service replies beyond about 1,000 a month per number from 1 Oct 2026; unconfirmed (D-028 note). The /chat page and the inbox screen still say "free" | "Replies for 24 hours after a customer writes, approved wording after that." |
| "Live in 48 hours", "free pilot", "free trial", any price | Not decided (D-025, D-017) | Nothing, until the founder decides |
| Smart understanding, "AI replies", "it understands what your customers mean", a chatbot | No AI in the product; keyword matching and buttons | "It answers the everyday requests by itself: order, book, balance, pay. Everything else goes straight to your team." |
| One message booking a table and ordering food together; party sizes; several staff, chairs or tables at the same time | One customer at a time per shop; booking and ordering are separate pages | "Customers pick a free time from your opening hours. Two customers can never take the same slot." |
| Delivery tracking, drivers, maps, live location | Steps end at ready for collection and complete | "Order updates without asking: confirmed, ready for collection, complete." |
| "Sign up", "get started in minutes", "log in", self-serve setup | No sign-up; ALYR staff create the shop in `/ops`; the workspace is not hosted | "Talk to us and we set it up for you." |
| "Reminders reach your customers any time" | After 24 hours only approved templates can be sent; approval state not confirmed | "Inside WhatsApp's rules: ordinary replies for 24 hours after a customer writes, approved wording after that." |
| "Your data stays in Qatar", "hosted in Qatar", Azure Qatar Central | Production is not provisioned (ALY-10); the demo database is in Frankfurt | "Each business's records are kept apart inside the database itself." |
| Certifications, "bank-grade security", uptime, "24/7 support", response times ("within the hour") | None exist or are agreed | Nothing |
| "Official WhatsApp partner", "Meta Business Partner", the WhatsApp logo | Not a partner; a drawn chat with no logo is used on purpose | Keep the footer line: "ALYR works with WhatsApp Business. It is not affiliated with WhatsApp or Meta." |
| "A local team", "our team of experts" | One founder working with agents | "A person from ALYR replies, in Arabic or English." |
| "Registered", "licensed", a legal company name, a trade licence number | Not registered (D-018 proposed, ALY-59) | "ALYR. Built in Qatar." (current footer) |
| Case studies, before-and-after results, portfolio for the services | None delivered | Name the services only as the founder decided (D-026); no results |
| Weekly report "every Sunday on your phone" as a running fact | Built, API only, template not approved, never sent to an owner | "Every Sunday, a short report of your week: money collected, orders, visits and chats." inside an early-access context |
| A working "Message us on WhatsApp" button or an email address | Neither exists yet (ALY-60) | The page must render all three states from `site.ts`: WhatsApp set, email only, or the current "Our WhatsApp line is being set up. Please check back shortly." |
| Native or reviewed Arabic | Not reviewed (ALY-66) | Nothing; the review is a launch blocker |

---

## 4. Technical map of the public site

### 4.1 Routes and root layouts

There is no `app/layout.tsx`. `apps/web/app/` has **three root layouts**, one per route group; moving between them is a full page load, and their CSS never mixes.

| Route group | Root layout | Routes | CSS loaded |
|---|---|---|---|
| `(site)` | `app/(site)/layout.tsx` → `SiteDocument locale="en"` (`<html lang="en" dir="ltr">`) | `/` (`(site)/page.tsx` → `HomePage`), `/chat` (`(site)/chat/page.tsx` → `ProductPage`) | `_site/site.css` only |
| `(site-ar)` | `app/(site-ar)/layout.tsx` → `SiteDocument locale="ar"` (`lang="ar" dir="rtl"`) | `/ar`, `/ar/chat` | `_site/site.css` only |
| `(product)` | `app/(product)/layout.tsx` (own fonts, `noindex`) | `/app/[[...section]]`, `/ops`, `/login`, `/whatsapp`, `/s/[slug]`, `/b/[slug]`, `/pay/[slug]`, `/t/[slug]` | `globals.css`, plus `_workspace/shell.css` or `_customer/customer.css` |

App-level files: `icon.svg`, `opengraph-image.tsx` (generated at build), `robots.ts`, `sitemap.ts` (from `PATHS`). `next.config.ts` sets `distDir` from `ALYR_DIST_DIR` and rewrites `/api` and `/sim` to FastAPI; there is no `output: "export"`.

### 4.2 The `_site` components

| File | Role | Used by |
|---|---|---|
| `document.tsx` | Fonts through `next/font/google` (Instrument Sans, IBM Plex Sans Arabic 400/500/600, IBM Plex Mono 400/500, self-hosted at build), `siteMetadata(locale, page)` (title, description, canonical, hreflang en/ar/x-default, Open Graph, Twitter), `siteViewport` (theme colour `#f6f7f3` for light and dark), `SiteDocument` (sets `lang`, `dir`, and an inline script that adds `al-js` to `<html>` before first paint) | both layouts, both pages |
| `site.ts` | `SITE_URL`, `CONTACT_EMAIL`, `WHATSAPP_NUMBER`, `WORKSPACE_URL` from `NEXT_PUBLIC_*` env at build time; `PATHS` (`home`, `chat`) and `PageKey` | Shell, document, sitemap, robots |
| `Shell.tsx` | Skip link, sticky header (logo, nav, language link, *Talk to us*, a `<details>` menu below 53rem), `<main id="main">`, the closing call to action `section#contact` in three states, footer; `contactHref()`; mounts `SiteMotion` | **both pages** |
| `SiteMotion.tsx` | One client effect: `data-scrolled` on the header, `is-in` on `[data-reveal]` when seen, and word-by-word lighting of **the first** `[data-statement]` on the page | **both pages** |
| `HomePage.tsx` | Sections in order: `.hero` (eyebrow, two-line display title, body, *See what we do* → `#services`, *Meet ALYR Chat* → `/chat`, the board figure, three facts) · `.why` statement · `#services` grid of six · `#product` Carbon teaser with `ChatFigure` · `#approach` four steps · `#who` four rows · `.built` four principles; Shell adds `#contact` | `/`, `/ar` |
| `ChatFigure.tsx` | The drawn chat and the three records it becomes | homepage only |
| `ProductPage.tsx` | `/chat`: Carbon head with `ProductDemo` and three facts · `#how` with `FlowDiagram` · `#inside` three groups · `#why` statement and four pillars · `#who` rows with tags · `.company` path | `/chat`, `/ar/chat` |
| `ProductDemo.tsx`, `FlowDiagram.tsx` | Client components; play only while on screen, pause control, keyboard tabs, still with reduced motion | `/chat` only |
| `brand.tsx` | `Logo`, `Symbol`, `Icon` with 15 icons: arrow-right, arrow-up-right, check, security, users, data, document, menu, calendar, workflow, cloud, dashboard, ai, settings. `IconName` types every icon field in `copy.ts` | all |

**Anchors other pages depend on.** The header and footer on `/chat` link to `/#services` and `/#approach` (`Shell.tsx`, `links`). Renaming or removing `id="services"` or `id="approach"` on the homepage breaks the `/chat` navigation; change the links in `Shell.tsx` and the `nav` keys in `copy.ts` together. `#contact` is the call to action on every page and the fallback of `contactHref()`.

### 4.3 How `copy.ts` is built

- One `Copy` type; two objects, `en` and `ar`, both typed `Copy`, exported as `copy: Record<Locale, Copy>`. TypeScript therefore refuses a key that exists in one language and not the other. It does not check that arrays have the same length, except tuples (`hero.title: [string, string]`).
- Exported types used by components: `Locale`, `ChatLine`, `PanelRow`, `Demo`, `Figure`, `FlowStep`, `FlowStory`. Icon fields are `IconName`.
- Top-level keys and who reads them:

| Key | Read by |
|---|---|
| `meta.home`, `meta.chat` | `siteMetadata` |
| `skip`, `nav`, `cta.whatsapp`, `cta.email`, `cta.write`, `cta.pending`, `footer` | `Shell` on **both** pages |
| `cta.title`, `cta.body` | passed to `Shell` by the homepage (`/chat` passes `product.cta`) |
| `hero`, `why`, `services`, `teaser`, `approach`, `who`, `built` | homepage only |
| `product.*` | `/chat` only |

- Hard-coded words that are not in `copy.ts`: the logo's accessible name "ALYR" in `Shell.tsx`, "© 2026", and the Open Graph image text "Go digital. / Without the IT team." and its `alt` in `apps/web/app/opengraph-image.tsx` (English only). **If the headline changes, change the social image too.**

### 4.4 `site.css`: tokens and classes

**Tokens on `:root`** (from the design system's `tokens.css`):

| Group | Tokens |
|---|---|
| Brand | `--carbon #15171a` · `--volt #b7f34a` · `--volt-hover #a5e238` · `--volt-pressed #8fc42d` · `--concrete #a7adb5` · `--graphite #2a2e33` |
| Light surfaces | `--canvas #f6f7f3` · `--surface #ffffff` · `--surface-subtle #eef0ec` · `--text #15171a` · `--text-muted #5f666d` · `--line #d8dcd7` · `--line-strong #8a918b` (darker than the design system, on purpose) · `--focus #6a9320` |
| Carbon surfaces | `--dark-canvas #0e1012` · `--dark-surface #191c1f` · `--dark-subtle #202428` · `--dark-line #32373c` · `--dark-text #f3f5f0` |
| Type | `--sans` (Instrument Sans) · `--mono` (IBM Plex Mono) · `--arabic` (IBM Plex Sans Arabic) |
| Motion | `--ease cubic-bezier(.16,1,.3,1)` · `--fast 160ms` · `--medium 280ms` · `--slow 480ms`; `@property --sweep` for the diagonal reveal |
| Layout | `--gutter clamp(1.25rem, 4vw, 3rem)` · `--wide 80rem` · `--header 4.5rem` (3.75rem below 30rem) |

There is no dark theme on the public site. The product screens have their own scoped tokens (`.sh` in `_workspace/shell.css`, `.cx` in `_customer/customer.css`: `--canvas/--bg`, `--sheet/--card`, `--raise`, `--hair`, `--hair-2`, `--ink`, `--ink-2`, `--ink-3`, `--volt-ink`, `--volt-wash`, `--lift`, `--float`, `--spring`) and follow the device's dark mode. A homepage drawing of a product screen should copy those values into `site.css`, not import the product CSS (other lane, and it brings dark mode with it).

Breakpoints: `30rem` (480 px), `53rem` (848 px), `62rem` (992 px), `68rem` (1088 px, the how-it-works figure). Header nav and language link hide below 53rem; the header *Talk to us* button hides below 30rem.

**Shared with `/chat`: change only with `/chat` checked in both languages**

| Area | Classes |
|---|---|
| Base and type | `.wrap` · `.eyebrow` · `.eyebrow-dark` · `.signal` · `.display` · `.display-sm` · `.h1` · `.lead` · `.statement` · `.sec` (and `.sec + .sec` rule, `.sec h3`) · `h4` · `.ico` · `.ico-flip` · `.skip` |
| Controls | `.btn` · `.btn-volt` · `.btn-sm` · `.link` |
| Header, CTA, footer (Shell) | `.top` · `.top-in` · `.top-logo` · `.logo` · `.top-nav` (and `[aria-current]`) · `.top-end` · `.top-lang` · `.top-menu` · `.top-menu-list` · `.cta` · `.cta-in` · `.cta-mark` · `.cta-actions` · `.cta-write` · `.cta-pending` · `.foot` · `.foot-in` · `.foot-line` · `.foot-nav` · `.foot-rights` |
| Section layouts reused by /chat | `.approach` · `.approach-in` · `.approach-say` · `.steps` · `.steps-n` · `.who` · `.who-in` · `.who-head` · `.who-rows` · `.who-other` · `.tags` · `.built-head` (used by /chat's `#inside`) |
| Carbon band | `.product` · `.product-in` (and its dot grid) · `.product h3` · `.product :focus-visible` |
| The drawn WhatsApp chat | `.wa` and every `.wa-*` class, **including `.wa-mini`** (the how-it-works figure uses `.wa.wa-mini.fx-phone`) |
| Demo, panel and flow | `.demo*` · `.panel*` · `.phone` · `.row` · `.row-lead/-main/-trail/-signal/-quiet/-done` · `.fx*` · `.how*` · `.inside*` · `.product-head` · `.product-facts` · `.product-page` · `.company*` |
| Motion hooks | `.al-js` · `[data-reveal]` / `.is-in` · `[data-statement]` / `[data-w]` / `[data-on]` · `[data-header]` / `[data-scrolled]`; keyframes `rise`, `fade`, `pop`, `draw`, `demo-fill`, `fx-run`, `fx-fall` |

**Homepage only: free to replace**

`.hero` (and its grid `::before`) · `.hero-in` · `.hero-title` · `.hero-copy` · `.hero-body` · `.hero-actions` · `.hero-eyebrow` · `.display-line` (the diagonal title reveal and `sweep-in`) · `.facts` · `.facts-n` · `.flow` · `.board` · `.board-head` · `.tick` and `.tick-a`–`d` · `.flow-via` · `.flow-line` (and keyframe `grow`) · `.flow-mark` · `.flow-symbol` · `.flow-rows` · `.flow-ico` · `.flow-what` · `.flow-status` · `.is-done` · `.why` · `.why-in` · `.services` · `.services-grid` · `.built` (section) · `.built-grid` · `.built-ico` · `.teaser` · `.teaser-copy` · `.teaser-points` · `.who-plain` · `.product .flow` · `.approach-say .h1`.

Note: `pop` is used by the homepage eyebrow signal and the homepage flow mark only, and `.hero-actions` is used in the homepage teaser as well as the hero; neither is on `/chat`. The sweep-in diagonal reveal is the brand's one signature gesture (`docs/brand.md`); replacing the hero should keep it or an agreed successor.

### 4.5 Publishing path

1. `scripts/build-site.sh`: deletes `apps/web/.next` and `out-site`, runs `pnpm build` with `NEXT_PUBLIC_ALYR_WORKSPACE_URL=""`, then copies by name from `.next/server/app`: `index.html`, `ar.html`, `chat.html`, `ar/chat.html`, `_not-found.html` → `404.html`, `robots.txt`, `sitemap.xml`, `icon.svg`, `opengraph-image`, plus `.next/static` → `out-site/_next/static`. It writes `_headers` (image type, immutable caching for `/_next/static/*`, HSTS, nosniff, referrer policy, `X-Frame-Options: DENY`). It refuses to finish if the HTML contains `127.0.0.1`, `/sim/` or `/api/ledger`.
2. `apps/web/wrangler.jsonc`: Worker `alyr-site`, `main: ./site-worker.js` (HTTP → HTTPS, every other host → `alyr.qa` while `REDIRECT` is `"on"`, then the static files), assets from `./out-site` with `auto-trailing-slash` and a 404 page; routes `alyr.qa`, `www.alyr.qa`, `alyr.online/*`, `www.alyr.online`.
3. `npx wrangler deploy` from `apps/web`, on the founder's laptop, with the founder's yes each time. Nothing deploys automatically.

### 4.6 Constraints for the rewrite

- **Prerendered static only.** The homepage must build to plain HTML: no `cookies()`, `headers()`, `searchParams`, server actions, route handlers or API calls. Client components are fine.
- **A new page needs three changes:** its route in both groups, its key in `PATHS` (`site.ts`, which feeds the sitemap, hreflang and language links), and a copy line in `scripts/build-site.sh`. Otherwise it is built and silently not published.
- **No `public/` folder is published** (there is none, and the script does not copy one). Images must be imported from code so they land in `_next/static/media`, and rendered with a plain `<img>` or `next/image` with `unoptimized`: the image optimiser needs a server that the static host does not have. Prefer CSS and SVG drawings, as now.
- **Contact states are baked at build time** from `NEXT_PUBLIC_ALYR_WHATSAPP` and `NEXT_PUBLIC_ALYR_CONTACT_EMAIL`. Design all three: WhatsApp, email only, neither (today).
- **No new runtime dependencies without a written reason** (`CLAUDE.md` rule 9). Today: `next 16.3.8`, `react` and `react-dom 19.2.8`, nothing else; no CSS framework, no animation library. Fonts only through `next/font`. No third-party requests, analytics or embeds: they would also touch the data-residency rule.
- **Every word in `copy.ts`, in both languages,** including `aria-label`s, alt text and figure labels. Components hold no text.
- **Logical CSS properties** (`margin-inline`, `padding-inline`, `inset-inline-start`, `border-inline-start`, `text-align: start`) and `[dir="rtl"]` overrides for anything a logical property cannot mirror: transforms, `clip-path`, gradients and masks, `transform-origin`, arrows (`.ico-flip`). Arabic: no letter-spacing, looser line height, `--arabic` font; mono labels switch to the Arabic font in Arabic.
- **Reduced motion and no-JS.** Every animation sits inside `@media (prefers-reduced-motion: no-preference)`; client components check `matchMedia`; anything hidden until revealed is hidden only under `.al-js`, so the page is complete without scripts. `SiteMotion` lights only the first `[data-statement]` on a page: a second one would stay dim.
- **Brand rules** (`docs/brand.md`): never redraw or recolour the logo; horizontal logo at least 140 px, else the symbol; Volt only for the main action, the current state, confirmed progress or one signal; light first, Carbon for command moments; hover movement 1–2 px; motion plays once, except the two explanatory figures on `/chat`.
- **Checking on the laptop:** never port 3100 or `D:\alyr whatsapp`. In this worktree, `ALYR_DIST_DIR=.next-preview pnpm exec next dev -p 3101` from `apps/web` (discard the `tsconfig.json` change Next makes), then `node docs/site-redesign/baseline/shoot.mjs http://localhost:3101 1440 900 out.png --full`, and the same at 390×844 and for `/ar`, `/chat`, `/ar/chat`. Then `pnpm lint`, `pnpm build` and `scripts/build-site.sh`.

---

## 5. Design audit of the current homepage

Based on the live page at 1440×900 and 390×844 in both languages (`baseline/`) and the code.

### Keep

- **A brand that is its own.** Carbon and Volt, Instrument Sans at display size, mono eyebrows, the Command Fold, the faint construction grid and corner ticks in the hero. It does not look like a template.
- **The signature motion.** The title resolving along the logo's diagonal, then the Volt signal; plays once; nothing moves with reduced motion; complete without scripts.
- **Arabic as a first-class page.** Its own font, line height and no tracking; the layout mirrors, arrows flip, the hero grid's light moves to the other side. The Arabic phone page holds up.
- **The Carbon product band.** The one dark moment in the middle of the page is the right place for the product.
- **The drawn WhatsApp chat.** Instantly readable as WhatsApp without using its logo; the light sheet on Carbon works.
- **Honesty markers.** "Illustrative, with a fictional restaurant", the not-affiliated line, no invented metrics or logos.
- **Voice.** Short declarative lines; "We do the tech. You run the business." is clear in both languages.
- **Weight.** No images, no third-party scripts, static HTML: fast on a phone.
- **Rules before cards**, and the sticky section heads on wide screens.

### Weak

- **The real product is buried.** The one thing ALYR has built appears as the fifth row of the hero list and again in the fourth section. On a phone the first screen shows no product and no call to action in the header (only the menu button); the hero's main button only scrolls to the services list.
- **The promise is generic.** "Go digital. Without the IT team." and the six service tiles could belong to any agency, and nothing on the page shows the services were ever delivered. The specific, ownable things (messages that become orders and bookings, one person responsible for every customer, money collected, the Sunday report) are not on the homepage at all.
- **Repetition.** The hero board, the services grid and "Who we work with" list overlapping things; the board repeats "Service" four times as a tag.
- **The product figure shows something the product cannot do** (C1), and it uses a restaurant that the bookings module cannot yet serve (one table at a time).
- **Three fictional businesses** across the site (Zaitoon Grill, Dana Home Services, and Al Noor Electricals in the product), and a wrong weekday on /chat (C7).
- **The call to action is a dead end.** "Talk to us" leads to "Our WhatsApp line is being set up. Please check back shortly." Until ALY-60 is done the page cannot convert; the redesign should make the pending state feel deliberate, and be ready for the number.
- **Abstract middle sections.** "Four steps, one team" and "Careful by design" are true but say little to an owner; the scroll-lit statement is long on a phone.
- **Two product lines are shown as one.** Credit accounts is a separate product in the catalogue (C6); the homepage could present ALYR's products truthfully as two built and one coming.
- **Small finish issues:** at 1440 the hero's text column ends about 200 px above the board, leaving the lower left of the first screen empty; the three "facts" are numbered 01–03 as if they were steps; in the closing Carbon panel the text sits about 32 px left of the page's content line at 1440; long rows truncate on a phone ("Your tools talking to each ot…"); the social image repeats the old headline in English only.
- **Length.** About 6,000 px tall on desktop and 7,300 px on a phone, with no proof above the fold.

---

## Files in this folder

- `03-product-truth.md`: this page.
- `baseline/`: the live homepage on 16 Oct 2026, captured with headless Edge. `home-{en,ar}-1440-{first-screen,full}.png` at 1×, `home-{en,ar}-390-{first-screen,full}.png` at 2×. Full pages show every section as it looks once read.
- `baseline/shoot.mjs`: the capture script. `node shoot.mjs <url> <width> <height> <out.png> [--full] [--wait=ms] [--scale=n] [--scheme=dark] [--reduced-motion] [--as-scrolled]`. It uses its own Edge profile at `C:\t\shotsprof` and stops only the Edge processes started with it.
- `_playbook-extract.txt`: not written by this lane; already present when this work started.

## Not checked

- Whether Meta has approved any of the templates since 13 Oct, and whether `weekly_report` has been submitted.
- Any flow on a real phone after 12 Oct (tracking links, reminders, credit-account messages, the restyled customer pages through the tunnel).
- The workspace and customer pages were read in code, not run; the screen descriptions in 2.5 come from the code, not from screenshots.
- The Arabic wording, in the product or on the site, by a native speaker.
- That Cloudflare's Workers static assets honour the `_headers` file the build writes.
- `/chat` was not captured; only the homepage.
- Lint, build and `scripts/build-site.sh` were not run (nothing in the code was changed).
