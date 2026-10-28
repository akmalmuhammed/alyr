# ALYR Shelf and ALYR Docs: messaging

20 Oct 2026, Growth lane, for the two new product pages and the site-wide changes that come with them. English is final. Arabic is a careful draft for the native review (ALY-66); no agent signs it off. Nothing here is in code or published.

**Order of authority.** `00-founder-decisions.md`, then `CLAUDE.md`, then `docs/decisions.md` (D-034, D-035, D-037, D-039, D-042), then `01-truth.md`, then this file. Product wording was read from the code on `origin/main` at 647d77d, not from summaries: `modules/items/wa_text.py`, `items/notes.py`, `items/text.py`, `presets_catalog.py`, `_workspace/catalogCopy.ts`, `_customer/order/copy.ts`, `modules/documents/words.py`, `documents/delivery_words.py`, `documents/sales.py`, `documents/payments.py`, migration 0038, `_workspace/documentsCopy.ts`, `(product)/d/[slug]/page.tsx`, `modules/agent/view.py`.

**Marks.**
- **(live)** reused word for word from `copy.ts` on `main`.
- **(product)** the product's own words, quoted exactly; they appear in a drawn screen or a quote and must not be edited on the site alone.
- **[G]** true only after the named step; the condition sits beside it on the page.
- **[F]** the founder confirms before publishing.

**Rules applied to every line.**
- No AI words, in either language and in no denial: AI, smart, intelligent, learns, understands, thinks, predicts, knows, notices, assistant, agentic, magic. The products count, take, give back, issue, number and refuse. The owner is the one who decides.
- No "coming", "soon", "next", "beta". On the Docs page also no "today", "now", "live", "turn it on" or "switch it on", and nothing that implies a shop can use it yet. Docs is framed the way every ALYR product starts: set up with you, at your shop.
- Prices off (D-034). Every price line is in Appendix A.
- Contact is the email state: "Email us" / «راسلنا بالبريد», "A person from ALYR replies." / «يردّ عليك شخص من ALYR.» (live).
- One fictional business for both pages: **Qirfa Bakery / «مخبز قرفة»** (checked 16 Oct 2026; the founder's manual check is still open). Items and prices come from `seed_qirfa.py`, plus one invented item marked below. Customers are a first name and a father's name: Aisha Hamad «عائشة حمد», Mariam Saleh «مريم صالح», Omar Ali «عمر علي», staff Yusuf «يوسف».
- "Shelf" and "Docs" are never translated as names. Products are masculine in Arabic («يأتي ALYR Shelf»، «يُصدر ALYR Docs»); ALYR is feminine («تجهّز ALYR»).

---

## 1. Positioning

**ALYR Shelf.** ALYR Shelf is where everything a business sells lives in ALYR: items with photos, prices, sizes and colours, choices and extras, and stock, in Arabic and English. It belongs to no single product. It comes with ALYR, with every product, the way ALYR Agent does, and the products sell from it: ALYR Chat's order page and chat orders, ALYR Accounts' orders on account, and the lines on an ALYR Docs paper. In the workspace it keeps the name the shop already uses: Menu, Products or Price list. Its active feel is bookkeeping that keeps itself. Every sale takes its stock in the same step, so the last item can only sell once. A sold-out item says "Sold out" on the order page, or leaves it, as the shop chooses. An unpaid pay-link order gives its stock back after 30 minutes. A staff phone writes «كيك الزعفران خلص» and gets "Done" with an Undo. The stock log only ever adds rows, each with who, when and why.

**ALYR Docs.** ALYR Docs turns the sales and payments already in ALYR into paper: receipts, invoices, quotations, delivery notes, credit notes and deposit receipts. Arabic comes first, the numbers never skip, and issued paper cannot change. It is set up with you at your shop, like every ALYR product, and the page never says or implies that a shop can use it yet. Its active feel is the paper that follows the sale. A payment recorded becomes a receipt with the next number, sent to the customer. An order put on a credit account becomes an invoice. A cancelled order with a receipt becomes a credit note. The CR rule is part of its warmth, not a warning: no commercial registration, receipts, each saying so plainly; invoices once your CR number is added.

**Where they sit in the suite.** The suite's order becomes **Chat, Bookings, Agent, Accounts, Shelf, Docs**: the fixed order stays as it is, and the two new ones take Payroll's place at the end, in `catalog.py`'s module order (catalog before documents). [F] The alternative is Shelf beside Agent ("with every product" together); it breaks the fixed order every page already uses, so it is not recommended.

---

## 2. Names, descriptors and states

| Key | Name | Descriptor (EN) | Descriptor (AR) | Menu line (EN) | Menu line (AR) | State (EN · AR) | Route |
|---|---|---|---|---|---|---|---|
| `shelf` | ALYR Shelf | Items and stock | الأصناف والمخزون | Everything you sell: photos, prices, sizes and stock | كل ما تبيعه: الصور والأسعار والمقاسات والمخزون | With every product · مع كل منتج | `/shelf`, `/ar/shelf` [F] |
| `docs` | ALYR Docs | Receipts and invoices | الإيصالات والفواتير | Receipts, invoices and credit notes from your sales | إيصالات وفواتير وإشعارات دائنة من مبيعاتك | Set up for you · نجهّزه لك | `/docs`, `/ar/docs` [F] |

**The founder's line for Shelf**, "Everything you sell, on one shelf.", is the first line of the recommended H1 (3.1). In Arabic it becomes «كل ما تبيعه، في مكان واحد.», not «على رفّ واحد»: «رفّ» in the line would read as a translation of the product's name, which the rules forbid, and the pun does not carry.

**Why «الأصناف والمخزون» for Shelf.**
1. They are the product's own words: the Catalog's two tabs are «الأصناف» and «المخزون» (`catalogCopy.ts`), and the order page and chat already say «الأصناف».
2. «المنتجات» is taken: it is the site's menu label for ALYR's own suite and the workspace's Products screen (D-039 "Naming"), and it is also the salon and shop name for the section. Using it would make "products" mean two things in one menu.
3. «الكتالوج» is a loanword, and it is the workspace's fallback name for a shop with no type; «القائمة» means a restaurant's menu only.
4. It is short enough for the Products menu row at 320 px, and parallels the other descriptors («الحسابات الآجلة»، «المواعيد والتذكيرات»).
5. Rejected: «كل ما تبيعه» (good as a line, too loose as a descriptor), «الأصناف والصور والمخزون» (too long for the menu), «رفّ المتجر» (translates the name).

**Why «الإيصالات والفواتير» for Docs.** It names the two papers owners ask for, in the product's words (`words.py`: «إيصال», «فاتورة»). «المستندات» stays the workspace section's name; as a descriptor it would only restate "Docs". Receipts come first because a shop with no CR issues only receipts.

---

## 3. `/shelf`: ALYR Shelf

Sample business: **Qirfa Bakery / «مخبز قرفة»**, monogram QB / «ق». A bakery shows all four ways a thing runs out: a number each day, counted, made to order, and by weight. Items, from `seed_qirfa.py` unless marked:

| Item code | EN | AR | Price | How it runs out |
|---|---|---|---|---|
| 104 | Butter croissant | كرواسون بالزبدة | QAR 12 | A number each day: 40 |
| 108 | Saffron milk cake, slice | كيك الحليب بالزعفران، قطعة | QAR 26 | A number each day: 24 |
| 109 | Pistachio kunafa cheesecake | تشيز كيك الكنافة بالفستق | QAR 185 | A number each day: 6 |
| 110 | Celebration cake, 1 kg | كيكة مناسبات، 1 كغ | QAR 220 | Always available (made to order); order before 6 pm for tomorrow |
| 131 | Date maamoul *(invented for the weight example)* | معمول التمر | QAR 60 a kg | Counted in stock, by weight |

Item codes start at 101 for each shop and are never reused; these are plausible for a 14-item menu plus later items. Orders continue the homepage's Qirfa numbers (#1439 to #1441 on Wed 14 and Thu 15 Oct): the Shelf figures are **Sat 17 Oct 2026** (a Saturday), orders #1450 to #1454. Prices on sample items are samples; the caption says so once.

Caption suffix on every figure: "Sample, fictional bakery" / «مثال: مخبز غير حقيقي» (live, `fig.fictional`).

### 3.0 Product bar

ALYR Shelf · How it works · What's in it · Works with
«ALYR Shelf · كيف يعمل · ماذا يتضمن · يعمل مع»
(No call to action, as on every product page.)

### 3.1 Hero: three options, ranked

All three share the demo (3.1d), the contact block and the facts row's shape: three facts on one rule. Eyebrow: **ALYR Shelf · With every product** · «ALYR Shelf · الأصناف والمخزون · مع كل منتج» (the Arabic eyebrow carries the descriptor, as `/bookings` and `/accounts` do).

**Option 1 (recommended).**
- H1: **Everything you sell, on one shelf. / Every sale counts the stock down.**
  «كل ما تبيعه، في مكان واحد. / ومع كل بيع، ينقص المخزون تلقائياً.»
- Lead: Your items with photos, prices, sizes and choices, in Arabic and English. Each sale takes its stock in one step, so the last one sells only once. When something runs out, the order page says Sold out, and a staff phone brings it back with one message.
  «أصنافك بصورها وأسعارها ومقاساتها وخياراتها، بالعربية والإنجليزية. كل بيع يأخذ كميته من المخزون في خطوة واحدة، فلا تُباع القطعة الأخيرة إلا مرة واحدة. وحين ينفد صنف تكتب صفحة الطلب «نفد»، ويعيده هاتف الموظف للبيع برسالة واحدة.»
- Facts: With every ALYR product · The last one sells only once · Counted, by the day or by weight
  «مع كل منتجات ALYR · القطعة الأخيرة تُباع مرة واحدة · بالعدد أو باليوم أو بالوزن»
- Why first: it carries the founder's line word for word, and the second line is the one active fact a visitor can check in the demo beside it. It is true for every shop with counted or daily items; a made-to-order item has no count, and the lead does not claim otherwise.

**Option 2.**
- H1: **The last cake sells once. / Then the page says Sold out.**
  «الكيكة الأخيرة تُباع مرة واحدة. / ثم تكتب الصفحة «نفد».»
- Lead: as Option 1.
- Facts: as Option 1.
- Why second: the most vivid, and exactly the race the tests prove, but it is a bakery's line on a page that also serves groceries, fashion and wholesale, and it drops the founder's line.

**Option 3.**
- H1: **Your menu, with its stock. / It keeps count while you work.**
  «قائمتك، ومعها مخزونها. / يعدّ عنك وأنت تعمل.»
- Lead: as Option 1.
- Facts: as Option 1.
- Why third: "menu" is a restaurant and bakery word (a grocery calls it Products, a wholesaler Price list), and "keeps count" is softer than "counts the stock down".

### 3.1d The demo beside the hero (`ProductDemo`)

Each tab is a chat beside a panel, in the product's real words. Business: Qirfa Bakery, "Business account" / «حساب أعمال» (live). Note under it: "Sample conversation with a fictional bakery." / «محادثة توضيحية مع مخبز غير حقيقي.» Tabs label: "What ALYR Shelf does" / «ما يفعله ALYR Shelf».

| Tab (EN · AR) | Moment (01 §4) | Chat (product wording) | Panel | Caption (EN / AR) |
|---|---|---|---|---|
| Sold out · نفد | 3 | Staff (Yusuf): "sold out saffron cake" / «كيك الزعفران خلص» → "Done: Saffron milk cake, slice is now sold out. Customers cannot order it." [Undo] / «تم: نفد «كيك الحليب بالزعفران، قطعة». لا يستطيع العملاء طلبه.» [تراجع] (product) | Her phone: the order page, the item card greyed, label "Sold out" / «نفد» (product) | One message from a staff phone, and customers cannot order it. Undo puts it back. / رسالة واحدة من هاتف الموظف، فلا يستطيع العملاء طلبه. وزر «تراجع» يعيده. |
| The last one · الأخيرة | 1 | Event: "Aisha placed order #1452" · event: "Mariam's page: Pistachio kunafa cheesecake is now sold out." / «صفحة مريم: نفد تشيز كيك الكنافة بالفستق الآن.» (product notice) | Stock: Pistachio kunafa cheesecake, "Only 1 left today" → "Sold out"; log row "Sold · order #1452" / «مبيع · الطلب رقم 1452» | One left, two customers, one sale. The second is told before she orders. / بقيت قطعة واحدة وطلبتها عميلتان، فبيعت مرة واحدة. والثانية عرفت قبل أن تطلب. |
| By code · بالكود | 4 | Customer: "108 x2" → card "Item code 108 · 2 x Saffron milk cake, slice - QAR 26 · Total: QAR 52 · Tap Confirm to add these to your order." [Confirm] [Change] → "Added to your order." [Place order] [Empty order] / «‏108 x2» → «كود الصنف 108 · ‏2 x كيك الحليب بالزعفران، قطعة - 26 ر.ق · الإجمالي: 52 ر.ق · اضغط تأكيد لإضافتها إلى طلبك.» [تأكيد] [تغيير] → «تمت الإضافة إلى طلبك.» [إتمام الطلب] [تفريغ الطلب] (product: `card_code`, `line_qty`, `total`, `check_ask_many`, `draft_added`, buttons) | Draft order: "2 x Saffron milk cake, slice - QAR 26" · "Total: QAR 52" | Customers order by the code on your menu. A code it cannot match, or a voice note, goes to your team. / يطلب العملاء بالكود المكتوب في قائمتك. والكود الذي لا يطابق صنفاً، أو الرسالة الصوتية، يذهب إلى فريقك. |
| By weight · بالوزن | 6 | Customer: "131 x0.5" | The order page: Date maamoul, QAR 60 a kg, quick amounts "0.25 kg · 0.5 kg · 1 kg" | Sold by the kilo: quick amounts on the page, and "131 x0.5" in the chat. / بالكيلو: كميات جاهزة في الصفحة، و«131 x0.5» في المحادثة. |
| Unpaid · لم يُدفع | 7 | "Order #1453 was cancelled because it was not paid within 30 minutes. The items were put back." / «تم إلغاء الطلب رقم 1453 لأنه لم يُدفع خلال 30 دقيقة، وأُعيدت الأصناف.» (product) | Stock log: "Sold · order #1453" then "Put back · order #1453" / «مبيع» ثم «أُعيد للمخزون» (product) | An unpaid pay-link order holds its stock for 30 minutes, then gives it back. Payment links open a test page until a payment provider is connected. / طلب برابط دفع لم يُدفع يحجز كميته 30 دقيقة ثم يعيدها. وروابط الدفع تفتح صفحة تجريبية إلى أن يُربط مزوّد دفع. |

Notes for the builder.
- The staff line on `/en` is English and on `/ar` Arabic, as a staff member would write on each. The product matches both and asks which item when several fit; "saffron cake" fits one Qirfa item.
- Draw the order page's labels exactly: "Sold out" / «نفد», "Only 1 left today" / «المتبقي اليوم 1 فقط».
- The stock log's actor for a customer's order: do not draw "Assistant" / «المساعد», which the product can print (`catalogCopy.ts` `actors`): it is on the no-AI list. Draw the row without an actor. Flagged for the product lane in section 8.

### 3.2 How it works, from both sides (`FlowSection`)

- Eyebrow: How it works · «كيف يعمل»
- H2: **What happens when something sells.** · «ماذا يحدث حين يُباع صنف.»
- Body: Your customer sees an ordinary order page. Behind it, ALYR Shelf takes the stock, writes the log and changes what the page shows. Follow one item through. · «يرى عميلك صفحة طلب عادية. وفي الخلفية يأخذ ALYR Shelf الكمية من المخزون، ويكتب السجل، ويغيّر ما تعرضه الصفحة. تابع صنفاً واحداً من البداية.»
- Columns: Your customer «عميلك» (On WhatsApp, as always «على واتساب كعادته», live) · WhatsApp «واتساب» (Business Platform «منصة الأعمال», live) · **ALYR Shelf** (Working in the background «يعمل في الخلفية»; idle: Waiting for the next sale «بانتظار البيع التالي») · Your team «فريقك» (The workspace «مساحة العمل», live).
- Note: Sample conversation with a fictional bakery. · «محادثة توضيحية مع مخبز غير حقيقي.»

**Story 1: The last one sells once** · «القطعة الأخيرة تُباع مرة واحدة»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | team | One left today · بقيت واحدة اليوم | Qirfa makes 6 kunafa cheesecakes a day. Five have sold, so the order page says "Only 1 left today". · يحضّر مخبز قرفة 6 تشيز كيك كنافة كل يوم. بيعت خمس، فتكتب صفحة الطلب «المتبقي اليوم 1 فقط». | Record: Pistachio kunafa cheesecake · A number each day: 6 · Only 1 left today |
| 2 | in | Two customers want it · عميلتان تريدانها | Aisha and Mariam both put it in their order, seconds apart. · وضعته عائشة ومريم في طلبيهما، بفارق ثوانٍ. | Chat event: "Aisha: Place order" |
| 3 | — | One step at checkout · خطوة واحدة عند الطلب | ALYR Shelf takes the stock only if the count stays at zero or above. Aisha's order is first, so it takes the last one. · لا يأخذ ALYR Shelf الكمية إلا إذا بقي الرقم صفراً أو أكثر. طلب عائشة وصل أولاً، فأخذ القطعة الأخيرة. | Work: "Left today: 1 → 0", "Order #1452 saved" |
| 4 | team | A row in the log, by itself · سطر في السجل تلقائياً | The stock log gains a "Sold" row with the order number. Nobody typed it, and nobody can edit it. · يُضاف إلى سجل المخزون سطر «مبيع» برقم الطلب. لم يكتبه أحد، ولا يستطيع أحد تعديله. | Record: "Sold · order #1452 · 16:05" |
| 5 | out | The second customer is told · العميلة الثانية تعرف | Mariam's order page says it has sold out, before she places her order. · تكتب صفحة الطلب لمريم أنه نفد، قبل أن تُتمّ طلبها. | Chat event: "Pistachio kunafa cheesecake is now sold out." (product) |
| 6 | team | Back tomorrow morning · يعود صباح الغد | A number each day starts again each day, so tomorrow there are 6 again. · العدد اليومي يبدأ من جديد كل يوم، فيعود غداً إلى 6. | Record: "Sold out" · Work: "Tomorrow: 6" |

Step 4 says "nobody can edit it" because the log only ever adds rows (D-039; 01 §1). Corrections are new rows ("Counted", "Corrected"), which is how the screen (3.3) shows them.

**Story 2: A staff phone says it is gone** · «هاتف الموظف يقول: خلص»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | in | A message from a staff phone · رسالة من هاتف موظف | Yusuf's number is registered as staff, so his messages can change the shelf. He writes the way he talks. · رقم يوسف مسجّل هاتفاً لموظف، فتستطيع رسائله تعديل الأصناف. ويكتب كما يتكلم. | Chat (staff): "sold out saffron cake" / «كيك الزعفران خلص» |
| 2 | — | It finds one item · يجد صنفاً واحداً | One item fits, so ALYR Shelf changes it. When several fit, it asks which, and changes nothing until he answers. · صنف واحد يطابق، فيغيّره ALYR Shelf. وحين تطابق عدة أصناف يسأل أيّها، ولا يغيّر شيئاً حتى يجيب. | Work: "Item: Saffron milk cake, slice" |
| 3 | out | Done, with Undo · تم، مع زر تراجع | The reply says exactly what changed. · يقول الرد ما تغيّر بالضبط. | Chat: "Done: Saffron milk cake, slice is now sold out. Customers cannot order it." [Undo] (product) |
| 4 | team | The order page says Sold out · صفحة الطلب تكتب «نفد» | The item is greyed on the order page, or left out, as you choose. · يظهر الصنف باهتاً في صفحة الطلب، أو يُحذف منها، كما تختار. | Record: "Saffron milk cake, slice · Sold out" |
| 5 | team | The change has a name on it · وعلى التغيير اسم صاحبه | The record says who changed it, when, and from which phone. · يقول السجل من غيّره، ومتى، ومن أي هاتف. | Work: "Changed by Yusuf · 15:42" |
| 6 | back | Undo, once · تراجع مرة واحدة | Pressed too soon? Undo works once, for the person who made the change. · أُرسلت مبكراً؟ زر «تراجع» يعمل مرة واحدة، لمن أجرى التغيير. | Chat: "Undone: Saffron milk cake, slice is back on sale." (product) |

**Story 3: An unpaid order gives it back** · «طلب لم يُدفع يعيد الكمية»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | in | An order with a payment link · طلب برابط دفع | Omar orders two croissants and chooses to pay by link. · يطلب عمر قطعتي كرواسون ويختار الدفع برابط. | Chat event: "Ordered 2 items, QAR 24" |
| 2 | — | The stock is held · تُحجز الكمية | His two croissants are held for 30 minutes, so nobody else can take them. The shop can change the 30 minutes. · تُحجز قطعتاه 30 دقيقة، فلا يأخذهما غيره. ويستطيع المحل تغيير المدة. | Work: "Held: 2 · 30 min" |
| 3 | — | 30 minutes, unpaid · مرّت 30 دقيقة دون دفع | The link was not paid in time. · لم يُدفع الرابط في الوقت. | Work: "Hold ended: not paid" |
| 4 | team | The stock comes back by itself · تعود الكمية تلقائياً | The order is cancelled, and a "Put back" row returns the two croissants. A cancellation puts stock back once, never twice. · يُلغى الطلب، ويعيد سطر «أُعيد للمخزون» القطعتين. والإلغاء يعيد الكمية مرة واحدة، لا مرتين. | Record: "Put back · order #1453" |
| 5 | out | He is told · ويُبلَّغ العميل | The customer hears why, in his language. · يعرف العميل السبب بلغته. | Chat: "Order #1453 was cancelled because it was not paid within 30 minutes. The items were put back." (product) |

Under the stories, one line: "Payment links open a test page until a payment provider is connected. An order on a credit account takes its stock straight away." · «تفتح روابط الدفع صفحة تجريبية إلى أن يُربط مزوّد دفع. والطلب على الحساب الآجل يأخذ كميته فوراً.»

### 3.3 The screen you use every day (`ScreenBlock`)

The Stock tab of Qirfa's Menu, at true scale in the workspace window, with the "Recent changes" of one item open. On phones, the workspace's own card layout.

- Eyebrow: The screen · «الشاشة» (live)
- H2: **What is on the shelf, and every change to it.** · «ما على الرف، وكل تغيير عليه.» [F: «الرف» here is the ordinary word, used once in a heading, not the product's name. If the native reviewer reads it as a translation of the name, use «ما لديك الآن، وكل تغيير عليه.»]
- FIG 02 · The Stock screen · Sample, fictional bakery · «الشكل 02 · شاشة المخزون · مثال: مخبز غير حقيقي»
- Label (screen readers): The Stock screen of a fictional bakery's workspace · «شاشة المخزون في مساحة عمل مخبز غير حقيقي»
- Sheet, in the product's words (`catalogCopy.ts`): path "Menu › Stock" / «القائمة › المخزون»; sub "Items you count: what is on the shelf now." (product; Arabic from the product file); columns item, "In the system" / «في النظام»; buttons "Received" «استلام», "Wasted" «هالك», "Count" «جرد»; filter chips "Sold out" «نفدت», "Low stock" «مخزون قليل».
- Rows: Butter croissant 23 of 40 · Saffron milk cake, slice 0 · Sold out · Pistachio kunafa cheesecake 2 of 6 · Low stock · Date maamoul 3.75 kg.
- Recent changes for Date maamoul, newest first: "Sold · order #1454 · 0.5 kg" · "Received · Made today · by Yusuf · 4 kg" · "Wasted · Broken · by Yusuf · 0.25 kg" · "Counted: no difference". (product: `kinds`, `reasonsReceived`, `reasonsWasted`, `countSame`)
- Callouts:
  1. What is left now, for every item you count. · ما تبقّى الآن من كل صنف تعدّه.
  2. Sold out and low stock, one tap away. · ما نفد وما قلّ مخزونه، بنقرة واحدة.
  3. Received, Wasted or Count, with a reason. · استلام أو هالك أو جرد، مع السبب.
  4. Every change, newest first: what, how much, who. Nothing is overwritten. · كل تغيير، الأحدث أولاً: ماذا وكم ومن. ولا يُمحى شيء.

### 3.4 Everything it does (`InsideBlock`, solid rule)

- Eyebrow: What's in it · «ماذا يتضمن» (live)
- H2: **Everything it does today.** · «كل ما يفعله اليوم.» (live; true for Shelf, which is on for new and existing shops)

**For your customers** · «لعملائك»
- Photos, prices, sizes and choices on an order page made for their phone. No app, no account. · الصور والأسعار والمقاسات والخيارات في صفحة طلب مصمّمة لهاتفهم، بلا تطبيق ولا حساب.
- Each item in Arabic and English. An item needs its Arabic name before it goes on sale. · كل صنف بالعربية والإنجليزية، ولا يُعرض صنف للبيع قبل أن يكون له اسم عربي.
- Plain words on when to order: "Ready from 5 pm", "Order before 6 pm for tomorrow". · كلمات واضحة عن موعد الطلب: «متاح من الساعة 5 م»، «اطلب قبل الساعة 6 م ليكون جاهزاً غداً». [Builder: the Arabic times follow the product's own format; check `notes.py` output.]
- "Only 3 left" when stock is low, and "Sold out" when it is gone. · «المتبقي 3 فقط» حين يقلّ المخزون، و«نفد» حين ينتهي.
- Order by item code in the chat ("108 x2"), by name or by link. · الطلب بكود الصنف في المحادثة («‏108 x2»)، أو بالاسم، أو بالرابط.
- Sold by weight or volume, with quick amounts: 0.25, 0.5 and 1 kg. · البيع بالوزن أو الحجم، بكميات جاهزة: 0.25 و0.5 و1 كغ.

**For your team** · «لفريقك»
- Up to 8 photos for each item, with a cover. · حتى 8 صور لكل صنف، وإحداها غلاف.
- Sizes and colours, each with its own stock and price. · مقاسات وألوان، لكل منها مخزونه وسعره.
- Choices and extras, required or optional. · خيارات وإضافات، إلزامية أو اختيارية.
- Four ways to run out: always available, on or off, counted in stock, or a number each day. · أربع طرق للنفاد: متاح دائماً، أو تشغيل وإيقاف، أو محسوب في المخزون، أو عدد في اليوم.
- Times it can be ordered: lead time, a cut-off and days off. · أوقات الطلب: مهلة التحضير، وآخر موعد، وأيام مستثناة.
- From a staff phone: sold out, back, stock, price and undo, in Arabic or English. · من هاتف الموظف: نفد، وعاد، والمخزون، والسعر، والتراجع، بالعربية أو الإنجليزية.
- A photo with its name and price as the caption becomes a draft, until an owner puts it on sale. · صورة يكون تعليقها الاسم والسعر تصبح مسودة، إلى أن يعرضها المالك للبيع.
- Import and export with Excel or CSV, in English or Arabic headings, with a preview of every row and one undo. · الاستيراد والتصدير بملفات Excel أو CSV، بعناوين إنجليزية أو عربية، مع معاينة كل سطر وتراجع واحد. [G: not yet tried in real Excel; 01 §1. Keep only once a real Excel file has been imported, or write "spreadsheet (CSV)".]
- A wholesale price for a group of customers. · سعر جملة لمجموعة من العملاء.
- A share link and QR codes for your order page. · رابط مشاركة ورموز QR لصفحة طلبك.
- Your own fields on items and sizes, up to 20. · حقولك الخاصة على الأصناف والمقاسات، حتى 20 حقلاً.
- Starts from your kind of business: a bakery counts each day and takes orders a day ahead; a grocery counts stock and leaves out what is sold out. · يبدأ بحسب نوع نشاطك: المخبز يعدّ كل يوم ويقبل الطلب قبل يوم، والبقالة تعدّ المخزون وتحذف ما نفد من الصفحة.

**Behind the scenes** · «في الخلفية»
- The last item sells once: the stock is taken in one step at checkout. · القطعة الأخيرة تُباع مرة واحدة: تؤخذ الكمية في خطوة واحدة عند الطلب.
- An unpaid pay-link order gives its stock back after 30 minutes, and the customer is told. · الطلب برابط دفع الذي لم يُدفع يعيد كميته بعد 30 دقيقة، ويُبلَّغ العميل.
- A cancelled order puts its stock back once. · الطلب الملغى يعيد كميته مرة واحدة.
- The stock log only adds rows: received, sold, put back, wasted, counted, corrected, each with who and why. · سجل المخزون لا يزيد إلا سطوراً: استلام، ومبيع، وإعادة، وهالك، وجرد، وتصحيح، ولكل سطر صاحبه وسببه.
- An item with orders behind it is archived, never deleted. · الصنف الذي له طلبات يُؤرشف ولا يُحذف.
- Photos are checked, and their location and camera details removed, before anyone sees them. · تُفحص الصور، وتُزال منها بيانات الموقع والكاميرا، قبل أن يراها أحد.

**When you switch it on** · «حين تفعّله» (a sub-group, still above the solid rule; these are built and off by default)
- Discounts and coupon codes. · الخصومات ورموز القسائم.
- Delivery areas with fees, free over an amount, and a minimum order. · مناطق التوصيل برسومها، ومجاناً فوق مبلغ معيّن، وحد أدنى للطلب.
- Cost price and margin, seen by owners and admins only. · سعر التكلفة والهامش، لا يراه إلا المالك والمشرف.

**Not yet** · «لم يتوفر بعد» (below the dashed rule with the pending dot). Kept short, and worded as what it does not do, never as a promise. Nothing here may say "next".
- Barcodes, batches and expiry dates. · الباركود والدفعات وتواريخ الانتهاء.
- A photo for each size or colour. · صورة لكل مقاس أو لون.
- Delivery maps or drivers. · خرائط التوصيل أو السائقون.
- Changing an item from a staff phone by its code. · تعديل صنف من هاتف الموظف بكوده.

Left out on purpose (never claim, and listing them would read as a promise): Meta catalog sync; where photos are stored.

Note under the rule: "ALYR Shelf comes with every ALYR product. Everything listed above the line is built." · «يأتي ALYR Shelf مع كل منتجات ALYR. كل ما فوق الخط جاهز.»

### 3.5 Who it's for (`WhoBlock`)

- Eyebrow: Who it's for · «لمن صُمّم» (live)
- H2: **Every business that sells things.\nEach starts the way it already works.** · «لكل نشاط يبيع شيئاً.\nوكلٌّ يبدأ كما يعمل اليوم.»
- Rows (tags are features, not products):
  - Bakeries and home kitchens — A number each day · Order before 6 pm · Photos · «المخابز والمطابخ المنزلية» — «عدد في اليوم · اطلب قبل 6 م · الصور»
  - Groceries and baqalas — Counted stock · By weight · Left out when sold out · «البقالات» — «مخزون محسوب · بالوزن · يُحذف ما نفد»
  - Fashion, abayas and gifts — Sizes and colours · Stock for each size · «الأزياء والعبايات والهدايا» — «مقاسات وألوان · مخزون لكل مقاس»
  - Restaurants and cafes — Menu · Choices and extras · On or off · «المطاعم والمقاهي» — «القائمة · خيارات وإضافات · تشغيل وإيقاف»
  - Wholesale and trading — Price list · Wholesale prices · Import from a sheet · «تجارة الجملة» — «قائمة الأسعار · أسعار الجملة · استيراد من ملف»
- Exit: Run something else? Write to us about how you work today. · «نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل اليوم.» (live)

### 3.6 Works with the rest of ALYR (`WorksBlock`)

Rows in suite order, without Shelf. Eyebrow "The products" «المنتجات», H2 "Works with the rest of ALYR." «يعمل مع بقية منتجات ALYR.», link "See {name}" «تعرّف على {name}» (all live).

| Product | EN | AR |
|---|---|---|
| ALYR Chat | The order page and the chat sell from your shelf: by photo, by name or by code. | صفحة الطلب والمحادثة تبيعان من أصنافك: بالصورة أو بالاسم أو بالكود. |
| ALYR Bookings | Services are booked in ALYR Bookings. What you sell beside them is on your shelf, ordered through ALYR Chat. | تُحجز الخدمات في ALYR Bookings، وما تبيعه إلى جانبها في أصنافك، ويُطلب عبر ALYR Chat. |
| ALYR Agent | Comes with it: sold out now and low stock, on your home screen. | يأتي معه: ما نفد الآن وما قلّ مخزونه، على شاشتك الرئيسية. |
| ALYR Accounts | An order on account takes its stock straight away. | الطلب على الحساب الآجل يأخذ كميته فوراً. |
| ALYR Docs | Each line on the paper is an item from your shelf, with its Arabic name, size and choices. | كل بند في المستند صنف من أصنافك، باسمه العربي ومقاسه وخياراته. |

### 3.7 Questions (`QuestionsBlock`)

- Eyebrow: Questions · «أسئلة». H2: **Before you ask.** · «قبل أن تسأل.» (live)
- **Do I pay for ALYR Shelf?** (offer off) It comes with ALYR, with every product. · «هل أدفع مقابل ALYR Shelf؟» «يأتي مع ALYR، مع كل منتج.» (Offer on: Appendix A.)
- **Can I use it on its own?** It comes with every ALYR product. Customers order from it through ALYR Chat, and with ALYR Accounts your regulars can put an order on account. · «هل أستطيع استخدامه وحده؟» «يأتي مع كل منتجات ALYR. يطلب منه عملاؤك عبر ALYR Chat، ومع ALYR Accounts يستطيع عملاؤك الدائمون تسجيل الطلب على حسابهم.»
- **How long does setup take?** We agree your go-live date at the visit. We load your items, photos and prices with you, or from your own sheet. · «كم يستغرق التجهيز؟» «نتفق معك على موعد بدء التشغيل خلال الزيارة، ونضيف أصنافك وصورها وأسعارها معك، أو من ملفك.»
- **What if two customers order the last one?** Only one gets it. The stock is taken in one step at checkout, so the second customer is told it has sold out before she orders. · «وإن طلب عميلان القطعة الأخيرة؟» «يحصل عليها واحد فقط. تؤخذ الكمية في خطوة واحدة عند الطلب، فيعرف العميل الثاني أنها نفدت قبل أن يُتمّ طلبه.»
- **Who can change stock from WhatsApp?** Only the numbers you register as staff. Every change has Undo, and the record says who made it. · «من يستطيع تعديل المخزون من واتساب؟» «الأرقام التي تسجّلها هواتفَ للموظفين فقط. لكل تغيير زر «تراجع»، ويقول السجل من أجراه.»
- **I sell by the kilo.** Set the item by weight, in kilograms or grams. The order page offers quick amounts, and the chat takes "131 x0.5". · «أبيع بالكيلو.» «اجعل الصنف بالوزن، بالكيلوغرام أو بالغرام. تعرض صفحة الطلب كميات جاهزة، وتقبل المحادثة «‏131 x0.5».»
- **Does it use my WhatsApp catalog?** No. Your shelf is your ALYR order page, which opens from the chat. · «هل يستخدم كتالوج واتساب لديّ؟» «لا. أصنافك في صفحة الطلب من ALYR، وتُفتح من المحادثة.» [F: include only if owners ask it at visits; it answers without promising sync (D-039).]

### 3.8 Closing call (`Shell`)

- H2: **Tell us what you sell, and how you keep count today.** · «أخبرنا ماذا تبيع، وكيف تعدّ مخزونك اليوم.»
- Body: Send us a message. A person from ALYR replies, then comes to show you ALYR Shelf on your own phone. · «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Shelf على هاتفك أنت.» (live pattern)

### 3.9 Meta and social card

- Title: ALYR Shelf · Items, photos and stock, with every ALYR product · «ALYR Shelf · الأصناف والصور والمخزون، مع كل منتجات ALYR»
- Description: Everything you sell, on one shelf: photos, prices, sizes and choices in Arabic and English. Every sale counts the stock down, the last one sells once, and the order page says Sold out. With every ALYR product. · «كل ما تبيعه في مكان واحد: الصور والأسعار والمقاسات والخيارات بالعربية والإنجليزية. كل بيع ينقص المخزون، والقطعة الأخيرة تُباع مرة واحدة، وصفحة الطلب تكتب «نفد». مع كل منتجات ALYR.»
- Social card (EN, `opengraph-image.tsx`): the eyebrow and H1 of the chosen hero. No price.

---

## 4. `/docs`: ALYR Docs

Sample business: **Qirfa Bakery**, Bin Mahmoud (main) and a Lusail branch, code LUS. Documents dated **Mon 19 Oct 2026** (a Monday; the engine's samples use the same date). Numbers from the engine's own samples: **RC-0042**, **INV-0017**, **CN-0003**, plus INVLUS-0007 (01 §2). Customers: Aisha Hamad «عائشة حمد» (receipt), Omar Ali «عمر علي» (an office account, invoice).

| Paper | Lines | Total |
|---|---|---|
| RC-0042, receipt, order #1452, cash | 2 x Saffron milk cake, slice, QAR 26 · 1 x Butter croissant, QAR 12 | QAR 64.00 · «64.00 ر.ق» |
| INV-0017, invoice, on account | 2 x Box of 12 mini pastries, QAR 95 · 2 x Sourdough loaf, QAR 32 | QAR 254.00 · «254.00 ر.ق» |
| CN-0003, credit note | Cancels INV-0017 in full | QAR 254.00 |

The paper prints two decimals ("QAR 64.00", «64.00 ر.ق»); the site's own sentences use whole riyals ("QAR 64"). **Do not use the engine's sample customer "Fatima Al-Kuwari"**: Al-Kuwari is a retired sample family name (honesty.md §5). Draw the site's own papers, or render from the engine after the product lane changes the sample (section 8).

Caption suffix: "Sample, fictional bakery" / «مثال: مخبز غير حقيقي».

**Framing for the whole page.** The eyebrow says "Set up for you". Every sentence describes what ALYR Docs does, in the present tense, the way the other product pages do, and none says it is available, on, live, today or now. The "What's in it" heading drops "today" (4.4). Where a condition belongs to a line, it sits beside the verb.

### 4.0 Product bar

ALYR Docs · How it works · What's in it · Works with
«ALYR Docs · كيف يعمل · ماذا يتضمن · يعمل مع»

### 4.1 Hero: three options, ranked

Eyebrow for all three: **ALYR Docs · Set up for you** · «ALYR Docs · الإيصالات والفواتير · نجهّزه لك»

**Option 1 (recommended).**
- H1: **Payment in, receipt out. / Every number in order. Every paper final.**
  «تُسجَّل الدفعة، فيصدر الإيصال. / أرقام متتالية، ومستند لا يتغيّر.»
- Lead: When a payment is recorded, ALYR Docs issues the receipt with the next number and sends it to your customer. Arabic comes first, and nothing on it can change once it is issued. No commercial registration yet? You issue receipts, and invoices once you register.
  «حين تُسجَّل دفعة، يُصدر ALYR Docs الإيصال بالرقم التالي ويرسله إلى عميلك. العربية أولاً، ولا يتغيّر فيه شيء بعد إصداره. ليس لديك سجل تجاري بعد؟ تُصدر إيصالات، ثم فواتير حين يصبح لديك سجل.»
- Facts: Numbers that never skip · Final once issued · Arabic first, English beside it
  «أرقام متتالية بلا فجوات · نهائي بعد إصداره · العربية أولاً والإنجليزية بجانبها»
- Why first: it is the three active facts in ten words, and the CR line is in the first screen, warm and plain, where an unregistered owner needs it. "Sends it" is conditioned in the demo caption and the flow (4.2, step 4): inside WhatsApp's 24 hours, the PDF itself. [G for outside the window; see claim D-12.]

**Option 2.**
- H1: **Every sale gets its paper. / Numbered, in Arabic, and final.**
  «لكل بيع مستنده. / مرقّم، وبالعربية، ونهائي.»
- Lead and facts: as Option 1.
- Why second: covers invoices and credit notes as well as receipts, but "every sale" overreaches for a shop with no CR (a credit sale gets no invoice) and for sales outside ALYR.

**Option 3.**
- H1: **Receipts nobody has to type. / And nobody can change.**
  «إيصالات لا يكتبها أحد. / ولا يغيّرها أحد.»
- Lead and facts: as Option 1.
- Why third: strong, but staff do type the payment that makes a receipt, and "nobody can change" is better proved on the paper than claimed in an H1.

### 4.1d The demo beside the hero

Business: Qirfa Bakery. Note: "Sample conversation with a fictional bakery." · «محادثة توضيحية مع مخبز غير حقيقي.» Tabs label: "What ALYR Docs does" · «ما يفعله ALYR Docs».

| Tab (EN · AR) | Moment (01 §4) | Chat (product wording) | Panel | Caption (EN / AR) |
|---|---|---|---|---|
| Receipt · الإيصال | 1 | A PDF bubble "RC-0042.pdf", under it: "Receipt RC-0042 from Qirfa Bakery: QAR 64.00. Thank you. You can also open it online: alyr.qa/d/… ." / «إيصال رقم RC-0042 من مخبز قرفة بمبلغ 64.00 ر.ق. شكراً لك. يمكنك أيضاً فتحه عبر الإنترنت: alyr.qa/d/… .» (product, `delivery_words.caption`) | "Record a payment": Amount QAR 64.00 · How was it paid? Cash · Make the receipt ✓ → toast "Payment recorded. Receipt RC-0042 made." / «سُجّلت الدفعة وصدر الإيصال RC-0042.» (product) | Cash taken at the counter, written down. The receipt goes in the chat as a PDF when the customer has written in the last 24 hours. / مبلغ نقدي استُلم في المحل، مكتوب في السجل. ويصل الإيصال في المحادثة ملفَّ PDF إذا راسلك العميل خلال آخر 24 ساعة. |
| The paper · المستند | 2 | none | The receipt RC-0042 on A4: Arabic first with English beside it, Qirfa's name and address, the lines, "Total 64.00 ر.ق", "Paid · Cash", and at the foot "Issued with ALYR" / «صدر عبر ALYR» (product) | Arabic first, English beside it, and the number in order. The shop can remove "Issued with ALYR". / العربية أولاً والإنجليزية بجانبها، والرقم في تسلسله. ويستطيع المحل إزالة «صدر عبر ALYR». |
| No CR · بلا سجل | 3 | none | Two parts. The foot of a receipt from a shop with no CR: "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice." Then the screen's answer to "Invoice": "To issue an invoice, we need your shop's commercial registration (CR) number. You can add it in your document settings. In the meantime you can issue a receipt, which does not need one." (product, both, with their Arabic from `words.py`) | No CR yet: receipts, and each one says so. Add your CR number, and invoices are there too. / ليس لديك سجل تجاري بعد: إيصالات، وكل إيصال يقول ذلك. أضف رقم سجلك التجاري، فتصبح الفواتير متاحة أيضاً. |
| Correct · التصحيح | 4 | "Credit note CN-0003 from Qirfa Bakery: QAR 254.00. It cancels a document we issued before. You can also open it online: alyr.qa/d/… ." (product) | INV-0017 marked "Cancelled", with "Cancelled by credit note CN-0003" / «أُلغي بإشعار دائن رقم CN-0003» (product) | Issued means final. A correction is a credit note, and both keep their numbers. / ما صدر نهائي. والتصحيح إشعار دائن، ويحتفظ كلاهما برقمه. |
| The link · الرابط | 6 | none | The hosted page `/d/…`: "Receipt RC-0042", "Paid" / «مدفوع», "Download PDF" / «تنزيل ملف PDF» (product) | Every document has its own page, with Paid or Balance due and Download PDF. The page itself shows nothing about the customer. / لكل مستند صفحته، عليها «مدفوع» أو «المتبقي» وزر تنزيل الملف. والصفحة نفسها لا تعرض شيئاً عن العميل. |

Builder notes.
- The receipt tab's chat is the shop's number as the customer sees it; it is not a live send (no real send has been made, 01 §2). The caption carries the 24-hour condition.
- Draw the no-CR receipt with Qirfa's CR field empty; draw the other papers with no CR number at all rather than a made-up one.
- The credit note's caption says "we": that is the shop speaking on its own paper, as the product writes it. Do not change it on the site.

### 4.2 How it works, from both sides

- Eyebrow: How it works · «كيف يعمل»
- H2: **What happens when a payment comes in.** · «ماذا يحدث حين تصل دفعة.»
- Body: Your customer gets a receipt in the chat. Behind it, ALYR Docs takes the next number, writes the paper in both languages and seals it. Follow one receipt through. · «يصل عميلك إيصال في المحادثة. وفي الخلفية يأخذ ALYR Docs الرقم التالي، ويكتب المستند باللغتين، ويثبّته. تابع إيصالاً واحداً من البداية.»
- Columns: Your customer · WhatsApp · **ALYR Docs** (Working in the background «يعمل في الخلفية»; idle: Waiting for the next payment «بانتظار الدفعة التالية») · Your team.
- Note: Sample conversation with a fictional bakery. · «محادثة توضيحية مع مخبز غير حقيقي.»

**Story 1: A payment becomes a receipt** · «دفعة تصبح إيصالاً»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | team | Yusuf records the payment · يوسف يسجّل الدفعة | Aisha pays QAR 64 in cash for order #1452. Yusuf records it in the workspace: amount, cash, done. · تدفع عائشة 64 ر.ق نقداً عن الطلب رقم 1452، فيسجّلها يوسف في مساحة العمل: المبلغ، ونقداً، وانتهى. | Record: "Record a payment · QAR 64.00 · Cash" |
| 2 | — | The next number, never skipped · الرقم التالي، دون تخطٍّ | ALYR Docs takes the shop's next receipt number under a lock. If anything fails, the number goes back, so there is never a gap. · يأخذ ALYR Docs رقم الإيصال التالي للمحل وهو مقفل عليه. وإن تعثّر شيء يعود الرقم، فلا تبقى فجوة أبداً. | Work: "Number: RC-0042" |
| 3 | — | Written, then sealed · يُكتب ثم يُثبَّت | The paper is drawn in Arabic and English, with the shop and the customer copied onto it. From now on, nothing on it can change. · يُكتب المستند بالعربية والإنجليزية، ويُنسخ عليه المحل والعميل. ومن الآن لا يتغيّر فيه شيء. | Work: "Receipt RC-0042 issued", "Locked" |
| 4 | — | It checks WhatsApp's rules · يراعي قواعد واتساب | Aisha wrote in the last 24 hours, so the PDF itself can go in the chat. After 24 hours, WhatsApp allows only wording it has approved, and the receipt's wording is not approved. · راسلت عائشة خلال آخر 24 ساعة، فيمكن إرسال الملف نفسه في المحادثة. وبعد 24 ساعة لا يسمح واتساب إلا بصياغة وافق عليها، وصياغة الإيصال لم تُعتمد. | Work: "Last message: 2 hours ago", "Consent: on record", "Send: PDF in the chat" |
| 5 | out | The receipt arrives · يصل الإيصال | From the shop's number, in her language, with a link that opens it. · من رقم المحل، بلغتها، مع رابط يفتحه. | Chat: the PDF bubble and its caption (product) |
| 6 | team | Your team sees it delivered · يرى فريقك أنه وصل | The Documents screen says Sent, then Delivered. · تكتب شاشة المستندات «أُرسل» ثم «وصل». | Record: "RC-0042 · Aisha Hamad · QAR 64.00 · Paid · Delivered" |

Step 4 is the one condition the hero's "sends it" rests on; keep it word for word unless the three templates are approved before publishing, then replace its second sentence with: "After 24 hours, it goes with wording WhatsApp has approved." · «وبعد 24 ساعة يُرسل بصياغة وافق عليها واتساب.»

**Story 2: A sale on account becomes an invoice** · «بيع بالآجل يصبح فاتورة»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | in | An order on account · طلب على الحساب | Omar's office orders pastries and puts them on its credit account. · يطلب مكتب عمر معجنات ويسجّلها على حسابه الآجل. | Chat event: "Order #1451 on account, QAR 254" |
| 2 | — | Qirfa has its CR number on file · رقم السجل التجاري لمخبز قرفة محفوظ | So ALYR Docs issues an invoice, with the next invoice number. · فيُصدر ALYR Docs فاتورة بالرقم التالي للفواتير. | Work: "Invoice INV-0017 issued" |
| 3 | out | The invoice arrives · تصل الفاتورة | As a PDF in the chat, with its caption and a link. · ملفاً PDF في المحادثة، مع تعليقه ورابط. | Chat: "Invoice INV-0017 from Qirfa Bakery: QAR 254.00. Thank you. You can also open it online: alyr.qa/d/… ." (product) |
| 4 | in | Omar pays part of it · يدفع عمر جزءاً منها | A bank transfer of QAR 100. Recorded, it makes a receipt that says what is left. · تحويل مصرفي بمبلغ 100 ر.ق. وحين يُسجَّل يصدر إيصال يقول كم تبقّى. | Record: "Receipt · QAR 100.00 · Balance due QAR 154.00" |
| 5 | team | No CR on file? · لا رقم سجل تجاري؟ | The sale still goes ahead, as a credit sale, and no invoice is made. The record says why. · يمضي البيع بالآجل كما هو، ولا تصدر فاتورة، ويقول السجل لماذا. | Work: "Invoice not made: no CR number on file" |

[F] Step 4 needs the payment recorded against the invoice (`payments.py` subject `invoice`) or the credit account (`credit`); both make "a receipt that says what is left". Step 5 reflects `sales.py`: a document that cannot be issued never stops the sale, and the reason goes to the activity record as `document_skipped`. Confirm with the product lead that an owner can see that record before the page says "The record says why"; otherwise cut the last clause.

**Story 3: A mistake is corrected** · «خطأ يُصحَّح»

| # | Move | Title (EN · AR) | Body (EN · AR) | Shows |
|---|---|---|---|---|
| 1 | team | The invoice was wrong · كانت الفاتورة خاطئة | Omar's office ordered sourdough, not mini pastries. The invoice cannot be edited: the database refuses. · طلب مكتب عمر خبز العجين المخمّر لا المعجنات الصغيرة. ولا يمكن تعديل الفاتورة: قاعدة البيانات ترفض. | Record: "This document has been issued and can no longer be changed. To correct it, issue a credit note." (product) |
| 2 | back | Cancel document · إلغاء المستند | The owner presses Cancel document and writes why. · يضغط المالك «إلغاء المستند» ويكتب السبب. | Record: "This makes a credit note for all of INV-0017 (QAR 254.00). INV-0017 stays in your records, marked cancelled, with its number. Nothing is deleted and the number is not used again." (product) |
| 3 | — | A credit note, numbered · إشعار دائن مرقّم | CN-0003 cancels INV-0017. Both keep their numbers, and the invoice says what cancelled it. · يلغي CN-0003 الفاتورة INV-0017. ويحتفظ كلاهما برقمه، وتقول الفاتورة ما الذي ألغاها. | Work: "Credit note CN-0003 issued", "INV-0017: Cancelled by credit note CN-0003" |
| 4 | out | The customer is told · يُبلَّغ العميل | The credit note goes to Omar the same way the invoice did. · يصل الإشعار الدائن إلى عمر كما وصلته الفاتورة. | Chat: "Credit note CN-0003 from Qirfa Bakery: QAR 254.00. It cancels a document we issued before. …" (product) |
| 5 | team | Then the right invoice · ثم الفاتورة الصحيحة | A new invoice, with the next number, INV-0018. · فاتورة جديدة بالرقم التالي، INV-0018. | Work: "Invoice INV-0018 issued" |

### 4.3 The screen you use every day

The Documents section (`/app/documents`), at true scale, with RC-0042 open beside the list.

- Eyebrow: The screen · «الشاشة»
- H2: **Every paper you issued, and whether it arrived.** · «كل مستند أصدرته، وهل وصل.»
- FIG 02 · The Documents screen · Sample, fictional bakery · «الشكل 02 · شاشة المستندات · مثال: مخبز غير حقيقي»
- Label: The Documents screen of a fictional bakery's workspace · «شاشة المستندات في مساحة عمل مخبز غير حقيقي»
- Sheet (product words, `documentsCopy.ts`): title "Documents" / «المستندات»; sub "Receipts, invoices and the rest: numbered, in Arabic and English, and sent to your customers." / «إيصالات وفواتير وغيرها: مرقّمة، بالعربية والإنجليزية، وتُرسل إلى عملائك.»; search "Number, name, phone or amount"; filters Kind, Status, Payment, Delivery, Branch.
- Rows, newest first: RC-0042 · Receipt · Aisha Hamad · QAR 64.00 · Paid · Delivered — RC-0041 · Receipt · Mariam Saleh · QAR 38.00 · Paid · Sent — INV-0018 · Invoice · Omar Ali · QAR 128.00 · Unpaid · Delivered — CN-0003 · Credit note · Omar Ali · QAR 254.00 · Delivered — INV-0017 · Invoice · Omar Ali · QAR 254.00 · Cancelled — INVLUS-0007 · Invoice · Lusail · QAR 412.00 · Part paid · Not delivered.
- Open document actions: Download PDF · Send again · Record payment · Cancel document (product).
- Callouts:
  1. Every document, newest first, by its number. · كل مستند، الأحدث أولاً، برقمه.
  2. Paid, part paid or unpaid. · مدفوع أو مدفوع جزئياً أو غير مدفوع.
  3. Sent, delivered or not delivered, and why. · أُرسل أو وصل أو لم يصل، والسبب.
  4. Each branch with its own numbers. · لكل فرع أرقامه.
  5. Record a payment, send again, or cancel with a credit note. · سجّل دفعة، أو أرسل مرة أخرى، أو ألغِ بإشعار دائن.

### 4.4 Everything in it (`InsideBlock`, solid rule)

- Eyebrow: What's in it · «ماذا يتضمن»
- H2: **Everything it does.** · «كل ما يفعله.» (Not "today": 00 forbids it on this page.)

**For your customers** · «لعملائك»
- A receipt for every payment, with its own number. · إيصال لكل دفعة، برقمه.
- Arabic first, English beside it. Documents for consumers always carry Arabic. · العربية أولاً والإنجليزية بجانبها، ومستندات المستهلكين فيها العربية دائماً.
- The PDF in the chat within WhatsApp's 24 hours, and a link that opens it. · الملف في المحادثة خلال 24 ساعة من آخر رسالة للعميل، ورابط يفتحه.
- A page for each document: Paid or Balance due, and Download PDF. · صفحة لكل مستند: «مدفوع» أو «المتبقي»، وزر تنزيل الملف.
- A credit note when a paid order is cancelled. · إشعار دائن حين يُلغى طلب مدفوع.

**For your team** · «لفريقك»
- Receipts, invoices, quotations, delivery notes, credit notes and deposit receipts. · إيصالات، وفواتير، وعروض أسعار، وإشعارات تسليم، وإشعارات دائنة، وإيصالات عربون.
- Made from your sales: a receipt when an order is paid, an invoice when it goes on account, a receipt for each payment on account. · من مبيعاتك: إيصال حين يُدفع طلب، وفاتورة حين يُسجَّل على الحساب، وإيصال لكل دفعة على الحساب.
- Payments you take yourself, by cash, transfer, cheque or card terminal, each with its receipt. · المدفوعات التي تستلمها بنفسك، نقداً أو بتحويل أو بشيك أو بجهاز البطاقات، ولكل منها إيصال.
- Part of a visit paid? A deposit receipt says what is left. · دُفع جزء من الزيارة؟ إيصال العربون يقول كم تبقّى.
- Each branch with its own numbers, address and phone. · لكل فرع أرقامه وعنوانه وهاتفه.
- Cash rounding to 5, 10, 25, 50 or 100 dirhams, as a line of its own. · تقريب المبلغ النقدي إلى 5 أو 10 أو 25 أو 50 أو 100 درهم، في بند مستقل.
- A4, A5 or an 80 mm roll. · A4 أو A5 أو لفة 80 ملم.
- Your shop's name, logo and colours, and "Issued with ALYR" at the foot unless you remove it. · اسم محلك وشعاره وألوانه، و«صدر عبر ALYR» في أسفله ما لم تُزِله.
- Staff may record payments only if the owner allows it. · لا يسجّل الموظفون المدفوعات إلا إذا سمح المالك.
- Your own system can send its sales by file or by API, and you choose, for each kind of paper, whose numbers it carries. · يستطيع نظامك إرسال مبيعاته بملف أو عبر API، وتختار لكل نوع من المستندات أرقامَ من يحمل. [G: no real till or accounting system has been tried; the FAQ says we try it with yours first.]

**Behind the scenes** · «في الخلفية»
- Numbers never skip: a failed issue gives its number back. · لا تتخطّى الأرقام رقماً: الإصدار المتعثّر يعيد رقمه.
- Issued paper cannot change: the database refuses any edit. · المستند الصادر لا يتغيّر: قاعدة البيانات ترفض أي تعديل.
- A correction is a credit note. ALYR never deletes an issued document. · التصحيح إشعار دائن، ولا تحذف ALYR أي مستند صادر.
- Each paper is issued once, even if a payment is reported twice. · يصدر كل مستند مرة واحدة، حتى لو وصل خبر الدفعة مرتين.
- A paper that cannot be made never stops the sale. · المستند الذي يتعذّر إصداره لا يوقف البيع.
- No CR number on file: receipts only, each saying it is not a tax invoice. · لا رقم سجل تجاري محفوظاً: إيصالات فقط، وكل إيصال يقول إنه ليس فاتورة ضريبية.
- A customer who asked you to stop gets no document message. · العميل الذي طلب الإيقاف لا تصله رسالة بمستند.

**Not yet** · «لم يتوفر بعد» (dashed rule). Only what an owner is likely to ask for and must not assume, worded as what it does not do:
- Statements of account, and documents that repeat each month. · كشوف الحساب، والمستندات التي تتكرر كل شهر.
- Tax on documents, and any government e-invoicing system. · الضريبة على المستندات، وأي نظام حكومي للفوترة الإلكترونية. [F, legal: this states only what it does not do; it names no authority and makes no promise. Cut it if the founder prefers the page silent on tax.]
- Sending a document outside WhatsApp's 24 hours, until WhatsApp approves the wording. · إرسال مستند بعد 24 ساعة من آخر رسالة للعميل، إلى أن يوافق واتساب على الصياغة. [Remove once the three templates are approved.]
- Asking customers for their email address. · طلب البريد الإلكتروني من العملاء.

Note under the rule: "We set ALYR Docs up with you at your shop. Everything listed above the line is built." · «نجهّز ALYR Docs معك في محلك. كل ما فوق الخط جاهز.»

### 4.5 The CR rule, said warmly (a short block inside 4.4, or an aside beside the FIG of the no-CR receipt)

- Title: **No CR yet? Receipts, and they say so.** · «ليس لديك سجل تجاري بعد؟ إيصالات، وتقول ذلك.»
- Body: Until your CR number is in your document settings, ALYR Docs issues receipts, never invoices, and each receipt says so in plain words. Add your CR number, and you can issue invoices too. · «إلى أن تضيف رقم سجلك التجاري في إعدادات المستندات، يُصدر ALYR Docs إيصالات لا فواتير، ويقول كل إيصال ذلك بكلمات واضحة. أضف رقم سجلك، فتستطيع إصدار الفواتير أيضاً.»
- Not said, on purpose: anything about whether a business may trade before its CR, or what an unregistered seller may issue (ALY-51, the lawyer). The block describes what the product does, not the law.
- The exact line on the paper (product, quoted, never paraphrased): "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice." · «لا يوجد رقم سجل تجاري مسجّل للبائع. هذا المستند إيصال وليس فاتورة ضريبية. لا تقدّم ALYR استشارات ضريبية.»

**Legal lines, exact.**

| May say (exactly) | Must not say |
|---|---|
| "Arabic first, and Arabic always on documents for consumers." · «العربية أولاً، والعربية دائماً على مستندات المستهلكين.» | "Compliant with Qatar's Arabic invoice rule", or any claim of compliance (ALY-51) |
| "ALYR never deletes an issued document." · «لا تحذف ALYR أي مستند صادر.» | Any retention period ("kept for ten years") |
| "A shop with no CR number issues receipts, and each says it is not a tax invoice." | "Tax invoice" as something ALYR Docs issues; VAT |
| "ALYR does not give tax advice." · «لا تقدّم ALYR استشارات ضريبية.» | E-invoicing; the General Tax Authority; any government system as connected |
| "Invoices once your CR number is added." | That an unregistered seller may issue invoices |
| "Payment links open a test page until a payment provider is connected." | Live card payments, a provider's name |

### 4.6 Who it's for

- Eyebrow: Who it's for · «لمن صُمّم»
- H2: **For businesses that hand over paper.** · «للأنشطة التي تسلّم عملاءها مستندات.»
- Rows:
  - Bakeries, cafes and shops paid at the counter — Receipt · Credit note · «المخابز والمقاهي والمحلات التي يُدفع لها في المحل» — «إيصال · إشعار دائن»
  - Trading and wholesale with customers on account — Invoice, with your CR · Receipt for each payment · «التجارة والجملة مع عملاء بالآجل» — «فاتورة مع سجلك التجاري · إيصال لكل دفعة»
  - Home services that take part up front — Quotation · Deposit receipt · Receipt · «الخدمات المنزلية التي تأخذ جزءاً مقدماً» — «عرض سعر · إيصال عربون · إيصال»
  - Shops with more than one branch — Numbers for each branch · «المحلات التي لها أكثر من فرع» — «أرقام لكل فرع»
  - Shops that already have a till or accounting system — Its sales, ALYR's paper · «المحلات التي لديها نظام كاشير أو محاسبة» — «مبيعاته، ومستندات ALYR»
- Exit: Run something else? Write to us about how you work. · «نشاطك مختلف؟ راسلنا وأخبرنا كيف تعمل.» (the live line without "today", which 00 keeps off this page even where it means the owner's own day)

[Builder: "Quotation" is a kind the engine issues by hand; do not draw a quote-to-invoice flow (01: quotes are not a full flow).]

### 4.7 Works with the rest of ALYR

| Product | EN | AR |
|---|---|---|
| ALYR Chat | A receipt when an order is paid at the counter, and a credit note when a paid order is cancelled. | إيصال حين يُدفع طلب في المحل، وإشعار دائن حين يُلغى طلب مدفوع. |
| ALYR Bookings | A visit paid at the counter gets a receipt, or a deposit receipt when part is paid. | الزيارة المدفوعة في المحل لها إيصال، أو إيصال عربون حين يُدفع جزء منها. |
| ALYR Agent | Comes with it: unpaid invoices and documents not delivered, on your home screen. | يأتي معه: الفواتير غير المدفوعة والمستندات التي لم تصل، على شاشتك الرئيسية. |
| ALYR Accounts | A sale on account makes an invoice, and each payment a receipt that says what is left. | البيع بالآجل يُصدر فاتورة، وكل دفعة إيصالاً يقول كم تبقّى. |
| ALYR Shelf | Each line is an item from your shelf, with its Arabic name, size and choices. | كل بند صنف من أصنافك، باسمه العربي ومقاسه وخياراته. |

### 4.8 Questions

- **Can I use it on its own?** ALYR Docs works from the sales and payments in your ALYR workspace. If your sales are in another system, that system can send them to ALYR by file or by API. · «هل أستطيع استخدامه وحده؟» «يعمل ALYR Docs من المبيعات والمدفوعات في مساحة عملك مع ALYR. وإن كانت مبيعاتك في نظام آخر، يستطيع ذلك النظام إرسالها إلى ALYR بملف أو عبر API.»
- **How long does setup take?** We agree your go-live date at the visit. We set your numbers, branches and paper with you. · «كم يستغرق التجهيز؟» «نتفق معك على موعد بدء التشغيل خلال الزيارة، ونضبط معك الترقيم والفروع وشكل المستند.»
- **I don't have a CR yet.** Then you issue receipts, and each says the seller has no CR number on file. Once your CR number is in your settings, you can issue invoices too. · «ليس لديّ سجل تجاري بعد.» «تُصدر إذن إيصالات، ويقول كل منها إنه لا يوجد رقم سجل تجاري مسجّل للبائع. وحين تضيف رقم سجلك في الإعدادات، تستطيع إصدار الفواتير أيضاً.»
- **Can I change a receipt after it is issued?** Nobody can: the database refuses any change. To correct it, issue a credit note. It cancels the document, both keep their numbers, and nothing is deleted. · «هل أستطيع تعديل إيصال بعد إصداره؟» «لا يستطيع أحد ذلك: قاعدة البيانات ترفض أي تعديل. لتصحيحه أصدر إشعاراً دائناً، فيلغي المستند، ويحتفظ كلاهما برقمه، ولا يُحذف شيء.»
- **Is it in Arabic?** Arabic first by default, with English beside it. Documents for consumers always carry Arabic. A document for a business can be English only. · «هل هو بالعربية؟» «العربية أولاً افتراضياً، والإنجليزية بجانبها. ومستندات المستهلكين فيها العربية دائماً، أما مستند الشركات فيمكن أن يكون بالإنجليزية وحدها.» [AR note: «افتراضياً» here means "by default" and is correct; the term list's warning is against «افتراضي» for "fictional".]
- **How do my customers get it?** In the chat as a PDF, when they have written to you in the last 24 hours. Every document also has a link that opens it. · «كيف يصل إلى عملائي؟» «في المحادثة ملفاً PDF، إذا راسلوك خلال آخر 24 ساعة. ولكل مستند أيضاً رابط يفتحه.»
- **I already have a till or accounting system.** It can send its sales to ALYR by file or by API, and you choose, for each kind of paper, whose numbers it carries. We try it with your system with you first. · «لديّ نظام كاشير أو محاسبة.» «يستطيع إرسال مبيعاته إلى ALYR بملف أو عبر API، وتختار لكل نوع من المستندات أرقامَ من يحمل. ونجرّبه مع نظامك معك أولاً.»
- No price question with the offer off or on (00: Docs has no price item).

### 4.9 Closing call

- H2: **Tell us how you give customers their receipts.** · «أخبرنا كيف تسلّم عملاءك إيصالاتهم.» (no "today" on this page)
- Body: Send us a message. A person from ALYR replies, then comes to show you ALYR Docs on your own phone. · «أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليريك ALYR Docs على هاتفك أنت.»

### 4.10 Meta and social card

- Title: ALYR Docs · Receipts, invoices and credit notes, in Arabic and English · «ALYR Docs · الإيصالات والفواتير والإشعارات الدائنة، بالعربية والإنجليزية»
- Description: Receipts from your sales and the payments you record, numbered without a gap, Arabic first and final once issued. No CR yet: receipts, and invoices once you register. Set up for you, in Qatar. · «إيصالات من مبيعاتك والمدفوعات التي تسجّلها، بأرقام متتالية بلا فجوات، والعربية أولاً، ونهائية بعد إصدارها. ليس لديك سجل تجاري بعد: إيصالات، ثم فواتير حين يصبح لديك سجل. ونجهّزه لك في قطر.»
- Social card: the eyebrow "ALYR Docs · Set up for you" and the H1. The card has no screen beside it, so it must not carry "sends it" without the eyebrow.

---

## 5. Site-wide changes

Keys are `copy.ts` paths (line numbers at 647d77d). Each change is given EN / AR.

### 5.1 The product list and Payroll

- `site.ts`: `PRODUCTS = ["chat", "bookings", "agent", "accounts", "shelf", "docs"]`; `PATHS.shelf`, `PATHS.docs`; `productPath()` loses its Payroll branch. `build-site.sh` `pages=` gains `shelf docs`.
- Remove everywhere: `products.items.payroll`, `products.payrollSr`, `footer.coming` (EN 539, AR 2402), `home.suite.payroll` (661, 2524), `product.works.rows.payroll` (1326, 3189), `pages.bookings.works.rows.payroll` (1702, 3566), `pages.agent.works.rows.payroll` (1862, 3726), `pages.accounts.works.rows.payroll` (2263, 4128), the comment on line 5, `HomePage.tsx` 172, 190, 209. The types (`Exclude<ProductKey,"payroll">`, the `meta` union, `pages`) widen to the new keys.
- Outside `copy.ts`, the same list in prose: `alyr-design/voice.md` ("The suite's order is always Chat, Bookings, Agent, Accounts, Payroll"), `alyr-design/arabic.md` (the descriptors line), `alyr-site-page/SKILL.md` (Payroll as the coming product), `docs/brand.md` (the suite on the site). Site and brand lane files; flagged, not edited here.

### 5.2 The Products menu

| Key | name | descriptor | line | state |
|---|---|---|---|---|
| chat | ALYR Chat | WhatsApp orders and team inbox · طلبات واتساب وصندوق الفريق (live) | (live) | **Set up for you · نجهّزه لك** |
| bookings | ALYR Bookings | (live) | (live) | **Set up for you · نجهّزه لك** |
| agent | ALYR Agent | (live) | (live) | With every product · مع كل منتج (live) |
| accounts | ALYR Accounts | (live) | (live) | **Set up for you · نجهّزه لك** |
| shelf | ALYR Shelf | Items and stock · الأصناف والمخزون | Everything you sell: photos, prices, sizes and stock · كل ما تبيعه: الصور والأسعار والمقاسات والمخزون | With every product · مع كل منتج |
| docs | ALYR Docs | Receipts and invoices · الإيصالات والفواتير | Receipts, invoices and credit notes from your sales · إيصالات وفواتير وإشعارات دائنة من مبيعاتك | Set up for you · نجهّزه لك |

### 5.3 "Set up for you" everywhere "Early access" was

| Key | EN now → new | AR now → new |
|---|---|---|
| `products.items.{chat,bookings,accounts}.state` | Early access → Set up for you | إطلاق مبكر → نجهّزه لك |
| `product.eyebrow` (/chat) | ALYR Chat · Early access → ALYR Chat · Set up for you | «ALYR Chat · إطلاق مبكر» → «ALYR Chat · طلبات واتساب وصندوق الفريق · نجهّزه لك» (adds the descriptor, as /bookings and /accounts have) |
| `pages.bookings.hero.eyebrow` | → ALYR Bookings · Set up for you | → «ALYR Bookings · المواعيد والتذكيرات · نجهّزه لك» |
| `pages.accounts.hero.eyebrow` | → ALYR Accounts · Set up for you | → «ALYR Accounts · الحسابات الآجلة · نجهّزه لك» |
| `pages.agent.report.eyebrow` | The Sunday report · Early access → The Sunday report | «تقرير الأحد · إطلاق مبكر» → «تقرير الأحد» (the report is not a product; its condition is already in the body) |
| `home.how.note` | ALYR is in early access. We set it up with each business ourselves, and agree your go-live date at the visit. → We set ALYR up with each business ourselves, and agree your go-live date at the visit. | → «نجهّز ALYR مع كل منشأة بأنفسنا، ونتفق معك على موعد بدء التشغيل خلال الزيارة.» |
| `product.inside.note` (/chat) | → We set ALYR Chat up with you at your shop. Everything listed here is built. We agree your number with you when we set you up. | → «نجهّز ALYR Chat معك في محلك. كل ما في هذه القائمة جاهز، ونتفق معك على الرقم عند تجهيزه لك.» |
| `pages.bookings.inside.note` | → We set ALYR Bookings up with you at your shop. Everything listed above the line is built. | → «نجهّز ALYR Bookings معك في محلك. كل ما فوق الخط جاهز.» |
| `pages.accounts.inside.note` | → We set ALYR Accounts up with you at your shop. Everything listed above the line is built. | → «نجهّز ALYR Accounts معك في محلك. كل ما فوق الخط جاهز.» |

Also outside the site: `honesty.md` §2 row 1 ("ALYR Chat is in early access…") and its intro paragraph, and `arabic.md`'s term row "Early access" → «نجهّزه لك» (site and brand lane).

### 5.4 Homepage

- **Meta** (`meta.home`). Title unchanged (recommended): "ALYR · Orders, bookings and credit accounts, set up for you". Description (offer off): "ALYR sets up and looks after the technology for owner-run businesses in Qatar: orders, bookings, credit accounts, what you sell and your receipts, in one workspace. ALYR Agent comes with each product: what needs you today, and your week in numbers." · «تجهّز ALYR التقنية للمنشآت التي يديرها أصحابها في قطر وتتولى متابعتها: الطلبات والحجوزات والحسابات الآجلة وما تبيعه وإيصالاتك، في مساحة عمل واحدة. ومع كل منتج يأتي ALYR Agent: ما يحتاجك اليوم، وأسبوعك بالأرقام.» (Offer on: Appendix A.)
- **Suite body** (`home.suite.body`): "We set ALYR up in your shop. Our products take the orders and bookings and send the reminders in WhatsApp, and they share one workspace, one customer list and one team. ALYR Agent and ALYR Shelf come with every one. Choose the rest." · «نجهّز ALYR في محلك. منتجاتنا تستقبل الطلبات والحجوزات وترسل التذكيرات داخل واتساب، وتتشارك مساحة عمل واحدة وقائمة عملاء واحدة وفريقاً واحداً. ويأتي ALYR Agent وALYR Shelf مع كل منها، واختر الباقي.»
- **Suite rows**, after Accounts:
  - `shelf`: "Everything you sell, with photos, sizes and stock. Each sale counts it down, and the order page says Sold out by itself." Link "See ALYR Shelf". · «كل ما تبيعه، بصوره ومقاساته ومخزونه. كل بيع ينقصه، وصفحة الطلب تكتب «نفد» تلقائياً.» «تعرّف على ALYR Shelf». Crop: two order-page item cards at true size, "Only 1 left today" and a greyed "Sold out".
  - `docs`: "Receipts and invoices from your sales: numbered without a gap, Arabic first, and final once issued." Link "See ALYR Docs". · «إيصالات وفواتير من مبيعاتك: بأرقام متتالية بلا فجوات، والعربية أولاً، ونهائية بعد إصدارها.» «تعرّف على ALYR Docs». Crop: the top of receipt RC-0042, Arabic first, with its number.
  - `home.suite.payroll` removed.
  - `crops` (both languages): "Only 1 left today" · «المتبقي اليوم 1 فقط»; "Sold out" · «نفد»; "Receipt RC-0042" · «إيصال RC-0042».
- **By business** (`home.business.rows`), products in suite order:
  - Restaurants and cafes: products `chat, agent, accounts, shelf`. Body unchanged.
  - Salons and barbers: unchanged (`bookings, agent`).
  - Home services: products `bookings, chat, agent, accounts, docs`. Body: "Visits booked from the chat, parts ordered from a page, contract customers on account, and a receipt for each payment." · «زيارات تُحجز من المحادثة، وقطع غيار تُطلب من صفحة، وعملاء عقود بالآجل، وإيصال لكل دفعة.»
  - Shops and wholesale: products `chat, agent, accounts, shelf, docs`. Body: "Orders from your price list in the chat, stock counted on every sale, and trade customers on credit, with reminders that stay polite." · «طلبات من قائمة أسعارك في المحادثة، ومخزون يُعدّ مع كل بيع، وعملاء تجاريون بالآجل، بتذكيرات تبقى لبقة.»
  - Add a row: **Bakeries** — "Your menu with photos, a number each day, orders for tomorrow before 6 pm, and cake tastings booked from the chat." products `chat, bookings, agent, shelf` · «المخابز» — «قائمتك بالصور، وعدد لكل يوم، وطلبات الغد قبل 6 م، ومواعيد تذوّق الكيك من المحادثة.» [F: a fifth row; skip if the section should stay at four.]
- **How it works, step 2** (`home.how.steps[1].body`): "We load your items with their photos, or your services, and your prices, in Arabic and English. We set your hours, switch on the products you need, and give each person on your team a sign-in." · «نضيف أصنافك بصورها، أو خدماتك، وأسعارك، بالعربية والإنجليزية. ونضبط ساعات عملك، ونفعّل المنتجات التي تحتاجها، ونعطي كل فرد في فريقك حساب دخول.» [AR: check the live step's wording and keep its verbs where they already pass.]
- **FAQ `which-product`**: "Tell us how customers reach you. Orders in the chat: ALYR Chat. Appointments: ALYR Bookings. Customers who pay later: ALYR Accounts. Receipts and invoices: ALYR Docs. A bakery that sells cakes and books tastings uses Chat and Bookings. ALYR Agent and ALYR Shelf come with each." · «أخبرنا كيف يصل إليك عملاؤك. الطلبات في المحادثة: ALYR Chat. المواعيد: ALYR Bookings. عملاء يدفعون لاحقاً: ALYR Accounts. الإيصالات والفواتير: ALYR Docs. والمخبز الذي يبيع الكيك ويحجز مواعيد التذوّق يستخدم Chat وBookings معاً. ومع كل منتج يأتي ALYR Agent وALYR Shelf.»
- **FAQ `all-of-them`**: unchanged; true with Shelf included.

### 5.5 "Works with" rows on every existing page

| Page | New row | EN | AR |
|---|---|---|---|
| /chat (`product.works.rows`) | shelf | Your order page shows your shelf: photos, sizes, and what has sold out. | تعرض صفحة طلبك أصنافك: الصور والمقاسات وما نفد منها. |
| /chat | docs | A numbered receipt for each paid order, in the chat. | إيصال مرقّم لكل طلب مدفوع، في المحادثة. |
| /bookings | shelf | Sell products beside your services. Customers order them through ALYR Chat. | بِع منتجات إلى جانب خدماتك، ويطلبها عملاؤك عبر ALYR Chat. |
| /bookings | docs | A receipt for a visit paid at the counter, or a deposit receipt for part. | إيصال للزيارة المدفوعة في المحل، أو إيصال عربون لجزء منها. |
| /agent | shelf | Sold out now and low stock. | ما نفد الآن وما قلّ مخزونه. |
| /agent | docs | Unpaid invoices and documents not delivered. | الفواتير غير المدفوعة والمستندات التي لم تصل. |
| /accounts | shelf | An order on account takes its stock straight away. | الطلب على الحساب يأخذ كميته فوراً. |
| /accounts | docs | An invoice for each sale on account, and a receipt for each payment that says what is left. | فاتورة لكل بيع بالآجل، وإيصال لكل دفعة يقول كم تبقّى. |

And the two new pages' rows (3.6, 4.7). Every page's rows are now in suite order: Chat, Bookings, Agent, Accounts, Shelf, Docs, without the page's own product.

### 5.6 Lines that go stale

- **/accounts "Not yet"** (`pages.accounts.inside.notYet.items`, EN 2237, AR 4102). Replace items 4 and 6 with one item, and keep the rest:
  - Remove "Statements and invoices." · «كشوف الحساب والفواتير.»
  - Remove "Recording how a customer paid: cash, card or transfer." · «تسجيل طريقة الدفع: نقداً أو بالبطاقة أو بالتحويل.»
  - Add: "Statements of account." · «كشوف الحساب.»
  - Add: "Invoices, and receipts that say how a customer paid, belong to ALYR Docs, which we set up with you." · «الفواتير، والإيصالات التي تذكر طريقة الدفع، من ALYR Docs، ونجهّزه معك.»
  - "Recording a sale or payment from the screen." stays: ALYR Accounts still has no such screen; Docs' "Record a payment" is in the Documents section. [F: once Docs is on for a shop, reword to "Recording a sale from the screen. Payments are recorded in ALYR Docs."]
- **/agent FAQ `trust`** ("cash taken at the counter is not recorded in ALYR yet"): with Docs, a payment taken by hand can be recorded, but ALYR Agent does not count it. Replace the second sentence: "Two things to know: a visit nobody marked stays out of the no-show rate until someone does, and the sales figures count orders, not cash taken at the counter." Arabic: change only the last clause of the live answer, «والنقد المستلم عند الكاونتر لا يُسجَّل في ALYR بعد» → «وأرقام المبيعات تعدّ الطلبات لا النقد المستلم عند الكاونتر».
- **/bookings "Not yet"** item 4 "Deposits, or paying when booking." · «العربون أو الدفع عند الحجز.» → "Taking a deposit or a payment when the customer books." · «أخذ عربون أو دفعة عند الحجز.» It no longer contradicts the deposit receipt in ALYR Docs, which is for money taken at the counter.
- **/chat 1239** "a receipt the moment it is paid": it means the WhatsApp confirmation ("Received QAR 385 for order #1042. Thank you."). Clarify: "A payment link in the chat, and a message confirming payment the moment it is paid. Built and tested on a test page; card payments are not live yet." · «رابط دفع في المحادثة، ورسالة تؤكد السداد لحظة الدفع. جاهز ومجرّب على صفحة تجريبية، والدفع بالبطاقات لم يبدأ بعد.» The numbered receipt is ALYR Docs' row in 5.5.
- **/chat staff demo** «الفاتورة» → «الإيصال» at AR 2915 and 3079: «نعم، ضمان 12 شهراً. سأحضر الإيصال معي غداً.» (EN already says "receipt".)
- **`home.how.start.items[0]`** "Your menu, products or services, with prices, in Arabic and English": still true; no change.
- **`honesty.md` §2** row "Statements for ALYR Accounts, invoices, stock, product options (until the Catalog ships)": stock and options are built (Shelf); invoices are built and hidden (Docs). Rewrite as "Statements of account; Docs as available" (site and brand lane).

### 5.7 Footer

The Products column lists all six in suite order, each a link once its page exists; no "coming" word, no dashed Payroll row.

---

## Appendix A: with the offer on (`NEXT_PUBLIC_ALYR_OFFER=on`)

Shelf is included and Docs has no price item (00). The "+QAR 150 per product" lines are reworded to name the priced products only. Nothing here shows with the offer off.

| Key | EN now → new | AR new |
|---|---|---|
| `home.price.first` | "for your first product. Each product you add: QAR 150 a month. ALYR Agent is included with every one." → "for your first product. Add ALYR Chat, ALYR Bookings or ALYR Accounts for QAR 150 a month each. ALYR Agent and ALYR Shelf come with every one." | «لأول منتج. وأضف ALYR Chat أو ALYR Bookings أو ALYR Accounts بـ 150 ر.ق شهرياً لكل منها. ويأتي ALYR Agent وALYR Shelf مع كل منتج.» |
| `home.price.combos` | last row "ALYR Agent · included" → "ALYR Agent and ALYR Shelf · included" | «ALYR Agent وALYR Shelf · مشمولان» |
| `home.price.includes` | "Every month includes your products, ALYR Agent and the Sunday report, …" → "Every month includes your products, ALYR Agent, ALYR Shelf and the Sunday report, …" (rest unchanged) | «يشمل كل شهر منتجاتك، وALYR Agent، وALYR Shelf، وتقرير الأحد، …» |
| `home.faq[more-products].a` | → "The first is from QAR 449 a month. ALYR Chat, ALYR Bookings and ALYR Accounts are QAR 150 a month each after that. ALYR Agent and ALYR Shelf come with all of them." | «الأول من 449 ر.ق شهرياً، ثم ALYR Chat وALYR Bookings وALYR Accounts بـ 150 ر.ق شهرياً لكل منها. ويأتي ALYR Agent وALYR Shelf معها كلها.» |
| `pages.bookings.hero.factsOffer` | → "From QAR 449 a month, or QAR 150 beside ALYR Chat or ALYR Accounts" | «من 449 ر.ق شهرياً، أو 150 ر.ق مع ALYR Chat أو ALYR Accounts» |
| `pages.accounts.hero.factsOffer` | → "From QAR 449 a month, or QAR 150 beside ALYR Chat or ALYR Bookings" | «من 449 ر.ق شهرياً، أو 150 ر.ق مع ALYR Chat أو ALYR Bookings» |
| `meta.home.description` (offer) | the offer-off text (5.4) + " From QAR 449 a month for the first product, plus setup." (live sentence) | + « من 449 ر.ق شهرياً لأول منتج، إضافة إلى رسوم التجهيز.» (live) |
| `pages.shelf.faq[pay-offer]` | "Do I pay for ALYR Shelf?" "No. It is included with ALYR." | «هل أدفع مقابل ALYR Shelf؟» «لا. هو مشمول مع ALYR.» |
| `pages.shelf.hero.factsOffer` | none (the facts already say "With every ALYR product") | none |
| `pages.docs` | no `factsOffer`, no price question, no price in meta | none |

Open for the founder [F]:
1. Whether ALYR Docs can be a shop's first product at QAR 449, and whether the price section says anything about it ("ALYR Docs is quoted at your visit." · «نسعّر ALYR Docs خلال الزيارة.»). Recommended: say nothing until there is a price; the visit covers it.
2. "Included" for Shelf against D-039, which says the Catalog is "free now, with usage meters… a later charge". "Included" is true today and does not say "free" or "forever"; if a usage charge is ever set, these lines and the Shelf FAQ change with it.
3. The "For example" combos still add up (449 + 150 + 150 = 749 for Chat, Bookings and Accounts).

---

## Appendix B: Arabic notes

- **Register:** Modern Standard Arabic throughout the site; the staff lines inside drawn chats are Gulf on purpose («كيك الزعفران خلص»), one register per message. The papers' own words are formal MSA (the product's).
- **Gender:** «يأتي ALYR Shelf»، «يأخذ ALYR Shelf»، «يُصدر ALYR Docs»، «نجهّزه لك»؛ «تجهّز ALYR»، «لا تحذف ALYR». In "Set up for you" the pronoun is masculine for a product («نجهّزه») and feminine only for ALYR («نجهّزها لك في محلك», live hero fact).
- **Money:** amount, then «ر.ق», in `<bdi>`: «64.00 ر.ق» on paper, «64 ر.ق» in the site's own sentences. Western digits everywhere, including «‏108 x2» and «‏131 x0.5», which also open with U+200F inside a drawn WhatsApp line (product).
- **Bidi:** `<bdi>` around RC-0042, INV-0017, CN-0003, INVLUS-0007, order numbers («الطلب رقم 1452»), "ALYR", product names, "PDF", "API", "Excel", "CSV", «0.25 كغ», and time ranges. «بـ 150 ر.ق» joins with U+00A0 after «بـ».
- **Numbers and agreement:** «حتى 8 صور» (3–10, plural), «20 حقلاً» (11+, singular accusative), «30 دقيقة» (11+), «قطعتي كرواسون» (dual), «طلبيهما» (dual). Nothing on these pages puts a count after a preposition that needs a case the helper lacks.
- **Terms:** المخزون، الأصناف، نفد، مخزون قليل، صفحة الطلب، سجل المخزون، إيصال، فاتورة، إشعار دائن، إيصال عربون، عرض سعر، إشعار تسليم، كشف حساب، السجل التجاري، صادر، ملغى، مدفوع، المتبقي، الفرع، تقريب. «المتجر» only where the product prints it (the Documents screens and the chat); the site's own sentences say «المحل».
- **Words avoided:** «تلقائياً» is fine (it says "by itself", not "smart"); «ذكي», «يفهم», «يعرف» (of the product), «مساعد» never. «فهم» was cut from the staff story (2.2): the product "finds the item", it does not "understand" it.
- **For the native reviewer, the lines least sure:** «أرقام متتالية بلا فجوات» and «لا تتخطّى الأرقام رقماً» (alternative «لا يسقط رقم من التسلسل»), «ومع كل بيع، ينقص المخزون تلقائياً», «أرقامَ من يحمل» (alternative «ومن يملك ترقيمه»), «ما على الرف» in the screen heading, and «تُسجَّل الدفعة، فيصدر الإيصال».

---

## 6. Claims table

**Status.** *True:* on `main` and on for shops (Shelf: `catalog_for_new_shops=True`, migration 0032). *Built, hidden:* on `main`, the module off for every shop (Docs). *Gated:* true only after the named step. "On for shops" still means no shop is live (no CR, sign-up closed, WhatsApp only on Meta's test number, hosting on the founder's laptop); the page frames every product as set up with you.

### ALYR Shelf

| # | Claim on the page | Status | Source | Condition shown |
|---|---|---|---|---|
| S-1 | With every ALYR product; included, not priced on its own | True | 00; D-039; `catalog.py` 215–221 | Back office can switch it off per shop; not for travel and documents types (01 §1). D-039 "free now, metered later" (Appendix A, [F] 2) |
| S-2 | Every sale takes its stock in one step; the last one sells once | True | D-039; `items/stock.py`; race tests (01 §1) | none |
| S-3 | The order page says "Sold out" / «نفد», greyed or left out as the shop chooses | True | `_customer/order/copy.ts` 54, 239; 01 §1 | Bakery starts greyed, grocery left out |
| S-4 | "Only {n} left" / «المتبقي {n} فقط» at or under the low-stock number | True | `order/copy.ts` 56, 241 | none |
| S-5 | The second customer is told before she orders ("…is now sold out.") | True | `order/copy.ts` 171, 350; `Order.tsx` live refresh | While her page is open |
| S-6 | A staff phone: sold out, back, stock, price, undo, in Arabic or English; reply "Done…" with Undo, once, same person | True | `items/wa_text.py` 16–54, 129–147; 01 §1 | Registered staff numbers only; WhatsApp only on Meta's test number |
| S-7 | When several items fit, it asks which and changes nothing | True | 01 §1; status.md (ALY-106) | none |
| S-8 | A photo with a caption becomes a draft until an owner puts it on sale | True | `wa_text.py` 173–209 | none |
| S-9 | Order by item code in the chat ("108 x2"), card, Confirm, Place order | True | `items/codes.py`, `wa_order.py`, `wa_text.py` 330–392 | Unmatched codes and voice notes go to the team |
| S-10 | Sold by weight or volume, quick amounts 0.25, 0.5, 1 kg; chat "131 x0.5" | True | ALY-149 (merged #95, #96); 01 §1 | On for new groceries and bakeries |
| S-11 | Unpaid pay-link order holds stock 30 min, then is cancelled, stock put back, customer told | True | D-039 detail 3; `items/text.py` 123; `orders/service.py` 810 | Payment links open a test page (shown) |
| S-12 | A cancellation puts stock back once | True | 01 §1 | none |
| S-13 | Order on a credit account takes its stock straight away | True | 01 §1; `ledger/service.py` 400 | none |
| S-14 | Stock log only adds rows: opening, received, sold, put back, wasted, counted, corrected; who and why | True | D-039; `catalogCopy.ts` 311 | Draw no "Assistant" actor |
| S-15 | Arabic name required before an item goes on sale | True | `wa_text.py` `on_sale_needs_arabic`; D-039 | none |
| S-16 | Up to 8 photos with a cover; checked, location and camera data removed | True | `catalogCopy.ts` 229–241; 01 §1 | Nothing said about where photos are stored |
| S-17 | Sizes and colours with their own stock and price; choices and extras | True | 01 §1 | none |
| S-18 | Four ways to run out; times it can be ordered; "Ready from 5 pm", "Order before 6 pm for tomorrow" | True | `catalogCopy.ts` 137–142; `items/notes.py` | none |
| S-19 | Import and export with Excel or CSV, preview, one undo | Gated | ALY-108; 01 §1 "Not yet tried in real Excel" | Keep only after a real Excel file is imported |
| S-20 | Wholesale price for a group of customers | True | ALY-127; 01 §1 | Group set from the inbox |
| S-21 | Discounts, delivery areas, cost and margin "when you switch it on" | True, off by default | ALY-150; 01 §1 | Shown under "When you switch it on" |
| S-22 | Own fields up to 20; templates by business type; share link and QR codes | True | ALY-148, ALY-107, ALY-112 | none |
| S-23 | An item with orders behind it is archived, never deleted | True | D-039 | none |
| S-24 | ALYR Agent shows sold out now and low stock on the home screen | True | `agent/view.py` 73, 100 (`_catalog`); `catalog.py` 229–233 | none |
| S-25 | Docs lines come from Shelf items with Arabic name, size and choices | Built, hidden | `documents/sales.py` `_order_line` | Docs framing |
| S-26 | Not yet: barcodes, batches, expiry; photo per size; maps or drivers; staff change by code | True as "not built" | 01 §1 | No "next" |

### ALYR Docs

| # | Claim on the page | Status | Source | Condition shown |
|---|---|---|---|---|
| D-1 | Set up for you; never "available", "today", "now" | Framing | 00 | Eyebrow; inside note |
| D-2 | Receipts, invoices, quotations, delivery notes, credit notes, deposit receipts | Built, hidden | `words.py` `KIND_TITLES`; D-042 | Statements not featured (no flow) |
| D-3 | Numbers never skip; a failed issue gives its number back | Built, hidden | D-042; `numbering.py` | none |
| D-4 | Issued paper cannot change; the database refuses; refusal text quoted | Built, hidden | D-042 (trigger); `words.py` `not_a_draft` | none |
| D-5 | A correction is a credit note that voids the document; both keep numbers; nothing deleted | Built, hidden | `service.py` 479; `documentsCopy.ts` `cancelHappens`; `/d` page "Cancelled by credit note" | none |
| D-6 | ALYR never deletes an issued document | Built, hidden | D-042; 01 §2 | No retention period said |
| D-7 | No CR: receipts only, never invoices; the exact note on the paper | Built, hidden | `words.py` `NOTES.unregistered`; D-042 | none |
| D-8 | The friendly refusal when a no-CR shop asks for an invoice | Built, hidden | `words.py` `registration_needed` | none |
| D-9 | Invoices once your CR number is in your settings | Built, hidden | `kinds.py` (INV needs CR); `documentsCopy.ts` `kindHints` | Docs framing |
| D-10 | Arabic first by default; consumer documents always carry Arabic; business documents may be English only | Built, hidden | D-042; `words.py` `arabic_required`; `settings.py` | No compliance claim |
| D-11 | A receipt when a payment is recorded (cash, transfer, cheque, card terminal); staff only if the owner allows | Built, hidden | `payments.py`; `sales.py` `MANUAL_METHODS`; `documentsCopy.ts` 217–228 | none |
| D-12 | It is sent to the customer: the PDF in the chat with the caption, inside 24 hours | Built, hidden; untested live | `delivery_words.py` `caption`; migration 0038 (`auto_send_whatsapp` default true); 01 §2 | 24-hour condition beside it (demo caption, flow step 4, FAQ). Outside the window: **Gated** on three templates not yet submitted; email fallback needs an address no screen collects. No real send made |
| D-13 | A receipt when an order is paid by link; an invoice when an order goes on account; a receipt for a payment on account that says what is left; a credit note when a receipted order is cancelled | Built, hidden | `sales.py`; D-042 as built | Pay link is the stand-in page (shown on the Shelf page and /chat; on Docs the receipt demo uses cash) |
| D-14 | Each paper is issued once even if the event fires twice; a failure never stops the sale | Built, hidden | `sales.py` docstring | none |
| D-15 | A deposit receipt when part of a visit is paid | Built, hidden | `payments.py` (booking subject) | Money taken by hand; bookings take no payment online (5.6) |
| D-16 | Branches with their own series, address and phone (INV-0042, INVLUS-0007) | Built, hidden | D-042; `documentsCopy.ts` 422–429 | none |
| D-17 | Cash rounding to 5, 10, 25, 50, 100 dirhams, as its own line | Built, hidden | D-042; `kinds.py` `CASH_ROUNDING_STEPS` | Off by default (not said; neutral) |
| D-18 | A4, A5, 80 mm roll | Built, hidden | `documentsCopy.ts` `layouts`; 01 §2 | none |
| D-19 | "Issued with ALYR" / «صدر عبر ALYR», which the owner can remove | Built, hidden | `words.py` `issued_with`; `documentsCopy.ts` 392 | none |
| D-20 | Hosted page: Paid or Balance due, Download PDF; shows nothing about the customer | Built, hidden | `(product)/d/[slug]/page.tsx`; 01 §2 | 90-day link not mentioned |
| D-21 | The Documents screen: list, search, filters, delivery state, record payment, send again, cancel | Built, hidden | `documentsCopy.ts`; ALY-146 | none |
| D-22 | A customer who asked to stop gets no document message | Built, hidden | D-042 as built (`consent.refusal`) | none |
| D-23 | Your own system sends its sales by file or API; you choose whose numbers per kind | Built, hidden; gated for a real system | ALY-142; `docs/connect-api.md`; 01 §2 | No named POS; "we try it with your system first" |
| D-24 | ALYR Agent shows unpaid invoices and documents not delivered | Built, hidden | `agent/view.py` 527; `catalog.py` 251–255 | Docs framing |
| D-25 | Not yet: statements, recurring documents, tax, e-invoicing, sending outside 24 hours, collecting emails | True as "not built" | 01 §2 never-claim list | [F, legal] on the tax line |
| D-26 | Never claimed: available today; e-invoicing; GTA; "tax invoice" or VAT; compliance; retention period; invoices without CR; live card payments; quotes or statements as flows; delivery at any time; a named POS | — | 01 §2 | — |

### Site-wide

| # | Claim | Status | Source |
|---|---|---|---|
| W-1 | "Set up for you" / «نجهّزه لك» on every product; Agent and Shelf "With every product" | Founder wording | 00 |
| W-2 | Payroll appears nowhere | Founder decision | 00; D-039 |
| W-3 | /chat: a message confirming payment (not a numbered receipt) | True | `copy.ts` 1013 (the confirmation line) |
| W-4 | /agent: sales count orders, not cash taken at the counter | True | /agent FAQ `trust`; `agent/facts.py` reads orders [check that manual payments are not counted] |
| W-5 | /accounts: invoices and payment methods belong to ALYR Docs, set up with you | Built, hidden | 01 §3 |

---

## 7. Recommendations, in one place

- **Shelf hero:** Option 1, "Everything you sell, on one shelf. / Every sale counts the stock down." · «كل ما تبيعه، في مكان واحد. / ومع كل بيع، ينقص المخزون تلقائياً.»
- **Docs hero:** Option 1, "Payment in, receipt out. / Every number in order. Every paper final." · «تُسجَّل الدفعة، فيصدر الإيصال. / أرقام متتالية، ومستند لا يتغيّر.»
- **Descriptors:** Shelf "Items and stock" · «الأصناف والمخزون»; Docs "Receipts and invoices" · «الإيصالات والفواتير».
- **Order:** Chat, Bookings, Agent, Accounts, Shelf, Docs. **Routes:** `/shelf`, `/docs`. [F]

---

## 8. For other lanes (found while writing; not changed here)

**Product lane.**
1. The engine's sample customer is "Fatima Al-Kuwari" (`documents/render/sample.py` `CUSTOMER`, and `sample_body`). Al-Kuwari is a retired sample family name (honesty.md §5). Those samples are also what Meta reviews the three document templates with (`document_samples.py`). Change to a first name and a father's name (Aisha Hamad, «عائشة حمد») before the templates are submitted or the site renders from the engine.
2. First-person product voice in customer and staff replies (`items/wa_text.py`): "I noted the count", "I can message you once when…", "I will message you once when…", "I could not change…", "I will send you the payment link" (and the Arabic «سجّلتُ», «يمكنني مراسلتك», «سأراسلك», «لأرسل لك»). honesty.md §1 bans a first-person product voice. The site quotes none of them.
3. The stock log's actor label "Assistant" / «المساعد» (`catalogCopy.ts` `actors`) is on the no-AI list. The site draws no actor on those rows.
4. `documentsCopy.ts` and `words.py` say «المتجر» where the site's term list says «المحل»; fine inside the product's own screens, noted for the native review.

**Site and brand lane.** The prose lists in 5.1 and 5.3 (`voice.md`, `arabic.md`, `honesty.md`, `alyr-site-page/SKILL.md`, `docs/brand.md`) still name Payroll, "Early access" and the old not-built row.

---

## What was not checked

- No native speaker has read the Arabic (ALY-66). Every Arabic line is a draft.
- The founder's manual check of Qirfa Bakery (Instagram, Maps, the trademark register) is still open; "Date maamoul" and the Lusail branch are invented details of the same fictional bakery, not new names.
- I read the product's wording in the code; I did not run the product, the order page, the staff commands or the document engine, and rendered no paper.
- That the staff matcher finds "saffron cake" as one item for Qirfa's menu (S-6, S-7).
- That an owner can see the `document_skipped` reason (Docs story 2, step 5).
- That ALYR Agent's sales figures leave out payments recorded by hand (W-4).
- That a daily-limit item set "sold out" from a staff phone writes a stock-log row, rather than only a change record (Shelf story 2, step 5 is worded to hold either way).
- Lengths at 320 px: the Arabic menu lines and the Docs facts were not measured.
- The offer-on state and the WhatsApp contact state were not drawn.
- PR #98 (standalone mode, still named "ALYR Invoices") is open; nothing here depends on it, and its product name must become ALYR Docs (00).
- No Linear issue was named for this work; nothing in Linear was changed.
