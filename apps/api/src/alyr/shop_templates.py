"""Templates: a kind of business as a configuration of the Catalog (D-039, ALY-148).

A template says, for one kind of business: which features start on, what the section is
called, how the order page is laid out, how a new item runs out, the starter categories and the
starter custom fields. It holds no code. Serving a new kind of client is writing one more
template in the back office (`routes/admin_templates.py`), not changing the program.

There is one mechanism. The eleven business types ALYR ships (`presets.py`) are **built-in
templates**, made here from `presets_catalog.py` so that a shop of a type behaves exactly as it
did before the registry existed (`tests/test_feature_engine_identical.py` proves it, type by
type). A template made in the back office is stored in the `business_templates` table and has the
same shape; it differs only in being editable. A built-in is never edited: the back office
duplicates it and the copy is the founder's to change.

The words a template brings (section name, sub-title, sample items, the review's sentences) live
in `presets_catalog.py` for the built-ins and in the table for the others; this file builds the
shape the rest of the program reads, `ShopTemplate`.
"""

from dataclasses import dataclass, replace
from typing import Any

from alyr import capabilities
from alyr.catalog import Text
from alyr.presets_catalog import GENERIC, SETUPS, CatalogSetup

GENERIC_KEY = "generic"

# The built-in types whose trade sells by weight or volume, which start with "Sold by weight or
# volume" on: dates and spices at the baqala, a cake by the kilo. A perfume or oud shop is "Shop &
# retail" here and starts with it off (the owner turns it on in Features, one switch); a
# template made in the back office can start with it on.
SOLD_BY_MEASURE = ("grocery", "bakery")

# What a starter custom field can be: a short text, a number, one of a list, yes or no, a date.
FIELD_KINDS = ("text", "number", "choice", "yes_no", "date")
APPLIES_TO = ("item", "variant")


@dataclass(frozen=True)
class FieldSeed:
    """A custom field a template starts a shop with (the owner may edit or archive it)."""

    key: str
    label: Text
    kind: str = "text"
    applies_to: str = "item"
    choices: tuple[Text, ...] = ()
    shown: bool = False       # shown to customers on the order page
    searchable: bool = False
    required: bool = False
    unit: str = ""            # beside a number: "ml", "months"

    def __post_init__(self) -> None:
        assert self.kind in FIELD_KINDS and self.applies_to in APPLIES_TO, self.key
        assert (self.kind == "choice") == bool(self.choices), self.key


@dataclass(frozen=True)
class ShopTemplate:
    key: str
    name: Text
    based_on: str  # the business type this stands on: it decides onboarding and pricing
    builtin: bool
    setup: CatalogSetup
    # Every feature a shop can have a row for: key -> (on, value). Complete, so a reader never
    # has to know the registry's defaults.
    features: dict[str, tuple[bool, dict[str, Any]]]
    fields: tuple[FieldSeed, ...] = ()
    note: Text = Text("", "")
    # The Catalog suits this kind of business without being its main work (a salon's products).
    optional: bool = False
    # A shop's owner may switch to it themselves (a template made in the back office says so).
    offered: bool = False

    def on(self, key: str) -> bool:
        return self.features[key][0]

    def config(self, key: str) -> dict[str, Any]:
        return self.features[key][1]


def full_features(overrides: dict[str, tuple[bool, dict] | bool] | None = None
                  ) -> dict[str, tuple[bool, dict[str, Any]]]:
    """Every feature at the registry's default, then `overrides` (key -> on, or (on, value))."""
    out: dict[str, tuple[bool, dict[str, Any]]] = {}
    for cap in capabilities.SHOWN:
        out[cap.key] = (True if cap.always_on else cap.default, dict(cap.config))
    for key, value in (overrides or {}).items():
        cap = capabilities.BY_KEY.get(key)
        if cap is None or key not in out:
            continue  # a key this program does not know (a template from a later version)
        on, config = value if isinstance(value, tuple) else (value, out[key][1])
        out[key] = (True if cap.always_on else bool(on), {**cap.config, **config})
    return out


def _from_setup(key: str, name: Text, based_on: str, setup: CatalogSetup) -> ShopTemplate:
    """A built-in template: the type's catalog setup, expressed as features. Everything the
    type did not say stays at the registry's default (on), which is what every shop had before
    features existed: all the parts of the form, and the order page's four extras."""
    return ShopTemplate(
        key=key, name=name, based_on=based_on, builtin=True, setup=setup,
        features=full_features({
            "low_stock_alerts": "low_stock" in setup.alerts,
            "sold_out_alerts": "sold_out" in setup.alerts,
            "sold_out_display": (True, {"mode": setup.sold_out}),
            # Sold by weight or volume (ALY-149): the trades that weigh or pour. Every other type
            # starts with it off, so a shop of any other type is exactly what it was.
            "decimal_quantity": key in SOLD_BY_MEASURE,
        }),
        fields=STARTER_FIELDS.get(key, ()),
        optional=setup.optional,
    )


def _t(en: str, ar: str) -> Text:
    return Text(en, ar)


_ALLERGENS = (
    _t("Nuts", "مكسرات"), _t("Gluten", "غلوتين"), _t("Dairy", "ألبان"), _t("Eggs", "بيض"),
    _t("Sesame", "سمسم"), _t("Fish", "سمك"),
)
_BRAND = FieldSeed("brand", _t("Brand", "العلامة"), shown=True, searchable=True)
_SIZE_ML = FieldSeed("volume_ml", _t("Volume", "السعة"), "number", unit="ml", shown=True)
_SHELF = FieldSeed("shelf_life_days", _t("Shelf life", "مدة الصلاحية"), "number", unit="days")

# What each built-in type's shop starts with beside its features: a few fields an owner of that
# kind of business usually wants (ALY-148). They are the owner's from the first day: edit, switch
# who sees them, or archive. None is required, so nothing about adding an item changes.
STARTER_FIELDS: dict[str, tuple[FieldSeed, ...]] = {
    "restaurant": (
        FieldSeed("allergens", _t("Allergens", "مسببات الحساسية"), "choice", choices=_ALLERGENS,
                  shown=True, searchable=True),
        FieldSeed("spice_level", _t("Spice level", "مستوى البهارات"), "choice", shown=True,
                  choices=(_t("Mild", "خفيف"), _t("Medium", "متوسط"), _t("Hot", "حار"))),
        FieldSeed("serves", _t("Serves", "يكفي"), "number", unit="people", shown=True),
    ),
    "bakery": (
        FieldSeed("allergens", _t("Allergens", "مسببات الحساسية"), "choice", choices=_ALLERGENS,
                  shown=True, searchable=True),
        FieldSeed("serves", _t("Serves", "يكفي"), "number", unit="people", shown=True),
    ),
    "grocery": (
        FieldSeed("origin", _t("Country of origin", "بلد المنشأ"), shown=True, searchable=True),
        _SHELF,
    ),
    "fashion": (
        FieldSeed("material", _t("Material", "الخامة"), shown=True, searchable=True),
        FieldSeed("care", _t("Care", "العناية"), shown=True),
        FieldSeed("fit", _t("Fit", "القصّة"), "choice", shown=True,
                  choices=(_t("Slim", "ضيقة"), _t("Regular", "عادية"), _t("Loose", "واسعة"))),
    ),
    "shop": (
        _BRAND,
        FieldSeed("warranty_months", _t("Warranty", "الضمان"), "number", unit="months",
                  shown=True),
    ),
    "wholesale": (
        _BRAND,
        FieldSeed("origin", _t("Country of origin", "بلد المنشأ"), shown=True),
        _SHELF,
    ),
    "salon": (_BRAND, _SIZE_ML),
    "spa": (FieldSeed("scent", _t("Scent", "العطر"), shown=True), _SIZE_ML),
    "clinic": (_BRAND,),
    "home": (_BRAND, FieldSeed("warranty_months", _t("Warranty", "الضمان"), "number",
                               unit="months", shown=True)),
}


_NAMES = {
    "restaurant": Text("Restaurant & café", "مطعم ومقهى"),
    "bakery": Text("Bakery & home kitchen", "مخبز ومطبخ منزلي"),
    "grocery": Text("Grocery & baqala", "بقالة وسوبرماركت"),
    "fashion": Text("Fashion & gifts", "أزياء وهدايا"),
    "shop": Text("Shop & retail", "متجر"),
    "wholesale": Text("Wholesale & trading", "جملة وتجارة"),
    "salon": Text("Salon & barber", "صالون وحلاقة"),
    "spa": Text("Spa & wellness", "سبا وعناية"),
    "clinic": Text("Clinic", "عيادة"),
    "home": Text("Home services", "خدمات منزلية"),
}

BUILTIN: dict[str, ShopTemplate] = {
    **{key: _from_setup(key, _NAMES[key], key, setup) for key, setup in SETUPS.items()},
    GENERIC_KEY: _from_setup(
        GENERIC_KEY, Text("Any other business", "نشاط آخر"), "", GENERIC
    ),
}
BUILTIN_KEYS = tuple(BUILTIN)


def builtin_for(business_type: str | None) -> ShopTemplate:
    """The built-in template for a business type; the plain Catalog for one without its own
    (travel, a business made in the back office with no type)."""
    return BUILTIN.get((business_type or "").lower(), BUILTIN[GENERIC_KEY])


def with_fields(template: ShopTemplate, fields: tuple[FieldSeed, ...]) -> ShopTemplate:
    return replace(template, fields=fields)


__all__ = [
    "APPLIES_TO", "BUILTIN", "BUILTIN_KEYS", "FIELD_KINDS", "GENERIC_KEY", "FieldSeed",
    "ShopTemplate", "builtin_for", "full_features", "with_fields",
]
