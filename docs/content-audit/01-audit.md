# Content audit 01: AI-sounding writing on the public site

25 Oct 2026. Growth lane, at the founder's request. Read-only: no code or copy changed. Sources: `apps/web/app/_site/copy.ts` (English lines 519 to 2813), `copyShelf.ts`, `copyDocs.ts`, the Arabic halves of all three, the components that render them (to confirm which keys are on the page), and https://alyr.qa (live on 25 Oct; headings match this branch). Rules applied: `alyr-design` (`voice.md`, `honesty.md`, `arabic.md`) and `alyr-site-page`.

**Out of scope:** the homepage products section (`home.suite`: title, rows, notes, crops), because another agent is editing it on this branch. Sample data inside drawings (chat bubbles, sheet rows, customer names) is the product's own wording and is not audited for style.

**How to read the table.** A slash ( / ) marks a heading's line break. ★ marks the 25 rows that matter most. Every Arabic line is a draft until the native review (ALY-66). Where the current Arabic has the same problem, the AR column quotes it.

## 1. The voice, in ten lines

1. ALYR writes like a capable person at the counter: plain, specific, calm. One idea a sentence.
2. Feature titles, facts, tags and menu lines are plain nouns: "Gapless numbering", not "Numbers that never skip".
3. The only slogan on the site is the homepage H1. Every other heading says what the section holds.
4. Headings match the link that leads to them: "How we work", "Questions", "What's in ALYR Docs".
5. A two-line heading is one sentence broken in two, never two slogans stacked.
6. Questions belong in the Questions section, asked the way an owner asks them. Nowhere else.
7. No colon reveals, no "X. Y. Z.", no "one X, one Y, one Z", no "not X, but Y".
8. The lead adds a fact the heading did not give; it never restates it.
9. Adjectives earn their place with a number or a rule; "polite" and "honestly" do not.
10. Say it once. A line that appears on two pages, or twice on one, is cut or reworded.

| Before | After |
|---|---|
| Numbers that never skip | Gapless numbering |
| No CR yet? Receipts that say so | Receipts for shops without a CR |
| Check. Set up. See. Improve. / Then again. | How we work with you |
| It counts. It compares. It shows the rule. | The rules behind each suggestion |
| Know who owes you. / Remind them without the awkward call. | See who owes you, / and remind them in one press. |

## 2. Findings

### Sitewide (header, Products menu, footer, meta, shared blocks)

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 1 ★ | All 7 pages | Questions heading | "Before you ask." (six product pages) · "Fair questions." (home) | A cute label where a name belongs; same line on six pages; "Fair" editorialises. The nav already says "Questions" | Rewrite | Questions | أسئلة (now «قبل أن تسأل.» and «أسئلة في محلها.», same problem) |
| 2 ★ | /chat, /bookings, /agent, /accounts, /shelf | What's in it (`inside.title`) | Everything it does today. | Same sentence on five pages; "today" hints at a roadmap; the product bar's link already names the section | Rewrite | What's in ALYR Chat (and ALYR Bookings, ALYR Agent, ALYR Accounts, ALYR Shelf) | ما يتضمنه ALYR Chat (now «كل ما يفعله اليوم.») |
| 3 ★ | Sitewide | "polite" | meta.accounts.title "Credit accounts and polite reminders, in the chat"; menu "…and polite reminders"; home bakery and home-services rows "polite reminders"; /bookings works "remind them politely" | Filler adjective six times; the real fact (the tone follows the age of the debt) is said where it matters | Rewrite | "payment reminders" / "reminders to pay"; meta title: ALYR Accounts · Credit accounts and payment reminders; /bookings: "Let regular clients pay later, with reminders to pay." | «تذكيرات بالسداد» in place of «تذكيرات لبقة»؛ العنوان: ALYR Accounts · الحسابات الآجلة وتذكيرات السداد |
| 4 ★ | /chat, /accounts | Inside item, hero fact, inside line | Stop means stop | Slogan, three times on two pages | Rewrite | /chat item title: Customers can say stop · /accounts fact: No reminders after "stop" · /accounts line: A customer who says stop gets no more reminders or notices. | «يستطيع العميل طلب الإيقاف» · «لا تذكير بعد طلب الإيقاف» · «من يطلب الإيقاف لا تصله تذكيرات ولا إشعارات بعد ذلك.» (now «الإيقاف يعني الإيقاف»، a calque) |
| 5 ★ | Every page | Footer line | We do the tech. You run the business. | Two-beat parallel slogan; a second slogan beside the hero's | Rewrite | Technology for owner-run businesses in Qatar. | التقنية للأنشطة التي يديرها أصحابها في قطر. (now «علينا التقنية، وعليك شغلك.»: same shape, and «شغلك» is Gulf on an MSA footer) |
| 6 | /chat, /agent, /accounts, /shelf, /docs; home tab | Who it's for, last line; home "Something else" panel title | Run something else? Write to us about how you work today. · Run something else? | Rhetorical question as a label, five copies | Rewrite | If you run another kind of business, write to us about how you work today. · Home panel title: Another kind of business | إن كان نشاطك من نوع آخر، فاكتب لنا كيف تعمل اليوم. · نشاط من نوع آخر (now «نشاطك مختلف؟»، same question) |
| 7 | Menu, footer | ALYR Accounts line | Credit accounts: who owes you, and polite reminders | Colon reveal after the descriptor | Rewrite | Who owes you and for how long, with reminders | من عليه مستحقات لك ومنذ متى، مع التذكيرات |
| 8 | Menu, footer | ALYR Shelf line | Everything you sell: photos, prices, sizes and stock | Colon reveal | Rewrite | Your items with photos, prices, sizes and stock | أصنافك بصورها وأسعارها ومقاساتها ومخزونها |
| 9 | /docs | Meta description | Receipts from your sales and the payments you record, numbered without a gap, Arabic first and final once issued. No CR yet: receipts, and invoices once you register. Set up for you, in Qatar. | Stacked fragments and a colon reveal, in the line search engines and assistants quote | Rewrite | ALYR Docs makes numbered receipts from your sales and the payments you record, in Arabic and English. A shop without a commercial registration gets receipts; invoices need a CR number. Set up for you, in Qatar. | يُصدر ALYR Docs إيصالات مرقّمة من مبيعاتك ومن الدفعات التي تسجّلها، بالعربية والإنجليزية. المحل الذي ليس له سجل تجاري تصدر له إيصالات، والفواتير تحتاج إلى رقم السجل التجاري. نجهّزه لك في قطر. |
| 10 | / | Meta description (`descriptionNoOffer`; `description` the same plus price) | …Orders, bookings, credit, stock and receipts on one screen, your numbers every day, set up in your shop and improved with you. | Run-on list of five fragments. "Receipts" also lists ALYR Docs as if a shop can have it | Rewrite | ALYR is the tech team for owner-run businesses in Qatar. We set up your orders, bookings, credit accounts and stock on one screen, in your shop, and keep improving it with you. | ALYR فريق التقنية للأنشطة التي يديرها أصحابها في قطر. نجهّز طلباتك وحجوزاتك وحساباتك الآجلة ومخزونك في شاشة واحدة، في محلك، ونواصل تحسينها معك. |
| 11 | /shelf | Meta description | Everything you sell, on one shelf: photos, prices, sizes and choices in Arabic and English. Every sale counts the stock down, the last one sells once, and the order page says Sold out. | Pun on the product name, colon reveal, tricolon | Rewrite | Your items in Arabic and English, with photos, prices, sizes and choices. Each sale takes its stock, and the order page shows Sold out when an item runs out. With every ALYR product. | أصنافك بالعربية والإنجليزية، بصورها وأسعارها ومقاساتها وخياراتها. كل بيع يُنقص المخزون، وتُظهر صفحة الطلب «نفد» حين ينفد الصنف. مع كل منتج من ALYR. |
| 12 | / and /bookings | FAQ "chairs"; /bookings who | …we'll tell you honestly whether it fits. · …we'll say honestly whether it fits. | "Honestly" is filler, and implies other lines are not | Rewrite | …and we'll tell you whether it fits. | …وسنخبرك هل يناسبك. |
| 13 | Six product pages | Works with, title | Works with the rest of ALYR. | A plain template label; the repetition is navigation | Keep | | |
| 14 | Product pages | Hero eyebrow | Set up for you · With every product | Carries the product's state, which the H1 does not | Keep | | |
| 15 | Product pages | Closing call titles | Tell us how orders reach you today. (and five more) | Specific to each page and in the owner's situation | Keep | | |

### Homepage (/)

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 16 ★ | / | How we work, H2 | Check. Set up. See. Improve. / Then again. | Four one-word sentences plus a tagline line | Rewrite | How we work with you | كيف نعمل معك (now «نفحص. نجهّز. ترى. نحسّن. ثم من جديد.») |
| 17 ★ | / | By business, H2 | Every business runs differently. / Here is yours. | Two-line tagline: a platitude, then a presumption | Rewrite | What we set up for your kind of business | ما نجهّزه لنوع نشاطك (now «لكل نشاط طريقته. وهذا نشاطك.») |
| 18 ★ | / | ALYR Agent, H2 | Every day, see what changed / and what to do next. | The heading every dashboard page uses; an instruction, not a description | Rewrite | What needs you today, and how the week compares | ما يحتاجك اليوم، وكيف يسير أسبوعك مقارنةً بالماضي |
| 19 ★ | / | Trust, eyebrow and H2 | Why trust us · New company. No shortcuts. | Two-fragment slogan; the eyebrow is doing the heading's job | Rewrite the title; Remove the eyebrow | What you can check before you start | ما يمكنك التحقق منه قبل أن تبدأ (now «لماذا تثق بنا» · «شركة جديدة. ونعمل بالأصول.») |
| 20 ★ | / | Hero lead | Big businesses have consultants and an IT team for this. You have us: we check how your business runs, set up what it needs, and keep improving it with you. | Colon reveal; "for this" points at nothing; "You have us" is the stock contrast turn | Rewrite | We check how your business runs, set up what it needs and keep improving it with you. It is the work a large company has an IT team for. | نفحص كيف يسير عملك، ونجهّز ما يحتاجه، ونواصل تحسينه معك. وهذا ما تكلّف به الشركات الكبيرة فريق التقنية لديها. |
| 21 | / | One order, H2 | One order, start to finish. / The routine is done for you. | Two-line tagline; "done for you" is vague | Rewrite | One order, from the first message to collection | طلب واحد، من الرسالة الأولى إلى الاستلام (now «…والمعتاد علينا.») |
| 22 | / | Trust, fact titles | Your records, kept apart. · Consent, on record. · People stay in charge. · You know who you are dealing with. · WhatsApp's official platform. | Comma-pause fragments; "People stay in charge" is vague | Rewrite (keep "Built never to hold your money.") | Records kept apart · Consent recorded · Your team can take over any chat · The same person from the visit on · Built on WhatsApp's official platform | سجلات منفصلة · الموافقة مسجّلة · يستطيع فريقك تولّي أي محادثة · الشخص نفسه من الزيارة فصاعداً · مبنية على منصة واتساب الرسمية |
| 23 | / | Trust, lead | …so you won't see logos or numbers here yet. Here is what we can show you instead. | "Here is what … instead" is filler | Rewrite | We are choosing our first businesses in Doha now, so there are no logos or results on this page. These are the things you can check. | نختار الآن أول الأنشطة التي نعمل معها في الدوحة، لذلك لا توجد على هذه الصفحة شعارات ولا نتائج. وهذه أمور يمكنك التحقق منها. |
| 24 | / | How we work, lead | …We do each step with you, and the loop doesn't stop when you go live. | Jargon ("the loop"), personified process | Rewrite | You don't need to know anything technical. We do each step with you, and we keep going after you go live. | لا تحتاج إلى أي خبرة تقنية. ننجز كل خطوة معك، ونواصل العمل بعد بدء التشغيل. |
| 25 | / | ALYR Agent, lead | …and suggests up to three things, each with its reason. You decide. | Punchline closer | Rewrite | …and suggests up to three things, each with its reason, for you to act on or set aside. | …ويقترح حتى ثلاثة أمور، لكل منها سببه، لتأخذ بها أو تؤجلها. |
| 26 | / | ALYR Agent, callouts | Shows why: … · Like with like: … | Clever labels; the screen's own labels are "Needs you now" and "Done for you" | Rewrite | Reasons: each suggestion says what it counted, and opens those rows. · Against last week: the same days, with percentages only when both weeks have 20 or more. | الأسباب: … · مقارنةً بالأسبوع الماضي: … |
| 27 | / | "Something else" panel | If ALYR fits, we'll show you how. If it doesn't yet, we'll say so. | Mirrored pair; "yet" promises a later fit | Rewrite | Tell us how customers reach you today, and we'll tell you whether ALYR fits. | أخبرنا كيف يصلك عملاؤك اليوم، وسنخبرك هل تناسبك ALYR. |
| 28 | / | Questions | My staff won't use it. | Objection staged as a statement; five on one page make a pattern | Rewrite | Will my staff use it? | هل سيستخدمه موظفيّ؟ |
| 29 | / | Questions | Delivery apps bring me customers. | Same pattern | Rewrite (answer opens "No. Keep them for new customers.") | Should I stop using delivery apps? | هل أتوقف عن تطبيقات التوصيل؟ |
| 30 | / | Questions | My customers won't pay online. | Same pattern | Rewrite (answer opens "No.") | Do my customers have to pay online? | هل يجب أن يدفع عملائي عبر الإنترنت؟ |
| 31 | / | Questions | I'm not technical. | Same pattern | Rewrite (answer opens "No.") | Do I need to be technical? | هل أحتاج إلى خبرة تقنية؟ |
| 32 | / | Questions, cost (offer off) | Our prices go on this page soon. Until then, message us and we will take you through them. | "Soon" is the coming-word, kept only by an exception | Rewrite (then drop its allow-list entry) | Message us and we will take you through our prices. | راسلنا وسنشرح لك أسعارنا. |
| 33 | / | By business, "Today" lists | …and asking feels awkward (bakery, wholesale, restaurants, home services) | One sentence in four tabs | Rewrite three, keep the bakery's | Wholesale: Shops pay late, and nobody has time to chase them. · Restaurants: Office lunches go on a tab until the end of the month. · Home services: Contract customers pay late, and chasing them takes calls. | المحلات تتأخر في السداد، ولا أحد لديه وقت لمتابعتها. · غداء المكاتب يُسجَّل حتى آخر الشهر. · عملاء العقود يتأخرون في السداد، ومتابعتهم تحتاج إلى اتصالات. |
| 34 | / | Salons, "Today" | No idea how this week compares: appointments live in a notebook. | Opening fragment and colon reveal | Rewrite | Appointments are in a notebook, so you can't tell how this week compares. | المواعيد في دفتر، فلا تعرف كيف يقارن هذا الأسبوع بما قبله. |
| 35 | / | Hero H1 | The tech team your business never had. | The one slogan the site may have | Keep | | |
| 36 | / | Questions | I already use WhatsApp Business. It's free. | The owner's real objection, in his words; one is fine | Keep | | |

### /chat

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 37 ★ | /chat | Hero H1 | Orders in the chat. / One inbox for the team. | Two stacked fragments | Rewrite | Customers order from the chat, / and your team answers from one inbox. | يطلب عملاؤك من المحادثة، / ويردّ فريقك من صندوق واحد. |
| 38 ★ | /chat | Approach statement | …The businesses that win treat the chat as their shop counter. | Vague grandiosity ("win") as the closer | Remove that sentence; keep the first three | Your customers already message you before they visit or order. Those chats get lost, orders end up on paper, and payment means a transfer screenshot. | احذف «والأعمال الرابحة تجعل المحادثة واجهة محلها.» |
| 39 ★ | /chat | Approach, four titles | Sell more · Keep more · Easy · Trusted | Four stacked one-word slogans; filler adjectives | Rewrite | Fewer lost orders · Your customers stay yours · Set up for you · On WhatsApp's official platform | طلبات ضائعة أقل · عملاؤك يبقون لك · نجهّزه لك · على منصة واتساب الرسمية (now «بِع أكثر · احتفظ بربحك · سهل · موثوق») |
| 40 | /chat | Hero lead | ALYR Chat adds an order page and updates to your chat, and one inbox for your whole team. | Restates the H1 | Rewrite | Customers open an order page from WhatsApp, with no app, and get a message at each step. Every order and chat is on your team's screen. | يفتح عملاؤك صفحة الطلب من واتساب بلا تطبيق، وتصلهم رسالة في كل خطوة. وكل طلب ومحادثة على شاشة فريقك. |
| 41 | /chat | What's in it, item | WhatsApp's rules, handled | Comma reveal | Rewrite | WhatsApp's 24-hour rule | قاعدة 24 ساعة في واتساب (now «قواعد واتساب علينا») |
| 42 | /chat | What's in it, item | Nothing lost | Slogan; overclaims | Rewrite | Retries when WhatsApp is slow | إعادة الإرسال حين يتأخر واتساب |
| 43 | /chat | What's in it, items | Step in at any moment · A name on every order · Your records, kept apart | Idiom and comma fragments | Rewrite | Take over a chat · One person responsible per order · Records kept apart | تولَّ أي محادثة · موظف مسؤول عن كل طلب · سجلات منفصلة |
| 44 | /chat | How it works, lead | Your customer sees an ordinary chat. Behind it, ALYR sends the order page, keeps the record and tells the customer at every step. Follow one order through. | The same three-sentence shape on five pages, ending in a stage direction | Rewrite | ALYR Chat sends the order page, keeps the order and messages the customer at each step. | يرسل ALYR Chat صفحة الطلب، ويحفظ الطلب، ويراسل العميل في كل خطوة. |
| 45 | /chat and / | Flow step | The automatic replies step back | Personification | Rewrite | Automatic replies pause | تتوقف الردود الآلية مؤقتاً (now «الردود الآلية تتنحّى») |
| 46 | /chat | Demo caption, Team inbox | One number, the whole team. When a person answers, the automatic replies step back. | Fragment slogan and personification | Rewrite | The whole team answers from one number. When a person replies, automatic replies pause for that chat. | يردّ الفريق كله من رقم واحد. وحين يردّ موظف، تتوقف الردود الآلية في تلك المحادثة. |
| 47 | /chat, /, /bookings | Flow step | An order word, so ALYR answers · A booking word, so ALYR answers | Telegraphic, compressed | Rewrite | ALYR answers the word "order" · ALYR answers the word "book" | تردّ ALYR على كلمة «طلب» · تردّ ALYR على كلمة «حجز» |
| 48 | /chat | Who it's for, salons | Bookings and reminders have their own product now. | "Now" reads as news | Rewrite | Bookings and reminders are in ALYR Bookings. | الحجوزات والتذكيرات في ALYR Bookings. |
| 49 | /chat | Facts, payments | …Real payments will go through your own account with a Qatari payment provider; that connection is not live yet. | Future promise ("will"), two claims in one sentence | Rewrite | Payment links are built and tested on a test page. Card payments start once a payment provider is connected. | روابط الدفع جاهزة ومجرّبة على صفحة اختبار. ويبدأ الدفع بالبطاقات حين يُربط مزوّد دفع. |

### /bookings

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 50 ★ | /bookings | Hero H1 | Customers book in the chat. / ALYR reminds them before they come. | Two parallel sentences | Rewrite | Customers book in the chat / and get a reminder before they come. | يحجز عملاؤك من المحادثة، / ويصلهم تذكير قبل موعدهم. |
| 51 | /bookings | Hero lead | Customers pick a free time in the chat. ALYR confirms at once and reminds them two hours before. | Restates the H1 | Rewrite | Free times come from your opening hours, and the confirmation goes at once. Your team marks who came. | تأتي الأوقات المتاحة من ساعات عملك، ويصل التأكيد فوراً. ويسجّل فريقك من حضر. |
| 52 | /bookings | How it works, lead | Your customer sees an ordinary chat. Behind it, ALYR reads your hours, locks the time and sets the reminder. Follow one booking through. | "Reads" is on the AI-word list; repeated shape | Rewrite | ALYR Bookings checks your hours, holds the time and sets the reminder. | يتحقق ALYR Bookings من ساعات عملك، ويحجز الوقت، ويضبط التذكير. (now «تقرأ ALYR ساعات عملك») |
| 53 | /bookings | Flow steps | One tap: Came · The figures stay true · Confirmation now, reminder later | Colon label, vague, mirrored pair | Rewrite | Hiba marks Came · The no-show figures update · Confirmation sent, reminder set | تسجّل هبة «حضر» · تتحدّث أرقام الغياب · أُرسل التأكيد وضُبط التذكير |
| 54 | /bookings | Who it's for, last line | Several chairs or rooms? Tell us how many, and we'll say honestly whether it fits. | Rhetorical question and "honestly" | Rewrite | If you have several chairs or rooms, tell us how many and we'll tell you whether it fits. | إن كان لديك أكثر من كرسي أو غرفة، فأخبرنا بعددها وسنخبرك هل يناسبك. |
| 55 | /bookings | Works with, ALYR Chat | Take orders too: a bakery books cake tastings and sells the cake. | Colon reveal | Rewrite | A bakery can book cake tastings and take cake orders in the same chat. | يستطيع المخبز حجز مواعيد تذوّق الكيك واستقبال طلباته في المحادثة نفسها. |
| 56 | /bookings | Demo caption, Remind | Two hours before, by itself. A cancelled booking is never reminded. | Fragment opener | Rewrite | The reminder goes two hours before, with nobody pressing anything. A cancelled booking gets no reminder. | يصل التذكير قبل الموعد بساعتين دون أن يضغط أحد شيئاً. والحجز الملغى لا يصله تذكير. |

### /agent

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 57 ★ | /agent | Hero H1 | Your business in numbers. / What needs you, first. | Two fragments | Rewrite | Your business in numbers, / with what needs you first. | نشاطك بالأرقام، / وما يحتاجك في المقدمة. |
| 58 ★ | /agent | How it works, H2 | Your records, a rule, a card, the screen. | A list used as a heading | Rewrite | How a suggestion is made | كيف يظهر الاقتراح (now «سجلاتك، ثم القاعدة، ثم البطاقة، ثم الشاشة.») |
| 59 ★ | /agent | The rules, H2 | It counts. It compares. It shows the rule. | Tricolon | Rewrite | The rules behind each suggestion | القواعد وراء كل اقتراح (now «يعدّ، ويقارن، ويُظهر القاعدة.») |
| 60 ★ | /agent | Report, H2 | The same week, on your WhatsApp, every Sunday. | States as running what the body says waits on WhatsApp's approval (honesty.md §2, §3) | Rewrite | The Sunday report card | بطاقة تقرير الأحد (now «…صباح كل يوم أحد.», same claim) |
| 61 | /agent | Who it's for, H2 | Every ALYR business has it. / What leads depends on yours. | Two-line tagline; "what leads" is wordplay | Rewrite | The four numbers, by kind of business | الأرقام الأربعة حسب نوع النشاط |
| 62 | /agent | The rules, lead | No guesses and no scores. Six of the rules, as they appear on your screen. | Denial opener | Rewrite | Six of the rules, as your screen shows them. | ست من القواعد كما تظهر على شاشتك. |
| 63 | /agent | The rules, notes | Same days, never yesterday: … · Small numbers stay counts: … | Colon reveals with a twist | Rewrite | The week so far is compared with the same days and hours last week, never with yesterday. · A percentage appears only when both weeks have 20 or more. Below that, the screen shows counts: "7 · last week 4". | يُقارن الأسبوع حتى الآن بالأيام والساعات نفسها من الأسبوع الماضي، لا بالأمس. · لا تظهر نسبة مئوية إلا حين يبلغ الأسبوعان 20 أو أكثر، وما دون ذلك تُعرض الأعداد: «7 · الأسبوع الماضي 4». |
| 64 | /agent | What's in it, group and item | Every week, everywhere · Arabic and English, light and dark, phone and laptop. | Alliteration; stacked pairs | Rewrite | Every week · In Arabic and English, on a phone or a laptop. | كل أسبوع · بالعربية والإنجليزية، على الهاتف أو الحاسوب. |

### /accounts

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 65 ★ | /accounts | Hero H1 | Know who owes you. / Remind them without the awkward call. | Imperative pair; "awkward" is also used four times on the homepage | Rewrite | See who owes you, / and remind them in one press. | اعرف من عليه مستحقات لك، / وذكّرهم بضغطة واحدة. |
| 66 | /accounts | How it works, lead | Your customer sees an ordinary chat. Behind it, ALYR keeps the book, checks before it reminds, and pauses when someone promises. Follow one account through. | Tricolon and the repeated shape | Rewrite | ALYR Accounts keeps each customer's balance, checks before every reminder and pauses when a customer promises to pay. | يحفظ ALYR Accounts رصيد كل عميل، ويتحقق قبل كل تذكير، ويتوقف حين يعد العميل بالسداد. |
| 67 | /accounts | What's in it, Behind the scenes | The oldest debt is settled first. · Nobody is reminded twice within 3 days. | Repeats the hero facts word for word | Rewrite these list lines (keep the facts) | A payment settles the oldest unpaid purchase first. · A customer gets at most one reminder in any 3 days. | تُسدِّد الدفعة أقدم مشتريات غير مدفوعة أولاً. · لا يصل العميل أكثر من تذكير واحد خلال 3 أيام. |
| 68 | /accounts | Demo caption, Accounts | Payments settle the oldest debt first, as a paper book is read. | Odd simile | Rewrite | Payments settle the oldest debt first. | تُسدِّد الدفعات الدين الأقدم أولاً. |
| 69 | /accounts | Demo caption, Remind | Gentle under 60 days, firmer from 60, a final notice from 90. | Fragment tricolon | Rewrite | Reminders are friendly under 60 days, firmer from 60 and a final notice from 90. | التذكير ودّي قبل 60 يوماً، وأكثر حزماً من 60، وإنذار أخير من 90. |

### /shelf

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 70 ★ | /shelf | Hero H1 | Everything you sell, on one shelf. / Every sale counts the stock down. | Pun on the product name; two parallel lines | Rewrite | Your items and stock in one place, / counted down with every sale. | أصنافك ومخزونك في مكان واحد، / وينقص المخزون مع كل بيع. |
| 71 ★ | /shelf | Signature figure, H2 | One left, two customers, one sale. | Tricolon slogan; the same shape as /docs (row 83) | Rewrite | Two customers order the last cheesecake | عميلتان تطلبان آخر قطعة تشيز كيك (now «بقيت واحدة، وطلبتها عميلتان، فبيعت مرة واحدة.») |
| 72 | /shelf | Who it's for, H2 | Every business that sells things. / Each starts the way it already works. | Two-line tagline | Rewrite | How each kind of business starts | كيف يبدأ كل نوع من الأنشطة |
| 73 | /shelf | Hero facts | The last one sells only once · Counted, by the day or by weight | A paradox phrase said five times on the page; fragment | Rewrite | Sold out shown on the order page · Count by item, by day or by weight | «نفد» يظهر في صفحة الطلب · العدّ بالقطعة أو باليوم أو بالوزن |
| 74 | /shelf | Hero lead | Photos, prices and sizes in Arabic and English. Every sale counts the stock, so the last one sells once. | Restates the H1 | Rewrite | Photos, prices, sizes and choices in Arabic and English. When the last one sells, the order page shows Sold out. | الصور والأسعار والمقاسات والخيارات بالعربية والإنجليزية. وحين تُباع القطعة الأخيرة، تُظهر صفحة الطلب «نفد». |
| 75 | /shelf | How it works, lead | Your customer sees an ordinary order page. Behind it, ALYR Shelf takes the stock, writes the log and changes what the page shows. Follow one item through. | Repeated shape | Rewrite | ALYR Shelf takes the stock, adds a row to the stock log and updates the order page. | يُنقص ALYR Shelf المخزون، ويضيف سطراً إلى سجل المخزون، ويحدّث صفحة الطلب. |
| 76 | /shelf | The screen, H2 | What is on the shelf, and every change to it. | Shelf pun again | Rewrite | Stock now, and every change to it | المخزون الآن، وكل تغيير عليه |
| 77 | /shelf | Flow steps | A row in the log, by itself · The change has a name on it · He is told | Idiom, telegraphic | Rewrite | The stock log adds a row · The record shows who changed it · Omar is told why | يُضاف سطر إلى سجل المخزون · يُظهر السجل من غيّر الصنف · يُبلَّغ عمر بالسبب |

### /docs

| # | Page | Section | Current text (EN) | Problem | Action | Proposed text (EN) | Proposed text (AR, draft) |
|---|---|---|---|---|---|---|---|
| 78 ★ | /docs | Hero H1 | Payment in, receipt out. / Every number in order. Every paper final. | Three slogans across two lines | Rewrite | A numbered receipt / for every payment you record. | إيصال مرقّم / لكل دفعة تسجّلها. (now «تُسجَّل الدفعة، فيصدر الإيصال. أرقام متتالية، ومستند لا يتغيّر.») |
| 79 ★ | /docs | Hero fact | Numbers that never skip | Catchy fragment (the founder's example) | Rewrite | Gapless numbering | ترقيم متسلسل بلا فجوات (now «أرقام متسلسلة لا تنقطع») |
| 80 ★ | /docs | Hero fact | No CR yet? Receipts that say so | Rhetorical question as a label | Rewrite | Receipts for shops without a CR | إيصالات للمحلات بلا سجل تجاري (now «بلا سجل تجاري؟ إيصالات تقول ذلك») |
| 81 ★ | /docs | Hero fact | Arabic first, English beside it | Parallel slogan | Rewrite | Arabic and English documents | مستندات بالعربية والإنجليزية (now «العربية أولاً والإنجليزية بجانبها»). "Bilingual documents" also works; a business document can be English only, so avoid "every document" |
| 82 | /docs | No-CR block, H3 | No CR yet? Receipts, and they say so. | Rhetorical question; repeats row 80 | Rewrite | Shops without a commercial registration | المحلات التي ليس لها سجل تجاري |
| 83 | /docs | Signature figure, H2 | One payment, one receipt, one number. | Tricolon; the same shape as /shelf (row 71) | Rewrite | A cash payment becomes receipt RC-0042 | دفعة نقدية تصبح الإيصال RC-0042 (now «دفعة واحدة، وإيصال واحد، ورقم واحد.») |
| 84 | /docs | "Paper" for document, throughout | Every paper you issued, and whether it arrived. · For businesses that hand over paper. · Issued paper cannot change · for each kind of paper (inside, FAQ) | A literary stand-in for "document", used about ten times | Rewrite: "document" everywhere | Every document you issued, and whether it arrived. · For businesses that give customers receipts or invoices. | كل مستند أصدرته، وهل وصل. · للأنشطة التي تعطي عملاءها إيصالات أو فواتير. (the Arabic already says «مستند») |
| 85 | /docs | Hero lead | When a payment is recorded, ALYR Docs issues the next numbered receipt, Arabic first, final once issued. | Restates the H1; "final once issued" is a twist | Rewrite | Receipts, invoices and credit notes in Arabic and English, numbered without gaps. An issued document cannot be edited; a correction is a credit note. | إيصالات وفواتير وإشعارات دائنة بالعربية والإنجليزية، بترقيم بلا فجوات. لا يُعدَّل المستند بعد صدوره، والتصحيح يكون بإشعار دائن. |
| 86 | /docs | What's in it, H2 | Everything it is built to do. | Hedged twin of row 2 | Rewrite (keep the note "Everything listed here is built.") | What's in ALYR Docs | ما يتضمنه ALYR Docs |
| 87 | /docs | How it works, lead | …Behind it, ALYR Docs takes the next number, writes the paper in both languages and seals it. Follow one receipt through. | Metaphor ("seals"); repeated shape | Rewrite | When your customer has written in the last 24 hours, the receipt arrives in the chat. ALYR Docs takes the next number and issues the document in Arabic and English. | حين يكون عميلك قد راسلك خلال آخر 24 ساعة، يصله الإيصال في المحادثة. ويأخذ ALYR Docs الرقم التالي ويُصدر المستند بالعربية والإنجليزية. |
| 88 | /docs | Flow steps | The next number, never skipped · Written, then sealed · No CR on file? | Slogan fragment, metaphor, question | Rewrite | The next receipt number · The PDF is drawn and issued · If no CR number is on file | رقم الإيصال التالي · يُرسم ملف PDF ويصدر · إن لم يكن رقم السجل التجاري محفوظاً |
| 89 | /docs | What's in it, Behind the scenes | Numbers never skip: a failed issue gives its number back. · Issued paper cannot change: the database refuses any edit. | Colon reveals | Rewrite | Numbering has no gaps. If issuing fails, the number goes back. · An issued document cannot be edited. The database refuses the change. | لا فجوات في الترقيم. وإن تعذّر الإصدار يعود الرقم. · لا يُعدَّل المستند بعد صدوره، وقاعدة البيانات ترفض أي تعديل. |
| 90 | /docs | Who it's for, tag | Its sales, ALYR's paper | Clever possessive pair | Rewrite | Sales from your system | المبيعات من نظامك |
| 91 | /docs | Demo caption, Correct | Issued means final. A correction is a credit note, and both keep their numbers. | Slogan opener | Rewrite | An issued document is final. A correction is a credit note, and both keep their numbers. | المستند الصادر نهائي. والتصحيح إشعار دائن، ويحتفظ كلٌّ منهما برقمه. |

**Arabic-only notes.** The Arabic mirrors every problem above where it translates the English. Beyond those: the footer's «شغلك» is Gulf on an MSA surface (row 5); «تقرأ ALYR ساعات عملك» (row 52) uses the verb the English list bans; the Shelf hero adds «تلقائياً», which the English does not say; «قواعد واتساب علينا» (row 41) is a slogan of its own.

## 3. Counts

| Page | Findings | Rewrite | Remove | Keep |
|---|---|---|---|---|
| Sitewide | 15 | 12 | 0 | 3 |
| / | 21 | 19 | 0 rows (1 line: the trust eyebrow, in row 19) | 2 |
| /chat | 13 | 12 | 1 (row 38) | 0 |
| /bookings | 7 | 7 | 0 | 0 |
| /agent | 8 | 8 | 0 | 0 |
| /accounts | 5 | 5 | 0 | 0 |
| /shelf | 8 | 8 | 0 | 0 |
| /docs | 14 | 14 | 0 | 0 |
| **Total** | **91 rows** | **85 rows** | **1 row (2 lines)** | **5** |

Row 19 rewrites a title and removes an eyebrow, so it counts once, as a rewrite. Several rows cover a line repeated across pages (rows 1 to 6, 12, 33, 84), so the rewrites touch more strings than rows; I have not counted them exactly. Each one has an Arabic twin to change.

## 4. Patterns to ban from now on

### Rule text for `alyr-site-page` (proposed, under "Don't", as "Words that read as written by a machine")

1. **Feature titles, facts, tags, menu lines and step titles are plain nouns or one plain sentence.** "Gapless numbering", "Receipts for shops without a CR". No slogan fragments ("Every paper final"), no puns on a product's name (shelf, docs, paper).
2. **One slogan per site:** the homepage H1. Every other heading names what the section holds, in the owner's words, and matches the link that leads to it ("How we work", "Questions", "What's in ALYR Docs").
3. **A two-line heading is one sentence broken in two**, never two slogans stacked.
4. **No questions outside the Questions section.** Not in a heading, fact, tag, step title or the "Who it's for" line. In Questions, ask as an owner asks ("Will my staff use it?"); at most one objection written as a statement per page.
5. **No stacked fragments or tricolons in headings:** no "X. Y. Z.", no "One X, one Y, one Z", no comma lists used as titles.
6. **No colon reveals** in headings, facts, tags, menu lines, step titles or captions' openings. In body text a colon introduces a list or an example only.
7. **No denial or contrast openers:** "No guesses and no scores.", "Not everything should be automatic.", "Not X, but Y".
8. **No filler words:** polite(ly), honest(ly), simply, easily, truly, really (unless it is a real fact), powerful, beautiful.
9. **No grandiosity or punchlines:** "the businesses that win", "You decide." or "Nothing lost." standing alone at the end of a paragraph.
10. **No personification beyond what the product does:** it sends, counts, checks, records and pauses. It does not step back, go quiet, seal or read.
11. **The lead adds a fact the H1 did not give.** It never restates it.
12. **Say it once.** A line used on two pages, or twice on one page, is reworded, unless it is a template label (product names, "Works with the rest of ALYR", the contact block).
13. **Eyebrows only for a product's state or a name the heading lacks.** Never an eyebrow that restates the heading or a nav link.

### Proposed additions to the banned-words check (`scripts/site/banned-words.json`, a new `style` block, read by `banned-words.mjs`)

Apply the label patterns only to label keys (`title`, `eyebrow`, `facts`, `tags`, `tab`, `name`, `line`, `label`, `descriptor`, `callouts`, `items` of `inside.groups`), never to `faq.items[].q`/`a`, `chat`, `scene`, `rows` (sample data) or `prefill`. A true use goes in `allow/banned.json` with its reason, as today.

| Pattern | Regex (JavaScript, `u` flag; `i` where marked) | Applies to |
|---|---|---|
| Question as a label | `[?؟]` | label keys |
| Stacked short sentences ("Check. Set up. See.") | `^(?:[^.?!]{1,28}\.\s+){2,}` | label keys |
| "One X, one Y, one Z" | `\b(one\|every\|no)\s+\w+,\s+(?:one\|every\|no\|two)\s+\w+,\s+(?:and\s+)?(?:one\|every\|no)\s+\w+` (i) | all copy |
| Colon reveal in a label | `^[^:]{2,40}:\s+\S` | label keys (a time like "4:30" does not match because of the space rule) |
| "X means X" | `\b(\w+)\s+means\s+\1\b` (i) | all copy |
| Arabic "X يعني X" | `(?<![\p{L}])(\p{L}+)\s+يعني\s+\1(?![\p{L}])` | all copy |
| Filler words | `\b(?:polite(?:ly)?\|honest(?:ly)?\|simply\|easily\|effortless(?:ly)?\|truly\|powerful\|beautiful(?:ly)?)\b` (i) | all copy |
| Arabic filler | `(?:لبقة\|بصراحة\|بكل سهولة)` | all copy |
| Grandiosity | `\b(?:businesses that win\|game[- ]chang\w*\|next[- ]level\|transform\w*\|everything you need)\b` (i) | all copy |
| Denial opener | `^(?:No\|Not)\s+\w+(?:\s+\w+)?\s+(?:and\|or\|but)\s+(?:no\|not)\b` (i) | body keys (`body`, `lead`) |
| Personification | `\b(?:steps?\s+back\|goes?\s+quiet\|seals?\|sealed)\b` (i) | all copy |
| Stage direction | `\bFollow one \w+ through\b` (i) | all copy |
| Punchline closer | `(?:^\|[.!]\s)(?:You decide\|Nothing lost\|Issued means final)\.` (i) | all copy |

Two checks that are not a single regex, worth adding to `check.mjs` as warnings first:

- **Repeated lines:** any string of six words or more that appears in two or more page objects (`pages.*`, `product`, `home`), outside an allow list of template labels, warns with both paths.
- **Lead restates the H1:** when more than half of the hero lead's content words (after dropping a stop list) are in the hero title, warn.

## What was not checked

- The homepage products section (`home.suite`), on purpose: another agent is editing it.
- Every Arabic line is my draft, not checked by a native reader (ALY-66). I did not read the whole Arabic file line by line; I read its headings, labels, facts, list items and questions, and flagged the Arabic where it mirrors an English finding.
- Sample data in drawings (chat bubbles, sheet rows, the order page, the receipt paper) was not audited for style.
- Whether each proposed line fits its layout at 320 px, or changes a heading's line break, is not checked; rows 37, 50, 57, 65, 70 and 78 change two-line H1s.
- The live site was read through a text fetch of `/` and `/docs` only; the other live pages were not opened. Social cards, `llms.txt` and the JSON-LD were not read, though they take their words from the same keys.
- The proposed regexes were not run against the copy, so their false positives are unknown.
- No branch, commit, Linear issue or status update was made: no issue was given, the founder approves this table first, and `docs/status.md` is being edited by the agent on this branch.
