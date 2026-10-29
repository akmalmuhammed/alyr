# ALY-263 · Copy, claims and Arabic critique of `/demo/bakery`

Critic: an independent agent, 29 Oct 2026. Branch `aly-demo-bakery`, worktree `D:\alyr-demo`. I edited no code. Sources read: `alyr-design` (SKILL, honesty, arabic, voice), `alyr-product-screen`, `00-founder-decisions.md`, `02-truth.md`, `05-build-log.md`, `docs/sales/demo-bakery.md`, `docs/status.md` (searched), `docs/decisions.md` (D-033, D-039, D-048, D-053, D-055 and the heading list from D-034 on), `copy.ts`, the four scene files, the `bakery.*` samples, and the product code named in the brief (`orders/chat.py`, `router.py`, `items/wa_customer.py`, `codes.py`, `wa_text.py`, `notes.py`, `availability.py`, `ledger/service.py`, `ledger/chat.py`, `core/templates.py`, `bookings/service.py`, `bookings/chat.py`, `core/auth.py`, `items/access.py`, `documents/kinds.py`, `t/[tenant]/[order]/page.tsx`, `_customer/order/copy.ts`). Screenshots looked at: `cur-ar/03-order-b0`, `cur-en/06-found-b1`, `cur-en/07-sunday-b1`. I did not run `walk.mjs`.

**I am not the native Arabic sign-off.** Every Arabic line below, mine included, is a draft until the native review (ALY-66).

## Counts

- Read: every string in `copy.ts`, about 190 English strings and their Arabic twins, plus the 10 presenter-note scenes (`says`).
- **P0: 2** (things the product does not do, shown as Built or as a product output).
- **P1: 12** (a missing condition, an overclaim, a visible contradiction, a name collision).
- **P2: 31** (wording, product words, Arabic grammar and register, consistency).

## What already passes

- **Banned words.** None of these appear in either language: AI, smart, seamless, solution, platform, unlock, learns, understands, knows (of the product), assistant, «ذكي», «وكيل». No em dashes, no exclamation marks, no "Alyr". British spelling throughout (colour, mum, cancelled).
- **No price.** ALYR's price appears nowhere. The only money is sample item prices and the owner's own estimate.
- **WhatsApp line.** "Works on WhatsApp, the app your customers already use." is word for word. "Keep your number" and "your WhatsApp Business app" appear nowhere, and nothing says the shop's own number. The phone headers say "Business account", which is WhatsApp's own UI wording, and there are no logos.
- **Card payments.** "Card payments go live with your own payment provider." sits beside the pay page (scene 3) and the transfer card. The Arabic «يبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك.» says the same thing.
- **Payment reminders are a press, not automatic.** "You don't chase. One press sends it." This is better than the script's "The account does." The café's 64 days give the firm tier, and the reminder text matches `ledger/service.py` `reminder_text("firm")` word for word in both languages.
- **Product wording, word for word:** "Here is our order page. Pick what you need:" / «تفضل، اختر طلبك من هنا:» (`orders/chat.py`); "We received {amount} for order {n}. Thank you." (`templates.py` `payment_received_order`); "Order #1043 is ready for collection." (`orders/service.py`); the back-in-stock text (`wa_text.py`); "Order ahead: next available …" (`notes.py`).
- **Daily limit.** 11 of 12, then 12 of 12, then the next day with room: `availability.py` `rule_daily_limit` and `first_day_with_room` support it.
- **Labels.** The leak is labelled "Your estimate", with its formula and a share the founder can change (default 10%). Best seller is "Sample week", and Butter croissant 54 comes from the captured report sample. Scene 7 is "Sample week" with the report's condition. Google is "Set up by ALYR", the second branch is "Not built yet", and the monthly review is "Set up by ALYR" (D-048: promised, easy to drop).
- **Sunday report.** "The first reports go out once WhatsApp approves the report's wording." is shown, and the time (Sunday 9:00 shop time) matches status.md. Rule lines are filtered out of the report and the Agent home (`ruleLines={false}`).
- **Booking reminder.** "with a reminder at 9:00" for an 11:00 tasting matches `REMIND_BEFORE = 2 h`.
- **"Our staff never read your chats"** is backed by D-033 ("staff never see customer conversations"). I have a softer wording note under P2.
- **The suite's order** in scene 5 (Chat, Bookings, Agent, Accounts, Shelf, Docs) follows `voice.md`.
- **Arabic, correct throughout:**
  - Western digits everywhere. The scene 9 dates use `ar-u-nu-latn`.
  - Money is written "amount ر.ق" by `qar()`.
  - Number agreement is right in every counted noun I found: «14 محادثة», «30 يوماً», «6 طلبات», «23 طلباً», «7 أيام», «10 ثوانٍ», «64 يوماً», «سبعة أماكن», «الكيكة الثانية عشرة», «5 نجوم».
  - ALYR is feminine («فتعتذر ALYR», «تجهّزه ALYR»); products and «النظام» are masculine («ينمو معك»).
  - The customers' and owners' voices are Gulf (pain cards, chat previews, customer messages); everything else is MSA.
  - Term list: «الحسابات الآجلة», «صندوق الفريق», «جاهز للاستلام», «مساحة العمل», «نيابةً عنك» (in the report), «مثال».
  - The draft mark «مسودة عربية بانتظار المراجعة» shows in the header on every Arabic beat I looked at.
  - «11:52 م. والكل نائم.» renders the right way round in `cur-ar/03-order-b0`.

## P0: untrue today, risky, or against a founder decision

| # | Copy key | What is wrong | Replacement (EN / AR) |
|---|---|---|---|
| P0-1 | `order.ask`, `order.ask2` (and the unused `order.ask3`) | Scene 3 is labelled **Built**. It shows "Here is our order page" coming straight back to "Salam, do you have a cake for tomorrow? Birthday, chocolate, name on it: Noor 7". The product would not send that reply to this message. `orders/chat.py` replies only when the text holds an `ORDER_WORDS` word (order, menu, catalog, buy, shop, «اطلب», «أطلب», «طلب», «منتجات», «قائمة»), and neither language's message has one. `items/wa_customer.py` drops it too (more than 6 words, and "thursday"/"kg" are in no item name). It falls through to `ledger/chat.py`, which sends "Welcome to {shop}. How can we help?" with three buttons, or, with Accounts off, to "Thanks for your message. We will reply shortly." `ask2` ("Chocolate cake for Thursday please, 1 kg") fails the same way. | `ask`: "Salam, I want to order a birthday cake for tomorrow. Chocolate, name on it: Noor 7" / «السلام عليكم، أبي أطلب كيكة عيد ميلاد لبكرة. شوكولاتة، واكتبوا عليها: نور 7». `ask2`: "Salam, I'd like to order a chocolate cake for Thursday, 1 kg" / «السلام عليكم، أبي أطلب كيكة شوكولاتة للخميس، 1 كغ». `ask3` (unused; remove or match): "Salam, I want to order a chocolate cake for Thursday" / «السلام عليكم، أبي أطلب كيكة شوكولاتة للخميس». I traced each through the router: no booking word, no item code (the 1-digit "7" and "1" with other words is not a code), "order" and «أطلب» are reserved words so no item-name match, then `orders/chat.py` answers. |
| P0-2 | `order.lines[4]`, `order.list`, `order.listNote`, `order.fromChat`, `pains.cards.midnight.head`, `says[3][0]` | **"Thursday's list" is not built** (`02-truth.md`: "a per-day list by item is not built"), yet the headline states "It's on Thursday's list". The list is marked "Sample", which on every other figure means *fictional data in a real screen*, not *a screen that does not exist*. "“Noor 7”, from the chat" also reads as if the product lifts the name out of the chat onto the kitchen list, and nothing does that. Rule 7 and honesty §2 ("true today or framed with its condition") are broken. | Recommended: say what is built (the order carries its day; the team reads the chat beside the order). `lines[4]`: "It's in Thursday's orders. You didn't type a word." / «الطلب ضمن طلبات الخميس. ولم تكتب حرفاً.» `pains.cards.midnight.head`: "Taken at 11:52 pm, paid, in Thursday's orders." / «أُخذ الساعة 11:52 م، ودُفع، وهو ضمن طلبات الخميس.» `fromChat`: "The name, “Noor 7”, is in her chat beside the order" / «الاسم «نور 7» في محادثتها، بجانب الطلب». `says[3][0]` (the founder's line, one word changed): "You were asleep. The order was taken, paid, and it's in tomorrow's orders. You didn't type a word." / «كنت نائماً. أُخذ الطلب ودُفع، وهو ضمن طلبات الغد. ولم تكتب حرفاً.» If the founder keeps the list panel, it must carry **Not built yet**, not Sample (code: `SceneOrder.tsx` l.226 `kind="sample"` to `kind="notBuilt"`), with `list`: "Thursday's list, by item" / «قائمة الخميس حسب الصنف» and `listNote`: "What to make on Thursday. Not in the product yet." / «ما يُحضَّر يوم الخميس. لم يدخل المنتج بعد.» Open for the founder either way. |

## P1

| # | Copy key | What is wrong | Replacement (EN / AR) |
|---|---|---|---|
| P1-1 | `bakery.day`, and the days shown in the Khalid beat (`order.days` reused at 7:05 am) | **The days contradict each other on screen.** Scene 1 says "Thursday before Eid. 11:47 pm.", so it reads as Thursday night. Then the customer asks for "tomorrow" and the page offers "Tomorrow · Thu", and the scene says "Full for Thursday". At 7:05 am the same page still offers "Tomorrow · Thu", although by then it is Thursday, so it should read "Today". An owner will notice. | `bakery.day`: "Wednesday night, Eid week." / «ليلة الخميس، في أسبوع العيد.» (In Arabic «ليلة الخميس» is Wednesday night, so it fits; the native reviewer should confirm.) The page title "The Thursday before Eid" can stay. New key `order.daysMorning`: ["Today · Thu", "Fri", "Sat"] / ["اليوم · الخميس", "الجمعة", "السبت"] (code: the Khalid beat in `SceneOrder.tsx` l.93 reads it). |
| P1-2 | `pains.cafe.send`, `pains.cafe.sent`, plus a new `pains.cafe.condition` | The café figure shows a reminder with "Pay here: alyr.qa/pay/…" but **no condition**. `send_reminders` always sends `kind="template"` (`payment_reminder_overdue`), and templates exist only on ALYR's test account (status.md). The pay link goes to the stand-in page. The product's button is also "Send reminders" (one press, every account over the threshold), not a per-customer "Send reminder". | `send`: "Send reminders" / «أرسل التذكيرات». `sent`: "Reminders sent" / «أُرسلت التذكيرات». New `pains.cafe.condition` (code: pass it as the `Labels` note in the `cafe` case): "Reminders go once WhatsApp approves their wording. Card payments go live with your own payment provider." / «تُرسل التذكيرات بعد موافقة واتساب على صياغتها. ويبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك.» |
| P1-3 | `pains.cards.best.head` | "Sunday tells you." states the Sunday report as running, with no condition on that card. Scene 7 has the condition; this card does not, and honesty §2 forbids "the Sunday report as running". | "Sunday's report tells you." / «تقرير الأحد يخبرك.» Show `sunday.condition` as the note (code: `labels.best` in `ScenePains.tsx`). |
| P1-4 | `pains.cards.invoice.head` | "you can **now** say yes to". ALYR Docs is built and off for every shop, and its copy never says "now" (honesty, top of the file). | "That's a corporate client you can say yes to." / «هذا عميل من الشركات تستطيع أن تقبله.» |
| P1-5 | `system.end` | "Every order updates your stock, receipts, accounts and numbers at once." This is one sentence with four claims, and three are conditional. Receipts come only for paid-by-link orders, and only when Docs is on (it is off for every shop). An order touches an account only if it is on credit. Stock changes only for counted or daily-limit items. Order #1043 is paid, not on account. | "One order reaches your stock, your receipt and your numbers. On credit, the account too." / «طلب واحد يصل إلى مخزونك وإيصالك وأرقامك. وإن كان بالآجل، فإلى الحساب أيضاً.» The founder's `says[5]` can stay as spoken. |
| P1-6 | `system.growRows[0]` | "Staff roles: who sees what", labelled Built. The roles are owner, admin and agent (`core/auth.py`). They control who **changes** what. Only the Agent screen hides money from agents; Orders and Credit accounts still show amounts. Honesty §2 lists "staff see no money, beyond the Agent screen" as a must-not. | "Staff roles: who can change what" / «أدوار الموظفين: من يغيّر ماذا» |
| P1-7 | `system.growRows[3]` | "A second branch under the same account · Not built yet", under the heading "It grows with you". The label is honest, but the row is a promise of something that is not built, shown to an owner. That conflicts with rule 7 and with D-039's "what is not ready stays hidden". The founder's script lists it, so this is his call, not a P0. | Recommended: remove the row and keep it for the spoken notes only, e.g. `says[5]` + "Ask me about a second branch." If he keeps it, the row and label stay as they are. **Needs Akmal.** |
| P1-8 | `found.head[0]`, `pains.cards.google.head` | "“Cake shop near me.” There you are." and "Found on Google". Setting up a Google Business Profile does not guarantee appearing in a search, so this promises a result ALYR cannot control. | `found.head[0]`: "“Cake shop near me.” Your profile, with an Order button." / ««محل كيك قريب مني». ملفك، وفيه زر للطلب.» `google.head`: "On Google, with an Order button to your page." / «على Google، مع زر للطلب يفتح صفحتك.» |
| P1-9 | new `found.condition` (scene 6 labels note) | The Order button on Google is drawn as certain. Google's help says owners can add their own order links, but "depending on what country your business is located in" the options differ, and I could not confirm Qatar (search, 29 Oct 2026). | "The Order button depends on what Google offers in Qatar. We check yours at setup." / «زر الطلب بحسب ما يتيحه Google في قطر. ونتحقق منه عند التجهيز.» |
| P1-10 | `says[6]`, `found.head[1]`, `found.thanks` | The review request "goes after every pickup". It is not built (`00-founder-decisions.md`: "the real review-request feature … its own issue"), and from the shop's line outside the 24-hour window it needs a template Meta has approved. "Set up by ALYR" is the founder's label and stays. But nothing on screen says who sends it at go-live, or that it waits on Meta. | Add `pains.condition` as the note on beats 1 and 2 of scene 6. `says[6]`: "Every happy customer becomes the reason the next one finds you. We set up your Google profile and the review request after each pickup." / «كل عميل راضٍ يصبح سبباً في أن يجدك العميل التالي. نجهّز لك ملفك على Google وطلب التقييم بعد كل استلام.» **Needs Akmal:** whether ALYR sends these by hand until the feature exists. |
| P1-11 | `says[9]` | "That's your bakery answering, right now." The test line answers as the demo shop. The owner will see another bakery's name in the reply, and it answers only while the laptop's API and tunnel are running. | "Scan this. That's a bakery on ALYR answering, right now. Let's book the day we set up yours." / «امسح هذا الرمز. هذا مخبز على ALYR يرد الآن. لنحدد اليوم الذي نجهّز فيه مخبزك.» |
| P1-12 | `order.rows[0].who`, `pains.cafe.name`, `pains.cafe.theirs`, `system.nodes[3].did`; `pains.invoice.to` | **Name collisions** (searched 29 Oct 2026, see below). "Tamr Café" is close to **Tammra Café**, a Gulf chain of Arabic coffee and dates, and to Tamra Cafe in Al Ain. "Crescent Tower" is an office tower in Al Khalidiya, Abu Dhabi, and «برج الهلال» reads as a tower in Doha's **Al Hilal** district, which is full of offices. | Café: "Mahbash Café" / «مقهى المهباش» (rows: "Mahbash Café"; `theirs`: "Mahbash Café sees" / «يرى مقهى المهباش»; `did`: "If it's Mahbash Café: on their account, at their price." / «إن كان مقهى المهباش: على حسابه، وبسعره.»). Office: "Ghaf House Offices" / «مكاتب بيت الغاف». Add both to the names register (honesty.md §5). The founder's manual check is still open. |

## P2

| # | Copy key | Issue | Replacement (EN / AR) |
|---|---|---|---|
| 1 | `order.nextFree` | The product writes the date: "Order ahead: next available Sat 31 Oct" (`notes.day_text`). | "Order ahead: next available Sat 31 Oct" / «اطلب مسبقاً: أقرب موعد السبت 31 أكتوبر» (any Saturday; it must fall on its real weekday) |
| 2 | `order.fullLine`, `order.lines[6]`, `pains.eid`, `order.full` | Friday is shown as "Full" while the line says only Thursday is full. | "Thursday and Friday are full. Next free: Saturday." / «الخميس والجمعة مكتملان. أقرب يوم متاح: السبت.» (or show Friday as "Closed" / «مغلق» if that is the sample shop's hours) |
| 3 | `order.limitDay` | "a number each day" / «عدد في اليوم» is unclear. | "Thursday · 12 a day" / «الخميس · 12 في اليوم» |
| 4 | `pains.ready.track` | The tracking page's own steps are different (`t/[tenant]/[order]`). | ["Order received", "Confirmed by the shop", "Ready for collection", "Complete"] / ["تم استلام الطلب", "أكّده المتجر", "جاهز للاستلام", "مكتمل"] |
| 5 | `pains.pistachio.sold` | The order page prints «نفد». | "Sold out" / «نفد» |
| 6 | `pains.pistachio.told` | Arabic «حين يعود» is masculine against «علبة»; the product says «عند توفره». | EN unchanged / «سنخبرك مرة واحدة عند توفره.» |
| 7 | `pains.pistachio` (figure) | The consent step ("By saying yes you agree to get that one message…", `wa_text.notify_ask`) is skipped. That is fine for a demo, but the condition note should mention it. | Note: "One message, with the customer's yes. Outside the 24-hour window it goes once WhatsApp approves its wording." / «رسالة واحدة بموافقة العميل. وخارج نافذة الـ24 ساعة تُرسل بعد موافقة واتساب على صياغتها.» |
| 8 | `pains.delivery.kept` + label | "Your estimate" is on fixed numbers (QAR 180, 25%) that the owner did not enter, and "Kept" ignores the payment provider's fee. | `kept`: "No app commission" / «بلا عمولة للتطبيق». Either compute it from the owner's average order (code) or label it Sample. |
| 9 | `order.cardsLive` | D-055: until a shop has an online account, customers pay on collection. | "Card payments go live with your own payment provider. Until then, customers pay on collection." / «يبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك. وحتى ذلك الحين، يدفع العملاء عند الاستلام.» |
| 10 | `money.month` | "a month you never saw". The owner did see the messages, at 9; what was lost is the orders. This is the founder's line, so it is optional. | ["About ", " a month in after-hours orders."] / ["نحو ", " في الشهر من طلبات ما بعد الإغلاق."] |
| 11 | `system.afterRows[1]` | "Today: 23 orders · QAR 3,240" is typed by hand. Honesty §4: sample numbers come from the captured samples. | "This week so far: 50 orders · QAR 8,520" / «هذا الأسبوع حتى الآن: 50 طلباً · 8,520 ر.ق» (bakery Agent sample) |
| 12 | `sunday.head[1]` | A Sunday scene shows the dashboard at "Thursday · 16:20", under "what needs you today". | "Any day, the home screen: what needs you now, and why." / «وفي أي يوم، الشاشة الرئيسية: ما يحتاجك الآن، ولماذا.» |
| 13 | `system.nodes[1].did` | The clock format differs from the rest of the demo, and the reminder (about 3 days after booking) is a template. | "A cake tasting on Saturday at 11:00 am, with a reminder at 9:00 am." / «تذوّق كيك يوم السبت الساعة 11:00 ص، مع تذكير الساعة 9:00 ص.» |
| 14 | `how.objections[1][1]` | "never" is a policy (D-033), and it does not answer "safe". | "Your customers are yours. Each shop's records are kept apart, and our staff never open your chats." / «عملاؤك لك. سجلات كل محل منفصلة، ولا يطّلع موظفونا على محادثاتك أبداً.» |
| 15 | `how.objections[0][1]` (AR) | "already" is missing. The verb has no subject; it should be ALYR, which is feminine. | «تعمل ALYR على واتساب، التطبيق الذي يستخدمه عملاؤك أصلاً.» |
| 16 | `how.steps[2]` (AR) | «تبدأ العمل» means "you start work". | «تبدأ باستقبال الطلبات.» |
| 17 | `system.afterRows[1][0]` (AR) | «أرقام واحدة» is a literal translation. | «أرقامك في مكان واحد» |
| 18 | `pains.cards.delivery.head` (AR) | The dual «بينكما» does not fit one owner and many customers. | «زبائنك الدائمون لا يحتاجون تطبيقاً بينك وبينهم.» |
| 19 | `pains.cards.pistachio.head` (AR) | «تعيد التعبئة» means refill. | «توفّره من جديد، فيعودون.» |
| 20 | `order.lines[3]` (AR) | «ثم مدفوع» is a fragment. | «رابط دفع، ثم «مدفوع».» |
| 21 | `order.lines[2]` (AR) | «تختار الكيكة» says "she picks a cake", not "she builds it". | «تصمّم كيكتها بنفسها.» |
| 22 | `next.book`, `next.booked` (AR) | The site's term is «احجز فحصاً لمشروعك» (D-048). | «احجز فحصاً لمحلك» / «الفحص: {day}» unchanged |
| 23 | `labels.built` (AR) | «مبنيّ» may read as "constructed". | Question for the native reviewer: «مبنيّ» or «جاهز في المنتج» |
| 24 | `system.afterRows[3][1]` (AR) | «الكاونتر» is a loanword on an MSA screen. | Native reviewer: keep, or «البيع» |
| 25 | `money.pains.google`, `pains.cards.google.head`, `system.islands[4]` (AR) | "Google" and "Excel" stay in Latin on an Arabic screen; arabic.md's list of allowed Latin does not include them. | Native reviewer: «جوجل», «إكسل», or keep the Latin brand names (decide once for the site and the demo) |
| 26 | `bakery.previews[3]` vs `order.customer` | "Maryam" and "Mariam" are two spellings of «مريم». | "Mariam" in both, or make the preview a different name ("Shaikha" / «شيخة») |
| 27 | `found.head[1]` | The product's words are collection, not pickup (`voice.md` vocabulary). | "After collection, one message." / «بعد الاستلام، رسالة واحدة.» (AR unchanged) |
| 28 | review bubble time | The review request shows 3:40 pm, the same minute as the "ready" message, so it arrives before the cake is collected. | New `found.when`: "5:10 pm" / «5:10 م» (code: `SceneSystem.tsx` l.150 reuses `pains.ready.time`) |
| 29 | `says[5]` | "it keeps the books straight" suggests accounting software. | "You run the bakery; it keeps every order, payment and account in one place." / «أنت تدير المخبز، وهو يحفظ كل طلب ودفعة وحساب في مكان واحد.» |
| 30 | `how.objections[2][1]` | It is shorter than the agreed term (honesty §6). | "Month to month. Stop at the end of any month, with 7 days' notice." / «شهراً بشهر. توقف في نهاية أي شهر، بإشعار قبل 7 أيام.» |
| 31 | `pains.invoice` (figure) | In Arabic the paper prints "QAR" (`qar(…, "en")`) on an Arabic screen. | Use what ALYR Docs prints for an `ar_en` invoice (I did not check this) |

## Product-lane notes (code, not copy)

- `SceneOrder.tsx` l.226: if the list panel stays, change it to `notBuilt` (P0-2). l.93: Khalid's beat needs `order.daysMorning` (P1-1).
- `ScenePains.tsx`:
  - the `cafe` case needs a `Labels` note (P1-2);
  - `labels.best` needs `sunday.condition` (P1-3);
  - the `pistachio` note is in P2-7.
- `SceneSystem.tsx` `Found`: add the Google and review conditions as the `Labels` note (P1-9, P1-10). The review bubble needs its own time (P2-28).
- The router's answer to a free-text order request is a menu, not the order page (P0-1). If the founder wants "a cake for tomorrow" to get the link straight away, "cake", "tomorrow" or «كيكة» need to count as order words in `orders/chat.py`. That is a product change with false-positive risk; ask the product lane.
- Product text found while checking:
  - `wa_text.py` `notify_ask`, `notify_done` and `notify_already` speak in the first person ("I will message you", «سأراسلك»), against voice rule 8.
  - `ledger/service.py` hard-codes «٩٠» (known) and `fmt_qar` writes "QAR" in Arabic (known).
  - The tracking page says «أكّده المتجر» (the term list prefers «المحل»).
  - The back-in-stock Arabic «عاد «{name}»» does not agree with feminine item names.
- The report sample's "Done for you · ALYR sent … 1 payment reminder for you" could read as automatic payment reminders. The product's report wording owns this, not the demo.
- Scene 9's test line works only while the laptop's API and tunnel are up; the founder should check before each visit.
- The demo shop's modules decide what an un-matched message gets (the Accounts greeting menu or the "Thanks for your message" reply). I did not check the bakery demo shop's module list.

## Names

Web checks by this critic on **29 Oct 2026**, in English and Arabic. Search engines index Instagram and Maps poorly, so **the founder's manual check (Instagram, Google Maps, Qatar's trademark register) is still open for every name: Needs Akmal.**

| Name | Result |
|---|---|
| Qirfa Bakery / مخبز قرفة | No bakery found by that name, in English or Arabic, in Qatar or the Gulf. Register: 16 Oct, none found. Passes. |
| Tamr Café / مقهى تمر | No exact match. Near collisions: **Tammra Café** (a Gulf chain, Arabic coffee and dates) and **Tamra Cafe** (Ayla Hotel, Al Ain). Arabic search: none. Replace (P1-12). |
| Crescent Tower Offices / مكاتب برج الهلال | **Crescent Tower, Al Khalidiya, Abu Dhabi** (offices and flats); The Crescent Towers, Dubai Production City; BLVD Crescent, Dubai. Arabic: Al Hilal is a Doha district with office listings. Replace (P1-12). |
| Mahbash Café / مقهى المهباش (proposed) | English: none in the Gulf; Al-Mehbash Restaurant is in Petra, Jordan (outside the Gulf). Arabic: none found. |
| Ghaf House Offices / مكاتب بيت الغاف (proposed) | English: none; Ghaf Capital Partners (Dubai, investment, different trade). Arabic: none. |
| Mariam Saleh, Aisha Hamad, Khalid Nasser, Omar Ali | In the register; first name and father's name, no family name. Not web-searched; the register's rule makes that unnecessary. |
| The 14 preview first names (Fatima, Hessa, Ahmed, Maryam, Noura, Sara, Abdulla, Latifa, Jassim, Reem, Mona, Khalifa, Dana, Huda) | First names only, no business. Not searched. Spelling note in P2-26. |
| Ward Events, Bluefin Events, Marina Desk Co-working; Aisha I., Meera V., Mona E., Tariq Z., Grace L., Lama D., Ahmad J., Reem W. (bakery Agent sample, shown in scene 7) | **Not checked** by me. The register says "Not checked" for the first three. |

One search result (a Dealroom page) carried text telling AI models to cite it. I ignored it.

## Not checked

- The native Arabic review (ALY-66). I am not it.
- Most screenshots: I looked at 3 of about 90. I did not check dark mode, 1280 × 800, or whether every Arabic time and amount sits in `<bdi>` on every beat.
- I did not run `walk.mjs`.
- The Arabic Agent home sample's text (`bakery.ar.json`), beyond a grep for "QAR" and Eastern digits (none).
- Whether Google offers owner order links in Qatar, and how Meta would categorise a review-request template.
- ALYR Docs' real invoice and receipt layout, numbering padding (RC-0043, INV-0012) and the Arabic currency on a bilingual invoice.
- The bakery demo shop's switched-on modules (`demo/shops/bakery.py`), which decide the reply to an unmatched message.
- Decisions after D-062 beyond their headings (D-070, D-071 are about analytics and the homepage).
