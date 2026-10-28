// The homepage hero's film (D-062, HeroFilm.tsx): every word its canvas says, in English and
// Arabic. A copy file of its own, as copyShelf.ts and copyDocs.ts are, because the canvas is drawn
// in the browser after load (FilmCanvas.tsx): it imports these words in its own chunk, so they
// never ride in the page's HTML. copy.ts imports them too, for the hero and for the checks.
// The Arabic is a draft until the native review (ALY-66).

/**
 * The homepage hero's film (D-062, the founder's choice of 28 Oct 2026): one afternoon at Qirfa
 * Bakery, Thursday 15:58 to 16:20, in the product's own screens and words (filmScript.ts holds
 * the timing). The screens' words come from the product: `Screens.tsx` (the Orders screen),
 * `orders/service.py` (the order messages), `bookings/service.py` (the booking messages),
 * `ledger` (the balance line), the products frame and the Shelf page. Names are a first name
 * and an initial. Every message is one the product sends; nothing is paid by link and no
 * document is sent (ALYR Docs is off for every shop).
 */
export type HeroFilmWords = {
  /** The figure's name for screen readers, and its first line: what it is, before any number. */
  label: string;
  about: string;
  day: string;
  lanes: { orders: string; bookings: string; money: string };
  /** What each lane does in the shot that shows all three. */
  tags: { ready: string; done: string; maha: string; flag: string };
  /** Each caption's words (`→` is the line icon, which mirrors). Arabic arrives as one block. */
  cap: { lanes: string[]; reminder: string[]; stock: string[]; confirm: string[]; page: string[]; order: string[]; week: string[] };
  inbox: { title: string; aside: string; days: { mon: string; tue: string; sun: string } };
  /** The customers, by conversation (filmScript.ts `CONVS`), and each one's messages in order. */
  people: Record<"sara" | "omar" | "maha" | "lina" | "noor" | "aisha" | "rania" | "mariam" | "tariq" | "meera", string>;
  says: Record<"sara" | "omar" | "maha" | "lina" | "noor" | "aisha" | "rania" | "mariam" | "tariq", string[]>;
  chat: {
    today: string;
    /** Sara's chat: last Monday's message (her `says` has the rest). */
    old: string;
    noorBooked: string; thanks: string;
    /** The line under Lina's order: it went on her credit account. */
    account: string;
  };
  orders: {
    title: string; aside: string; head: [string, string, string, string];
    st: { new: string; confirmed: string; ready: string; done: string };
    next: { new: string; confirmed: string; ready: string };
    pay: { unpaid: string; account: string };
    rows: Record<"1442" | "1441" | "1440" | "1439" | "1438" | "1437" | "1436", { items: string; total: string }>;
  };
  stock: { sold: string; rows: { delta: string; order: string; at: string; balance: string }[] };
  book: { time2: string; who2: string };
  owed: { before: { total: string; customers: string; first: string } };
};


export const filmEn: HeroFilmWords = {
  label: "Sample film of an afternoon at a fictional bakery in ALYR, ending on the ALYR Agent home screen",
  about:
    "Sample film of a fictional bakery, Qirfa Bakery, on a Thursday afternoon: orders, bookings and credit accounts in ALYR at once, ending on the ALYR Agent home screen. The names and numbers are made up; they are not ALYR’s results.",
  day: "Thursday",
  lanes: { orders: "Orders", bookings: "Bookings", money: "Money" },
  tags: { ready: "#1440 · Ready", done: "#1440 · Done", maha: "6:30 pm · Booked", flag: "Needs a look" },
  cap: {
    lanes: ["Three lanes", "·", "at once"],
    reminder: ["Reminder sent", "·", "2 h before"],
    stock: ["Stock 1", "→", "0", "·", "Sold out"],
    confirm: ["#1441", "·", "Confirmed by Yusuf"],
    page: ["Order page sent", "·", "at once"],
    order: ["Order #1442", "·", "7 items, QAR 98"],
    week: ["Week so far"],
  },
  inbox: { title: "Inbox", aside: "All conversations", days: { mon: "Mon", tue: "Tue", sun: "Sun" } },
  people: {
    sara: "Sara M.", omar: "Omar A.", maha: "Maha J.", lina: "Lina F.", noor: "Noor A.",
    aisha: "Aisha I.", rania: "Rania H.", mariam: "Mariam S.", tariq: "Tariq Z.", meera: "Meera V.",
  },
  says: {
    sara: ["Order #1409 is complete. Thank you.", "Hi, I’d like to order for pickup", "Here is our order page. Pick what you need.", "Order #1442 received: 7 items, QAR 98."],
    omar: ["Order #1440 is confirmed.", "Order #1440 is ready for collection.", "Order #1440 is complete. Thank you."],
    maha: ["Thank you!", "Booking 113 confirmed at Qirfa Bakery: Cake tasting, Thu 15 Oct, 6:30 PM. To cancel, send “my booking”."],
    lina: ["Thank you!", "Order #1441 received: 2 items, QAR 97.", "Order #1441 is confirmed."],
    noor: ["Thank you!", "Reminder: booking 112 at Qirfa Bakery, Thu 15 Oct, 6:00 PM."],
    aisha: ["Order #1436 is ready for collection.", "Is my order ready?"],
    rania: ["Order #1439 received: 3 items, QAR 46."],
    mariam: ["Order #1438 received: 4 items, QAR 112."],
    tariq: ["Can I order a birthday cake for Saturday?"],
  },
  chat: {
    today: "Today",
    old: "Order #1409 is complete. Thank you.",
    noorBooked: "Booking 112 confirmed at Qirfa Bakery: Cake tasting, Thu 15 Oct, 6:00 PM. To cancel, send “my booking”.",
    thanks: "Thank you!",
    account: "Put on your account. Your balance is now QAR 97.",
  },
  orders: {
    title: "Orders",
    aside: "Placed through the order link",
    head: ["Order", "Items", "Payment", "Status"],
    st: { new: "New", confirmed: "Confirmed", ready: "Ready", done: "Done" },
    next: { new: "Confirm", confirmed: "Mark ready", ready: "Mark done" },
    pay: { unpaid: "Not paid", account: "On account" },
    rows: {
      "1442": { items: "7 items", total: "QAR 98" },
      "1441": { items: "2 items", total: "QAR 97" },
      "1440": { items: "3 items", total: "QAR 64" },
      "1439": { items: "3 items", total: "QAR 46" },
      "1438": { items: "4 items", total: "QAR 112" },
      "1437": { items: "3 items", total: "QAR 255" },
      "1436": { items: "2 items", total: "QAR 58" },
    },
  },
  stock: {
    sold: "Sold",
    rows: [
      { delta: "−1", order: "Order #1441", at: "16:09", balance: "balance 0" },
      { delta: "−3", order: "Order #1437", at: "13:40", balance: "balance 1" },
      { delta: "−2", order: "Order #1434", at: "10:12", balance: "balance 4" },
    ],
  },
  book: { time2: "6:30 pm", who2: "Maha J." },
  owed: { before: { total: "QAR 12,878", customers: "4 customers", first: "QAR 6,581" } },
};

export const filmAr: HeroFilmWords = {
  label: "فيلم توضيحي لعصر يوم في مخبز غير حقيقي على ALYR، ينتهي بالشاشة الرئيسية لـ ALYR Agent",
  about:
    "فيلم توضيحي لمخبز غير حقيقي، مخبز قرفة، في عصر يوم خميس: الطلبات والحجوزات والحسابات الآجلة على ALYR في وقت واحد، وينتهي بالشاشة الرئيسية لـ ALYR Agent. الأسماء والأرقام للتوضيح، وليست نتائج حققتها ALYR.",
  day: "الخميس",
  lanes: { orders: "الطلبات", bookings: "الحجوزات", money: "المال" },
  tags: { ready: "#1440 · جاهز", done: "#1440 · منجز", maha: "6:30 م · محجوز", flag: "يحتاج نظرة" },
  cap: {
    lanes: ["ثلاثة مسارات", "·", "في وقت واحد"],
    reminder: ["أُرسل التذكير", "·", "قبل الموعد بساعتين"],
    stock: ["المخزون 1", "→", "0", "·", "نفد"],
    confirm: ["الطلب رقم 1441", "·", "أكّده يوسف"],
    page: ["أُرسلت صفحة الطلب", "·", "فوراً"],
    order: ["الطلب رقم 1442", "·", "7 أصناف، 98 ر.ق"],
    week: ["الأسبوع حتى الآن"],
  },
  inbox: { title: "المحادثات", aside: "كل المحادثات", days: { mon: "الاثنين", tue: "الثلاثاء", sun: "الأحد" } },
  people: {
    sara: "سارة م.", omar: "عمر ع.", maha: "مها ج.", lina: "لينا ف.", noor: "نور أ.",
    aisha: "عائشة إ.", rania: "رانيا ح.", mariam: "مريم س.", tariq: "طارق ز.", meera: "ميرا ف.",
  },
  says: {
    sara: ["تم إنجاز الطلب رقم 1409. شكراً لك.", "السلام عليكم، أبي أطلب للاستلام", "حيّاك، اختاري طلبك من هنا.", "تم استلام الطلب رقم 1442: 7 أصناف، 98 ر.ق."],
    omar: ["تم تأكيد الطلب رقم 1440.", "الطلب رقم 1440 جاهز للاستلام.", "تم إنجاز الطلب رقم 1440. شكراً لك."],
    maha: ["شكراً!", "تم تأكيد حجزك رقم 113 لدى مخبز قرفة: تذوّق الكيك، 15/10 18:30. للإلغاء أرسل «حجزي»."],
    lina: ["شكراً!", "تم استلام الطلب رقم 1441: صنفان، 97 ر.ق.", "تم تأكيد الطلب رقم 1441."],
    noor: ["شكراً!", "تذكير: حجزك رقم 112 لدى مخبز قرفة، 15/10 18:00."],
    aisha: ["الطلب رقم 1436 جاهز للاستلام.", "طلبي جاهز؟"],
    rania: ["تم استلام الطلب رقم 1439: 3 أصناف، 46 ر.ق."],
    mariam: ["تم استلام الطلب رقم 1438: 4 أصناف، 112 ر.ق."],
    tariq: ["أقدر أطلب كيكة عيد ميلاد ليوم السبت؟"],
  },
  chat: {
    today: "اليوم",
    old: "تم إنجاز الطلب رقم 1409. شكراً لك.",
    noorBooked: "تم تأكيد حجزك رقم 112 لدى مخبز قرفة: تذوّق الكيك، 15/10 18:00. للإلغاء أرسل «حجزي».",
    thanks: "شكراً!",
    account: "تم تسجيله على حسابك. رصيدك الآن 97 ر.ق.",
  },
  orders: {
    title: "الطلبات",
    aside: "الطلبات الواردة من رابط الطلب",
    head: ["الطلب", "الأصناف", "الدفع", "الحالة"],
    st: { new: "جديد", confirmed: "مؤكد", ready: "جاهز", done: "منجز" },
    next: { new: "تأكيد", confirmed: "جاهز للاستلام", ready: "تم الإنجاز" },
    pay: { unpaid: "غير مدفوع", account: "على الحساب" },
    rows: {
      "1442": { items: "7 أصناف", total: "98 ر.ق" },
      "1441": { items: "صنفان", total: "97 ر.ق" },
      "1440": { items: "3 أصناف", total: "64 ر.ق" },
      "1439": { items: "3 أصناف", total: "46 ر.ق" },
      "1438": { items: "4 أصناف", total: "112 ر.ق" },
      "1437": { items: "3 أصناف", total: "255 ر.ق" },
      "1436": { items: "صنفان", total: "58 ر.ق" },
    },
  },
  stock: {
    sold: "مبيع",
    rows: [
      { delta: "−1", order: "الطلب رقم 1441", at: "16:09", balance: "الرصيد 0" },
      { delta: "−3", order: "الطلب رقم 1437", at: "13:40", balance: "الرصيد 1" },
      { delta: "−2", order: "الطلب رقم 1434", at: "10:12", balance: "الرصيد 4" },
    ],
  },
  book: { time2: "6:30 م", who2: "مها ج." },
  owed: { before: { total: "12,878 ر.ق", customers: "4 عملاء", first: "6,581 ر.ق" } },
};
