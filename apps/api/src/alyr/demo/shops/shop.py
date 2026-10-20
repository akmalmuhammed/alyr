"""Safwa Home & Gadgets («متجر صفوة للمنزل»): a fictional shop in Al Rayyan selling small
electronics, home things, clothes and stationery. Every item has a code (SKU), the sizes and
colours count their own stock, and two items are sold out or nearly (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Customer, Product, Shop, Size, qar

PRODUCTS = (
    # ── Electronics ───────────────────────────────────────────────────────────────────
    Product("usb-c-cable", "USB-C charging cable", "كابل شحن USB-C", "Electronics", qar(18),
            "device", "Braided, 3 A, for phones and tablets.", "مجدول 3 أمبير للهواتف واللوحيات.",
            pop=9, sizes=(Size("1 m", "1 م", 0, 30, "CAB-C1"), Size("2 m", "2 م", qar(7), 20, "CAB-C2"))),
    Product("wall-charger", "Fast wall charger, 30 W", "شاحن حائط سريع، 30 واط", "Electronics",
            qar(45), "device", "Charges a phone to half in about 30 minutes.",
            "يشحن الهاتف إلى النصف في نحو 30 دقيقة.", stock=25, sku="CHG-30", pop=7),
    Product("earbuds", "Wireless earbuds", "سماعات لاسلكية", "Electronics", qar(120), "device",
            "Bluetooth 5.3, 20 hours with the case.", "بلوتوث 5.3 و20 ساعة مع العلبة.", pop=6,
            sizes=(Size("White", "أبيض", 0, 12, "EAR-WHT"), Size("Black", "أسود", 0, 10, "EAR-BLK"))),
    Product("power-bank", "Power bank, 10,000 mAh", "بطارية متنقلة، 10000 مللي أمبير",
            "Electronics", qar(85), "device", "Two ports, a small light on the side.",
            "منفذان وضوء صغير على الجانب.", stock=15, sku="PWR-10K", pop=7, state="sold_out"),
    Product("speaker", "Bluetooth speaker", "مكبر صوت بلوتوث", "Electronics", qar(110), "device",
            "Splash-proof, 10 hours.", "مقاوم للرذاذ ويعمل 10 ساعات.", stock=8, sku="SPK-BT", pop=4),
    Product("led-bulbs", "LED bulbs, pack of 4", "لمبات ليد، عبوة 4", "Electronics", qar(28), "box",
            "Warm white, 9 W.", "أبيض دافئ 9 واط.", unit="pack", stock=40, sku="LED-9W4", pop=5),
    Product("phone-stand", "Phone stand", "حامل هاتف", "Electronics", qar(22), "device",
            "Folds flat.", "يُطوى بشكل مسطح.", stock=20, sku="STD-PH", pop=3),
    # ── Home ──────────────────────────────────────────────────────────────────────────
    Product("kettle", "Electric kettle, 1.7 litres", "غلاية كهربائية، 1.7 لتر", "Home", qar(95),
            "jar", "Switches off by itself when it boils.", "تُطفئ نفسها عند الغليان.", stock=10,
            sku="KET-17", pop=6, state="low"),
    Product("frying-pan", "Non-stick frying pan, 28 cm", "مقلاة غير لاصقة، 28 سم", "Home", qar(70),
            "bowl", "Works on gas and induction.", "تصلح للغاز والحث الكهربائي.", stock=14,
            sku="PAN-28", pop=4),
    Product("bath-towel", "Cotton bath towel", "منشفة حمام قطنية", "Home", qar(45), "shirt",
            "500 gsm, soft and quick to dry.", "وزن 500 غرام للمتر، ناعمة وسريعة الجفاف.", pop=5,
            sizes=(Size("White", "أبيض", 0, 16, "TWL-WHT"), Size("Grey", "رمادي", 0, 12, "TWL-GRY"),
                   Size("Navy", "كحلي", 0, 10, "TWL-NVY"))),
    Product("glass-containers", "Glass food containers, set of 5", "علب زجاجية لحفظ الطعام، 5 قطع",
            "Home", qar(65), "box", "With lids that seal.", "بأغطية محكمة الإغلاق.", unit="pack",
            stock=12, sku="GLS-5", pop=4),
    Product("floor-cushion", "Floor cushion", "وسادة أرضية", "Home", qar(75), "bag",
            "Firm, for the majlis.", "صلبة للمجلس.", stock=9, sku="CSH-FL", pop=3),
    Product("prayer-mat", "Prayer mat", "سجادة صلاة", "Home", qar(40), "shirt",
            "Padded and light.", "مبطّنة وخفيفة.", stock=18, sku="PRM-01", pop=4),
    Product("flask", "Insulated flask, 1 litre", "ترمس معزول، 1 لتر", "Home", qar(55), "bottle",
            "Keeps drinks hot for 12 hours.", "يحفظ المشروبات ساخنة 12 ساعة.", pop=5,
            sizes=(Size("Steel", "ستانلس", 0, 12, "FLK-STL"), Size("Black", "أسود", 0, 9, "FLK-BLK"))),
    # ── Clothing ──────────────────────────────────────────────────────────────────────
    Product("tshirt", "Cotton T-shirt", "تي شيرت قطني", "Clothing", qar(35), "shirt",
            "Plain white, a soft fit.", "أبيض سادة بقصّة مريحة.", pop=6,
            sizes=tuple(Size(s, s, 0, n, f"TEE-{s}") for s, n in
                        (("S", 10), ("M", 14), ("L", 14), ("XL", 8)))),
    Product("thobe", "Men's thobe, white", "ثوب رجالي أبيض", "Clothing", qar(140), "robe",
            "Light fabric for the summer.", "قماش خفيف للصيف.", pop=5,
            sizes=(Size("56", "56", 0, 5, "THB-56"), Size("58", "58", 0, 6, "THB-58"),
                   Size("60", "60", 0, 5, "THB-60"))),
    Product("socks", "Socks, pack of 5", "شرابات، عبوة 5", "Clothing", qar(25), "box",
            "Cotton, mixed colours.", "قطن بألوان مختلطة.", unit="pack", stock=30, sku="SOK-5",
            pop=4),
    # ── Stationery ────────────────────────────────────────────────────────────────────
    Product("notebook", "A5 notebook", "دفتر A5", "Stationery", qar(12), "tag",
            "Lined, 120 pages.", "مسطّر 120 صفحة.", pop=5,
            sizes=(Size("Blue", "أزرق", 0, 20, "NTB-BLU"), Size("Green", "أخضر", 0, 20, "NTB-GRN"))),
    Product("gel-pens", "Gel pens, pack of 10", "أقلام جل، عبوة 10", "Stationery", qar(15), "box",
            "Black ink, smooth line.", "حبر أسود وخط ناعم.", unit="pack", stock=35, sku="PEN-G10",
            pop=4),
    Product("desk-organiser", "Desk organiser", "منظّم مكتب", "Stationery", qar(38), "box",
            "Pen holder and two drawers.", "حامل أقلام وجارورين.", stock=11, sku="DSK-ORG", pop=2),
    Product("backpack", "Backpack, 20 litres", "حقيبة ظهر، 20 لتر", "Stationery", qar(85), "bag",
            "For school or the office.", "للمدرسة أو المكتب.", pop=4,
            sizes=(Size("Black", "أسود", 0, 9, "BAG-BLK"), Size("Navy", "كحلي", 0, 7, "BAG-NVY"))),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    Product("smart-watch", "Smart watch", "ساعة ذكية", "Electronics", qar(240), "device",
            "Photos taken, price to check with the supplier.", "الصور جاهزة والسعر قيد المراجعة.",
            state="draft", photo=False),
    Product("heater", "Room heater", "مدفأة غرفة", "Home", qar(130), "jar",
            "Back in the winter.", "تعود في الشتاء.", state="hidden", stock=5, sku="HTR-RM"),
)

CUSTOMERS = (
    Customer("Rashid M.", "en"), Customer("عائشة ي.", "ar"), Customer("Sunita P.", "en"),
    Customer("علي ك.", "ar"), Customer("Mohammed A.", "en"), Customer("هدى ز.", "ar"),
    Customer("David S.", "en", "occasional"), Customer("جابر ن.", "ar", "occasional"),
    Customer("Amira F.", "en", "occasional"), Customer("ماجد ه.", "ar", "occasional"),
    Customer("Kevin L.", "en", "occasional"), Customer("سارة د.", "ar", "occasional"),
    Customer("Nadia B.", "en", "new"), Customer("ناصر و.", "ar", "new"),
)

SHOP = Shop(
    key="shop", slug="demo-shop", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d105"),
    name="Safwa Home & Gadgets", name_ar="متجر صفوة للمنزل", kind="shop", area="Al Rayyan",
    hue=212, whatsapp="97455910105",
    owner=("owner@demo-shop.example", "Safwa", "صفوة"),
    agent=("agent@demo-shop.example", "Imran", "عمران"),
    products=PRODUCTS, customers=CUSTOMERS, orders_a_day=6, lines=(1, 3), open_hours=(10, 22),
)
