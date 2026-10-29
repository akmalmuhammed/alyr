"""What ALYR sells, and what each piece adds to a shop's workspace (decision D-027).

Two layers, on purpose:

* **Modules** are what the code switches on per shop (`tenant_modules`). Each module
  declares, in one place, everything the workspace shell needs to know about it: its
  screens, who may use them, what must be connected first, the setup steps, and the
  cards it adds to the home dashboard.
* **Products** are what a shop buys. A product is a named bundle of modules. Pricing
  and packaging can change by editing this file, without touching the modules.

The line-up (17 Oct 2026, `docs/agent-dashboard/00-founder-decisions.md`): ALYR Chat,
ALYR Bookings, ALYR Agent and ALYR Accounts. A product appears in the workspace only when it
is built (D-039): ALYR Payroll is added here, with its module, on the day it works. Two modules are
shared: the team inbox and payment links belong to both Chat and Bookings, because a
business whose number runs on ALYR answers its customers nowhere else, and a booking can
be paid by link as an order can. ALYR Agent has no module of its own: it is the home
dashboard and the Sunday report, and every business has it.

To add a product later: write its modules, declare them here, and add the product. The
shell, the setup checklist, the home dashboard and the back office pick it up.
"""

from dataclasses import dataclass, field

ALL_ROLES = ("owner", "admin", "agent")
MANAGERS = ("owner", "admin")
_TODAY = (
    "(now() at time zone (select timezone from tenants where id = "
    "nullif(current_setting('app.tenant_id', true), '')::uuid))::date"
)


@dataclass(frozen=True)
class Text:
    en: str
    ar: str

    def get(self, locale: str) -> str:
        return self.ar if locale == "ar" else self.en


@dataclass(frozen=True)
class Screen:
    """A section in the workspace navigation."""

    key: str
    label: Text
    icon: str
    roles: tuple[str, ...] = ALL_ROLES


@dataclass(frozen=True)
class Step:
    """One thing a shop must do before a module is useful. `done` is a SQL expression
    run in the shop's own scope; `connection` names a connection that must exist."""

    key: str
    label: Text
    done: str = ""
    connection: str = ""
    # Where in the workspace the shop does it themselves; empty when only ALYR can.
    screen: str = ""


@dataclass(frozen=True)
class Card:
    """A number on the home dashboard. `value` is a SQL expression returning one number,
    run in the shop's own scope. A number that one expression cannot give (the Catalog's
    stock states depend on the shop's clock, its schedules and its rules) names its own count
    in `count` instead, and the module's code works it out (`workspace.home`, ALYR Agent).
    `href` is the screen that lists what was counted: tapping the card opens it."""

    key: str
    label: Text
    value: str = ""
    kind: str = "count"  # count | qar
    count: str = ""
    href: str = ""


@dataclass(frozen=True)
class Module:
    key: str
    name: Text
    screens: tuple[Screen, ...] = ()
    steps: tuple[Step, ...] = ()
    cards: tuple[Card, ...] = ()


@dataclass(frozen=True)
class Product:
    key: str
    # The name stays in Latin in both languages ("ALYR Bookings", D-025); the descriptor
    # says in plain words what it is.
    name: Text
    descriptor: Text
    summary: Text
    modules: tuple[str, ...] = ()
    # available: a shop can switch it on. included: every business has it; it cannot be
    # switched on or off. Nothing is listed that does not work, so there is no other state.
    status: str = "available"
    # What an included product brings, since it has no modules to list.
    parts: tuple[Text, ...] = ()
    tags: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Connection:
    key: str
    name: Text
    detail: Text
    # SQL run in the shop's scope; true when connected. Empty means it cannot be
    # connected yet (the page says so).
    connected: str = ""


CONNECTIONS: tuple[Connection, ...] = (
    Connection(
        "whatsapp",
        Text("WhatsApp number", "رقم واتساب"),
        Text(
            "The number your customers message. ALYR answers on it through Meta's official platform.",
            "الرقم الذي يراسلك عليه عملاؤك. ترد ALYR عليه عبر منصة Meta الرسمية.",
        ),
        connected=(
            "exists (select 1 from channel_numbers c where c.tenant_id = "
            "nullif(current_setting('app.tenant_id', true), '')::uuid and c.channel = 'meta')"
        ),
    ),
    Connection(
        "payments",
        Text("Payment provider", "بوابة الدفع"),
        Text(
            "Your own account with a licensed Qatari payment provider. Money goes straight to you.",
            "حسابك لدى بوابة دفع مرخصة في قطر. يصلك المبلغ مباشرة.",
        ),
    ),
)

MODULES: tuple[Module, ...] = (
    Module(
        "inbox",
        Text("Team inbox", "صندوق الفريق"),
        screens=(Screen("inbox", Text("Inbox", "المحادثات"), "inbox"),),
        steps=(
            Step(
                "whatsapp",
                Text("Connect your WhatsApp number", "اربط رقم واتساب"),
                connection="whatsapp",
            ),
        ),
        cards=(
            Card(
                "unanswered",
                Text("Unanswered chats", "محادثات بانتظار الرد"),
                "(select count(*) from contacts c where c.role = 'customer' and c.inbox_status = 'open' "
                "and exists (select 1 from messages m where m.contact_id = c.id and m.direction = 'in' "
                "and m.created_at > coalesce(c.inbox_read_at, '-infinity')))",
            ),
        ),
    ),
    Module(
        "bookings",
        Text("Bookings", "الحجوزات"),
        screens=(Screen("bookings", Text("Bookings", "الحجوزات"), "calendar"),),
        steps=(
            Step(
                "services",
                Text("Add the services customers can book", "أضف الخدمات المتاحة للحجز"),
                done="exists (select 1 from services where active)",
                screen="bookings",
            ),
            Step(
                "hours",
                Text("Set your opening hours", "حدّد ساعات العمل"),
                done="exists (select 1 from business_hours)",
                screen="bookings",
            ),
        ),
        cards=(
            Card(
                "bookings_today",
                Text("Bookings today", "حجوزات اليوم"),
                "(select count(*) from bookings where status = 'booked' and (starts_at at time zone "
                "(select timezone from tenants where id = nullif(current_setting('app.tenant_id', true), '')::uuid))::date = "
                + _TODAY
                + ")",
            ),
        ),
    ),
    Module(
        "orders",
        Text("Orders", "الطلبات"),
        screens=(Screen("orders", Text("Orders", "الطلبات"), "receipt"),),
        steps=(
            Step(
                "products",
                Text("Add your menu or price list", "أضف قائمتك أو أسعارك"),
                done="exists (select 1 from items where available and status = 'live')",
                screen="orders",
            ),
        ),
        cards=(
            Card(
                "orders_today",
                Text("Orders today", "طلبات اليوم"),
                "(select count(*) from orders where not is_test and (created_at at time zone (select timezone from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid))::date = "
                + _TODAY
                + ")",
            ),
        ),
    ),
    # The Catalog: a shop's items, photos and stock (D-039, ALY-104). It belongs to no
    # product and no starting setup: onboarding adds it for a new shop of a type that has one
    # (`Settings.catalog_for_new_shops`, on since ALY-113), migration 0032 gave it to the shops
    # that existed, and the back office switches it off for one shop (`tenant_modules`). Its
    # API answers where this module or the orders module is on.
    Module(
        "catalog",
        Text("Catalog", "الكتالوج"),
        screens=(Screen("catalog", Text("Catalog", "الكتالوج"), "catalog"),),
        # Two numbers on the home screen, each the number of rows in the list it opens (the
        # Catalog list's own filters, `modules/items/listing.py`).
        cards=(
            Card(
                "sold_out", Text("Sold out now", "نفدت الآن"), count="sold_out",
                href="/app/catalog?show=sold_out",
            ),
            Card(
                "low_stock", Text("Low stock", "مخزون قليل"), count="low_stock",
                href="/app/catalog?show=low_stock",
            ),
        ),
    ),
    # Documents: receipts, invoices, quotes, delivery notes, statements, credit notes, deposit
    # receipts and proformas (ALY-138, D-042, spec 011). It is in no product and no starting
    # setup, and it is off for every shop until the product lead switches it on (the back
    # office can for one shop, `SWITCHABLE_MODULES`). With it on, the workspace shows a
    # Documents section (ALY-146, spec 015) and two numbers on the home screen, each the size of
    # the list it opens (`modules/documents/listing.py` works them out; the list and the card
    # share one query). It has no setup step: nothing has to be done before it is useful.
    Module(
        "documents",
        Text("Documents", "المستندات"),
        screens=(Screen("documents", Text("Documents", "المستندات"), "doc"),),
        cards=(
            Card(
                "unpaid_invoices", Text("Unpaid invoices", "فواتير غير مدفوعة"),
                count="unpaid_invoices", href="/app/documents?show=unpaid_invoices",
            ),
            Card(
                "documents_not_delivered", Text("Documents not delivered", "مستندات لم تصل"),
                count="not_delivered", href="/app/documents?show=not_delivered",
            ),
        ),
    ),
    Module(
        "payments",
        Text("Payment links", "روابط الدفع"),
        steps=(
            Step(
                "provider",
                Text("Connect your payment provider", "اربط بوابة الدفع"),
                connection="payments",
            ),
        ),
        cards=(
            Card(
                "paid_today",
                Text("Paid by link today", "مدفوع اليوم عبر الروابط"),
                "(select coalesce(sum(amount), 0)::bigint from payment_requests where status = 'paid' "
                "and (paid_at at time zone (select timezone from tenants where id = "
                "nullif(current_setting('app.tenant_id', true), '')::uuid))::date = "
                + _TODAY
                + ")",
                kind="qar",
            ),
        ),
    ),
    Module(
        "ledger",
        Text("Credit accounts", "الحسابات الآجلة"),
        screens=(Screen("ledger", Text("Credit accounts", "الحسابات الآجلة"), "book"),),
        cards=(
            Card(
                "outstanding",
                Text("Owed to you", "مستحق لك"),
                "(select coalesce(sum(case when kind in ('payment', 'reversal') then -amount "
                "else amount end), 0)::bigint "
                "from ledger_entries)",
                kind="qar",
            ),
        ),
    ),
)

PRODUCTS: tuple[Product, ...] = (
    Product(
        "chat",
        Text("ALYR Chat", "ALYR Chat"),
        Text("WhatsApp orders and team inbox", "طلبات واتساب وصندوق الفريق"),
        Text(
            "Your WhatsApp number as your front desk: one team inbox, an order page, order "
            "tracking and payment links.",
            "رقم واتساب الخاص بك كمكتب استقبال: صندوق واحد للفريق وصفحة للطلب وتتبّع الطلب "
            "وروابط دفع.",
        ),
        modules=("inbox", "orders", "payments"),
    ),
    Product(
        "bookings",
        Text("ALYR Bookings", "ALYR Bookings"),
        Text("Appointments and reminders", "المواعيد والتذكيرات"),
        Text(
            "Customers book from the chat: your services and opening hours, a reminder before "
            "each visit, and a record of who came and who did not.",
            "يحجز عملاؤك من المحادثة: خدماتك وساعات عملك، وتذكير قبل كل موعد، وسجلّ بمن حضر "
            "ومن لم يحضر.",
        ),
        modules=("inbox", "bookings", "payments"),
    ),
    Product(
        "agent",
        Text("ALYR Agent", "ALYR Agent"),
        Text("Your business in numbers", "نشاطك بالأرقام"),
        Text(
            "Your numbers on the home screen, and a report every Sunday morning that compares "
            "the week with the one before.",
            "أرقام نشاطك في الشاشة الرئيسية، وتقرير صباح كل أحد يقارن أسبوعك بالأسبوع الذي "
            "قبله.",
        ),
        status="included",
        parts=(
            Text("Home dashboard", "لوحة الرئيسية"),
            Text("Sunday report", "تقرير الأحد"),
        ),
    ),
    Product(
        "accounts",
        Text("ALYR Accounts", "ALYR Accounts"),
        Text("Credit accounts", "الحسابات الآجلة"),
        Text(
            "Customer accounts, statements and polite reminders with a payment link.",
            "حسابات العملاء وكشوفاتهم وتذكيرات لبقة برابط دفع.",
        ),
        modules=("ledger",),
    ),
)

# Sections every workspace has, whatever the shop has bought.
CORE_SCREENS: tuple[Screen, ...] = (Screen("home", Text("Home", "الرئيسية"), "home"),)
ACCOUNT_SCREENS: tuple[Screen, ...] = (
    Screen("products", Text("Products", "المنتجات"), "apps", MANAGERS),
    Screen("connections", Text("Connections", "الاتصالات"), "plug", MANAGERS),
    Screen("team", Text("Team", "الفريق"), "users"),
)

MODULE_BY_KEY = {m.key: m for m in MODULES}
PRODUCT_BY_KEY = {p.key: p for p in PRODUCTS}
CONNECTION_BY_KEY = {c.key: c for c in CONNECTIONS}

# Modules that more than one product switches on (the team inbox and payment links).
SHARED_MODULES = frozenset(
    m for m in MODULE_BY_KEY if sum(m in p.modules for p in PRODUCTS) > 1
)


def own_modules(product: Product) -> tuple[str, ...]:
    """The modules only this product switches on: they say the shop is using it."""
    return tuple(m for m in product.modules if m not in SHARED_MODULES)


def products_for(modules: set[str] | frozenset[str]) -> list[str]:
    """The products a shop with these modules on is using, in catalogue order.

    An included product is always in use. Otherwise a product is in use when one of its
    own modules is on. A shared module on its own (the inbox and payment links of a
    travel office, say) counts for the first product that has it, ALYR Chat, unless a
    product already in use covers it. So a salon with the inbox, bookings and payment
    links on is using ALYR Bookings, not ALYR Chat as well."""
    modules = set(modules)
    using = [p for p in PRODUCTS if p.status == "included" or set(own_modules(p)) & modules]
    covered = {m for p in using for m in p.modules}
    for product in PRODUCTS:
        if product not in using and set(product.modules) & (modules - covered):
            using.append(product)
            covered |= set(product.modules)
    return [p.key for p in PRODUCTS if p in using]


def check() -> None:
    """Fail fast if the catalogue refers to something that does not exist."""
    for product in PRODUCTS:
        for key in product.modules:
            assert key in MODULE_BY_KEY, f"product {product.key} names unknown module {key}"
        assert product.status in ("available", "included"), product.key
        # A product made only of shared modules could never be told apart from the
        # products it shares them with.
        assert not product.modules or own_modules(product), f"{product.key} has no own module"
        assert product.status != "included" or not product.modules, product.key
    for module in MODULES:
        for step in module.steps:
            assert not step.connection or step.connection in CONNECTION_BY_KEY, step.key
        for card in module.cards:
            assert card.value or card.count, f"card {card.key} has no number"


check()
