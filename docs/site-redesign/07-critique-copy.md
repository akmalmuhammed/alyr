# Homepage copy and Arabic: independent critique

17 Oct 2026. Branch `aly-56-homepage-2026`, PR #45. Read against `00`–`05`, `docs/brand.md`, `copy.ts` and the built pages at `localhost:3105` (rendered text, `aria-label`s, meta, social card). Screenshots are in `review/copy/`. No code was edited.

**Counts: 5 P0, 15 P1, 14 P2.** Keys are under `home.` unless they start with `meta`, `contact`, `footer`, `fig` or `product`. "EN" is `en`, "AR" is `ar`. Replacement strings are given exactly; where a line exists in both languages, both are given.

**Rule for every Arabic change marked (product).** The drawings copy the product's own strings (`apps/web/app/(product)/…`, `fmt_qar`). Where I change one, open a product-lane ticket to make the same change, so the drawing stays true to the product.

---

## P0: untrue, legally risky, or against a founder decision

### P0-1. `/chat` ships claims the homepage must not make
**Where.** `/chat` and `/ar/chat`. Out of this PR's copy diff, but the same deploy publishes them, and the homepage links there ("ALYR Chat" in the nav, "See ALYR Chat"). Keys: `product.facts`, `product.flow` ("WhatsApp's rules, handled"), `product.inside.note`, `product.why`, `meta.chat.description`.
**Now.** "Keep your number… The app stays on your phone." · "Paid straight to you… your own gateway account" · "Free replies for 24 hours" · "We connect it to your number when we set you up." · "on the number you already use" · "A local team" · "Why owners choose it" · "clinics, salons" in the meta description.
**Why.** Every one of these is in the "must not claim" list in 03 §3 (C5, C17): there is no number connection, no gateway, no team, and no owners yet.
**Fix, either:** (a) publish without `/chat` for now: drop it from `scripts/build-site.sh`, point the nav item and `rail.link` to `#what`; or (b) swap these strings:

| Key | EN | AR |
|---|---|---|
| `product.facts[*]` "Keep your number" (title / body) | "Your number, agreed at setup" / "Which number your customers message is agreed with you at setup. We go through Meta's requirements with you first." | «رقمك، نتفق عليه عند التجهيز» / «نتفق معك عند التجهيز على الرقم الذي يراسلك عليه عملاؤك، ونراجع معك متطلبات Meta أولاً.» |
| `product.facts[*]` "Paid straight to you" | "Built never to hold your money" / "Payment links are built and tested on a test page. Real payments will go through your own account with a Qatari payment provider; that connection is not live yet." | «لا تحتفظ بأموالك» / «روابط الدفع جاهزة ومجرّبة على صفحة تجريبية. وسيمرّ الدفع الفعلي عبر حسابك لدى مزوّد دفع قطري، وهذا الربط لم يبدأ بعد.» |
| `product.flow…` "WhatsApp's rules, handled" body | "Ordinary replies for 24 hours after a customer writes, approved wording after that. ALYR picks the right one each time." | «ردود عادية خلال 24 ساعة من رسالة العميل، وبعدها صياغة معتمدة. وتختار ALYR المناسب في كل مرة.» |
| `product.inside.note` | "ALYR Chat is in early access. Everything listed here is built. We agree your number with you when we set you up." | «ALYR Chat في مرحلة الإطلاق المبكر. كل ما في هذه القائمة جاهز، ونتفق معك على الرقم عند تجهيزه لك.» |
| `product.why.eyebrow` | "Why it helps" | «كيف يفيدك» |
| `product.why.pillars` "Easy" body | "We set it up for you. Your customers need no new app." | «نجهّزه لك، وعملاؤك لا يحتاجون تطبيقاً جديداً.» |
| `product.why.pillars` "Trusted" body | "A person from ALYR, in Arabic and English, on WhatsApp's official Business Platform." | «شخص من ALYR، بالعربية والإنجليزية، على منصة واتساب للأعمال الرسمية.» |
| `meta.chat.description` (end) | "…For restaurants, cafes, shops and home services in Qatar." | «…للمطاعم والمقاهي والمحلات والخدمات المنزلية في قطر.» |

`/chat` also has "Tue 14 Oct" (a Wednesday, C7), Eastern digits in Arabic, and real Qatari family names (Al-Kuwari, Al-Emadi, Al-Naimi). Those are P1 for the later `/chat` PR.

### P0-2. "Payments in the chat" is stated as true in the most-read lines
**Where.** `meta.home.description` (also the Google snippet and the WhatsApp link preview), `hero.body`, `does.body`, `does.product.line` (shown twice), EN and AR.
**Now.** "orders, bookings and payments in the chat" · "Sell, book and get paid in the chat." · "turns the WhatsApp messages you already get into orders, bookings and payments."
**Why.** There is no gateway (03 §0.4, claims row 3). Only the Payment links module says so, far below the hero. "Turns messages into orders" also suggests the product reads messages, which is the old Zaitoon claim (C1) and edges toward implying AI. The product actually replies with a link.
**Replace.**
- `meta.home.description` EN: "ALYR sets up and looks after the technology for owner-run businesses in Qatar. First, ALYR Chat: orders and bookings in the WhatsApp chat, set up in your shop. From QAR 449 a month, plus setup."
- AR: «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتولى متابعتها. أول منتجاتها ALYR Chat: الطلبات والحجوزات داخل محادثة واتساب، ونجهّزه لك في محلك. من 449 ر.ق شهرياً، إضافة إلى رسوم التجهيز.»
- `hero.body` EN: "ALYR sets up and looks after the technology for owner-run businesses in Qatar. We start with your WhatsApp: orders and bookings in the chat, and your whole team on one number. Payment links follow once card payments are live."
- AR: «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر، وتتولى متابعتها. ونبدأ معك من واتساب: الطلبات والحجوزات داخل المحادثة، وفريقك كله على رقم واحد. وتأتي روابط الدفع حين يبدأ الدفع بالبطاقات.»
- `does.product.line` EN: "Orders, bookings and one team inbox, in the chat." AR: «الطلبات والحجوزات وصندوق واحد للفريق، داخل المحادثة.»
- `does.body` EN: "ALYR products share one workspace, one customer list and one team, and you switch on what you need. The first, ALYR Chat, answers the WhatsApp messages you already get with an order page and a booking page, and with a payment link once card payments are live."
- AR: «منتجات ALYR تتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً، وتفعّل منها ما تحتاجه. وأولها ALYR Chat، الذي يردّ على رسائل واتساب التي تصلك أصلاً بصفحة للطلب وصفحة للحجز، وبرابط دفع حين يبدأ الدفع بالبطاقات.»

### P0-3. The refund is stated as "your money back", without its limit
**Where.** `trust.closing`, EN and AR. Also `faq.items[price].a`.
**Now.** "And if the first month doesn't deliver what we agreed, you get your money back." · AR «…نعيد لك مبلغك.» · FAQ: "you get the month back."
**Why.** The founder's decision refunds the first month's subscription, not the setup fee. An owner who paid QAR 1,500 for setup plus QAR 449 reads "your money back" as all of it. Qatar penalises misleading claims (02 §3.6).
**Replace.**
- `trust.closing` EN: "And if the first month misses the result we agreed, you get that month's subscription back." AR: «وإن لم يحقق الشهر الأول النتيجة التي اتفقنا عليها، نعيد لك اشتراك ذلك الشهر.»
- `faq.items[price].a` EN: "It is a real cost, which is why your first month comes with a result we agree in advance. If we miss it, you get that month's subscription back." AR: «صحيح أنه مبلغ له وزنه، ولهذا نتفق معك مسبقاً على نتيجة لشهرك الأول. وإن لم نحققها نعيد لك اشتراك ذلك الشهر.»
- `price.agreement.body`: see P1-4.

### P0-4. "Setup is part of every plan" says setup is included
**Where.** `included.body`, EN and AR («التجهيز جزء من كل باقة»).
**Why.** It contradicts "Setup from QAR 1,500, quoted at your visit." Read quickly, "part of every plan" means included in the price. "Every plan" also implies several plans; there is one. "We look after the rest of your tech" is unbounded for QAR 449, and the founder has not confirmed the scope (open question 7).
**Replace.** EN: "We do the setup ourselves, in your shop. It is never a job we leave to you. And while you subscribe, we help with the rest of your tech too." AR: «نتولى التجهيز بأنفسنا في محلك، ولا نتركه عليك. وطوال اشتراكك نساعدك في بقية أمورك التقنية أيضاً.»

### P0-5. Lines that are untrue until a step outside the code is done
- `price.agreement.print`: "The terms are written into your agreement." No agreement exists yet (05, open question 1). The whole agreement figure and `trust.closing` go live only once it does. This is the brief's publish-time check: list it as a blocking item in the PR, not a note.
- `hello@alyr.qa` is the only way in, and its forwarding is unconfirmed (open question 3). Send a test mail from outside before publishing.
- Arabic native review (ALY-66) is a launch blocker in 03 §3. This critique is a review, not a sign-off by a named native reviewer.

---

## P1: should fix

### P1-1. Early access is never said where the owner decides
"Early access" appears only as two small chips in the Carbon band. The hero, "How it works" and the price never say it, and step 3 ("You go live") reads as available now. Today no business can go live: number connection (ALY-39) is not built, and the workspace is not hosted. 03 §3's general rule asks for early-access framing. Add a new key `how.note` under the steps, and put the same line under the price:
- EN: "ALYR Chat is in early access. We set it up with each business ourselves, and agree your go-live date at the visit."
- AR: «ALYR Chat في مرحلة الإطلاق المبكر. نجهّزه مع كل منشأة بأنفسنا، ونتفق معك على موعد بدء التشغيل خلال الزيارة.»

Also `does.product.state` and `does.rail.state` AR: «وصول مبكر» is the Steam-game phrase. Use «إطلاق مبكر».

### P1-2. The Sunday report is described as a running fact
`does.also.items[2].body` and `how.steps[3].body`. 03 §3 lists "every Sunday on your phone" as a fact the page must not state; the report has never been sent. Outside the 24-hour window it is one line until the owner replies REPORT. With P1-1's early-access line, use:
- `does.also.items[2].body` EN: "Every Sunday morning, a short report of last week on your WhatsApp: orders, bookings, money collected, and customers who wrote." AR: «صباح كل يوم أحد يصلك على واتساب تقرير قصير عن الأسبوع الماضي: الطلبات والحجوزات والمبالغ المحصّلة والعملاء الذين راسلوك.»
- `how.steps[3].body` EN: "Every Sunday a short report of your week arrives on WhatsApp. Want something changed? Message us and we change it." AR: «صباح كل يوم أحد يصلك تقرير أسبوعك على واتساب. تحتاج تعديلاً؟ راسلنا ونعدّله لك.»

The AR fix matters on its own: «كل أحد» can also mean "everyone" («كل أحد تصلك أرقامك» can read as "everyone gets your numbers").

### P1-3. The price section is not readable at a glance
1. **The headline contradicts the content.** "One clear price, in QAR." sits above a "from" price and a separate setup fee. EN: "What it costs, in QAR." AR: «كم يكلّف، بالريال القطري.»
2. **The order of the price on the sheet.** EN shows "FROM / 449 / QAR A MONTH" (`en-1440-price.png`), but the founder's wording is "From QAR 449 a month", and every other English amount is "QAR 38". Put `currency` before `amount` in the English layout. AR is correct («ابتداءً من 449 ر.ق شهرياً»).
3. **"From" has no reason.** An owner asks what makes it more than 449, and whether Credit accounts (shown under "Also in your workspace") is included. Ask the founder. Until he answers, add to `price.includes`: EN "Your monthly price is confirmed in writing at the visit." AR «ونؤكد لك سعرك الشهري كتابةً خلال الزيارة.»
4. **`price.includes`** says "changes whenever you ask" (changes to what?) and leaves out the person who answers. EN: "Every month includes ALYR Chat, sign-ins for your team, your Sunday report, a person from ALYR when you message, and menu, price and hours changes when you ask." AR: «يشمل اشتراكك الشهري ALYR Chat، وحسابات دخول لفريقك، وتقرير الأحد، وشخصاً من ALYR يردّ على رسائلك، وتعديل القائمة والأسعار والساعات عند الطلب.»
5. **One-time.** Nothing says setup is paid once. With the founder's agreement, EN `price.setup`: "One-time setup from QAR 1,500, quoted at your visit." AR: «ورسوم تجهيز لمرة واحدة تبدأ من 1,500 ر.ق، ونحدد مبلغها خلال زيارتنا لك.» Without his agreement, keep EN as it is and use AR: «ورسوم تجهيز تبدأ من 1,500 ر.ق، ونحدد مبلغها خلال زيارتنا لك.» («نحددها معك» reads as a negotiation; "quoted" means ALYR states the price.)

### P1-4. The money-back terms are worded differently in different places
- `price.agreement.body` says "in your first 30 days" and "we refund your first month". The decision is 30 days from go-live, subscription only. EN: "Before we start, we agree one result with you, for example a number of orders or bookings taken through the chat in the 30 days after you go live. If we don't reach it, we refund your first month's subscription." AR: «قبل أن نبدأ نتفق معك على نتيجة واحدة، مثل عدد الطلبات أو الحجوزات عبر المحادثة خلال 30 يوماً من بدء التشغيل. وإن لم نحققها نعيد لك اشتراك الشهر الأول.»
- `fields[Your part]`: "Share" does not say with whom, or how it is checked. The founder must define it for the agreement. Suggested EN: "Put up your QR codes and share your chat link with customers in the first week." AR: «أن تضع رموز QR في محلك وتشارك رابط المحادثة مع عملائك في الأسبوع الأول.»
- `fields[Counted]` AR label «طريقة العدّ» (the method) does not fit its value (a place). Use «أين تُحسب».
- `how.steps[2].title` AR «تبدأ العمل.» says the owner starts working, as if he had not been. The agreement counts from «بدء التشغيل», so use the same term: «يبدأ التشغيل.»

### P1-5. Availability and language promises nobody has agreed
- `included.month.items[1]` "A person from ALYR, whenever you message" (AR «متى راسلتنا») promises any-hour cover. EN: "A person from ALYR answers your messages". AR: «شخص من ALYR يردّ على رسائلك».
- `faq.items[busy-night].a` "Message us and a person from ALYR answers", under "on a busy night", implies night support, and support hours were left open ([F]). "So orders are not lost" is absolute. EN: "Message us and the person who set you up picks it up. Behind the scenes, every message is saved before it is sent and tried again if WhatsApp is slow, so a slow moment doesn't lose it." AR: «راسلنا ويتولى الأمر الشخص الذي جهّز لك النظام. وفي الخلفية تُحفظ كل رسالة قبل إرسالها، ويُعاد إرسالها إن تأخر واتساب، فلا تضيع في لحظة بطء.»
- `contact.reply` and `final.body` promise replies "in Arabic or English". The brief removed the language promise from training ("no language promise"). The founder must confirm he can reply in written Arabic; if not, remove "in Arabic or English" from both. `final.body` also says "show you ALYR on your own menu or price list", which means preparing a demo before the visit; step 1 says "on your own phone". Align them: EN "Send us a message. A person from ALYR replies, then comes to show you ALYR on your own phone." AR: «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR على هاتفك أنت.»

### P1-6. Three FAQ answers imply more than is true
- `faq[whatsapp-business].a` "Keep using WhatsApp." reads as "your WhatsApp Business app keeps working". That is unverified (claims row 16). EN: "Your customers keep using WhatsApp. ALYR adds what the app doesn't have: an order page, bookings, payment links and one inbox for your whole team, so orders stop ending up on paper. Which number they message, and what that means for the app on your phone, we go through with you at the visit." AR: «عملاؤك يواصلون استخدام واتساب. وتضيف ALYR ما لا يوفّره التطبيق: صفحة طلب، وحجوزات، وروابط دفع، وصندوقاً واحداً لفريقك كله، فلا تنتهي الطلبات على الورق. أما الرقم الذي يراسلك عليه عملاؤك، وما يعنيه ذلك للتطبيق على هاتفك، فنراجعه معك خلال الزيارة.»
- `faq[data]` asks "Is this approved?" and the answer names no approval, so it reads as a yes. ALYR is not registered and not a Tech Provider. Drop the second question. Q EN: "Is my data safe?" A EN: "Each business's records are kept apart inside the database itself, and ALYR uses WhatsApp's official Business Platform. ALYR is built never to hold your money." Q AR: «هل بياناتي آمنة؟» A AR: «سجلات كل منشأة مفصولة داخل قاعدة البيانات نفسها، وتستخدم ALYR منصة واتساب للأعمال الرسمية. وصُمّمت ALYR بحيث لا تحتفظ بأموالك أبداً.»
- `faq[contract]` "Is there a contract? Month to month." The page also says there is a written agreement. AR adds «ملزم», which the EN does not have. Q EN: "Am I tied in?" A EN: "No. There is a written agreement, but it runs month to month. You can stop at the end of any month." Q AR: «هل أنا ملزم بمدة طويلة؟» A AR: «لا. بيننا اتفاق مكتوب، لكن الاشتراك شهري، ويمكنك إيقافه في نهاية أي شهر.»

### P1-7. Message fees: check before publishing
`faq[message-fees].a` says Meta charges "mostly reminders and notices sent more than 24 hours after…". Meta's own pricing page, fetched today, still says non-template messages are free. Several vendors (Zoho, AiSensy, EngageLab) report that service messages are billed from 1 Oct 2026 beyond 1,000 a month per number. The sample report itself shows about 1,500 messages a month. Use wording that stays true either way. EN: "Meta charges for some WhatsApp messages, at its own rates, and decides which ones. Meta bills you directly, and ALYR adds nothing. We go through the current rates with you at the visit." AR: «تحتسب Meta رسوماً على بعض رسائل واتساب بأسعارها، وهي التي تحدد أي الرسائل تُحتسب. وتصلك فاتورتها من Meta مباشرة، ولا تضيف ALYR شيئاً. ونراجع معك الأسعار الحالية خلال الزيارة.»

### P1-8. One currency rule on `/ar`: amount, then «ر.ق»
At present the AR order page shows «QAR 8» on the item rows and «QAR 38» in the bar, directly above «ادفع 38 ر.ق» (`ar-1440-hero.png`, first screen). Chat lines, the booking meta and the report also use «QAR». **Rule:** on `/ar`, every amount is Western digits, a space, then «ر.ق», wrapped in `<bdi>`: «38 ر.ق», «1,500 ر.ق». This is how Qatari Arabic reads ("38 riyals"). It matches the page's own «449 ر.ق» and the product's buttons, and it leaves no Latin on `/ar`. (product: make `fmt_qar` language-aware.)
- `hero.figure.order.money` AR: «{n} ر.ق»
- `sample.chat.placed.lines` AR: «2 × مناقيش زعتر  16 ر.ق» · «1 × كيكة الزعفران، قطعة  22 ر.ق» · «الإجمالي: 38 ر.ق» (use × rather than a Latin x)
- `sample.chat.receipt` AR: «تم استلام 38 ر.ق للطلب رقم 1043. شكراً لك.»
- `sample.booking.services[0].meta` AR: «30 دقيقة · 50 ر.ق»
- `how.report.sections[0].lines[0]` AR: «طلبات وصلتك: 64، بقيمة 2,310 ر.ق (الأسبوع الماضي 52)»

### P1-9. «3 صنف» is wrong Arabic, on the first screen
`hero.figure.order.count` AR has «{n} صنف» for every n. Arabic needs «3 أصناف», «صنفان» and «11 صنفاً». The type has only one/other, so use a form that is correct for every number: one «الأصناف: {n}», other «الأصناف: {n}». (product: `s/[slug]/page.tsx` has the same error.)

### P1-10. ALYR changes gender in Arabic
The page treats ALYR as feminine (a company: «تعمل ALYR», «لا تأخذ ALYR»), but `contact.subject` says «كيف يعمل ALYR» and `contact.prefill` says «يشتغل ALYR».
- `contact.subject` AR: «كيف تعمل ALYR مع محلي»
- `contact.prefill` AR (the owner's own voice, so Gulf dialect is right): «السلام عليكم، أبي أعرف كيف تشتغل ALYR مع محلي.»

Keep the masculine for ALYR Chat (a product).

### P1-11. One Arabic word per idea
- **Tracking.** The page uses «متابعة الطلب» (module title, captions 04 and 10) and «تتبّع الطلب» (the product page). «متابعة/يتابعه» already means "looked after", so a reader cannot tell the two apart. Use «تتبّع» for tracking: `does.modules[track].title` «تتبّع الطلب»; `.caption.text` «صفحة تتبّع الطلب»; `trust.figure.caption.text` «صفحة تتبّع الطلب نفسها بالعربية والإنجليزية»; `.body` «لكل طلب صفحة خاصة به، تُظهر كل خطوة ومن يتولاه. فتقلّ رسائل «وين طلبي؟».»
- **Setup.** Use «تجهيز» for ALYR's service and the fee everywhere. «إعداد» stays only inside product screens.
- **Shop.** Use «المحل» in page text. «المتجر» appears only in the product's tracking step (product).
- **Order number.** `hero.figure.record.title` AR «الطلب 1043» → «الطلب رقم 1043», as in every other place.

### P1-12. The Arabic hero headline is in dialect; the brief asks for Modern Standard
`hero.title` AR «خلّ شغلك رقمي. / بدون فريق تقنية.» is Gulf dialect. In Modern Standard, «رقمي» would also need the accusative («رقمياً»). The body under it is Modern Standard, so the register switches mid-screen. Recommended: «تحوّل رقمياً.» / «بلا فريق تقنية.» («التحوّل الرقمي» is the term Qatari owners hear from government programmes.) `meta.home.title` AR: «ALYR · تحوّل رقمياً بلا فريق تقنية». If the founder prefers the Gulf voice, keep the current line as a deliberate exception and record it in brand.md.

### P1-13. Sample customer name
"Aisha Al-Kuwari" / «عائشة الكواري» uses a prominent Qatari family name in six keys: `hero.figure.order.customer`, `hero.figure.record.customer`, `sample.inbox.customer`, `sample.booking.customer`, and `sample.rows.*.name`. Use a first name and a father's name, as Gulf names are often given, which points to no family: **"Aisha Hamad" / «عائشة حمد»**. The initial in the inbox stays «ع» / "A". The product seed's "Ahmed Al-Kuwari" needs the same change (product).

### P1-14. Stepper `aria-label`s mix verb forms
`hero.figure.order.add/more/less/max` AR «أضف: …» (an imperative) sits next to «إضافة واحد: …» (a noun), and «واحد» needs the accusative. Use add «أضف {item}», more «أضف واحداً: {item}», less «أنقص واحداً: {item}», max «{item}: الحد الأقصى في هذا المثال 9.»

### P1-15. Demo business check (Qirfa Bakery / «مخبز قرفة»)
Web searches today, in English and Arabic, found no bakery, cafe or brand called Qirfa, Qerfa, Girfa or Kirfa, and no «مخبز قرفة» or «قرفة» cafe in Doha, Qatar, the UAE, Saudi Arabia or Kuwait. The nearest names are Cinnabon branches, Qaf Coffee in Alkhobar, and the KARAFA coffee brand. Search engines index Instagram and Google Maps poorly, so before publishing, check both by hand, plus Qatar's trademark register. The Arabic reads well: short, warm, and an obvious bakery flavour. The root ق ر ف also gives «قرف» (disgust), but «قرفة» is so well established as cinnamon that the risk is low. (The Gulf dialect word is «دارسين»; the Modern Standard word suits a Modern Standard page.) Fix the monogram: `hero.figure.order.monogram` and `sample.monogram` AR «م» is the initial of «مخبز», which every bakery shares. Use «ق».

---

## P2: polish

| # | Key | Now | Replace (EN / AR) | Why |
|---|---|---|---|---|
| 1 | `included.title` | "You run the business. We do the tech." | "Setup, training and changes: we do them." / «التجهيز والتدريب والتعديلات: كلها علينا.» | The third use of the brand line (hero, footer, social card). The heading should name the section |
| 2 | `hero.how`, `does.rail.link` AR | «شاهد كيف يعمل», «شاهد ALYR Chat» | «تعرّف على طريقة العمل», «تعرّف على ALYR Chat» | «شاهد» means "watch", but there is no video |
| 3 | `how.eyebrow`, `nav.how` AR | «كيف يعمل» | «كيف نعمل» | The steps are ALYR's actions |
| 4 | `how.title` AR | «من الزيارة الأولى إلى أول طلب.» | «من أول زيارة إلى أول طلب.» | Parallel structure |
| 5 | `how.steps[1].body` AR | «ندخل قائمتك…» | «نضيف قائمتك أو خدماتك وأسعارك بالعربية والإنجليزية، ونضبط ساعات العمل، ونعطي كل موظف في فريقك حساب دخول خاصاً به.» | «ندخل» also reads "we come in" |
| 6 | `problem.eyebrow` AR | «مألوف لك؟» | «مواقف تعرفها» | A literal translation of "Sound familiar?" |
| 7 | `problem.rows[0]`, `[1]` AR | «…وبعضها لا يصل أبداً.» · «…من تطبيق آخر.» | «…وبعضها يضيع في الطريق.» · «…فيطلب العميل من تطبيق توصيل بدلاً منك.» | "Arrive… never arrive" contradicts itself; "app" is vague |
| 8 | `problem.strong/muted` AR | «لا يحتاج فريق…» / «يحتاج محادثة…» | «كل هذا لا يحتاج إلى فريق تقنية.» / «يحتاج إلى محادثة مجهّزة كما يجب، ومن يتابعها عنك.» | Grammar: «احتاج إلى» |
| 9 | `trust.title`, `.body`, `.facts[0].label` AR | «شركة جديدة. بلا طرق مختصرة.» … | «شركة جديدة. ونعمل بالأصول.» / «نختار الآن أوائل عملائنا في الدوحة، لذلك لن ترى هنا بعدُ شعارات عملاء أو أرقاماً. وإليك ما نستطيع أن نريك إياه بدلاً من ذلك.» / label «الشخص» | A literal idiom that breaks badly at 1440; the label repeated the title |
| 10 | `does.title`, `does.also.items[1].title` AR | «والبداية ALYR Chat.» · «اسم على كل شيء» | «والبداية مع ALYR Chat.» · «لكل شيء مسؤول» | Missing preposition; a literal title |
| 11 | captions, `fig.fictional` AR | «بأسعار للتوضيح» · «مثال لمخبز غير حقيقي» | «بأسعار توضيحية» (also «بسعر توضيحي», «بأرقام توضيحية») · «مخبز افتراضي» | Natural phrasing; avoids saying "for illustration" twice |
| 12 | menu items AR (also in chat and report) | «فطاير جبن» · «معمول تمر، علبة من 6» · «كيك الزعفران، قطعة» | «فطائر جبن» · «معمول بالتمر، 6 حبات» · «كيكة الزعفران، قطعة» | Hamza spelling and menu usage. The EN names stay |
| 13 | `sample.inbox.thread[3]`, `.paused.title` AR | «نعم، الكاملة… أخلي لك وحدة…» · «أنت من يرد» | «أكيد، الكيكة الكاملة بـ 145 ر.ق. أخلّيها لك ليوم الخميس؟» · «أنت تردّ الآن» | One register in the staff message; natural phrasing |
| 14 | `contact.soon` AR; `footer.disclaimer`; `faq[not-technical].a` AR; `included.more.body` AR; `price.ledger` AR; mailto body; social card; `<bdi>` | see the notes | «سيتوفر رقم واتساب الخاص بنا قريباً. وحتى ذلك الحين، راسلنا على» · EN "ALYR uses the WhatsApp Business Platform. ALYR is not affiliated with, or endorsed by, WhatsApp or Meta." / «تستخدم ALYR منصة واتساب للأعمال، وليست تابعة لواتساب أو Meta، ولا معتمدة منهما.» · «ولا تحتاج إلى ذلك. نحن نجهّز كل شيء، وندرّب فريقك، ونعدّل متى طلبت.» · «موقع إلكتروني، أو ملف نشاطك على خرائط جوجل، أو أداة تشترك فيها وتريد ربطها بـ ALYR؟ أخبرنا. المهام الصغيرة ضمن متابعتنا لك، والكبيرة نسعّرها قبل أن نبدأ.» · term «اشتراك شهري. يمكنك إيقافه في نهاية أي شهر.» and commission «لا عمولة. ALYR لا تأخذ أي نسبة من طلباتك.» · new mailto `body` EN "Shop name:\nArea:\nHow orders reach you today:\nBest time to visit:" / «اسم المحل:\nالمنطقة:\nكيف تصلك الطلبات اليوم:\nأنسب وقت للزيارة:» | A number does not "open" («يُفتح»). "Works with WhatsApp Business" names the app, which ALYR is not, and "endorsed" closes the affiliation gap. «لا تحتاج أن تكون» is a literal translation of "You don't need to be". «شهراً بشهر» is a literal translation of "month to month". A mailto body gives the founder what he needs for the visit. `/ar` shares the English-only social card: add IBM Plex Sans Arabic to `opengraph-image.tsx`, or accept it. «الطلب رقم 1043» lacks `<bdi>` in the chat, record and tracking (the brief asks for it). |

**Smaller items, no replacement needed.** "Meta" stays Latin on `/ar` while "WhatsApp" is «واتساب»; either keep "Meta" (clearer legally) or write «ميتا» everywhere, but pick one. "QR" in «رموز QR» is an acceptable exception. The included figure's EN `row.step` "chat · hours" should read "ALYR Chat · hours" to match the AR. The setup checklist's "Each one you finish switches more of it on" is the product's own text but implies self-serve setup (C10) (product). The inbox label "Assistant" could read as AI (product).

---

## Founder decisions: check

| Decision | On the page | Verdict |
|---|---|---|
| "From QAR 449 a month" | Hero facts, meta, social card, FAQ: exact. Price sheet shows "449 QAR" | Fix the order (P1-3) |
| "Setup from QAR 1,500, quoted at your visit" | `price.setup`: exact | Contradicted by `included.body` (P0-4); missing from meta and social card (P0-2 adds it to meta) |
| Month to month | Ledger and FAQ: exact | AR wording is a literal translation (P2-14); the FAQ question conflicts with the agreement (P1-6) |
| Money-back terms | Agreement fields: correct | Summaries overstate the refund (P0-3); the period is worded differently (P1-4) |
| No founder name or photo | None anywhere, including alt text and meta | Pass |
| Email contact state | Header, hero, price, final, sticky bar: hello@alyr.qa, mailto with subject, "A person from ALYR replies." | Pass; forwarding unconfirmed (P0-5); AR subject gender (P1-10) |
| Nothing implies WhatsApp or Meta | No logo or green; disclaimer present; trust says "We are not WhatsApp or Meta." | Pass; tighten the disclaimer (P2-14). `/chat` fails on other claims (P0-1) |
| No AI | No AI wording | Pass, once "turns messages into orders" goes (P0-2) |
| No implied customers | "Choosing our first businesses" | Pass on `/`; `/chat` says "Why owners choose it" (P0-1) |
