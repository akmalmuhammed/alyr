"""Hanan's Oven («فرن حنان»): a fictional home kitchen and bakery in Al Waab. Cakes and
sweets are ordered a day ahead for a pickup date, pastries and bread have a number a day
that starts again each morning (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Choice, Customer, Product, Shop, Size, qar

MESSAGE = Choice(
    "Message on the cake", "الكتابة على الكيكة", True,
    (("Happy birthday", "كل عام وأنت بخير", 0), ("Congratulations", "مبروك", 0),
     ("Eid Mubarak", "عيد مبارك", 0), ("No message", "بدون كتابة", 0)),
)
NEXT_DAY = (1, "18:00")

PRODUCTS = (
    # ── Cakes: ordered the day before ─────────────────────────────────────────────────
    Product("saffron-milk-cake", "Saffron milk cake", "كيك الحليب بالزعفران", "Cakes", qar(85),
            "cake", "Three milks, saffron and pistachio, chilled overnight.",
            "ثلاثة أنواع حليب وزعفران وفستق، مبرّدة طوال الليل.",
            rule="daily_limit", lead=NEXT_DAY, pop=7,
            sizes=(Size("Small, 1 kg", "صغيرة، 1 كغ", 0, 4), Size("Large, 2 kg", "كبيرة، 2 كغ", qar(70), 3))),
    Product("kunafa-cheesecake", "Pistachio kunafa cheesecake", "تشيز كيك الكنافة بالفستق",
            "Cakes", qar(135), "cake", "A cream cheese cake on a crisp kunafa base.",
            "تشيز كيك على قاعدة كنافة مقرمشة.", rule="daily_limit", lead=NEXT_DAY, pop=6,
            sizes=(Size("8 inch", "8 إنش", 0, 4), Size("10 inch", "10 إنش", qar(60), 3))),
    Product("celebration-cake", "Chocolate celebration cake", "كيكة المناسبات بالشوكولاتة",
            "Cakes", qar(160), "cake", "Dark chocolate sponge with a message in icing. Two days' notice.",
            "إسفنج الشوكولاتة الداكنة مع كتابة بالكريمة. تُطلب قبل يومين.",
            rule="daily_limit", lead=(2, "18:00"), pop=5, choices=(MESSAGE,),
            sizes=(Size("1 kg", "1 كغ", 0, 3), Size("2 kg", "2 كغ", qar(120), 2))),
    Product("date-loaf", "Date and cardamom loaf", "كيكة التمر والهيل", "Cakes", qar(38), "loaf",
            "Moist loaf cake with Khalas dates and cardamom.", "كيكة طرية بتمر الخلاص والهيل.",
            rule="daily_limit", daily=10, lead=NEXT_DAY, pop=6),
    Product("cupcakes", "Cupcakes, box of 6", "كب كيك، علبة 6", "Cakes", qar(42), "box",
            "Vanilla and chocolate, with buttercream.", "فانيلا وشوكولاتة مع كريمة الزبدة.",
            unit="box", rule="daily_limit", daily=8, lead=NEXT_DAY, pop=5),
    # ── Pastries: baked each morning ──────────────────────────────────────────────────
    Product("cinnamon-roll", "Cinnamon roll", "لفائف القرفة", "Pastries", qar(9), "loaf",
            "Warm, with cream cheese icing.", "دافئة مع كريمة الجبن.", rule="daily_limit",
            daily=40, pop=9, state="sold_out"),
    Product("cardamom-bun", "Cardamom bun", "خبز الهيل", "Pastries", qar(8), "loaf",
            "A soft bun, cardamom and sugar.", "خبز طري بالهيل والسكر.", rule="daily_limit",
            daily=40, pop=8),
    Product("butter-croissant", "Butter croissant", "كرواسون بالزبدة", "Pastries", qar(7), "loaf",
            "Layered and crisp.", "طبقات هشّة ومقرمشة.", rule="daily_limit", daily=36, pop=7,
            state="low"),
    Product("chocolate-croissant", "Chocolate croissant", "كرواسون بالشوكولاتة", "Pastries",
            qar(9), "loaf", "Filled with dark chocolate.", "محشو بالشوكولاتة الداكنة.",
            rule="daily_limit", daily=30, pop=6),
    Product("date-swirl", "Date and tahini swirl", "دوّامة التمر والطحينة", "Pastries", qar(9),
            "loaf", "A spiral of dates and tahini.", "دوّامة من التمر والطحينة.",
            rule="daily_limit", daily=24, pop=4),
    # ── Savouries ─────────────────────────────────────────────────────────────────────
    Product("cheese-fatayer", "Cheese fatayer, 4 pieces", "فطاير جبن، 4 قطع", "Savouries", qar(14),
            "plate", "Baked, with white cheese.", "مخبوزة بالجبنة البيضاء.", unit="pack",
            rule="daily_limit", daily=20, pop=6),
    Product("spinach-fatayer", "Spinach fatayer, 4 pieces", "فطاير سبانخ، 4 قطع", "Savouries",
            qar(14), "plate", "Baked, with spinach, onion and sumac.",
            "مخبوزة بالسبانخ والبصل والسماق.", unit="pack", rule="daily_limit", daily=20, pop=4,
            tags=("Vegetarian · نباتي",)),
    Product("zaatar-manousheh", "Za'atar manousheh", "مناقيش زعتر", "Savouries", qar(6), "plate",
            "Thyme and olive oil on warm flatbread.", "زعتر وزيت زيتون على خبز ساخن.",
            rule="daily_limit", daily=40, pop=8, tags=("Vegetarian · نباتي",)),
    Product("chicken-puff", "Chicken puff", "فطيرة دجاج", "Savouries", qar(8), "plate",
            "Flaky pastry with spiced chicken.", "عجينة هشّة بالدجاج المتبّل.",
            rule="daily_limit", daily=24, pop=5),
    # ── Sweets ────────────────────────────────────────────────────────────────────────
    Product("maamoul", "Date maamoul, box of 12", "معمول بالتمر، علبة 12", "Sweets", qar(45), "box",
            "Semolina cookies filled with dates.", "كعك السميد المحشو بالتمر.", unit="box",
            rule="daily_limit", daily=12, lead=NEXT_DAY, pop=6),
    Product("luqaimat", "Luqaimat", "لقيمات", "Sweets", qar(18), "dates",
            "Fried dough balls with date syrup.", "كرات عجين مقلية مع دبس التمر.",
            unit="portion", rule="daily_limit", daily=10, pop=7),
    Product("basbousa", "Basbousa tray", "صينية بسبوسة", "Sweets", qar(55), "box",
            "Semolina cake in syrup, coconut and almond. Serves 12.",
            "كيكة السميد بالقطر وجوز الهند واللوز. تكفي 12 شخصاً.", unit="box",
            rule="daily_limit", daily=4, lead=NEXT_DAY, pop=4),
    Product("tahini-cookies", "Tahini and date cookies, box", "كوكيز الطحينة والتمر، علبة",
            "Sweets", qar(30), "box", "Crumbly cookies, not too sweet.", "كوكيز هشّة غير مفرطة الحلاوة.",
            unit="box", rule="daily_limit", daily=10, pop=4),
    # ── Bread ─────────────────────────────────────────────────────────────────────────
    Product("sourdough", "Sourdough loaf", "رغيف العجين المخمّر", "Bread", qar(16), "loaf",
            "Baked at dawn, a chewy crust.", "يُخبز مع الفجر بقشرة مقرمشة.", rule="daily_limit",
            daily=12, pop=6),
    Product("wholewheat-toast", "Wholewheat toast loaf", "توست القمح الكامل", "Bread", qar(12),
            "loaf", "Sliced, no added sugar.", "مقطّع بدون سكر مضاف.", rule="daily_limit",
            daily=14, pop=4),
    Product("arabic-bread", "Arabic bread, bag of 10", "خبز عربي، كيس 10", "Bread", qar(5), "bag",
            "Fresh every morning.", "طازج كل صباح.", unit="pack", rule="daily_limit", daily=40,
            pop=7),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    Product("eid-cookies", "Eid cookie box", "علبة كعك العيد", "Sweets", qar(60), "box",
            "Being photographed.", "قيد التصوير.", unit="box", state="draft", photo=False),
    Product("qatayef", "Qatayef, tray of 20", "قطايف، صينية 20", "Sweets", qar(48), "box",
            "Stuffed pancakes for Ramadan. Back next Ramadan.",
            "قطايف محشوة لرمضان. تعود في رمضان القادم.", unit="box", state="hidden"),
)

CUSTOMERS = (
    Customer("Lina F.", "en"), Customer("هند ر.", "ar"), Customer("Sara M.", "en"),
    Customer("أمل ج.", "ar"), Customer("Priya N.", "en"), Customer("جواهر ك.", "ar"),
    Customer("Maya T.", "en"), Customer("دانة س.", "ar", "occasional"),
    Customer("Rachel B.", "en", "occasional"), Customer("مها ع.", "ar", "occasional"),
    Customer("Noura A.", "en", "occasional"), Customer("بشرى ل.", "ar", "occasional"),
    Customer("Elena G.", "en", "new"), Customer("لمى ح.", "ar", "new"),
)

SHOP = Shop(
    key="bakery", slug="demo-bakery", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d102"),
    name="Hanan's Oven", name_ar="فرن حنان", kind="bakery", area="Al Waab", hue=36,
    whatsapp="97455910102",
    owner=("owner@demo-bakery.example", "Hanan", "حنان"),
    agent=("agent@demo-bakery.example", "Salim", "سالم"),
    products=PRODUCTS, customers=CUSTOMERS, orders_a_day=9, open_hours=(7, 20),
    day_starts="04:00",
)
