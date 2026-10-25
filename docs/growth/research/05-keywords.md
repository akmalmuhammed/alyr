# Keyword map: the words owners in Qatar use, in Gulf Arabic and English

Growth lane, ALY-234 (part of ALY-227, search and AI visibility, D-047 in PR #123). Collected 25 Oct 2026. Feeds the sector pages (ALY-232), the owner guides (ALY-233) and the monthly AI question set (ALY-240). Numbered after research 01 to 04 of the growth plan (`docs/research/sources/growth-launch-plan/`).

**What this is and is not.** It lists what people in Qatar type, per sector and problem, and which page should answer each query. It does **not** give search volumes: Google's Keyword Planner needs a Google Ads account (the founder's), and Search Console has no data until the site is verified (ALY-228). Autocomplete shows what is typed often enough to be suggested, not how often. Treat order of appearance as a weak signal only.

## Sources, with dates

| # | Source | Date | What it gave | Limits |
|---|---|---|---|---|
| AC | Google's suggestions: the public suggestion endpoint with Qatar as the country (`gl=qa`), English (`hl=en`) and Arabic (`hl=ar`), 101 English and 97 Arabic seed phrases. Raw results: `docs/research/sources/keywords-2026-10-25/google-autocomplete.json` | 25 Oct 2026 | 1,115 suggestions (616 English, 499 Arabic) | Run from the agent's network, not a phone in Doha; Google personalises by place, so a Qatar connection may show more local results |
| WS | Web searches on the same problems in both languages (what ranks today) | 25 Oct 2026 | Who answers these questions now: global WhatsApp vendors (respond.io, Infobip, Wati-style blogs), Saudi software (Qoyod, Rekaz), freelancer sites (Khamsat, Mostaql) and Qatari payment providers (SADAD). No Qatar-based page answers the owner's question first | The search tool returns summaries, not Google's result page |
| QL1 | Qatar Living, "Selling on Instagram in Qatar? Here's what the 2026 e-commerce rules say" | Published 21 Oct 2026, read 25 Oct 2026 | Ministerial Decision 25 of 2026 (in force 16 Mar 2026): an e-commerce licence from MOCI, QAR 500, social media counts as an "electronic site", one licence per site | A news article, not the decision itself |
| QL2 | Qatar Living articles on home businesses ("MoCI makes it easier and cheaper to launch home businesses"; "Ministry allows 15 home business activities") and forum threads "Home based business in Qatar" (2012) and "Starting a home based business" (2011) | Read 25 Oct 2026 | The owner's words: "home business licence", "activity list", "sell from home"; fee cut from about QAR 1,500 to QAR 300 and activities from 15 to 63 (date of that article not confirmed) | **The forum no longer opens on the new site** (`/forum` and site search answer "Sorry, that page isn't here", 25 Oct 2026). Only old threads are found through search engines; no recent owner discussion |
| NEWS | Gulf Times and Qatar Tribune on home businesses selling through Instagram and WhatsApp; Qatar Tribune and Gulf Times on Arabic invoices (2012 bye-laws of the Consumer Protection Law; Circular 5 of 2016) | Read 25 Oct 2026 | Context for the receipts and home-business queries | Some articles are years old |
| RD | Reddit r/qatar | Tried 25 Oct 2026 | **Nothing.** Reddit refuses scripted reads (HTTP 403) and the browser pane blocks it by policy. Search engines surfaced no r/qatar thread on these topics. Not worked around | A gap, as in the growth plan's research (01 to 04) |
| PAA | Google's "People also ask" and AI Mode follow-ups | Not available to the tools on 25 Oct 2026 | Nothing | Question phrasing below comes from autocomplete ("how to ...", «كيف اسوي ...») instead |
| ST | The sales tool's objections in owners' words | 25 Oct 2026 | Nothing yet: no owner conversation is logged (ALY-58) | The best source once visits start |

## The five findings that matter most

1. **Owners do not search for "a system"; they search how to make WhatsApp do the job.** Every category phrase with "Qatar" returned nothing: "whatsapp ordering system qatar", "salon booking app qatar", "grocery pos qatar", "invoice app qatar", «نظام طلبات واتساب», «نظام نقاط البيع قطر». What does come back is how-to about the WhatsApp Business app: "how to take orders on whatsapp business", "whatsapp business auto reply message sample", "whatsapp business multiple users", "whatsapp business two phones", "whatsapp business catalog not showing", «رد تلقائي واتساب أعمال», «كتالوج واتساب بيزنس», «ربط واتساب على جهازين». **Guides beat product pages for search.** A new guide on setting up WhatsApp Business for a shop (G4 below) answers more of the queries found than any single page on the site.
2. **For debts, the owner's word is «دفتر الديون», not «الحسابات الآجلة».** Arabic suggestions are rich and specific: «دفتر الديون», «تسجيل الديون», «برنامج ديون العملاء», «دفتر حسابات العملاء», «تطبيق دفتر الديون», and an existing app's name («تطبيق ديوني»). «البيع بالآجل» returns religious rulings (حلال أم حرام), not software. In English the words are South Asian: "khata app", "udhar app", "udhaar app", "credit book app". The site calls the product «الحسابات الآجلة» and "credit accounts"; `/accounts` and guide G3 should also say «دفتر الديون» and "credit book" (a wording change for the site lane; not made here).
3. **Stock and sales searches are about a POS, and almost always "free" or "price".** «برنامج كاشير» comes with «مجاني», «مجاني مدى الحياة», «سوبر ماركت», «مطعم»; «برنامج جرد» with «excel» and «مجاني»; "pos system qatar" with "price" and "pos machine price in qatar"; "restaurant pos qatar" is a real Qatar phrase. ALYR is not a POS. An honest guide, "Do you need a POS?" (G7), meets these owners where they are without pretending.
4. **No-show searches ask for the policy and the words, not the software.** "no show policy salon template", "no show fee salon", "how to reduce no shows and cancellations", "appointment reminder message examples", "booking reminder message sample", "can hairdressers ask for a deposit", «رسالة تذكير موعد». Guide G2 should carry a ready policy and reminder messages in both languages. In Arabic, «حجز موعد» and «نظام حجز مواعيد» are swamped by embassies, hospitals and government; any Arabic bookings page must pair it with «صالون».
5. **Qatar-specific rules are the opening for a cited local source.** Real demand for "home business license qatar" (price, requirements, activity list), «ترخيص مشروع منزلي قطر», «سجل تجاري مشروع منزلي قطر», «ترخيص متجر الكتروني قطر», "qatar invoice requirements" and «فاتورة بالعربي والانجليزي». The rules changed in 2026 (the e-commerce licence) and today's answers are scattered news items. A dated, answer-first guide on each (G5, G6) can become the page assistants quote, but **the company lane must check every fact before it is published** (ALY-51 has the invoice questions).

Also worth knowing:
- **Spellings vary and all are used:** واتساب / واتس اب / الواتس; بزنس / بيزنس; أعمال / اعمال; زبائن / زباين. Gulf how-to phrasing is «كيف اسوي ...» («كيف اسوي كتالوج في الواتس», «كيف اسوي متجر الكتروني»). Use the owner's spelling in a heading and the standard one in the text.
- **Arabic owners searching for software say «برنامج»** (program), rarely «نظام» (system) or «تطبيق» (app), except for salons («تطبيق صالونات»).
- **"WhatsApp Business API" is a Qatar query**: "whatsapp business api qatar", "cost for whatsapp business api", "is whatsapp business api free", «واتساب api». Owners who reach this phrase are close to needing ALYR.
- **Restaurants** search for the menu more than ordering: "qr code menu qatar", "digital menu qatar", «منيو الكتروني واتساب», «منيو qr». Commission searches ("talabat commission qatar", «عمولة طلبات قطر») returned nothing: do not build a page on commission.
- **Home services and salons by name are customers' searches** ("ac maintenance qatar", «صيانة مكيفات 24 ساعة قطر», "ladies salon doha", «حلاق الدوحة»). Not targets; useful only as the words the sector pages use about the owner's own customers.
- **Bulk messaging is searched** («ارسال رسائل واتساب جماعية بدون حظر», "whatsapp bulk"). ALYR never does it (hard rule 5); G4 can say why such tools get numbers banned and what consent-based messages look like.

## The pages and guides the map points to

The addresses are proposals; ALY-232 and ALY-233 decide the final ones.

| Code | Page or guide | Issue | State on 25 Oct 2026 |
|---|---|---|---|
| S1 | Bakeries and home kitchens (`/for/bakeries`) | ALY-232 | Not built |
| S2 | Salons and barbers (`/for/salons`) | ALY-232 | Not built |
| S3 | Groceries and baqalas (`/for/groceries`) | ALY-232 | Not built |
| S4 | Restaurants and cafés (`/for/restaurants`) | ALY-232 | Not built |
| S5 | Home services (`/for/home-services`) | ALY-232 | Not built |
| S6 | Fashion and gifts (`/for/fashion-gifts`) | ALY-232 | Not built |
| G1 | Stop losing WhatsApp orders in the rush | ALY-233 | Not written |
| G2 | Cut no-shows with reminders | ALY-233 | Not written |
| G3 | Keep track of who owes you | ALY-233 | Not written |
| G4 | **New:** Set up WhatsApp Business for a shop: away and greeting messages, the catalogue, more than one person answering | Proposed for ALY-233 | Not written |
| G5 | **New:** Receipts and invoices in Qatar: Arabic, what must be on them | Proposed for ALY-233; facts checked by the company lane | Not written |
| G6 | **New:** Selling from home or on Instagram in Qatar: the home-business and e-commerce licences | Proposed for ALY-233; facts checked by the company lane | Not written |
| G7 | **New:** Do you need a POS? What a small shop needs to track sales and stock | Proposed for ALY-233 | Not written |
| G8 | **New:** WhatsApp Business app or the API: what changes for a shop | Proposed for ALY-233 | Not written |
| Product pages | `/` (home), `/chat`, `/bookings`, `/accounts`, `/shelf`, `/docs` and their `/ar` pages | Live | `/docs` must never say the product is available (the module is off) |

## The map

Intent: **Learn** (how-to, wants an answer), **Compare** (looking for a tool), **Do** (ready to act, or wants a download or template), **Local** (a customer looking for a business: not our audience), **Other** (another meaning; avoid). Language: **en**, **ar** (Gulf spelling marked "Gulf"). Source: AC unless stated. A query in the "Answered by" column marked "not a target" is listed so nobody builds a page for it.

### WhatsApp orders

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| how to take orders on whatsapp business | en | Learn | All | G1, G4 |
| how to receive orders on whatsapp / how to make order in whatsapp | en | Learn | All | G1 |
| how to manage orders on whatsapp business | en | Learn | All | G1; `/chat` |
| whatsapp order management system | en | Compare | All | `/chat` |
| order management app for small business | en | Compare | All | `/chat` |
| whatsapp order form / whatsapp order template | en | Do | Bakeries, fashion | G1 (a template to copy) |
| whatsapp order tracking / whatsapp order status | en | Compare | All | `/chat` |
| whatsapp business catalog (setup, not showing, limit, image size) | en | Learn | Bakeries, fashion, groceries | G4; S1, S6 |
| whatsapp business auto reply message sample / message ideas | en | Learn | All | G4, G1 |
| whatsapp business multiple users / two phones / same number | en | Learn | All | G4; `/chat` (team inbox) |
| whatsapp shared inbox / whatsapp team inbox | en | Compare | All | `/chat` |
| whatsapp for small business / whatsapp crm for small business | en | Compare | All | `/` |
| whatsapp business api qatar / cost / is it free / how does it work | en | Learn | All | G8; homepage questions |
| whatsapp link for business / whatsapp qr code for business | en | Do | All | G1; QR and chat links (ALY-43) |
| whatsapp payment link / payment link qatar / sadad payment link | en | Compare | All | `/chat` |
| restaurant whatsapp ordering / whatsapp restaurant ordering system | en | Compare | Restaurants | S4 |
| qr code menu qatar / digital menu qatar | en | Compare | Restaurants | S4; `/shelf` |
| واتساب أعمال / واتساب اعمال / واتس اب بزنس / واتساب بزنس | ar | Do (mostly downloads) | All | G4 uses every spelling in its text |
| رد تلقائي واتساب أعمال / رسالة رد تلقائي واتساب / تفعيل رد تلقائي واتساب | ar | Learn | All | G4, G1 |
| كتالوج واتساب بيزنس / عمل كتالوج واتساب / مقاس كتالوج واتساب | ar | Learn | Bakeries, fashion | G4; S1, S6 |
| كيف اسوي كتالوج في الواتس | ar, Gulf | Learn | Bakeries, fashion | G4 (as the heading) |
| ربط واتساب على جهازين / ربط واتساب اعمال | ar | Learn | All | G4; `/chat` |
| واتساب api / واتس اب بزنس api | ar | Learn | All | G8 |
| ارسال رسائل واتساب للعملاء / رسائل جماعية واتساب أعمال | ar | Do | All | G4: why bulk tools get numbers banned; consent first |
| منيو الكتروني واتساب / منيو الكتروني للمطاعم / منيو qr | ar | Compare | Restaurants, cafés | S4; `/shelf` |
| طلبات واتساب | ar | Other | — | Not a target: returns the delivery app Talabat's support number |
| cake order doha / order cake online doha / cake delivery doha | en | Local | Bakeries | Not a target; S1 uses the customer's words |
| homemade food qatar / home kitchen qatar / homemade food delivery in qatar | en | Local | Home kitchens | Not a target; S1 context |

### Bookings and no-shows

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| booking system for salons (best, free, cheapest, online) | en | Compare | Salons | S2; `/bookings` |
| appointment booking system for salon / booking software for salons | en | Compare | Salons | S2 |
| whatsapp booking system / whatsapp appointment booking system | en | Compare | Salons, home services | `/bookings` |
| how to reduce no shows / how to reduce no shows and cancellations / how to stop no shows | en | Learn | Salons, home services | G2 |
| no show policy salon / no show policy salon template / no show fee salon | en | Do | Salons | G2 (a policy to copy) |
| appointment reminder message examples / booking reminder message sample | en | Do | Salons, home services | G2 (messages to copy) |
| appointment reminder whatsapp | en | Compare | Salons | G2; `/bookings` |
| salon booking fee / can hairdressers ask for a deposit / online booking deposit | en | Learn | Salons | G2 |
| نظام حجوزات صالون | ar | Compare | Salons | S2; `/bookings` |
| تطبيق صالونات قطر / تطبيق حجز صالونات / تطبيق ادارة صالونات | ar | Compare | Salons | S2 |
| رسالة تذكير موعد | ar | Do | Salons, home services | G2 |
| نظام حجز مواعيد / تطبيق حجز مواعيد / حجز موعد | ar | Other | — | Not a target alone: embassies, hospitals, government. Always pair with «صالون» |
| fresha qatar | en | Compare | Salons | Not a target: a competitor's name (never named or attacked) |
| ladies salon doha / barber shop doha / حلاق الدوحة / صالون نسائي الدوحة | en, ar | Local | Salons | Not a target |

### Credit and debts

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| دفتر الديون / تطبيق دفتر الديون / دفتر تسجيل الديون | ar | Compare | Groceries, wholesale | G3; `/accounts` |
| تسجيل الديون / برنامج تسجيل الديون (للاندرويد، للايفون، للكمبيوتر) | ar | Compare | Groceries | G3; `/accounts` |
| برنامج ديون العملاء / برنامج تسجيل ديون العملاء | ar | Compare | Groceries, wholesale | `/accounts`; S3 |
| دفتر حسابات العملاء / دفتر حسابات محل تجاري | ar | Compare | Groceries, wholesale | `/accounts` |
| تطبيق ديوني | ar | Compare | Groceries | Not a target: another app's name; proves the category |
| البيع بالآجل | ar | Other | — | Avoid as a page keyword: returns religious rulings |
| حساب الزبائن | ar | Other | — | Avoid: an accounting-class term |
| khata app / udhar app / udhaar app | en (South Asian owners) | Compare | Groceries, restaurants | G3; `/accounts` |
| credit book app | en | Compare | Groceries | G3; `/accounts` |
| customer ledger app | en | Compare | Groceries, wholesale | `/accounts` |

### Stock and sales

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| pos system qatar / pos software qatar / point of sale qatar | en | Compare | Groceries, restaurants, fashion | G7; `/shelf` |
| pos system price in qatar / pos machine price in qatar | en | Compare | All | G7 (no ALYR price before the registration) |
| restaurant pos qatar / best restaurant pos in qatar / restaurant software qatar | en | Compare | Restaurants | S4; G7 |
| inventory management software in qatar | en | Compare | Groceries, fashion | `/shelf`; S3 |
| inventory app for small business (free) / stock management app | en | Compare | All | `/shelf`; G7 |
| low stock alert | en | Learn | Groceries, bakeries | `/shelf` |
| برنامج كاشير / برنامج كاشير مجاني / برنامج كاشير سوبر ماركت / برنامج كاشير مطعم | ar | Compare | Groceries, restaurants | G7; `/shelf` |
| برنامج جرد / برنامج جرد المحل / برنامج جرد المخزون excel | ar | Compare | Groceries, fashion | `/shelf`; G7 |
| برنامج مخزون / برنامج ادارة مخزون | ar | Compare | All | `/shelf` |
| برنامج محاسبة للمحلات (التجارية، مجاني) | ar | Compare | All | G7, which says plainly that ALYR is not accounting software |
| برنامج سوبر ماركت / برنامج حسابات بقالة | ar | Compare | Groceries | S3 |

### Receipts and invoices

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| qatar invoice requirements / qatar invoice template | en | Learn | All | G5 |
| e invoice qatar | en | Learn | All | G5 (the e-invoicing law's state, checked by the company lane) |
| how to make invoice / how to make invoice for payment / how to make invoice receipt | en | Learn | All | G5 |
| receipt maker / receipt app for business | en | Compare | All | `/docs`, which must not say it is available |
| سند قبض / سند قبض الكتروني / سند قبض pdf | ar | Do | All | G5; `/docs` |
| ايصال استلام نقدية / ايصال دفع الكتروني | ar | Do | All | G5 |
| فاتورة بالعربي والانجليزي / نموذج فاتورة بالعربية | ar | Learn | All | G5 |
| برنامج فواتير / برنامج فواتير مجاني / برنامج فواتير عربي | ar | Compare | All | `/docs`; G5 |
| فاتورة ضريبية / فاتورة ضريبية مبسطة | ar | Other | — | Not a target: Saudi and Egyptian VAT invoices. G5 can say Qatar has no VAT today (company lane to confirm) |

### Starting and running a small business in Qatar

| Query | Lang | Intent | Sector | Answered by |
|---|---|---|---|---|
| home business license qatar (price, requirements, activity list) | en | Learn | Home kitchens, fashion | G6 |
| home business registration qatar / home business permit in qatar | en | Learn | Home kitchens, fashion | G6 |
| e-commerce licence qatar (selling on Instagram) | en | Learn | Fashion, bakeries | G6 (source QL1) |
| مشروع منزلي قطر / ترخيص مشروع منزلي قطر / سجل تجاري مشروع منزلي قطر / فتح مشروع منزلي قطر | ar | Learn | Home kitchens | G6; S1 |
| اسر منتجه قطر | ar | Learn | Home kitchens | S1 (the term for home producers) |
| متجر الكتروني قطر / ترخيص متجر الكتروني قطر / انشاء متجر الكتروني قطر | ar | Learn | Fashion | G6; S6 |
| كيف اسوي متجر الكتروني / كيف ابيع على الانستقرام | ar, Gulf | Learn | Fashion, bakeries | S6; G6 |
| sme go digital qatar | en | Learn | All | No page; ALY-70's research |
| small business ideas in qatar / start small business in qatar | en | Learn | — | Not a target: too early in the journey |
| كيف ازيد المبيعات | ar | Learn | All | Not a page; a content subject (Owner playbook) |
| ac maintenance qatar / ac repair qatar / صيانة مكيفات قطر / صيانة مكيفات 24 ساعة قطر | en, ar | Local | Home services | Not a target; S5 uses the words |
| cleaning services doha / شركات تنظيف منازل الدوحة | en, ar | Local | Home services | Not a target |

## Per page: the words to put in the first lines

For ALY-232 and ALY-233: the owner's words for each page's H1, first sentence and questions. Arabic is a draft for ALY-66.

| Page | English words | Arabic words |
|---|---|---|
| S1 Bakeries and home kitchens | take orders on WhatsApp, WhatsApp Business catalogue, cake orders, home business | طلبات الكيك، كتالوج واتساب، مشروع منزلي، اسر منتجة |
| S2 Salons and barbers | booking system for salons, no-show policy, appointment reminder, deposit | نظام حجوزات صالون، تطبيق صالونات، رسالة تذكير موعد |
| S3 Groceries and baqalas | credit book, khata, who owes you, stock, POS | دفتر الديون، تسجيل الديون، برنامج ديون العملاء، برنامج كاشير، جرد |
| S4 Restaurants and cafés | WhatsApp ordering, QR code menu, digital menu, restaurant POS | منيو الكتروني، منيو QR، طلبات واتساب للمطعم |
| S5 Home services | booking on WhatsApp, reminders, customers who message while you're on a job | حجز عبر واتساب، تذكير بالموعد |
| S6 Fashion and gifts | WhatsApp catalogue, "is this available?", selling on Instagram, e-commerce licence | كتالوج واتساب، متجر الكتروني، البيع على الانستقرام |
| G1 Orders in the rush | how to take orders on WhatsApp Business, auto reply, order template | كيف استقبل الطلبات على واتساب، رد تلقائي |
| G2 No-shows | how to reduce no-shows, no-show policy template, reminder message examples | رسالة تذكير موعد، العميل ما حضر |
| G3 Who owes you | credit book, khata, track customer credit | دفتر الديون، تسجيل ديون الزباين |
| G4 WhatsApp Business setup | auto reply, catalogue, multiple users, two phones | رد تلقائي واتساب أعمال، كتالوج واتساب بيزنس، ربط واتساب على جهازين، كيف اسوي كتالوج في الواتس |
| G5 Receipts and invoices | Qatar invoice requirements, Arabic invoice, receipt | سند قبض، فاتورة بالعربي والانجليزي، ايصال استلام |
| G6 Licences | home business licence Qatar, e-commerce licence | ترخيص مشروع منزلي قطر، ترخيص متجر الكتروني قطر |
| G7 Do you need a POS? | POS system Qatar, POS price, inventory app | برنامج كاشير، برنامج جرد، برنامج محاسبة للمحلات |
| G8 App or API | WhatsApp Business API Qatar, cost, is it free | واتساب API، واتساب بزنس api |

## Ten new questions for the monthly AI question set

For ALY-240, to add to the ten in `docs/growth/visibility.md` ("Measuring, every month") when that file is merged (PR #123; not edited here). Each comes from a query family above. Gulf Arabic, a draft for ALY-66.

| # | English | Arabic |
|---|---|---|
| 11 | How do I let more than one employee answer my shop's WhatsApp Business? | كيف أخلي أكثر من موظف يرد على واتساب الأعمال حق المحل؟ |
| 12 | What is the best app to record customer debts for a grocery in Qatar? | وش أفضل برنامج لتسجيل ديون الزباين للبقالة في قطر؟ |
| 13 | Do receipts and invoices in Qatar have to be in Arabic? | هل لازم تكون الفاتورة أو سند القبض بالعربي في قطر؟ |
| 14 | How much does the WhatsApp Business API cost for a small shop in Qatar? | كم تكلفة واتساب API لمحل صغير في قطر؟ |
| 15 | How can a home bakery in Qatar organise cake orders that come on Instagram and WhatsApp? | كيف أنظم طلبات الكيك اللي توصلني على الانستقرام والواتساب من مشروعي المنزلي في قطر؟ |
| 16 | What should a salon's no-show policy say, and how do I remind clients without sounding rude? | وش أكتب في سياسة الحجز للصالون إذا الزبونة ما حضرت، وكيف أذكّرها بدون إحراج؟ |
| 17 | Do I need a POS system for a small shop in Qatar, or is there something simpler? | هل أحتاج برنامج كاشير لمحل صغير في قطر، ولا فيه شي أبسط؟ |
| 18 | Do I need an e-commerce licence to sell on Instagram or WhatsApp in Qatar? | هل أحتاج ترخيص متجر إلكتروني عشان أبيع على الانستقرام أو الواتساب في قطر؟ |
| 19 | How do I make a WhatsApp catalogue for my shop and keep it up to date when things sell out? | كيف اسوي كتالوج في الواتس لمحلي وأحدّثه إذا خلص شي؟ |
| 20 | Who can set up orders, bookings and stock for my shop in Qatar and train my staff? | مين يجهز الطلبات والحجوزات والمخزون لمحلي في قطر ويدرب الموظفين؟ |

## Next, to make this map stronger

1. **Volumes:** Google Ads' Keyword Planner for Qatar, English and Arabic, on the queries above (needs a Google Ads account: the founder's step; no spend needed).
2. **Search Console's real queries** once alyr.qa is verified (ALY-228); redo this map after a month of data.
3. **Owners' own words** from the sales tool once visits start (ALY-58): every objection and phrase goes into this map.
4. **Autocomplete from a phone in Doha**, to compare with this run.
5. **Reddit r/qatar and AI Mode follow-ups**, which could not be read on 25 Oct.

## Not checked

- Search volumes, difficulty and who ranks on Google's real result page in Qatar.
- Reddit r/qatar (blocked), recent Qatar Living forum threads (the forum no longer opens), "People also ask" and AI Mode follow-ups.
- The legal facts behind G5 and G6 (Arabic invoices, VAT, the licences): from news articles only; the company lane checks them before any guide is written.
- The Gulf Arabic phrasing of the ten questions, until the native review (ALY-66).
