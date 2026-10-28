// Every word of the bakery sales demo (ALY-263, docs/sales/demo-bakery.md), in English and
// Arabic. Components hold no text. The Arabic is a draft until the native review (ALY-66);
// the customers' messages are in Gulf Arabic on purpose (their own voice), everything else
// is Modern Standard Arabic. Money is written by `qar()` in logic.ts and set inside <bdi>.
// The "says" lines are the founder's presenter notes, shown only when he presses N.

import type { Pain } from "./logic";

type Fn<A extends unknown[] = [string]> = (...args: A) => string;

export type Words = {
  title: string;
  draft: string;
  fallback: { en: string; ar: string };
  ui: {
    next: string; back: string; scenes: string; notes: string; restart: string;
    lang: string; langName: string; dark: string; light: string; close: string;
    progress: Fn<[number, number]>; menuTitle: string; setup: string; jump: Fn<[number]>;
    keys: [string, string][]; stage: string; notesTitle: string; target: string; elapsed: string;
  };
  labels: { built: string; setup: string; sample: string; week: string; estimate: string; notBuilt: string };
  scenes: string[];
  says: string[][];
  setup: {
    eyebrow: string; title: string; lead: string; name: string; nameHint: string; nameAr: string;
    colour: string; colours: Record<string, string>; line: string; lineHint: string; start: string;
    preview: string; keysTitle: string;
  };
  bakery: { day: string; clock: string; unread: string; previews: [string, string, string][]; list: string };
  money: {
    title: string; inputs: { daily: string; after: string; average: string };
    fewer: Fn; more: Fn; month: [string, string]; how: string; hide: string;
    terms: { after: string; days: string; share: string; average: string; month: string };
    share: string; painsTitle: string; tapped: Fn<[number]>; none: string;
    pains: Record<Pain, string>;
  };
  order: {
    lines: string[]; times: string[]; customer: string; customer2: string; customer3: string;
    account: string; ask: string; reply: string; link: string; page: string; item: string; itemNote: string;
    size: string; sizes: [string, number][]; flavour: string; flavours: string[];
    message: string; messages: string[]; day: string; days: string[]; full: string; nextFree: string;
    pay: Fn; payTitle: string; payFor: Fn<[number]>; card: string; payNow: Fn; paid: string; paidFor: Fn<[string, number]>;
    received: Fn<[string, number]>; ask2: string; ask3: string; yourTurn: string; tapHint: string;
    cardsLive: string; window: Fn; orders: string; cols: [string, string, string, string];
    rows: { n: number; who: string; what: string; day: string; pay: string; state: string }[];
    newState: string; paidState: string; forDay: Fn; limitTitle: string; limitDay: string;
    ofLimit: Fn<[number, number]>; fullLine: string; list: string; listNote: string;
    listRows: [string, number][]; noorLine: string; fromChat: string; listCake: string;
    builtLine: string; sat: string;
  };
  pains: {
    before: string; after: string; payUrl: string; orderUrl: string; shown: Fn<[number]>; jump: Fn<[number]>; condition: string;
    cards: Record<Pain | "invoice", { head: string; quote?: string }>;
    ready: { message: string; time: string; track: string[]; page: string };
    pistachio: { item: string; sold: string; tell: string; told: string; morning: string; back: Fn<[string]> };
    cafe: { name: string; owed: string; oldest: string; send: string; sent: string; reminder: Fn<[string]>; group: string; theirs: string; yours: string; maamoul: string; head2: string };
    delivery: { app: string; own: string; order: string; fee: string; kept: string };
    twenty: string; midnight: string; eid: string; transfer: string; best: string; bestFact: string; google: string;
    invoice: { title: string; number: string; to: string; lines: [string, string, number][]; total: string; tax: string };
  };
  system: {
    title: string; order: string; nodes: { name: string; what: string; did: string }[];
    end: string; before: string; islands: string[]; after: string; afterRows: [string, string][];
    grows: string; growRows: [string, "built" | "setup" | "notBuilt"][];
  };
  found: {
    head: string[]; search: string; kind: string; open: string; order: string; directions: string; call: string;
    others: string[]; thanks: Fn; review: string; reviewer: string; reviewText: string; reviewWhen: string;
    qr: string; qrNote: string; bio: string; bioLink: string; handle: string; stars: string;
  };
  sunday: { head: string[]; from: string; when: string; condition: string; shop: string; suggestions: string };
  how: { title: string; steps: string[]; objections: [string, string][]; objTitle: string };
  next: { title: string; scan: string; noLine: string; book: string; pick: string; booked: Fn; start: string; kept: string; none: string };
};

const en: Words = {
  title: "The Thursday before Eid",
  draft: "",
  fallback: { en: "Qirfa Bakery", ar: "مخبز قرفة" },
  ui: {
    next: "Next", back: "Back", scenes: "Scenes", notes: "Notes", restart: "Restart",
    lang: "العربية", langName: "Show in Arabic", dark: "Dark", light: "Light", close: "Close",
    progress: (n, of) => `Scene ${n} of ${of}`, menuTitle: "Jump to a scene", setup: "Setup",
    jump: (n) => `Go to scene ${n}`,
    keys: [["→ ↓ Space · Page Down", "Next"], ["← ↑ · Page Up", "Back"], ["M", "Scenes"], ["N", "Notes"], ["L", "Language"], ["D", "Dark or light"], ["R", "Restart"]],
    stage: "The demo", notesTitle: "What you say", target: "Target", elapsed: "Since scene 1",
  },
  labels: { built: "Built", setup: "Set up by ALYR", sample: "Sample", week: "Sample week", estimate: "Your estimate", notBuilt: "Not built yet" },
  scenes: [
    "Setup", "Their bakery", "Where the money goes", "The order that would have been lost", "Your pains, solved",
    "One order, the whole business", "Be found", "Your Sunday", "How we work", "Next step",
  ],
  says: [
    ["Type the bakery's name as the owner writes it, and pick the colour of their sign."],
    ["I'm not going to show you an app. I'm going to show you your Thursday night, and then the same night with us."],
    ["Three numbers. Yours, not ours.", "Tap the ones that happened to you this month. Good. We'll spend the next ten minutes on exactly those."],
    [
      "You were asleep. The order was taken, paid, and it's on tomorrow's list. You didn't type a word.",
      "That's the Eid problem, solved before it starts. You set the number once. ALYR says no for you, politely, and offers the next day.",
    ],
    ["Only the ones you tapped, in your order."],
    ["This isn't six apps. It's one system: every order updates your stock, your receipts, your accounts and your numbers at once. You run the bakery, it keeps the books straight."],
    ["Every happy customer becomes the reason the next one finds you. We set up your Google profile, and the review request goes after every pickup."],
    ["One message on Sunday tells you how the week went. No spreadsheet, no guessing."],
    ["You don't learn software. We bring it, set it up, and stay."],
    ["Scan this. That's your bakery answering, right now. Let's book the day we set it up."],
  ],
  setup: {
    eyebrow: "Before the owner sees it", title: "Whose bakery is this?", lead: "Their name and the colour of their sign go on every screen: the cake order, the Google profile, the Sunday report.",
    name: "Bakery name", nameHint: "As the owner writes it.", nameAr: "Name in Arabic (optional)",
    colour: "The shop's colour", colours: { cocoa: "Cocoa", terracotta: "Terracotta", rose: "Rose", saffron: "Saffron", teal: "Teal", plum: "Plum" },
    line: "Test line link (optional)", lineHint: "A wa.me link to the test number. Without one, the last screen shows no code.",
    start: "Start the demo", preview: "On their order page", keysTitle: "Keys",
  },
  bakery: {
    day: "Thursday before Eid.", clock: "11:47 pm", unread: "14 unread chats.", list: "Their chats tonight",
    previews: [
      ["Fatima", "Salam, birthday cake for Thursday?", "11:46 pm"],
      ["Hessa", "Is my order ready?", "11:41 pm"],
      ["Ahmed", "Voice message · 0:14", "11:38 pm"],
      ["Maryam", "Do you still have the pistachio box?", "11:30 pm"],
      ["Noura", "Photo", "11:22 pm"],
      ["Sara", "How much for 3 trays of maamoul?", "11:15 pm"],
      ["Abdulla", "I sent the transfer, please check", "11:02 pm"],
      ["Latifa", "Do you deliver to Al Waab?", "10:58 pm"],
      ["Jassim", "Hello??", "10:51 pm"],
      ["Reem", "Eid order for the office, 40 boxes", "10:44 pm"],
      ["Mona", "Voice message · 0:41", "10:39 pm"],
      ["Khalifa", "Open tomorrow at 7?", "10:31 pm"],
      ["Dana", "Same as last time, please", "10:20 pm"],
      ["Huda", "Can I pick up before Maghrib?", "10:12 pm"],
    ],
  },
  money: {
    title: "Three numbers. Yours, not ours.",
    inputs: { daily: "Messages a day", after: "Of those, after closing", average: "Average order" },
    fewer: (what) => `Fewer: ${what}`, more: (what) => `More: ${what}`,
    month: ["About ", " a month you never saw."], how: "How we worked it out", hide: "Hide the working",
    terms: { after: "after-hours messages a day", days: "days", share: "would have ordered", average: "average order", month: "a month" },
    share: "We keep this share low on purpose. Change it if yours is higher.",
    painsTitle: "Tap the ones that happened this month.", tapped: (n) => `Tapped: ${n}`, none: "Nothing tapped yet",
    pains: {
      midnight: "Someone ordered at midnight. I saw it at 9.",
      twenty: "Twenty messages for one birthday cake.",
      eid: "I said yes to too many orders for Eid.",
      transfer: "I'm still checking transfer screenshots.",
      ready: "“Is it ready?” all day.",
      pistachio: "“Is the pistachio box still there?”",
      delivery: "The delivery app took 25%.",
      cafe: "The café pays me “next week” every week.",
      best: "I don't know what sold best.",
      google: "Nobody finds me on Google.",
    },
  },
  order: {
    lines: [
      "11:52 pm. Everyone's asleep.",
      "The reply comes straight back.",
      "She builds the cake herself.",
      "A pay link. Paid.",
      "It's on Thursday's list. You didn't type a word.",
      "12:20 am. The twelfth cake goes.",
      "Full for Thursday. Next free: Saturday.",
    ],
    times: ["11:52 pm", "11:52 pm", "11:53 pm", "11:54 pm", "11:54 pm", "12:20 am", "7:05 am"],
    customer: "Mariam Saleh", customer2: "Aisha Hamad", customer3: "Khalid Nasser", account: "Business account",
    ask: "Salam, do you have a cake for tomorrow? Birthday, chocolate, name on it: Noor 7",
    reply: "Here is our order page. Pick what you need:", link: "Open the order page", page: "Order",
    item: "Chocolate celebration cake", itemNote: "Dark chocolate sponge with a message in icing.",
    size: "Size", sizes: [["1 kg", 160], ["2 kg", 280]],
    flavour: "Filling", flavours: ["Dark chocolate", "Chocolate and pistachio", "Chocolate and caramel"],
    message: "Message on the cake", messages: ["Happy birthday", "Congratulations", "Eid Mubarak", "No message"],
    day: "Pickup day", days: ["Tomorrow · Thu", "Fri", "Sat"], full: "Full", nextFree: "Order ahead: next available Sat",
    pay: (amount) => `Pay ${amount}`, payTitle: "Payment", payFor: (n) => `Order #${n}`, card: "Card number",
    payNow: (amount) => `Pay ${amount}`, paid: "Paid", paidFor: (amount, n) => `${amount} · Order #${n}`,
    received: (amount, n) => `We received ${amount} for order ${n}. Thank you.`,
    ask2: "Chocolate cake for Thursday please, 1 kg", ask3: "Salam, a chocolate cake for Thursday?",
    yourTurn: "Your turn. Tap the size, the filling, the message and the day.", tapHint: "On the phone",
    cardsLive: "Card payments go live with your own payment provider.",
    window: (shop) => `${shop} · Orders`, orders: "Orders", cols: ["Order", "Customer", "For", "Status"],
    rows: [
      { n: 1042, who: "Tamr Café", what: "Date maamoul ×6", day: "Thu", pay: "On account", state: "Confirmed" },
      { n: 1041, who: "Omar Ali", what: "Saffron milk cake", day: "Thu", pay: "Paid", state: "Confirmed" },
    ],
    newState: "New", paidState: "Paid", forDay: (day) => day,
    limitTitle: "Chocolate celebration cake", limitDay: "Thursday · a number each day",
    ofLimit: (n, of) => `${n} of ${of} ordered`, fullLine: "Full for Thursday. Next free: Saturday.",
    list: "Thursday's list", listNote: "What to make, from Thursday's orders",
    listRows: [["Saffron milk cake", 6], ["Date maamoul, box of 12", 9], ["Basbousa tray", 4]],
    listCake: "Chocolate celebration cake", noorLine: "1 kg · Dark chocolate · Happy birthday", fromChat: "“Noor 7”, from the chat",
    builtLine: "The reply, the order page, sizes, choices, the pickup day and the number each day.", sat: "Sat",
  },
  pains: {
    before: "This month", after: "With ALYR", payUrl: "alyr.qa/pay/…", orderUrl: "alyr.qa/s/…", shown: (n) => `Shown in scene ${n}`, jump: (n) => `Go to scene ${n}`,
    condition: "Outside the 24-hour window this message goes once WhatsApp approves its wording.",
    cards: {
      ready: { head: "They stop asking because they already know." },
      pistachio: { head: "You restock, they come back." },
      cafe: { head: "You don't chase. One press sends it." },
      delivery: { head: "Your regulars don't need an app between you." },
      twenty: { head: "One page instead of twenty messages." },
      midnight: { head: "Taken at 11:52 pm, paid, on Thursday's list." },
      eid: { head: "You set the number once." },
      transfer: { head: "Paid shows as Paid. No screenshot to check." },
      best: { head: "Sunday tells you." },
      google: { head: "Found on Google, ordered on your page." },
      invoice: { head: "That's a corporate client you can now say yes to.", quote: "“The office wants an invoice.”" },
    },
    ready: { message: "Order #1043 is ready for collection.", time: "3:40 pm", track: ["Placed", "Confirmed", "Ready for collection", "Complete"], page: "Order #1043" },
    pistachio: {
      item: "Pistachio box", sold: "Sold out", tell: "Tell me when it is back", told: "We'll tell you once when it is back.",
      morning: "Friday · 9:00 am",
      back: (shop) => `Good news from ${shop}: Pistachio box is back in stock, as you asked. You can order here:`,
    },
    cafe: {
      name: "Tamr Café", owed: "Owed", oldest: "Oldest unpaid: 64 days", send: "Send reminder", sent: "Reminder sent",
      reminder: (shop) => `Reminder from ${shop}: QAR 1,840 is now overdue. Your oldest unpaid purchase was 64 days ago. Pay here:`,
      group: "Price group: Cafés", theirs: "Tamr Café sees", yours: "Your customers see", maamoul: "Date maamoul, box of 12",
      head2: "Your cafés see their price, your customers see theirs.",
    },
    delivery: { app: "Through the delivery app", own: "Through your own link", order: "The same order", fee: "To the app", kept: "Kept" },
    twenty: "Size, filling, message, day: chosen on one page.",
    midnight: "Mariam's order at 11:52 pm, paid before midnight.",
    eid: "12 of 12 for Thursday. The next customer is offered Saturday.",
    transfer: "The pay link marks the order Paid.",
    best: "Most ordered last week", bestFact: "Butter croissant · 54",
    google: "Your profile, with an Order button that opens your page.",
    invoice: {
      title: "Invoice · فاتورة", number: "INV-0012", to: "Crescent Tower Offices",
      lines: [["Date maamoul, box of 12", "معمول بالتمر، علبة 12", 40]], total: "Total · الإجمالي", tax: "",
    },
  },
  system: {
    title: "One order, the whole business.", order: "Order #1043",
    nodes: [
      { name: "ALYR Chat", what: "Orders and the team inbox", did: "The order page, Paid, the tracking page, one inbox for the team." },
      { name: "ALYR Bookings", what: "Bookings and reminders", did: "A cake tasting on Saturday at 11:00, with a reminder at 9:00." },
      { name: "ALYR Agent", what: "Your business in numbers", did: "Counted in today's numbers and in Sunday's report." },
      { name: "ALYR Accounts", what: "Credit accounts", did: "If it's Tamr Café: on their account, at their price." },
      { name: "ALYR Shelf", what: "Items and stock", did: "Thursday's chocolate cakes: 11 of 12." },
      { name: "ALYR Docs", what: "Receipts and invoices", did: "Receipt RC-0043, numbered and kept." },
    ],
    end: "Every order updates your stock, receipts, accounts and numbers at once.",
    before: "Before: seven places, nothing joined",
    islands: ["Orders notebook", "WhatsApp chats", "Instagram messages", "Bank app screenshots", "Excel sheet", "Delivery app", "Calculator"],
    after: "After: one workspace",
    afterRows: [
      ["One customer record", "Mariam Saleh · 6 orders · last: chocolate cake, Thu"],
      ["One set of numbers", "Today: 23 orders · QAR 3,240"],
      ["One inbox for the team", "Every chat, with who is answering it"],
      ["Each person their own sign-in", "Owner · Kitchen · Counter"],
    ],
    grows: "It grows with you.",
    growRows: [
      ["Staff roles: who sees what", "built"],
      ["More products, switched on when you need them", "built"],
      ["Every month we sit with your numbers", "setup"],
      ["A second branch under the same account", "notBuilt"],
    ],
  },
  found: {
    head: [
      "“Cake shop near me.” There you are.",
      "After the pickup, one message.",
      "And the next customer reads it.",
      "On the counter, and in your bio.",
    ],
    search: "cake shop near me", kind: "Bakery · Open until 11 pm", open: "Open", order: "Order", directions: "Directions", call: "Call",
    others: ["Bakery", "Café", "Sweets"],
    thanks: () => "Thank you, Noor's mum. A 10-second review helps us a lot:",
    review: "Review", reviewer: "Mariam S.", reviewText: "The cake was exactly what we asked for. Noor loved it.", reviewWhen: "Thursday",
    qr: "Order here", qrNote: "Scan to order", bio: "Link in bio", bioLink: "alyr.qa/s/your-bakery", handle: "@yourbakery", stars: "5 stars",
  },
  sunday: {
    head: ["Sunday, 9:00 am. One message: how the week went.", "Then the home screen: what needs you today, and why."],
    from: "ALYR", when: "Sun 9:00 am",
    condition: "The first reports go out once WhatsApp approves the report's wording.", shop: "Weekly report", suggestions: "Suggestions",
  },
  how: {
    title: "How we work",
    steps: ["We come to your shop.", "We set it up with you.", "You go live.", "Every month we sit with your numbers."],
    objTitle: "What owners ask",
    objections: [
      ["I already have WhatsApp Business.", "Works on WhatsApp, the app your customers already use."],
      ["Is my data safe?", "Your customers are yours. Our staff never read your chats."],
      ["What if I want to stop?", "Month to month, 7 days' notice."],
      ["I'm not technical.", "Good. You don't need to be."],
    ],
  },
  next: {
    title: "Let's do your Thursday properly.", scan: "Scan it: our test line answers now.", noLine: "",
    book: "Book your check-up", pick: "Which day suits you?", booked: (day) => `Check-up: ${day}`,
    start: "We start with", kept: "Kept on this screen only.", none: "Everything we saw today",
  },
};

const ar: Words = {
  title: "الخميس الذي يسبق العيد",
  draft: "مسودة عربية بانتظار المراجعة",
  fallback: { en: "Qirfa Bakery", ar: "مخبز قرفة" },
  ui: {
    next: "التالي", back: "السابق", scenes: "المشاهد", notes: "الملاحظات", restart: "من البداية",
    lang: "English", langName: "اعرض بالإنجليزية", dark: "داكن", light: "فاتح", close: "إغلاق",
    progress: (n, of) => `المشهد ${n} من ${of}`, menuTitle: "انتقل إلى مشهد", setup: "التجهيز",
    jump: (n) => `انتقل إلى المشهد ${n}`,
    keys: [["→ ↓ مسافة · Page Down", "التالي"], ["← ↑ · Page Up", "السابق"], ["M", "المشاهد"], ["N", "الملاحظات"], ["L", "اللغة"], ["D", "داكن أو فاتح"], ["R", "من البداية"]],
    stage: "العرض", notesTitle: "ما تقوله", target: "الموعد", elapsed: "منذ المشهد 1",
  },
  labels: { built: "مبنيّ", setup: "تجهّزه ALYR", sample: "مثال", week: "أسبوع توضيحي", estimate: "تقديرك", notBuilt: "لم يُبنَ بعد" },
  scenes: [
    "التجهيز", "مخبزك", "أين يذهب المال", "الطلب الذي كاد يضيع", "مشكلاتك، محلولة",
    "طلب واحد، والنشاط كله", "أن يجدك الناس", "يوم الأحد عندك", "كيف نعمل", "الخطوة التالية",
  ],
  says: [
    ["اكتب اسم المخبز كما يكتبه صاحبه، واختر لون لافتته."],
    ["لن أعرض عليك تطبيقاً. سأعرض عليك ليلة الخميس عندك، ثم الليلة نفسها معنا."],
    ["ثلاثة أرقام. أرقامك أنت، لا أرقامنا.", "المس ما حدث معك هذا الشهر. ممتاز. سنقضي الدقائق العشر القادمة على هذه بالذات."],
    [
      "كنت نائماً. أُخذ الطلب ودُفع، وهو على قائمة الغد. ولم تكتب حرفاً.",
      "هذه مشكلة العيد، محلولة قبل أن تبدأ. تحدد العدد مرة واحدة، فتعتذر ALYR عنك بلطف وتعرض اليوم التالي.",
    ],
    ["ما اخترته فقط، وبترتيبك."],
    ["هذه ليست ستة تطبيقات. إنها نظام واحد: كل طلب يحدّث مخزونك وإيصالاتك وحساباتك وأرقامك في الوقت نفسه. أنت تدير المخبز، وهو يُبقي الحسابات مضبوطة."],
    ["كل عميل راضٍ يصبح سبباً في أن يجدك العميل التالي. نجهّز لك ملفك على Google، ويُرسل طلب التقييم بعد كل استلام."],
    ["رسالة واحدة يوم الأحد تخبرك كيف مضى الأسبوع. بلا جداول، وبلا تخمين."],
    ["لن تتعلم برنامجاً. نحن نحضره، ونجهّزه، ونبقى معك."],
    ["امسح هذا الرمز. هذا مخبزك يرد الآن. لنحدد اليوم الذي نجهّزه فيه."],
  ],
  setup: {
    eyebrow: "قبل أن يراه صاحب المحل", title: "مخبز من هذا؟", lead: "يظهر الاسم ولون اللافتة في كل شاشة: طلب الكيكة، وملف Google، وتقرير الأحد.",
    name: "اسم المخبز", nameHint: "كما يكتبه صاحبه.", nameAr: "الاسم بالعربية (اختياري)",
    colour: "لون المحل", colours: { cocoa: "كاكاو", terracotta: "طيني", rose: "وردي", saffron: "زعفراني", teal: "فيروزي", plum: "برقوقي" },
    line: "رابط خط التجربة (اختياري)", lineHint: "رابط wa.me لرقم التجربة. من دونه لا يظهر رمز في الشاشة الأخيرة.",
    start: "ابدأ العرض", preview: "في صفحة الطلب عندهم", keysTitle: "المفاتيح",
  },
  bakery: {
    day: "الخميس الذي يسبق العيد.", clock: "11:47 م", unread: "14 محادثة غير مقروءة.", list: "محادثاتهم الليلة",
    previews: [
      ["فاطمة", "السلام عليكم، عندكم كيكة عيد ميلاد للخميس؟", "11:46 م"],
      ["حصة", "طلبي جاهز؟", "11:41 م"],
      ["أحمد", "رسالة صوتية · 0:14", "11:38 م"],
      ["مريم", "علبة الفستق لسه موجودة؟", "11:30 م"],
      ["نورة", "صورة", "11:22 م"],
      ["سارة", "بكم ثلاث صواني معمول؟", "11:15 م"],
      ["عبدالله", "حوّلت المبلغ، تأكدوا لو سمحتوا", "11:02 م"],
      ["لطيفة", "توصلون الوعب؟", "10:58 م"],
      ["جاسم", "مرحبا؟؟", "10:51 م"],
      ["ريم", "طلبية العيد للمكتب، 40 علبة", "10:44 م"],
      ["منى", "رسالة صوتية · 0:41", "10:39 م"],
      ["خليفة", "فاتحين بكرة الساعة 7؟", "10:31 م"],
      ["دانة", "نفس الطلب اللي قبل لو سمحتوا", "10:20 م"],
      ["هدى", "أقدر أستلم قبل المغرب؟", "10:12 م"],
    ],
  },
  money: {
    title: "ثلاثة أرقام. أرقامك أنت، لا أرقامنا.",
    inputs: { daily: "الرسائل في اليوم", after: "منها بعد الإغلاق", average: "متوسط الطلب" },
    fewer: (what) => `أقل: ${what}`, more: (what) => `أكثر: ${what}`,
    month: ["نحو ", " في الشهر لم تصل إليك."], how: "كيف حسبناه", hide: "أخفِ الحساب",
    terms: { after: "رسائل بعد الإغلاق في اليوم", days: "يوماً", share: "كانت ستصبح طلبات", average: "متوسط الطلب", month: "في الشهر" },
    share: "نُبقي هذه النسبة منخفضة عمداً. غيّرها إن كانت عندك أعلى.",
    painsTitle: "المس ما حدث معك هذا الشهر.", tapped: (n) => `المختارة: ${n}`, none: "لم تختر شيئاً بعد",
    pains: {
      midnight: "واحد طلب نص الليل، وشفت الطلب الساعة 9.",
      twenty: "عشرين رسالة عشان كيكة عيد ميلاد وحدة.",
      eid: "قبلت طلبات وايد للعيد.",
      transfer: "للحين أراجع صور التحويلات.",
      ready: "«جاهز؟» طول اليوم.",
      pistachio: "«علبة الفستق لسه موجودة؟»",
      delivery: "تطبيق التوصيل أخذ 25%.",
      cafe: "المقهى كل أسبوع يقول «الأسبوع الجاي».",
      best: "ما أعرف شنو أكثر شي انباع.",
      google: "محد يلقاني في Google.",
    },
  },
  order: {
    lines: [
      "11:52 م. والكل نائم.",
      "يصل الرد فوراً.",
      "تختار الكيكة بنفسها.",
      "رابط دفع. ثم مدفوع.",
      "الطلب على قائمة الخميس. ولم تكتب حرفاً.",
      "12:20 ص. تُطلب الكيكة الثانية عشرة.",
      "اكتمل الخميس. أقرب يوم متاح: السبت.",
    ],
    times: ["11:52 م", "11:52 م", "11:53 م", "11:54 م", "11:54 م", "12:20 ص", "7:05 ص"],
    customer: "مريم صالح", customer2: "عائشة حمد", customer3: "خالد ناصر", account: "حساب تجاري",
    ask: "السلام عليكم، عندكم كيكة لبكرة؟ عيد ميلاد، شوكولاتة، واكتبوا عليها: نور 7",
    reply: "تفضل، اختر طلبك من هنا:", link: "افتح صفحة الطلب", page: "الطلب",
    item: "كيكة المناسبات بالشوكولاتة", itemNote: "إسفنج الشوكولاتة الداكنة مع كتابة بالكريمة.",
    size: "الحجم", sizes: [["1 كغ", 160], ["2 كغ", 280]],
    flavour: "الحشوة", flavours: ["شوكولاتة داكنة", "شوكولاتة وفستق", "شوكولاتة وكراميل"],
    message: "الكتابة على الكيكة", messages: ["كل عام وأنت بخير", "مبروك", "عيد مبارك", "بدون كتابة"],
    day: "يوم الاستلام", days: ["غداً · الخميس", "الجمعة", "السبت"], full: "مكتمل", nextFree: "اطلب مسبقاً: أقرب موعد السبت",
    pay: (amount) => `ادفع ${amount}`, payTitle: "الدفع", payFor: (n) => `الطلب رقم ${n}`, card: "رقم البطاقة",
    payNow: (amount) => `ادفع ${amount}`, paid: "مدفوع", paidFor: (amount, n) => `${amount} · الطلب رقم ${n}`,
    received: (amount, n) => `استلمنا ${amount} عن الطلب رقم ${n}. شكراً لك.`,
    ask2: "كيكة شوكولاتة للخميس لو سمحتوا، 1 كغ", ask3: "السلام عليكم، كيكة شوكولاتة للخميس؟",
    yourTurn: "دورك الآن. المس الحجم والحشوة والكتابة واليوم.", tapHint: "على الهاتف",
    cardsLive: "يبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك.",
    window: (shop) => `${shop} · الطلبات`, orders: "الطلبات", cols: ["الطلب", "العميل", "الاستلام", "الحالة"],
    rows: [
      { n: 1042, who: "مقهى تمر", what: "معمول بالتمر ×6", day: "الخميس", pay: "على الحساب", state: "مؤكد" },
      { n: 1041, who: "عمر علي", what: "كيك الحليب بالزعفران", day: "الخميس", pay: "مدفوع", state: "مؤكد" },
    ],
    newState: "جديد", paidState: "مدفوع", forDay: (day) => day,
    limitTitle: "كيكة المناسبات بالشوكولاتة", limitDay: "الخميس · عدد في اليوم",
    ofLimit: (n, of) => `${n} من ${of} مطلوبة`, fullLine: "اكتمل الخميس. أقرب يوم متاح: السبت.",
    list: "قائمة الخميس", listNote: "ما يجب تحضيره، من طلبات الخميس",
    listRows: [["كيك الحليب بالزعفران", 6], ["معمول بالتمر، علبة 12", 9], ["صينية بسبوسة", 4]],
    listCake: "كيكة المناسبات بالشوكولاتة", noorLine: "1 كغ · شوكولاتة داكنة · كل عام وأنت بخير", fromChat: "«نور 7» من المحادثة",
    builtLine: "الرد، وصفحة الطلب، والأحجام، والخيارات، ويوم الاستلام، والعدد في اليوم.", sat: "السبت",
  },
  pains: {
    before: "هذا الشهر", after: "مع ALYR", payUrl: "alyr.qa/pay/…", orderUrl: "alyr.qa/s/…", shown: (n) => `في المشهد ${n}`, jump: (n) => `انتقل إلى المشهد ${n}`,
    condition: "خارج نافذة الـ24 ساعة تُرسل هذه الرسالة بعد موافقة واتساب على صياغتها.",
    cards: {
      ready: { head: "يتوقفون عن السؤال لأنهم يعرفون مسبقاً." },
      pistachio: { head: "تعيد التعبئة، فيعودون." },
      cafe: { head: "لا تلاحق أحداً. ضغطة واحدة ترسل التذكير." },
      delivery: { head: "زبائنك الدائمون لا يحتاجون تطبيقاً بينكما." },
      twenty: { head: "صفحة واحدة بدل عشرين رسالة." },
      midnight: { head: "أُخذ الساعة 11:52 م، ودُفع، وهو على قائمة الخميس." },
      eid: { head: "تحدد العدد مرة واحدة." },
      transfer: { head: "المدفوع يظهر مدفوعاً. لا صور تحويل تراجعها." },
      best: { head: "يخبرك به يوم الأحد." },
      google: { head: "يجدونك على Google، ويطلبون من صفحتك." },
      invoice: { head: "هذا عميل من الشركات تستطيع الآن أن تقبله.", quote: "«المكتب يريد فاتورة.»" },
    },
    ready: { message: "الطلب رقم 1043 جاهز للاستلام.", time: "3:40 م", track: ["تم الطلب", "مؤكد", "جاهز للاستلام", "مكتمل"], page: "الطلب رقم 1043" },
    pistachio: {
      item: "علبة الفستق", sold: "نفدت الكمية", tell: "أخبرني حين يعود", told: "سنخبرك مرة واحدة حين يعود.",
      morning: "الجمعة · 9:00 ص",
      back: (shop) => `أخبار سارة من ${shop}: عاد «علبة الفستق» إلى المخزون كما طلبت. يمكنك الطلب من هنا:`,
    },
    cafe: {
      name: "مقهى تمر", owed: "المستحق", oldest: "أقدم مبلغ غير مدفوع: 64 يوماً", send: "أرسل التذكير", sent: "أُرسل التذكير",
      reminder: (shop) => `تذكير من ${shop}: مبلغ 1,840 ر.ق متأخر السداد. أقدم فاتورة غير مدفوعة منذ 64 يوماً. للدفع:`,
      group: "مجموعة الأسعار: المقاهي", theirs: "يرى مقهى تمر", yours: "يرى عملاؤك", maamoul: "معمول بالتمر، علبة 12",
      head2: "مقاهيك ترى سعرها، وعملاؤك يرون سعرهم.",
    },
    delivery: { app: "عبر تطبيق التوصيل", own: "عبر رابطك أنت", order: "الطلب نفسه", fee: "للتطبيق", kept: "يبقى لك" },
    twenty: "الحجم والحشوة والكتابة واليوم: في صفحة واحدة.",
    midnight: "طلب مريم الساعة 11:52 م، مدفوع قبل منتصف الليل.",
    eid: "12 من 12 للخميس. ويُعرض على العميل التالي يوم السبت.",
    transfer: "رابط الدفع يجعل الطلب مدفوعاً.",
    best: "الأكثر طلباً الأسبوع الماضي", bestFact: "كرواسون بالزبدة · 54",
    google: "ملفك، مع زر للطلب يفتح صفحتك.",
    invoice: {
      title: "فاتورة · Invoice", number: "INV-0012", to: "مكاتب برج الهلال",
      lines: [["معمول بالتمر، علبة 12", "Date maamoul, box of 12", 40]], total: "الإجمالي · Total", tax: "",
    },
  },
  system: {
    title: "طلب واحد، والنشاط كله.", order: "الطلب رقم 1043",
    nodes: [
      { name: "ALYR Chat", what: "طلبات واتساب وصندوق الفريق", did: "صفحة الطلب، والدفع، وصفحة التتبّع، وصندوق واحد للفريق." },
      { name: "ALYR Bookings", what: "المواعيد والتذكيرات", did: "تذوّق كيك يوم السبت الساعة 11:00، مع تذكير الساعة 9:00." },
      { name: "ALYR Agent", what: "نشاطك بالأرقام", did: "يُحسب في أرقام اليوم وفي تقرير الأحد." },
      { name: "ALYR Accounts", what: "الحسابات الآجلة", did: "إن كان مقهى تمر: على حسابه، وبسعره." },
      { name: "ALYR Shelf", what: "الأصناف والمخزون", did: "كيك الشوكولاتة للخميس: 11 من 12." },
      { name: "ALYR Docs", what: "الإيصالات والفواتير", did: "الإيصال RC-0043، مرقّم ومحفوظ." },
    ],
    end: "كل طلب يحدّث مخزونك وإيصالاتك وحساباتك وأرقامك في الوقت نفسه.",
    before: "قبل: سبعة أماكن، لا يجمعها شيء",
    islands: ["دفتر الطلبات", "محادثات واتساب", "رسائل إنستغرام", "صور تطبيق البنك", "جدول Excel", "تطبيق التوصيل", "الآلة الحاسبة"],
    after: "بعد: مساحة عمل واحدة",
    afterRows: [
      ["سجل واحد لكل عميل", "مريم صالح · 6 طلبات · آخرها: كيكة شوكولاتة، الخميس"],
      ["أرقام واحدة", "اليوم: 23 طلباً · 3,240 ر.ق"],
      ["صندوق واحد للفريق", "كل محادثة، ومن يرد عليها"],
      ["لكل شخص دخوله الخاص", "المالك · المطبخ · الكاونتر"],
    ],
    grows: "ينمو معك.",
    growRows: [
      ["أدوار الموظفين: من يرى ماذا", "built"],
      ["منتجات أخرى، تُشغَّل حين تحتاجها", "built"],
      ["كل شهر نجلس معك على أرقامك", "setup"],
      ["فرع ثانٍ تحت الحساب نفسه", "notBuilt"],
    ],
  },
  found: {
    head: [
      "«محل كيك قريب مني». وها أنت.",
      "بعد الاستلام، رسالة واحدة.",
      "ويقرؤها العميل التالي.",
      "على الكاونتر، وفي نبذة حسابك.",
    ],
    search: "محل كيك قريب مني", kind: "مخبز · مفتوح حتى 11 م", open: "مفتوح", order: "اطلب", directions: "الاتجاهات", call: "اتصال",
    others: ["مخبز", "مقهى", "حلويات"],
    thanks: () => "شكراً لكِ يا أم نور. تقييم في 10 ثوانٍ يساعدنا كثيراً:",
    review: "تقييم", reviewer: "مريم ص.", reviewText: "الكيكة كانت كما طلبناها تماماً. نور أحبّتها.", reviewWhen: "الخميس",
    qr: "اطلب من هنا", qrNote: "امسح الرمز للطلب", bio: "الرابط في النبذة", bioLink: "alyr.qa/s/your-bakery", handle: "@yourbakery", stars: "5 نجوم",
  },
  sunday: {
    head: ["الأحد، 9:00 ص. رسالة واحدة: كيف مضى الأسبوع.", "ثم الشاشة الرئيسية: ما يحتاجك اليوم، ولماذا."],
    from: "ALYR", when: "الأحد 9:00 ص",
    condition: "تُرسل أول التقارير بعد موافقة واتساب على صياغة التقرير.", shop: "التقرير الأسبوعي", suggestions: "اقتراحات",
  },
  how: {
    title: "كيف نعمل",
    steps: ["نأتي إلى محلك.", "نجهّزه معك.", "تبدأ العمل.", "كل شهر نجلس معك على أرقامك."],
    objTitle: "ما يسأله أصحاب المحلات",
    objections: [
      ["عندي واتساب للأعمال.", "يعمل على واتساب، التطبيق الذي يستخدمه عملاؤك."],
      ["هل بياناتي في أمان؟", "عملاؤك لك. موظفونا لا يقرؤون محادثاتك."],
      ["وإن أردت التوقف؟", "شهراً بشهر، بإشعار قبل 7 أيام."],
      ["لست خبيراً بالتقنية.", "لا بأس. لا تحتاج إلى ذلك."],
    ],
  },
  next: {
    title: "لنجعل الخميس عندك كما يجب.", scan: "امسح الرمز: خط التجربة يرد الآن.", noLine: "",
    book: "احجز الفحص لمحلك", pick: "أي يوم يناسبك؟", booked: (day) => `الفحص: ${day}`,
    start: "نبدأ بـ", kept: "محفوظ على هذه الشاشة فقط.", none: "كل ما رأيناه اليوم",
  },
};

export const COPY: Record<"en" | "ar", Words> = { en, ar };
