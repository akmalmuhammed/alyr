"""Starting setups per type of business, used by onboarding (decision D-031).

A new owner picks their type of business once. The preset decides which modules are
switched on, which way of working the rest of onboarding follows, and the filled-in
services and opening hours they start from, so they edit instead of filling an empty
form. Prices are samples and the screens say so.

Ways of working:
* `appointments`: services, hours, booking rules, then try it. Built end to end.
* `assisted`: orders, credit and requests. Their onboarding screens are not built yet,
  so after the basics ALYR sets the rest up with the owner (a setup request).

The Catalog (ALY-107, D-039): `catalog` says what a type's catalog starts with
(`presets_catalog.py`), or is None for a type that has none (travel and documents). It is
declared here and kept apart from `modules`, because the Catalog module is added by the
setting `Settings.catalog_for_new_shops` (on since the go-live sweep, ALY-113), not by the
type. Use `modules_for` to get the modules a new business is created with, and `offered` to
ask whether an owner may choose the type. Three types exist only for the Catalog
(`requires_catalog`): with that setting off they are not offered.
"""

from dataclasses import dataclass

from alyr.catalog import Text
from alyr.presets_catalog import SETUPS, CatalogSetup

# Weekday follows PostgreSQL: 0 is Sunday, 6 is Saturday.
SAT_TO_THU = (6, 0, 1, 2, 3, 4)
FRIDAY = (5,)


@dataclass(frozen=True)
class Service:
    name: str
    name_ar: str
    minutes: int
    price: int  # dirhams; 0 means the price is not shown


@dataclass(frozen=True)
class Person:
    """A person (or chair) a type starts with, so a shop with several does not begin with one
    lane. The names are placeholders the owner replaces on the People card of /start."""

    name: str
    name_ar: str
    kind: str = "person"  # person | place


@dataclass(frozen=True)
class Preset:
    key: str
    name: Text
    hint: Text
    icon: str
    way: str  # appointments | assisted
    modules: tuple[str, ...]
    services: tuple[Service, ...] = ()
    hours: tuple[tuple[int, str, str], ...] = ()
    people: tuple[Person, ...] = ()
    catalog: CatalogSetup | None = None
    requires_catalog: bool = False
    # Modules the type also gets when it has the Catalog, because its catalog needs them: a
    # wholesaler's customers order from the price list, so wholesale gets `orders` (and keeps
    # its credit accounts, so an order can go on account). Off, the type is as it always was.
    with_catalog: tuple[str, ...] = ()

    def modules_for(self, catalog_on: bool) -> tuple[str, ...]:
        """The modules a business of this type is created with. The Catalog (and what it
        needs) is added only when it is switched on for new shops and this type has one."""
        if not (catalog_on and self.catalog):
            return self.modules
        extra = tuple(m for m in self.with_catalog if m not in self.modules)
        return (*self.modules, *extra, "catalog")

    def offered(self, catalog_on: bool) -> bool:
        """May an owner choose this type now?"""
        return catalog_on or not self.requires_catalog


def _week(open_: str, close: str, friday: tuple[str, str] | None = None) -> tuple:
    rows = [(day, open_, close) for day in SAT_TO_THU]
    if friday:
        rows += [(day, *friday) for day in FRIDAY]
    return tuple(rows)


APPOINTMENTS = ("inbox", "bookings", "payments")
ORDERS = ("inbox", "orders", "payments")

PRESETS: tuple[Preset, ...] = (
    Preset(
        "salon", Text("Salon & beauty", "صالون وتجميل"),
        Text("Bookings, team, reminders", "حجوزات وفريق وتذكيرات"),
        "scissors", "appointments", APPOINTMENTS,
        # A beauty salon's usual list, generic and not any one salon's. Prices are examples in
        # dirhams (the screens say so, D-031); the owner sets their own.
        services=(
            Service("Haircut & blow-dry", "قص وتصفيف الشعر", 60, 12000),
            Service("Blow-dry", "تصفيف الشعر", 40, 7000),
            Service("Hair colour", "صبغ الشعر", 120, 30000),
            Service("Manicure", "مانيكير", 40, 6000),
            Service("Pedicure", "باديكير", 50, 8000),
            Service("Gel polish", "طلاء الأظافر بالجل", 45, 9000),
            Service("Facial", "جلسة عناية بالبشرة", 60, 15000),
            Service("Eyelash extensions", "تركيب الرموش", 120, 28000),
            Service("Eyebrow shaping", "تشكيل الحواجب", 20, 3000),
            Service("Makeup", "مكياج", 60, 25000),
            Service("Men's haircut", "قص شعر رجالي", 30, 5000),
        ),
        hours=_week("10:00", "22:00", ("14:00", "22:00")),
        # A salon has several people working at once. Three to start from, so a salon with a
        # team does not begin at a third of its capacity; /start asks the owner to name them.
        people=(
            Person("Team member 1", "عضو الفريق 1"),
            Person("Team member 2", "عضو الفريق 2"),
            Person("Team member 3", "عضو الفريق 3"),
        ),
        catalog=SETUPS["salon"],
    ),
    Preset(
        "spa", Text("Spa & wellness", "سبا وعناية"), Text("Bookings, packages", "حجوزات وباقات"),
        "leaf", "appointments", APPOINTMENTS,
        services=(
            Service("Swedish massage", "مساج سويدي", 60, 25000),
            Service("Deep tissue massage", "مساج الأنسجة العميقة", 60, 30000),
            Service("Facial", "تنظيف بشرة", 45, 20000),
            Service("Manicure", "مانيكير", 40, 8000),
            Service("Pedicure", "باديكير", 50, 10000),
        ),
        hours=_week("10:00", "22:00", ("14:00", "22:00")),
        catalog=SETUPS["spa"],
    ),
    Preset(
        "clinic", Text("Clinic", "عيادة"), Text("Appointments", "مواعيد"),
        "medical", "appointments", APPOINTMENTS,
        # Clinics rarely show prices in chat, so the samples have none.
        services=(
            Service("Consultation", "استشارة", 20, 0),
            Service("Follow-up visit", "زيارة متابعة", 15, 0),
            Service("Dental cleaning", "تنظيف الأسنان", 45, 0),
        ),
        hours=tuple(
            (d, o, c) for d in SAT_TO_THU for o, c in (("08:00", "13:00"), ("16:00", "21:00"))
        ),
        catalog=SETUPS["clinic"],
    ),
    Preset(
        "home", Text("Home services", "خدمات منزلية"), Text("Visits, quotes", "زيارات وعروض أسعار"),
        "wrench", "appointments", APPOINTMENTS,
        services=(
            Service("Electrician visit", "زيارة كهربائي", 60, 15000),
            Service("AC service", "صيانة مكيف", 90, 25000),
            Service("Plumbing visit", "زيارة سباك", 60, 15000),
            Service("Deep cleaning", "تنظيف شامل", 180, 40000),
        ),
        hours=_week("08:00", "18:00"),
        catalog=SETUPS["home"],
    ),
    Preset(
        "restaurant", Text("Restaurant & café", "مطعم ومقهى"),
        Text("Orders, delivery", "طلبات وتوصيل"),
        "cup", "assisted", ORDERS, catalog=SETUPS["restaurant"],
    ),
    # The three types below exist for the Catalog (ALY-107): until it is switched on for new
    # shops (`Settings.catalog_for_new_shops`) they are not offered.
    Preset(
        "bakery", Text("Bakery & home kitchen", "مخبز ومطبخ منزلي"),
        Text("Daily limits, pre-orders", "كميات يومية وطلبات مسبقة"),
        "cake", "assisted", ORDERS, catalog=SETUPS["bakery"], requires_catalog=True,
    ),
    Preset(
        "grocery", Text("Grocery & baqala", "بقالة وسوبرماركت"),
        Text("Counted stock, low-stock alerts", "مخزون محسوب وتنبيهات النقص"),
        "basket", "assisted", ORDERS, catalog=SETUPS["grocery"], requires_catalog=True,
    ),
    Preset(
        "shop", Text("Shop & retail", "متجر"), Text("Orders, payments", "طلبات ومدفوعات"),
        "bag", "assisted", ORDERS, catalog=SETUPS["shop"],
    ),
    Preset(
        "fashion", Text("Fashion & gifts", "أزياء وهدايا"),
        Text("Sizes, colours, link sharing", "مقاسات وألوان ومشاركة الروابط"),
        "shirt", "assisted", ORDERS, catalog=SETUPS["fashion"], requires_catalog=True,
    ),
    Preset(
        "wholesale", Text("Wholesale & trading", "جملة وتجارة"),
        Text("Credit, collections", "آجل وتحصيل"),
        "boxes", "assisted", ("inbox", "ledger", "payments"), catalog=SETUPS["wholesale"],
        with_catalog=("orders",),
    ),
    Preset(
        "travel", Text("Travel & documents", "سفر ومعاملات"),
        Text("Requests, tracking", "طلبات ومتابعة"),
        "plane", "assisted", ("inbox", "payments"),
    ),
)

PRESET_BY_KEY = {p.key: p for p in PRESETS}

# The Arabic of every sample name, by its English: what a starting service or person is called
# until the owner writes their own.
_SAMPLE_AR: dict[str, set[str]] = {}
for _preset in PRESETS:
    for _sample in (*_preset.services, *_preset.people):
        _SAMPLE_AR.setdefault(_sample.name, set()).add(_sample.name_ar)


def kept_arabic(old_name: str, old_name_ar: str, new_name: str) -> str | None:
    """What the Arabic name should become when the English name is changed and the owner did not
    write an Arabic one with it: nothing (`None`) to leave it, or "" to clear it. The Arabic of a
    sample (`قص شعر` beside "Haircut") describes the sample, so on a rename it would now say the
    wrong thing on the Arabic booking page; the page shows the English until an Arabic name is
    written. An Arabic name the owner wrote, or one for an English name that was not a sample,
    is left exactly as it is."""
    if not new_name.strip() or new_name.strip() == old_name or not old_name_ar:
        return None
    return "" if old_name_ar in _SAMPLE_AR.get(old_name, ()) else None

# The onboarding steps after the business exists, per way of working. Nothing is paid
# first (ALY-242, D-053): the owner sets up and tries their business, then sees the plan,
# and pays when going live. `orders` (ALY-164, D-063) is for a business that sells things:
# its items, how customers get them and pay, a test order, then the same plan and go-live.
STEPS = {
    "appointments": ("services", "hours", "try", "plan", "golive"),
    "orders": ("products", "handover", "try", "plan", "golive"),
    "assisted": ("assisted", "plan", "golive"),
}

# The types that sell things and take their orders on the order page. Wholesale (credit,
# price groups) and travel (requests) are not here: they stay with ALYR.
ORDER_TYPES = ("restaurant", "bakery", "grocery", "shop", "fashion")

# The ways of working whose onboarding screens are built, so a type that follows one can be
# switched to self-serve in the back office (D-032). `orders` joined with its screens and its
# test order (ALY-164, ALY-168). That does not move any type: every one is still set up with
# ALYR until the founder switches it in the back office.
BUILT_WAYS = ("appointments", "orders")


def self_serve_way(preset: Preset) -> str | None:
    """The way this type follows when its owner sets it up alone, or None if it has none.
    `Preset.way` stays what it always was (where an older business is read from); this says
    where the type goes if the back office switches it to self-serve."""
    if preset.way == "appointments":
        return "appointments"
    return "orders" if preset.key in ORDER_TYPES else None


def can_self_serve(preset: Preset) -> bool:
    """May the back office switch this type to self-serve now: it has a way, and that way's
    screens are built."""
    return self_serve_way(preset) in BUILT_WAYS

# Districts offered as quick choices; anything else can be typed.
AREAS = ("Al Sadd", "West Bay", "Bin Mahmoud", "Al Wakra", "Lusail", "The Pearl",
         "Al Rayyan", "Old Airport", "Al Khor")
