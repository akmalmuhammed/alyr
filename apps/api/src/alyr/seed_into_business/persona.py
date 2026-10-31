"""The made-up business the demo tells the story of: Zaman Bakehouse («مخبز زمان»), a
neighbourhood bakery and café in Doha that also caters for offices and events (spec 063).

Everything here is data, in both languages. The words are written once, here, and nowhere
else: the writer (`world.py`) turns them into rows through the product's own services. Every
name is invented. People go by a first name and an initial, the way a shop saves them in its
phone, so no name is a real person's. Phone numbers are in a range that cannot belong to a
subscriber (+974 5550 0xxx). The brand is the story's, not the business's: the business keeps
its own name in ALYR, and the story's name appears only on the documents it issues and in the
words of the chats (`BRAND`).

The Arabic is a draft until a native speaker reviews it (ALY-66): natural Gulf-flavoured
Modern Standard for products and notices, plainer Gulf Arabic in what customers type.
"""

from dataclasses import dataclass

from alyr.demo.model import Choice, Customer, Product, Size, qar

BRAND = "Zaman Bakehouse"
BRAND_AR = "مخبز زمان"
BRAND_LONG = "Zaman Bakehouse & Catering"
BRAND_LONG_AR = "مخبز زمان للمخبوزات والتموين"
AREA = "Al Waab"
AREA_AR = "الوعب"
ADDRESS = "Shop 4, Al Waab Street, Doha"
ADDRESS_AR = "محل 4، شارع الوعب، الدوحة"
# The story's customer-facing phone, in the fictional range.
BRAND_PHONE = "+974 5550 0900"
HUE = 32

# ── the team ──────────────────────────────────────────────────────────────────────────────
# (key, name, Arabic name, role, what they do in the story). The sign-in address is built from
# the key and the business's address; `.example` is a domain no mail can ever reach.


@dataclass(frozen=True)
class Member:
    key: str
    name: str
    name_ar: str
    role: str
    title: str
    title_ar: str


TEAM = (
    Member("hessa", "Hessa", "حصة", "owner", "Co-owner", "شريكة في الملكية"),
    Member("rashid", "Rashid", "راشد", "admin", "Manager", "المدير"),
    Member("noura", "Noura", "نورة", "agent", "Head baker, cakes", "رئيسة الخبّازين، الكيك"),
    Member("faisal", "Faisal", "فيصل", "agent", "Counter and WhatsApp", "الكاونتر وواتساب"),
    Member("dina", "Dina", "دينا", "agent", "Catering consultant", "مستشارة التموين"),
)
OWNER_KEY, ADMIN_KEY, COUNTER_KEY = "hessa", "rashid", "faisal"

# ── categories, in the order the menu shows them ───────────────────────────────────────────
BREADS = ("Breads", "الخبز")
PASTRIES = ("Pastries and savouries", "المعجنات والمالح")
CAKES = ("Cakes", "الكيك")
SWEETS = ("Arabic sweets", "الحلويات العربية")
DRINKS = ("Coffee and drinks", "القهوة والمشروبات")
CATERING = ("Catering and trays", "التموين والصواني")
CATEGORIES = (BREADS, PASTRIES, CAKES, SWEETS, DRINKS, CATERING)

# ── choices ───────────────────────────────────────────────────────────────────────────────
MESSAGE = Choice(
    "Message on the cake", "الكتابة على الكيكة", True,
    (("Happy birthday", "كل عام وأنت بخير", 0), ("Congratulations", "مبروك", 0),
     ("Eid Mubarak", "عيد مبارك", 0), ("No message", "بدون كتابة", 0)),
)
MILK = Choice(
    "Milk", "الحليب", True,
    (("Whole milk", "حليب كامل الدسم", 0), ("Oat milk", "حليب الشوفان", qar(3)),
     ("Almond milk", "حليب اللوز", qar(3)), ("Skimmed milk", "حليب قليل الدسم", 0)),
)
SHOT = Choice("Extra", "إضافة", False, (("Extra shot", "جرعة إسبريسو إضافية", qar(4)),))
MANOUSHEH_EXTRAS = Choice(
    "Add to your manousheh", "أضف إلى المنقوشة", False,
    (("Halloumi", "جبنة حلوم", qar(5)), ("Olives", "زيتون", qar(3)), ("Labneh", "لبنة", qar(3))),
    max_choices=3,
)
SETUP = Choice(
    "Service", "الخدمة", False,
    (("Plates and cutlery for the group", "صحون وأدوات مائدة للمجموعة", qar(25)),
     ("Two servers for two hours", "نادلان لمدة ساعتين", qar(180))),
    max_choices=2,
)

NEXT_DAY = (1, "17:00")
TWO_DAYS = (2, "17:00")
THREE_DAYS = (3, "17:00")


def _p(key, name, name_ar, category, price, motif, desc, desc_ar, **more) -> Product:
    return Product(key, name, name_ar, category[0], qar(price), motif, desc, desc_ar, **more)


PRODUCTS = (
    # ── Breads: baked at dawn, a number a day ─────────────────────────────────────────────
    _p("sourdough", "Sourdough loaf", "رغيف العجين المخمّر", BREADS, 16, "loaf",
       "Baked at dawn with a chewy crust.", "يُخبز مع الفجر بقشرة مقرمشة.",
       rule="daily_limit", daily=14, pop=7, sku="BRD-001",
       groups=(("corporate", qar(14)), ("wholesale", qar(12)))),
    _p("multigrain", "Multigrain loaf", "رغيف الحبوب المتعددة", BREADS, 15, "loaf",
       "Seeds, oats and wholemeal flour.", "بذور وشوفان ودقيق القمح الكامل.",
       rule="daily_limit", daily=12, pop=5, sku="BRD-002",
       groups=(("corporate", qar(13)), ("wholesale", qar(11)))),
    _p("tannour", "Tannour bread, bag of 6", "خبز التنور، كيس 6", BREADS, 6, "bag",
       "Fresh from the clay oven every morning.", "طازج من التنور كل صباح.",
       unit="pack", rule="daily_limit", daily=40, pop=8, sku="BRD-003",
       groups=(("wholesale", qar(4)),)),
    _p("brioche", "Brioche loaf", "خبز البريوش", BREADS, 18, "loaf",
       "Soft, buttery, good for toast.", "طري بالزبدة، مناسب للتوست.",
       rule="daily_limit", daily=8, pop=4, sku="BRD-004"),
    _p("date-walnut", "Date and walnut bread", "خبز التمر والجوز", BREADS, 20, "loaf",
       "Khalas dates and walnuts, lightly sweet.", "تمر خلاص وجوز، حلاوته خفيفة.",
       rule="daily_limit", daily=8, pop=5, sku="BRD-005"),
    _p("wholewheat-toast", "Wholewheat toast loaf", "توست القمح الكامل", BREADS, 12, "loaf",
       "Sliced, with no added sugar.", "مقطّع وبدون سكر مضاف.",
       rule="daily_limit", daily=10, pop=4, sku="BRD-006", state="low"),
    # ── Pastries and savouries ────────────────────────────────────────────────────────────
    _p("butter-croissant", "Butter croissant", "كرواسون بالزبدة", PASTRIES, 7, "loaf",
       "Layered and crisp.", "طبقات هشّة ومقرمشة.",
       rule="daily_limit", daily=40, pop=9, sku="PST-001",
       groups=(("corporate", qar(6)), ("wholesale", qar(5)))),
    _p("almond-croissant", "Almond croissant", "كرواسون باللوز", PASTRIES, 12, "loaf",
       "Filled with almond cream, flaked almonds on top.", "محشو بكريمة اللوز مع شرائح لوز.",
       rule="daily_limit", daily=24, pop=6, sku="PST-002", sale=(qar(9), 5)),
    _p("cinnamon-roll", "Cardamom cinnamon roll", "لفائف القرفة والهيل", PASTRIES, 10, "loaf",
       "Warm, with cream cheese icing.", "دافئة مع كريمة الجبن.",
       rule="daily_limit", daily=30, pop=9, sku="PST-003", state="sold_out"),
    _p("choc-croissant", "Pain au chocolat", "كرواسون بالشوكولاتة", PASTRIES, 9, "loaf",
       "Two bars of dark chocolate.", "قطعتان من الشوكولاتة الداكنة.",
       rule="daily_limit", daily=30, pop=7, sku="PST-004"),
    _p("date-swirl", "Date and tahini swirl", "دوّامة التمر والطحينة", PASTRIES, 9, "loaf",
       "A spiral of dates and tahini.", "دوّامة من التمر والطحينة.",
       rule="daily_limit", daily=24, pop=4, sku="PST-005"),
    _p("zaatar-manousheh", "Za'atar manousheh", "مناقيش زعتر", PASTRIES, 8, "plate",
       "Thyme and olive oil on warm flatbread.", "زعتر وزيت زيتون على خبز ساخن.",
       rule="daily_limit", daily=40, pop=8, sku="PST-006", choices=(MANOUSHEH_EXTRAS,),
       tags=("Vegetarian · نباتي",)),
    _p("cheese-fatayer", "Cheese fatayer, 4 pieces", "فطاير جبن، 4 قطع", PASTRIES, 16, "plate",
       "Baked, with white cheese.", "مخبوزة بالجبنة البيضاء.",
       unit="pack", rule="daily_limit", daily=20, pop=6, sku="PST-007",
       groups=(("corporate", qar(14)),)),
    _p("spinach-fatayer", "Spinach fatayer, 4 pieces", "فطاير سبانخ، 4 قطع", PASTRIES, 16, "plate",
       "Spinach, onion and sumac.", "سبانخ وبصل وسماق.",
       unit="pack", rule="daily_limit", daily=20, pop=4, sku="PST-008",
       tags=("Vegetarian · نباتي",)),
    _p("chicken-sambousek", "Chicken sambousek, 6 pieces", "سمبوسة دجاج، 6 قطع", PASTRIES, 18,
       "plate", "Crisp pastry with spiced chicken.", "عجينة مقرمشة بالدجاج المتبّل.",
       unit="pack", rule="daily_limit", daily=16, pop=5, sku="PST-009",
       groups=(("corporate", qar(16)),)),
    # ── Cakes: ordered ahead for a date ───────────────────────────────────────────────────
    _p("saffron-milk-cake", "Saffron milk cake", "كيك الحليب بالزعفران", CAKES, 85, "cake",
       "Three milks, saffron and pistachio, chilled overnight.",
       "ثلاثة أنواع حليب وزعفران وفستق، مبرّدة طوال الليل.",
       rule="daily_limit", lead=NEXT_DAY, pop=7, sku="CKE-001",
       sizes=(Size("Small, 1 kg", "صغيرة، 1 كغ", 0, 4), Size("Large, 2 kg", "كبيرة، 2 كغ", qar(70), 3))),
    _p("kunafa-cheesecake", "Pistachio kunafa cheesecake", "تشيز كيك الكنافة بالفستق", CAKES, 135,
       "cake", "A cream cheese cake on a crisp kunafa base.", "تشيز كيك على قاعدة كنافة مقرمشة.",
       rule="daily_limit", lead=NEXT_DAY, pop=6, sku="CKE-002",
       sizes=(Size("8 inch", "8 إنش", 0, 4), Size("10 inch", "10 إنش", qar(60), 3))),
    _p("celebration-cake", "Chocolate celebration cake", "كيكة المناسبات بالشوكولاتة", CAKES, 160,
       "cake", "Dark chocolate sponge with a message in icing. Two days' notice.",
       "إسفنج الشوكولاتة الداكنة مع كتابة بالكريمة. تُطلب قبل يومين.",
       rule="daily_limit", lead=TWO_DAYS, pop=6, sku="CKE-003", choices=(MESSAGE,),
       sizes=(Size("1 kg", "1 كغ", 0, 3), Size("2 kg", "2 كغ", qar(120), 2))),
    _p("red-velvet", "Red velvet cake", "كيكة الريد فيلفت", CAKES, 150, "cake",
       "Cream cheese frosting, three layers.", "كريمة الجبن وثلاث طبقات.",
       rule="daily_limit", daily=3, lead=NEXT_DAY, pop=4, sku="CKE-004"),
    _p("lotus-cheesecake", "Lotus cheesecake slice", "قطعة تشيز كيك اللوتس", CAKES, 24, "cake",
       "Biscoff base, caramel and crumbs.", "قاعدة اللوتس مع الكراميل والفتات.",
       rule="daily_limit", daily=14, pop=7, sku="CKE-005"),
    _p("carrot-loaf", "Carrot and walnut loaf cake", "كيكة الجزر والجوز", CAKES, 38, "loaf",
       "Moist, with cream cheese glaze.", "طرية مع طبقة كريمة الجبن.",
       rule="count", stock=9, pop=5, sku="CKE-006"),
    _p("cupcakes", "Cupcakes, box of 6", "كب كيك، علبة 6", CAKES, 42, "box",
       "Vanilla and chocolate with buttercream.", "فانيلا وشوكولاتة مع كريمة الزبدة.",
       unit="box", rule="daily_limit", daily=8, lead=NEXT_DAY, pop=5, sku="CKE-007",
       groups=(("corporate", qar(38)),)),
    _p("custom-cake", "Custom designed cake (from)", "كيكة بتصميم خاص (ابتداءً من)", CAKES, 280,
       "cake", "Designed with you at a fitting. Three days' notice.",
       "تُصمَّم معك في جلسة تصميم. تُطلب قبل ثلاثة أيام.",
       rule="always", lead=THREE_DAYS, pop=2, sku="CKE-008", choices=(MESSAGE,)),
    # ── Arabic sweets ─────────────────────────────────────────────────────────────────────
    _p("maamoul", "Date maamoul, box of 12", "معمول بالتمر، علبة 12", SWEETS, 45, "box",
       "Semolina cookies filled with dates.", "كعك السميد المحشو بالتمر.",
       unit="box", rule="daily_limit", daily=12, lead=NEXT_DAY, pop=6, sku="SWT-001",
       groups=(("corporate", qar(40)),)),
    _p("luqaimat", "Luqaimat", "لقيمات", SWEETS, 18, "dates",
       "Fried dough balls with date syrup.", "كرات عجين مقلية مع دبس التمر.",
       unit="portion", rule="daily_limit", daily=14, pop=7, sku="SWT-002"),
    _p("basbousa", "Basbousa tray", "صينية بسبوسة", SWEETS, 55, "box",
       "Semolina cake in syrup, coconut and almond. Serves 12.",
       "كيكة السميد بالقطر وجوز الهند واللوز. تكفي 12 شخصاً.",
       unit="box", rule="daily_limit", daily=5, lead=NEXT_DAY, pop=4, sku="SWT-003"),
    _p("umm-ali", "Umm Ali, single bowl", "أم علي، وعاء فردي", SWEETS, 22, "bowl",
       "Warm bread pudding with nuts and cream.", "حلوى الخبز الدافئة مع المكسرات والقشطة.",
       unit="portion", rule="daily_limit", daily=18, pop=6, sku="SWT-004"),
    _p("halwa-box", "Khaleeji halwa gift box", "علبة حلوى خليجية للهدايا", SWEETS, 65, "box",
       "Saffron halwa in a gift box, 500 g.", "حلوى بالزعفران في علبة هدايا، 500 غ.",
       unit="box", rule="count", stock=12, pop=3, sku="SWT-005",
       groups=(("corporate", qar(58)),)),
    _p("qatayef", "Qatayef, tray of 20", "قطايف، صينية 20", SWEETS, 48, "box",
       "Stuffed pancakes for Ramadan. Back next Ramadan.", "قطايف محشوة لرمضان. تعود في رمضان القادم.",
       unit="box", state="hidden", sku="SWT-006", rule="always"),
    _p("eid-cookies", "Eid cookie box", "علبة كعك العيد", SWEETS, 60, "box",
       "Being photographed.", "قيد التصوير.", unit="box", state="draft", photo=False,
       rule="always", sku="SWT-007"),
    # ── Coffee and drinks ─────────────────────────────────────────────────────────────────
    _p("karak", "Karak", "كرك", DRINKS, 6, "cup", "Strong tea, evaporated milk and cardamom.",
       "شاي مركّز بالحليب المبخّر والهيل.", rule="always", pop=9, sku="DRK-001"),
    _p("spanish-latte", "Spanish latte", "سبانش لاتيه", DRINKS, 22, "cup",
       "Espresso with sweetened condensed milk.", "إسبريسو مع الحليب المكثّف المحلّى.",
       rule="always", pop=8, sku="DRK-002", choices=(MILK, SHOT)),
    _p("flat-white", "Flat white", "فلات وايت", DRINKS, 18, "cup", "Double shot, silky milk.",
       "جرعة مزدوجة مع حليب مخملي.", rule="always", pop=7, sku="DRK-003", choices=(MILK, SHOT)),
    _p("saffron-latte", "Saffron latte", "لاتيه الزعفران", DRINKS, 24, "cup",
       "Espresso, steamed milk and a thread of saffron.", "إسبريسو وحليب مبخّر وخيط زعفران.",
       rule="always", pop=6, sku="DRK-004", choices=(MILK,)),
    _p("iced-coffee", "Iced coffee", "قهوة مثلجة", DRINKS, 20, "cup", "Cold brew over ice.",
       "قهوة باردة مع الثلج.", rule="always", pop=6, sku="DRK-005",
       sizes=(Size("Regular", "وسط", 0), Size("Large", "كبير", qar(4)))),
    _p("orange-juice", "Fresh orange juice", "عصير برتقال طازج", DRINKS, 18, "bottle",
       "Squeezed to order.", "يُعصر عند الطلب.", rule="always", pop=5, sku="DRK-006"),
    _p("dallah", "Arabic coffee dallah (serves 6)", "دلّة قهوة عربية (تكفي 6)", DRINKS, 45, "jar",
       "Cardamom coffee with dates.", "قهوة بالهيل مع التمر.", rule="always", pop=3,
       sku="DRK-007", groups=(("corporate", qar(40)),)),
    _p("house-blend", "Zaman house blend beans, 250 g", "حبوب قهوة زمان، 250 غ", DRINKS, 48, "bag",
       "Medium roast, notes of dates and chocolate.", "تحميص متوسط بنكهة التمر والشوكولاتة.",
       rule="count", stock=22, pop=3, sku="DRK-008", state="low"),
    # ── Catering and trays: orders for groups, mostly on account ──────────────────────────
    _p("breakfast-tray", "Breakfast tray for 10", "صينية فطور لـ 10 أشخاص", CATERING, 220, "plate",
       "Croissants, labneh, olives, cheese, jam and fruit.", "كرواسون ولبنة وزيتون وجبن ومربى وفواكه.",
       rule="always", lead=NEXT_DAY, pop=6, sku="CAT-001", choices=(SETUP,),
       groups=(("corporate", qar(195)), ("wholesale", qar(185)))),
    _p("pastry-platter", "Mini pastry platter, 30 pieces", "صينية معجنات صغيرة، 30 قطعة",
       CATERING, 165, "plate", "Fatayer, sambousek, mini quiches.", "فطاير وسمبوسة وكيش صغير.",
       rule="always", lead=NEXT_DAY, pop=6, sku="CAT-002", choices=(SETUP,),
       groups=(("corporate", qar(145)), ("wholesale", qar(138)))),
    _p("sweets-platter", "Sweets platter for 20", "صينية حلويات لـ 20 شخصاً", CATERING, 260,
       "box", "Maamoul, basbousa, mini cakes and dates.", "معمول وبسبوسة وكيك صغير وتمر.",
       rule="always", lead=NEXT_DAY, pop=5, sku="CAT-003", choices=(SETUP,),
       groups=(("corporate", qar(230)), ("wholesale", qar(218)))),
    _p("lunch-box", "Corporate lunch box", "وجبة غداء للشركات", CATERING, 45, "box",
       "Sandwich, salad, juice and a sweet. Minimum 10.", "ساندويتش وسلطة وعصير وحلوى. الحد الأدنى 10.",
       unit="box", rule="always", lead=NEXT_DAY, min_order=10, pop=5, sku="CAT-004",
       groups=(("corporate", qar(38)), ("wholesale", qar(36)))),
    _p("coffee-station", "Coffee and karak station, 25 guests", "ركن قهوة وكرك لـ 25 ضيفاً",
       CATERING, 350, "jar", "Barista, karak urn and cups for two hours.",
       "باريستا وإبريق كرك وأكواب لمدة ساعتين.", rule="always", lead=TWO_DAYS, pop=3,
       sku="CAT-005", groups=(("corporate", qar(320)),)),
)

# ── customers ─────────────────────────────────────────────────────────────────────────────
# Offices, a school, a clinic, event companies: they order on account and pay when they pay.
# (name, language, credit limit in QAR, how they pay, group). The habit drives the ledger.
ACCOUNTS = (
    ("Marina Tower Offices", "en", 6_000, "prompt", "corporate"),
    ("شركة الدوحة للاستشارات", "ar", 8_000, "monthly", "corporate"),
    ("Bluebird Events", "en", 10_000, "slow", "wholesale"),
    ("مدرسة النخبة الدولية", "ar", 5_000, "aged", "corporate"),
    ("Pearl Dental Clinic", "en", 3_000, "current", "corporate"),
    ("Lusail Sports Club", "en", 12_000, "late", "wholesale"),
    ("مكتب الأفق للمحاماة", "ar", 4_000, "prompt", "corporate"),
    ("Gulf Horizon Hotel, Banquets", "en", 15_000, "monthly", "wholesale"),
    ("Al Wakra Catering Co.", "en", 4_000, "over", "wholesale"),
    ("دار الأمل للرعاية", "ar", 2_500, "current", "corporate"),
)
GROUPS = (("corporate", "Corporate", "الشركات"), ("wholesale", "Wholesale", "الجملة"))

CONSUMERS = (
    # regulars: a few orders a week
    Customer("Lina F.", "en", "regular"), Customer("هند ر.", "ar", "regular"),
    Customer("Sara M.", "en", "regular"), Customer("أمل ج.", "ar", "regular"),
    Customer("Priya N.", "en", "regular"), Customer("جواهر ك.", "ar", "regular"),
    Customer("Maya T.", "en", "regular"), Customer("نورة ح.", "ar", "regular"),
    Customer("Omar K.", "ar", "regular"), Customer("Rania H.", "ar", "regular"),
    # now and then
    Customer("دانة س.", "ar", "occasional"), Customer("Rachel B.", "en", "occasional"),
    Customer("مها ع.", "ar", "occasional"), Customer("Noor A.", "en", "occasional"),
    Customer("بشرى ل.", "ar", "occasional"), Customer("James O.", "en", "occasional"),
    Customer("خالد ف.", "ar", "occasional"), Customer("Grace L.", "en", "occasional"),
    # new this fortnight
    Customer("Elena G.", "en", "new"), Customer("لمى ح.", "ar", "new"),
    Customer("Tariq Z.", "en", "new"), Customer("ريم و.", "ar", "new"),
    # asked, did not order (yet)
    Customer("Hassan D.", "ar", "occasional"), Customer("Sophie T.", "en", "occasional"),
)

PHONE_BASE = 97455500000  # +974 5550 0xxx
