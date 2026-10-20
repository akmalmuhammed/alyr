"""Zaytoun Kitchen («مطبخ زيتون»): a fictional restaurant and café in Al Sadd. The menu is
switched on and off by staff, two dishes have a number of portions a day, breakfast can be
ordered only in the morning, and a shawarma has sizes and extras (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Choice, Customer, Product, Shop, qar

SIZE = Choice(
    "Size", "الحجم", True,
    (("Regular", "عادي", 0), ("Large", "كبير", qar(5))),
)
EXTRAS = Choice(
    "Extras", "إضافات", False,
    (("Extra cheese", "جبنة إضافية", qar(3)), ("Pickles", "مخلل", 0),
     ("Garlic sauce", "صلصة الثوم", 0), ("Hot sauce", "صلصة حارة", 0)),
    max_choices=3,
)
PIZZA_SIZE = Choice(
    "Size", "الحجم", True,
    (("Medium", "وسط", 0), ("Large", "كبير", qar(10))),
)
BURGER_EXTRAS = Choice(
    "Extras", "إضافات", False,
    (("Extra patty", "قطعة لحم إضافية", qar(8)), ("Cheese slice", "شريحة جبن", qar(3)),
     ("Fried egg", "بيض مقلي", qar(3))),
    max_choices=3,
)

PRODUCTS = (
    # ── Starters ──────────────────────────────────────────────────────────────────────
    Product("hummus", "Hummus", "حمص", "Starters", qar(12), "bowl",
            "Chickpeas, tahini, lemon and olive oil, with warm bread.",
            "حمص بالطحينة والليمون وزيت الزيتون، مع خبز ساخن.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=7),
    Product("mutabbal", "Mutabbal", "متبل", "Starters", qar(13), "bowl",
            "Smoked aubergine with tahini and pomegranate.",
            "باذنجان مشوي بالطحينة والرمان.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=5),
    Product("fattoush", "Fattoush", "فتوش", "Starters", qar(14), "plate",
            "Crisp salad with sumac and toasted bread.",
            "سلطة مقرمشة بالسماق والخبز المحمّص.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=6),
    Product("tabbouleh", "Tabbouleh", "تبولة", "Starters", qar(13), "plate",
            "Parsley, tomato, mint and fine bulgur.", "بقدونس وطماطم ونعناع وبرغل ناعم.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=4),
    Product("sambousek", "Cheese sambousek, 6 pieces", "سمبوسة جبن، 6 قطع", "Starters", qar(15),
            "plate", "Crisp pastry filled with white cheese.", "عجينة مقرمشة محشوة بالجبنة البيضاء.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=6),
    Product("lentil-soup", "Lentil soup", "شوربة عدس", "Starters", qar(9), "bowl",
            "Red lentils, cumin and a squeeze of lemon.", "عدس أحمر وكمون وعصرة ليمون.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=4),
    # ── Mains ─────────────────────────────────────────────────────────────────────────
    Product("chicken-shawarma", "Chicken shawarma", "شاورما دجاج", "Mains", qar(14), "wrap",
            "Marinated chicken, garlic sauce and pickles in thin bread.",
            "دجاج متبّل مع صلصة الثوم والمخلل في خبز رقيق.",
            choices=(SIZE, EXTRAS), tags=("Halal · حلال",), pop=10),
    Product("beef-shawarma", "Beef shawarma", "شاورما لحم", "Mains", qar(17), "wrap",
            "Sliced beef with tahini, tomato and onion.", "لحم مقطّع مع الطحينة والطماطم والبصل.",
            choices=(SIZE, EXTRAS), tags=("Halal · حلال",), pop=7),
    Product("falafel-plate", "Falafel plate", "طبق فلافل", "Mains", qar(16), "plate",
            "Eight falafel, salad, pickles and tahini.", "ثماني حبات فلافل مع سلطة ومخلل وطحينة.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=5),
    Product("mixed-grill", "Mixed grill for two", "مشاوي مشكلة لشخصين", "Mains", qar(68), "plate",
            "Kebab, shish tawook and lamb chops with rice and grilled vegetables.",
            "كباب وشيش طاووق وريش غنم مع أرز وخضار مشوية.",
            unit="portion", tags=("Halal · حلال",), pop=4),
    Product("chicken-machboos", "Chicken machboos", "مجبوس دجاج", "Mains", qar(34), "plate",
            "The Gulf's spiced rice with chicken, dried lime and a tomato sauce.",
            "الأرز الخليجي المتبّل مع الدجاج والليمون الأسود وصلصة الطماطم.",
            unit="portion", tags=("Halal · حلال",), pop=8),
    Product("lamb-machboos", "Lamb machboos", "مجبوس لحم", "Mains", qar(42), "plate",
            "Slow-cooked lamb on spiced rice. Twelve portions a day.",
            "لحم غنم مطهو ببطء على أرز متبّل. اثنتا عشرة حصة في اليوم.",
            unit="portion", rule="daily_limit", daily=12, tags=("Halal · حلال",), pop=7,
            state="sold_out"),
    Product("lamb-ouzi", "Lamb ouzi", "أوزي لحم", "Mains", qar(52), "plate",
            "Lamb baked with rice, nuts and raisins. Eight portions a day.",
            "لحم غنم مخبوز مع الأرز والمكسرات والزبيب. ثماني حصص في اليوم.",
            unit="portion", rule="daily_limit", daily=8, tags=("Halal · حلال",), pop=4,
            state="low"),
    Product("hammour", "Grilled hammour", "هامور مشوي", "Mains", qar(58), "plate",
            "Whole-fillet local hammour with lemon rice.", "فيليه هامور محلي مع أرز بالليمون.",
            unit="portion", tags=("Halal · حلال",), pop=3),
    Product("margherita", "Margherita pizza", "بيتزا مارغريتا", "Mains", qar(28), "plate",
            "Tomato, mozzarella and basil on a thin crust.", "طماطم وموزاريلا وريحان على عجينة رقيقة.",
            choices=(PIZZA_SIZE,), tags=("Vegetarian · نباتي",), pop=5),
    Product("beef-burger", "Beef burger", "برغر لحم", "Mains", qar(24), "plate",
            "A grilled patty, lettuce, tomato and our sauce, with fries.",
            "قطعة لحم مشوية مع الخس والطماطم وصلصتنا، مع بطاطس.",
            choices=(BURGER_EXTRAS,), tags=("Halal · حلال",), pop=6),
    Product("foul-eggs", "Foul and eggs", "فول وبيض", "Mains", qar(16), "bowl",
            "Slow-cooked fava beans with eggs, tomato and bread. Served until 11 am.",
            "فول مطهو ببطء مع البيض والطماطم والخبز. يقدَّم حتى الحادية عشرة صباحاً.",
            unit="portion", window=("06:30", "11:00"), tags=("Breakfast · إفطار",), pop=6),
    # ── Drinks ────────────────────────────────────────────────────────────────────────
    Product("karak", "Karak tea", "شاي كرك", "Drinks", qar(4), "cup",
            "Strong tea with cardamom and evaporated milk.", "شاي قوي بالهيل والحليب المبخّر.",
            pop=10),
    Product("arabic-coffee", "Arabic coffee, dallah", "قهوة عربية، دلّة", "Drinks", qar(22), "cup",
            "Cardamom coffee in a small pot, with dates.", "قهوة بالهيل في دلّة صغيرة مع التمر.",
            pop=4),
    Product("lemon-mint", "Lemon and mint", "ليمون بالنعناع", "Drinks", qar(12), "cup",
            "Fresh lemon, mint and ice.", "ليمون طازج ونعناع وثلج.", pop=7),
    Product("orange-juice", "Fresh orange juice", "عصير برتقال طازج", "Drinks", qar(13), "cup",
            "Squeezed when you order.", "يُعصر عند الطلب.", pop=5, state="sold_out"),
    Product("laban", "Laban", "لبن", "Drinks", qar(5), "bottle", "Cold salted yoghurt drink.",
            "مشروب لبن بارد مملّح.", pop=4),
    Product("water", "Water 500 ml", "ماء 500 مل", "Drinks", qar(2), "bottle", "", "", pop=6),
    # ── Desserts ──────────────────────────────────────────────────────────────────────
    Product("kunafa", "Kunafa nabulsi", "كنافة نابلسية", "Desserts", qar(18), "plate",
            "Warm cheese kunafa with syrup and pistachio.",
            "كنافة بالجبنة ساخنة مع القطر والفستق.",
            unit="portion", sale=(qar(15), 5), tags=("Vegetarian · نباتي",), pop=8),
    Product("umm-ali", "Umm Ali", "أم علي", "Desserts", qar(15), "bowl",
            "Baked pastry, milk, nuts and raisins.", "عجين مخبوز مع الحليب والمكسرات والزبيب.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=6),
    Product("date-pudding", "Sticky date pudding", "بودينغ التمر", "Desserts", qar(14), "cake",
            "Warm date cake with toffee sauce.", "كيك التمر الدافئ مع صلصة الكراميل.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=5),
    Product("muhallabia", "Muhallabia", "مهلبية", "Desserts", qar(10), "bowl",
            "Milk pudding with rose water and pistachio.", "مهلبية بماء الورد والفستق.",
            unit="portion", tags=("Vegetarian · نباتي",), pop=3),
    # ── not for sale yet ──────────────────────────────────────────────────────────────
    Product("shrimp-machboos", "Shrimp machboos", "مجبوس ربيان", "Mains", qar(48), "plate",
            "A new dish the kitchen is trying.", "طبق جديد يجرّبه المطبخ.",
            unit="portion", state="draft", photo=False),
    Product("iftar-box", "Iftar box for four", "صندوق إفطار لأربعة", "Mains", qar(95), "box",
            "Soup, sambousek, dates and a main, for four. Back for the next Ramadan.",
            "شوربة وسمبوسة وتمر وطبق رئيسي لأربعة أشخاص. يعود في رمضان القادم.",
            unit="box", state="hidden"),
)

CUSTOMERS = (
    Customer("منى ع.", "ar"), Customer("خالد ص.", "ar"), Customer("نورة ح.", "ar"),
    Customer("Priya N.", "en"), Customer("James O.", "en"), Customer("يوسف م.", "ar"),
    Customer("Sara M.", "en"), Customer("حمد ن.", "ar", "occasional"),
    Customer("Dina R.", "en", "occasional"), Customer("سلمى ك.", "ar", "occasional"),
    Customer("Omar T.", "en", "occasional"), Customer("ريم ف.", "ar", "occasional"),
    Customer("Tariq K.", "en", "occasional"), Customer("عبدالله ق.", "ar", "occasional"),
    Customer("Hana D.", "en", "new"), Customer("فهد ز.", "ar", "new"),
)

SHOP = Shop(
    key="restaurant", slug="demo-restaurant",
    tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d101"),
    name="Zaytoun Kitchen", name_ar="مطبخ زيتون", kind="restaurant", area="Al Sadd", hue=28,
    whatsapp="97455910101",
    owner=("owner@demo-restaurant.example", "Maryam", "مريم"),
    agent=("agent@demo-restaurant.example", "Bilal", "بلال"),
    products=PRODUCTS, customers=CUSTOMERS, orders_a_day=13, open_hours=(6, 23),
)
