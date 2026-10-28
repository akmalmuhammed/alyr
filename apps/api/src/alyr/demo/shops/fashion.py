"""Layali Abaya & Gifts («ليالي للعبايات والهدايا»): a fictional abaya and gift seller on the
Pearl who sells through links shared in chats. Sizes and colours each have their own stock,
two colours have their own photo, one size is sold out, and the gift box is a pre-order
(ALY-110)."""

from uuid import UUID

from alyr.demo.model import Customer, Product, Shop, Size, qar


def sizes(colour: str, colour_ar: str, letters: tuple[str, ...], stock: tuple[int, ...],
          sku: str = "", **more) -> tuple[Size, ...]:
    """One colour in several sizes: "Black M", «أسود M»."""
    return tuple(
        Size(f"{colour} {s}", f"{colour_ar} {s}", 0, n, f"{sku}-{s}" if sku else "", **more)
        for s, n in zip(letters, stock, strict=True)
    )


PRODUCTS = (
    # ── Abayas ────────────────────────────────────────────────────────────────────────
    Product("butterfly-abaya", "Butterfly abaya", "عباية فراشة", "Abayas", qar(420), "robe",
            "A light crepe abaya with wide butterfly sleeves.",
            "عباية كريب خفيفة بأكمام واسعة على شكل فراشة.", pop=9,
            sizes=(
                *sizes("Black", "أسود", ("M", "L", "XL"), (5, 6, 3), "BFA-BLK"),
                Size("Beige M", "بيج M", 0, 4, "BFA-BEI-M", own_photo=True),
                Size("Beige L", "بيج L", 0, 3, "BFA-BEI-L", own_photo=True, end=0),
            )),
    Product("embroidered-abaya", "Embroidered open abaya", "عباية مفتوحة مطرزة", "Abayas", qar(480),
            "robe", "Open front, hand-finished embroidery on the cuffs.",
            "فتحة أمامية وتطريز مشغول يدوياً على الأكمام.", pop=6,
            sizes=(*sizes("Black", "أسود", ("S", "M", "L"), (3, 5, 4), "EMB-BLK"),
                   *sizes("Navy", "كحلي", ("M",), (3,), "EMB-NVY"))),
    Product("classic-abaya", "Classic closed abaya", "عباية كلاسيكية مغلقة", "Abayas", qar(360),
            "robe", "A plain black abaya for every day.", "عباية سوداء بسيطة للاستعمال اليومي.",
            pop=8, sizes=sizes("Black", "أسود", ("S", "M", "L", "XL"), (6, 8, 7, 4), "CLS-BLK")),
    Product("linen-kaftan", "Linen kaftan", "قفطان كتان", "Clothing", qar(290), "robe",
            "Cool linen for the summer, sand colour.", "كتان بارد للصيف بلون الرمل.", pop=4,
            sizes=sizes("Sand", "رملي", ("S", "M", "L"), (4, 5, 3), "KAF-SND")),
    # ── Clothing and scarves ──────────────────────────────────────────────────────────
    Product("prayer-set", "Cotton prayer set", "طقم صلاة قطني", "Clothing", qar(120), "shirt",
            "Two pieces, soft cotton, with a travel bag.", "قطعتان من القطن الناعم مع حقيبة سفر.",
            pop=5, sizes=(Size("Cream", "كريمي", 0, 8), Size("Rose", "وردي", 0, 6),
                          Size("Grey", "رمادي", 0, 7))),
    Product("modal-hijab", "Modal jersey hijab", "حجاب جيرسي مودال", "Clothing", qar(35), "shirt",
            "Stays in place, does not need a pin.", "يثبت في مكانه ولا يحتاج دبوساً.", pop=8,
            sizes=(Size("Black", "أسود", 0, 20), Size("Grey", "رمادي", 0, 14),
                   Size("Nude", "بيج", 0, 12), Size("Navy", "كحلي", 0, 10),
                   Size("Olive", "زيتي", 0, 9))),
    Product("chiffon-scarf", "Chiffon scarf", "وشاح شيفون", "Clothing", qar(45), "shirt",
            "Light chiffon with a rolled edge.", "شيفون خفيف بحافة مطوية.", pop=4,
            sizes=(Size("Ivory", "عاجي", 0, 10), Size("Dusty rose", "وردي مغبر", 0, 8),
                   Size("Sage", "أخضر مريمي", 0, 8), Size("Black", "أسود", 0, 12))),
    Product("pashmina", "Pashmina shawl", "شال باشمينا", "Clothing", qar(130), "shirt",
            "Warm and soft, for the winter evenings.", "دافئ وناعم لأمسيات الشتاء.", pop=6,
            state="sold_out", sizes=(Size("Camel", "جملي", 0, 4), Size("Charcoal", "فحمي", 0, 4))),
    # ── Bags ──────────────────────────────────────────────────────────────────────────
    Product("leather-tote", "Leather tote bag", "حقيبة جلدية كبيرة", "Bags", qar(260), "bag",
            "Room for a laptop and a day's things.", "تتسع لحاسوب وأغراض اليوم.", pop=5,
            sizes=(Size("Black", "أسود", 0, 6), Size("Tan", "بني فاتح", 0, 4))),
    Product("crossbody", "Mini crossbody bag", "حقيبة كروس صغيرة", "Bags", qar(175), "bag",
            "A small bag with a long strap.", "حقيبة صغيرة بحزام طويل.", pop=6,
            sizes=(Size("Black", "أسود", 0, 6, end=1), Size("Cream", "كريمي", 0, 5),
                   Size("Olive", "زيتي", 0, 4))),
    Product("beach-bag", "Canvas beach bag", "حقيبة شاطئ قماشية", "Bags", qar(85), "bag",
            "Washable canvas with an inside pocket.", "قماش قابل للغسل مع جيب داخلي.", stock=12,
            pop=3),
    # ── Accessories ───────────────────────────────────────────────────────────────────
    Product("bracelet-set", "Gold-tone bracelet set", "طقم أساور ذهبي اللون", "Accessories",
            qar(75), "tag", "Five thin bangles that stack.", "خمسة أساور رفيعة تُلبس معاً.",
            stock=15, pop=5),
    Product("pearl-clips", "Pearl hair clips, set of 3", "مشابك شعر لؤلؤ، 3 قطع", "Accessories",
            qar(40), "tag", "", "", stock=18, pop=3),
    Product("oud-oil", "Oud perfume oil, 12 ml", "دهن عود، 12 مل", "Accessories", qar(95),
            "bottle", "A warm, woody oil in a glass roller.", "دهن دافئ خشبي في زجاجة رولر.",
            stock=10, pop=5, sku="OUD-12"),
    Product("bakhoor", "Bakhoor box", "علبة بخور", "Accessories", qar(65), "box",
            "Scented wood chips for the incense burner.", "رقائق خشب معطّرة للمبخرة.", unit="box",
            stock=12, pop=4),
    # ── Gifts ─────────────────────────────────────────────────────────────────────────
    Product("eid-box", "Eid gift box, pre-order", "صندوق هدية العيد، طلب مسبق", "Gifts", qar(240),
            "box", "A scarf, oud oil, dates and a card. Wrapped for you, ready in 3 days.",
            "وشاح ودهن عود وتمر وبطاقة. نغلّفه لك ويكون جاهزاً بعد 3 أيام.", unit="box",
            rule="always", lead=(3, "18:00"), pop=3),
    Product("dates-coffee-set", "Dates and coffee gift set", "طقم هدية تمر وقهوة", "Gifts",
            qar(110), "box", "Khalas dates, cardamom coffee and a small dallah.",
            "تمر خلاص وقهوة بالهيل ودلة صغيرة.", unit="box", stock=14, pop=5),
    Product("name-necklace", "Name necklace, made to order", "عقد بالاسم حسب الطلب", "Gifts",
            qar(150), "tag", "Your name in Arabic or English. Ready in 4 days.",
            "اسمك بالعربية أو الإنجليزية. جاهز بعد 4 أيام.", rule="always", lead=(4, "18:00"),
            pop=2),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    Product("satin-abaya", "Satin evening abaya", "عباية سهرة ساتان", "Abayas", qar(520), "robe",
            "Photographed on Thursday, not priced yet.", "صُوّرت يوم الخميس ولم يُحدّد سعرها بعد.",
            state="draft", photo=False),
    Product("winter-shawl", "Wool winter shawl", "شال صوف شتوي", "Clothing", qar(150), "shirt",
            "Back in the cold months.", "يعود في الأشهر الباردة.", state="hidden", stock=6),
)

CUSTOMERS = (
    Customer("Noor A.", "en"), Customer("ريم ش.", "ar"), Customer("Aisha K.", "en"),
    Customer("لولوة ف.", "ar"), Customer("Mariam H.", "en"), Customer("شيخة م.", "ar"),
    Customer("Dalia R.", "en"), Customer("هلا ج.", "ar", "occasional"),
    Customer("Fatima S.", "en", "occasional"), Customer("غادة ب.", "ar", "occasional"),
    Customer("Zainab T.", "en", "occasional"), Customer("جميلة ق.", "ar", "occasional"),
    Customer("Yasmin O.", "en", "occasional"), Customer("أسماء ن.", "ar", "new"),
    Customer("Hessa L.", "en", "new"),
)

SHOP = Shop(
    key="fashion", slug="demo-fashion", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d104"),
    name="Layali Abaya & Gifts", name_ar="ليالي للعبايات والهدايا", kind="fashion",
    area="The Pearl", hue=320, whatsapp="97455910104",
    owner=("owner@demo-fashion.example", "Layla", "ليلى"),
    agent=("agent@demo-fashion.example", "Mona", "منى"),
    products=PRODUCTS, customers=CUSTOMERS, orders_a_day=6, lines=(1, 2), open_hours=(10, 23),
)
