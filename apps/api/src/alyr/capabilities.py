"""What the Catalog can do, as a registry (D-039 "As built (feature engine)", ALY-148).

The Catalog is one system for every kind of business. A business is a *configuration* of it:
which of these abilities are switched on, what the section is called, how the order page is
laid out and which starter categories and custom fields it begins with. Serving a new kind of
client is therefore a matter of configuring, not coding (`shop_templates.py` holds the
configurations; `modules/items/features.py` holds what each shop has chosen).

Owners never see the word "capability": they see **features**, in plain words, grouped by
what they do. In code a feature is one `Capability` in `CAPABILITIES` below.

Three kinds of entry:

* **Core** (`core=True`): always on, never toggled. Names, photos, price, the stock log,
  categories, SKU, import and export. Listed so the screens can say what every shop has.
* **Switchable** (`built=True`): the owner or the back office turns it on or off. Each says
  where it acts (`affects`), what it needs (`depends_on`) and what it starts as (`default`).
  A feature that is off hides its part of the screens and stops applying to *new* items. It
  never deletes or changes anything already made, and an item that already uses it keeps
  working.
* **Extension points** (`built=False`): a name in the registry for a feature another builder
  will add later (decimal quantities, cost and margin, discounts, delivery fees, bundles,
  suppliers, barcodes, batches and expiry, serial numbers). They are **hidden everywhere**: no
  screen lists them, no API returns them, nothing can switch them on, and no wording about
  them exists. To build one: write what it does, add its consumers (the form part, the order
  page, the file columns, the report, the chat), set `built=True` and give it text. Nothing
  else changes: the table of shop features needs no migration, because a shop with no row for
  a feature gets its template's value.

The values a type of business starts with are in `shop_templates.py`; this file only holds what
a feature *is*. Everything is pure data: no database here.
"""

from dataclasses import dataclass, field
from typing import Any

from alyr.catalog import Text

# Where a feature acts. The screens turn these into plain words ("the item form", "the order
# page"), so a reader can see what turning it on or off will touch.
PLACES = (
    "form",         # the item form in the workspace
    "list",         # the items list, its filters and its row switch
    "order_page",   # the customer's order page
    "import_export",  # the columns of the Excel and CSV files
    "reports",      # the weekly report and the home cards
    "chat",         # what customers and staff get in WhatsApp
    "alerts",       # messages to the managers
    "settings",     # a section of the Catalog settings
)

SOLD_OUT_MODES = ("grey", "hide")


@dataclass(frozen=True)
class Group:
    key: str
    name: Text
    hint: Text


GROUPS: tuple[Group, ...] = (
    Group("run_out", Text("How items run out", "كيف تنفد الأصناف"),
          Text("The ways an item can be available, sold out or limited.",
               "طرق إتاحة الصنف أو نفاده أو تحديد كميته.")),
    Group("selling", Text("Sizes, choices and prices", "المقاسات والخيارات والأسعار"),
          Text("What a customer picks, and what they pay.",
               "ما يختاره العميل وما يدفعه.")),
    Group("pricing", Text("Discounts, delivery and cost", "الخصومات والتوصيل والتكلفة"),
          Text("What a customer pays beyond the item's price, and what you earn.",
               "ما يدفعه العميل فوق سعر الصنف، وما تربحه أنت.")),
    Group("order_page", Text("Your order page", "صفحة الطلب"),
          Text("What your customers see and can do when they order.",
               "ما يراه عملاؤك وما يستطيعون فعله عند الطلب.")),
    Group("alerts", Text("Messages to you", "رسائل إليك"),
          Text("What ALYR tells you and your customers on WhatsApp.",
               "ما تخبرك به ALYR وما تخبر به عملاءك على واتساب.")),
    Group("sharing", Text("Sharing", "المشاركة"),
          Text("Links and codes that send people to your order page.",
               "روابط ورموز تقود الناس إلى صفحة الطلب.")),
    Group("details", Text("More about each item", "المزيد عن كل صنف"),
          Text("Extra things you can say about an item.",
               "أشياء إضافية يمكنك قولها عن الصنف.")),
)
GROUP_KEYS = tuple(g.key for g in GROUPS)


@dataclass(frozen=True)
class Capability:
    key: str
    name: Text
    hint: Text       # one plain sentence: what it is for
    changes: Text    # what appears on the screens when it is on
    group: str
    affects: tuple[str, ...]
    default: bool = True
    depends_on: tuple[str, ...] = ()
    # A feature with a value beside the switch ("sold out: greyed or left out"): the default
    # value and the values allowed. Empty for a plain switch.
    config: dict[str, Any] = field(default_factory=dict)
    choices: dict[str, tuple[str, ...]] = field(default_factory=dict)
    core: bool = False
    built: bool = True
    # Always on, with a value to choose (the sold-out look): shown as a choice, not a switch.
    always_on: bool = False

    @property
    def switchable(self) -> bool:
        return self.built and not self.core and not self.always_on


def _c(
    key: str, name: tuple[str, str], hint: tuple[str, str], changes: tuple[str, str], group: str,
    affects: tuple[str, ...], **more: Any,
) -> Capability:
    return Capability(key, Text(*name), Text(*hint), Text(*changes), group, affects, **more)


# ── core: always on ───────────────────────────────────────────────────────────────────

CORE: tuple[Capability, ...] = (
    _c("names", ("Names in two languages", "أسماء بلغتين"),
       ("Every item has an English and an Arabic name.", "لكل صنف اسم بالإنجليزية واسم بالعربية."),
       ("", ""), "details", ("form", "order_page"), core=True),
    _c("photos", ("Photos", "الصور"),
       ("Up to eight photos for each item, with a cover.", "حتى ثماني صور لكل صنف مع غلاف."),
       ("", ""), "details", ("form", "order_page"), core=True),
    _c("price", ("Price and sale price", "السعر وسعر العرض"),
       ("A price in riyals, with a sale price and its dates.", "سعر بالريال مع سعر عرض وتواريخه."),
       ("", ""), "selling", ("form", "order_page"), core=True),
    _c("stock_log", ("Stock log", "سجل المخزون"),
       ("Every change to stock, with who made it and why.", "كل تغيير في المخزون مع من أجراه ولماذا."),
       ("", ""), "run_out", ("form", "reports"), core=True),
    _c("categories", ("Categories", "الفئات"),
       ("Groups such as Drinks or Mains, in your order.", "مجموعات مثل المشروبات أو الأطباق الرئيسية بترتيبك."),
       ("", ""), "details", ("form", "order_page"), core=True),
    _c("sku", ("Item codes (SKU)", "رموز الأصناف (SKU)"),
       ("Your own code for an item or one of its sizes.", "رمزك الخاص للصنف أو لأحد مقاساته."),
       ("", ""), "details", ("form", "import_export"), core=True),
    _c("import_export", ("Import and export", "الاستيراد والتصدير"),
       ("Fill in or take out your items in Excel or CSV.", "املأ أصنافك أو أخرجها بصيغة Excel أو CSV."),
       ("", ""), "details", ("import_export",), core=True),
)

# ── switchable: built ─────────────────────────────────────────────────────────────────

_RUN_OUT = "run_out"

BUILT: tuple[Capability, ...] = (
    _c("rule_switch", ("On and off switch", "مفتاح التشغيل والإيقاف"),
       ("Turn an item off by hand when it runs out, and on again when it is back.",
        "أوقف الصنف يدوياً حين ينفد وشغّله حين يعود."),
       ("Adds “On or off” to how an item runs out, a switch on every row, and “sold out” and "
        "“back” in WhatsApp.",
        "يضيف «تشغيل أو إيقاف» إلى طريقة النفاد، ومفتاحاً على كل صف، وأمري «نفد» و«عاد» في واتساب."),
       _RUN_OUT, ("form", "list", "chat")),
    _c("rule_count", ("Counted stock", "مخزون محسوب"),
       ("ALYR counts what you have. Each sale takes one off, and the item is sold out at zero.",
        "تعدّ ALYR ما لديك. كل بيع ينقص العدد، وينفد الصنف عند الصفر."),
       ("Adds “Counted in stock” to how an item runs out, the Stock tab, stock numbers in the "
        "files, low-stock lines in the report and the stock command in WhatsApp.",
        "يضيف «محسوب في المخزون» إلى طريقة النفاد، وتبويب المخزون، وأرقام المخزون في الملفات، "
        "وأسطر المخزون القليل في التقرير، وأمر المخزون في واتساب."),
       _RUN_OUT, ("form", "list", "import_export", "reports", "chat")),
    _c("rule_daily_limit", ("A number each day", "عدد في اليوم"),
       ("Set how many you can make or sell each day. It starts again every morning.",
        "حدّد كم تستطيع أن تحضّر أو تبيع كل يوم. يبدأ من جديد كل صباح."),
       ("Adds “A number each day” to how an item runs out, and its daily numbers to the files "
        "and the report.",
        "يضيف «عدد في اليوم» إلى طريقة النفاد، وأرقامه اليومية إلى الملفات والتقرير."),
       _RUN_OUT, ("form", "list", "import_export", "reports")),
    _c("schedule", ("Times it can be ordered", "أوقات الطلب"),
       ("Let an item be ordered only at certain hours or days, like a breakfast menu or a "
        "holiday week.",
        "اجعل الصنف قابلاً للطلب في ساعات أو أيام معيّنة فقط، مثل قائمة الإفطار أو أسبوع العطلة."),
       ("Adds “Times it can be ordered” to the item form, and tells customers when an item "
        "comes back.",
        "يضيف «أوقات الطلب» إلى نموذج الصنف، ويخبر العملاء متى يعود الصنف."),
       _RUN_OUT, ("form", "order_page")),
    _c("pickup_date", ("Pickup or delivery day", "يوم الاستلام أو التوصيل"),
       ("Items that need notice, like a cake for tomorrow, are ordered for a day the customer "
        "picks.",
        "الأصناف التي تحتاج إلى مهلة، مثل كيكة لليوم التالي، تُطلب ليوم يختاره العميل."),
       ("Adds notice and a last time to order to “Times it can be ordered”, and lets the customer "
        "pick the day. Off: nobody is asked, and an order is for the earliest day you can do it.",
        "يضيف مهلة وآخر وقت للطلب إلى «أوقات الطلب»، ويتيح للعميل اختيار اليوم. عند الإيقاف لا "
        "يُسأل أحد، ويكون الطلب لأقرب يوم تستطيع تجهيزه."),
       "order_page", ("form", "order_page"), depends_on=("schedule",)),
    _c("variants", ("Sizes and colours", "المقاسات والألوان"),
       ("One item in several sizes or colours, each with its own stock and price difference.",
        "صنف واحد بعدة مقاسات أو ألوان، لكل منها مخزونه وفرق سعره."),
       ("Adds the sizes and colours part to the item form, a size picker on the order page, and "
        "the size columns of the files.",
        "يضيف جزء المقاسات والألوان إلى نموذج الصنف، واختيار المقاس في صفحة الطلب، وأعمدة المقاسات في الملفات."),
       "selling", ("form", "order_page", "import_export")),
    _c("options", ("Choices and extras", "الخيارات والإضافات"),
       ("Things a customer picks on a dish or product: a required choice, or priced extras.",
        "أشياء يختارها العميل على الطبق أو المنتج: خيار مطلوب أو إضافات بسعر."),
       ("Adds the choices part to the item form, and the choices on the item sheet of the order "
        "page.",
        "يضيف جزء الخيارات إلى نموذج الصنف، ويظهر الخيارات في ورقة الصنف بصفحة الطلب."),
       "selling", ("form", "order_page")),
    _c("price_groups", ("Price groups", "مجموعات الأسعار"),
       ("Give a kind of customer, such as wholesale, its own prices.",
        "امنح فئة من العملاء، مثل الجملة، أسعارها الخاصة."),
       ("Adds “Prices by group” to the item form, “Customer price groups” to the settings, and a "
        "group picker to each conversation.",
        "يضيف «الأسعار حسب المجموعة» إلى نموذج الصنف، و«مجموعات أسعار العملاء» إلى الإعدادات، "
        "واختيار المجموعة إلى كل محادثة."),
       "selling", ("form", "settings", "order_page")),
    _c("pack_rules", ("Pack sizes and smallest orders", "أحجام العبوات وأقل كمية للطلب"),
       ("Sell by the pack, and say the least a customer can order.",
        "بِع بالعبوة، وحدّد أقل كمية يمكن للعميل طلبها."),
       ("Adds pack size and smallest order to the item form, the order page’s steppers, and the "
        "pack columns of the files.",
        "يضيف حجم العبوة وأقل كمية للطلب إلى نموذج الصنف، وأزرار الكمية في صفحة الطلب، وأعمدة العبوة في الملفات."),
       "selling", ("form", "order_page", "import_export")),
    _c("quick_quantity", ("Quick quantity", "كمية سريعة"),
       ("Plus and minus buttons on every row, so a customer can add without opening the item.",
        "زرّا زائد وناقص على كل صف ليضيف العميل دون فتح الصنف."),
       ("Off: tapping a row opens the item, and the customer adds from there.",
        "عند الإيقاف: الضغط على الصف يفتح الصنف ويضيف العميل من هناك."),
       "order_page", ("order_page",)),
    _c("same_as_last", ("Same as last time", "مثل المرة السابقة"),
       ("A customer who has ordered before can order the same again in one tap.",
        "العميل الذي طلب من قبل يستطيع طلب الشيء نفسه بضغطة واحدة."),
       ("Shows “Order the same as last time” at the top of the order page.",
        "يعرض «اطلب مثل المرة السابقة» في أعلى صفحة الطلب."),
       "order_page", ("order_page",)),
    _c("show_sku", ("Show the item code", "إظهار رمز الصنف"),
       ("Show each item's code beside its name for customers: on the order page and on the "
        "item's card in WhatsApp. Useful for a price list. Customers can still order by a "
        "code they know.",
        "أظهر رمز كل صنف بجانب اسمه للعملاء: في صفحة الطلب وعلى بطاقة الصنف في واتساب. مفيد "
        "لقوائم الأسعار. يبقى بإمكان العميل الطلب برمز يعرفه."),
       ("Shows the code (and your own SKU) on the item sheet and as a column in the table, and "
        "a code line on the item's card in WhatsApp.",
        "يعرض الرمز (ورمز SKU الخاص بك) في ورقة الصنف وكعمود في الجدول، وسطر الرمز في بطاقة "
        "الصنف على واتساب."),
       "order_page", ("order_page", "chat")),
    _c("order_on_whatsapp", ("Order on WhatsApp", "اطلب عبر واتساب"),
       ("A customer who is not signed in to the page picks items and sends the order to your "
        "WhatsApp number as a message.",
        "العميل غير المسجّل في الصفحة يختار الأصناف ويرسل الطلب إلى رقم واتساب الخاص بك كرسالة."),
       ("Shows the “Order on WhatsApp” button and the list of what was picked, on the order "
        "page.",
        "يعرض زر «اطلب عبر واتساب» وقائمة ما اختاره العميل في صفحة الطلب."),
       "order_page", ("order_page",)),
    _c("sold_out_display", ("Sold-out items", "الأصناف النافدة"),
       ("Show a sold-out item greyed out, or leave it off the order page.",
        "أظهر الصنف النافد باهتاً أو اتركه خارج صفحة الطلب."),
       ("Greyed out: customers still see it. Left out: it disappears until it is back.",
        "باهت: يبقى ظاهراً للعملاء. مخفي: يختفي حتى يعود."),
       "order_page", ("order_page",), config={"mode": "grey"}, choices={"mode": SOLD_OUT_MODES},
       always_on=True),
    _c("low_stock_alerts", ("Low-stock messages", "رسائل المخزون القليل"),
       ("ALYR messages your managers when an item is nearly gone.",
        "تراسل ALYR مديريك حين يوشك الصنف على النفاد."),
       ("Sends a WhatsApp message to the managers you add in the settings, once a day for each "
        "item.",
        "ترسل رسالة واتساب إلى المديرين الذين تضيفهم في الإعدادات، مرة في اليوم لكل صنف."),
       "alerts", ("alerts",)),
    _c("sold_out_alerts", ("Sold-out messages", "رسائل النفاد"),
       ("ALYR messages your managers when an item sells out.",
        "تراسل ALYR مديريك حين ينفد صنف."),
       ("Sends a WhatsApp message to the managers you add in the settings, once a day for each "
        "item.",
        "ترسل رسالة واتساب إلى المديرين الذين تضيفهم في الإعدادات، مرة في اليوم لكل صنف."),
       "alerts", ("alerts",)),
    _c("back_in_stock", ("Tell me when it is back", "أخبرني حين يعود"),
       ("A customer who asks about a sold-out item on WhatsApp is told once when it is back.",
        "العميل الذي يسأل عن صنف نافد على واتساب يُخبَر مرة واحدة حين يعود."),
       ("Adds “Tell me when it is back” to the item card in the chat.",
        "يضيف «أخبرني حين يعود» إلى بطاقة الصنف في المحادثة."),
       "alerts", ("chat",)),
    _c("share_links", ("Share links", "روابط المشاركة"),
       ("A link for each item or category to send in a chat or share on Instagram.",
        "رابط لكل صنف أو فئة لترسله في محادثة أو تشاركه على إنستغرام."),
       ("Adds item and category links to “Share and QR codes”, and the Share action on each item.",
        "يضيف روابط الأصناف والفئات إلى «المشاركة ورموز QR»، وإجراء المشاركة على كل صنف."),
       "sharing", ("settings", "list")),
    _c("table_qr", ("Table and counter QR codes", "رموز QR للطاولات والمنضدة"),
       ("A printed code for your counter or each table that opens your order page.",
        "رمز مطبوع للمنضدة أو لكل طاولة يفتح صفحة الطلب."),
       ("Adds QR codes to “Share and QR codes”, and puts the table on the order.",
        "يضيف رموز QR إلى «المشاركة ورموز QR»، ويضع الطاولة على الطلب."),
       "sharing", ("settings", "order_page")),
    _c("tags", ("Tags and allergens", "الوسوم والمسببات"),
       ("Words like Halal, Spicy or Contains nuts, to put on an item.",
        "كلمات مثل حلال أو حار أو يحتوي مكسرات تضعها على الصنف."),
       ("Adds the tags part to the item form and the tags column to the files, and lets "
        "customers search by tag.",
        "يضيف جزء الوسوم إلى نموذج الصنف وعمود الوسوم إلى الملفات، ويتيح للعملاء البحث بالوسم."),
       "details", ("form", "order_page", "import_export")),
    _c("custom_fields", ("Your own fields", "حقولك الخاصة"),
       ("Add fields of your own to an item, such as Serves, Warranty months or Concentration.",
        "أضف حقولاً خاصة بك إلى الصنف، مثل عدد الأشخاص أو أشهر الضمان أو التركيز."),
       ("Adds your fields to the item form, to the files, to the search, and, if you choose, "
        "to the order page.",
        "يضيف حقولك إلى نموذج الصنف والملفات والبحث، وإلى صفحة الطلب إن اخترت ذلك."),
       "details", ("form", "list", "order_page", "import_export", "settings")),
    # The pricing pack (ALY-150). Off for every shop until the owner or ALYR switches it on.
    _c("discounts", ("Discounts and coupon codes", "الخصومات ورموز القسائم"),
       ("Give customers money off: a code they type, or a discount that applies by itself, like "
        "10% off orders over QAR 200.",
        "امنح العملاء خصماً: رمزاً يكتبونه أو خصماً تلقائياً مثل 10% على الطلبات فوق 200 ر.ق."),
       ("Adds Discounts to the Catalog, a coupon box on the order page and in the WhatsApp order, "
        "the discount line by line on each order, and a line in the weekly report.",
        "يضيف «الخصومات» إلى الكتالوج، وخانة رمز القسيمة في صفحة الطلب وفي الطلب عبر واتساب، "
        "والخصم سطراً بسطر في كل طلب، وسطراً في التقرير الأسبوعي."),
       "pricing", ("settings", "order_page", "chat", "reports"), default=False),
)

# ── extension points: named, not built, hidden everywhere ─────────────────────────────

_LATER = ("", "")


def _later(key: str) -> Capability:
    # No text on purpose: a feature that is not built has nothing to say to an owner.
    return Capability(key, Text(*_LATER), Text(*_LATER), Text(*_LATER), "details", (),
                      default=False, built=False)


EXTENSION_POINTS: tuple[Capability, ...] = tuple(_later(k) for k in (
    "decimal_quantity", "cost_margin", "delivery_fees", "bundles", "suppliers",
    "barcode", "batch_expiry", "serial_imei",
))

CAPABILITIES: tuple[Capability, ...] = CORE + BUILT + EXTENSION_POINTS
BY_KEY: dict[str, Capability] = {c.key: c for c in CAPABILITIES}
assert len(BY_KEY) == len(CAPABILITIES), "a feature key is used twice"

# What an owner can see and switch: built, not core. The order is the screen's order.
SWITCHABLE: tuple[Capability, ...] = tuple(c for c in BUILT if c.switchable)
CHOICES: tuple[Capability, ...] = tuple(c for c in BUILT if c.always_on)
SHOWN: tuple[Capability, ...] = SWITCHABLE + CHOICES
SHOWN_KEYS = frozenset(c.key for c in SHOWN)
# Every key a shop can have a row for.
STORED: tuple[str, ...] = tuple(c.key for c in SHOWN)

# The rule features, by the rule each one allows. "always" needs no feature: an item can always
# be always available.
RULE_FEATURE = {
    "switch": "rule_switch", "count": "rule_count", "daily_limit": "rule_daily_limit",
}
# Features that mean "this shop counts stock", for the Stock tab, low-stock cards and lines.
COUNTING = ("rule_count", "rule_daily_limit")
RUNS_OUT = ("rule_switch", "rule_count", "rule_daily_limit")


def _check() -> None:
    for c in CAPABILITIES:
        assert c.group in GROUP_KEYS, c.key
        assert set(c.affects) <= set(PLACES), (c.key, c.affects)
        for dep in c.depends_on:
            assert dep in BY_KEY and BY_KEY[dep].switchable, (c.key, dep)
        if c.built and not c.core:
            assert c.name.en and c.name.ar and c.hint.en and c.hint.ar, c.key
            assert c.changes.en and c.changes.ar, c.key
        if not c.built:
            assert not (c.name.en or c.hint.en or c.changes.en or c.name.ar), c.key
    # A feature's dependencies come before it, so the screen and the cascade can walk in order.
    earlier: set[str] = set()
    for c in SWITCHABLE:
        assert set(c.depends_on) <= earlier, (c.key, c.depends_on)
        earlier.add(c.key)

_check()
