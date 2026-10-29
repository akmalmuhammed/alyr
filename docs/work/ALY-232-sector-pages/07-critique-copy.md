# Critique: copy, claims and Arabic (ALY-232, ALY-233)

Independent critic, 25 Oct 2026. Branch `aly-232-sector-pages` (commit 14e056a), worktree
`D:\alyr-sector`, read against the static build served at http://localhost:3141. That build's
`alyr-build` meta reads `5be053b…-dirty`: it was built from the working tree before the commit,
not from 14e056a. Every string I compared between the page and `copySectors.ts` /
`copyGuides.ts` matched. Nothing was edited, rebuilt or committed. I only wrote this file.

**This is not the native Arabic sign-off.** Every Arabic line stays a draft until ALY-66.

## Counts

| What | Count |
|---|---|
| Strings read in `copySectors.ts` (multi-word, English / Arabic, sample rows included) | about 222 / 219 |
| Strings read in `copyGuides.ts` | about 131 / 129 |
| Pages rendered and read (all `<details>` text is in the HTML) | 20: 6 sectors, the guides index and 3 guides, each also under /ar |
| Machine copies read | 10 `.md` copies, `/llms.txt`; `/llms-full.txt` searched |
| JSON-LD blocks read | 20 (WebPage, BreadcrumbList, FAQPage, CollectionPage, Article) |
| aria-labels, alt text, og/twitter meta read | every page; 2 social cards opened (fashion, a guide) |
| Code read to check verbs | `ledger/chat.py`, `ledger/service.py`, `ledger/ageing.py`, `items/commands.py`, `presets_catalog.py`, `bookings/chat.py`, `bookings/service.py`, `agent/insights.py`, `agent/week.py`, `items/report.py`, `core/templates.py`, `_customer/order/copy.ts`, `copy.ts` (`pages.bookings`, `pages.accounts`, `home.faq`, `pages.docs`) |
| Findings | **P0: 1 · P1: 6 · P2: 29** |

## What already passes

- **Hard rules.** I found no AI word, no "smart" or "learns", no "rule" / «قاعدة» about ALYR,
  no price, "free" (as cost), "money back" or offer, no "keep your number", no "48 hours", no
  WhatsApp or Meta logo or partner claim, and no clinic, patient or health line. This covers
  the copy, the meta, `llms.txt`, the `.md` copies, the JSON-LD and the alt text. The footer
  disclaimer is on every page and every `.md` copy. The JSON-LD has no `offers`,
  `aggregateRating` or review.
- **Authorship.** Each guide is signed "ALYR team" on the page, in the `.md` copy, on the
  social card and as the Article `author` (an Organization). No founder name appears.
- **Answer first.** Each sector page answers its H1 in its first two sentences. Each guide's
  "In short" is 94 to 99 words in English, gives the answer in its first sentence and works
  without ALYR. ALYR comes only in its last clause and in the closing "With ALYR" section.
- **Limits said where needed.** "One booking at a time" is on the salon and home services
  pages, "Table bookings are not in ALYR yet" is on the restaurant page, delivery is "once we
  switch it on", and "ALYR does not track drivers" / "no map" is said.
- **Verbs I checked against the code that hold:**
  - "How much do I owe?" / «كم علي» are in `BALANCE_WORDS`.
  - "I'll pay within a week" / «سأدفع خلال أسبوع» is the reminder's button label. A promise
    lasts 7 days (`PROMISE_DAYS`).
  - Reminder tiers: friendly under 60 days, firm from 60, final from 90. Cooldown is 3 days
    (`REMINDER_COOLDOWN_DAYS`), and "stop" is honoured.
  - A payment settles the oldest purchase first.
  - Staff "sold out" / «نفد» and "back" / «رجع» are in `items/commands.py`.
  - Booking words: "my booking" / «حجزي», and the reminder goes 2 hours before
    (`REMIND_BEFORE`). A cancelled booking gets no reminder.
  - The order page has "For which day?" for made-to-order items, sizes, options and choices
    (so gift wrapping as a choice holds). It has no order note, and the copy claims none.
  - The grocery preset leaves sold-out items out (`sold_out="hide"`), so "left out of the
    page" is true for groceries.
  - ALYR Agent findings exist for promises passed, over limit, unmarked visits, repeat
    no-shows and the no-show rate over 30 days.
- **Samples.** Each figure has "Sample" once in its bar and the machine line first. Order
  numbers (#1187, #1188) are plausible. The sample names are first names, flats and villas,
  with no business names.
- **Arabic basics.** ALYR is feminine and the product names are masculine throughout. Numbers
  agree: «30 يوماً», «3 أيام», «14 شخصاً», «ثلاثة كراسٍ», «خمسة مقاسات», «فريقاك». Digits are
  Western. No currency appears. «نجهّز», «الحسابات الآجلة», «وعد بالسداد», «صندوق الفريق» and
  «المستحقات» follow the term list. The /ar pages carry no stray English beyond the product
  names, "ALYR" and "Meta".

## P0: untrue, legally risky, or against a founder decision

| # | Key | Problem | Replacement EN | Replacement AR |
|---|---|---|---|---|
| P0-1 | `sectorsEn.items.groceries.day.orders[1]`, `sectorsAr.items.groceries.day.orders[1]` | The "with ALYR" side of the grocery figure shows Ahmed · "Pays Thursday" · Rafi · "Promise recorded". That is not built. A promise exists only as the reminder's one-tap "I'll pay within a week", which is fixed at 7 days (`ledger/service.py` `promise_to_pay`). Staff cannot record a promise, and no promise takes a named day. The drawing shows a feature ALYR does not have. | `{ ref: "Credit", who: "Ahmed", what: "Credit sale, new balance sent", by: "Rafi", status: "Recorded", tone: "ok" }` (the chat on the "today" side can stay as it is) | `{ ref: "آجل", who: "أحمد", what: "بيع آجل، أُرسل الرصيد الجديد", by: "رفيع", status: "سُجّل", tone: "ok" }` |

## P1

| # | Key | Problem | Replacement EN | Replacement AR |
|---|---|---|---|---|
| P1-1 | `sectorsEn.items.fashion.title`, `.meta.description` (and so the social card, JSON-LD and `llms.txt`); same in `sectorsAr` | The H1 says the shop "can answer every 'still available' message". ALYR answers only when the customer sends a code, link or item name. A free-text "still available?" under a screenshot goes to the team, as the page's own FAQ `code` says. "Every" is untrue. | Title: "How a fashion or gift shop in Qatar can show customers what is still available". Meta: "How a fashion, abaya or gift shop in Qatar can show customers what is still available: each piece on a page with photos, sizes and price, stock counted on every sale, and orders by a piece’s code in the chat. Set up for you by ALYR." | Title: «كيف يُري محل أزياء أو هدايا في قطر عملاءه ما بقي متوفراً». Meta: «كيف يُري محل أزياء أو عبايات أو هدايا في قطر عملاءه ما بقي متوفراً: كل قطعة في صفحة بصورها ومقاساتها وسعرها، ومخزون يُحسب مع كل بيع، وطلب برمز القطعة في المحادثة. تجهّزها لك ALYR.» |
| P1-2 | `sectorsEn.items.fashion.products.rows[1].body` (agent), AR same | "What did not sell" exists only in the Sunday report (`items/report.py` through `modules/report.py`). That report has never been sent to an owner and needs Meta to approve its wording (honesty §2). The ALYR Agent screen shows top items, "Sold out now" and "Low stock", not unsold items. | "Your best sellers, what is sold out or low now, and this week against the same days last week." | «الأكثر مبيعاً، وما نفد أو قارب على النفاد الآن، وهذا الأسبوع مقارنةً بالأيام نفسها من الأسبوع الماضي.» |
| P1-3 | `guidesEn.items["cut-no-shows-with-reminders"].alyr.body`, `.alyr.items[1]`, AR same | "ALYR Bookings does these steps" claims the guide's steps. Two of them are not built. The reminder carries no reply-to-cancel or "1 / 2" answer (`bookings/service.py`, reminder body), and it always goes 2 hours before, never the evening before. The cancel instruction is in the confirmation. | body: "ALYR Bookings covers the confirmation, the reminder and the count. It takes one booking at a time across the whole business, which suits one chair, one room or one team." items[1]: "The confirmation goes at once and says how to cancel. The reminder goes two hours before every booking." | body: «يتولى ALYR Bookings التأكيد والتذكير والعدّ. ويستقبل حجزاً واحداً في الوقت نفسه للنشاط كله، وهذا يناسب كرسياً واحداً أو غرفة واحدة أو فريقاً واحداً.» items[1]: «يصل التأكيد فوراً ومعه طريقة الإلغاء، ويصل التذكير قبل كل موعد بساعتين.» |
| P1-4 | `sectorsEn.items.salons.cta.body`, `sectorsEn.items["home-services"].cta.body`, AR same | "comes to show you a booking from your own chat" can be read as the shop's own WhatsApp chat working with ALYR at the first visit. That is close to the forbidden "in the chat you already use" (honesty §2, ALY-39). The product pages' accepted form is "on your own phone". | Salons: "Send us a message. A person from ALYR replies, then comes to show you a booking made from a chat on your own phone." Home services: "…then comes to show you a visit booked from a chat on your own phone." | Salons: «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يأتي ليريك حجزاً يتم من محادثة على هاتفك.» Home services: «…ثم يأتي ليريك زيارة تُحجز من محادثة على هاتفك.» |
| P1-5 | `sectorsAr.items["home-services"].title`, `.meta.description` (and the Arabic JSON-LD `name`) | «على عملائها وفريقها في موقع العمل» reads as replying "to its customers and to its team at the site": the team becomes a second object of «تردّ على». The meta is worse: «وفريقها في عمل». The Arabic H1 does not say what the English says. | n/a | Title: «كيف تردّ شركة خدمات منزلية في قطر على عملائها حين يكون فريقها في موقع العمل». Meta: «كيف تردّ شركة خدمات منزلية في قطر على عملائها حين يكون فريقها في موقع العمل: زيارات تُحجز من المحادثة مع تذكير قبل كل زيارة، وقطع غيار تُطلب من صفحة، وعملاء العقود على الحساب. تجهّزها لك ALYR.» |
| P1-6 | `sectorsAr.items.salons.note`, `.faq.items[0].a`; `sectorsAr.items["home-services"].note`, `.faq.items[0].a`; `guidesAr.items["cut-no-shows-with-reminders"].alyr.body` | The limit is written «حجزاً واحداً في كل وقت» ("one booking at every time"). That is ambiguous: it can read as one booking at all times. The accepted Arabic on the homepage and `/bookings` is «حجزاً واحداً في الوقت نفسه». The limit must read exactly. | n/a | Salons note: «يستقبل ALYR Bookings اليوم حجزاً واحداً في الوقت نفسه للنشاط كله: يناسب كرسياً واحداً أو غرفة واحدة.» Home services note: «يستقبل ALYR Bookings اليوم زيارة واحدة في الوقت نفسه للنشاط كله.» In the two FAQs and the guide body, change «في كل وقت» to «في الوقت نفسه» (see also P2-15). |

## P2

| # | Key | Problem | Replacement EN | Replacement AR |
|---|---|---|---|---|
| P2-1 | `sectorsEn.figure.title` (also the figure's aria-label), AR same | "The same afternoon" is wrong for three of the six figures: groceries run 6:40 to 7:42 pm, home services 7:55 to 8:40 am, and restaurants 11:05 to 11:48 am. (The label is inherited from the homepage.) | "The same hour, today and with ALYR" | «الساعة نفسها، اليوم ومع ALYR» |
| P2-2 | `sectorsEn.figure.body`, AR same | "On the start side … On the end side" is CSS's logical direction leaking into the copy, and it reads as written by a machine. The Arabic «في جهة البداية» is a literal translation. | "Today’s chats as they pile up on one side, the same customers as ALYR keeps them on the other. Drag the fold, or use the two buttons." | «على جانبٍ المحادثات كما تتراكم اليوم، وعلى الجانب الآخر العملاء أنفسهم كما ترتبهم ALYR. اسحب الطيّة أو استخدم الزرّين.» |
| P2-3 | `sectorsEn.items.salons.answer`, AR same | "ALYR Bookings does these four steps" includes "mark who came", which your team does. One sentence also makes two claims. | "Let customers pick a free time from a page that opens in the chat, confirm it at once, and send a reminder two hours before the visit. Then mark who came, so you know how many did not. ALYR Bookings sends the page, the confirmation and the reminder, and gives your team a Came or No-show button. ALYR Agent counts your no-shows over 30 days." | «دع العملاء يختارون وقتاً متاحاً من صفحة تفتح في المحادثة، وأكّد الحجز فوراً، وأرسل تذكيراً قبل الموعد بساعتين. ثم سجّل من حضر، لتعرف كم عميلاً لم يحضر. يرسل ALYR Bookings الصفحة والتأكيد والتذكير، ويعطي فريقك زرّي «حضر» و«لم يحضر». ويحسب ALYR Agent حالات الغياب خلال 30 يوماً.» |
| P2-4 | `sectorsEn.items.bakeries.answer` (last sentence) | "keeps office regulars on an account that pays later": the account does not pay, the office does. The sentence also joins two products. | "…with one person on your team responsible for it. ALYR sets this up with you, at your bakery. Office regulars can order on an account they pay later." | Last sentence: «تجهّز ALYR ذلك معك في مخبزك. ويستطيع عملاء المكاتب أن يطلبوا على حساب آجل يسددونه لاحقاً.» |
| P2-5 | `sectorsEn.items.restaurants.answer` (last sentence); `sectorsEn.items.bakeries.faq.items[3].q` and `.a`; AR same | "pays at the end of the month" suggests a month-end statement, and statements have no flow (honesty §2). The answer also says "press Send", but the button is "Send reminders". | Restaurants: "Office lunches can go on an account the office settles later." Bakeries q: "How do offices order now and pay later?" a: "They order on their account, up to a limit you set. Each entry is sent to them with the new balance, and reminders go when you press Send reminders." | Restaurants: «ويمكن أن يكون غداء المكاتب على حساب آجل تسدده المكاتب لاحقاً.» q: «كيف تطلب المكاتب الآن وتدفع لاحقاً؟» a: «تطلب على حسابها حتى الحد الذي تضعه أنت. يُرسَل إليها كل قيد مع الرصيد الجديد، وتذهب التذكيرات حين تضغط «إرسال التذكيرات».» (check that the button's Arabic matches the workspace) |
| P2-6 | `sectorsEn.items.groceries.faq.items[1].a`, AR same | The answer to "Will reminders upset my neighbours?" leaves out that from 90 days the message is a "Final notice … Please pay or contact us today". "Only after 60 days" is also off by one: the code turns firm at 60. | "The first is a friendly reminder. It turns firmer from 60 days, and from 90 days it is a final notice. Nobody gets two within 3 days, a customer can answer “I’ll pay within a week” with one tap, and a customer who says stop gets no more." | «التذكير الأول ودّي، ويصبح أحزم من 60 يوماً، ومن 90 يوماً يصبح إشعاراً أخيراً. لا يصل إلى أحد تذكيران خلال 3 أيام، ويستطيع العميل أن يرد بلمسة «سأدفع خلال أسبوع»، ومن يطلب التوقف لا يصله شيء بعد ذلك.» |
| P2-7 | `sectorsEn.items.restaurants.products.rows[3].body` (shelf), AR same | "Sold out the moment a dish runs out" reads as automatic. The restaurant preset is `rule="switch"`, so a dish goes Sold out when staff mark it, as the page's own FAQ says. | "Photos and prices in Arabic and English, and a dish shown as Sold out as soon as your staff mark it." | «الصور والأسعار بالعربية والإنجليزية، و«نفدت الكمية» على الطبق فور أن يسجّل موظفك نفاده.» |
| P2-8 | `sectorsEn.items["home-services"].faq.items[3].a`, AR same | "Yes." presents ALYR Docs as available, but it is off for every shop. Its page may only say it is set up with you (D-046). | "We can set that up with ALYR Docs: each payment you record then makes a numbered receipt in Arabic and English that says what is left on the account." | «نستطيع أن نجهّز ذلك مع ALYR Docs: عندها تُنشئ كل دفعة تسجّلها إيصالاً مرقّماً بالعربية والإنجليزية يذكر ما بقي على الحساب.» |
| P2-9 | `sectorsEn.items.fashion.faq.items[1].a`, AR same | "One tap opens WhatsApp, ALYR answers with your page" skips the customer sending a message (a `wa.me` link only opens the chat). "Instagram stays where people find you." is a punchline closer (site-page rule 9). | "Put your chat link in your bio. It opens a chat with your shop, and when the customer writes, ALYR answers with your page and the order comes to your screen." | «ضع رابط المحادثة في نبذة حسابك. يفتح الرابط محادثة مع محلك، وحين يكتب العميل تردّ ALYR بصفحتك ويصل الطلب إلى شاشتك.» |
| P2-10 | `sectorsEn.items.groceries.faq.items[3].a`, `sectorsEn.items.restaurants.faq.items[1].a` | "your team marks the order done": the product's word is "complete" (voice.md). | "…: your team marks the order complete." | Arabic already says «اكتمل». No change. |
| P2-11 | `sectorsEn.items.restaurants.answer`, `.meta.description` | "ready to collect": the product's words are "ready for collection". | "…when the order is ready for collection." | No change. |
| P2-12 | `guidesEn.items["stop-losing-whatsapp-orders"].sections[2].steps[1].body`, AR same | "new, confirmed, ready or collected": voice.md lists "collected" as a word to avoid. | "Mark each order new, confirmed, ready for collection or complete." | «وضع لكل طلب حالته: جديد، مؤكد، جاهز للاستلام، مكتمل.» |
| P2-13 | `guidesEn.items["keep-track-of-who-owes-you"].sections[2].body`, AR same | The age bands overlap ("under 30, 30 to 60, 60 to 90"). The product's bands are up to 30, 31 to 60, 61 to 90, and over 90. | "Sort what is owed by age: up to 30 days, 31 to 60, 61 to 90, and over 90. …" | «رتّب المستحقات حسب عمرها: حتى 30 يوماً، ومن 31 إلى 60، ومن 61 إلى 90، وأكثر من 90. …» |
| P2-14 | `guidesEn.items["cut-no-shows-with-reminders"].sections[0].body` ("Both can be fixed."), `.sections[2].steps[2].body` ("Nothing else."), `.sections[3].steps[0].body` ("Without it, you are guessing."), AR same | These are punchline closers (site-page rule 9). | Cut "Both can be fixed." Steps[2]: "The name, the day, the time and the place, and nothing else." Steps[0]: "Came or no-show, every evening, so the monthly count is right." | Cut «والأمران يمكن علاجهما.» Steps[2]: «الاسم واليوم والوقت والمكان، لا أكثر.» Steps[0]: «حضر أو لم يحضر، كل مساء، ليكون العدّ الشهري صحيحاً.» |
| P2-15 | Say it once (rule 12): `sectorsEn.items.restaurants.faq.items[0].a` (the homepage's `delivery-apps` answer, word for word); `sectorsEn.items.salons.faq.items[0].a` (homepage and `/bookings` word for word, and the page's own `note`); `sectorsEn.items["home-services"].faq.items[0].a` (repeats its `note`); `sectorsEn.items.bakeries.faq.items[4].a` (the homepage's check-up lines). AR same. | A line used on two pages, or twice on one page. | Restaurants: "No. Keep them for customers who find you there. Regulars who already message you can order direct from your menu page, and ALYR takes no cut of those orders." [F: the no-commission claim stays as on the homepage.] Salons: "With three chairs, two customers can want the same hour, and today ALYR Bookings gives that hour to one of them only. Tell us how your chairs fill, and we’ll tell you whether it fits." Home services: "Then two customers can want the same morning, and today ALYR Bookings gives each time to one visit only. Tell us how your teams work, and we’ll tell you whether it fits before you decide anything." Bakeries: "With a check-up at your bakery, to see how orders reach you today. Then we put your menu, photos and prices on the page in both languages, and show your team how it works." | Restaurants: «لا. أبقِها للعملاء الذين يجدونك عليها. أما العملاء الدائمون الذين يراسلونك أصلاً فيطلبون مباشرة من صفحة قائمتك، ولا تأخذ ALYR نسبة من هذه الطلبات.» Salons: «مع ثلاثة كراسٍ قد يريد عميلان الساعة نفسها، واليوم يعطي ALYR Bookings تلك الساعة لواحد منهما فقط. أخبرنا كيف تمتلئ كراسيك، ونخبرك إن كان يناسبك.» Home services: «عندها قد يريد عميلان الصباح نفسه، واليوم يعطي ALYR Bookings كل وقت لزيارة واحدة فقط. أخبرنا كيف يعمل فريقاك، ونخبرك إن كان يناسبك قبل أن تقرر أي شيء.» Bakeries: «بفحص في مخبزك نرى فيه كيف تصلك الطلبات اليوم. بعدها نضع قائمتك وصورها وأسعارها في الصفحة باللغتين، ونُري فريقك كيف تعمل.» |
| P2-16 | Say it once: `sectorsEn.items.salons.faq.items[1].a` and `[2].a` against `guidesEn.items["cut-no-shows-with-reminders"].alyr.items[0]` and `[2]`; `sectorsEn.items.groceries.faq.items[1].a` against `guidesEn.items["keep-track-of-who-owes-you"].alyr.items[3]` | The guide's "With ALYR" list repeats the sector FAQ almost word for word. | Keep the FAQ (it answers a question). Shorten the guide items to: [0] "Customers book from a page in the chat that shows only free times." [2] "“my booking” lets a customer cancel, which frees the time." [3] "One press sends reminders to everyone 30 days or more behind, with the safeguards on the ALYR Accounts page." | [0] «يحجز العملاء من صفحة في المحادثة لا تعرض إلا الأوقات المتاحة.» [2] «تتيح «حجزي» للعميل أن يلغي، فيعود الوقت متاحاً.» [3] «ضغطة واحدة ترسل التذكيرات إلى كل من تأخر 30 يوماً أو أكثر، مع الضوابط المذكورة في صفحة ALYR Accounts.» |
| P2-17 | `guidesEn.items["cut-no-shows-with-reminders"].meta.description`, AR same | "remind … with an easy way to cancel … By hand or with ALYR Bookings" implies ALYR's reminder carries the way to cancel (see P1-3). | "…mark who came, and act on repeat no-shows. By hand, or with ALYR Bookings for the confirmation and the reminder." | «…وتعامل مع الغياب المتكرر. يدوياً، أو مع ALYR Bookings للتأكيد والتذكير.» |
| P2-18 | `sectorsEn.items.bakeries.answer` (first sentence) | "with its items, quantities and day": the page asks for a day only for made-to-order items. | "…so each order arrives with its items and quantities, and its day when it is made to order, instead of in a voice note." | «…فيصلك كل طلب بأصنافه وكمياته، ويومه إن كان يُحضَّر عند الطلب، بدل رسالة صوتية.» |
| P2-19 | `.cta.body` for bakeries ("your own menu on your own phone"), restaurants ("your own menu in the chat") and fashion ("your own pieces"), AR same | [F] These promise that the shop's own menu is loaded before any sale. The product pages say "show you ALYR Chat on your own phone". Confirm ALYR does this pre-sale work, or use the product-page form. | If not confirmed: "…then comes to show you an order page like yours on your own phone." | «…ثم يأتي ليريك صفحة طلب مثل صفحتك على هاتفك.» |
| P2-20 | `(site)/for/[sector]/opengraph-image.tsx` `alt`; `(site)/guides/[guide]/opengraph-image.tsx` `alt` | The alt is "ALYR · For your business" / "ALYR · Guides" on every card. It does not say what the image shows (the trade, the H1, the products). The Arabic pages give "ALYR". The fashion card also prints "ALYR" twice (the logo, then the "ALYR · Fashion and gifts" eyebrow). | Per page, via `generateImageMetadata`: `` `${s.name}: ${s.title}` `` and `` `Guide by the ALYR team: ${d.title}` ``. The eyebrow becomes `s.name` only. | For /ar, if the card stays English, keep the alt in English text but describe it. Otherwise draw an Arabic card with resvg (arabic.md: never Satori). |
| P2-21 | `sectorsAr.items.*` and `guidesAr.items["keep-track-of-who-owes-you"]`: «العملاء الدائمون» (bakeries accounts row, groceries chat row), «لعملائك الدائمين» (restaurants answer), «للعملاء الدائمين» (restaurants FAQ apps), «لعميل دائم» and «لكل عميل دائم» ×2 (credit guide) | The term list says "regular customer" is «زبون دائم», which ALYR Agent also uses. | n/a | «الزبائن الدائمون», «لزبائنك الدائمين», «للزبائن الدائمين», «لزبون دائم», «لكل زبون دائم» |
| P2-22 | `sectorsAr.crumbs.label`, `sectorsAr.crumbs.business` | «موقعك في الصفحة» means "your place on the page", but a breadcrumb shows the place in the site. «حسب النشاط» also differs from the nav's «حسب نشاطك». | n/a | label: «مسار التنقل»; business: «حسب نشاطك» |
| P2-23 | `sectorsAr.items.*.more` (6 strings: «صفحة المخابز» …) | The link does not say what happens. The English says "See the page for …". | n/a | «اطّلع على صفحة المخابز», «اطّلع على صفحة الصالونات ومحلات الحلاقة», «اطّلع على صفحة البقالات», «اطّلع على صفحة المطاعم», «اطّلع على صفحة الخدمات المنزلية», «اطّلع على صفحة الأزياء والهدايا» |
| P2-24 | `sectorsAr.items.*.subject` («كيف تعمل ALYR لمخبزي» …) | «لـ» + a possessive is a literal "for my bakery". | n/a | «كيف تعمل ALYR في مخبزي», «…في صالوني», «…في بقالتي», «…في مطعمي», «كيف تعمل ALYR مع شركتي», «…في محلي» |
| P2-25 | `sectorsAr.items["home-services"].prefill` | The register is mixed inside one message: MSA «نقدّم» beside Gulf «نبي نشوف» (arabic.md: one register a message). | n/a | «مرحبا ALYR، عندنا شركة خدمات منزلية ونبي نشوف كيف تستقبلون حجوزاتنا.» |
| P2-26 | `sectorsAr.items.fashion.answer`, `.today.items[1]`, `.today.items[2]` | «فتظهر القطعة التي نفدت «نفدت الكمية»» is broken: the piece "appears" as a quoted label. «أي القطع بقي» has the wrong agreement. «يصل الطلب لقطة شاشة» is literal. | n/a | «…فتظهر على القطعة التي نفدت عبارة «نفدت الكمية» بدل أن تنتظر ردّك…»; «ترسل الصور واحدة واحدة، ثم لا تعرف أيّ القطع بقيت.»; «يصل الطلب على شكل لقطة شاشة، وعلى أحدهم أن يكتشف أي قطعة هي.» |
| P2-27 | `sectorsAr.items.bakeries.today.items[1]`, `[2]` | «لـ 12» has a plain space, so the line can break between «لـ» and the number (arabic.md: no-break space). In ««طلبي جاهز؟» تصل» the verb has no clear subject. | n/a | «…«مثل المرة الماضية، لـ\u00a012 شخصاً»…»; «تصل رسائل «طلبي جاهز؟» طوال العصر ويداك في العجين.» |
| P2-28 | `sectorsAr.items.restaurants.note`, `.faq.items[3].a` (last sentence) | «غير موجود في ALYR بعد» does not follow the term list's "not yet". | n/a | «لا يتوفر حجز الطاولات في ALYR بعد.» |
| P2-29 | `guidesAr.items["stop-losing-whatsapp-orders"].sections[1].steps[1].body` («حين يتحقق أيّهما»), `.alyr.items[3]` («عدد في اليوم»); `guidesAr.items["keep-track-of-who-owes-you"].sections[1].steps[1].body` («لا يجد ما يعترض عليه») | «أيّهما» is left incomplete. "A number a day" reads as a count, not a cap. "Finds nothing to dispute" is stronger than the English "has little to dispute". | n/a | «…وتوقف عن استقبال الطلبات حين يتحقق أحدهما.»; «يمكن أن يكون لكل صنف حدّ يومي ووقت تُغلق فيه الطلبات.»; «العميل الذي يرى كل قيد قلّما يجد ما يعترض عليه في آخر الشهر.» |

Smaller notes, not counted as findings:

- The credit guide uses «دين» / «عمر الدين» five times. The term list avoids «ديون» (as debts owed to you) and «دفتر الديون». In a guide written for a notebook, «عمر الدين» is natural. The native reviewer should decide.
- "this week against the same days last week" closes four Agent rows (bakeries, restaurants, home services, fashion). Each sits on a different page, but it is close to a template line.
- «رفيع» is the usual Arabic spelling of the name Rafi. It is also an ordinary adjective ("thin", "high"). The native reviewer may prefer «رافي».

## Conditions said elsewhere and not repeated here (for the founder, not counted)

- Payment reminders and booking reminders go as Meta templates (`payment_reminder*`,
  `booking_reminder`). So does a credit-entry notice outside the customer's 24-hour window
  (`entry_recorded`). Status records them as submitted on 12 Oct, with Meta refusing the
  Arabic booking reminder once (it was resubmitted). I found no record of approval. The new
  pages state reminders and "the customer is told each entry" without that condition, as
  `/bookings` and `/accounts` already do. If the templates are still pending, that is a
  site-wide condition, not one for these pages alone.
- Each payment reminder carries a link to the payment page, which is still a test page.
  The new pages do not mention the link, so nothing on them is untrue. `/accounts` says
  the payment page is a test page.
- "ALYR takes no commission" (restaurants) is the homepage's own line with the offer off.
  It stays [F] in `03-messaging.md`.
- The guides' date (25 Oct 2026) is the day they were written. Set `published` to the day of
  publishing, as `00-founder-decisions.md` says.

## Names checked and not checked

| Name | Where | Check |
|---|---|---|
| Flat 12 / «شقة 12», Villa 7 / «فيلا 7» | grocery figure | Generic addresses, not businesses. No search needed. |
| Ahmed, Fatma, Saleh / «أحمد», «فاطمة», «صالح» | grocery figure | First names only, so no business could match. Not searched. Fatma also appears in the homepage's restaurant row, which is harmless. |
| Rafi, Joseph / «رفيع», «جوزيف» (staff) | grocery figure | First names only. Not searched. |
| Karim | no-shows guide example | Reused from the homepage's salon row. A first name. |
| Noora, Hessa, Khalid, Maryam, "Office, West Bay", Mariam, "Villa 22, contract", Jassim, "Office, Lusail", Abdulla, Hamad… | the other five figures | Reused from the homepage rows already published. Not re-checked. |
| Kunafa, maamoul, basmati rice, AC filters | samples | Products, not names. |

No new name could be a business, so I ran no web search (25 Oct 2026). Qirfa, Dafira and
Zilal do not appear on these pages.

## Not checked

- **The native Arabic.** I am not the sign-off. Everything above is a non-native critic's
  reading for ALY-66.
- Whether Meta has approved the reminder, entry and report templates since 13 Oct (see above).
- The visuals: layout at 320, 390 and 1440 px, dark mode, how the figure's fold behaves, and
  the Arabic social cards (the /ar pages serve the English card).
- The homepage's business panels that now link to these pages (`more`), beyond reading the
  string.
- The pages with `NEXT_PUBLIC_ALYR_OFFER=on`. The new copy has no offer-gated strings, so
  nothing should change.
- `/llms-full.txt` in full. I only searched it for the new pages, sample names and banned
  words.
- Whether the build at :3141 (`5be053b…-dirty`) is exactly 14e056a. The strings I compared
  match.
- Whether a "chat link for your Instagram bio" exists as a product feature. I found the
  share-link number setting (`items/service.py` `whatsapp_digits`) and `wa.me` links on the
  customer pages, but no dedicated bio-link screen.
