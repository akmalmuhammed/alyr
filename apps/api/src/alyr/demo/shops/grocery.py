"""Najma Baqala («بقالة نجمة»): a fictional neighbourhood grocery in Umm Salal. Everything is
counted on the shelf: by the kilo, the piece or the pack, with a low-stock number of 10 and a
sold-out item left off the order page (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Customer, Product, Shop, qar

PRODUCTS = (
    # ── Fruit and vegetables ──────────────────────────────────────────────────────────
    Product("tomatoes", "Tomatoes, 1 kg", "طماطم، 1 كغ", "Fruit & vegetables", qar(5), "bowl",
            "Local, firm and red.", "محلية صلبة وحمراء.", unit="kg", stock=40, pop=9),
    Product("cucumbers", "Cucumbers, 1 kg", "خيار، 1 كغ", "Fruit & vegetables", qar(4), "bowl",
            "Crisp and sweet.", "مقرمش وحلو.", unit="kg", stock=35, pop=7),
    Product("bananas", "Bananas, 1 kg", "موز، 1 كغ", "Fruit & vegetables", qar(6), "bowl",
            "Ripe this week.", "ناضج هذا الأسبوع.", unit="kg", stock=30, pop=7),
    Product("oranges", "Oranges, 1 kg", "برتقال، 1 كغ", "Fruit & vegetables", qar(7), "bowl",
            "Juicy, for eating or squeezing.", "عصيري للأكل أو العصر.", unit="kg", stock=28, pop=5),
    Product("lemons", "Lemons, 1 kg", "ليمون، 1 كغ", "Fruit & vegetables", qar(5), "bowl",
            "", "", unit="kg", stock=25, pop=5),
    Product("potatoes", "Potatoes, 1 kg", "بطاطس، 1 كغ", "Fruit & vegetables", qar(4), "bowl",
            "", "", unit="kg", stock=50, pop=6),
    Product("onions", "Onions, 1 kg", "بصل، 1 كغ", "Fruit & vegetables", qar(3), "bowl",
            "", "", unit="kg", stock=50, pop=6),
    Product("khalas-dates", "Khalas dates, 1 kg box", "تمر خلاص، علبة 1 كغ", "Fruit & vegetables",
            qar(28), "dates", "Soft, from this season's harvest.", "طري من حصاد هذا الموسم.",
            unit="box", stock=24, sku="DAT-KH1", pop=7),
    # ── Dairy and eggs ────────────────────────────────────────────────────────────────
    Product("fresh-milk", "Fresh milk, 1 litre", "حليب طازج، 1 لتر", "Dairy & eggs", qar(7),
            "bottle", "Full fat, delivered each morning.", "كامل الدسم يصل كل صباح.", stock=36,
            sku="MLK-1L", pop=10, state="low"),
    Product("laban-1l", "Laban, 1 litre", "لبن، 1 لتر", "Dairy & eggs", qar(6), "bottle",
            "", "", stock=30, pop=6),
    Product("eggs-30", "Eggs, tray of 30", "بيض، كرتونة 30 حبة", "Dairy & eggs", qar(17), "box",
            "White eggs, large.", "بيض أبيض كبير.", unit="pack", stock=20, sku="EGG-30",
            pop=8, state="sold_out"),
    Product("labneh", "Labneh, 500 g", "لبنة، 500 غ", "Dairy & eggs", qar(11), "jar",
            "Creamy and mild.", "كريمية وخفيفة.", stock=18, pop=4),
    Product("cream-cheese", "Cream cheese, 200 g", "جبن كريمي، 200 غ", "Dairy & eggs", qar(8),
            "jar", "", "", stock=24, pop=4),
    # ── Pantry ────────────────────────────────────────────────────────────────────────
    Product("basmati-5", "Basmati rice, 5 kg", "أرز بسمتي، 5 كغ", "Pantry", qar(38), "sack",
            "Long grain, aged.", "حبة طويلة معتّقة.", unit="pack", stock=22, sku="RIC-B5", pop=7),
    Product("sugar-2", "Sugar, 2 kg", "سكر، 2 كغ", "Pantry", qar(9), "sack", "", "",
            unit="pack", stock=30, sku="SUG-2", pop=6),
    Product("cooking-oil", "Cooking oil, 1.5 litres", "زيت طبخ، 1.5 لتر", "Pantry", qar(14),
            "bottle", "Sunflower oil.", "زيت دوار الشمس.", stock=26, sku="OIL-15", pop=6),
    Product("tea-bags", "Tea bags, 100", "شاي أكياس، 100 حبة", "Pantry", qar(15), "box",
            "Strong black tea.", "شاي أسود قوي.", unit="box", stock=28, sku="TEA-100", pop=7),
    Product("chickpeas", "Chickpeas, 500 g", "حمص حب، 500 غ", "Pantry", qar(6), "jar",
            "", "", stock=30, pop=3),
    Product("tomato-paste", "Tomato paste, 400 g", "معجون طماطم، 400 غ", "Pantry", qar(5), "jar",
            "", "", stock=40, pop=4),
    Product("flour", "Flour, 1 kg", "طحين، 1 كغ", "Pantry", qar(5), "sack", "", "", stock=30,
            pop=4),
    # ── Drinks ────────────────────────────────────────────────────────────────────────
    Product("water-6", "Bottled water 1.5 litres, pack of 6", "مياه معبأة 1.5 لتر، عبوة 6",
            "Drinks", qar(7), "bottle", "", "", unit="pack", stock=40, sku="WAT-15-6", pop=9),
    Product("orange-juice-1l", "Orange juice, 1 litre", "عصير برتقال، 1 لتر", "Drinks", qar(8),
            "bottle", "No added sugar.", "بدون سكر مضاف.", stock=24, pop=5),
    Product("karak-box", "Instant karak, box of 20", "كرك سريع التحضير، علبة 20", "Drinks",
            qar(14), "box", "Tea, milk and cardamom in a sachet.", "شاي وحليب وهيل في كيس.",
            unit="box", stock=24, pop=6),
    # ── Household ─────────────────────────────────────────────────────────────────────
    Product("dish-liquid", "Dishwashing liquid, 750 ml", "سائل جلي، 750 مل", "Household", qar(9),
            "bottle", "", "", stock=24, pop=4),
    Product("tissues-6", "Tissue boxes, pack of 6", "علب مناديل، عبوة 6", "Household", qar(18),
            "box", "", "", unit="pack", stock=20, pop=5),
    Product("laundry-3", "Laundry detergent, 3 kg", "مسحوق غسيل، 3 كغ", "Household", qar(29),
            "sack", "", "", unit="pack", stock=16, sku="LAU-3", pop=3),
    Product("bin-bags", "Bin bags, roll of 30", "أكياس نفايات، لفة 30", "Household", qar(6),
            "bag", "", "", stock=30, pop=3),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    Product("honey", "Mountain honey, 500 g", "عسل جبلي، 500 غ", "Pantry", qar(42), "jar",
            "Waiting for its photo and price check.", "بانتظار الصورة ومراجعة السعر.",
            state="draft", photo=False),
    Product("ramadan-hamper", "Ramadan hamper", "سلة رمضان", "Pantry", qar(120), "box",
            "Rice, oil, dates, sugar and tea. Back next Ramadan.",
            "أرز وزيت وتمر وسكر وشاي. تعود في رمضان القادم.", unit="box", state="hidden"),
)

CUSTOMERS = (
    Customer("أم سلطان", "ar"), Customer("Teresa F.", "en"), Customer("أبو ناصر", "ar"),
    Customer("Anita R.", "en"), Customer("أم خالد", "ar"), Customer("Joseph K.", "en"),
    Customer("نوال ص.", "ar"), Customer("Reem H.", "en"), Customer("أبو يوسف", "ar"),
    Customer("Maria L.", "en", "occasional"), Customer("هيا ق.", "ar", "occasional"),
    Customer("Sunil P.", "en", "occasional"), Customer("بدرية م.", "ar", "occasional"),
    Customer("Grace O.", "en", "occasional"), Customer("سعود ف.", "ar", "new"),
    Customer("Linda T.", "en", "new"),
)

SHOP = Shop(
    key="grocery", slug="demo-grocery", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d103"),
    name="Najma Baqala", name_ar="بقالة نجمة", kind="grocery", area="Umm Salal", hue=118,
    whatsapp="97455910103",
    owner=("owner@demo-grocery.example", "Najma", "نجمة"),
    agent=("agent@demo-grocery.example", "Ravi", "رافي"),
    products=PRODUCTS, customers=CUSTOMERS, orders_a_day=12, lines=(2, 5), open_hours=(8, 23),
)
