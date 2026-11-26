"""The check packs, as data (Discovery 2.0, research R5 sections 3 and 8).

Nothing in this file runs: it is a list of plain dictionaries and one mapping. **A new vertical is
a new dictionary here** (or one handed to `Registry.from_data`), with no change to the engine; a
new rule is still code (`rules.py`, `firstparty.py`) and a pack only names rules that exist.

A pack is
* `id`: its key, also the family's key for a family pack;
* `kind`: `core` (every business), `family` (one per kind of business) or `overlay` (added by a
  family or a trade, never chosen alone);
* `family`: the family it belongs to (the core and the overlays have none);
* `title_en`, `title_ar`: how it is named, in both languages (Arabic a careful draft until the
  native review, ALY-66);
* `trades`: for a family, the trades an owner picks from, each `{key, title_en, title_ar}` and
  optionally `overlays` (a clinic brings `health`);
* `rules`: the rule ids it adds; `@firstparty` stands for every first-party rule (`firstparty.py`)
  that is installed, so the core holds them as soon as they merge;
* `overlays`: overlays every business of this family gets;
* `skip`: rule ids that do not apply to a business with this pack (an online seller has no shop
  front to list on its website);
* `never_edit`: fields no proposal may change for a business with this pack. The health overlay
  keeps a clinic's or a pharmacy's service text, and any offer, out of every proposal (research R5
  3.2: a regulator's sign-off is needed before such text is published).

The order of `PACKS` is the order the picker shows them in.
"""

FIRST_PARTY = "@firstparty"

# Every rule a business is checked against, whatever it is: the twelve of Phase 1 and the
# first-party ones.
CORE_RULES = (
    "listing_missing",
    "listing_unclaimed",
    "hours_missing",
    "hours_conflict",
    "phone_conflict",
    "name_conflict",
    "category_missing",
    "photos_few",
    "website_location_missing",
    "whatsapp_link_missing",
    "review_unanswered",
    "rating_low",
    FIRST_PARTY,
)


def _trade(key: str, en: str, ar: str, *overlays: str) -> dict:
    trade = {"key": key, "title_en": en, "title_ar": ar}
    if overlays:
        trade["overlays"] = list(overlays)
    return trade


PACKS: tuple[dict, ...] = (
    {
        "id": "core",
        "kind": "core",
        "family": None,
        "title_en": "Checks for every business",
        "title_ar": "فحوص لكل منشأة",
        "trades": [],
        "rules": list(CORE_RULES),
        "overlays": [],
    },
    {
        "id": "food",
        "kind": "family",
        "family": "food",
        "title_en": "Food and drink",
        "title_ar": "الأطعمة والمشروبات",
        "trades": [
            _trade("restaurant", "Restaurant", "مطعم"),
            _trade("cafe", "Café", "مقهى"),
            _trade("bakery", "Bakery and home kitchen", "مخبز ومطبخ منزلي"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "appointments",
        "kind": "family",
        "family": "appointments",
        "title_en": "Appointments",
        "title_ar": "خدمات بالمواعيد",
        "trades": [
            _trade("salon", "Salon and beauty", "صالون وتجميل"),
            _trade("barber", "Barber", "صالون حلاقة"),
            _trade("spa", "Spa and wellness", "سبا وعناية"),
            _trade("gym", "Gym", "نادٍ رياضي"),
            _trade("car_care", "Car care", "العناية بالسيارات"),
            _trade("clinic", "Clinic", "عيادة", "health"),
            _trade("travel", "Travel and documents", "سفر ومعاملات"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "home_services",
        "kind": "family",
        "family": "home_services",
        "title_en": "Home and field services",
        "title_ar": "الخدمات المنزلية والميدانية",
        "trades": [
            _trade("home_services", "Home maintenance", "الصيانة المنزلية"),
            _trade("ac_repair", "AC repair", "إصلاح المكيفات"),
            _trade("cleaning", "Cleaning", "التنظيف"),
            _trade("contractor", "Contracting", "المقاولات"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "retail",
        "kind": "family",
        "family": "retail",
        "title_en": "Shops and products",
        "title_ar": "المتاجر والمنتجات",
        "trades": [
            _trade("shop", "Shop and retail", "متجر"),
            _trade("fashion", "Fashion and gifts", "أزياء وهدايا"),
            _trade("grocery", "Grocery and baqala", "بقالة وسوبرماركت"),
            _trade("electronics", "Electronics", "إلكترونيات"),
            _trade("pharmacy", "Pharmacy", "صيدلية", "health"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "stays_schools",
        "kind": "family",
        "family": "stays_schools",
        "title_en": "Stays and schools",
        "title_ar": "الإقامة والمدارس",
        "trades": [
            _trade("hotel", "Hotel", "فندق"),
            _trade("apartments", "Serviced apartments", "شقق فندقية"),
            _trade("school", "School", "مدرسة"),
            _trade("nursery", "Nursery", "حضانة أطفال"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "online_only",
        "kind": "family",
        "family": "online_only",
        "title_en": "Online and trade",
        "title_ar": "البيع عبر الإنترنت والجملة",
        "trades": [
            _trade("online_seller", "Online seller", "بائع عبر الإنترنت", "online_seller"),
            _trade("freelancer", "Freelancer", "عمل حر", "online_seller"),
            _trade("wholesale", "Wholesale and trading", "جملة وتجارة"),
        ],
        "rules": [],
        "overlays": [],
    },
    {
        "id": "health",
        "kind": "overlay",
        "family": None,
        "title_en": "Health",
        "title_ar": "الصحة",
        "trades": [],
        "rules": [],
        "overlays": [],
        "never_edit": ["services", "offers"],
    },
    {
        "id": "online_seller",
        "kind": "overlay",
        "family": None,
        "title_en": "No shop front",
        "title_ar": "بلا واجهة محل",
        "trades": [],
        "rules": [],
        "overlays": [],
        # An online seller has no address of its own to put on its website.
        "skip": ["website_location_missing"],
    },
)

# Every `business_type` the product has (the starting setups in `presets.py`, which the shop
# templates, the Catalog's kinds, the Agent and the demo shops all use) -> (family, trade). A
# business with no type, or one this list does not know, gets the core pack only, until its owner
# picks one. D-196: a salon starts as a salon.
BUSINESS_TYPES: dict[str, tuple[str, str]] = {
    "salon": ("appointments", "salon"),
    "spa": ("appointments", "spa"),
    "clinic": ("appointments", "clinic"),
    "home": ("home_services", "home_services"),
    "restaurant": ("food", "restaurant"),
    "bakery": ("food", "bakery"),
    "grocery": ("retail", "grocery"),
    "shop": ("retail", "shop"),
    "fashion": ("retail", "fashion"),
    "wholesale": ("online_only", "wholesale"),
    "travel": ("appointments", "travel"),
}
