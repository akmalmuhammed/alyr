# ALYR suite: messaging for the homepage and the product pages

17 Oct 2026, for ALY-99's site stage. The words for the suite homepage (`/`, `/ar`) and three new pages (`/bookings`, `/agent`, `/accounts`), in English (final) and Arabic (drafts for native review, ALY-66). Nothing here is published or in code.

**Order of authority.** `00-founder-decisions.md`, then D-034 and D-035, then this file. Product truth comes from `02-data.md`, the engine (`apps/api/src/alyr/modules/agent/insights.py`) and the fixtures (`apps/web/app/_agent/samples/*.json`); approved wording from `D:\alyr-home\docs\site-redesign\02`, `07`, `08` and `copy.ts` on `main` (the live site, published 17 Oct).

**Marks.** **(live)** reused word for word from `copy.ts` on `main`. **(live, changed)** reused with the change named. **[G]** true only after the named step. **[F]** the founder confirms before publishing.

**Rules for every line below.**
- No "AI", "smart", "intelligence", "learns", "understands", "thinks", "predicts", "knows", "notices", "I noticed", "assistant", sparkles or typing dots. The product counts, compares, flags, suggests and shows the rule. The owner is the one who knows.
- Prices are off (D-034). Every price line is in Appendix A, behind `NEXT_PUBLIC_ALYR_OFFER=on`.
- Contact is the email state: the button is "Email us", the address is hello@alyr.qa, and under it "A person from ALYR replies." (live).
- Sample screens say they are samples, with a fictional business. Product names stay in Latin in both languages, each with a plain descriptor.
- Order is always Chat, Bookings, Agent, Accounts, Payroll. Payroll is a dashed row with no link and no page.

---

## 1. Positioning

ALYR is the business agent for owner-run businesses in Qatar: a company that sets up and looks after the owner's tech, and a suite of products that share one workspace, one customer list and one team. Each product does one job in the chat the business already uses: ALYR Chat takes the orders, ALYR Bookings takes the appointments, ALYR Accounts keeps track of who owes you. Every one comes with ALYR Agent, the workspace's home screen and the Sunday report: what needs you now, how the week compares with the same days last week, and what ALYR already did for you. "Agent" means what it meant before software: someone who works on your behalf and reports back. ALYR Agent does it by fixed rules, from the business's own records, and writes the rule under every suggestion so the owner can check it. People do the rest: ALYR sets it up in the shop, and the owner's team answers whatever the rules leave to them.

**How the pages use it.** The word "agent" never carries a sentence alone. Wherever it appears, the same screen shows a rule line ("RULE · …") or says "by rules you can check". The Arabic does not translate "agent" (section 6.2).

---

## 2. The homepage

Sections in order: header, hero, Agent spotlight, suite, by business, how it works, trust, questions, closing call, footer. **Dropped from the live page:** "Sound familiar?" (its best lines move into the business rows) and "Set up for you" (its two lists move under How it works). The price section returns only with the offer (Appendix A).

### 2.1 Meta

| | EN | AR |
|---|---|---|
| Title | ALYR · Orders, bookings and credit accounts, set up for you | ALYR · الطلبات والحجوزات والحسابات الآجلة، نجهّزها لك |
| Description (offer off) | ALYR sets up and looks after the technology for owner-run businesses in Qatar. ALYR Chat, ALYR Bookings and ALYR Accounts share one workspace, and ALYR Agent comes with each: what needs you today, and your week in numbers. | تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتولى متابعتها. ALYR Chat وALYR Bookings وALYR Accounts تتشارك مساحة عمل واحدة، ومع كل منها يأتي ALYR Agent: ما يحتاجك اليوم، وأسبوعك بالأرقام. |

The title names what people search for. "Go digital without the IT team" (live title) can stay if the founder prefers continuity with the leave-behinds.

### 2.2 Header: the Products menu

Top level: **Products ▾ · By business · How it works · Questions · العربية · theme · [Email us]**. "Price" joins only with the offer.

| Name | One line (EN) | One line (AR) | State | Link |
|---|---|---|---|---|
| ALYR Chat | Orders from the chat, one team inbox, order tracking | الطلبات من المحادثة، وصندوق واحد للفريق، وتتبّع الطلب | Early access · إطلاق مبكر | `/chat` |
| ALYR Bookings | Appointments from the chat, with a reminder before each | المواعيد من المحادثة، مع تذكير قبل كل موعد | Early access · إطلاق مبكر | `/bookings` |
| ALYR Agent | What needs you today, and your week in numbers | ما يحتاجك اليوم، وأسبوعك بالأرقام | With every product · مع كل منتج | `/agent` |
| ALYR Accounts | Credit accounts: who owes you, and polite reminders | الحسابات الآجلة: من عليه مستحقات لك، وتذكيرات لبقة | Early access · إطلاق مبكر | `/accounts` |
| ALYR Payroll | Payroll and staff documents | الرواتب ووثائق الموظفين | Coming · قريباً | none: dashed row, pending dot |

Menu label: "Products" / «المنتجات». Accessible name of the Payroll row: "ALYR Payroll, coming. No page yet." / «ALYR Payroll، قريباً. لا صفحة له بعد.»

### 2.3 Hero: three options, ranked

All three share the button, the note under it, the figure and the facts row. Only the eyebrow, H1 and body change.

**Shared**
- Button: Email us · «راسلنا بالبريد» (live). Under it: "A person from ALYR replies." · «يردّ عليك شخص من ALYR.» (live), then hello@alyr.qa.
- Second link: See the products · «تعرّف على المنتجات» (to the suite section; replaces "See how it works").
- Facts (offer off): Set up for you, in your shop · ALYR Agent with every product · Arabic and English — «نجهّزها لك في محلك · ALYR Agent مع كل منتج · بالعربية والإنجليزية». First and last are live; the middle replaces "No commission on your orders", which moves to the questions.
- Figure: the real `AgentDashboard` on the Carbon plate, fed by `samples/{bakery,salon,clinic}.{en,ar}.json`, cropped to its first screen (header, Needs you now, the four numbers, the first suggestion). The Bakery / Salon / Clinic switch sits on the plate's top edge (2.4). Owner view, so money shows.

**Option 1 (recommended)**
- Eyebrow: We do the tech. You run the business. · «علينا التقنية، وعليك شغلك.» (live)
- H1: **Know what needs you today. / And how your week is going.** · «اعرف ما يحتاجك اليوم. / وكيف يسير أسبوعك.» («يحتاجك» matches the screen's «يحتاجك الآن»; a purist reviewer may prefer «ما يحتاج إليك», and then the screen's label changes too.)
- Body: ALYR sets up and looks after the technology for owner-run businesses in Qatar. Our products share one workspace: ALYR Chat for WhatsApp orders, ALYR Bookings for appointments, ALYR Accounts for credit. Each comes with ALYR Agent, which puts what needs you first, by rules you can check.
- AR: «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتولى متابعتها. منتجاتها تتشارك مساحة عمل واحدة: ALYR Chat لطلبات واتساب، ALYR Bookings للمواعيد، ALYR Accounts للحسابات الآجلة. ومع كل منتج يأتي ALYR Agent، فيضع ما يحتاجك أولاً، بقواعد واضحة تستطيع مراجعتها.»
- **Why first.**
  - The words say what the picture shows: the first block of the figure is "Needs you now" and the line under the greeting is the week. The owner reads the H1 and checks it against the screen in the same second.
  - It is true for every visitor. ALYR Agent comes with every product, so the line holds for the bakery, the salon and the clinic, and survives the switch.
  - It names a worry, not a growth promise: what am I missing while I serve. That is the control angle no competitor uses (02-messaging §1, gap 4).
  - No AI risk: the owner is the subject of "know", and the body says "by rules you can check" before the figure shows a single rule line.
  - The company promise stays in the eyebrow and the body, both live wording.
- **Risk.** It leaves "Go digital", which is on the leave-behinds. Keep that line in the closing call's small print or the footer if the founder wants the echo.

**Option 2**
- Eyebrow: We do the tech. You run the business. (live)
- H1: **Go digital. / Without the IT team.** · «تحوّل رقمياً. / بلا فريق تقنية.» (live)
- Body: ALYR sets up and looks after the technology for owner-run businesses in Qatar. Our products share one workspace, for WhatsApp orders, bookings and credit accounts, and every one comes with ALYR Agent: one screen that shows what needs you, by rules you can check.
- AR: «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتولى متابعتها. منتجاتها تتشارك مساحة عمل واحدة لطلبات واتساب والحجوزات والحسابات الآجلة، ومع كل منها يأتي ALYR Agent: شاشة واحدة تُظهر ما يحتاجك، بقواعد واضحة تستطيع مراجعتها.»
- **Why second.** Continuity: the founder's own line, live today and on the leave-behinds, and an echo of SMEs Go Digital. But a dashboard is not a picture of "going digital", the suite is invisible in the H1, and the line sells a one-off change where the Agent sells a daily habit. If chosen, the spotlight's H2 becomes Option 1's line.

**Option 3**
- Eyebrow: The business agent for owner-run businesses · «تعمل نيابةً عنك، لتتفرّغ لعملائك.»
- H1: **Every order, booking and riyal owed. / On one screen.** · «كل طلب وكل حجز وكل ريال مستحق لك. / على شاشة واحدة.»
- Body: ALYR sets up and looks after the technology for owner-run businesses in Qatar. ALYR Chat, ALYR Bookings and ALYR Accounts share one workspace, and ALYR Agent puts what needs you first, by rules you can check.
- AR: «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتولى متابعتها. ALYR Chat وALYR Bookings وALYR Accounts تتشارك مساحة عمل واحدة، وALYR Agent يضع ما يحتاجك أولاً، بقواعد واضحة تستطيع مراجعتها.»
- **Why third.** The most concrete list of the suite, and "riyal" is local. It carries the founder's positioning in the eyebrow. But "on one screen" is every competitor's line, it promises completeness ALYR does not have (no stock, no till), "order" is noise to a clinic, and "business agent" in the first words reads as an AI agent before anything can explain it.

### 2.4 Agent spotlight (directly under the hero)

The whole dashboard at true scale, with numbered callouts on hairlines. It shares the hero's switch state. If the design puts the whole screen in the hero instead, keep these words and callouts and drop the second copy of the screen.

- Eyebrow: ALYR Agent · with every product · «ALYR Agent · مع كل منتج»
- H2: **Every suggestion shows the rule behind it.** · «كل اقتراح يُظهر القاعدة التي وراءه.»
- Body: ALYR Agent reads the orders, bookings, chats and credit accounts already in your workspace. It compares your week with the same days last week, puts the work that is waiting at the top, and suggests up to three things. Each names its rule and opens the screen where you act.
- AR: «يقرأ ALYR Agent الطلبات والحجوزات والمحادثات والحسابات الآجلة الموجودة أصلاً في مساحة عملك. يقارن أسبوعك بالأيام نفسها من الأسبوع الماضي، ويضع العمل المنتظر في الأعلى، ويقترح حتى ثلاثة أمور، لكل منها قاعدتها وزرّ يفتح الشاشة التي تتصرف منها.»

**The switch**
- Group label: Sample business · «نشاط توضيحي»
- Options: Bakery · Salon · Clinic — «مخبز · صالون · عيادة»
- Announced on change: "Showing Qirfa Bakery, a fictional bakery." / "Showing Sadaf Salon, a fictional salon." / "Showing Ruwaa Dental Clinic, a fictional clinic." — «يُعرض الآن مخبز قرفة، وهو مخبز غير حقيقي.» / «يُعرض الآن صالون صدف، وهو صالون غير حقيقي.» / «تُعرض الآن عيادة رؤى للأسنان، وهي عيادة غير حقيقية.»

**FIG captions** (the component's own caption style: mono, hairline, tick)
- FIG 01 · ALYR Agent on a Thursday afternoon · SAMPLE, FICTIONAL BAKERY (then SALON, CLINIC)
- «الشكل 01 · ALYR Agent عصر يوم خميس · مثال: مخبز غير حقيقي» (then «صالون غير حقيقي», «عيادة غير حقيقية»: feminine)
- "Thursday afternoon" explains the frozen "Thu 15 Oct · 16:20" inside the screen.
- Line under the figure: The real screen, with fictional businesses. ALYR computed every number from each sample's records. · «الشاشة الحقيقية، بأنشطة غير حقيقية. كل رقم فيها حسبته ALYR من سجلات المثال نفسه.»

**Callouts** (each one points at a block the fixtures fill)

| # | EN | AR |
|---|---|---|
| 1 | One sentence on your week, against the same days last week. | جملة واحدة عن أسبوعك، مقارنةً بالأيام نفسها من الأسبوع الماضي. |
| 2 | Needs you now: work that is waiting, and for how long. It clears when the work is done. | يحتاجك الآن: العمل المنتظر، ومنذ متى. ويختفي حين يُنجز. |
| 3 | Four numbers, chosen by what you sell. A percentage only when both weeks have 20 or more. | أربعة أرقام بحسب ما تبيعه. ولا تظهر النسبة المئوية إلا حين يبلغ الأسبوعان 20 أو أكثر. |
| 4 | Up to three suggestions. Each ends with its rule, and opens the rows it counted. | حتى ثلاثة اقتراحات. ينتهي كل منها بقاعدته، ويفتح السجلات التي عدّها. |
| 5 | Done for you: what ALYR sent this week. | أنجزته ALYR لك: ما أرسلته هذا الأسبوع. |
| 6 | The same week on WhatsApp, every Sunday at 9:00. [G] | الأسبوع نفسه على واتساب، صباح كل يوم أحد الساعة 9:00. |

- Link: See ALYR Agent · «تعرّف على ALYR Agent»
- **Hide on the public figure** until a payment provider is live (ALY-17): the bakery's "Done for you" row "QAR 3,706 paid through ALYR links". A visitor reads it as live payments (claims row 17).

### 2.5 The suite

- Eyebrow: The products · «المنتجات»
- H2: **One workspace. A product for each job.** · «مساحة عمل واحدة. ولكل مهمة منتج.»
- Body: ALYR works on your behalf: we set it up, and our products take the orders and bookings, and send the reminders, in the chat you already use. They share one workspace, one customer list and one team, and you choose the ones you need. (second sentence live, changed: "you switch on what you need" becomes "you choose the ones you need", since with prices each added product costs more; "the chat you already use" is claims row 15)
- AR: «تعمل ALYR نيابةً عنك: نجهّز كل شيء بأنفسنا، ومنتجاتنا تستقبل الطلبات والحجوزات وترسل التذكيرات في المحادثة التي تستخدمها أصلاً. وهي تتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً، وتختار منها ما تحتاجه.»

Ruled rows, not cards. Each: name, descriptor, body, link, and at the row's end a small crop of a real screen at true scale: Chat, the order page's bottom bar; Bookings, the free times; Agent, the summary line; Accounts, the age bar; Payroll, an empty dashed slot.

| Product | Descriptor | Body (EN) | Body (AR) | Link |
|---|---|---|---|---|
| ALYR Chat | WhatsApp orders and team inbox · طلبات واتساب وصندوق الفريق | Customers order from a page made for their phone, with no app and no account. Each order has its own tracking page, and your whole team answers from one inbox. | يطلب العميل من صفحة مصمّمة لهاتفه، بلا تطبيق ولا حساب. ولكل طلب صفحة تتبّع، وفريقك كله يردّ من صندوق واحد. | See ALYR Chat · تعرّف على ALYR Chat |
| ALYR Bookings | Appointments and reminders · المواعيد والتذكيرات | Customers pick a time you are actually free. The confirmation goes out at once, and a reminder two hours before. (live) | يختار العميل من الأوقات المتاحة فعلاً لديك. يصله التأكيد فوراً، وتذكير قبل الموعد بساعتين. (live) | See ALYR Bookings · تعرّف على ALYR Bookings |
| ALYR Agent | Your business in numbers · نشاطك بالأرقام | What needs you now, your week against the same days last week, and up to three suggestions, each with its rule. With every product. | ما يحتاجك الآن، وأسبوعك مقارنةً بالأيام نفسها من الأسبوع الماضي، وحتى ثلاثة اقتراحات، لكل منها قاعدته. مع كل منتج. | See ALYR Agent · تعرّف على ALYR Agent |
| ALYR Accounts | Credit accounts · الحسابات الآجلة | Record credit sales in the chat, send polite reminders with a payment link, and see who promised to pay and when. (live) | سجّل البيع بالآجل في المحادثة، وأرسل تذكيرات لبقة برابط دفع، واعرف من وعد بالسداد ومتى. (live) | See ALYR Accounts · تعرّف على ALYR Accounts |
| ALYR Payroll | Payroll and staff documents · الرواتب ووثائق الموظفين | Coming. · قريباً. | | none (dashed) |

Under the rows, two lines:
- **In every product: a name on everything.** Every chat, order, booking and credit account has one person responsible. You see who answered, how fast, and what was sold or lost. (live) · «في كل منتج: لكل شيء مسؤول. لكل محادثة وطلب وحجز وحساب آجل موظف مسؤول. ترى من ردّ، وبأي سرعة، وما الذي بيع أو ضاع.» (live)
- **Payment links** come with ALYR Chat and ALYR Bookings. Live card payments start once your payment account is connected. (live, changed) · «روابط الدفع تأتي مع ALYR Chat وALYR Bookings. ويبدأ الدفع الفعلي بالبطاقات بعد ربط حساب الدفع الخاص بك.»

### 2.6 By business

- Eyebrow: By business · «حسب نشاطك»
- H2: **Start from how your customers reach you.** · «ابدأ من الطريقة التي يصل بها إليك عملاؤك.»

| Business | What it does for them (EN) | AR | Products | Honest note (EN / AR) |
|---|---|---|---|---|
| Restaurants and cafes · المطاعم والمقاهي | Your menu in the chat, orders on your screen, and each customer told when it is ready. Office regulars can order on account. | قائمتك داخل المحادثة، والطلبات على شاشتك، ويُبلَّغ العميل حين يجهز طلبه. وعملاء المكاتب الدائمون يطلبون على حسابهم. | Chat · Accounts · Agent | Table bookings are not in ALYR yet. / حجز الطاولات غير متوفر في ALYR بعد. |
| Salons and barbers · الصالونات ومحلات الحلاقة | Customers book a service from the chat, get a reminder two hours before, and your team marks who came. | يحجز العميل الخدمة من المحادثة، ويصله تذكير قبل موعده بساعتين، ويسجّل فريقك من حضر. | Bookings · Agent | One booking at a time today: right for one chair. Several chairs at once is next. / حجز واحد في الوقت نفسه اليوم: يناسب كرسياً واحداً. وأكثر من كرسي في الوقت نفسه هو الخطوة التالية. |
| Clinics · العيادات [F, legal] | Appointments booked from the chat, a reminder before each one, and a record of who missed theirs. | مواعيد تُحجز من المحادثة، وتذكير قبل كل موعد، وسجلّ بمن تغيّب عن موعده. | Bookings · Agent | One appointment at a time, and no patient files: ALYR keeps the appointment, not the medical record. / موعد واحد في الوقت نفسه، ولا ملفات للمرضى: تحفظ ALYR الموعد، لا الملف الطبي. |
| Home services · الخدمات المنزلية | Visits booked from the chat, parts ordered from a page, and contract customers on account. | زيارات تُحجز من المحادثة، وقطع تُطلب من صفحة، وعملاء العقود على الحساب. | Bookings · Chat · Accounts · Agent | One visit at a time per business today. / زيارة واحدة في الوقت نفسه لكل منشأة اليوم. |
| Shops and wholesale · المحلات وتجارة الجملة | Orders from your price list in the chat, and trade customers on credit, with reminders that stay polite. | طلبات من قائمة أسعارك داخل المحادثة، وعملاء تجاريون بالآجل مع تذكيرات لبقة. | Chat · Accounts · Agent | |

- Exit: Run something else? Tell us how you work today. (live, from `/chat`) · «نشاطك مختلف؟ أخبرنا كيف يسير العمل لديك اليوم.» (live)
- Each product tag links to its page. The honest note sits under a dashed hairline with the pending dot, in muted text.

### 2.7 How it works

- Eyebrow: How it works · «كيف نعمل» (live)
- H2: **From the first visit to your first week in numbers.** · «من أول زيارة إلى أول أسبوع بالأرقام.»
- 1. **We visit you.** We come to your shop, see how orders and bookings reach you today, and show you ALYR on your own phone. (live) · «نزورك.» «نأتي إلى محلك، ونرى كيف تصلك الطلبات والحجوزات اليوم، ونريك ALYR على هاتفك أنت.» (live)
- 2. **We set it up.** We load your menu or services and prices in Arabic and English, set your hours, switch on the products you need, and give each person on your team a sign-in. (live, changed) · «نجهّزه لك.» «نضيف قائمتك أو خدماتك وأسعارك بالعربية والإنجليزية، ونضبط ساعات العمل، ونفعّل المنتجات التي تحتاجها، ونعطي كل موظف في فريقك حساب دخول خاصاً به.»
- 3. **You go live.** We train your team at the counter. You share your chat link and QR codes, and orders and bookings start arriving in one place. (live, changed) · «يبدأ التشغيل.» «ندرّب فريقك عند الكاونتر، وتشارك رابط المحادثة ورموز QR، فتصل الطلبات والحجوزات إلى مكان واحد.»
- 4. **You see what changed.** ALYR Agent shows what needs you each day, and every Sunday a short report of your week arrives on WhatsApp. Want something changed? Message us and we change it. (live, changed) [G] · «ترى ما تغيّر.» «يعرض لك ALYR Agent ما يحتاجك كل يوم، وصباح كل يوم أحد يصلك تقرير أسبوعك على واتساب. تحتاج تعديلاً؟ راسلنا ونعدّله لك.»
- Note: ALYR is in early access. We set it up with each business ourselves, and agree your go-live date at the visit. (live, changed: "ALYR Chat" becomes "ALYR") · «ALYR في مرحلة الإطلاق المبكر. نجهّزها مع كل منشأة بأنفسنا، ونتفق معك على موعد بدء التشغيل خلال الزيارة.»
- Under the steps, the two live lists from "Set up for you", unchanged except the third monthly item: **When you start** (live) and **Every month**: "Menu, price and hours changes whenever you ask · A person from ALYR answers your messages · ALYR Agent and your Sunday report · Every product update, with nothing to install". AR third item: «ALYR Agent وتقرير الأحد».
- Step 4's visual: the Sunday report message, as live FIG 07, with one line added at the top of each section from the engine's own report.

### 2.8 Trust

Keep the live section: eyebrow, title "New company. No shortcuts." / «شركة جديدة. ونعمل بالأصول.», body, the six facts, the records row and FIG 10. One fact changes:

- **Control** (live, changed). Title: People stay in charge. Body: Automatic replies handle the routine, ALYR Agent only suggests and shows the rule for each suggestion, and anyone on your team can step into any chat. · «القرار لفريقك.» «الردود الآلية تتولى المتكرر، وALYR Agent يقترح فقط ويُظهر قاعدة كل اقتراح، وأي موظف يستطيع الدخول إلى أي محادثة.»
- The closing line (money back) stays offer-only, as today.
- **Do not add** "Your staff see their work, not your money". It is true on the Agent screen only (claims row 19).

### 2.9 Questions

Eyebrow and title live ("Questions" / "Fair questions."). Order below; live items keep their wording unless marked.

1. **Which product do I need?** (new) — Tell us how customers reach you. Orders in the chat: ALYR Chat. Appointments: ALYR Bookings. Customers who pay later: ALYR Accounts. A bakery that sells cakes and books tastings uses Chat and Bookings. ALYR Agent comes with each.
   - «أي منتج أحتاج؟» — «أخبرنا كيف يصل إليك عملاؤك. الطلبات في المحادثة: ALYR Chat. المواعيد: ALYR Bookings. عملاء يدفعون لاحقاً: ALYR Accounts. والمخبز الذي يبيع الكيك ويحجز مواعيد التذوّق يستخدم Chat وBookings معاً. ومع كل منتج يأتي ALYR Agent.»
2. **Do I have to take all of them?** (new) — No. Start with one, and add another when you need it, in the same workspace, with the same customers and team.
   - «هل عليّ أن آخذها كلها؟» — «لا. ابدأ بمنتج واحد، وأضف غيره حين تحتاجه، في مساحة العمل نفسها، مع العملاء أنفسهم والفريق نفسه.»
3. **Where do ALYR Agent's suggestions come from?** (new) — From fixed rules, written under each suggestion. It counts your own records, compares the week with the same days last week, and shows a percentage only when both weeks have 20 or more. It suggests; you decide.
   - «من أين تأتي اقتراحات ALYR Agent؟» — «من قواعد ثابتة مكتوبة تحت كل اقتراح. يعدّ سجلاتك أنت، ويقارن الأسبوع بالأيام نفسها من الأسبوع الماضي، ولا يعرض نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر. هو يقترح، والقرار لك.»
   - Deliberately not "Is it AI?": the founder's rule bans the word, even in a denial.
4. I already use WhatsApp Business. It's free. (live)
5. Delivery apps bring me customers. (live)
6. **I have more than one chair or room.** (new) — Today ALYR Bookings takes one booking at a time for the whole business. That suits one chair, one room or one practitioner. Several at once is the next step for Bookings. Tell us how many you run, and we'll tell you honestly whether it fits yet.
   - «لديّ أكثر من كرسي أو غرفة.» — «يقبل ALYR Bookings اليوم حجزاً واحداً في الوقت نفسه للمنشأة كلها، وهذا يناسب كرسياً واحداً أو غرفة واحدة أو مختصاً واحداً. أما الحجوزات المتزامنة فهي الخطوة التالية في Bookings. أخبرنا كم لديك، ونقول لك بصراحة إن كان يناسبك الآن.»
7. What does it cost? (live, offer off)
8. My staff won't use it. (live, changed) — We train them at your counter. Each person gets their own sign-in, and the steps are ones they already know: an order goes new, confirmed, ready, done; a visit is marked came or no-show.
   - «ندرّبهم عند الكاونتر. لكل موظف حساب دخول خاص، والخطوات مما يعرفونه: الطلب جديد، مؤكد، جاهز، مكتمل؛ والموعد حضر أو لم يحضر.»
9. What if something breaks on a busy night? (live)
10. My customers won't pay online. (live)
11. I'm not technical. (live)
12. Is my data safe? (live)
13. **Do you take a commission?** (new, carries the fact the hero dropped) — No. ALYR takes no commission on your orders or bookings.
   - «هل تأخذون عمولة؟» — «لا. لا تأخذ ALYR أي عمولة على طلباتك أو حجوزاتك.»
14. What do WhatsApp messages cost? (live)
15. Am I tied in? (live)
16. Can I message you on WhatsApp? (live, email state only)

Offer on: "QAR 449 a month is a lot." (live) after 7, plus Appendix A's combination question.

### 2.10 Closing call

- H2: **Tell us how customers reach you today.** · «أخبرنا كيف يصل إليك عملاؤك اليوم.» (live "Tell us how you take orders today", widened for bookings and credit)
- Body: Send us a message. A person from ALYR replies, then comes to show you ALYR on your own phone. (live) · «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR على هاتفك أنت.» (live)
- Button: Email us · «راسلنا بالبريد». Small line: A message commits you to nothing. · «الرسالة لا تُلزمك بشيء.» (live)
- Mail subject (live): How ALYR works for my business · «كيف تعمل ALYR مع محلي»
- Mail body (live, changed: one line added, "Shop" becomes "Business"):
  - EN: `Business name:\nArea:\nWhat you sell or book:\nHow customers reach you today:\nBest time to visit:\n`
  - AR: `اسم النشاط:\nالمنطقة:\nماذا تبيع أو ماذا يُحجز لديك:\nكيف يصل إليك عملاؤك اليوم:\nأنسب وقت للزيارة:\n`

### 2.11 Footer

- Line: We do the tech. You run the business. · «علينا التقنية، وعليك شغلك.» (live)
- Products: ALYR Chat · ALYR Bookings · ALYR Agent · ALYR Accounts · ALYR Payroll (coming, no link) — «ALYR Payroll (قريباً)»
- Site: Questions · العربية / English · Staff sign-in (live)
- ALYR. Built in Qatar. · Doha (live)
- ALYR uses the WhatsApp Business Platform. ALYR is not affiliated with, or endorsed by, WhatsApp or Meta. (live)

---

## 3. Product pages

Template from `01-research.md` D: 0 product bar, 1 hero on Carbon, 2 how it works from both sides, 3 the screen, 4 everything today then Not yet, 5 who it's for, 6 works with the rest of ALYR, 7 questions, 8 closing call. The header, footer and contact block are the homepage's.

**Shared strings**
- "Not yet" heading: Not yet · «لم يتوفر بعد». Each item has the hollow pending dot and sits below a dashed rule.
- "Works with the rest of ALYR" · «يعمل مع بقية منتجات ALYR». Ruled rows, in suite order, without the page's own product; Payroll last, dashed, no link.
- Closing body on every page: Send us a message. A person from ALYR replies, then comes to show you {product} on your own phone. · «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك {product} على هاتفك أنت.»
- Caption suffixes: SAMPLE, FICTIONAL SALON / BAKERY · «مثال: صالون غير حقيقي» / «مخبز غير حقيقي».

### 3.1 `/bookings`: ALYR Bookings

Sample business: **Sadaf Salon / «صالون صدف»** (the seed), services and sample prices from the salon preset: Haircut 45 min · QAR 60; Beard trim & shape 20 min · QAR 30; Haircut + beard 60 min · QAR 80. Take booking numbers, names and times from the seed, on real weekdays.

**0. Product bar:** ALYR Bookings · How it works · What's in it · Works with · [Email us] — «ALYR Bookings · كيف يعمل · ماذا يتضمن · يعمل مع» 

**1. Hero**
- Eyebrow: ALYR Bookings · Early access · «ALYR Bookings · المواعيد والتذكيرات · إطلاق مبكر»
- H1: **Customers book in the chat. / ALYR reminds them before they come.** · «عملاؤك يحجزون من المحادثة. / وتذكّرهم ALYR قبل موعدهم.»
- Lead: Your customers pick a service and a free time from a page that opens in the chat, with no app. The confirmation goes at once, a reminder two hours before, and your team marks who came. · «يختار عملاؤك الخدمة والوقت المتاح من صفحة تُفتح من المحادثة، بلا تطبيق. يصلهم التأكيد فوراً، والتذكير قبل الموعد بساعتين، ويسجّل فريقك من حضر.»
- Facts: Free times from your opening hours · A reminder 2 hours before · One booking at a time, for one chair or one room — «الأوقات المتاحة من ساعات عملك · تذكير قبل الموعد بساعتين · حجز واحد في الوقت نفسه، لكرسي واحد أو غرفة واحدة»
- Demo: tabs, each a chat beside a workspace panel, in the product's own words.

| Tab | Chat (EN, product wording) | Panel | Caption (EN / AR) |
|---|---|---|---|
| Book · احجز | Customer: "Hi, can I book a haircut for Saturday?" → "Pick a service and a time that suits you: alyr.qa/b/sadaf" | The booking page: 1 Choose a service, 2 Choose a day, 3 Choose a time | Free times come from your opening hours. Two customers can never take the same slot. (live, from `/chat`) / الأوقات المتاحة تأتي من ساعات عملك، ولا يمكن لعميلين أن يحجزا الموعد نفسه. (live) |
| Confirm · التأكيد | "Booking {n} confirmed at Sadaf Salon: Haircut, Sat 17 Oct, 7:30 PM. To cancel, send "my booking"." | Bookings: the new row, "Booked", who looks after it | The confirmation goes the moment they book, in the language they write in. / يصل التأكيد لحظة الحجز، باللغة التي يكتب بها العميل. |
| Remind · التذكير | "Reminder: booking {n} at Sadaf Salon, Sat 17 Oct, 7:30 PM." | The row, "Reminded" | Two hours before, by itself. A cancelled booking is never reminded. / قبل الموعد بساعتين، تلقائياً. والحجز الملغى لا يُذكَّر به أبداً. |
| Cancel · الإلغاء | Customer: "my booking" → "Booking {n}: Haircut, Sat 17 Oct, 7:30 PM." [Cancel booking] → "Your booking has been cancelled." | The row, "Cancelled" | "my booking" shows the next one, with a button to cancel. The time is free again for others. / كلمة «حجزي» تعرض الحجز القادم مع زر للإلغاء، ويعود الوقت متاحاً لغيره. |
| Came · الحضور | none | Today's list: [Came] [No-show] on a visit that has ended | Your team marks Came or No-show. That is what the no-show figures count. / يسجّل فريقك «حضر» أو «لم يحضر»، ومن ذلك تُحسب أرقام الغياب. |

Arabic chat lines use the product's format: «تم تأكيد حجزك رقم {n} لدى صالون صدف: قص شعر، 17/10 19:30. للإلغاء أرسل «حجزي».» · «تذكير: حجزك رقم {n} لدى صالون صدف، 17/10 19:30.» · «تم إلغاء حجزك.»

**2. How it works, from both sides** (`FlowDiagram`, three stories)
- Eyebrow: How it works · «كيف يعمل». H2: **What happens when a customer books.** · «ماذا يحدث حين يحجز عميل.»
- **A customer books** · «عميل يحجز»
  1. in · A customer writes to your number — Rohan writes "Can I book a haircut for Saturday?" on WhatsApp, as he always has. · «عميل يراسل رقمك» — «يكتب روهان على واتساب كعادته: «ممكن أحجز قص شعر يوم السبت؟»»
  2. A booking word, so ALYR answers — "Book" is one of the words ALYR answers by itself, in English and Arabic. Anything else goes to your team. Work: "Request: booking". · «كلمة حجز، فتردّ ALYR» — «كلمة «أحجز» من الكلمات التي تردّ عليها ALYR تلقائياً بالعربية والإنجليزية. وما عداها يذهب إلى فريقك.»
  3. out · The link comes back straight away. Chat: "Pick a service and a time that suits you: …" · «يصله الرابط فوراً»
  4. in · He picks a time — The page shows only times free in your opening hours. When he confirms, ALYR checks the time again and locks it. Work: "Time checked again and locked". · «يختار الوقت» — «لا تعرض الصفحة إلا الأوقات المتاحة في ساعات عملك. وعند التأكيد تتحقق ALYR من الموعد مرة أخرى وتحجزه.»
  5. team · Your team sees the booking, with who looks after it. · «فريقك يرى الحجز، ومن يتولاه»
  6. out · Confirmation now, reminder later. Work: "Confirmation sent", "Reminder set for 5:30 PM". · «تأكيد الآن، وتذكير لاحقاً»
- **A reminder goes out** · «تذكير يُرسل»: the live `/chat` story (`flow.stories[1]`), moved here with the salon's names and the reminder wording above. Keep "It checks WhatsApp's rules" as is.
- **The team marks the visit** · «الفريق يسجّل الزيارة»
  1. The visit ends — At 8:15 PM the haircut is over. Until someone marks it, it stays "Booked". · «تنتهي الزيارة» — «عند 8:15 م ينتهي قص الشعر. ويبقى «محجوزاً» إلى أن يسجّله أحد.»
  2. team · ALYR Agent lists it — Under Needs you now: "1 visit not marked. No-show figures stay wrong until they are." (engine wording) · «يظهر في ALYR Agent» — «تحت «يحتاجك الآن»: «زيارة واحدة لم تُسجَّل. أرقام الغياب ناقصة حتى تُسجَّل.»»
  3. back · One tap: Came. · «نقرة واحدة: حضر.»
  4. The figures stay true — No-shows over 30 days, and customers who missed twice and booked again, are counted from these marks. · «تبقى الأرقام صحيحة» — «الغياب خلال 30 يوماً، ومن تغيّب مرتين ثم حجز من جديد، يُحسبان من هذا التسجيل.»

**3. The screen you use every day**
- H2: **Today and the next seven days, on one screen.** · «اليوم والأيام السبعة القادمة، على شاشة واحدة.»
- FIG 02 · The Bookings screen · SAMPLE, FICTIONAL SALON · «الشكل 02 · شاشة الحجوزات · مثال: صالون غير حقيقي»
- Callouts: 1 Today and the next seven days · اليوم والأيام السبعة القادمة. 2 Who looks after each visit · من يتولى كل زيارة. 3 Came, No-show or Cancel, one tap each · حضر أو لم يحضر أو إلغاء، بنقرة واحدة. 4 Opened from ALYR Agent, it shows only the visits a rule counted · حين تفتحها من ALYR Agent، لا تعرض إلا الزيارات التي عدّتها القاعدة.

**4. Everything it does today** · «كل ما يفعله اليوم»
- For your customers · لعملائك
  - A booking page from the chat: service, day, time. No app, no account. · صفحة حجز من المحادثة: الخدمة واليوم والوقت، بلا تطبيق ولا حساب.
  - Only times that are really free, from your hours and the bookings you have. · لا تظهر إلا الأوقات المتاحة فعلاً، من ساعات عملك وحجوزاتك الحالية.
  - A note for you, if they want to add one. · ملاحظة لك إن أرادوا إضافتها.
  - The confirmation at once, in their language. · التأكيد فوراً، بلغتهم.
  - A reminder two hours before. · تذكير قبل الموعد بساعتين.
  - "my booking" to see or cancel the next one. · «حجزي» لعرض الحجز القادم أو إلغائه.
- For your team · لفريقك
  - Today and the next seven days, with who looks after each visit. · اليوم والأيام السبعة القادمة، ومن يتولى كل زيارة.
  - Came or No-show in one tap. · «حضر» أو «لم يحضر» بنقرة واحدة.
  - The chat that led to each booking, in the team inbox. · المحادثة التي جاء منها كل حجز، في صندوق الفريق.
  - In ALYR Agent: visits not marked, the no-show rate over 30 days, repeat no-shows booked again, quiet days ahead, customers due back. · في ALYR Agent: زيارات لم تُسجَّل، ونسبة الغياب خلال 30 يوماً، ومن تكرر غيابه وحجز من جديد، والأيام الهادئة القادمة، والعملاء الذين حان موعد عودتهم.
- Behind the scenes · في الخلفية
  - Two customers can never take the same slot: the time is checked again and locked. · لا يأخذ عميلان الوقت نفسه أبداً: يُتحقق من الموعد مرة أخرى ويُحجز.
  - A cancelled booking is never reminded. · الحجز الملغى لا يُذكَّر به.
  - WhatsApp's rules, handled: ordinary messages for 24 hours after a customer writes, approved wording after that. (live) · قواعد واتساب علينا (live)
  - Stop means stop. (live) · الإيقاف يعني الإيقاف. (live)
- **Not yet** · لم يتوفر بعد
  - Several bookings at the same time, by staff, chair or room. Next for ALYR Bookings. · حجوزات متزامنة حسب الموظف أو الكرسي أو الغرفة. وهي الخطوة التالية في ALYR Bookings.
  - Moving a booking, or adding a walk-in, from the screen. · نقل حجز أو إضافة عميل بلا موعد من الشاشة.
  - Changing services and opening hours yourself. ALYR changes them when you ask. · تعديل الخدمات وساعات العمل بنفسك. تعدّلها ALYR عند طلبك.
  - Deposits, or paying when booking. · العربون أو الدفع عند الحجز.
  - Choosing when the reminder goes. · اختيار موعد إرسال التذكير.
  - Messages to bring back customers who are due. They need marketing consent first. · رسائل لاستعادة العملاء الذين حان موعد عودتهم. تحتاج أولاً إلى موافقة تسويقية.

**5. Who it's for** · «لمن صُمّم»
- H2: **For businesses that serve one customer at a time.** · «للأنشطة التي تخدم عميلاً واحداً في كل مرة.»
- Barbers and salons with one chair · محلات الحلاقة والصالونات بكرسي واحد — tags Book · Remind · Came
- Clinics with one practitioner [F, legal] · العيادات بمختص واحد — Book · Remind
- Home services with one team · الخدمات المنزلية بفريق واحد — Visits · Remind
- Tutors, trainers and consultants · المدرّسون والمدرّبون والمستشارون — Book · Remind
- Exit: Several chairs or rooms? Tell us how many, and we'll say honestly whether it fits yet. · «أكثر من كرسي أو غرفة؟ أخبرنا كم لديك، ونقول لك بصراحة إن كان يناسبك الآن.»

**6. Works with the rest of ALYR**
- ALYR Chat — Take orders too: a bakery books cake tastings and sells the cake. · خذ الطلبات أيضاً: المخبز يحجز مواعيد التذوّق ويبيع الكيك.
- ALYR Agent — Comes with ALYR Bookings: visits not marked, no-shows over 30 days, customers due back. · يأتي مع ALYR Bookings: زيارات لم تُسجَّل، والغياب خلال 30 يوماً، والعملاء الذين حان موعد عودتهم.
- ALYR Accounts — Let regular clients pay later, and remind them politely. · دع عملاءك الدائمين يدفعون لاحقاً، وذكّرهم بلباقة.
- ALYR Payroll — Coming. · قريباً. (dashed)

**7. Questions**
- **Can I use it on its own?** Yes. ALYR Bookings works without ALYR Chat. It comes with the team inbox, because your customers write to you there, and with ALYR Agent. · «هل أستطيع استخدامه وحده؟» «نعم. يعمل ALYR Bookings دون ALYR Chat، ويأتي معه صندوق الفريق لأن عملاءك يراسلونك فيه، ويأتي معه ALYR Agent.»
- **How long does setup take?** We agree your go-live date at the visit. We load your services, prices and opening hours ourselves. · «كم يستغرق التجهيز؟» «نتفق معك على موعد بدء التشغيل خلال الزيارة، ونضيف خدماتك وأسعارك وساعات عملك بأنفسنا.»
- **How do I move from my book or my phone?** At the visit we agree the day you switch. The bookings you already have for the days after it, we enter for you. [F] · «كيف أنتقل من دفتري أو هاتفي؟» «نتفق خلال الزيارة على يوم الانتقال، ونُدخل لك بأنفسنا الحجوزات الموجودة لديك لما بعده.»
- **I have more than one chair or room.** Homepage question 6, word for word.
- **What if a customer doesn't come?** Your team marks No-show. ALYR Agent shows your no-show rate over 30 days, and flags a customer who missed twice and has booked again. · «وإذا لم يحضر العميل؟» «يسجّل فريقك «لم يحضر». ويعرض لك ALYR Agent نسبة الغياب خلال 30 يوماً، وينبّهك إلى العميل الذي تغيّب مرتين ثم حجز من جديد.»
- **Clinics: does it keep patient records?** No. ALYR Bookings keeps the appointment, the service and the chat. Keep medical notes where you keep them today. [F, legal] · «هل يحفظ ملفات المرضى؟» «لا. يحفظ ALYR Bookings الموعد والخدمة والمحادثة فقط، واحتفظ بالملاحظات الطبية حيث تحفظها اليوم.»

**8. Closing:** H2 **Tell us how bookings reach you today.** · «أخبرنا كيف تصلك الحجوزات اليوم.» Body: the shared closing with "ALYR Bookings".

### 3.2 `/agent`: ALYR Agent

Sample businesses: the three fixtures, with the homepage's switch and captions.

**0. Product bar:** ALYR Agent · How it works · The rules · What's in it · Works with — «ALYR Agent · كيف يعمل · القواعد · ماذا يتضمن · يعمل مع»

**1. Hero**
- Eyebrow: ALYR Agent · With every product · «ALYR Agent · نشاطك بالأرقام · مع كل منتج»
- H1: **Your business in numbers. / Daily on your screen, weekly on WhatsApp.** · «نشاطك بالأرقام. / يومياً على شاشتك، وأسبوعياً على واتساب.»
- Lead: ALYR Agent is the home screen of your workspace. It says in one sentence how the week is going, lists what needs you now, and suggests up to three things, each with the rule behind it. · «ALYR Agent هو الشاشة الرئيسية في مساحة عملك. يقول لك في جملة واحدة كيف يسير أسبوعك، ويعرض ما يحتاجك الآن، ويقترح حتى ثلاثة أمور، لكل منها القاعدة التي وراءه.»
- Facts: With every ALYR product · Every suggestion shows its rule · Counted from your own records — «مع كل منتجات ALYR · كل اقتراح يُظهر قاعدته · يُحسب من سجلاتك أنت»
- Figure: the full dashboard with the switch, FIG 01 caption as on the homepage. This is the demo; there are no tabs.

**2. How it works** (four steps in a row, one card opened)
- H2: **Your records, a rule, a card, the screen.** · «سجلاتك، ثم القاعدة، ثم البطاقة، ثم الشاشة.»
- 1 **Your records** — The orders, bookings, chats and credit accounts your team already keeps in ALYR. · «سجلاتك» — «الطلبات والحجوزات والمحادثات والحسابات الآجلة التي يسجّلها فريقك أصلاً في ALYR.»
- 2 **A rule** — Fixed rules, each with a minimum, so a small number never raises an alarm. · «القاعدة» — «قواعد ثابتة، لكل منها حد أدنى، فلا يثير رقم صغير إنذاراً.»
- 3 **A card** — When a rule is true, a card says what it found, with the rule written underneath. · «البطاقة» — «حين تنطبق القاعدة، تظهر بطاقة تقول ما وجدته، والقاعدة مكتوبة تحتها.»
- 4 **The screen to act on** — Its button opens the screen with exactly the rows it counted. When the work is done, the card closes. · «الشاشة» — «زرّها يفتح الشاشة على السجلات التي عدّتها بالضبط. وحين يُنجز العمل تُغلق البطاقة.»
- The opened card, from the bakery fixture, word for word: "QAR 3,266 overdue, with no reminder this week" · "Owed by 3 customers. The oldest is Ward Events, 104 days." · "RULE · owed 30+ days, no promise, no reminder in 7 days · 3 customers" · [Send reminders]. Arabic from `bakery.ar.json`.
- Under it: The button opens your credit accounts with those three customers. Nothing is sent until you press Send reminders there. · «يفتح الزر حساباتك الآجلة على هؤلاء العملاء الثلاثة. ولا يُرسل شيء حتى تضغط «أرسل التذكيرات» هناك.»

**3. The Sunday report**
- H2: **The same week, on your WhatsApp, every Sunday.** [G] · «الأسبوع نفسه على واتساب، صباح كل يوم أحد.»
- Body: At 9:00 on Sunday, last week's numbers, one section per product, each compared with the week before. If you have not written to ALYR in the last 24 hours, it arrives as one line first: reply REPORT and the rest follows. · «الساعة 9:00 صباح الأحد تصلك أرقام الأسبوع الماضي، قسم لكل منتج، وكل قسم مقارن بالأسبوع الذي قبله. وإن لم تراسل ALYR خلال آخر 24 ساعة، يصلك أولاً في سطر واحد: أرسل «تقرير» فيصلك الباقي.»
- Visual: live FIG 07 (the WhatsApp report for Qirfa Bakery, sample figures), renumbered.

**4. The rules, in plain words** (its own section)
- H2: **It counts. It compares. It shows the rule.** · «يعدّ، ويقارن، ويُظهر القاعدة.»
- Body: No guesses and no scores. Six of the rules, as they appear on your screen. · «لا تخمين ولا تقييم بالنقاط. هذه ست من القواعد، كما تظهر على شاشتك.»

| Name (EN / AR) | Rule line, word for word from `insights.py` |
|---|---|
| Customers waiting · عملاء بانتظار الرد | RULE · the customer wrote last and has had no answer for 10 minutes · القاعدة · آخر رسالة من العميل ولم يُرد عليها منذ 10 دقائق |
| Orders not confirmed · طلبات لم تُؤكَّد | RULE · new for over 15 minutes · القاعدة · جديد منذ أكثر من 15 دقيقة |
| Overdue, not reminded · متأخر بلا تذكير | RULE · owed 30+ days, no promise, no reminder in 7 days · القاعدة · مستحق منذ 30 يوماً أو أكثر، دون وعد ودون تذكير خلال 7 أيام |
| Missed twice, booked again · تغيّب مرتين وحجز من جديد | RULE · 2+ no-shows in 90 days, booked in the next 7 · القاعدة · غياب مرتين أو أكثر خلال 90 يوماً، وحجز خلال الأيام السبعة القادمة |
| Regulars gone quiet · زبائن دائمون انقطعوا | RULE · 3+ orders or visits 31 to 120 days ago, none in the last 30 · then "Messages to many customers need marketing consent. Coming." · القاعدة · 3 طلبات أو زيارات أو أكثر قبل 31 إلى 120 يوماً، ولا شيء خلال آخر 30 يوماً |
| No-show rate · نسبة الغياب | RULE · no-shows ÷ (came + no-shows) over 30 days; 10% or more, with 3 or more · القاعدة · الغياب ÷ (الحضور + الغياب) خلال 30 يوماً؛ 10% أو أكثر مع 3 حالات أو أكثر |

- Two lines under the table:
  - Same days, never yesterday: the week so far is compared with the same days and hours last week. · «الأيام نفسها، لا الأمس: الأسبوع حتى الآن يُقارن بالأيام والساعات نفسها من الأسبوع الماضي.»
  - Small numbers stay counts: a percentage only when both weeks have 20 or more; below that, "7 · last week 4". · «الأرقام الصغيرة تبقى أعداداً: لا نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر، وما دون ذلك يظهر هكذا: «7 · الأسبوع الماضي 4».»

**5. Everything it does today** · «كل ما يفعله اليوم»
- One sentence on the week, against the same days last week · جملة واحدة عن الأسبوع، مقارنةً بالأيام نفسها من الأسبوع الماضي
- Needs you now: customers waiting, orders not confirmed, visits not marked. They clear when the work is done · يحتاجك الآن: عملاء بانتظار الرد، وطلبات لم تُؤكَّد، وزيارات لم تُسجَّل. وتختفي حين يُنجز العمل
- Four numbers, chosen by what you sell · أربعة أرقام بحسب ما تبيعه
- Up to three suggestions by rule, each opening the rows it counted · حتى ثلاثة اقتراحات حسب القاعدة، كل منها يفتح السجلات التي عدّها
- "Not now" sets a suggestion aside until its numbers change, or until Sunday · «ليس الآن» يؤجل الاقتراح حتى تتغير أرقامه أو حتى يوم الأحد
- Done for you this week: messages ALYR sent and booking reminders · أنجزته ALYR لك هذا الأسبوع: الرسائل التي أرسلتها، وتذكيرات المواعيد
- The week day by day with last week behind it, busiest hours over 28 days, top items or services, money owed by age, and the team by name · الأسبوع يوماً بيوم وخلفه الأسبوع الماضي، وأكثر الساعات ازدحاماً خلال 28 يوماً، والأكثر طلباً أو حجزاً، والمستحقات حسب عمرها، والفريق بالأسماء
- On this screen, staff see the work in front of them and their own numbers, not the shop's money · على هذه الشاشة يرى الموظف العمل الذي أمامه وأرقامه هو، لا أموال المحل
- The Sunday report on WhatsApp [G] · تقرير الأحد على واتساب
- Arabic and English, light and dark, phone and laptop · بالعربية والإنجليزية، فاتح وداكن، على الهاتف والحاسوب
- **Not yet** · لم يتوفر بعد
  - A screen for the Sunday report, and choosing its day and time · شاشة لتقرير الأحد، واختيار يومه وساعته
  - Messages to quiet regulars from a suggestion. They need marketing consent first · رسائل للزبائن الدائمين الذين انقطعوا، من الاقتراح نفسه. تحتاج أولاً إلى موافقة تسويقية
  - Tapping a number to open its week on a phone · نقرة على الرقم تفتح أسبوعه على الهاتف
  - A count of chats answered after hours · عدد المحادثات التي رُدّ عليها بعد الدوام
  - Cash at the counter. Sales count orders, not cash collected · النقد عند الكاونتر. المبيعات تُحسب من الطلبات، لا من النقد المحصَّل

**6. Who it's for**
- H2: **Every ALYR business has it. What leads depends on yours.** · «لكل نشاط مع ALYR. وما يتصدّر يتبع نشاطك.»
- Restaurants, cafes and bakeries · المطاعم والمقاهي والمخابز — Sales this week · Orders this week · Owed to you · Waiting now (the bakery fixture)
- Salons and clinics · الصالونات والعيادات — Visits this week · Booked, next 7 days · No-shows, 30 days · New bookings (the salon fixture)
- Shops and wholesale · المحلات وتجارة الجملة — Owed to you · Collected · Over 60 days · Promised (01 C; no fixture yet, so check the engine's labels before publishing)
- Tags are the engine's own KPI labels (`kpis[].label`, Arabic from the `.ar` fixtures), so the page and the screen agree.

**7. Works with the rest of ALYR** (each line says what that product adds to the Agent)
- ALYR Chat — Sales against the same days last week, orders waiting, top items. · المبيعات مقارنةً بالأيام نفسها من الأسبوع الماضي، والطلبات المنتظرة، والأكثر طلباً.
- ALYR Bookings — Visits, no-shows over 30 days, customers due back. · الزيارات، والغياب خلال 30 يوماً، والعملاء الذين حان موعد عودتهم.
- ALYR Accounts — Money owed by age, overdue and not reminded, promises passed. · المستحقات حسب عمرها، والمتأخر بلا تذكير، والوعود التي مضى موعدها.
- ALYR Payroll — Coming. (dashed)

**8. Questions**
- **Do I pay for ALYR Agent?** It comes with every ALYR product. (offer on: Appendix A) · «هل أدفع مقابل ALYR Agent؟» «يأتي مع كل منتجات ALYR.»
- **Where do the suggestions come from?** Homepage question 3.
- **Can I trust the numbers?** Every number is counted from your own records, and every suggestion opens the rows behind it. Two things to know: a visit nobody marked stays out of the no-show rate until someone does, and cash taken at the counter is not recorded in ALYR yet. · «هل أثق بالأرقام؟» «كل رقم يُحسب من سجلاتك أنت، وكل اقتراح يفتح السجلات التي وراءه. ومما ينبغي أن تعرفه: الزيارة التي لم يسجّلها أحد لا تدخل نسبة الغياب حتى تُسجَّل، والنقد المستلم عند الكاونتر لا يُسجَّل في ALYR بعد.»
- **Will it message my customers?** No. ALYR Agent only shows and suggests. Messages go from the screens you choose, like Send reminders in ALYR Accounts. · «هل يراسل عملائي؟» «لا. ALYR Agent يعرض ويقترح فقط. والرسائل تخرج من الشاشات التي تختارها، مثل «أرسل التذكيرات» في ALYR Accounts.»
- **Can my staff see it?** Yes, without the money. On this screen they see the work in front of them and their own numbers. You and your managers see everything. [G: scope] · «هل يراه موظفوني؟» «نعم، دون الأموال. يرون على هذه الشاشة العمل الذي أمامهم وأرقامهم هم، وأنت ومديروك ترون كل شيء.»

**9. Closing:** H2 **Tell us what you'd want to know each morning.** · «أخبرنا ماذا تريد أن تعرف كل صباح.» Body: the shared closing with "ALYR Agent".

### 3.3 `/accounts`: ALYR Accounts

Sample business: **Qirfa Bakery / «مخبز قرفة»** and its account customers from the seed (Ward Events, Bluefin Events, Marina Desk Co-working), so the homepage, `/agent` and `/accounts` tell one story. For the gentle reminder, pick a seeded account between 30 and 59 days old; take figures from the seed.

**0. Product bar:** ALYR Accounts · How it works · What's in it · Works with — «ALYR Accounts · كيف يعمل · ماذا يتضمن · يعمل مع»

**1. Hero**
- Eyebrow: ALYR Accounts · Early access · «ALYR Accounts · الحسابات الآجلة · إطلاق مبكر»
- H1: **Know who owes you. / Remind them without the awkward call.** · «اعرف من عليه مستحقات لك. / وذكّره دون اتصال محرج.»
- Lead: Record a credit sale with one line from your staff phone. The customer is told the new balance, reminders go in a tone that follows the age of the debt, and a promise to pay pauses them. · «سجّل البيع بالآجل بسطر واحد من هاتف الموظف. يُبلَّغ العميل برصيده الجديد، وتصله تذكيرات بنبرة تتدرّج مع عمر الدين، والوعد بالسداد يوقفها.»
- Facts: The oldest debt is settled first · Never reminded twice within 3 days · Stop means stop — «يُسدَّد الأقدم أولاً · لا تذكيرين خلال 3 أيام · الإيقاف يعني الإيقاف»
- Demo (the live `/chat` "Collect" tab, moved and split, with the bakery's names):

| Tab | Chat (product wording) | Panel | Caption (EN / AR) |
|---|---|---|---|
| Record · التسجيل | Staff phone: "{name} 450 credit" → "Recorded: {name}, credit sale of QAR 450. Balance is now QAR {b}. The customer has been told." Customer: "Qirfa Bakery: we recorded a credit purchase of QAR 450. Your balance is now QAR {b}." | The account, the new entry | One line from your staff phone. The customer hears about every entry. / سطر واحد من هاتف الموظف، ويُبلَّغ العميل بكل حركة. |
| Remind · التذكير | "A friendly reminder from Qirfa Bakery: QAR {b} is due. Your oldest unpaid purchase was {d} days ago. Pay here: …" [Pay now] [I'll pay within a week] | "Reminded" | Gentle under 60 days, firmer from 60, a final notice from 90. / ودّي قبل 60 يوماً، وأشد من 60، وإشعار أخير من 90. |
| Promise · الوعد | Customer taps "I'll pay within a week" → "Thank you. We have noted that you will pay by 22 Oct. No reminders will be sent until then." | "Promised by 22 Oct" | A promise pauses the reminders until its date. If it passes with nothing paid, ALYR Agent shows it. / الوعد بالسداد يوقف التذكيرات حتى موعده، وإن مضى دون دفع يظهر في ALYR Agent. |
| Pay · الدفع | "Received QAR 500. Your balance is now QAR {b}. Thank you." | Collected through payment links | The payment page is still a test page: no money moves. (live) / صفحة الدفع ما زالت تجريبية، ولا تُنقل فيها أي أموال. (live) |
| Accounts · الحسابات | none | Total owed, the age bar, the customer list | Payments settle the oldest debt first, as a paper book is read. / تُسدَّد أقدم الديون أولاً، كما يُقرأ الدفتر الورقي. |

Arabic chat lines take the product's Arabic, with amounts written «450 ر.ق» (P1-8) once `fmt_qar` is language-aware; until then, show what the product prints and caption it as drawn.

**2. How it works, from both sides** (`FlowDiagram`, three stories)
- H2: **What happens between a sale on credit and the payment.** · «ماذا يحدث بين البيع بالآجل والسداد.»
- **A sale on credit** · «بيع بالآجل»: staff phone sends the line → ALYR records it on that customer's account → out: the customer is told the new balance → team: the balance on the Credit accounts screen. Second path, one line: from the order page, a customer with a credit limit taps "Put it on my account"; over the limit it is refused. · «ومن صفحة الطلب، يضغط العميل الذي له حد ائتمان «سجّله على حسابي»، ويُرفض الطلب إن تجاوز الحد.»
- **A reminder goes out** · «تذكير يُرسل»: you press Send reminders (customers 30+ days) → checks: a live promise? said stop? reminded in the last 3 days? → the tone by age → out: the reminder → team: "Reminded". Work lines: "Promise: none", "Consent: on record", "Last reminder: 9 days ago", "Tone: gentle".
- **A promise pauses it** · «الوعد يوقفه»: in: the customer taps "I'll pay within a week" → ALYR notes the date and pauses reminders for 7 days → out: the confirmation → team: "Promised by 22 Oct" → if the date passes with nothing paid: ALYR Agent shows "RULE · the promised date passed with nothing paid". · «القاعدة · مضى موعد الوعد ولم يُدفع شيء»

**3. The screen you use every day**
- H2: **Who owes you, and how long.** · «من عليه مستحقات لك، ومنذ متى.»
- FIG 02 · Credit accounts · SAMPLE, FICTIONAL BAKERY · «الشكل 02 · الحسابات الآجلة · مثال: مخبز غير حقيقي»
- Callouts: 1 Total owed to you · إجمالي المستحق لك. 2 By age: 0–30, 31–60, 61–90, over 90 days · حسب العمر: 0–30، 31–60، 61–90، أكثر من 90 يوماً. 3 Collected through payment links · المحصَّل عبر روابط الدفع. 4 Send reminders, to accounts 30+ days old · أرسل التذكيرات للحسابات المتأخرة 30 يوماً أو أكثر. 5 Promised and Over limit, on each account · «وعد بالسداد» و«تجاوز الحد» على كل حساب. 6 Each customer's entries · حركات كل عميل.

**4. Everything it does today** · «كل ما يفعله اليوم»
- For your customers · لعملائك
  - Told about every entry, with the new balance · يُبلَّغون بكل حركة، مع الرصيد الجديد
  - "balance" brings the balance and latest entries, with Pay now · كلمة «رصيدي» تعرض الرصيد وآخر الحركات، مع «ادفع الآن»
  - Pay all or part from a link ("pay 500") · الدفع كاملاً أو جزئياً من رابط («ادفع 500»)
  - "I'll pay within a week", one tap · «سأدفع خلال أسبوع» بنقرة واحدة
- For your team · لفريقك
  - Record a sale or a payment with one line from the staff phone · تسجيل بيع أو دفعة بسطر واحد من هاتف الموظف
  - Orders on account for customers with a credit limit, refused over it (with ALYR Chat) · طلبات على الحساب للعملاء أصحاب حد الائتمان، وتُرفض إن تجاوزته (مع ALYR Chat)
  - What is owed, by age, and who promised and when · المستحقات حسب عمرها، ومن وعد بالسداد ومتى
  - Send reminders to everyone 30+ days old, in one press · إرسال التذكيرات لكل المتأخرين 30 يوماً أو أكثر بضغطة واحدة
  - One person responsible for each account · موظف مسؤول عن كل حساب
  - In ALYR Agent: overdue and not reminded, promises passed, over the limit, owed growing three weeks running · في ALYR Agent: المتأخر بلا تذكير، والوعود التي مضى موعدها، وتجاوز الحد، ونمو الآجل 3 أسابيع متتالية
- Behind the scenes · في الخلفية
  - The oldest debt is settled first · يُسدَّد الأقدم أولاً
  - Nobody is reminded twice within 3 days · لا يُذكَّر أحد مرتين خلال 3 أيام
  - The tone follows the age of the debt (live) · تتدرّج النبرة بحسب عمر الدين (live)
  - Stop means stop (live) · الإيقاف يعني الإيقاف (live)
- **Not yet** · لم يتوفر بعد
  - Live payments through your own payment provider. Links run on a test page · الدفع الفعلي عبر مزوّد الدفع الخاص بك. الروابط تعمل اليوم على صفحة تجريبية
  - Recording a sale or payment from the screen · تسجيل بيع أو دفعة من الشاشة
  - Setting a credit limit yourself. ALYR sets it when you ask · تحديد حد الائتمان بنفسك. تحدده ALYR عند طلبك
  - Statements and invoices · كشوف الحساب والفواتير
  - Buttons on a reminder sent more than 24 hours after the customer last wrote. It carries the pay link · أزرار في التذكير الذي يُرسل بعد مرور 24 ساعة على آخر رسالة من العميل. يصله رابط الدفع فقط
  - Recording how a customer paid: cash, card or transfer · تسجيل طريقة الدفع: نقداً أو بالبطاقة أو بالتحويل

**5. Who it's for** · «لمن صُمّم»
- H2: **For businesses that let regulars pay later.** · «للأنشطة التي تبيع لعملائها الدائمين بالآجل.»
- Wholesale and trading, with trade customers on terms · تجارة الجملة، مع عملاء تجاريين بالآجل — Record · Remind · Collect
- Shops with regulars on the book · محلات لها زبائن دائمون في الدفتر — Record · Remind
- Restaurants and bakeries with office or event accounts · مطاعم ومخابز لها حسابات مكاتب أو مناسبات — Order on account · Remind
- Home services with contract customers · خدمات منزلية مع عملاء عقود — Record · Remind
- Exit (live)

**6. Works with the rest of ALYR**
- ALYR Chat — Orders put on account land here, and the order page refuses one over the limit. · الطلبات المسجّلة على الحساب تصل هنا، وصفحة الطلب ترفض ما يتجاوز الحد.
- ALYR Bookings — Clients who pay for visits later: record it with the same one line. · العملاء الذين يدفعون ثمن زياراتهم لاحقاً: سجّلها بالسطر نفسه. (The booking page has no "on account" button.)
- ALYR Agent — Comes with ALYR Accounts: overdue and not reminded, promises passed, over the limit. · يأتي مع ALYR Accounts: المتأخر بلا تذكير، والوعود التي مضى موعدها، وتجاوز الحد.
- ALYR Payroll — Coming. (dashed)

**7. Questions**
- **Can I use it on its own?** Yes. You record sales with a line from your staff phone. Add ALYR Chat, and customers can put an order on their account from the order page. · «هل أستطيع استخدامه وحده؟» «نعم. تسجّل المبيعات بسطر من هاتف الموظف. وإن أضفت ALYR Chat، يستطيع العميل تسجيل طلبه على حسابه من صفحة الطلب.»
- **Will reminders upset my customers?** The first is a friendly reminder. It turns firmer only after 60 days, nobody gets two within 3 days, and one tap on "I'll pay within a week" pauses them. · «هل تزعج التذكيرات عملائي؟» «الأول تذكير ودّي، ولا تشتد النبرة إلا بعد 60 يوماً، ولا يصل أحداً تذكيران خلال 3 أيام، ونقرة على «سأدفع خلال أسبوع» توقفها.»
- **What if a customer says stop?** They get no more reminders or notices. You still see what they owe. · «وإن طلب العميل الإيقاف؟» «لا تصله بعدها تذكيرات ولا إشعارات، وتبقى ترى ما عليه.»
- **How do I move from my paper book?** At setup we record each customer's balance with you, so the first reminder is right. [F] · «كيف أنتقل من دفتري الورقي؟» «نسجّل معك رصيد كل عميل عند التجهيز، فيكون أول تذكير صحيحاً.»

**8. Closing:** H2 **Tell us how you keep credit today.** · «أخبرنا كيف تسجّل الآجل اليوم.» Body: the shared closing with "ALYR Accounts".

### 3.4 What `/chat` needs now

Bookings live on `/bookings` and credit on `/accounts`, so `/chat` becomes orders, payment links, tracking and the team inbox.

| Key | Now | Change to |
|---|---|---|
| `meta.chat.title` | "ALYR Chat · Orders and bookings in the WhatsApp chat" | EN "ALYR Chat · WhatsApp orders and team inbox" · AR «ALYR Chat · طلبات واتساب وصندوق الفريق» |
| `meta.chat.description` | "…with an order page, a booking page and order tracking…" | EN "ALYR Chat answers your customers' WhatsApp messages with an order page and order tracking, and gives your team one inbox. Set up for you. For restaurants, cafes, shops and home services in Qatar." · AR «يردّ ALYR Chat على رسائل عملائك في واتساب بصفحة للطلب وصفحة لتتبّعه، ويجمع فريقك في صندوق واحد، ونحن نجهّزه لك. للمطاعم والمقاهي والمحلات والخدمات المنزلية في قطر.» |
| `product.title` | "Orders and bookings, in the chat." | EN "Orders in the chat. One inbox for the team." · AR «الطلبات داخل المحادثة. وصندوق واحد للفريق.» |
| `product.body` | "…adds the booking, the order, the payment link…" | EN "Your customers keep messaging you the way they already do. ALYR Chat adds the order page, the payment link and the updates, and your team sees it all in one place." · AR «يواصل عملاؤك مراسلتك كما اعتادوا. ويضيف ALYR Chat صفحة الطلب ورابط الدفع والتحديثات، وفريقك يرى كل شيء في مكان واحد.» |
| `product.demos` | Book, Order, Pay, Track, Collect, Team inbox | Order, Pay, Track, Team inbox. **Book** moves to `/bookings` (tab "Book", rewritten with a booking word, C2). **Collect** moves to `/accounts`. In **Pay**, the row "On account · Al Rayyan Villas · Reminded" goes; use a second paid order |
| `demos[order].panel` | "Smart thermostat" / «ثرموستات ذكي» | "Digital thermostat" / «ثرموستات رقمي» (the founder's word ban, in sample data too) |
| `demos[inbox].caption`, `inside` "Step in at any moment", flow "The assistant steps back" | "the assistant" / «المساعد» | "the automatic replies" / «الردود الآلية». Title: "Automatic replies step back" / «الردود الآلية تتنحّى». Product label "Assistant" in the inbox: product lane ticket |
| `flow.stories` | A customer books · A reminder goes out · A person steps in | **A customer orders** · **The order moves** · A person steps in (kept). The first two move to `/bookings` |
| `flow.stories[book].steps[1]` | "…and sees that she writes in English." / «وتلاحظ أنها تكتب بالعربية.» | Moves with the story; there: "Her message is in English, so the replies are too." / «ولأن رسالتها بالعربية، تصلها الردود بالعربية.» |
| `flow.stories[book].steps[2]` | "It works out what she needs" / «تفهم ما تحتاجه» | Gone with the story ("understands" is banned). `/bookings` uses "A booking word, so ALYR answers" |
| `inside.groups` | "Booking in the chat"; "Credit accounts", "Reminders that stay polite" | Drop the booking item. Move the two credit items to `/accounts`. In its place, for your customers: **Order tracking** — "Each order has its own page showing every step and who is looking after it." (live homepage) · «تتبّع الطلب» — «لكل طلب صفحة خاصة به، تُظهر كل خطوة ومن يتولاه.» (live) |
| `who.rows` | "Clinics and salons… Bookings and reminders"; Home services "Scheduled visits…"; Shops "…credit accounts" | **Clinics and salons:** "Bookings and reminders have their own product now." + "See ALYR Bookings" · «للحجوزات والتذكيرات منتجها الخاص الآن.» + «تعرّف على ALYR Bookings». **Home services:** "Parts and supplies ordered from a page, and an update at every step." · «قطع ومستلزمات تُطلب من صفحة، وتحديث عند كل خطوة.» **Shops and trading:** "Orders and payment links. Add ALYR Accounts for customers on credit." · «طلبات وروابط دفع. وأضف ALYR Accounts لعملاء الآجل.» |
| `next` | "We start with the chat. More products will join…" | Replace with "Works with the rest of ALYR": ALYR Bookings — "Appointments from the same chat, with reminders." · «المواعيد من المحادثة نفسها، مع التذكيرات.»; ALYR Agent — "Comes with ALYR Chat: sales against the same days last week, orders waiting." · «يأتي مع ALYR Chat: المبيعات مقارنةً بالأيام نفسها من الأسبوع الماضي، والطلبات المنتظرة.»; ALYR Accounts — "Let regulars put an order on their account." · «دع زبائنك الدائمين يسجّلون الطلب على حسابهم.»; ALYR Payroll — Coming (dashed) |
| `cta.body` | "Tell us how you take orders and bookings today…" | "Tell us how you take orders today. A person from ALYR replies and shows you the same work on your own menu or price list." · «أخبرنا كيف تستقبل الطلبات اليوم. يردّ عليك شخص من ALYR، ويريك العمل نفسه على قائمتك أو أسعارك.» |
| `inside.note` | "ALYR Chat is in early access…" | Keep |

**The two new `/chat` stories** (product wording from 03 §2.2; Arabic chat lines as the product prints them)
- **A customer orders** · «عميل يطلب»
  1. in · "Hi, I'd like to order for pickup" · «السلام عليكم، أبي أطلب للاستلام»
  2. An order word, so ALYR answers — "'Order' is one of the words ALYR answers by itself. Anything else goes to your team." · «كلمة طلب، فتردّ ALYR» — «كلمة «أطلب» من الكلمات التي تردّ عليها ALYR تلقائياً، وما عداها يذهب إلى فريقك.» (`ORDER_WORDS` in `orders/chat.py` includes «أطلب»)
  3. out · "Here is our order page. Pick what you need: …" · «تفضل، اختر طلبك من هنا: …»
  4. in · She orders on the page: no app, no account · «تطلب من الصفحة، بلا تطبيق ولا حساب»
  5. team · "Order #1042 · New · Unassigned" · «الطلب رقم 1042 · جديد · غير مسند»
  6. out · "Order #1042 received." with "Pay here" and "Track your order" · «تم استلام الطلب رقم 1042.»
- **The order moves** · «الطلب يتقدّم»
  1. back · Yusuf presses Confirm → out "Order #1042 is confirmed." · «يضغط يوسف «تأكيد»» → «تم تأكيد الطلب رقم 1042.»
  2. back · Mark ready → out "Order #1042 is ready for collection." · «جاهز» → «الطلب رقم 1042 جاهز للاستلام.»
  3. The tracking page updates by itself · «صفحة التتبّع تتحدّث تلقائياً»
  4. back · Mark done → out "Order #1042 is complete. Thank you." · «مكتمل» → «تم إنجاز الطلب رقم 1042. شكراً لك.»
  - Tracking steps as the page prints them: Order received · Confirmed by the shop · Ready for collection · Complete (C3).

---

## 4. Contact state, and Appendix A: prices

**Contact (now).** Every button is "Email us" / «راسلنا بالبريد» to hello@alyr.qa, with the live subject and the mail body in 2.10. Under main buttons: "A person from ALYR replies." "Our WhatsApp line opens soon" appears once, in the questions (live ruling P1-4). When `NEXT_PUBLIC_ALYR_WHATSAPP` is set, the buttons become "Message us on WhatsApp" (live) with the prefill «السلام عليكم، أبي أعرف كيف تشتغل ALYR مع محلي.» (live).

**Appendix A: when `NEXT_PUBLIC_ALYR_OFFER=on`.** Nothing here shows before the CR (D-034). Numbers from D-035 (migration 0018).

| Where | EN | AR |
|---|---|---|
| Header | Price | السعر |
| Hero fact (replaces the middle fact) | From QAR 449 a month, Agent included | من 449 ر.ق شهرياً، وALYR Agent مشمول |
| Price, eyebrow / H2 (live) | Price · What it costs, in QAR. | السعر · كم يكلّف، بالريال القطري. |
| Price, figure | From QAR 449 a month | ابتداءً من 449 ر.ق شهرياً |
| Under it | for your first product. Each product you add: QAR 150 a month. ALYR Agent is included with every one. | لأول منتج. وكل منتج تضيفه: 150 ر.ق شهرياً. وALYR Agent مشمول مع كل منتج. |
| Examples (ruled rows) | One product, for example ALYR Bookings: from QAR 449 · ALYR Chat and ALYR Bookings: from QAR 599 · Chat, Bookings and Accounts: from QAR 749 · ALYR Agent: included | منتج واحد، مثل ALYR Bookings: من 449 ر.ق · ALYR Chat مع ALYR Bookings: من 599 ر.ق · Chat وBookings وAccounts: من 749 ر.ق · ALYR Agent: مشمول |
| Setup (live) | Setup from QAR 1,500, quoted at your visit. | ورسوم تجهيز تبدأ من 1,500 ر.ق، ونحدد مبلغها خلال زيارتنا لك. |
| Includes (live, changed) | Every month includes your products, ALYR Agent and the Sunday report, sign-ins for your team, a person from ALYR when you message, and menu, price and hours changes when you ask. Your monthly price is confirmed in writing at the visit. | يشمل اشتراكك الشهري منتجاتك، وALYR Agent وتقرير الأحد، وحسابات دخول لفريقك، وشخصاً من ALYR يردّ على رسائلك، وتعديل القائمة والأسعار والساعات عند الطلب. ونؤكد لك سعرك الشهري كتابةً خلال الزيارة. |
| Fees, agreement, money back | live, unchanged | live, unchanged |
| New question | **What if I need more than one product?** The first is from QAR 449 a month, and each one you add is QAR 150. ALYR Agent comes with all of them. | **وإن احتجت أكثر من منتج؟** الأول من 449 ر.ق شهرياً، وكل منتج تضيفه بـ150 ر.ق، وALYR Agent مشمول معها كلها. |
| `/agent` question | Do I pay for ALYR Agent? No. It is included with every ALYR product. | هل أدفع مقابل ALYR Agent؟ لا، فهو مشمول مع كل منتجات ALYR. |
| Product page fact (Chat, Bookings, Accounts) | From QAR 449 a month, or QAR 150 added to another ALYR product | من 449 ر.ق شهرياً، أو 150 ر.ق إضافة إلى منتج آخر من ALYR |

"From" stays because prices are set per client (D-032).

---

## 5. Claims

"Built" means it works on the simulator or the test number; no business uses ALYR yet. **Branch** means built on `aly-agent-dashboard`, not merged.

| # | Claim, as worded | Where | State | Source | Condition |
|---|---|---|---|---|---|
| 1 | ALYR sets up and looks after the technology, in your shop | Hero, how it works | Founder's offer, live since 17 Oct | D-034 | Customers can be signed only after the CR (D-034) |
| 2 | Products share one workspace, one customer list, one team | Suite, hero | Built | D-027, `catalog.py` | — |
| 3 | You choose the products you need; start with one | Suite, Q2 | Built (products on and off) | D-027, D-035 | — |
| 4 | ALYR Agent comes with every product | Everywhere | Built (catalogue status `included`) | D-035, `catalog.py` | The founder may still change the default (00) |
| 5 | One sentence on the week, against the same days last week | Hero, spotlight, `/agent` | Branch | `view.py`, A1–A2 | Merge ALY-99 before publishing |
| 6 | Needs you now: waiting 10 min, unconfirmed 15 min, visits not marked; clears when done | Spotlight, `/agent` | Branch | `insights.py` | Merge |
| 7 | Up to three suggestions, each with its rule, opening the rows it counted | Spotlight, `/agent` | Branch | `insights.py`, build log stage 4 | Merge |
| 8 | Percentage only when both weeks have 20 or more | `/agent`, Q3 | Branch | `view.py`, A3 | Merge |
| 9 | "Not now" until its numbers change or Sunday | `/agent` | Branch | migration 0019 | Merge |
| 10 | Nothing is sent until you press Send reminders | `/agent` | Built | `insights.py` (the card's action is the link `/app/ledger?show=overdue`; sending is the ledger screen's button) | — |
| 11 | The real screen; ALYR computed every number from the samples | Spotlight | Branch | `agent_samples.py`, `test_agent_samples.py` | Regenerate fixtures after any engine change |
| 12 | Sunday report at 9:00 on WhatsApp, one section per product; REPORT for the rest | How it works 4, callout 6, `/agent` | Built, API only, never sent to an owner | D-030, `report.py` | **[G]** `weekly_report` template approved on Meta, and one report seen arriving |
| 13 | Order page from the chat, no app, no account | Suite, `/chat` | Live (test number) | 03 §1.1 | — |
| 14 | Each order has its own tracking page | Suite, `/chat` | Built | ALY-73 | After 24 h a notice arrives without the link |
| 15 | Your whole team answers from one inbox / on one number | Suite, live hero | Built on ALYR's test number | D-021 | **[G]** a shop's own number cannot be connected yet (ALY-39) |
| 16 | Payment links; live card payments once your account is connected | Suite, `/accounts` | Stand-in page only | ALY-17 | Keep the caveat wherever links appear |
| 17 | Bakery sample "QAR 3,706 paid through ALYR links" | Hero figure | Sample of a stand-in | `bakery.*.json` | Hide that row on the public figure until ALY-17 |
| 18 | Free times from opening hours; two customers never take the same slot | `/bookings` | Built | migration 0010 `bookings_no_overlap` | — |
| 19 | Staff see their own work and no shop-wide money | `/agent` only | Branch, Agent screen only | 02 §9 | Never say it beyond this screen: Orders, Credit accounts and the API still show money to agents |
| 20 | Confirmation at once; reminder 2 hours before | `/bookings`, suite | Confirmation live; reminder built | `bookings/service.py` | **[G]** after 24 h needs the approved `booking_reminder` template |
| 21 | A cancelled booking is never reminded; the time is free again | `/bookings` | Built | `service.py` (reminder skip), constraint `where status = 'booked'` | — |
| 22 | "my booking" to see or cancel | `/bookings` | Built | `bookings/chat.py` | — |
| 23 | One booking at a time per business | `/bookings`, by business, Q6 | True (a limit) | 01 D honesty flag | Change when ALY-27 ships |
| 24 | Came / No-show in one tap; no-show figures come from them | `/bookings` | Built | `Screens.tsx`, `insights.py` | — |
| 25 | Bookings works without Chat; comes with the inbox | `/bookings` Q | Built | D-035 shared modules | — |
| 26 | We enter your existing bookings / balances at setup | `/bookings`, `/accounts` Q | Possible by hand, not promised | — | **[F]** founder agrees ALYR does this |
| 27 | Clinics: appointments, not patient records | By business, `/bookings` | True of the product | — | **[F, legal]** clinic bookings may be health data under Law No. 13 of 2016; ask the lawyer (ALY-51) before marketing to clinics |
| 28 | Record a credit sale with one line from the staff phone; the customer is told | `/accounts` | Built | `ledger/chat.py`, `entry_notice` | — |
| 29 | Three tones by age: under 60, 60+, 90+; reminders to accounts 30+ days old | `/accounts` | Built | `reminder_tier`, `send_reminders` | — |
| 30 | Promise pauses reminders 7 days; passed promise shows in Agent | `/accounts` | Built; the Agent half on branch | `PROMISE_DAYS`, insight `promise_passed` | Merge |
| 31 | Never reminded twice within 3 days | `/accounts` | Built | `REMINDER_COOLDOWN_DAYS` | — |
| 32 | Oldest debt settled first | `/accounts` | Built | `ageing.age()` | Ageing counts days in UTC |
| 33 | Orders on account, refused over the credit limit | `/accounts` | Built | `orders/service.py` | Limits are set by ALYR (no screen) |
| 34 | Stop means stop; consent recorded | Trust, pages | Built | D-020 | — |
| 35 | Records kept apart inside the database | Trust | Built | forced RLS | — |
| 36 | WhatsApp's official Business Platform | Trust | Yes, on a test number | status.md | Never "Meta partner" |
| 37 | Replies in the customer's language; workspace in both | Trust, pages | Built | `router.py` | Arabic unreviewed (ALY-66) |
| 38 | No commission | Q13 | Yes, by the pricing model | D-007 | — |
| 39 | A person from ALYR replies (email) | Every button | True while the founder answers | D-034 | **[G]** a test mail from outside reaches hello@alyr.qa (ALY-74 is still on the founder's list) |
| 40 | Early access; go-live date agreed at the visit | How it works | Yes | 07 P1-1 | — |
| 41 | From QAR 449, +QAR 150 each, Agent included; setup from QAR 1,500 | Appendix A | Decided | D-034, D-035 | Off until the CR |
| 42 | Restaurants: no table bookings | By business | True (a limit) | 02-messaging row 2 | — |
| 43 | Cash at the counter is not recorded | `/agent` | True (a limit) | 02 §1 | — |
| 44 | ALYR Payroll: coming | Menu, rows | Listed in the catalogue, not built | D-035 | No features, no date, no page |
| 45 | Sample businesses are fictional | Captions | Yes | seeds, 07 P1-15 | Founder's manual name check for Qirfa still open; do the same for Sadaf and Ruwaa |

**Do not say**, added to 03 §3 for the suite: "AI", "smart", "intelligence" (including "business intelligence"), "learns", "predicts", "forecast", "assistant", "agentic", "health score", "top performer"; projected revenue ("Booked value ahead" uses today's prices: say so); "statements" for ALYR Accounts (not built; `catalog.py`'s summary says it, a product-lane fix); "your data stays in Qatar"; parallel chairs or per-stylist calendars in any drawing.

---

## 6. Arabic

Modern Standard throughout, as on the live site. Western digits. Every amount is the number, a space, then «ر.ق», inside `<bdi>`: «449 ر.ق».

### 6.1 Terms

| Idea | Use | Avoid |
|---|---|---|
| Orders | الطلبات | |
| Bookings (module, screen) | الحجوزات; a single one is «حجز», the time is «موعد» | |
| Credit accounts | الحسابات الآجلة; the sale «البيع بالآجل» | حسابات الآجل (on `/chat` today: align) |
| Workspace | مساحة العمل | |
| Setup | التجهيز (the fee too). «الإعداد» only inside product screens | |
| Team inbox | صندوق الفريق; the screen «المحادثات» | الوارد (on `/chat` today: align) |
| Order tracking | تتبّع الطلب | متابعة الطلب (means "looked after") |
| Payment links | روابط الدفع | |
| Reminder | تذكير | |
| No-show / came | الغياب، لم يحضر / الحضور، حضر | |
| Owed to you | المستحق لك؛ «من عليه مستحقات لك» | ديون (blunt) |
| Promise to pay | وعد بالسداد | |
| Regular customer | زبون دائم (the engine's word) | |
| Needs you now / Done for you | يحتاجك الآن / أنجزته ALYR لك (the component's labels) | |
| Rule | القاعدة | خوارزمية |
| Early access / coming / not yet | إطلاق مبكر / قريباً / لم يتوفر بعد | وصول مبكر |
| Fictional | غير حقيقي (live) | افتراضي (also means "default" and "virtual" on a tech page) |
| Owner-run businesses / your business | المنشآت التي يديرها أصحابها / نشاطك | |

**Grammar.** ALYR, the company, is feminine («تجهّز ALYR»). Every product name is masculine singular, as «المنتج» («يأتي ALYR Agent», «يعمل ALYR Bookings»), including the plural-looking "Bookings" and "Accounts". «عيادة» takes feminine agreement in captions («عيادة غير حقيقية»). Write «صباح كل يوم أحد», never «كل أحد», which also reads "everyone" (07 P1-2). A conjunction or preposition before a Latin name takes a no-break join, as `copy.ts` does with «لـ\u00a0ALYR»; where a list allows it, use commas instead of «و» before a Latin name.

### 6.2 "Agent" in Arabic: the recommendation

**Keep the Latin name "ALYR Agent" and its descriptor «نشاطك بالأرقام» ("your business in numbers"). Never translate "Agent".**

- **Not «وكيل».** In Gulf business Arabic «الوكيل» first means a commercial agent or exclusive distributor, a status registered under Qatar's commercial agency law, and «وكالة» is a power of attorney. On a product page it says ALYR acts for the owner in law and handles his money, which contradicts the non-custodial rule. In 2026 tech Arabic, «وكيل» also stands for an AI agent, which the founder's rule forbids implying.
- **Not «مساعد».** The product already calls its automatic replies «المساعد» in the inbox, and «مساعد ذكي» is the standard phrase for an AI assistant.
- **Not «مدير أعمال» or «مستشار»:** both promise judgement.
- **Why «نشاطك بالأرقام».** It is already the descriptor in D-035 and `catalog.py`, so the site and the workspace agree with no product change. It says what the owner gets in plain MSA, uses «نشاطك», the live site's word for "your business", and pairs with the `/agent` H1.
- **Its limit, and how the copy covers it.** It describes the numbers, not "what needs you" or the suggestions. Body text carries those with verbs: «يعدّ، ويقارن، ويضع ما يحتاجك أولاً، ويُظهر القاعدة».
- **The company's "business agent" positioning.** Say it in Arabic with «نيابةً عنك» ("on your behalf"), which the product already uses ("messages ALYR sent on your behalf", «أرسلتها ALYR نيابة عنك»). Example: the suite body, «تعمل ALYR نيابةً عنك…».

### 6.3 Arabic in the sample screens (for the product lane)

The hero shows these fixtures on `/ar`, so they are page copy too. Found in `samples/*.ar.json`, fixed in the engine's words, not in the site:

| Fixture | Now | Fix |
|---|---|---|
| salon `needs.unmarked` | «زيارةة لم تُسجَّل» | «زيارة لم تُسجَّل» (double ة) |
| salon, clinic `quiet_regulars.title` | «زبون دائم واحد غابوا أكثر من 30 يوماً» | «زبون دائم واحد غاب أكثر من 30 يوماً» |
| salon, clinic `due_back.title` | «عميل واحد حان موعد عودتهم» | «عميل واحد حان موعد عودته» |
| salon, clinic `repeat_no_show.title` | «عميلان تغيّبوا مرتين ولديهم حجز جديد» | «عميلان تغيّبا مرتين ولديهما حجز جديد» (the dual) |
| salon `repeat_no_show.line` | «Rasha F. محجوز يوم السبت 21:00.» | «موعد Rasha F.: السبت 21:00.» (no gender to guess) |
| bakery `no_show_rate.line` | «5 غياب.» | «5 حالات غياب.» |
| salon, clinic summary | «26 زيارة، وغياب 2.» | «26 زيارة، والغياب: 2.» |
| every `header.greeting` | «مساء الخير يا Huda.» | Arabic name forms in the Arabic seeds: «هدى»، «لميس»، «فارس» |
| `needs` rows with count 2 | "2" + «عملاء بانتظار الرد» | dual wording for 2 («عميلان بانتظار الرد»), as `counted()` does |
| clinic, every row | "customers" / «عملاء» | "patients" / «مراجعون» for `business_type = clinic`, as `visit_noun` already does for appointments |

---

## What was not checked

- No native Arabic speaker has read any of this (ALY-66). The Arabic is a careful draft, not a sign-off.
- The live site beyond its headlines: `copy.ts` on `origin/main` (commit `a6bbf88`) was read in full, and https://alyr.qa was fetched on 17 Oct to confirm the hero, the section titles, the footer and that no price shows. Body text on the rendered page was not compared line by line.
- Whether the `weekly_report` and `booking_reminder` templates are approved on Meta today.
- Whether hello@alyr.qa receives mail from outside.
- The legal question on clinic data (row 27): flagged, not researched with a lawyer.
- Whether the staff-phone parser matches a partial name like "Marina 450 credit" for the `/accounts` demo: use a seeded first name and test it.
- That the trade names Sadaf Salon and Ruwaa Dental Clinic are free in Qatar (the founder's manual check covers Qirfa only).
- Lengths in layout: no line here has been set in the real components at 390 and 1440 px, in either language.
