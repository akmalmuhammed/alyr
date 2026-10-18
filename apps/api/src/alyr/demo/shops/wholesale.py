"""Rawda Trading («روضة للتجارة»): a fictional food and packaging wholesaler in the Industrial
Area. The Price list has pack sizes, smallest orders, a code on every row and three customer
price groups (retail, cafés and restaurants, hotels and catering), with a customer in each.
Most orders go on the customer's credit account (ALY-110)."""

from uuid import UUID

from alyr.demo.model import Customer, Product, Shop, qar

CAFE, HOTEL = "cafe", "hotel"


def p(key, name, name_ar, category, retail, cafe, hotel, sku, pack, minimum, stock, *,
      motif="box", unit="pack", desc="", desc_ar="", pop=5, state="", photo=True):
    """A price-list row: the retail price, the two groups' prices, its code and its pack."""
    return Product(
        key, name, name_ar, category, qar(retail), motif, desc, desc_ar, unit=unit, stock=stock,
        sku=sku, pack=pack, min_order=minimum, pop=pop, state=state, photo=photo,
        groups=((CAFE, qar(cafe)), (HOTEL, qar(hotel))) if cafe else (),
    )


PRODUCTS = (
    # ── Rice and sugar ────────────────────────────────────────────────────────────────
    p("basmati-5x4", "Basmati rice 5 kg, carton of 4", "أرز بسمتي 5 كغ، كرتون 4", "Rice & sugar",
      118, 108, 102, "RIC-B5X4", 4, 2, 120, motif="sack", pop=9,
      desc="Long grain, aged one year.", desc_ar="حبة طويلة معتّقة لمدة سنة."),
    p("jasmine-10", "Jasmine rice 10 kg bag", "أرز ياسمين 10 كغ", "Rice & sugar",
      62, 57, 54, "RIC-J10", None, 2, 90, motif="sack", pop=6),
    p("sugar-50", "White sugar 50 kg bag", "سكر أبيض 50 كغ", "Rice & sugar",
      142, 132, 128, "SUG-50", None, 1, 40, motif="sack", pop=5),
    p("sugar-2x12", "Sugar 2 kg, carton of 12", "سكر 2 كغ، كرتون 12", "Rice & sugar",
      98, 90, 86, "SUG-2X12", 12, 2, 60, pop=6),
    p("flour-10", "Wheat flour 10 kg bag", "طحين قمح 10 كغ", "Rice & sugar",
      34, 31, 29, "FLR-10", None, 3, 80, motif="sack", pop=5),
    # ── Oils ──────────────────────────────────────────────────────────────────────────
    p("sunflower-1-5x12", "Sunflower oil 1.5 litres, carton of 12", "زيت دوار الشمس 1.5 لتر، كرتون 12",
      "Oils", 148, 138, 132, "OIL-S15X12", 12, 2, 70, motif="bottle", pop=9),
    p("olive-blend-750x12", "Olive oil blend 750 ml, carton of 12",
      "زيت زيتون مخلوط 750 مل، كرتون 12", "Oils", 215, 200, 192, "OIL-O75X12", 12, 1, 35,
      motif="bottle", pop=4),
    p("ghee-1x12", "Ghee 1 kg, carton of 12", "سمن 1 كغ، كرتون 12", "Oils",
      232, 215, 208, "GHE-1X12", 12, 1, 25, motif="jar", pop=5, state="low"),
    p("frying-18", "Frying oil 18 litre tin", "زيت قلي 18 لتر", "Oils",
      128, 118, 112, "OIL-F18", None, 2, 30, motif="jar", pop=7, state="sold_out"),
    # ── Drinks ────────────────────────────────────────────────────────────────────────
    p("water-500x24", "Bottled water 500 ml, carton of 24", "مياه معبأة 500 مل، كرتون 24", "Drinks",
      14, 13, 12, "WAT-5X24", 24, 20, 400, motif="bottle", pop=10),
    p("juice-200x24", "Juice 200 ml, carton of 24", "عصير 200 مل، كرتون 24", "Drinks",
      36, 33, 31, "JUI-2X24", 24, 10, 180, motif="bottle", pop=6),
    p("tea-100x24", "Black tea bags 100, carton of 24", "شاي أسود 100 كيس، كرتون 24", "Drinks",
      168, 156, 150, "TEA-100X24", 24, 1, 45, pop=7),
    p("arabic-coffee-1", "Arabic coffee 1 kg bag", "قهوة عربية 1 كغ", "Drinks",
      55, 51, 48, "COF-AR1", None, 5, 60, motif="sack", pop=6,
      desc="Light roast with cardamom.", desc_ar="تحميص خفيف مع الهيل."),
    # ── Household ─────────────────────────────────────────────────────────────────────
    p("tissue-48", "Tissue boxes, carton of 48", "علب مناديل، كرتون 48", "Household",
      72, 66, 63, "TIS-48", 48, 5, 100, pop=7),
    p("dish-750x12", "Dishwashing liquid 750 ml, carton of 12", "سائل جلي 750 مل، كرتون 12",
      "Household", 54, 50, 48, "DSH-75X12", 12, 6, 80, motif="bottle", pop=5),
    p("bin-bags-80x20", "Bin bags 80 litres, carton of 20 rolls", "أكياس نفايات 80 لتر، كرتون 20 لفة",
      "Household", 66, 61, 58, "BIN-80X20", 20, 2, 55, pop=4),
    # ── Dates and nuts ────────────────────────────────────────────────────────────────
    p("khalas-5", "Khalas dates 5 kg box", "تمر خلاص 5 كغ", "Dates & nuts",
      88, 82, 78, "DAT-KH5", None, 2, 50, motif="dates", pop=7),
    p("almonds-1", "Roasted almonds 1 kg", "لوز محمص 1 كغ", "Dates & nuts",
      62, 58, 55, "NUT-AL1", None, 3, 30, motif="jar", pop=4),
    # ── Packaging ─────────────────────────────────────────────────────────────────────
    p("cups-8oz", "Paper cups 8 oz, sleeve of 1,000", "أكواب ورقية 8 أونصة، 1000 كوب", "Packaging",
      85, 78, 74, "PKG-C8", 1000, 1, 200, motif="cup", pop=8),
    p("containers-200", "Takeaway containers, box of 200", "علب تغليف للطلبات الخارجية، 200 علبة",
      "Packaging", 58, 54, 51, "PKG-TK200", 200, 2, 90, pop=6),
    p("napkins-40", "Paper napkins, carton of 40 packs", "مناديل ورقية، كرتون 40 عبوة", "Packaging",
      46, 43, 41, "PKG-N40", 40, 2, 70, pop=5),
    # ── not for sale ──────────────────────────────────────────────────────────────────
    p("basmati-1121", "Basmati 1121 premium 5 kg, carton of 4", "أرز بسمتي 1121 فاخر 5 كغ، كرتون 4",
      "Rice & sugar", 138, 0, 0, "RIC-P5X4", 4, 2, 0, photo=False, state="draft"),
    p("ramadan-carton", "Ramadan carton", "كرتون رمضان", "Dates & nuts", 195, 0, 0, "RAM-C1",
      None, 1, 20, state="hidden"),
)

CUSTOMERS = (
    # Cafés and restaurants: their own prices, on account.
    Customer("كافيه الفانوس", "ar", "account", CAFE, qar(20_000)),
    Customer("Karak Corner", "en", "account", CAFE, qar(15_000)),
    Customer("Dune Roasters", "en", "account", CAFE, qar(25_000)),
    Customer("مطعم الواحة", "ar", "account", CAFE, qar(18_000)),
    Customer("Marsa Bites", "en", "account", CAFE, qar(12_000)),
    # Hotels and caterers: the lowest prices, larger limits.
    Customer("Pearl Bay Catering", "en", "account", HOTEL, qar(80_000)),
    Customer("فندق ريم للضيافة", "ar", "account", HOTEL, qar(60_000)),
    Customer("Oasis Events Catering", "en", "account", HOTEL, qar(50_000)),
    # Retail: the normal prices, paying by link, one with a small account.
    Customer("بقالة السد", "ar", "regular"),
    Customer("Wakra Mini Mart", "en", "regular", "", qar(8_000)),
    Customer("متجر تمور الدوحة", "ar", "occasional"),
    Customer("Orchid Bakery", "en", "new"),
)

SHOP = Shop(
    key="wholesale", slug="demo-wholesale", tenant_id=UUID("0a1f0000-0000-4000-8000-00000000d106"),
    name="Rawda Trading", name_ar="روضة للتجارة", kind="wholesale", area="Industrial Area",
    hue=44, whatsapp="97455910106",
    owner=("owner@demo-wholesale.example", "Rawda", "روضة"),
    agent=("agent@demo-wholesale.example", "Hassan", "حسان"),
    products=PRODUCTS, customers=CUSTOMERS,
    groups=((CAFE, "Café & restaurant", "مقاهي ومطاعم"), (HOTEL, "Hotel & catering", "فنادق وتموين")),
    extra_categories=(("Dates & nuts", "التمر والمكسرات"), ("Packaging", "التغليف")),
    orders_a_day=4, lines=(2, 5), open_hours=(7, 16),
)
