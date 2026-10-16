"""What ALYR sells, and what each piece adds to a shop's workspace (decision D-027).

Two layers, on purpose:

* **Modules** are what the code switches on per shop (`tenant_modules`). Each module
  declares, in one place, everything the workspace shell needs to know about it: its
  screens, who may use them, what must be connected first, the setup steps, and the
  cards it adds to the home dashboard.
* **Products** are what a shop buys. A product is a named bundle of modules. Pricing
  and packaging can change by editing this file, without touching the modules.

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
    run in the shop's own scope."""

    key: str
    label: Text
    value: str
    kind: str = "count"  # count | qar


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
    name: Text
    summary: Text
    modules: tuple[str, ...] = ()
    # available: a shop can switch it on. coming: shown so shops know it is planned,
    # but cannot be switched on.
    status: str = "available"
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
                done="exists (select 1 from products where available)",
                screen="orders",
            ),
        ),
        cards=(
            Card(
                "orders_today",
                Text("Orders today", "طلبات اليوم"),
                "(select count(*) from orders where (created_at at time zone (select timezone from tenants "
                "where id = nullif(current_setting('app.tenant_id', true), '')::uuid))::date = "
                + _TODAY
                + ")",
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
                "(select coalesce(sum(case kind when 'payment' then -amount else amount end), 0)::bigint "
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
        Text(
            "Your WhatsApp number as your front desk: team inbox, bookings, orders and payment links.",
            "رقم واتساب الخاص بك كمكتب استقبال: صندوق للفريق وحجوزات وطلبات وروابط دفع.",
        ),
        modules=("inbox", "bookings", "orders", "payments"),
    ),
    Product(
        "credit",
        Text("Credit accounts", "الحسابات الآجلة"),
        Text(
            "Customer accounts, statements and polite reminders with a payment link.",
            "حسابات العملاء وكشوفاتهم وتذكيرات لبقة برابط دفع.",
        ),
        modules=("ledger",),
    ),
    Product(
        "payroll",
        Text("Payroll and staff documents", "الرواتب ووثائق الموظفين"),
        Text(
            "Salary files for the bank, and reminders before visas and licences expire.",
            "ملفات الرواتب للبنك، وتذكيرات قبل انتهاء التأشيرات والتراخيص.",
        ),
        status="coming",
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


def products_for(modules: set[str]) -> list[str]:
    """The products whose every module is switched on."""
    return [p.key for p in PRODUCTS if p.modules and set(p.modules) <= modules]


def check() -> None:
    """Fail fast if the catalogue refers to something that does not exist."""
    for product in PRODUCTS:
        for key in product.modules:
            assert key in MODULE_BY_KEY, f"product {product.key} names unknown module {key}"
    for module in MODULES:
        for step in module.steps:
            assert not step.connection or step.connection in CONNECTION_BY_KEY, step.key


check()
