"""What each type of business starts with in the Catalog (ALY-107, decision D-039).

`presets.py` says which modules a type switches on and what its bookings start with. This
file says what the Catalog starts with, for the types that have one: what the section is
called ("Menu", "Products", "Price list"), how a new item runs out, the low-stock number, how
the order page treats a sold-out item, which alerts are on, the order page's layout, the
categories to begin with, a few sample items, and the plain-words list of what the owner is
getting that onboarding shows.

Everything an owner or a customer can read is here, English and Arabic side by side and
grouped by type, so a reviewer can read the Arabic of one type in one place (the Arabic is
a draft until a native speaker has been through it, ALY-66).

None of this applies until `Settings.catalog_for_new_shops` is on (the go-live sweep,
ALY-113). A type with no setup here (travel and documents) has no catalog at all: no screen,
no navigation entry, no mention.

Sample items (`Sample`) are marked as samples in the database, are drafts that cannot be
sold, and carry prices that are examples (the screens say so, as D-031 does for services).
They have no photo: the screens draw a tile from `key`.
"""

from dataclasses import dataclass

from alyr.catalog import Text

RULES = ("always", "switch", "count", "daily_limit")
STYLES = ("menu", "grid", "list", "table")
# The alerts a shop can have on. Refund and draft messages are not among them: they are
# about money and about a person's photo, and are always on.
ALERTS = ("low_stock", "sold_out")


@dataclass(frozen=True)
class Layout:
    """How the customer's order page (ALY-112) lays this type out. Hints, not rules."""

    style: str  # menu: photos by category | grid: photo grid | list: compact | table
    pickup_date: bool = False  # ask which day the order is for
    quick_quantity: bool = False  # a +/- on every row
    same_as_last: bool = False  # "same as last order" is one tap away
    show_sku: bool = False  # the code beside the name


@dataclass(frozen=True)
class Choice:
    """A group of choices on a sample dish. Options are (name, Arabic name, extra dirhams)."""

    name: str
    name_ar: str
    required: bool
    options: tuple[tuple[str, str, int], ...]
    max_choices: int = 1


@dataclass(frozen=True)
class Sample:
    """An example item. `price` is in dirhams and is an example, never a real price."""

    key: str  # the tile is drawn from this; unique within the type
    name: str
    name_ar: str
    category: str  # the English name of one of the type's categories
    price: int
    unit: str = "piece"
    rule: str = ""  # empty: the type's rule
    daily_limit: int | None = None
    # (name, Arabic name, price difference in dirhams, daily limit for a daily-limit item)
    variants: tuple[tuple[str, str, int, int | None], ...] = ()
    choices: tuple[Choice, ...] = ()
    lead_days: int | None = None  # ordered for a date, this many days ahead
    cutoff: str | None = None  # "18:00": the last time to order for that date
    pack_size: int | None = None
    min_order: int = 1
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class CatalogSetup:
    section: Text  # what the section is called, on the navigation and the order page
    sub: Text  # the line under the section's title
    rule: str  # how a new item runs out by default
    unit: str  # what a new item is sold by
    low_stock_at: int
    sold_out: str  # grey | hide: a sold-out item on the order page
    alerts: tuple[str, ...]  # the alerts that start on
    layout: Layout
    # Which folded parts of the item form start open for a new item, so the type's own fields
    # are in front: options, schedule, variants, groups. (Price, unit, pack size, minimum order
    # and SKU are always on the form.)
    focus: tuple[str, ...]
    # What the weekly report should say about this type (ALY-109 reads this; nothing here does).
    report_lines: tuple[str, ...]
    categories: tuple[tuple[str, str], ...]  # (name, Arabic name), in order
    gets: tuple[Text, ...]  # the plain words of onboarding's review step
    samples: tuple[Sample, ...] = ()
    # A new item is ordered for a date: this many days ahead, before this time. Bakeries.
    lead: tuple[int, str] | None = None
    # The Catalog is there to use or leave alone (appointment businesses).
    optional: bool = False

    def __post_init__(self) -> None:
        assert self.rule in RULES and self.sold_out in ("grey", "hide")
        assert self.layout.style in STYLES and set(self.alerts) <= set(ALERTS)
        names = {name for name, _ in self.categories}
        keys = [s.key for s in self.samples]
        assert len(keys) == len(set(keys)), "a sample key is used twice"
        assert all(s.category in names for s in self.samples), "a sample has no category"
        assert all((s.rule or self.rule) in RULES for s in self.samples)


def _qar(amount: int) -> int:
    """Dirhams from riyals, so the samples read like prices."""
    return amount * 100


# ── restaurant and café ───────────────────────────────────────────────────────────────

RESTAURANT = CatalogSetup(
    section=Text("Menu", "القائمة"),
    sub=Text(
        "Your dishes: photos, prices and what is available today.",
        "أطباقك: الصور والأسعار وما هو متوفر اليوم.",
    ),
    rule="switch", unit="portion", low_stock_at=3, sold_out="grey", alerts=("sold_out",),
    layout=Layout("menu"),
    focus=("options", "schedule"),
    report_lines=("sold_out_now", "top_items", "never_ordered"),
    categories=(
        ("Starters", "المقبلات"), ("Mains", "الأطباق الرئيسية"),
        ("Drinks", "المشروبات"), ("Desserts", "الحلويات"),
    ),
    gets=(
        Text("A menu of your dishes, with photos, in English and Arabic.",
             "قائمة بأطباقك مع الصور، بالعربية والإنجليزية."),
        Text("Sizes and extras on a dish, each with its own price.",
             "أحجام وإضافات للطبق، ولكل منها سعره."),
        Text("Switch a dish off when it runs out, or give it a number of portions each day.",
             "أوقف الطبق حين ينفد، أو حدّد عدد حصصه كل يوم."),
        Text("A dish can be ordered only at certain hours, like a breakfast menu.",
             "يمكن ألا يُطلب الطبق إلا في ساعات معيّنة، مثل قائمة الإفطار."),
        Text("A dish that is off shows greyed out on your order page.",
             "الطبق الموقوف يظهر باهتاً في صفحة الطلب."),
        Text("ALYR messages your managers on WhatsApp when a dish with a daily number sells out.",
             "تراسل ALYR مديريك على واتساب حين ينفد طبق له عدد يومي."),
    ),
    samples=(
        Sample(
            "chicken-wrap", "Chicken shawarma wrap", "ساندويتش شاورما دجاج", "Mains", _qar(14),
            unit="portion",
            choices=(
                Choice("Size", "الحجم", True, (("Regular", "عادي", 0), ("Large", "كبير", _qar(4)))),
                Choice("Extras", "إضافات", False,
                       (("Extra garlic sauce", "ثوم إضافي", _qar(1)),
                        ("Pickles", "مخلل", 0)), max_choices=2),
            ),
            tags=("Halal",),
        ),
        Sample("mixed-grill", "Mixed grill plate", "طبق مشاوي مشكلة", "Mains", _qar(48),
               unit="portion", tags=("Halal",)),
        Sample("hummus", "Hummus", "حمص", "Starters", _qar(16), unit="portion",
               tags=("Vegetarian",)),
        Sample("fattoush", "Fattoush salad", "سلطة فتوش", "Starters", _qar(18), unit="portion",
               tags=("Vegetarian",)),
        Sample("karak", "Karak tea", "شاي كرك", "Drinks", _qar(4), unit="portion"),
        Sample("orange-juice", "Fresh orange juice", "عصير برتقال طازج", "Drinks", _qar(12),
               unit="portion"),
    ),
)

# ── bakery and home kitchen (new) ─────────────────────────────────────────────────────

BAKERY = CatalogSetup(
    section=Text("Menu", "القائمة"),
    sub=Text(
        "What you bake: photos, prices, how many each day and when to order by.",
        "ما تخبزه: الصور والأسعار والعدد اليومي وآخر موعد للطلب.",
    ),
    rule="daily_limit", unit="piece", low_stock_at=3, sold_out="grey",
    alerts=("low_stock", "sold_out"),
    lead=(1, "18:00"),
    layout=Layout("menu", pickup_date=True),
    focus=("schedule",),
    report_lines=("make_tomorrow", "sold_out_now", "top_items"),
    categories=(
        ("Cakes", "الكيك"), ("Pastries", "المعجنات"), ("Savouries", "المالحات"),
        ("Sweets", "الحلويات"), ("Bread", "الخبز"),
    ),
    gets=(
        Text("A menu of what you bake, with photos, in English and Arabic.",
             "قائمة بما تخبزه مع الصور، بالعربية والإنجليزية."),
        Text("A number you can make each day. An item is sold out for the day when it is used, "
             "and starts again the next morning.",
             "عدد تستطيع تحضيره كل يوم. ينفد الصنف لذلك اليوم عند اكتمال العدد، ويبدأ من جديد صباح اليوم التالي."),
        Text("Orders for tomorrow: a new item asks for one day's notice and an order before 6 pm, "
             "and the customer picks the pickup day.",
             "طلبات لليوم التالي: الصنف الجديد يحتاج إلى يوم مهلة وطلباً قبل السادسة مساءً، ويختار العميل يوم الاستلام."),
        Text("Made-to-order items, like a celebration cake, that never run out.",
             "أصناف حسب الطلب، مثل كيكة المناسبات، لا تنفد."),
        Text("ALYR messages your managers on WhatsApp when something is nearly gone or sold out.",
             "تراسل ALYR مديريك على واتساب حين يوشك صنف على النفاد أو ينفد."),
    ),
    samples=(
        Sample(
            "choc-cake", "Chocolate cake", "كيكة الشوكولاتة", "Cakes", _qar(85),
            variants=(("Small", "صغيرة", 0, 3), ("Large", "كبيرة", _qar(45), 2)),
            lead_days=1, cutoff="18:00",
        ),
        Sample("custom-cake", "Celebration cake, made to order", "كيكة مناسبات حسب الطلب",
               "Cakes", _qar(180), rule="always", lead_days=2, cutoff="18:00"),
        Sample("cheese-sambousa", "Cheese sambousa, box of 12", "سمبوسة جبن، علبة 12",
               "Savouries", _qar(36), unit="box", daily_limit=10),
        Sample("croissant", "Butter croissant", "كرواسون بالزبدة", "Pastries", _qar(6),
               daily_limit=40),
        Sample("maamoul", "Date maamoul, box", "معمول بالتمر، علبة", "Sweets", _qar(45),
               unit="box", daily_limit=12),
        Sample("arabic-bread", "Arabic bread, pack of 6", "خبز عربي، 6 أرغفة", "Bread", _qar(4),
               unit="pack", daily_limit=60),
    ),
)

# ── grocery and baqala (new) ──────────────────────────────────────────────────────────

GROCERY = CatalogSetup(
    section=Text("Products", "المنتجات"),
    sub=Text(
        "What you sell: prices, units and what is left on the shelf.",
        "ما تبيعه: الأسعار والوحدات والمتبقي على الرف.",
    ),
    rule="count", unit="piece", low_stock_at=10, sold_out="hide",
    alerts=("low_stock", "sold_out"),
    layout=Layout("list", quick_quantity=True),
    focus=(),
    report_lines=("reorder", "low_stock", "top_items"),
    categories=(
        ("Fruit & vegetables", "الفواكه والخضار"), ("Dairy & eggs", "الألبان والبيض"),
        ("Pantry", "المواد الغذائية"), ("Drinks", "المشروبات"), ("Household", "المنزلية"),
    ),
    gets=(
        Text("A list of what you sell, by kilo, piece or pack, in English and Arabic.",
             "قائمة بما تبيعه بالكيلو أو بالحبة أو بالعبوة، بالعربية والإنجليزية."),
        Text("ALYR counts what is on your shelf. Each sale takes one off, and an item is "
             "sold out at zero.",
             "تعدّ ALYR ما على رفوفك. كل بيع ينقص العدد، وينفد الصنف عند الصفر."),
        Text("A low-stock number of 10, so you hear before you run out. You can change it.",
             "حدّ مخزون منخفض قدره 10، لتعرف قبل أن ينفد. يمكنك تغييره."),
        Text("Items that are sold out are left off your order page, which is a compact list "
             "with a plus and a minus on each row.",
             "الأصناف المنتهية لا تظهر في صفحة الطلب، وهي قائمة مختصرة فيها زر زائد وناقص لكل صنف."),
        Text("ALYR messages your managers on WhatsApp when an item is low or sold out.",
             "تراسل ALYR مديريك على واتساب حين يقل صنف أو ينفد."),
    ),
    samples=(
        Sample("basmati", "Basmati rice, 5 kg bag", "أرز بسمتي، كيس 5 كجم", "Pantry", _qar(38),
               unit="pack"),
        Sample("tomatoes", "Fresh tomatoes", "طماطم طازجة", "Fruit & vegetables", _qar(6),
               unit="kg"),
        Sample("milk", "Fresh milk, 1 litre", "حليب طازج، لتر", "Dairy & eggs", _qar(7)),
        Sample("eggs", "Eggs, tray of 30", "بيض، طبق 30", "Dairy & eggs", _qar(17), unit="pack"),
        Sample("cooking-oil", "Cooking oil, 1.8 litres", "زيت طبخ، 1.8 لتر", "Pantry", _qar(22)),
        Sample("water-12", "Bottled water, pack of 12", "مياه معبأة، 12 عبوة", "Drinks", _qar(9),
               unit="pack"),
    ),
)

# ── fashion and gifts for social sellers (new) ────────────────────────────────────────

FASHION = CatalogSetup(
    section=Text("Products", "المنتجات"),
    sub=Text(
        "Your pieces: photos, sizes, colours and what is left of each.",
        "قطعك: الصور والمقاسات والألوان والمتبقي من كل منها.",
    ),
    rule="count", unit="piece", low_stock_at=2, sold_out="grey",
    alerts=("low_stock", "sold_out"),
    layout=Layout("grid"),
    focus=("variants",),
    report_lines=("low_stock", "back_in_stock", "top_items"),
    categories=(
        ("Abayas", "العبايات"), ("Clothing", "الملابس"), ("Bags", "الحقائب"),
        ("Accessories", "الإكسسوارات"), ("Gifts", "الهدايا"),
    ),
    gets=(
        Text("Photos first: take or choose pictures and ALYR makes a draft item for each one. "
             "You add the name and price.",
             "الصور أولاً: التقط صوراً أو اخترها وتصنع ALYR مسودة لكل صورة. وتضيف أنت الاسم والسعر."),
        Text("Sizes and colours, each with its own stock and its own photo.",
             "مقاسات وألوان، ولكل منها مخزونه وصورته."),
        Text("A sale price with an end date.", "سعر مخفّض بتاريخ انتهاء."),
        Text("A link for every item, to send in a chat or share on Instagram.",
             "رابط لكل صنف، لترسله في محادثة أو تشاركه على إنستغرام."),
        Text("Your order page is a photo grid with a size and colour picker. A sold-out piece "
             "stays visible, greyed out.",
             "صفحة الطلب شبكة صور مع اختيار المقاس واللون. القطعة المنتهية تبقى ظاهرة باهتة."),
        Text("ALYR messages your managers on WhatsApp when a size is down to 2, and tells customers who "
             "asked when it is back.",
             "تراسل ALYR مديريك على واتساب حين يبقى من أحد المقاسات 2 فقط، وتخبر العملاء الذين طلبوا ذلك عند عودته."),
    ),
    samples=(
        Sample(
            "abaya", "Cotton abaya", "عباية قطن", "Abayas", _qar(220),
            variants=(("Black M", "أسود M", 0, None), ("Black L", "أسود L", 0, None),
                      ("Navy M", "كحلي M", 0, None), ("Navy L", "كحلي L", 0, None)),
        ),
        Sample(
            "linen-shirt", "Linen shirt", "قميص كتان", "Clothing", _qar(95),
            variants=(("White M", "أبيض M", 0, None), ("White L", "أبيض L", 0, None),
                      ("Blue M", "أزرق M", 0, None), ("Blue L", "أزرق L", 0, None)),
        ),
        Sample("handbag", "Leather handbag", "حقيبة جلدية", "Bags", _qar(160),
               variants=(("Brown", "بني", 0, None), ("Black", "أسود", 0, None))),
        Sample("scarf", "Silk scarf", "وشاح حرير", "Accessories", _qar(60),
               variants=(("Rose", "وردي", 0, None), ("Green", "أخضر", 0, None))),
        Sample("candle-set", "Scented candle set", "طقم شموع معطرة", "Gifts", _qar(75)),
        Sample("gift-box", "Personalised gift box, pre-order", "صندوق هدية مخصص، طلب مسبق",
               "Gifts", _qar(120), rule="always", lead_days=3),
    ),
)

# ── shop and retail ───────────────────────────────────────────────────────────────────

SHOP = CatalogSetup(
    section=Text("Products", "المنتجات"),
    sub=Text(
        "What you sell: photos, prices and what is left.",
        "ما تبيعه: الصور والأسعار والمتبقي.",
    ),
    rule="count", unit="piece", low_stock_at=5, sold_out="grey", alerts=("low_stock", "sold_out"),
    layout=Layout("grid"),
    focus=("variants",),
    report_lines=("low_stock", "top_items", "never_ordered"),
    categories=(
        ("Electronics", "الإلكترونيات"), ("Home", "المنزل"), ("Clothing", "الملابس"),
        ("Stationery", "القرطاسية"),
    ),
    gets=(
        Text("A product list with photos, prices and a code (SKU) for each, in English and Arabic.",
             "قائمة منتجات بالصور والأسعار ورمز (SKU) لكل منتج، بالعربية والإنجليزية."),
        Text("Sizes and colours, each with its own stock.", "مقاسات وألوان، ولكل منها مخزونه."),
        Text("ALYR counts what you have. Each sale takes one off, and a product is sold out at zero.",
             "تعدّ ALYR ما لديك. كل بيع ينقص العدد، وينفد المنتج عند الصفر."),
        Text("Your order page is a photo grid. A sold-out product stays visible, greyed out.",
             "صفحة الطلب شبكة صور. المنتج المنتهي يبقى ظاهراً باهتاً."),
        Text("ALYR messages your managers on WhatsApp when a product is low (5 or fewer) or sold out.",
             "تراسل ALYR مديريك على واتساب حين يقل منتج (5 أو أقل) أو ينفد."),
    ),
    samples=(
        Sample("earbuds", "Wireless earbuds", "سماعات لاسلكية", "Electronics", _qar(120),
               variants=(("White", "أبيض", 0, None), ("Black", "أسود", 0, None))),
        Sample("charger", "Fast charger, 20 W", "شاحن سريع 20 واط", "Electronics", _qar(45)),
        Sample("bottle", "Steel water bottle, 750 ml", "زجاجة ماء ستانلس 750 مل", "Home", _qar(55)),
        Sample("tshirt", "Cotton T-shirt", "تي شيرت قطن", "Clothing", _qar(40),
               variants=(("S", "S", 0, None), ("M", "M", 0, None), ("L", "L", 0, None))),
        Sample("notebook", "A5 notebook", "دفتر A5", "Stationery", _qar(15)),
        Sample("backpack", "Everyday backpack", "حقيبة ظهر يومية", "Clothing", _qar(110)),
    ),
)

# ── wholesale and trading ─────────────────────────────────────────────────────────────

WHOLESALE = CatalogSetup(
    section=Text("Price list", "قائمة الأسعار"),
    sub=Text(
        "Your price list: codes, pack sizes, minimum orders and a price for each kind of customer.",
        "قائمة أسعارك: الرموز وأحجام العبوات والحد الأدنى للطلب وسعر لكل فئة من العملاء.",
    ),
    rule="count", unit="pack", low_stock_at=20, sold_out="grey", alerts=("low_stock", "sold_out"),
    layout=Layout("table", quick_quantity=True, same_as_last=True, show_sku=True),
    focus=("groups",),
    report_lines=("fast_movers", "dead_stock", "low_stock"),
    categories=(
        ("Rice & sugar", "الأرز والسكر"), ("Oils", "الزيوت"), ("Drinks", "المشروبات"),
        ("Household", "المنزلية"),
    ),
    gets=(
        Text("A price list, with a code (SKU), a pack size and a smallest order for each item.",
             "قائمة أسعار فيها رمز (SKU) وحجم العبوة وأقل كمية للطلب لكل صنف."),
        Text("A price for each kind of customer, such as retail and wholesale, set once. Each customer sees their own.",
             "سعر لكل فئة من العملاء، مثل التجزئة والجملة، تحدّده مرة واحدة. ويرى كل عميل سعره."),
        Text("ALYR counts what is in your store. An item at zero shows greyed out as out of stock.",
             "تعدّ ALYR ما في مخزنك. الصنف عند الصفر يظهر باهتاً على أنه غير متوفر."),
        Text("Your order page is a table with quick quantities and a one-tap \"same as last order\".",
             "صفحة الطلب جدول بكميات سريعة وزر واحد لـ«مثل الطلب الأخير»."),
        Text("A customer you have given a credit limit can put an order on their account.",
             "العميل الذي منحته حداً ائتمانياً يستطيع تسجيل طلبه على حسابه."),
        Text("ALYR messages your managers on WhatsApp when an item is low (20 or fewer) or sold out.",
             "تراسل ALYR مديريك على واتساب حين يقل صنف (20 أو أقل) أو ينفد."),
    ),
    samples=(
        Sample("rice-20", "Basmati rice, 20 kg sack", "أرز بسمتي، كيس 20 كجم", "Rice & sugar",
               _qar(95), unit="pack", min_order=5),
        Sample("sugar-50", "White sugar, 50 kg sack", "سكر أبيض، كيس 50 كجم", "Rice & sugar",
               _qar(160), unit="pack", min_order=2),
        Sample("oil-9", "Cooking oil 1.8 L, carton of 9", "زيت طبخ 1.8 لتر، كرتون 9", "Oils",
               _qar(175), unit="pack", pack_size=9, min_order=3),
        Sample("water-24", "Bottled water 500 ml, carton of 24", "مياه معبأة 500 مل، كرتون 24",
               "Drinks", _qar(14), unit="pack", pack_size=24, min_order=20),
        Sample("tissue-48", "Tissue boxes, carton of 48", "علب مناديل، كرتون 48", "Household",
               _qar(72), unit="pack", pack_size=48, min_order=5),
        Sample("dish-12", "Dishwashing liquid 750 ml, carton of 12",
               "سائل جلي 750 مل، كرتون 12", "Household", _qar(54), unit="pack", pack_size=12,
               min_order=6),
    ),
)

# ── salon, spa, clinic and home services: the Catalog is there if wanted ──────────────

_OPTIONAL_SUB = Text(
    "Products you sell beside your services: photos and prices. Optional.",
    "منتجات تبيعها إلى جانب خدماتك: الصور والأسعار. اختياري.",
)


def _optional(
    categories: tuple[tuple[str, str], ...], samples: tuple[Sample, ...], gets: tuple[Text, ...]
) -> CatalogSetup:
    return CatalogSetup(
        section=Text("Products", "المنتجات"), sub=_OPTIONAL_SUB, rule="switch", unit="piece",
        low_stock_at=3, sold_out="grey", alerts=(), layout=Layout("grid"), focus=(),
        report_lines=("bookings_only",), categories=categories, samples=samples, optional=True,
        gets=gets + (
            Text("Your bookings work exactly as before. This is extra, and you can leave it empty.",
                 "حجوزاتك تعمل كما كانت تماماً. هذا إضافي ويمكنك تركه فارغاً."),
        ),
    )


SALON = _optional(
    (("Hair care", "العناية بالشعر"), ("Beard care", "العناية باللحية")),
    (
        Sample("hair-oil", "Argan hair oil, 100 ml", "زيت الأرغان للشعر، 100 مل", "Hair care",
               _qar(65)),
        Sample("shampoo", "Nourishing shampoo, 250 ml", "شامبو مغذٍّ، 250 مل", "Hair care",
               _qar(48)),
        Sample("beard-balm", "Beard balm", "بلسم اللحية", "Beard care", _qar(40)),
    ),
    (
        Text("A place for the products you sell at the counter, with photos and prices.",
             "مكان للمنتجات التي تبيعها عند الاستقبال، بالصور والأسعار."),
    ),
)

SPA = _optional(
    (("Body care", "العناية بالجسم"), ("Aromatherapy", "العلاج بالروائح")),
    (
        Sample("massage-oil", "Massage oil, 250 ml", "زيت مساج، 250 مل", "Body care", _qar(70)),
        Sample("bath-salts", "Bath salts", "أملاح الاستحمام", "Body care", _qar(45)),
        Sample("spa-candle", "Aromatherapy candle", "شمعة عطرية", "Aromatherapy", _qar(55)),
    ),
    (
        Text("A place for the products you sell at reception, with photos and prices.",
             "مكان للمنتجات التي تبيعها عند الاستقبال، بالصور والأسعار."),
    ),
)

CLINIC = _optional(
    (("Dental care", "العناية بالأسنان"),),
    (
        Sample("toothbrush", "Soft toothbrush", "فرشاة أسنان ناعمة", "Dental care", _qar(12)),
        Sample("mouthwash", "Mouthwash, 500 ml", "غسول فم، 500 مل", "Dental care", _qar(28)),
    ),
    (
        Text("A place for care products you offer to patients, with photos and prices.",
             "مكان لمنتجات العناية التي تعرضها على المرضى، بالصور والأسعار."),
    ),
)

HOME = _optional(
    (("Filters", "الفلاتر"),),
    (
        Sample("ac-filter", "AC filter set", "طقم فلاتر مكيف", "Filters", _qar(60)),
        Sample("water-filter", "Water filter cartridge", "فلتر مياه", "Filters", _qar(85)),
    ),
    (
        Text("A place for the parts and products you sell, with photos and prices.",
             "مكان للقطع والمنتجات التي تبيعها، بالصور والأسعار."),
    ),
)

# Travel and documents are not here: they have no catalog at all.

SETUPS: dict[str, CatalogSetup] = {
    "restaurant": RESTAURANT, "bakery": BAKERY, "grocery": GROCERY, "fashion": FASHION,
    "shop": SHOP, "wholesale": WHOLESALE, "salon": SALON, "spa": SPA, "clinic": CLINIC,
    "home": HOME,
}

# What a shop gets when ALYR switches the Catalog on for a business whose type is not
# listed above (made in the back office, say): the plain Catalog, with no samples.
GENERIC = CatalogSetup(
    section=Text("Catalog", "الكتالوج"),
    sub=Text("What you sell: photos, prices and what is left.", "ما تبيعه: الصور والأسعار والمتبقي."),
    rule="switch", unit="piece", low_stock_at=5, sold_out="grey", alerts=("low_stock", "sold_out"),
    layout=Layout("grid"), focus=(), report_lines=(), categories=(), gets=(),
)


def setup_for(business_type: str | None) -> CatalogSetup:
    """The setup for a type of business, or the plain Catalog for one without its own."""
    return SETUPS.get(business_type or "", GENERIC)
