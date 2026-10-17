# Arabic

Arabic is a first language at ALYR, not a translation. An Arabic-speaking owner notices at
once when Arabic is set as squeezed English, or when English leaks onto an Arabic page.
No agent signs off Arabic: every line is a draft until the native review (ALY-66). Say so
in every PR that adds Arabic.

## Register

| Where | Register |
|---|---|
| Site, product screens, customer pages, messages ALYR sends, emails | Modern Standard Arabic, plain, with words Gulf readers use |
| Contracts, invoices, receipts, the customer agreement, proposals | Formal MSA |
| The owner's own voice: the WhatsApp prefill (`contact.prefill`) | Gulf, on purpose: «السلام عليكم، أبي أعرف كيف تشتغل ALYR مع محلي.» |
| Staff replies drawn in a sample chat | Gulf is natural; one register within one message |
| Social posts and reels | Gulf where the brief says so (`alyr-deck-and-social`) |

Do not switch register inside one screen (an MSA body under a Gulf headline). The hero
headline is MSA: «تحوّل رقمياً.»

## Numbers, money, dates

- **Western digits** for money, times, counts, dates and phone numbers, in Arabic too.
  Never Eastern Arabic digits («٩٠»). Known product breaks: `/t/` and `/b/` print Eastern
  digits through `Intl` `ar-QA`; `ledger/service.py` hard-codes «٩٠».
- **Currency:** the amount, a space (a no-break space in the API), then «ر.ق», inside
  `<bdi>`: «38 ر.ق», «1,500 ر.ق». No "QAR" on an Arabic page or in an Arabic message. The
  API's `money()` (`apps/api/src/alyr/modules/agent/words.py`) does this; `fmt_qar`
  (`core/normalise.py`) writes "QAR 1,234" in both languages and is a known product bug.
- **Times:** «4:30 م», «9:00 ص» in the page's own text; inside drawn screens, what the
  product prints. A time inside an Arabic sentence takes its own direction (`dir="auto"` or
  `<bdi>`), or «4:30 م» reads backwards. Ranges («09:00–21:00», «0–30») go in
  `<bdi dir="ltr">`.
- **Dates:** «19 أكتوبر», never an `en-GB` date in Arabic. The week starts on Sunday.
  Day names come from the product (`DAYS` in `modules/report.py`); in tight columns, their
  initials (ح ن ث ر خ ج س).
- «صباح كل يوم أحد», never «كل أحد», which also reads "everyone".

## Bidi: `<bdi>` and marks

- Wrap in `<bdi>`: money, order and booking numbers («الطلب رقم 1043»), "ALYR", product
  names, a run of Latin words (a WhatsApp profile name), number ranges, email addresses.
- A conjunction or preposition before a Latin name joins with a no-break space: «لـ ALYR»,
  «بـ ALYR» (U+00A0). In a list, prefer commas to «و» before a Latin name.
- **WhatsApp text:** every Arabic line opens with U+200F (right-to-left mark), and a
  U+200F follows each bold or italic run that ends in Latin, or «*ALYR Chat* · 68 طلباً»
  shows as «68 · ALYR Chat».
- **resvg images:** every Arabic line inside a right-to-left embedding (U+202B … U+202C),
  each number range inside a left-to-right embedding, and the layout mirrored.
- In the site's own Arabic sentences, write people's names in Arabic («رانيا ح.»). Records
  drawn from the product (dashboard rows, sheets) may keep the Latin profile name, because
  that is how WhatsApp delivers it.

## Grammar that breaks

- **Agreement with numbers.** Arabic has one, two (the dual), three to ten (plural, the
  noun in the genitive plural) and eleven and up (singular accusative). Never write
  "{n} صنف". Use the API helpers:
  - `counted(n, noun, lang)` in `apps/api/src/alyr/core/words.py`: the noun with its number
    for 1, 2, 3–10, 11+.
  - `agree(n, one, two, many)` in `apps/api/src/alyr/modules/agent/words.py`: the verb or
    pronoun that follows («تغيّبا… ولديهما» for two, «تغيّبوا… ولديهم» for many).
  - Known divergence: `noun_after` uses 2–10 where `counted` uses 3–10. Check the output
    for 2.
  - On the site, where the type has only one/other, use a form true for every number:
    «الأصناف: {n}».
- **Whole templates, never fragments.** Each sentence is written whole in each language
  with its blanks; never join translated pieces. If a count would follow a preposition (and
  need a case the helper lacks, «على عميلين»), turn the sentence round: «6 عملاء لم يسددوا
  بعد».
- **Gender.** ALYR, the company, is feminine: «تجهّز ALYR»، «تعمل ALYR»، «لا تأخذ ALYR».
  Every product name is masculine singular, as «المنتج», including plural-looking
  "Bookings" and "Accounts": «يعمل ALYR Bookings»، «يأتي ALYR Agent». A pronoun follows its
  noun («نجهّزه لك» for a product, «نجهّزها» for ALYR). A woman customer in a sample takes
  feminine forms («كتبت سارة»).
- `احتاج إلى`, `أخبر بـ`. The sound plural drops its nun before a pronoun («موظفيّ», not
  «موظفوني»).

## Product names and the term list

- Names stay in Latin, case kept, in both languages, never broken across lines (`.pname`),
  each with its plain descriptor (D-035, `catalog.py`):
  ALYR Chat «طلبات واتساب وصندوق الفريق» · ALYR Bookings «المواعيد والتذكيرات» ·
  ALYR Agent «نشاطك بالأرقام» · ALYR Accounts «الحسابات الآجلة» · ALYR Payroll «الرواتب
  ووثائق الموظفين».
- **"Agent" is never translated.** Not «وكيل» (a registered commercial agent; also "AI
  agent"), not «مساعد» (the inbox already calls automatic replies that, and «مساعد ذكي» is
  "AI assistant"), not «مدير أعمال» or «مستشار». The company's "on your behalf" is «نيابةً عنك».
- "Meta" stays Latin; "WhatsApp" is «واتساب»; "QR" may stay Latin in «رموز QR».

| Idea | Use | Avoid |
|---|---|---|
| Orders | الطلبات | |
| Booking; the time | حجز؛ موعد | |
| Credit accounts; a credit sale | الحسابات الآجلة؛ البيع بالآجل | حسابات الآجل، دفتر الديون |
| Owed to you | المستحق لك؛ من عليه مستحقات لك | ديون |
| Promise to pay | وعد بالسداد | وعد بالدفع |
| Workspace | مساحة العمل | |
| Setup (ALYR's service and its fee) | التجهيز | الإعداد (only inside product screens) |
| Team inbox; the screen | صندوق الفريق؛ المحادثات | الوارد |
| Order tracking | تتبّع الطلب | متابعة الطلب (means "looked after") |
| Payment links | روابط الدفع | |
| No-show; came | الغياب، لم يحضر؛ الحضور، حضر | |
| Regular customer | زبون دائم | |
| Needs you now; Done for you | يحتاجك الآن؛ أنجزته ALYR لك | |
| Rule | القاعدة | خوارزمية |
| Early access; coming; not yet | إطلاق مبكر؛ قريباً؛ لم يتوفر بعد | وصول مبكر |
| Fictional | غير حقيقي | افتراضي (also "default", "virtual") |
| Owner-run businesses; your business | المنشآت التي يديرها أصحابها؛ نشاطك | |
| The shop | المحل | المتجر (only where the product prints it) |
| Patients (only if clinics are ever allowed) | مراجعون | |

## Type and layout

- IBM Plex Sans Arabic. Never letter-spaced, never in capitals, never italic, no kashida.
- Looser line height than Latin: display and headings from the Arabic display token,
  body from the Arabic body token.
- Size containers to their content; never a fixed circle, pill or width around Arabic. The
  Arabic is often the longest string on the screen (the phone bar's action is longest in
  Arabic); design for it first.
- **Never split Arabic into characters**: no SplitText chars, no per-letter animation, no
  `letter-spacing`. Arabic headings rise as one block; English may rise line by line.
- Every 45° cut, diagonal and travel mirrors. ▲▼, the logo, clocks and phone numbers do not.
- `/ar` has no English except "ALYR", product names, "Meta", email addresses and Latin
  profile names in drawn records: captions, `aria-label`s, alt text, the pending state and
  the theme switch's name all in Arabic.
- The language link lands on the same section (`/ar#price`).

## Measuring Arabic in code

- Joined Arabic is 0.66 to 0.84 as wide as its isolated letters. The card scales measured
  widths by 0.86, checked against resvg's renders; any new measuring code is checked the
  same way.
- A test fails if any line is cut with "…" or set below the medium's minimum size.
- `next/og` (Satori) joins letters but does not order Arabic words right to left and
  spaces them unevenly. Never use it for Arabic; draw with resvg (`alyr-generated-image`).
