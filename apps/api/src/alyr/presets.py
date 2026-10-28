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
class Preset:
    key: str
    name: Text
    hint: Text
    icon: str
    way: str  # appointments | assisted
    modules: tuple[str, ...]
    services: tuple[Service, ...] = ()
    hours: tuple[tuple[int, str, str], ...] = ()
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
        "salon", Text("Salon & barber", "صالون وحلاقة"),
        Text("Bookings, reminders", "حجوزات وتذكيرات"),
        "scissors", "appointments", APPOINTMENTS,
        services=(
            Service("Haircut", "قص شعر", 45, 6000),
            Service("Beard trim & shape", "تهذيب اللحية", 20, 3000),
            Service("Haircut + beard", "قص شعر ولحية", 60, 8000),
            Service("Kids' haircut", "قص شعر للأطفال", 30, 4000),
            Service("Hair colour", "صبغ الشعر", 90, 18000),
        ),
        hours=_week("10:00", "22:00", ("14:00", "22:00")),
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

# The onboarding steps after the business exists, per way of working. Nothing is paid
# first (ALY-242, D-053): the owner sets up and tries their business, then sees the plan,
# and pays when going live.
STEPS = {
    "appointments": ("services", "hours", "try", "plan", "golive"),
    "assisted": ("assisted", "plan", "golive"),
}

# Districts offered as quick choices; anything else can be typed.
AREAS = ("Al Sadd", "West Bay", "Bin Mahmoud", "Al Wakra", "Lusail", "The Pearl",
         "Al Rayyan", "Old Airport", "Al Khor")
