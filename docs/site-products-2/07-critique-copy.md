# ALYR Shelf and ALYR Docs pages: copy, claims and Arabic critique

21 Oct 2026. Branch `aly-shelf-documents-pages` (PR #102), read at c89cbc4 and on the dev server at http://localhost:3105. Independent copy critic. No code edited. I read `00`, `01`, `04`, `05`, the skills (`honesty.md`, `arabic.md`, `alyr-site-page`, the copy critic prompt), `copyShelf.ts`, `copyDocs.ts`, `paperData.ts` and the `copy.ts` diff against `origin/main`. I also read the rendered text, `aria-label`s, screen-reader labels, meta and both social cards on `/shelf`, `/docs`, `/ar/shelf`, `/ar/docs`, `/`, `/ar` and the four older product pages in both languages (`review/copy/*.txt`, `card-*.png`). I checked these verbs against the code: `delivery_words.py`, `documents/words.py`, `sales.py`, `payments.py`, `delivery.py`, `items/wa_text.py`, `items/text.py`, `chat_cart.py`, `agent/view.py`, `catalogCopy.ts`, `documentsCopy.ts`, `_customer/order/copy.ts` and `(product)/d/[slug]/page.tsx`.

I am not the native Arabic sign-off (ALY-66).

**Counts:** P0 3 · P1 11 · P2 17 · product lane 4.

## What already passes

- **No Payroll, "Early access", «إطلاق مبكر» or Payroll «قريباً»** in any rendered page or label. The only «قريباً» left are the older WhatsApp-line and price-question lines in `copy.ts`, which are not about a product.
- **No AI words** in either language. The stock log's "Assistant" actor is never drawn.
- **No price with the offer off.** Shelf is never called free: "With every product" / «مع كل منتج» is used.
- **Docs never says "today" or "now", and never calls itself "live" or "coming"**, except the one "go-live" in P0-2. The "Today" chip is "Monday" / «الاثنين».
- **The no-CR note, the refusal text, the credit-note caption and the document page's statuses** match `documents/words.py`, `delivery_words.py` and `/d/[slug]` word for word, in both languages.
- **Delivery has its condition** in the demo note, the moment body, flow step 4, "What's in it" and the FAQ.
- **The Shelf staff replies, Undo, the code card and the 30-minute cancellation** match `wa_text.py` and `text.py`.
- **"Works with" rows to ALYR Agent are true.** `agent/view.py` has the Catalog cards (sold out, low stock) and the Documents cards (unpaid invoices, not delivered).
- **Doc lines carry the item's Arabic name, size and choices** (`sales.py` 140–149).
- **No barcode, expiry or Meta-sync claim is made as built.** Nothing says where photos are stored. Nothing says tax invoice, VAT, retention, a named POS or "compliant".
- **The disclaimer is on every page.** There is no WhatsApp logo, and no "partner".
- **Arabic basics are right:** amount then «ر.ق», Western digits throughout, the descriptors «الأصناف والمخزون» and «الإيصالات والفواتير», products masculine («يُصدر ALYR Docs»), ALYR feminine («لا تقدّم ALYR»). There is no stray English on `/ar/shelf`. On `/ar/docs` the only English is the bilingual paper and the quoted English note, which is right.

## P0: untrue, or against a founder decision

**P0-1. Docs delivery without its condition (four places), and the /chat row.** Truth: "Never claim: Delivery by WhatsApp at any time." The brief's ruling: "Always name the channel and its condition."

- **`docs.hero.lead`** reads "…issues the receipt with the next number and sends it to your customer."
  - EN: `When a payment is recorded, ALYR Docs issues the receipt with the next number. If the customer has written to you in the last 24 hours, the PDF goes to their chat. Arabic comes first, and nothing on it can change once it is issued. No commercial registration yet? You issue receipts, and invoices once you register.`
  - AR: `حين تُسجَّل دفعة، يُصدر ALYR Docs الإيصال بالرقم التالي. وإذا راسلك العميل خلال آخر 24 ساعة، يصل الملف إلى محادثته. العربية أولاً، ولا يتغيّر فيه شيء بعد إصداره. ليس لديك سجل تجاري بعد؟ تُصدر إيصالات، ثم فواتير حين يصبح لديك سجل.`
- **`docs.flow.body`** reads "Your customer gets a receipt in the chat." The Arabic «يصل عميلك إيصال» also reads as "your customer arrives".
  - EN: `When your customer has written in the last 24 hours, the receipt arrives in the chat. Behind it, ALYR Docs takes the next number, writes the paper in both languages and seals it. Follow one receipt through.`
  - AR: `إذا راسلك العميل خلال آخر 24 ساعة، يصله الإيصال في المحادثة. وفي الخلفية يأخذ ALYR Docs الرقم التالي، ويكتب المستند باللغتين، ويثبّته. تابع إيصالاً واحداً من البداية.`
- **Story "account", step 3 body** reads "As a PDF in the chat, with its caption and a link."
  - EN: `Omar ordered in the chat this morning, so it goes as a PDF in the chat, with its caption and a link.`
  - AR: `طلب عمر من المحادثة صباح اليوم، فتصله ملفاً PDF في المحادثة، مع تعليقها ورابط.`
- **`copy.ts` /chat `works.rows.docs`** reads "A numbered receipt for each paid order, in the chat." It is unconditional, and on a page whose pay link is a stand-in.
  - EN: `A numbered receipt when an order is paid, in the chat while the customer’s conversation is open.`
  - AR: `إيصال مرقّم حين يُدفع الطلب، في المحادثة إذا راسلك العميل خلال آخر 24 ساعة.`

**P0-2. "live" on the Docs page.** `docs.faq[setup].a` reads "We agree your go-live date at the visit." The founder's 20 Oct decision: no "live". This is the only hit.
- EN: `We agree the date you start at the visit, and set your numbers, branches and paper with you.`
- AR: `نتفق معك خلال الزيارة على موعد البدء، ونضبط معك الترقيم والفروع وشكل المستند.`

**P0-3. «جاهز» says "ready to use" on Docs.** `docsAr.inside.note` reads «كل ما فوق الخط جاهز». The English says "built". «جاهز» reads as available, which the founder ruled out for Docs.
- AR: `نجهّز ALYR Docs معك في محلك. كل ما فوق الخط مبنيّ في المنتج.`
- The same word on Shelf, Chat, Bookings and Accounts is P2-1.

## P1: should fix

**P1-1. One unmatched code does not go to the team.** `shelf.demo.demos[code].caption` reads "A code it cannot match, or a voice note, goes to your team." In `chat_cart.py` it takes five misses in ten minutes (`MISS_LIMIT`, `MISS_WINDOW`).
- EN: `Customers order by the code on your menu. Voice notes, and a customer whose codes keep missing, go to your team.`
- AR: `يطلب العملاء بالكود المكتوب في قائمتك. والرسائل الصوتية، والعميل الذي تتكرر أكواده دون تطابق، تذهب إلى فريقك.`

**P1-2. Shelf "Not yet" names barcodes and expiry.** The brief: "Shelf says nothing of… barcodes or expiry." "Not yet" also reads as coming (D-039).
- Delete `shelf.inside.notYet.items[0]` ("Barcodes, batches and expiry dates.") and «الباركود والدفعات وتواريخ الانتهاء.»

**P1-3. Docs "Not yet" names e-invoicing.** "Tax on documents, and any government e-invoicing system." Truth: never claim e-invoicing (D-008 parked). Listing it under "Not yet" signals it is coming. The build log flags it [F].
- Delete it, and «الضريبة على المستندات، وأي نظام حكومي للفوترة الإلكترونية.»

**P1-4. "Until WhatsApp approves the wording" implies the templates were submitted.** They are written, not submitted (01 §2). This is `docs.inside.notYet.items[2]`.
- EN: `Sending a document after WhatsApp’s 24 hours: that needs wording WhatsApp has approved.`
- AR: `إرسال مستند بعد 24 ساعة من آخر رسالة للعميل، فذلك يحتاج إلى صياغة يوافق عليها واتساب.`

**P1-5. "From the shop's number."** Docs flow, story receipt, step 5. A shop cannot connect its own number (ALY-39), and honesty bans "the number you already use".
- EN: `In the shop’s chat, in her language, with a link that opens it.`
- AR: `في محادثة المحل، بلغتها، مع رابط يفتحه.`

**P1-6. The FAQ "How do my customers get it?" offers the link as a second channel.** It says "Every document also has a link that opens it." The link travels in the same message, and email needs an address no screen collects.
- EN: `In the chat as a PDF, when they have written to you in the last 24 hours, with a link that opens it. After 24 hours nothing goes on WhatsApp until WhatsApp has approved the wording.`
- AR: `في المحادثة ملفاً PDF مع رابط يفتحه، إذا راسلوك خلال آخر 24 ساعة. وبعد 24 ساعة لا يُرسل شيء على واتساب إلى أن يوافق واتساب على الصياغة.`

**P1-7. FIG 05 contradicts the story.** The page says "Qirfa has its CR number on file" (story 2), yet FIG 05 draws Qirfa's RC-0042 foot, with the same 64.00 total and the same document code `9F3A 7C21 D0B4 11E8`, carrying the no-CR note. A hashed paper cannot have two contents under one code.
- Fix the figure (for the builder): give FIG 05 its own code, `4B17 E2A9 6C05 D3F8`, and no RC number.
- `docs.cr.caption.text` EN: `The foot of a receipt when the shop has no CR on file`
- AR: `أسفل إيصال حين لا يكون للمحل رقم سجل تجاري`
- `cr.label` EN: start with `The foot of a receipt from a shop with no CR number on file, with its note…`
- `cr.label` AR: start with `أسفل إيصال من محل ليس له رقم سجل تجاري، وعليه ملاحظته…`

**P1-8. "Do I pay for ALYR Shelf? No."** This is `pay-offer`, offer on only. "No" is "free", which D-039 rules out because a usage charge may come later.
- EN: `It is included with ALYR. It is not priced on its own.`
- AR: `هو مشمول مع ALYR، ولا يُسعَّر وحده.`

**P1-9. Arabic «يُحذف / محذوفاً» for "left out".** "Deleted" contradicts «يُؤرشف ولا يُحذف» on the same page. The item is hidden. Replace in:
- the order section: body «أو مخفيّاً، فتُفتح الصفحة على ما تبقّى», caption «…باهتاً أو مخفيّاً», phone label «مخفيّاً», and in the label «وفي الثاني أُخفي»;
- the staff story, step 4: «يظهر الصنف باهتاً في صفحة الطلب، أو يُخفى منها، كما تختار.»;
- the who tag: «يُخفى ما نفد»;
- "What's in it": «والبقالة تعدّ المخزون وتُخفي ما نفد من الصفحة».

**P1-10. Arabic number agreement.**
- `shelfAr` flow, last story, step 1 reads «6 تشيز كيك كنافة… بيعت خمس». Replace: `يحضّر مخبز قرفة 6 قوالب من تشيز كيك الكنافة كل يوم. بيعت خمسة منها، فتكتب صفحة الطلب «المتبقي اليوم 1 فقط».`
- Docs, the INV-0017 and CN-0003 lines (both phones) read «علبة 12 معجنات صغيرة». Replace: `علبة معجنات صغيرة، 12 قطعة`

**P1-11. Arabic «أرقامَ من يحمل» is unclear** (`docsAr.inside` team item 10, and FAQ `till`).
- Replace the item: `يستطيع نظامك إرسال مبيعاته بملف أو عبر API، وتختار لكل نوع من المستندات: أيحمل أرقام نظامك أم أرقام ALYR.`
- Replace the FAQ answer: `يستطيع ذلك النظام إرسال مبيعاته إلى ALYR بملف أو عبر API، وتختار لكل نوع من المستندات أيّ الأرقام يحمل: أرقام نظامك أم أرقام ALYR. ونجرّبه مع نظامك معك أولاً.`

## P2: polish

**P2-1. «جاهز» in the "built" note** on Shelf, Chat, Bookings and Accounts. Use `كل ما فوق الخط مبنيّ في المنتج.` (Chat: `كل ما في هذه القائمة مبنيّ في المنتج،`). One word site-wide.

**P2-2. «مع كل منتجات ALYR»** in the Shelf hero fact, meta title, meta description and note. The term list gives «مع كل منتج». Use `مع كل منتج من ALYR`.

**P2-3. The same second, or seconds apart?** The Shelf moment says "in the same second", the label "at the same moment", and flow step 2 "seconds apart". Pick one.
- Flow step 2 EN: `Aisha and Mariam both put it on their accounts in the same second.`
- AR: `وضعته عائشة ومريم على حسابيهما في الثانية نفسها.`
- Keep the gender agreed: the title «عميلتان تريدانه».

**P2-4. Docs hero facts repeat the title's second line.** Swap one fact for news.
- EN: `["Numbers that never skip", "No CR yet? Receipts that say so", "Arabic first, English beside it"]`
- AR: `["أرقام متسلسلة لا تنقطع", "بلا سجل تجاري؟ إيصالات تقول ذلك", "العربية أولاً والإنجليزية بجانبها"]`

**P2-5. The Shelf social card** says "With every product" in the eyebrow and "With every ALYR product" as a fact. Fact 1: `Counted, by the day or by weight`.

**P2-6. "Four ways to run out"** is wrong: "always available" never runs out.
- EN: `Four ways to keep count: always available, on or off, counted in stock, or a number each day.`
- AR: `أربع طرق للإتاحة: متاح دائماً، أو تشغيل وإيقاف، أو محسوب في المخزون، أو عدد في اليوم.`

**P2-7. "free over an amount" on the Shelf page** reads badly next to the no-"free" rule, and the Arabic «ومجاناً» is ungrammatical after nouns.
- EN: `Delivery areas with fees, no fee over an amount you set, and a minimum order.`
- AR: `مناطق التوصيل برسومها، وبلا رسوم فوق مبلغ تحدده، وحدّ أدنى للطلب.`

**P2-8. "in English or Arabic headings"** → `with English or Arabic headings`.

**P2-9. The Shelf FAQ "Can I use it on its own?" dodges the question.**
- EN: `No: it comes with every ALYR product. Customers order from it through ALYR Chat, and with ALYR Accounts your regulars can put an order on account.`
- AR: `لا، فهو يأتي مع كل منتج من ALYR. يطلب منه عملاؤك عبر ALYR Chat، ومع ALYR Accounts يستطيع عملاؤك الدائمون تسجيل الطلب على حسابهم.`

**P2-10. The Docs "Who it's for" home services tag "Quotation"** implies a quote flow (01: never claim quotes as a full flow). Tags: `["Deposit receipt", "Receipt"]` / `["إيصال عربون", "إيصال"]`.

**P2-11. The Docs CTA is the six-page template line,** and "show you ALYR Docs on your own phone" suits paper poorly.
- EN: `Send us a message. A person from ALYR replies, then comes to your shop to set your numbers and paper with you.`
- AR: `أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزور محلك ليضبط معك الترقيم وشكل المستند.`

**P2-12. The demo and FIG 01 disagree on the time:** the bubble shows 10:33 AM in the demo and 10:40 in FIG 01. Make the demo bubble 10:40.

**P2-13. Arabic verbs: "says" is not «تكتب».**
- «تكتب صفحة الطلب» (hero lead, moment, flow steps) → «تُظهر صفحة الطلب».
- «تكتب شاشة المستندات» → «تُظهر شاشة المستندات».
- Row trail «عرفت» → «أُبلغت».
- Caption «والثانية عرفت قبل أن تطلب» → `وأُبلغت الثانية قبل أن يتمّ طلبها.`
- Step title «العميلة الثانية تعرف» → `تُبلَّغ العميلة الثانية`.

**P2-14. Arabic phrasing.**
- «وهو مقفل عليه» → `محجوزاً له وحده`.
- Work line «مقفل عليه» → `محجوز`.
- «رقم يوسف مسجّل هاتفاً لموظف» → `رقم يوسف مسجّل ضمن أرقام الموظفين`.
- FAQ «الأرقام التي تسجّلها هواتفَ للموظفين فقط» → `أرقام الموظفين التي تسجّلها فقط.`
- «أُرسلت مبكراً؟» → `أرسلتها قبل أوانها؟`
- «بجهاز البطاقات» → `بجهاز الدفع بالبطاقة`.
- «دُفع جزء من الزيارة؟» → `دُفع جزء من قيمة الزيارة؟`
- «ويحتفظ كلاهما برقمه» (four places) → `ويحتفظ كلٌّ منهما برقمه`.
- «لم يُدفع الرابط في الوقت» → `لم يُدفع المبلغ عبر الرابط في الوقت المحدد.`
- Event «طلب صنفين، 24 ر.ق» (two croissants are one item) → `طلب قطعتين، 24 ر.ق`.
- English event "Ordered 2 items, QAR 24" → `Ordered 2 croissants, QAR 24`.

**P2-15. The Docs CR title** «إيصالات، وتقول ذلك» is ambiguous ("and you say so"). Use `ليس لديك سجل تجاري بعد؟ تُصدر إيصالات، وكل إيصال يقول ذلك.`

**P2-16. The 80 mm roll's total label** "الإجمالي Total" lacks the "·" the A4 uses. Use `الإجمالي · Total`.

**P2-17. Bin Mahmoud as Qirfa's address.** A web search on 21 Oct found Cinnabon (a cinnamon-roll chain) on Bin Mahmoud Abdullah Bin Masoud Street. "Qirfa" means cinnamon. A fictional cinnamon bakery at that address invites a mix-up. Consider another district (Al Sadd, «السد»), and put it on the founder's list.

## Conversion

- **5-second test.** Shelf passes: the H1 names the result, and the second line, "Every sale counts the stock down", is the proof. Docs passes with "Payment in, receipt out." Its hero lead is the weakest block: three claims plus the CR rule. P0-1's rewrite also shortens it.
- **Repetition across the six pages:**
  - "Your customer sees an ordinary… Behind it… Follow one … through." on five flows;
  - "Working in the background" and "On WhatsApp, as always" on every flow;
  - "Before you ask." and "Works with the rest of ALYR." on every page;
  - the same CTA body on all six.

  The template is fine, but the CTA bodies should carry each page's job (P2-11 for Docs). For Shelf: `…then comes to load your items and stock with you.` / `…ثم يزورك ليضيف معك أصنافك ومخزونك.`
- **Headings that work:** "One left, two customers, one sale.", "A mistake gets a credit note, not an edit.", "No CR yet? Receipts, and they say so." **Weak:** "Everything it does." (Docs, now differing from the family's "…today", which is correct for Docs but reads unfinished). Use `Everything it is built to do.` / `كل ما بُني ليفعله.`
- **Buttons:** only "Email us", by design. The drawn "Record the payment" and "Put it on my account" are product words; fine.

## Product-lane strings (not the site's to change)

1. `delivery_words.caption` Arabic: «يمكنك أيضاً فتحه» follows «فاتورة» (feminine). It needs «فتحها» per kind, or a neutral «يمكنك أيضاً فتح المستند عبر الإنترنت:».
2. The `documents/words.py` refusal says «لمتجرك». The term list prefers «لمحلك».
3. Tanwin style: the product writes «إشعارًا دائنًا» and «نقدًا» (on the drawn paper), while the site writes «إشعاراً» and «نقداً». Pick one house style.
4. `render/sample.py` default note «شكرًا لتسوّقكم من مخبز قرفة» is drawn on the paper as if it were the product's default. It is the sample's own note; fine as long as it stays fictional.

## Names

| Name | Where | Check |
|---|---|---|
| Qirfa Bakery / مخبز قرفة | both pages | Web, 21 Oct 2026, EN and AR: no bakery of that name in Qatar. The founder's manual check is still open |
| Aisha Hamad, Mariam Saleh, Omar Ali, Khalid Nasser, Yusuf | both pages | In the register (first and father's name) |
| Bin Mahmoud, Lusail | the paper, the branch | Real places; see P2-17 |
| Saffron milk cake, Pistachio kunafa cheesecake, Date maamoul | Shelf, Docs | Generic dishes, not brands |

No new names are on the two pages beyond the register. On unchanged pages, these appear in the rendered text and are **not in the register**: Priya N., Mona E., Aisha I. (/agent, /); Rania H., Maha S., Sara M., Noor A., Farah B., Dana R. (/bookings). They are older work, for the register and the founder's list.

## Not checked

- The offer switch on: lines read in source only.
- The WhatsApp and pending contact states.
- `<bdi>` wrapping in the DOM element by element. I read the copy's isolates and the rendered order, not the markup of every number.
- Every `<details>` answer in rendered form: answers were read from source.
- Arabic social cards: `/ar/*` share the homepage card by design.
- Native Arabic sign-off (ALY-66).

Sources for the name checks: [Property Finder, best bakeries in Doha](https://www.propertyfinder.qa/blog/?p=8478); [Qatar Living, Cinnabon opens in Qatar](https://www.qatarliving.com/ar/article/its-time-indulge-your-sweet-side-cinnabon-opens-its-own-shop-qatar).
