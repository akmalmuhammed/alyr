"""Lumi Salon & Spa («صالون لومي للتجميل والسبا»): a fictional salon and spa in West Bay.
The shop takes bookings (its services and hours are the salon starting setup's) and sells
care products at the reception, which is the Catalog's optional part for appointment
businesses. Spas, clinics and home-service businesses start the same way with their own
words (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Customer, Product, Shop, qar

PRODUCTS = (
    # ── Hair care ─────────────────────────────────────────────────────────────────────
    Product("argan-oil", "Argan hair oil, 100 ml", "زيت الأرغان للشعر، 100 مل", "Hair care",
            qar(65), "bottle", "Smooths and shines. A few drops on dry ends.",
            "ينعّم ويلمّع. بضع قطرات على الأطراف الجافة.", stock=14, sku="HR-ARG100", pop=8),
    Product("keratin-shampoo", "Keratin shampoo, 250 ml", "شامبو الكيراتين، 250 مل", "Hair care",
            qar(48), "bottle", "Gentle every day, sulphate free.", "لطيف للاستعمال اليومي بدون كبريتات.",
            stock=18, sku="HR-SHP250", pop=7),
    Product("keratin-conditioner", "Keratin conditioner, 250 ml", "بلسم الكيراتين، 250 مل",
            "Hair care", qar(48), "bottle", "", "", stock=16, sku="HR-CND250", pop=6),
    Product("leave-in-serum", "Leave-in serum, 50 ml", "سيروم بدون شطف، 50 مل", "Hair care",
            qar(72), "jar", "Protects from heat and the sun.", "يحمي من الحرارة والشمس.",
            stock=9, sku="HR-SER50", pop=5, state="low"),
    Product("hair-mask", "Repair hair mask, 200 ml", "ماسك إصلاح الشعر، 200 مل", "Hair care",
            qar(85), "jar", "Once a week, ten minutes.", "مرة في الأسبوع لمدة عشر دقائق.",
            stock=10, sku="HR-MSK200", pop=6),
    Product("curl-cream", "Curl cream, 150 ml", "كريم تحديد الجدائل، 150 مل", "Hair care",
            qar(58), "jar", "", "", stock=8, sku="HR-CRL150", pop=3),
    Product("dry-shampoo", "Dry shampoo, 200 ml", "شامبو جاف، 200 مل", "Hair care", qar(39),
            "bottle", "", "", stock=12, sku="HR-DRY200", pop=3, state="sold_out"),
    Product("paddle-brush", "Paddle brush", "فرشاة عريضة", "Hair care", qar(45), "tag",
            "Soft bristles that do not pull.", "شعيرات ناعمة لا تشدّ الشعر.", stock=10,
            sku="HR-BRS", pop=2),
    # ── Beard care ────────────────────────────────────────────────────────────────────
    Product("beard-oil", "Beard oil, 30 ml", "زيت اللحية، 30 مل", "Beard care", qar(45), "bottle",
            "Cedar and oud.", "خشب الأرز والعود.", stock=12, sku="BD-OIL30", pop=4),
    Product("beard-balm", "Beard balm", "بلسم اللحية", "Beard care", qar(40), "jar",
            "Holds the shape through the day.", "يحافظ على الشكل طوال اليوم.", stock=10,
            sku="BD-BLM", pop=3),
    Product("beard-comb", "Wooden beard comb", "مشط لحية خشبي", "Beard care", qar(18), "tag",
            "", "", stock=20, sku="BD-CMB", pop=2),
    # ── Body care ─────────────────────────────────────────────────────────────────────
    Product("rose-scrub", "Rose body scrub, 250 g", "مقشّر الجسم بالورد، 250 غ", "Body care",
            qar(62), "jar", "Sugar and rose petals.", "سكر وبتلات الورد.", stock=11,
            sku="BC-SCR250", pop=6),
    Product("shea-butter", "Shea body butter, 200 ml", "زبدة الشيا للجسم، 200 مل", "Body care",
            qar(55), "jar", "Rich, for dry skin.", "غنية للبشرة الجافة.", stock=13,
            sku="BC-BUT200", pop=5),
    Product("bath-salts", "Bath salts, 400 g", "أملاح الاستحمام، 400 غ", "Body care", qar(45),
            "jar", "Lavender and sea salt.", "لافندر وملح البحر.", stock=15, sku="BC-SLT400",
            pop=3),
    Product("lavender-candle", "Lavender candle", "شمعة اللافندر", "Body care", qar(55), "jar",
            "Burns for forty hours.", "تحترق أربعين ساعة.", stock=9, sku="BC-CND", pop=4),
    Product("oud-mist", "Oud mist spray, 100 ml", "بخاخ العود، 100 مل", "Body care", qar(68),
            "bottle", "A light oud for hair and fabric.", "عود خفيف للشعر والأقمشة.", stock=7,
            sku="BC-MST100", pop=5),
    # ── Gifts ─────────────────────────────────────────────────────────────────────────
    Product("gift-set", "Hair and body gift set", "طقم هدية للشعر والجسم", "Gifts", qar(180),
            "box", "Argan oil, shampoo, body scrub and a candle, in a box.",
            "زيت أرغان وشامبو ومقشّر جسم وشمعة في علبة.", unit="box", stock=6, sku="GFT-HB",
            pop=4),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    Product("nail-kit", "Gel nail kit", "طقم أظافر جل", "Body care", qar(95), "box",
            "Being photographed.", "قيد التصوير.", unit="box", state="draft", photo=False),
    Product("bridal-set", "Bridal care set", "طقم عناية العروس", "Gifts", qar(420), "box",
            "Made up for each bride. Back after the season.", "يُجهَّز لكل عروس. يعود بعد الموسم.",
            unit="box", state="hidden", stock=3, sku="GFT-BRD"),
)

CUSTOMERS = (
    Customer("Rania H.", "en"), Customer("دانة ع.", "ar"), Customer("Joanna P.", "en"),
    Customer("لطيفة س.", "ar"), Customer("Mei L.", "en"), Customer("عفراء م.", "ar"),
    Customer("Sofia R.", "en"), Customer("هيفاء ك.", "ar"), Customer("Amal D.", "en"),
    Customer("جنى ب.", "ar", "occasional"), Customer("Kiran S.", "en", "occasional"),
    Customer("ميثاء ن.", "ar", "occasional"), Customer("Leila F.", "en", "occasional"),
    Customer("ريماس ق.", "ar", "new"), Customer("Eva M.", "en", "new"),
)

SHOP = Shop(
    key="salon", slug="demo-salon", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d107"),
    name="Lumi Salon & Spa", name_ar="صالون لومي للتجميل والسبا", kind="salon", area="West Bay",
    hue=292, whatsapp="97455910107",
    owner=("owner@demo-salon.example", "Lumi", "لومي"),
    agent=("agent@demo-salon.example", "Dana", "دانة"),
    products=PRODUCTS, customers=CUSTOMERS,
    extra_categories=(("Body care", "العناية بالجسم"), ("Gifts", "الهدايا")),
    orders_a_day=0, bookings_a_day=7, open_hours=(10, 21),
)
