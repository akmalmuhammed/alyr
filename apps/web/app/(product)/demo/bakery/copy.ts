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
  bakery: { day: string; clock: string; unread: string; chats: string; lockDay: string; lockTime: string; previews: [string, string, string][]; list: string };
  money: {
    title: string; inputs: { daily: string; after: string; average: string };
    fewer: Fn; more: Fn; month: [string, string]; how: string; hide: string;
    terms: { after: string; days: string; share: string; average: string; month: string };
    share: string; painsTitle: string; tapped: Fn<[number]>; none: string;
    pains: Record<Pain, string>;
  };
  order: {
    lines: string[]; times: string[]; customer: string; customer2: string; customer3: string;
    account: string; ask: string; reply: string; daysMorning: string[]; closed: string; link: string; page: string; item: string; itemNote: string;
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
    beforeChat: Record<Pain | "invoice", [string, string][]>; beforeWho: string; reminded: string;
    before: string; after: string; payUrl: string; orderUrl: string; shown: Fn<[number]>; jump: Fn<[number]>; condition: string;
    cards: Record<Pain | "invoice", { head: string; quote?: string }>;
    ready: { message: string; time: string; track: string[]; page: string };
    pistachio: { condition: string; item: string; sold: string; tell: string; told: string; morning: string; back: Fn<[string]> };
    cafe: { condition: string; name: string; owed: string; oldest: string; send: string; sent: string; reminder: Fn<[string]>; group: string; theirs: string; yours: string; maamoul: string; head2: string };
    delivery: { app: string; own: string; order: string; fee: string; kept: string };
    twenty: string; midnight: string; eid: string; transfer: string; best: string; bestFact: string; google: string;
    invoice: { title: string; number: string; to: string; lines: [string, string, number][]; total: string; tax: string };
  };
  system: {
    title: string; order: string; nodes: { name: string; what: string; did: string; frag: string }[];
    end: string; before: string; islands: string[]; after: string; afterRows: [string, string][];
    grows: string; growRows: [string, "built" | "setup" | "notBuilt"][]; sidebar: string; record: string;
  };
  found: {
    head: string[]; search: string; kind: string; open: string; order: string; directions: string; call: string;
    others: string[]; thanks: Fn; when: string; condition: string; review: string; reviewer: string; reviewText: string; reviewWhen: string;
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
      "You were asleep. The order was taken, paid, and it's in tomorrow's orders. You didn't type a word.",
      "That's the Eid problem, solved before it starts. You set the number once. ALYR says no for you, politely, and offers the next day.",
    ],
    ["Only the ones you tapped, in your order."],
    ["This isn't six apps. It's one system: every order updates your stock, your receipts, your accounts and your numbers at once. You run the bakery; it keeps every order, payment and account in one place.", "If they ask: a second branch under the same account is not built yet."],
    ["Every happy customer becomes the reason the next one finds you. We set up your Google profile and the review request after each pickup."],
    ["One message on Sunday tells you how the week went. No spreadsheet, no guessing."],
    ["You don't learn software. We bring it, set it up, and stay."],
    ["Scan this. That's a bakery on ALYR answering, right now. Let's book the day we set up yours."],
  ],
  setup: {
    eyebrow: "Before the owner sees it", title: "Whose bakery is this?", lead: "Their name and the colour of their sign go on every screen: the cake order, the Google profile, the Sunday report.",
    name: "Bakery name", nameHint: "As the owner writes it.", nameAr: "Name in Arabic (optional)",
    colour: "The shop's colour", colours: { cocoa: "Cocoa", terracotta: "Terracotta", rose: "Rose", saffron: "Saffron", teal: "Teal", plum: "Plum" },
    line: "Test line link (optional)", lineHint: "A wa.me link to the test number. Without one, the last screen shows no code.",
    start: "Start the demo", preview: "On their order page", keysTitle: "Keys",
  },
  bakery: {
    day: "Wednesday night, Eid week.", clock: "11:47\u00a0pm", chats: "Chats", lockDay: "Wednesday", lockTime: "11:47", unread: "14 unread chats.", list: "Their chats tonight",
    previews: [
      ["Fatima", "Salam, birthday cake for Thursday?", "11:46 pm"],
      ["Hessa", "Is my order ready?", "11:41 pm"],
      ["Ahmed", "Voice message · 0:14", "11:38 pm"],
      ["Shaikha", "Do you still have the pistachio box?", "11:30 pm"],
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
      "11:52\u00a0pm. Everyone's asleep.",
      "The reply comes straight back.",
      "She builds the cake herself.",
      "A pay link. Paid.",
      "It's in Thursday's orders. You didn't type a word.",
      "12:20\u00a0am. The twelfth cake goes.",
      "Full for Thursday. Next free: Saturday.",
    ],
    times: ["11:52\u00a0pm", "11:52\u00a0pm", "11:53\u00a0pm", "11:54\u00a0pm", "11:54\u00a0pm", "12:20\u00a0am", "7:05\u00a0am"],
    customer: "Mariam Saleh", customer2: "Aisha Hamad", customer3: "Khalid Nasser", account: "Business account",
    ask: "Salam, I want to order a birthday cake for tomorrow. Chocolate, name on it: Noor\u00a07",
    reply: "Here is our order page. Pick what you need:", link: "Open the order page", page: "Order",
    daysMorning: ["Today · Thu", "Fri", "Sat"], closed: "Closed",
    item: "Chocolate celebration cake", itemNote: "Dark chocolate sponge with a message in icing.",
    size: "Size", sizes: [["1 kg", 160], ["2 kg", 280]],
    flavour: "Filling", flavours: ["Dark chocolate", "Chocolate and pistachio", "Chocolate and caramel"],
    message: "Message on the cake", messages: ["Happy birthday", "Congratulations", "Eid Mubarak", "No message"],
    day: "Pickup day", days: ["Tomorrow · Thu", "Fri", "Sat"], full: "Full", nextFree: "Order ahead: next available Sat",
    pay: (amount) => `Pay ${amount}`, payTitle: "Payment", payFor: (n) => `Order #${n}`, card: "Card number",
    payNow: (amount) => `Pay ${amount}`, paid: "Paid", paidFor: (amount, n) => `${amount} · Order #${n}`,
    received: (amount, n) => `We received ${amount} for order ${n}. Thank you.`,
    ask2: "Salam, I'd like to order a chocolate cake for Thursday, 1\u00a0kg", ask3: "Salam, I want to order a chocolate cake for Thursday",
    yourTurn: "Your turn. Tap the size, the filling, the message and the day.", tapHint: "On the phone",
    cardsLive: "Card payments go live with your own payment provider. Until then, customers pay on collection.",
    window: (shop) => `${shop} · Orders`, orders: "Orders", cols: ["Order", "Customer", "For", "Status"],
    rows: [
      { n: 1042, who: "Mahbash Café", what: "Date maamoul ×6", day: "Thu", pay: "On account", state: "Confirmed" },
      { n: 1041, who: "Omar Ali", what: "Saffron milk cake", day: "Thu", pay: "Paid", state: "Confirmed" },
    ],
    newState: "New", paidState: "Paid", forDay: (day) => day,
    limitTitle: "Chocolate celebration cake", limitDay: "Thursday · 12 a day",
    ofLimit: (n, of) => `${n} of ${of} ordered`, fullLine: "Full for Thursday. Next free: Saturday.",
    list: "Thursday's list, by item", listNote: "What to make on Thursday. Not in the product yet.",
    listRows: [["Saffron milk cake", 6], ["Date maamoul, box of 12", 9], ["Basbousa tray", 4]],
    listCake: "Chocolate celebration cake", noorLine: "1 kg · Dark chocolate · Happy birthday", fromChat: "The name, “Noor\u00a07”, is in her chat beside the order",
    builtLine: "The reply, the order page, sizes, choices, the pickup day and the number each day.", sat: "Sat",
  },
  pains: {
    beforeWho: "Their chats", reminded: "Sent today, 9:00\u00a0am",
    beforeChat: {
      ready: [["Is my order ready?", "1:12 pm"], ["Ready yet?", "2:05 pm"], ["Is it ready? I'm outside", "3:31 pm"], ["Hello, is the cake ready?", "3:52 pm"]],
      pistachio: [["Is the pistachio box still there?", "10:02 am"], ["Pistachio box available?", "12:40 pm"], ["When is the pistachio box back?", "6:15 pm"]],
      cafe: [["Next week inshallah", "Sun"], ["Will transfer next week", "Sun"], ["Next week for sure", "Sun"]],
      delivery: [["Can I order direct? The app is expensive", "7:20 pm"], ["Is it cheaper if I order from you?", "8:02 pm"]],
      twenty: [["Salam, birthday cake?", "4:01 pm"], ["How much?", "4:09 pm"], ["What sizes?", "4:10 pm"], ["Chocolate or vanilla?", "4:22 pm"], ["Can you write a name?", "4:30 pm"], ["Which day can I pick up?", "4:41 pm"]],
      midnight: [["Salam, cake for tomorrow?", "11:58 pm"], ["Hello?", "12:30 am"], ["Never mind, I ordered elsewhere", "8:47 am"]],
      eid: [["Can you do 3 cakes for Thursday?", "Wed"], ["And 2 trays of maamoul?", "Wed"], ["Where is my order??", "Thu"]],
      transfer: [["Photo · transfer screenshot", "2:10 pm"], ["Sent, please check", "2:10 pm"], ["Photo · transfer screenshot", "5:47 pm"]],
      best: [["Do you have croissants?", "9:40 am"], ["Croissants finished again?", "10:15 am"]],
      google: [["Where is your shop?", "5:02 pm"], ["Send the location please", "5:05 pm"], ["Are you on Google Maps?", "6:30 pm"]],
      invoice: [["Can you send an invoice for the office?", "11:20 am"], ["Our accounts team needs it", "11:24 am"]],
    },
    before: "This month", after: "With ALYR", payUrl: "alyr.qa/pay/…", orderUrl: "alyr.qa/s/…", shown: (n) => `Shown in scene ${n}`, jump: (n) => `Go to scene ${n}`,
    condition: "Outside the 24-hour window this message goes once WhatsApp approves its wording.",
    cards: {
      ready: { head: "They stop asking because they already know." },
      pistachio: { head: "You restock, they come back." },
      cafe: { head: "You don't chase. One press sends it." },
      delivery: { head: "Your regulars don't need an app between you." },
      twenty: { head: "One page instead of twenty messages." },
      midnight: { head: "Taken at 11:52\u00a0pm, paid, in Thursday's orders." },
      eid: { head: "You set the number once." },
      transfer: { head: "Paid shows as Paid. No screenshot to check." },
      best: { head: "Sunday's report tells you." },
      google: { head: "On Google, with an Order button to your page." },
      invoice: { head: "That's a corporate client you can say yes to.", quote: "“The office wants an invoice.”" },
    },
    ready: { message: "Order #1043 is ready for collection.", time: "3:40\u00a0pm", track: ["Order received", "Confirmed by the shop", "Ready for collection", "Complete"], page: "Order #1043" },
    pistachio: {
      condition: "One message, with the customer's yes. Outside the 24-hour window it goes once WhatsApp approves its wording.",
      item: "Pistachio box", sold: "Sold out", tell: "Tell me when it is back", told: "We'll tell you once when it is back.",
      morning: "Friday · 9:00\u00a0am",
      back: (shop) => `Good news from ${shop}: Pistachio box is back in stock, as you asked. You can order here:`,
    },
    cafe: {
      condition: "Reminders go once WhatsApp approves their wording. Card payments go live with your own payment provider.",
      name: "Mahbash Café", owed: "Owed", oldest: "Oldest unpaid: 64 days", send: "Send reminders", sent: "Reminders sent",
      reminder: (shop) => `Reminder from ${shop}: QAR 1,840 is now overdue. Your oldest unpaid purchase was 64 days ago. Pay here:`,
      group: "Price group: Cafés", theirs: "Mahbash Café sees", yours: "Your customers see", maamoul: "Date maamoul, box of 12",
      head2: "Your cafés see their price, your customers see theirs.",
    },
    delivery: { app: "Through the delivery app", own: "Through your own link", order: "The same order", fee: "To the app", kept: "No app commission" },
    twenty: "Size, filling, message, day: chosen on one page.",
    midnight: "Mariam's order at 11:52\u00a0pm, paid before midnight.",
    eid: "12 of 12 for Thursday. The next customer is offered Saturday.",
    transfer: "The pay link marks the order Paid.",
    best: "Most ordered last week", bestFact: "Butter croissant · 54",
    google: "Your profile, with an Order button that opens your page.",
    invoice: {
      title: "Invoice · فاتورة", number: "INV-0012", to: "Ghaf House Offices",
      lines: [["Date maamoul, box of 12", "معمول بالتمر، علبة 12", 40]], total: "Total · الإجمالي", tax: "",
    },
  },
  system: {
    title: "One order, the whole business.", order: "Order #1043",
    nodes: [
      { name: "ALYR Chat", what: "Orders and the team inbox", frag: "#1043 · Paid", did: "The order page, Paid, the tracking page, one inbox for the team." },
      { name: "ALYR Bookings", what: "Bookings and reminders", frag: "Sat 11:00\u00a0am · Tasting", did: "A cake tasting on Saturday at 11:00\u00a0am, with a reminder at 9:00\u00a0am." },
      { name: "ALYR Agent", what: "Your business in numbers", frag: "Orders today · 24", did: "Counted in today's numbers and in Sunday's report." },
      { name: "ALYR Accounts", what: "Credit accounts", frag: "Mahbash Café · on account", did: "If it's Mahbash Café: on their account, at their price." },
      { name: "ALYR Shelf", what: "Items and stock", frag: "Thu · 11 of 12", did: "Thursday's chocolate cakes: 11 of 12." },
      { name: "ALYR Docs", what: "Receipts and invoices", frag: "RC-0043", did: "Receipt RC-0043, numbered and kept." },
    ],
    end: "One order reaches your stock, your receipt and your numbers. On credit, the account too.",
    before: "Before: seven places, nothing joined.",
    islands: ["Orders notebook", "WhatsApp chats", "Instagram messages", "Bank app screenshots", "Excel sheet", "Delivery app", "Calculator"],
    after: "After: one workspace.",
    afterRows: [
      ["One customer record", "Mariam Saleh · 6 orders · last: chocolate cake, Thu"],
      ["One set of numbers", "This week so far: 50 orders · QAR 8,520"],
      ["One inbox for the team", "Every chat, with who is answering it"],
      ["Each person their own sign-in", "Owner · Kitchen · Counter"],
    ],
    grows: "It grows with you.",
    growRows: [
      ["Staff roles: who can change what", "built"],
      ["More products, switched on when you need them", "built"],
      ["Price groups for cafés and offices, when you take them on", "built"],
    ],
    sidebar: "Workspace", record: "Customer",
  },
  found: {
    head: [
      "“Cake shop near me.” Your profile, with an Order button.",
      "After collection, one message.",
      "And the next customer reads it.",
      "On the counter, and in your bio.",
    ],
    search: "cake shop near me", kind: "Bakery · Open until 11 pm", open: "Open", order: "Order", directions: "Directions", call: "Call",
    others: ["Bakery", "Café", "Sweets"],
    thanks: () => "Thank you, Noor's mum. A 10-second review helps us a lot:", when: "5:10\u00a0pm",
    condition: "The Order button depends on what Google offers in Qatar; we check yours at setup. The review request goes from your line, outside the 24-hour window once WhatsApp approves its wording.",
    review: "Review", reviewer: "Mariam S.", reviewText: "The cake was exactly what we asked for. Noor loved it.", reviewWhen: "Thursday",
    qr: "Order here", qrNote: "Scan to order", bio: "Link in bio", bioLink: "alyr.qa/s/your-bakery", handle: "@yourbakery", stars: "5 stars",
  },
  sunday: {
    head: ["Sunday, 9:00\u00a0am. How the week went.", "Any day, the home screen: what needs you now, and why."],
    from: "ALYR", when: "Sun 9:00 am",
    condition: "The first reports go out once WhatsApp approves the report's wording.", shop: "Weekly report", suggestions: "Suggestions",
  },
  how: {
    title: "How we work",
    steps: ["We come to your shop.", "We set it up with you.", "You go live.", "Every month we sit with your numbers."],
    objTitle: "What owners ask",
    objections: [
      ["I already have WhatsApp Business.", "Works on WhatsApp, the app your customers already use."],
      ["Is my data safe?", "Your customers are yours. Each shop's records are kept apart, and our staff never open your chats."],
      ["What if I want to stop?", "Month to month. Stop at the end of any month, with 7 days' notice."],
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
      "كنت نائماً. أُخذ الطلب ودُفع، وهو ضمن طلبات الغد. ولم تكتب حرفاً.",
      "هذه مشكلة العيد، محلولة قبل أن تبدأ. تحدد العدد مرة واحدة، فتعتذر ALYR عنك بلطف وتعرض اليوم التالي.",
    ],
    ["ما اخترته فقط، وبترتيبك."],
    ["هذه ليست ستة تطبيقات. إنها نظام واحد: كل طلب يحدّث مخزونك وإيصالاتك وحساباتك وأرقامك في الوقت نفسه. أنت تدير المخبز، وهو يحفظ كل طلب ودفعة وحساب في مكان واحد.", "إن سألوا: الفرع الثاني تحت الحساب نفسه لم يُبنَ بعد."],
    ["كل عميل راضٍ يصبح سبباً في أن يجدك العميل التالي. نجهّز لك ملفك على Google وطلب التقييم بعد كل استلام."],
    ["رسالة واحدة يوم الأحد تخبرك كيف مضى الأسبوع. بلا جداول، وبلا تخمين."],
    ["لن تتعلم برنامجاً. نحن نحضره، ونجهّزه، ونبقى معك."],
    ["امسح هذا الرمز. هذا مخبز على ALYR يرد الآن. لنحدد اليوم الذي نجهّز فيه مخبزك."],
  ],
  setup: {
    eyebrow: "قبل أن يراه صاحب المحل", title: "مخبز من هذا؟", lead: "يظهر الاسم ولون اللافتة في كل شاشة: طلب الكيكة، وملف Google، وتقرير الأحد.",
    name: "اسم المخبز", nameHint: "كما يكتبه صاحبه.", nameAr: "الاسم بالعربية (اختياري)",
    colour: "لون المحل", colours: { cocoa: "كاكاو", terracotta: "طيني", rose: "وردي", saffron: "زعفراني", teal: "فيروزي", plum: "برقوقي" },
    line: "رابط خط التجربة (اختياري)", lineHint: "رابط wa.me لرقم التجربة. من دونه لا يظهر رمز في الشاشة الأخيرة.",
    start: "ابدأ العرض", preview: "في صفحة الطلب عندهم", keysTitle: "المفاتيح",
  },
  bakery: {
    day: "ليلة الخميس، في أسبوع العيد.", clock: "11:47 م", chats: "الدردشات", lockDay: "الأربعاء", lockTime: "11:47", unread: "14 محادثة غير مقروءة.", list: "محادثاتهم الليلة",
    previews: [
      ["فاطمة", "السلام عليكم، عندكم كيكة عيد ميلاد للخميس؟", "11:46 م"],
      ["حصة", "طلبي جاهز؟", "11:41 م"],
      ["أحمد", "رسالة صوتية · 0:14", "11:38 م"],
      ["شيخة", "علبة الفستق لسه موجودة؟", "11:30 م"],
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
      "تصمّم كيكتها بنفسها.",
      "رابط دفع، ثم «مدفوع».",
      "الطلب ضمن طلبات الخميس. ولم تكتب حرفاً.",
      "12:20 ص. تُطلب الكيكة الثانية عشرة.",
      "اكتمل الخميس. أقرب يوم متاح: السبت.",
    ],
    times: ["11:52 م", "11:52 م", "11:53 م", "11:54 م", "11:54 م", "12:20 ص", "7:05 ص"],
    customer: "مريم صالح", customer2: "عائشة حمد", customer3: "خالد ناصر", account: "حساب تجاري",
    ask: "السلام عليكم، أبي أطلب كيكة عيد ميلاد لبكرة. شوكولاتة، واكتبوا عليها: نور\u00a07",
    reply: "تفضل، اختر طلبك من هنا:", link: "افتح صفحة الطلب", page: "الطلب",
    daysMorning: ["اليوم · الخميس", "الجمعة", "السبت"], closed: "مغلق",
    item: "كيكة المناسبات بالشوكولاتة", itemNote: "إسفنج الشوكولاتة الداكنة مع كتابة بالكريمة.",
    size: "الحجم", sizes: [["1 كغ", 160], ["2 كغ", 280]],
    flavour: "الحشوة", flavours: ["شوكولاتة داكنة", "شوكولاتة وفستق", "شوكولاتة وكراميل"],
    message: "الكتابة على الكيكة", messages: ["كل عام وأنت بخير", "مبروك", "عيد مبارك", "بدون كتابة"],
    day: "يوم الاستلام", days: ["غداً · الخميس", "الجمعة", "السبت"], full: "مكتمل", nextFree: "اطلب مسبقاً: أقرب موعد السبت",
    pay: (amount) => `ادفع ${amount}`, payTitle: "الدفع", payFor: (n) => `الطلب رقم ${n}`, card: "رقم البطاقة",
    payNow: (amount) => `ادفع ${amount}`, paid: "مدفوع", paidFor: (amount, n) => `${amount} · الطلب رقم ${n}`,
    received: (amount, n) => `استلمنا ${amount} عن الطلب رقم ${n}. شكراً لك.`,
    ask2: "السلام عليكم، أبي أطلب كيكة شوكولاتة للخميس، 1\u00a0كغ", ask3: "السلام عليكم، أبي أطلب كيكة شوكولاتة للخميس",
    yourTurn: "دورك الآن. المس الحجم والحشوة والكتابة واليوم.", tapHint: "على الهاتف",
    cardsLive: "يبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك. وحتى ذلك الحين، يدفع العملاء عند الاستلام.",
    window: (shop) => `${shop} · الطلبات`, orders: "الطلبات", cols: ["الطلب", "العميل", "الاستلام", "الحالة"],
    rows: [
      { n: 1042, who: "مقهى المهباش", what: "معمول بالتمر ×6", day: "الخميس", pay: "على الحساب", state: "مؤكد" },
      { n: 1041, who: "عمر علي", what: "كيك الحليب بالزعفران", day: "الخميس", pay: "مدفوع", state: "مؤكد" },
    ],
    newState: "جديد", paidState: "مدفوع", forDay: (day) => day,
    limitTitle: "كيكة المناسبات بالشوكولاتة", limitDay: "الخميس · 12 في اليوم",
    ofLimit: (n, of) => `${n} من ${of} مطلوبة`, fullLine: "اكتمل الخميس. أقرب يوم متاح: السبت.",
    list: "قائمة الخميس حسب الصنف", listNote: "ما يُحضَّر يوم الخميس. لم يدخل المنتج بعد.",
    listRows: [["كيك الحليب بالزعفران", 6], ["معمول بالتمر، علبة 12", 9], ["صينية بسبوسة", 4]],
    listCake: "كيكة المناسبات بالشوكولاتة", noorLine: "1 كغ · شوكولاتة داكنة · كل عام وأنت بخير", fromChat: "الاسم «نور\u00a07» في محادثتها، بجانب الطلب",
    builtLine: "الرد، وصفحة الطلب، والأحجام، والخيارات، ويوم الاستلام، والعدد في اليوم.", sat: "السبت",
  },
  pains: {
    beforeWho: "محادثاتهم", reminded: "أُرسلت اليوم، 9:00 ص",
    beforeChat: {
      ready: [["طلبي جاهز؟", "1:12 م"], ["جهز؟", "2:05 م"], ["جاهز؟ أنا برا", "3:31 م"], ["مرحبا، الكيكة جاهزة؟", "3:52 م"]],
      pistachio: [["علبة الفستق لسه موجودة؟", "10:02 ص"], ["علبة الفستق متوفرة؟", "12:40 م"], ["متى ترجع علبة الفستق؟", "6:15 م"]],
      cafe: [["الأسبوع الجاي إن شاء الله", "الأحد"], ["بحوّل الأسبوع الجاي", "الأحد"], ["الأسبوع الجاي أكيد", "الأحد"]],
      delivery: [["أقدر أطلب منكم مباشرة؟ التطبيق غالي", "7:20 م"], ["أرخص لو طلبت منكم؟", "8:02 م"]],
      twenty: [["السلام عليكم، كيكة عيد ميلاد؟", "4:01 م"], ["بكم؟", "4:09 م"], ["شنو الأحجام؟", "4:10 م"], ["شوكولاتة ولا فانيلا؟", "4:22 م"], ["تكتبون اسم؟", "4:30 م"], ["أي يوم أستلم؟", "4:41 م"]],
      midnight: [["السلام عليكم، كيكة لبكرة؟", "11:58 م"], ["مرحبا؟", "12:30 ص"], ["خلاص، طلبت من مكان ثاني", "8:47 ص"]],
      eid: [["تقدرون تسوون 3 كيكات للخميس؟", "الأربعاء"], ["وصينيتين معمول؟", "الأربعاء"], ["وين طلبي؟؟", "الخميس"]],
      transfer: [["صورة · صورة التحويل", "2:10 م"], ["حوّلت، تأكدوا لو سمحتوا", "2:10 م"], ["صورة · صورة التحويل", "5:47 م"]],
      best: [["عندكم كرواسون؟", "9:40 ص"], ["خلص الكرواسون مرة ثانية؟", "10:15 ص"]],
      google: [["وين محلكم؟", "5:02 م"], ["أرسلوا اللوكيشن لو سمحتوا", "5:05 م"], ["أنتم على خرائط Google؟", "6:30 م"]],
      invoice: [["تقدرون ترسلون فاتورة للمكتب؟", "11:20 ص"], ["قسم الحسابات يحتاجها", "11:24 ص"]],
    },
    before: "هذا الشهر", after: "مع ALYR", payUrl: "alyr.qa/pay/…", orderUrl: "alyr.qa/s/…", shown: (n) => `في المشهد ${n}`, jump: (n) => `انتقل إلى المشهد ${n}`,
    condition: "خارج نافذة الـ24 ساعة تُرسل هذه الرسالة بعد موافقة واتساب على صياغتها.",
    cards: {
      ready: { head: "يتوقفون عن السؤال لأنهم يعرفون مسبقاً." },
      pistachio: { head: "توفّره من جديد، فيعودون." },
      cafe: { head: "لا تلاحق أحداً. ضغطة واحدة ترسل التذكير." },
      delivery: { head: "زبائنك الدائمون لا يحتاجون تطبيقاً بينك وبينهم." },
      twenty: { head: "صفحة واحدة بدل عشرين رسالة." },
      midnight: { head: "أُخذ الساعة 11:52 م، ودُفع، وهو ضمن طلبات الخميس." },
      eid: { head: "تحدد العدد مرة واحدة." },
      transfer: { head: "المدفوع يظهر مدفوعاً. لا صور تحويل تراجعها." },
      best: { head: "تقرير الأحد يخبرك." },
      google: { head: "على Google، مع زر للطلب يفتح صفحتك." },
      invoice: { head: "هذا عميل من الشركات تستطيع أن تقبله.", quote: "«المكتب يريد فاتورة.»" },
    },
    ready: { message: "الطلب رقم 1043 جاهز للاستلام.", time: "3:40 م", track: ["تم استلام الطلب", "أكّده المحل", "جاهز للاستلام", "مكتمل"], page: "الطلب رقم 1043" },
    pistachio: {
      condition: "رسالة واحدة بموافقة العميل. وخارج نافذة الـ24 ساعة تُرسل بعد موافقة واتساب على صياغتها.",
      item: "علبة الفستق", sold: "نفد", tell: "أخبرني حين يعود", told: "سنخبرك مرة واحدة عند توفره.",
      morning: "الجمعة · 9:00 ص",
      back: (shop) => `أخبار سارة من ${shop}: عاد «علبة الفستق» إلى المخزون كما طلبت. يمكنك الطلب من هنا:`,
    },
    cafe: {
      condition: "تُرسل التذكيرات بعد موافقة واتساب على صياغتها. ويبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بمحلك.",
      name: "مقهى المهباش", owed: "المستحق", oldest: "أقدم مبلغ غير مدفوع: 64 يوماً", send: "أرسل التذكيرات", sent: "أُرسلت التذكيرات",
      reminder: (shop) => `تذكير من ${shop}: مبلغ 1,840 ر.ق متأخر السداد. أقدم فاتورة غير مدفوعة منذ 64 يوماً. للدفع:`,
      group: "مجموعة الأسعار: المقاهي", theirs: "يرى مقهى المهباش", yours: "يرى عملاؤك", maamoul: "معمول بالتمر، علبة 12",
      head2: "مقاهيك ترى سعرها، وعملاؤك يرون سعرهم.",
    },
    delivery: { app: "عبر تطبيق التوصيل", own: "عبر رابطك أنت", order: "الطلب نفسه", fee: "للتطبيق", kept: "بلا عمولة للتطبيق" },
    twenty: "الحجم والحشوة والكتابة واليوم: في صفحة واحدة.",
    midnight: "طلب مريم الساعة 11:52 م، مدفوع قبل منتصف الليل.",
    eid: "12 من 12 للخميس. ويُعرض على العميل التالي يوم السبت.",
    transfer: "رابط الدفع يجعل الطلب مدفوعاً.",
    best: "الأكثر طلباً الأسبوع الماضي", bestFact: "كرواسون بالزبدة · 54",
    google: "ملفك، مع زر للطلب يفتح صفحتك.",
    invoice: {
      title: "فاتورة · Invoice", number: "INV-0012", to: "مكاتب بيت الغاف",
      lines: [["معمول بالتمر، علبة 12", "Date maamoul, box of 12", 40]], total: "الإجمالي · Total", tax: "",
    },
  },
  system: {
    title: "طلب واحد، والنشاط كله.", order: "الطلب رقم 1043",
    nodes: [
      { name: "ALYR Chat", what: "طلبات واتساب وصندوق الفريق", frag: "#1043 · مدفوع", did: "صفحة الطلب، والدفع، وصفحة التتبّع، وصندوق واحد للفريق." },
      { name: "ALYR Bookings", what: "المواعيد والتذكيرات", frag: "السبت 11:00 ص · تذوّق", did: "تذوّق كيك يوم السبت الساعة 11:00 ص، مع تذكير الساعة 9:00 ص." },
      { name: "ALYR Agent", what: "نشاطك بالأرقام", frag: "طلبات اليوم · 24", did: "يُحسب في أرقام اليوم وفي تقرير الأحد." },
      { name: "ALYR Accounts", what: "الحسابات الآجلة", frag: "مقهى المهباش · على الحساب", did: "إن كان مقهى المهباش: على حسابه، وبسعره." },
      { name: "ALYR Shelf", what: "الأصناف والمخزون", frag: "الخميس · 11\u00a0من\u00a012", did: "كيك الشوكولاتة للخميس: 11\u00a0من\u00a012." },
      { name: "ALYR Docs", what: "الإيصالات والفواتير", frag: "RC-0043", did: "الإيصال RC-0043، مرقّم ومحفوظ." },
    ],
    end: "طلب واحد يصل إلى مخزونك وإيصالك وأرقامك. وإن كان بالآجل، فإلى الحساب أيضاً.",
    before: "قبل: سبعة أماكن، لا يجمعها شيء.",
    islands: ["دفتر الطلبات", "محادثات واتساب", "رسائل إنستغرام", "صور تطبيق البنك", "جدول Excel", "تطبيق التوصيل", "الآلة الحاسبة"],
    after: "بعد: مساحة عمل واحدة.",
    afterRows: [
      ["سجل واحد لكل عميل", "مريم صالح · 6 طلبات · آخرها: كيكة شوكولاتة، الخميس"],
      ["أرقامك في مكان واحد", "هذا الأسبوع حتى الآن: 50 طلباً · 8,520 ر.ق"],
      ["صندوق واحد للفريق", "كل محادثة، ومن يرد عليها"],
      ["لكل شخص دخوله الخاص", "المالك · المطبخ · الكاونتر"],
    ],
    grows: "ينمو معك.",
    growRows: [
      ["أدوار الموظفين: من يغيّر ماذا", "built"],
      ["منتجات أخرى، تُشغَّل حين تحتاجها", "built"],
      ["مجموعات أسعار للمقاهي والمكاتب، حين تتعامل معها", "built"],
    ],
    sidebar: "مساحة العمل", record: "العميل",
  },
  found: {
    head: [
      "«محل كيك قريب مني». ملفك، وفيه زر للطلب.",
      "بعد الاستلام، رسالة واحدة.",
      "ويقرؤها العميل التالي.",
      "على الكاونتر، وفي نبذة حسابك.",
    ],
    search: "محل كيك قريب مني", kind: "مخبز · مفتوح حتى 11 م", open: "مفتوح", order: "اطلب", directions: "الاتجاهات", call: "اتصال",
    others: ["مخبز", "مقهى", "حلويات"],
    thanks: () => "شكراً لكِ يا أم نور. تقييم في 10 ثوانٍ يساعدنا كثيراً:", when: "5:10 م",
    condition: "زر الطلب بحسب ما يتيحه Google في قطر، ونتحقق منه عند التجهيز. ويُرسل طلب التقييم من رقمك، وخارج نافذة الـ24 ساعة بعد موافقة واتساب على صياغته.",
    review: "تقييم", reviewer: "مريم ص.", reviewText: "الكيكة كانت كما طلبناها تماماً. نور أحبّتها.", reviewWhen: "الخميس",
    qr: "اطلب من هنا", qrNote: "امسح الرمز للطلب", bio: "الرابط في النبذة", bioLink: "alyr.qa/s/your-bakery", handle: "@yourbakery", stars: "5 نجوم",
  },
  sunday: {
    head: ["الأحد، 9:00 ص. كيف مضى الأسبوع.", "وفي أي يوم، الشاشة الرئيسية: ما يحتاجك الآن، ولماذا."],
    from: "ALYR", when: "الأحد 9:00 ص",
    condition: "تُرسل أول التقارير بعد موافقة واتساب على صياغة التقرير.", shop: "التقرير الأسبوعي", suggestions: "اقتراحات",
  },
  how: {
    title: "كيف نعمل",
    steps: ["نأتي إلى محلك.", "نجهّزه معك.", "تبدأ باستقبال الطلبات.", "كل شهر نجلس معك على أرقامك."],
    objTitle: "ما يسأله أصحاب المحلات",
    objections: [
      ["عندي واتساب للأعمال.", "تعمل ALYR على واتساب، التطبيق الذي يستخدمه عملاؤك أصلاً."],
      ["هل بياناتي في أمان؟", "عملاؤك لك. سجلات كل محل منفصلة، ولا يطّلع موظفونا على محادثاتك أبداً."],
      ["وإن أردت التوقف؟", "شهراً بشهر. توقف في نهاية أي شهر، بإشعار قبل 7 أيام."],
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
