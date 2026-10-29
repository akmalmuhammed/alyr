// The words of the ALYR Shelf page (/shelf, /ar/shelf), English and Arabic, from
// docs/site-products-2/02-messaging.md §3 and 03-visuals.md §2. ALYR Shelf is the Catalog
// module's public name (founder, 20 Oct 2026): it comes with ALYR, with every product
// (D-039). Every drawn screen uses the product's own words (`catalogCopy.ts`,
// `_customer/order/copy.ts`, `items/wa_text.py`, `items/text.py`, `items/notes.py`) for one
// fictional bakery, Qirfa Bakery, on Saturday 17 Oct 2026, orders #1450 to #1454. The
// stock log's actor is never drawn: the product can print "Assistant", which is on the
// no-AI list (02 §3.1d). The Arabic is a draft until the native review (ALY-66).

import type { DemoSet, FlowSet, PageCommon, ScreenSection } from "./copy";

/** One item card on the drawn order page (`/s/`), as `ItemCard.tsx` lays it out. */
export type OrderItem = {
  name: string;
  price: string;
  /** "Only 1 left today" (few), "Order before 6 pm for tomorrow" (when) or "Sold out" (out). */
  note?: string;
  tone?: "few" | "when" | "out";
};

/** The signature figure: two customers, one stock, one sale (03 §2.1). */
export type LastOne = {
  eyebrow?: string;
  title: string;
  body: string;
  /** What the figure shows, said once for screen readers. */
  label: string;
  /** The small label over each part of the drawing. */
  parts: { a: string; card: string; b: string };
  page: { shop: string; monogram: string; context: string };
  item: { code: string; name: string; price: string; left: string };
  bar: { account: string; placing: string };
  a: { placed: string; onAccount: string };
  b: { soldOut: string; notice: string; fix: string };
  stock: {
    path: string;
    rule: string;
    leftToday: string;
    of: string;
    soldOut: string;
    log: string;
    rows: { kind: string; delta: string; order: string; at: string; balance: string }[];
  };
};

/** The Stock tab of the workspace's Menu (`/app/catalog`), drawn. */
export type StockSheet = {
  path: string;
  tabs: [string, string];
  toolbar: string[];
  sub: string;
  filters: string[];
  heads: { item: string; now: string };
  acts: { received: string; wasted: string; count: string };
  rows: { name: string; now: string; of?: string; state?: string; tone?: "out" | "low"; on?: boolean }[];
  log: { title: string; who: string; rows: { kind: string; what: string; amount: string }[] };
};

export type ShelfPage = PageCommon & {
  demo: DemoSet;
  moment: LastOne;
  flow: FlowSet;
  screen: ScreenSection & { sheet: StockSheet; logCaption: string };
};

export const shelfEn: ShelfPage = {
  bar: {
    label: "ALYR Shelf",
    links: [
      { id: "how", label: "How it works" },
      { id: "inside", label: "What’s in it" },
      { id: "works", label: "Works with" },
    ],
  },
  hero: {
    eyebrow: "With every product",
    title: ["Your items and stock in one place,", "counted down with every sale."],
    lead:
      "Photos, prices, sizes and choices in Arabic and English. When the last one sells, the order page shows Sold out.",
    facts: ["With every ALYR product", "Sold out shown on the order page", "Count by item, by day or by weight"],
  },
  demo: {
    business: "Qirfa Bakery",
    businessMeta: "Sample business",
    today: "Today",
    typeHere: "Message",
    workspace: "Workspace",
    tabsLabel: "What ALYR Shelf does",
    pause: "Pause the demo",
    play: "Play the demo",
    demos: [
      {
        id: "sold-out",
        tab: "Sold out",
        start: 17 * 60 + 42,
        chat: [
          { from: "customer", text: "sold out saffron cake" },
          { from: "business", text: "Done: Saffron milk cake, slice is now sold out. Customers cannot order it.", actions: ["Undo"] },
        ],
        panel: {
          kicker: "Order page",
          title: "Cakes",
          badge: "What customers see",
          rows: [
            { lead: "108", main: "Saffron milk cake, slice", sub: "QAR 26", trail: "Sold out", tone: "quiet" },
            { lead: "109", main: "Pistachio kunafa cheesecake", sub: "QAR 85", trail: "Sold out", tone: "quiet" },
            { lead: "110", main: "Celebration cake, 1\u00a0kg", sub: "QAR 220 · Order before 6 pm for tomorrow", trail: "On sale", tone: "done", wrap: true },
          ],
        },
        caption: "One message from a staff phone, and customers cannot order it. Undo puts it back.",
      },
      {
        id: "code",
        tab: "By code",
        start: 11 * 60 + 20,
        chat: [
          { from: "customer", text: "108 x2" },
          { from: "business", text: "Item code 108\n2 x Saffron milk cake, slice - QAR 26\nTotal: QAR 52\nTap Confirm to add this to your order.", actions: ["Confirm", "Change"] },
          { from: "customer", text: "Confirm" },
          { from: "business", text: "Added to your order.", actions: ["Place order", "Empty order"] },
        ],
        panel: {
          title: "Order from the chat",
          badge: "Draft order",
          rows: [
            { lead: "108", main: "2 x Saffron milk cake, slice - QAR 26", sub: "Found by its item code", trail: "QAR 52", tone: "signal" },
          ],
          total: ["Total", "QAR 52"],
        },
        caption: "Customers order by the code on your menu. Voice notes, and a customer whose codes keep missing, go to your team.",
      },
      {
        id: "weight",
        tab: "By weight",
        start: 12 * 60 + 30,
        chat: [
          { from: "customer", text: "131 x0.5" },
          { from: "business", text: "Item code 131\n0.5 kg x Date maamoul - QAR 30\nTotal: QAR 30\nTap Confirm to add this to your order.", actions: ["Confirm", "Change"] },
        ],
        panel: {
          kicker: "Order page",
          title: "Date maamoul",
          badge: "QAR 60 a kg",
          rows: [
            { lead: "131", main: "Date maamoul", sub: "Sold by the kilo · counted in stock", acts: ["0.25 kg", "0.5 kg", "1 kg"], tone: "done" },
            { main: "0.5 kg", sub: "In the order", trail: "QAR 30", tone: "signal" },
          ],
        },
        caption: "Sold by the kilo: quick amounts on the page, and “131\u00a0x0.5” in the chat.",
      },
      {
        id: "unpaid",
        tab: "Unpaid",
        start: 14 * 60 + 32,
        chat: [
          { from: "business", text: "Order #1453 was cancelled because it was not paid within 30 minutes. The items were put back." },
        ],
        panel: {
          kicker: "Stock",
          title: "Butter croissant",
          badge: "Order #1453",
          rows: [
            { lead: "14:32", main: "Put back · Order #1453", sub: "Not paid within 30 minutes", trail: "+2", tone: "done" },
            { lead: "14:02", main: "Sold · Order #1453", sub: "Held for the payment link", trail: "−2", tone: "done" },
          ],
        },
        caption: "An unpaid pay-link order holds its stock for 30 minutes, then gives it back. Payment links open a test page until a payment provider is connected.",
      },
    ],
  },
  moment: {
    title: "Two customers order the last cheesecake",
    body:
      "Aisha and Mariam put the last kunafa cheesecake on their accounts in the same second. ALYR Shelf takes stock in one step, and only if the count stays at zero or above, so one order gets it. Mariam’s page says Sold out, and nothing sells twice.",
    label:
      "Two customers put the last pistachio kunafa cheesecake on their accounts in the same second. Aisha’s order #1452 takes it: the count goes from 1 to 0, and the stock log gains a Sold row. Mariam’s order page marks the cake Sold out and asks her to fix her order.",
    parts: { a: "Aisha’s phone", card: "The Stock screen", b: "Mariam’s phone" },
    page: { shop: "Qirfa Bakery", monogram: "QB", context: "Order" },
    item: { code: "109", name: "Pistachio kunafa cheesecake", price: "QAR 85", left: "Only 1 left today" },
    bar: { account: "Put it on my account", placing: "Placing your order…" },
    a: { placed: "Order #1452 received", onAccount: "It has been added to your account." },
    b: { soldOut: "Sold out", notice: "Pistachio kunafa cheesecake is sold out", fix: "Fix the items marked above to continue." },
    stock: {
      path: "Menu › Stock",
      rule: "A number each day · 6",
      leftToday: "Left today",
      of: "of 6",
      soldOut: "Sold out",
      log: "Recent changes",
      rows: [
        { kind: "Sold", delta: "−1", order: "Order #1452", at: "16:05", balance: "balance 0" },
        { kind: "Sold", delta: "−2", order: "Order #1451", at: "13:40", balance: "balance 1" },
        { kind: "Sold", delta: "−3", order: "Order #1450", at: "10:12", balance: "balance 3" },
      ],
    },
  },
  flow: {
    title: "What happens when something sells.",
    body:
      "ALYR Shelf takes the stock, adds a row to the stock log and updates the order page.",
    tabsLabel: "Examples",
    stepsLabel: "Steps",
    pause: "Pause",
    play: "Play",
    customer: { name: "Your customer" },
    whatsapp: { name: "WhatsApp", sub: "Business Platform" },
    alyr: { name: "ALYR Shelf", idle: "Waiting for the next sale" },
    team: { name: "Your team", idle: "Nothing new yet" },
    stories: [
      {
        id: "last",
        tab: "The last one",
        steps: [
          {
            move: "team",
            title: "One left today",
            body: "Qirfa makes 6 kunafa cheesecakes a day. Five have sold, so the order page says “Only 1 left today”.",
            record: { id: "item", main: "Pistachio kunafa cheesecake", sub: "A number each day: 6", trail: "Only 1 left today" },
          },
          {
            move: "in",
            title: "Two customers want it",
            body: "Aisha and Mariam both put it on their accounts in the same second.",
            chat: { from: "event", text: "Aisha: Put it on my account" },
            work: ["Order from Aisha", "Order from Mariam"],
          },
          {
            title: "One step at checkout",
            body: "ALYR Shelf takes the stock only if the count stays at zero or above. Aisha’s order is first, so it takes the last one.",
            work: ["Left today: 1 → 0", "Order #1452 saved"],
          },
          {
            move: "team",
            title: "The stock log adds a row",
            body: "The stock log gains a “Sold” row with the order number. Nobody typed it, and nobody can edit it.",
            record: { id: "log", main: "Sold · Order #1452", sub: "Pistachio kunafa cheesecake", trail: "16:05" },
            work: ["Stock log: Sold −1"],
          },
          {
            move: "out",
            title: "The second customer is told",
            body: "Mariam’s order page says it has sold out, before she places her order.",
            chat: { from: "event", text: "Pistachio kunafa cheesecake is now sold out." },
            work: ["Order page: Sold out"],
          },
          {
            move: "team",
            title: "Back tomorrow morning",
            body: "A number each day starts again each day, so tomorrow there are 6 again.",
            record: { id: "item", main: "Pistachio kunafa cheesecake", sub: "A number each day: 6", trail: "Sold out", tone: "quiet" },
            work: ["Tomorrow: 6"],
          },
        ],
      },
      {
        id: "staff",
        tab: "A staff phone",
        steps: [
          {
            move: "in",
            title: "A message from a staff phone",
            body: "Yusuf’s number is registered as staff, so his messages can change the shelf. He writes the way he talks.",
            chat: { from: "customer", text: "sold out saffron cake" },
            work: ["Staff message: Yusuf"],
          },
          {
            title: "It finds one item",
            body: "One item fits, so ALYR Shelf changes it. When several fit, it asks which, and changes nothing until he answers.",
            work: ["Item: Saffron milk cake, slice", "One item fits"],
          },
          {
            move: "out",
            title: "Done, with Undo",
            body: "The reply says exactly what changed.",
            chat: { from: "business", text: "Done: Saffron milk cake, slice is now sold out. Customers cannot order it.", action: "Undo" },
            work: ["Reply sent"],
          },
          {
            move: "team",
            title: "The order page says Sold out",
            body: "The item is greyed on the order page, or left out, as you choose.",
            record: { id: "item", main: "Saffron milk cake, slice", sub: "Order page", trail: "Sold out", tone: "quiet" },
          },
          {
            move: "team",
            title: "The record shows who changed it",
            body: "The record says who changed it, when, and from which phone.",
            work: ["Changed by Yusuf · 17:42"],
          },
          {
            move: "back",
            title: "Undo, once",
            body: "Pressed too soon? Undo works once, for the person who made the change.",
            chat: { from: "business", text: "Undone: Saffron milk cake, slice is back on sale." },
            record: { id: "item", main: "Saffron milk cake, slice", sub: "Order page", trail: "On sale", tone: "signal" },
          },
        ],
      },
      {
        id: "unpaid",
        tab: "An unpaid order",
        steps: [
          {
            move: "in",
            title: "An order with a payment link",
            body: "Omar orders two croissants and chooses to pay by link.",
            chat: { from: "event", text: "Ordered 2 croissants, QAR 24" },
            work: ["Order #1453", "Pay by link"],
          },
          {
            title: "The stock is held",
            body: "His two croissants are held for 30 minutes, so nobody else can take them. The shop can change the 30 minutes.",
            work: ["Held: 2 · 30 min"],
          },
          {
            title: "30 minutes, unpaid",
            body: "The link was not paid in time.",
            work: ["Hold ended: not paid"],
          },
          {
            move: "team",
            title: "The stock comes back by itself",
            body: "The order is cancelled, and a “Put back” row returns the two croissants. A cancellation puts stock back once, never twice.",
            record: { id: "log", main: "Put back · Order #1453", sub: "Butter croissant", trail: "+2" },
          },
          {
            move: "out",
            title: "Omar is told why",
            body: "The customer hears why, in his language.",
            chat: { from: "business", text: "Order #1453 was cancelled because it was not paid within 30 minutes. The items were put back." },
            work: ["Customer told"],
          },
        ],
      },
    ],
  },
  screen: {
    title: "Stock now, and every change to it",
    label: "The Stock screen of a fictional bakery’s workspace",
    callouts: [
      "What is left now, for every item you count.",
      "Sold out and low stock, one tap away.",
      "Received, Wasted or Count, with a reason.",
      "Every change, newest first: what, how much, who. Nothing is overwritten.",
    ],
    sheet: {
      path: "Menu",
      tabs: ["Items", "Stock"],
      toolbar: ["Import / Export", "Discounts", "Delivery", "Features", "Settings"],
      sub: "Items you count: what is on the shelf now.",
      filters: ["Sold out", "Low stock"],
      heads: { item: "Item", now: "In the system" },
      acts: { received: "Received", wasted: "Wasted", count: "Count" },
      rows: [
        { name: "Butter croissant", now: "23", of: "of 40" },
        { name: "Saffron milk cake, slice", now: "0", of: "of 24", state: "Sold out", tone: "out" },
        { name: "Pistachio kunafa cheesecake", now: "2", of: "of 6", state: "Low stock", tone: "low" },
        { name: "Date maamoul", now: "3.75 kg", on: true },
      ],
      log: {
        title: "Recent changes",
        who: "Date maamoul",
        rows: [
          { kind: "Sold", what: "Order #1454", amount: "−0.5 kg" },
          { kind: "Received", what: "Made today · by Yusuf", amount: "+4 kg" },
          { kind: "Wasted", what: "Broken · by Yusuf", amount: "−0.25 kg" },
          { kind: "Counted", what: "Counted: no difference", amount: "0" },
        ],
      },
    },
    logCaption: "The same screen with one item open: its recent changes, newest first.",
  },
  inside: {
    title: "What’s in ALYR Shelf",
    groups: [
      {
        name: "For your customers",
        items: [
          "Photos, prices, sizes and choices on an order page made for their phone. No app, no account.",
          "Each item in Arabic and English. An item needs its Arabic name before it goes on sale.",
          "Plain words on when to order: “Ready from 5 pm”, “Order before 6 pm for tomorrow”.",
          "“Only 3 left” when stock is low, and “Sold out” when it is gone.",
          "Order by item code in the chat (“108\u00a0x2”), by name or by link.",
          "Sold by weight or volume, with quick amounts: 0.25, 0.5 and 1 kg.",
        ],
      },
      {
        name: "For your team",
        items: [
          "Up to 8 photos for each item, with a cover.",
          "Sizes and colours, each with its own stock and price.",
          "Choices and extras, required or optional.",
          "Four ways to keep count: always available, on or off, counted in stock, or a number each day.",
          "Times it can be ordered: lead time, a cut-off and days off.",
          "From a staff phone: sold out, back, stock, price and undo, in Arabic or English.",
          "A photo with its name and price as the caption becomes a draft, until an owner puts it on sale.",
          "Import from a spreadsheet (Excel or CSV) with English or Arabic headings, with a preview of every row before anything is saved, and one undo.",
          "A wholesale price for a group of customers.",
          "A share link and QR codes for your order page.",
          "Your own fields on items and sizes, up to 20.",
          "Starts from your kind of business: a bakery counts each day and takes orders a day ahead; a grocery counts stock and leaves out what is sold out.",
        ],
      },
      {
        name: "Behind the scenes",
        items: [
          "The last item sells once: the stock is taken in one step at checkout.",
          "An unpaid pay-link order gives its stock back after 30 minutes, and the customer is told.",
          "A cancelled order puts its stock back once.",
          "The stock log only adds rows: received, sold, put back, wasted, counted, corrected, each with who and why.",
          "An item with orders behind it is archived, never deleted.",
          "Photos are checked, and their location and camera details removed, before anyone sees them.",
        ],
      },
      {
        name: "When you switch it on",
        items: [
          "Discounts and coupon codes.",
          "Delivery areas with fees, no fee over an amount you set, and a minimum order.",
          "Cost price and margin, seen by owners and admins only.",
        ],
      },
    ],
    note: "With every ALYR product. Everything listed here is built.",
  },
  who: {
    title: "How each kind of business starts",
    rows: [
      { name: "Bakeries and home kitchens", tags: ["A number each day", "Order before 6 pm", "Photos"] },
      { name: "Groceries and baqalas", tags: ["Counted stock", "By weight", "Left out when sold out"] },
      { name: "Fashion, abayas and gifts", tags: ["Sizes and colours", "Stock for each size"] },
      { name: "Restaurants and cafes", tags: ["Menu", "Choices and extras", "On or off"] },
      { name: "Wholesale and trading", tags: ["Price list", "Wholesale prices", "Import from a sheet"] },
    ],
    other: "If you run another kind of business, write to us about how you work today.",
  },
  works: {
    title: "Works with the rest of ALYR.",
    link: "See {name}",
    rows: {
      chat: "The order page and the chat sell from your shelf: by photo, by name or by code.",
      bookings: "Services are booked in ALYR Bookings. What you sell beside them is on your shelf, ordered through ALYR Chat.",
      agent: "Comes with it: sold out now and low stock, on your home screen.",
      accounts: "An order on account takes its stock straight away.",
      docs: "Each line on the paper is an item from your shelf, with its Arabic name, size and choices.",
    },
  },
  faq: {
    title: "Questions",
    items: [
      { id: "pay", q: "Do I pay for ALYR Shelf?", a: "It comes with ALYR, with every product.", offer: false },
      { id: "pay-offer", q: "Do I pay for ALYR Shelf?", a: "It is included with ALYR. It is not priced on its own.", offer: true },
      {
        id: "own",
        q: "Can I use it on its own?",
        a: "No: it comes with every ALYR product. Customers order from it through ALYR Chat, and with ALYR Accounts your regulars can put an order on account.",
      },
      {
        id: "setup",
        q: "How long does setup take?",
        a: "We agree the date you start at the visit, and load your items, photos and prices with you, or from your own sheet.",
      },
      {
        id: "last-one",
        q: "What if two customers order the last one?",
        a: "Only one gets it. The stock is taken in one step at checkout, so the second customer is told it has sold out before she orders.",
      },
      {
        id: "staff",
        q: "Who can change stock from WhatsApp?",
        a: "Only the numbers you register as staff. Every change has Undo, and the record says who made it.",
      },
      {
        id: "weight",
        q: "I sell by the kilo.",
        a: "Set the item by weight, in kilograms or grams. The order page offers quick amounts, and the chat takes “131\u00a0x0.5”.",
      },
    ],
  },
  cta: {
    title: "Tell us what you sell, and how you keep count today.",
    body: "Send us a message. A person from ALYR replies, then comes to load your items and stock with you.",
  },
};

export const shelfAr: ShelfPage = {
  bar: {
    label: "ALYR Shelf",
    links: [
      { id: "how", label: "كيف يعمل" },
      { id: "inside", label: "ماذا يتضمن" },
      { id: "works", label: "يعمل مع" },
    ],
  },
  hero: {
    eyebrow: "مع كل منتج",
    title: ["أصنافك ومخزونك في مكان واحد،", "وينقص المخزون مع كل\u00a0بيع."],
    lead:
      "الصور والأسعار والمقاسات والخيارات بالعربية والإنجليزية. وحين تُباع القطعة الأخيرة، تُظهر صفحة الطلب «نفد».",
    facts: ["مع كل منتج من ALYR", "«نفد» يظهر في صفحة الطلب", "العدّ بالقطعة أو باليوم أو بالوزن"],
  },
  demo: {
    business: "مخبز قرفة",
    avatar: "ق",
    businessMeta: "نشاط توضيحي",
    today: "اليوم",
    typeHere: "مراسلة",
    workspace: "مساحة العمل",
    tabsLabel: "ما يفعله ALYR Shelf",
    pause: "إيقاف العرض",
    play: "تشغيل العرض",
    demos: [
      {
        id: "sold-out",
        tab: "نفد",
        start: 17 * 60 + 42,
        chat: [
          { from: "customer", text: "كيك الزعفران خلص" },
          { from: "business", text: "تم: نفد «كيك الحليب بالزعفران، قطعة». لا يستطيع العملاء طلبه.", actions: ["تراجع"] },
        ],
        panel: {
          kicker: "صفحة الطلب",
          title: "الكيك",
          badge: "ما يراه العملاء",
          rows: [
            { lead: "108", main: "كيك الحليب بالزعفران، قطعة", sub: "26 ر.ق", trail: "نفد", tone: "quiet" },
            { lead: "109", main: "تشيز كيك الكنافة بالفستق", sub: "85 ر.ق", trail: "نفد", tone: "quiet" },
            { lead: "110", main: "كيكة مناسبات، 1\u00a0كغ", sub: "220 ر.ق · اطلب قبل الساعة 6 م ليكون جاهزاً غداً", trail: "معروض للبيع", tone: "done", wrap: true },
          ],
        },
        caption: "رسالة واحدة من هاتف الموظف، فلا يستطيع العملاء طلبه. وزر «تراجع» يعيده.",
      },
      {
        id: "code",
        tab: "بالكود",
        start: 11 * 60 + 20,
        chat: [
          { from: "customer", text: "108 x2" },
          { from: "business", text: "\u200fكود الصنف 108\n\u200f2 x كيك الحليب بالزعفران، قطعة - 26 ر.ق\nالإجمالي: 52 ر.ق\nاضغط تأكيد لإضافته إلى طلبك.", actions: ["تأكيد", "تغيير"] },
          { from: "customer", text: "تأكيد" },
          { from: "business", text: "تمت الإضافة إلى طلبك.", actions: ["إتمام الطلب", "تفريغ الطلب"] },
        ],
        panel: {
          title: "طلب من المحادثة",
          badge: "مسودة الطلب",
          rows: [
            { lead: "108", main: "\u200f2 x كيك الحليب بالزعفران، قطعة - 26 ر.ق", sub: "وُجد بكود الصنف", trail: "52 ر.ق", tone: "signal" },
          ],
          total: ["الإجمالي", "52 ر.ق"],
        },
        caption: "يطلب العملاء بالكود المكتوب في قائمتك. والرسائل الصوتية، والعميل الذي تتكرر أكواده دون تطابق، تذهب إلى فريقك.",
      },
      {
        id: "weight",
        tab: "بالوزن",
        start: 12 * 60 + 30,
        chat: [
          { from: "customer", text: "131 x0.5" },
          { from: "business", text: "\u200fكود الصنف 131\n\u200f0.5 كغ x معمول التمر - 30 ر.ق\nالإجمالي: 30 ر.ق\nاضغط تأكيد لإضافته إلى طلبك.", actions: ["تأكيد", "تغيير"] },
        ],
        panel: {
          kicker: "صفحة الطلب",
          title: "معمول التمر",
          badge: "60 ر.ق للكيلو",
          rows: [
            { lead: "131", main: "معمول التمر", sub: "يُباع بالكيلو · محسوب في المخزون", acts: ["0.25 كغ", "0.5 كغ", "1 كغ"], tone: "done" },
            { main: "0.5 كغ", sub: "في الطلب", trail: "30 ر.ق", tone: "signal" },
          ],
        },
        caption: "بالكيلو: كميات جاهزة في الصفحة، و«\u2066131 x0.5\u2069» في المحادثة.",
      },
      {
        id: "unpaid",
        tab: "لم يُدفع",
        start: 14 * 60 + 32,
        chat: [
          { from: "business", text: "تم إلغاء الطلب رقم 1453 لأنه لم يُدفع خلال 30 دقيقة، وأُعيدت الأصناف." },
        ],
        panel: {
          kicker: "المخزون",
          title: "كرواسون بالزبدة",
          badge: "الطلب رقم 1453",
          rows: [
            { lead: "14:32", main: "أُعيد للمخزون · الطلب رقم 1453", sub: "لم يُدفع خلال 30 دقيقة", trail: "+2", tone: "done" },
            { lead: "14:02", main: "مبيع · الطلب رقم 1453", sub: "محجوز لرابط الدفع", trail: "−2", tone: "done" },
          ],
        },
        caption: "طلب برابط دفع لم يُدفع يحجز كميته 30 دقيقة ثم يعيدها. وروابط الدفع تفتح صفحة تجريبية إلى أن يُربط مزوّد دفع.",
      },
    ],
  },
  moment: {
    title: "عميلتان تطلبان آخر قطعة تشيز كيك",
    body:
      "وضعت عائشة ومريم آخر تشيز كيك كنافة على حسابيهما في الثانية نفسها. يأخذ ALYR Shelf الكمية في خطوة واحدة، ولا يأخذها إلا إذا بقي الرقم صفراً أو أكثر، فيحصل عليها طلب واحد. وتُظهر صفحة مريم «نفد»، ولا يُباع شيء مرتين.",
    label:
      "عميلتان تضعان آخر تشيز كيك كنافة بالفستق على حسابيهما في الثانية نفسها. يأخذه طلب عائشة رقم 1452: ينزل العدد من 1 إلى 0، ويُضاف إلى سجل المخزون سطر «مبيع». وتُظهر صفحة الطلب لدى مريم «نفد» وتطلب منها تصحيح طلبها.",
    parts: { a: "هاتف عائشة", card: "شاشة المخزون", b: "هاتف مريم" },
    page: { shop: "مخبز قرفة", monogram: "ق", context: "الطلب" },
    item: { code: "109", name: "تشيز كيك الكنافة بالفستق", price: "85 ر.ق", left: "المتبقي اليوم 1 فقط" },
    bar: { account: "سجّله على حسابي", placing: "جارٍ إرسال طلبك…" },
    a: { placed: "تم استلام الطلب رقم 1452", onAccount: "تمت إضافته إلى حسابك." },
    b: { soldOut: "نفد", notice: "نفد تشيز كيك الكنافة بالفستق", fix: "صحّح الأصناف المعلّمة أعلاه للمتابعة." },
    stock: {
      path: "القائمة › المخزون",
      rule: "عدد في اليوم · 6",
      leftToday: "المتبقي اليوم",
      of: "من 6",
      soldOut: "نفد",
      log: "آخر التغييرات",
      rows: [
        { kind: "مبيع", delta: "−1", order: "الطلب رقم 1452", at: "16:05", balance: "الرصيد 0" },
        { kind: "مبيع", delta: "−2", order: "الطلب رقم 1451", at: "13:40", balance: "الرصيد 1" },
        { kind: "مبيع", delta: "−3", order: "الطلب رقم 1450", at: "10:12", balance: "الرصيد 3" },
      ],
    },
  },
  flow: {
    title: "ماذا يحدث حين يُباع صنف.",
    body:
      "يُنقص ALYR Shelf المخزون، ويضيف سطراً إلى سجل المخزون، ويحدّث صفحة الطلب.",
    tabsLabel: "الأمثلة",
    stepsLabel: "الخطوات",
    pause: "إيقاف",
    play: "تشغيل",
    customer: { name: "عميلك" },
    whatsapp: { name: "واتساب", sub: "منصة الأعمال" },
    alyr: { name: "ALYR Shelf", idle: "بانتظار البيع التالي" },
    team: { name: "فريقك", idle: "لا جديد بعد" },
    stories: [
      {
        id: "last",
        tab: "القطعة الأخيرة",
        steps: [
          {
            move: "team",
            title: "بقيت واحدة اليوم",
            body: "يحضّر مخبز قرفة 6 قوالب من تشيز كيك الكنافة كل يوم. بيعت خمسة منها، فتُظهر صفحة الطلب «المتبقي اليوم 1 فقط».",
            record: { id: "item", main: "تشيز كيك الكنافة بالفستق", sub: "عدد في اليوم: 6", trail: "المتبقي اليوم 1 فقط" },
          },
          {
            move: "in",
            title: "عميلتان تريدانه",
            body: "وضعته عائشة ومريم على حسابيهما في الثانية نفسها.",
            chat: { from: "event", text: "عائشة: سجّله على حسابي" },
            work: ["طلب من عائشة", "طلب من مريم"],
          },
          {
            title: "خطوة واحدة عند الطلب",
            body: "لا يأخذ ALYR Shelf الكمية إلا إذا بقي الرقم صفراً أو أكثر. طلب عائشة وصل أولاً، فأخذ القطعة الأخيرة.",
            work: ["المتبقي اليوم: 1 ← 0", "حُفظ الطلب رقم 1452"],
          },
          {
            move: "team",
            title: "يُضاف سطر إلى سجل المخزون",
            body: "يُضاف إلى سجل المخزون سطر «مبيع» برقم الطلب. لم يكتبه أحد، ولا يستطيع أحد تعديله.",
            record: { id: "log", main: "مبيع · الطلب رقم 1452", sub: "تشيز كيك الكنافة بالفستق", trail: "16:05" },
            work: ["سجل المخزون: مبيع −1"],
          },
          {
            move: "out",
            title: "تُبلَّغ العميلة الثانية",
            body: "تُظهر صفحة الطلب لمريم أنه نفد، قبل أن تُتمّ طلبها.",
            chat: { from: "event", text: "نفد تشيز كيك الكنافة بالفستق الآن." },
            work: ["صفحة الطلب: نفد"],
          },
          {
            move: "team",
            title: "يعود صباح الغد",
            body: "العدد اليومي يبدأ من جديد كل يوم، فيعود غداً إلى 6.",
            record: { id: "item", main: "تشيز كيك الكنافة بالفستق", sub: "عدد في اليوم: 6", trail: "نفد", tone: "quiet" },
            work: ["غداً: 6"],
          },
        ],
      },
      {
        id: "staff",
        tab: "هاتف الموظف",
        steps: [
          {
            move: "in",
            title: "رسالة من هاتف موظف",
            body: "رقم يوسف مسجّل ضمن أرقام الموظفين، فتستطيع رسائله تعديل الأصناف. ويكتب كما يتكلم.",
            chat: { from: "customer", text: "كيك الزعفران خلص" },
            work: ["رسالة موظف: يوسف"],
          },
          {
            title: "يجد صنفاً واحداً",
            body: "صنف واحد يطابق، فيغيّره ALYR Shelf. وحين تطابق عدة أصناف يسأل أيّها، ولا يغيّر شيئاً حتى يجيب.",
            work: ["الصنف: كيك الحليب بالزعفران، قطعة", "يطابق صنف واحد"],
          },
          {
            move: "out",
            title: "تم، مع زر تراجع",
            body: "يقول الرد ما تغيّر بالضبط.",
            chat: { from: "business", text: "تم: نفد «كيك الحليب بالزعفران، قطعة». لا يستطيع العملاء طلبه.", action: "تراجع" },
            work: ["أُرسل الرد"],
          },
          {
            move: "team",
            title: "صفحة الطلب تُظهر «نفد»",
            body: "يظهر الصنف باهتاً في صفحة الطلب، أو يُخفى منها، كما تختار.",
            record: { id: "item", main: "كيك الحليب بالزعفران، قطعة", sub: "صفحة الطلب", trail: "نفد", tone: "quiet" },
          },
          {
            move: "team",
            title: "يُظهر السجل من غيّر الصنف",
            body: "يقول السجل من غيّره، ومتى، ومن أي هاتف.",
            work: ["غيّره يوسف · 17:42"],
          },
          {
            move: "back",
            title: "تراجع مرة واحدة",
            body: "أرسلتها قبل أوانها؟ زر «تراجع» يعمل مرة واحدة، لمن أجرى التغيير.",
            chat: { from: "business", text: "تم التراجع: «كيك الحليب بالزعفران، قطعة» عاد للبيع." },
            record: { id: "item", main: "كيك الحليب بالزعفران، قطعة", sub: "صفحة الطلب", trail: "معروض للبيع", tone: "signal" },
          },
        ],
      },
      {
        id: "unpaid",
        tab: "طلب لم يُدفع",
        steps: [
          {
            move: "in",
            title: "طلب برابط دفع",
            body: "يطلب عمر قطعتي كرواسون ويختار الدفع برابط.",
            chat: { from: "event", text: "طلب قطعتين، 24 ر.ق" },
            work: ["الطلب رقم 1453", "الدفع برابط"],
          },
          {
            title: "تُحجز الكمية",
            body: "تُحجز قطعتاه 30 دقيقة، فلا يأخذهما غيره. ويستطيع المحل تغيير المدة.",
            work: ["محجوز: 2 · 30 دقيقة"],
          },
          {
            title: "مرّت 30 دقيقة دون دفع",
            body: "لم يُدفع المبلغ عبر الرابط في الوقت المحدد.",
            work: ["انتهى الحجز: لم يُدفع"],
          },
          {
            move: "team",
            title: "تعود الكمية تلقائياً",
            body: "يُلغى الطلب، ويعيد سطر «أُعيد للمخزون» القطعتين. والإلغاء يعيد الكمية مرة واحدة، لا مرتين.",
            record: { id: "log", main: "أُعيد للمخزون · الطلب رقم 1453", sub: "كرواسون بالزبدة", trail: "+2" },
          },
          {
            move: "out",
            title: "يُبلَّغ عمر بالسبب",
            body: "يعرف العميل السبب بلغته.",
            chat: { from: "business", text: "تم إلغاء الطلب رقم 1453 لأنه لم يُدفع خلال 30 دقيقة، وأُعيدت الأصناف." },
            work: ["أُبلغ العميل"],
          },
        ],
      },
    ],
  },
  screen: {
    title: "المخزون الآن، وكل تغيير عليه",
    label: "شاشة المخزون في مساحة عمل مخبز غير حقيقي",
    callouts: [
      "ما تبقّى الآن من كل صنف تعدّه.",
      "ما نفد وما قلّ مخزونه، بنقرة واحدة.",
      "استلام أو هالك أو جرد، مع السبب.",
      "كل تغيير، الأحدث أولاً: ماذا وكم ومن. ولا يُمحى شيء.",
    ],
    sheet: {
      path: "القائمة",
      tabs: ["الأصناف", "المخزون"],
      toolbar: ["الاستيراد والتصدير", "الخصومات", "التوصيل", "الميزات", "الإعدادات"],
      sub: "الأصناف التي تعدّها: ما على الرف الآن.",
      filters: ["نفدت", "مخزون قليل"],
      heads: { item: "الصنف", now: "في النظام" },
      acts: { received: "استلام", wasted: "هالك", count: "جرد" },
      rows: [
        { name: "كرواسون بالزبدة", now: "23", of: "من 40" },
        { name: "كيك الحليب بالزعفران، قطعة", now: "0", of: "من 24", state: "نفد", tone: "out" },
        { name: "تشيز كيك الكنافة بالفستق", now: "2", of: "من 6", state: "مخزون قليل", tone: "low" },
        { name: "معمول التمر", now: "3.75 كغ", on: true },
      ],
      log: {
        title: "آخر التغييرات",
        who: "معمول التمر",
        rows: [
          { kind: "مبيع", what: "الطلب رقم 1454", amount: "−0.5 كغ" },
          { kind: "استلام", what: "صُنع اليوم · بواسطة يوسف", amount: "+4 كغ" },
          { kind: "هالك", what: "مكسور · بواسطة يوسف", amount: "−0.25 كغ" },
          { kind: "جرد", what: "تم الجرد: لا فرق", amount: "0" },
        ],
      },
    },
    logCaption: "الشاشة نفسها وقد فُتح فيها صنف واحد: آخر تغييراته، الأحدث أولاً.",
  },
  inside: {
    title: "ما يتضمنه ALYR Shelf",
    groups: [
      {
        name: "لعملائك",
        items: [
          "الصور والأسعار والمقاسات والخيارات في صفحة طلب مصمّمة لهاتفهم، بلا تطبيق ولا حساب.",
          "كل صنف بالعربية والإنجليزية، ولا يُعرض صنف للبيع قبل أن يكون له اسم عربي.",
          "كلمات واضحة عن موعد الطلب: «متاح من الساعة 5 م»، «اطلب قبل الساعة 6 م ليكون جاهزاً غداً».",
          "«المتبقي 3 فقط» حين يقلّ المخزون، و«نفد» حين ينتهي.",
          "الطلب بكود الصنف في المحادثة («\u2066108 x2\u2069»)، أو بالاسم، أو بالرابط.",
          "البيع بالوزن أو الحجم، بكميات جاهزة: 0.25 و0.5 و1 كغ.",
        ],
      },
      {
        name: "لفريقك",
        items: [
          "حتى 8 صور لكل صنف، وإحداها غلاف.",
          "مقاسات وألوان، لكل منها مخزونه وسعره.",
          "خيارات وإضافات، إلزامية أو اختيارية.",
          "أربع طرق للإتاحة: متاح دائماً، أو تشغيل وإيقاف، أو محسوب في المخزون، أو عدد في اليوم.",
          "أوقات الطلب: مهلة التحضير، وآخر موعد، وأيام مستثناة.",
          "من هاتف الموظف: نفد، وعاد، والمخزون، والسعر، والتراجع، بالعربية أو الإنجليزية.",
          "صورة يكون تعليقها الاسم والسعر تصبح مسودة، إلى أن يعرضها المالك للبيع.",
          "الاستيراد من جدول بيانات (Excel أو CSV) بعناوين إنجليزية أو عربية، مع معاينة كل سطر قبل حفظ أي شيء، وتراجع واحد.",
          "سعر جملة لمجموعة من العملاء.",
          "رابط مشاركة ورموز QR لصفحة طلبك.",
          "حقولك الخاصة على الأصناف والمقاسات، حتى 20 حقلاً.",
          "يبدأ بحسب نوع نشاطك: المخبز يعدّ كل يوم ويقبل الطلب قبل يوم، والبقالة تعدّ المخزون وتُخفي ما نفد من الصفحة.",
        ],
      },
      {
        name: "في الخلفية",
        items: [
          "القطعة الأخيرة تُباع مرة واحدة: تؤخذ الكمية في خطوة واحدة عند الطلب.",
          "الطلب برابط دفع الذي لم يُدفع يعيد كميته بعد 30 دقيقة، ويُبلَّغ العميل.",
          "الطلب الملغى يعيد كميته مرة واحدة.",
          "سجل المخزون لا يزيد إلا سطوراً: استلام، ومبيع، وإعادة، وهالك، وجرد، وتصحيح، ولكل سطر صاحبه وسببه.",
          "الصنف الذي له طلبات يُؤرشف ولا يُحذف.",
          "تُفحص الصور، وتُزال منها بيانات الموقع والكاميرا، قبل أن يراها أحد.",
        ],
      },
      {
        name: "حين تفعّله",
        items: [
          "الخصومات ورموز القسائم.",
          "مناطق التوصيل برسومها، وبلا رسوم فوق مبلغ تحدده، وحدّ أدنى للطلب.",
          "سعر التكلفة والهامش، لا يراه إلا المالك والمشرف.",
        ],
      },
    ],
    note: "مع كل منتج من ALYR. كل ما في هذه القائمة مبنيّ في المنتج.",
  },
  who: {
    title: "كيف يبدأ كل نوع من الأنشطة",
    rows: [
      { name: "المخابز والمطابخ المنزلية", tags: ["عدد في اليوم", "اطلب قبل 6 م", "الصور"] },
      { name: "البقالات", tags: ["مخزون محسوب", "بالوزن", "يُخفى ما نفد"] },
      { name: "الأزياء والعبايات والهدايا", tags: ["مقاسات وألوان", "مخزون لكل مقاس"] },
      { name: "المطاعم والمقاهي", tags: ["القائمة", "خيارات وإضافات", "تشغيل وإيقاف"] },
      { name: "تجارة الجملة", tags: ["قائمة الأسعار", "أسعار الجملة", "استيراد من ملف"] },
    ],
    other: "إن كان نشاطك من نوع آخر، فاكتب لنا كيف تعمل اليوم.",
  },
  works: {
    title: "يعمل مع بقية منتجات ALYR.",
    link: "تعرّف على {name}",
    rows: {
      chat: "صفحة الطلب والمحادثة تبيعان من أصنافك: بالصورة أو بالاسم أو بالكود.",
      bookings: "تُحجز الخدمات في ALYR Bookings، وما تبيعه إلى جانبها في أصنافك، ويُطلب عبر ALYR Chat.",
      agent: "يأتي معه: ما نفد الآن وما قلّ مخزونه، على شاشتك الرئيسية.",
      accounts: "الطلب على الحساب الآجل يأخذ كميته فوراً.",
      docs: "كل بند في المستند صنف من أصنافك، باسمه العربي ومقاسه وخياراته.",
    },
  },
  faq: {
    title: "أسئلة",
    items: [
      { id: "pay", q: "هل أدفع مقابل ALYR Shelf؟", a: "يأتي مع ALYR، مع كل منتج.", offer: false },
      { id: "pay-offer", q: "هل أدفع مقابل ALYR Shelf؟", a: "هو مشمول مع ALYR، ولا يُسعَّر وحده.", offer: true },
      {
        id: "own",
        q: "هل أستطيع استخدامه وحده؟",
        a: "لا، فهو يأتي مع كل منتج من ALYR. يطلب منه عملاؤك عبر ALYR Chat، ومع ALYR Accounts يستطيع عملاؤك الدائمون تسجيل الطلب على حسابهم.",
      },
      {
        id: "setup",
        q: "كم يستغرق التجهيز؟",
        a: "نتفق معك خلال الزيارة على موعد البدء، ونضيف أصنافك وصورها وأسعارها معك، أو من ملفك.",
      },
      {
        id: "last-one",
        q: "وإن طلب عميلان القطعة الأخيرة؟",
        a: "يحصل عليها واحد فقط. تؤخذ الكمية في خطوة واحدة عند الطلب، فيعرف العميل الثاني أنها نفدت قبل أن يُتمّ طلبه.",
      },
      {
        id: "staff",
        q: "من يستطيع تعديل المخزون من واتساب؟",
        a: "أرقام الموظفين التي تسجّلها فقط. لكل تغيير زر «تراجع»، ويقول السجل من أجراه.",
      },
      {
        id: "weight",
        q: "أبيع بالكيلو.",
        a: "اجعل الصنف بالوزن، بالكيلوغرام أو بالغرام. تعرض صفحة الطلب كميات جاهزة، وتقبل المحادثة «\u2066131 x0.5\u2069».",
      },
    ],
  },
  cta: {
    title: "أخبرنا ماذا تبيع، وكيف تعدّ مخزونك اليوم.",
    body: "أرسل لنا رسالة. يردّ عليك شخص من ALYR، ثم يزورك ليضيف معك أصنافك ومخزونك.",
  },
};
