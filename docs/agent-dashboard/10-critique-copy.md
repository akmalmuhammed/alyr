# ALYR suite site: copy and Arabic critique

17 Oct 2026. Branch `aly-99-suite-site`, PR #53. I read it against `00`, `07`, `06` (with its claims table), `02`, `01` E and `08`, the earlier rulings (`site-redesign/07`, `08`), `docs/brand.md`, `copy.ts` and the six sample fixtures. I also read the ten pages on localhost:3105, in both languages: the rendered text with every section laid out, the `aria-label`s, the meta, the social card, the Products menu, the feed and the dashboards.

Text dumps and captures are in `review-site/copy/`. The `text-*.json` probes opened every `<details>`, so the first-screen PNGs were then taken again, clean. No code was edited.

**Counts: 2 P0, 10 P1, 32 P2.**

Keys are `copy.ts` paths. "Fixture" means `_agent/samples/*.json`. Those changes belong to the product lane: change the engine or the seed, then regenerate. Replacements are given exactly, EN / AR.

## What already passes

- **Prices off.** With the offer off, no price appears on any of the ten pages, in the meta or on the social card (`factsNoOffer`).
- **Products.** There is no Pay product. ALYR Payroll is shown as "Coming": a dashed row with no link. `/payroll` returns 404 and is not in the sitemap. The screen-reader names are right in both languages.
- **Contact and terms.**
  - The email state is used everywhere, and "Our WhatsApp line opens soon" appears once.
  - "Month to month… with 7 days' notice" is exact in the FAQ and in the offer-only ledger, in both languages.
- **AI wording.** Only one word breaks the rule ("knows", P1-4). There are no sparkles and no "assistant".
- **Clinics.** Nothing mentions clinics, patients or health data.
- **"Not yet" lists.** They cover parallel bookings, the report screen, live payments and statements.
- **Disclaimer.** Every page carries it in both languages, and nothing implies a link to Meta.
- **Customers.** There are no invented customers or metrics, and every sample is captioned.

---

## P0: untrue, legally risky, or against a founder decision

### P0-1. The hero says ALYR Agent replies and reminds. `/agent` says it doesn't.

**Where.** `home.hero.eyebrow`, `.title` (AR), `.body`, `agent.status`, and the social card, which prints the eyebrow.

**Now.** The eyebrow reads "ALYR Agent · At work for you" and the body "Right in your WhatsApp, it replies to the routine, sends the reminders and helps you follow up what's owed." But `pages.agent.faq[messages]` says: "Will it message my customers? No. ALYR Agent shows and suggests… [messages] go from the products you use."

**Why.**
- Both statements cannot be true, and the product agrees with `/agent`: ALYR Chat and ALYR Bookings send the messages, and ALYR Agent counts them.
- "Your WhatsApp" implies the shop's own number, which cannot be connected yet (ALY-39, claim 15).
- "The reminders" also reads as payment reminders, which go out only when someone presses the button.
- At 390 px the first screen shows "agent" with no rule line, which breaks 06 §1 ("agent" never carries a sentence alone; see `phone-home.png`).

The founder's own positioning (00, row 1) is that **ALYR** is the business agent. The truest strong version therefore makes ALYR the agent and ALYR Agent its screen. The English H1 stays as it is.

**Replace (recommended; it changes the founder's eyebrow, so Akmal decides).**
- `home.hero.eyebrow`: "ALYR · At work for you" / «ALYR · تعمل من أجلك»
- `home.hero.title` AR: «صار لنشاطك» / «من يتابعه عنك.»
  - «يعمل عنه» says someone works *instead of the business*. It is the owner who is relieved, and «يتابع» is what the screen does.
- `home.hero.body`: "In the WhatsApp chat, ALYR replies to routine messages, sends booking reminders and helps you follow up what's owed. ALYR Agent puts what needs you on one screen, by rules you can check. We set it up in your shop. You run the business." / «داخل محادثة واتساب، تردّ ALYR على الرسائل المعتادة، وترسل تذكيرات المواعيد، وتساعدك في متابعة المستحقات. ويضع ALYR Agent ما يحتاجك على شاشة واحدة، بقواعد تستطيع مراجعتها. نجهّز كل شيء في محلك، وأنت تدير عملك.»
- `agent.status`: "ALYR · Running" / «ALYR · تعمل»
  - The feed under it is already labelled "What ALYR did this afternoon".

**If the founder keeps "ALYR Agent · At work for you",** this is the least the body must say to stay true: "In the WhatsApp chat, ALYR Chat and ALYR Bookings reply to routine messages and send booking reminders. ALYR Agent counts it all and shows you, on one screen, what needs you, by rules you can check. We set it up in your shop. You run the business." / «داخل محادثة واتساب، يردّ ALYR Chat وALYR Bookings على الرسائل المعتادة، ويرسلان تذكيرات المواعيد. ويعدّ ALYR Agent ذلك كله، ويعرض لك على شاشة واحدة ما يحتاجك، بقواعد تستطيع مراجعتها. نجهّزه لك في محلك، وأنت تدير عملك.» It is weaker: three product names before the first button.

### P0-2. "Sadaf Salon" is a real salon chain's name in the Gulf

**Where.**
- `copy.ts`:
  - `agent.samples.salon` (shop, monogram, announce, feed);
  - `pages.bookings.demo` (business, page shop, chat lines, `alyr.qa/b/sadaf`);
  - `pages.bookings.flow`.
- The product seed (`seed_bookings.py`).

**Found today.** "Sadaf Beauty Ladies Salon" is a chain with several branches in Dubai. It is listed on Fresha, Facebook, 2GIS and magicpin, and Cobone sells its deals in Arabic as «صالون صدف للتجميل النسائي». One search summary also named a «صالون صدف للتجميل» in Umm Salal, Qatar, which I could not confirm.

**Why.** The site shows that name with invented no-shows and "customers who missed twice". That is exactly what the fictional-sample rule exists to prevent.

**Replace.** "Dafira Salon" / «صالون ضفيرة» ("braid"), monogram "DS" / «ض», with the link `alyr.qa/b/dafira`.
- Second choice: "Musht Salon" / «صالون مشط» ("comb").
- Neither name returned a hit in English or Arabic today.
- Both still need the manual Instagram, Maps and trademark check that Qirfa had.

---

## P1: should fix before publishing

**P1-1. The social card says "agent" on its own** (`opengraph-image.tsx`, which reads `home.hero`).
- A WhatsApp link preview has no screen beside it. "Your business just got an agent." with nothing else reads as an AI agent, and 00 forbids implying that. The same is true of the phone's first screen.
- P0-1 changes the eyebrow. Also replace the middle fact, `home.hero.factsNoOffer[1]` (used by the hero and the card): "Every suggestion shows its rule" / «كل اقتراح يُظهر قاعدته».
  - "ALYR Agent with every product" means nothing before the visitor knows the product, and the suite says it anyway.

**P1-2. Payment links read as live.** No payment provider is integrated (ALY-17).
- `home.suite.notes[1].body`.
  - "Live card payments start once your payment account is connected" implies that the owner's account is the only missing step.
  - Replace: "come with ALYR Chat and ALYR Bookings. Today they open a test page; card payments start once a payment provider is connected." / «تأتي مع ALYR Chat وALYR Bookings. وهي اليوم تفتح صفحة تجريبية، ويبدأ الدفع بالبطاقات بعد ربط مزوّد دفع.»
- `home.faq[pay-online].a`.
  - Replace: "They don't have to. Card payment links aren't live yet, and when they are, a link is offered, never forced. Regulars with a credit account can put an order on their account." / «ليس عليهم ذلك. روابط الدفع بالبطاقة لم تُفعَّل بعد، وحين تُفعَّل يكون الرابط خياراً لا إلزاماً. والعملاء الدائمون أصحاب الحسابات الآجلة يسجّلون الطلب على حسابهم.»
- `product.inside.groups[0]` "Pay from a link". It sits under "Everything listed here is built", and `/chat` has no "Not yet" list.
  - Replace the body: "A payment link in the chat, and a receipt the moment it is paid. Built and tested on a test page; card payments are not live yet." / «رابط دفع في المحادثة، وإيصال لحظة السداد. جاهز ومجرّب على صفحة تجريبية، والدفع بالبطاقات لم يبدأ بعد.»

**P1-3. `/accounts` says reminders go out by themselves** (`pages.accounts.hero.lead`).
- They go out only when someone presses Send reminders (02 §4), as the page's own flow shows further down.
- Replace: "Record a credit sale with one line from your staff phone, and the customer is told the new balance. One press sends reminders in a tone that follows the age of the debt, and a promise to pay pauses them." / «سجّل البيع بالآجل بسطر واحد من هاتف الموظف، فيُبلَّغ العميل برصيده الجديد. وبضغطة واحدة تُرسل التذكيرات بنبرة تتدرّج مع عمر الدين، والوعد بالسداد يوقفها.»

**P1-4. "knows" is on 06's no-AI list** (`pages.accounts.flow.stories[0].steps[0].body`).
- Now: "from the phone ALYR knows as staff". Replace with "from a phone registered in ALYR as staff." / «من هاتف مسجّل في ALYR على أنه هاتف موظف.»

**P1-5. The Sunday report is promised as running.**
- The claim appears in:
  - `pages.agent.hero.title[1]` "Daily on your screen, weekly on WhatsApp.";
  - `.report.title`;
  - `home.how.steps[3]`;
  - `/agent` "built" list.
- The report is built but has never been sent, and the `weekly_report` template is not approved (claim 12 [G]; 08, open item 6). An H1 is the worst place for a [G] claim.
- Replace the H1's second line with "What needs you, first." / «وما يحتاجك أولاً.» It is true today, and it names the screen's job, which the current H1 leaves to the lead.
- Unless the template is approved and one report has arrived before publishing, append to `pages.agent.report.body`: " The first reports go out once WhatsApp approves the report's wording." / « وتبدأ أولى التقارير بعد موافقة واتساب على صياغة التقرير.»

**P1-6. "Nasma Cooling" sits next to real names in the same trade.**
- There is no exact "Nasma Cooling" / «نسمة للتكييف». But:
  - Nisma is a brand of air conditioners made in Oman (Eastern Trading & Industry);
  - «نسمة باردة» is an air-conditioning repair firm in Kuwait;
  - «نسمة» is a stock word in the names of air-conditioning firms.
- Replace with "Zilal Cooling" / «ظلال للتكييف» ("shades"), monogram "ZC" / «ظ». It returned no hit today; the same manual check is still needed.
- `agent.samples.homeservices.announce` AR: «تُعرض الآن ظلال للتكييف، وهي شركة تكييف غير حقيقية.» This also fixes the masculine «يُعرض» used today.

**P1-7. «موظفوني» is wrong Arabic** (`pages.agent.faq[staff].q`).
- The nun of the sound plural drops before the pronoun. Replace with «هل يراه موظفيّ؟». The homepage already writes «موظفيّ».

**P1-8. The Arabic pronoun for "it" changes gender.** ALYR, the company, is feminine; its products are masculine.
- `product.cta.title` «دعنا نجهّزها لك.» refers to ALYR Chat, which is masculine. See P2-7, or at least write «دعنا نجهّزه لك.»
- `home.how.steps[1].title` «نجهّزه لك.» sits beside «نجهّزها» in the facts and the note. Replace with «نجهّز كل شيء.»

**P1-9. Wrong number forms on the first screen of `/ar`** (fixtures, product lane).
- Under Needs you now, the count 2 sits next to «عملاء بانتظار الرد» and «طلبات بحاجة إلى تأكيد».
- The summary line just above already says «طلبان», and the salon and AC samples say «عميلان».
- Make the engine's `counted()` print the dual for 2: «عميلان بانتظار الرد»، «طلبان بحاجة إلى تأكيد».

**P1-10. Latin names inside Arabic sentences.** These are the site's own lines.
- Where:
  - the AR `agent.samples.*.feed` lines;
  - the `pages.bookings.flow` body «تكتب Rania…».
- Even inside `<bdi>`, a Latin name breaks the reading line. Records drawn from the product (dashboard rows, sheets) can stay Latin, because that is how WhatsApp profile names arrive.
- Replace:
  - bakery: «تذوّق الكيك، اليوم الساعة 18:00 · نور أ.» / «الطلب رقم 1441 من لينا ف.، مع صفحة تتبّعه» / «كتبت سارة م. «طلب»، فوصلها الرابط فوراً.»
  - salon: «تسشوار، اليوم الساعة 18:00 · دانة ر.» / «ضغطت رانيا ح. «احجز موعداً»، فوصلها الرابط فوراً.»
  - AC company: «صيانة مكيف سبليت، اليوم الساعة 18:00 · حسن د.» / «كتب عمر ك. «حجز»، فوصله الرابط فوراً.» / «كتب علي ت. «حجزي»، فوصله موعده مع زر للإلغاء.»
  - `/bookings` flow: «تكتب رانيا على واتساب، وتصل الرسالة إلى ALYR عبر منصة واتساب للأعمال الرسمية.»
    - This also drops «كعادتها», "as she always has", which hints that the shop keeps its number (claim 15). Make the same cut in EN: "Rania writes on WhatsApp. The message reaches ALYR through WhatsApp's official Business Platform." Do the same for Mariam on `/chat`.

---

## P2: polish

### Conversion and English

| # | Where | Now | Replace | Why |
|---|---|---|---|---|
| 1 | `home.spotlight.body` | "ALYR Agent reads the orders…" | "ALYR Agent counts the orders…" / «يعدّ ALYR Agent الطلبات…» | "Reads" edges toward "understands"; "counts" is the page's own verb |
| 2 | `home.suite.rows.agent.body` end; `home.spotlight.eyebrow` | "…With every product." · "ALYR Agent · With every product" | drop "With every product." / «مع كل منتج.» · "ALYR Agent · Your business in numbers" / «ALYR Agent · نشاطك بالأرقام» | "With every product" appears five times on `/` |
| 3 | `home.final.title`, `.body` | "Tell us how customers reach you today." | "We'll show you ALYR on your own phone." / «نريك ALYR على هاتفك أنت.» · "Send us a message. A person from ALYR replies, then comes to your shop." / «أرسل لنا رسالة، ويردّ عليك شخص من ALYR ثم يزورك في محلك.» | "How customers reach you" appears three times on `/` (By business, FAQ, closing) |
| 4 | `home.faq` | 16 questions | Drop `commission`: `delivery-apps` already says it | Length; one fact told twice |
| 5 | `home.suite.body` | "ALYR works on your behalf: we set it up, and our products… in the chat you already use." | "We set ALYR up in your shop. Our products take the orders and bookings and send the reminders in WhatsApp, and they share one workspace, one customer list and one team. Choose the ones you need." / «نجهّز ALYR في محلك. منتجاتنا تستقبل الطلبات والحجوزات وترسل التذكيرات داخل واتساب، وتتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً. اختر منها ما تحتاجه.» | The subject changes mid-sentence; "the chat you already use" is claim 15 [G] |
| 6 | `*.other`, `home.business.other` (a mailto link) | "Run something else? Tell us how you work today." | "Run something else? Email us how you work today." / «نشاطك مختلف؟ راسلنا بالبريد وأخبرنا كيف تعمل اليوم.» | A link should say what happens |
| 7 | `product.cta` (`/chat`) | "Let us set it up for you." + "…on your own menu or price list." | "Tell us how orders reach you today." / «أخبرنا كيف تصلك الطلبات اليوم.» · "Send us a message. A person from ALYR replies, then comes to show you ALYR Chat on your own phone." / «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Chat على هاتفك أنت.» | Breaks the family pattern; earlier ruling P1-5 |
| 8 | `product.who.rows[1].tags` | "Book · Remind" on `/chat` | none (the row links to Bookings) | Says that Chat books |
| 9 | `product.demos[track]`, `flow…moves` | "Order 1042 is ready for pickup." · "Ready for pickup" · "Order 1042" | "Order #1042 is ready for collection." · "Ready for collection" · "Order #1042"; AR «الطلب رقم 1042 جاهز للاستلام.», and «الطلب رقم 1042» throughout | The product's words (C3); the homepage feed writes "#1441" |
| 10 | feed `title` "Menu sent" (all three samples) | "Menu sent" / «أُرسلت القائمة» | "Welcome menu sent" / «أُرسلت قائمة الترحيب» | For a bakery, "menu" reads as the food menu |
| 11 | `pages.accounts.demo[pay]`, `[accounts]` | pays QAR 500, leaving QAR 2,650 | "pay 450" → "Received QAR 450. Your balance is now QAR 2,700. Thank you."; row "−QAR 450"; balance and the Accounts tab "QAR 2,700" (AR: 450 ر.ق، 2,700 ر.ق) | The sheet below says QAR 2,700, and the dashboard's QAR 12,975 total only adds up with 2,700 |
| 12 | `pages.agent.faq[messages].a` | "The routine messages, the automatic replies, confirmations and booking reminders, go…" | "Routine messages (automatic replies, confirmations, booking reminders) go from the products you use, and ALYR Agent counts them under Done for you." | It reads as a list of four things |
| 13 | `pages.agent.faq[staff].a` | "Yes, without the money." | "Yes. On this screen they see the work in front of them and their own numbers, not the shop's money. You and your managers see everything." / «نعم. يرون على هذه الشاشة العمل الذي أمامهم وأرقامهم هم، لا أموال المحل، وأنت ومديروك ترون كل شيء.» | Claim 19: staff still see amounts on Orders and Credit accounts |
| 14 | `*.inside.eyebrow` | "What is in it" | "What's in it" | Matches the product bar |
| 15 | `pages.accounts.inside.notYet[4]` | "Buttons on a reminder sent more than 24 hours after… It carries the pay link." | "Pay now and I'll pay within a week, on a reminder sent over 24 hours after the customer last wrote. That one carries the pay link only." / «زرّا «ادفع الآن» و«سأدفع خلال أسبوع» في التذكير الذي يُرسل بعد 24 ساعة من آخر رسالة للعميل؛ يصله رابط الدفع فقط.» | Hard to parse |

### Arabic on the site

| # | Where | Now | Replace | Why |
|---|---|---|---|---|
| 16 | `pages.agent.hero.eyebrow` | «ALYR Agent · نشاطك بالأرقام · مع كل منتج» | «ALYR Agent · مع كل منتج» | The H1 starts with the same words |
| 17 | `pages.agent.who.title` | «لكل نشاط مع ALYR.» | «يأتي مع كل نشاط يعمل بـ ALYR.» / «وما يتصدّر الشاشة يتبع نشاطك.» (no-break space after «بـ») | A fragment |
| 18 | `pages.agent.cta.title` | «أخبرنا ماذا تريد أن تعرف كل صباح.» | «أخبرنا بما تريد أن تعرفه كل صباح.» | The verb «أخبر» takes «بـ» |
| 19 | `pages.agent.faq[trust].q` | «هل أثق بالأرقام؟» | «هل يمكنني الوثوق بالأرقام؟» | More natural |
| 20 | `pages.agent.report.body` | «وكل قسم مقارن بالأسبوع الذي قبله» | «وفي كل قسم مقارنة بالأسبوع الذي قبله» | Reads unfinished |
| 21 | `rules.rows[4].note`, fixtures `status` | «تحتاج موافقتهم» | «تحتاج إلى موافقتهم»; for one regular (salon) «مراسلته تحتاج إلى موافقته التسويقية» | «احتاج إلى»; number agreement |
| 22 | `product.why.pillars[1].title` | «احتفظ بأكثر» | «احتفظ بربحك» | A literal translation of "Keep more" |
| 23 | `product.who.title`, `.eyebrow`; `inside` "records" body | «للشركات…» · «لمن» · «بيانات كل شركة» | «للأنشطة التي تعمل على واتساب أصلاً.» · «لمن صُمّم» · «بيانات كل منشأة» | Use the same terms as the other pages |
| 24 | `product.flow` steps | «يحدّده يوسف جاهزاً حين يُغلَّف.» · «سؤال يحتاج إنساناً» | «يضع يوسف عليه «جاهز» حين يُغلَّف.» · «سؤال يحتاج إلى موظف» | Natural phrasing; «احتاج إلى» |
| 25 | `pages.accounts.hero.facts[1]`; `demo[remind].caption`, `.total` | «لا تذكيرين خلال 3 أيام» · «وأشد من 60» · «وتخطٍّ واحد» | «لا تذكير مرتين خلال 3 أيام» · «ودّي قبل 60 يوماً، وأشد لهجة من اليوم 60، وإشعار أخير من اليوم 90.» · «3 تذكيرات، واستُثني عميل واحد» | Awkward; «أشد من 60» means "stronger than 60" |
| 26 | `pages.accounts.screen.sheet.rows[0].promised` | «وعد بالدفع قبل 19 أكتوبر» | «وعد بالسداد قبل 19 أكتوبر» | The term table, and the demo beside it |
| 27 | `pages.accounts` demo panels, `remindHint`, flow work lines | «أقدم فاتورة: 35 يوماً» | «أقدم دين: 35 يوماً»; hint «للعملاء الذين مضى على أقدم دين غير مسدَّد لهم 30 يوماً أو أكثر» | Invoices are listed under "Not yet". The reminder text is the product's template (`core/templates.py`, `ledger/service.py`): product lane, and the Meta template has to be submitted again |
| 28 | `pages.bookings.flow` remind step | «الحجز الملغى أو المؤجل» | «الحجز الملغى أو المنقول إلى وقت آخر» | "Moved" is not "postponed" |
| 29 | `meta.bookings`, `meta.accounts` AR | «نجهّزه لك، في قطر.» | «ونجهّزه لك في قطر.» | The comma breaks the clause |
| 30 | `/ar/accounts` demo chat avatar | «م» (first letter of «مخبز») | «ق» | Ruling 07 P1-15; the demo set needs a monogram field, as the homepage has |

### Fixtures and product strings (product lane)

| # | Now | Replace |
|---|---|---|
| 31 | Day labels «إثنين»; aria text «اليوم, خميس:» (Latin comma); days still to come read "Fri:." / «جمعة:.» | «اثنين» (hamzat wasl); «اليوم، الخميس:»; "Fri: not yet." / «الجمعة: لم يأتِ بعد.» |
| 32 | «الطلب #1436 للعميل Aisha I.» (Aisha is a woman) · «يُرد» (also the site's `pages.agent.rules.rows[0]`) · «19 زيارة، وغياب 2.» · «1 محجوزة» · «خبز الهيل» · «أكثر بـ1,946 ر.ق من قبل أسبوع» · «مهمة بلا تسجيل حضور» · report «حضروا: 6»، «لم يحضروا: 1»، «محجوز للأسبوع القادم» · «سجلنا» · team rows "Hiba Taher" (Latin) while the site's sheet writes «هبة طاهر» | «الطلب #1436 باسم Aisha I.» · «يُردّ» · «19 زيارة، والغياب: 2.» · «محجوز: 1» · «كعكة الهيل» · «أكثر بـ1,946 ر.ق مما كان قبل أسبوع» · «مهمة لم تُسجَّل» · «الحضور: 6»، «الغياب: 1»، «حجوزات الأسبوع القادم: 5» (`bookings/report.py`) · «سجّلنا» (`ledger/chat.py`) · staff names in Arabic in the Arabic seed |

---

## The other customer and company names in the samples

Palm Court Offices, Bluefin Events, Ward Events, Tamr Café, Garden Gate Nursery, Marina Desk Co-working, Bayview School, Crescent Tower Offices and Dana Home Services were **not** searched. They need the same check before publishing.

## Not checked

- No native speaker has signed off the Arabic (ALY-66); this review is not that sign-off.
- The offer-on state and the WhatsApp contact state.
- Screen readers by ear.
- The manual Instagram, Maps and trademark checks.
- Whether the `weekly_report` and `booking_reminder` templates are approved.
