// Every word on the public site, in English and Arabic. Components contain no text.
// Positioning and voice follow the Brand & Growth Playbook (11 Oct 2026): the local tech
// partner that sets it up for you. Plain words, one idea per sentence, no hype, and no
// number or promise we cannot yet show (see docs/brand.md).
// The Arabic is written natively, not translated line by line, and still needs a
// native speaker's review before launch (docs/brand.md).

export type Locale = "en" | "ar";

export type ChatLine = {
  from: "customer" | "business" | "staff";
  text: string;
  // A tappable link or button shown under the message.
  action?: string;
  // Who wrote it, for staff messages.
  name?: string;
};

export type PanelRow = {
  lead?: string;
  main: string;
  sub?: string;
  trail?: string;
  // signal: the row this conversation just created. done: finished. quiet: not yet.
  tone?: "signal" | "done" | "quiet";
};

export type Demo = {
  id: string;
  tab: string;
  chat: ChatLine[];
  panel: { title: string; badge: string; rows: PanelRow[]; total?: [string, string] };
  caption: string;
};

export type Copy = {
  meta: { title: string; description: string };
  skip: string;
  nav: {
    product: string; approach: string; who: string; cta: string; other: string; home: string;
    menu: string; sections: string;
  };
  hero: {
    eyebrow: string;
    title: [string, string];
    body: string;
    primary: string;
    secondary: string;
    facts: string[];
    visual: {
      label: string;
      before: string;
      chips: string[];
      after: string;
      nodes: string[];
      record: string;
      note: string;
    };
  };
  approach: {
    eyebrow: string;
    statement: string;
    steps: { title: string; body: string }[];
  };
  product: {
    eyebrow: string;
    title: string;
    body: string;
    business: string;
    businessMeta: string;
    workspace: string;
    note: string;
    tabsLabel: string;
    pause: string;
    play: string;
    demos: Demo[];
    facts: { title: string; body: string }[];
  };
  who: {
    eyebrow: string;
    title: string;
    rows: { name: string; body: string; tags: string[] }[];
    other: string;
  };
  built: {
    eyebrow: string;
    title: string;
    items: { icon: "security" | "data" | "users" | "document"; title: string; body: string }[];
  };
  company: { eyebrow: string; body: string };
  cta: { title: string; body: string; whatsapp: string; email: string; write: string; pending: string };
  footer: { line: string; rights: string; workspace: string; disclaimer: string };
};

const en: Copy = {
  meta: {
    title: "ALYR · Go digital without the IT team",
    description:
      "ALYR turns your customers' chats into orders, bookings and payments, set up for you. For restaurants, cafes, clinics, salons and shops in Qatar, in Arabic and English.",
  },
  skip: "Skip to content",
  nav: {
    product: "Product",
    approach: "Why ALYR",
    who: "Who it's for",
    cta: "Talk to us",
    other: "العربية",
    home: "ALYR home",
    menu: "Menu",
    sections: "Sections",
  },
  hero: {
    eyebrow: "We do the tech. You run the business.",
    title: ["Go digital.", "Without the IT team."],
    body:
      "ALYR turns your customers' chats into orders, bookings and payments, and we set it up for you. It works on the WhatsApp number you already have, in Arabic and English.",
    primary: "See how it works",
    secondary: "Why owners choose it",
    facts: [
      "Set up for you",
      "Your customers stay yours",
      "Arabic and English, side by side",
    ],
    visual: {
      label: "From scattered work to one system",
      before: "Today",
      chips: ["Who booked 4 pm?", "Order on a paper slip", "Transfer screenshot", "3 missed messages"],
      after: "One system",
      nodes: ["Booked", "Ordered", "Paid", "Delivered"],
      record: "Order 1042 · paid · out for delivery",
      note: "Illustrative",
    },
  },
  approach: {
    eyebrow: "Why it matters",
    statement:
      "Your customers already message you before they visit or order. Those chats get lost, orders end up on paper, and payment means a transfer screenshot. The businesses that win treat the chat as their shop counter.",
    steps: [
      {
        title: "Sell more",
        body: "Stop losing orders in the chat, even after hours or in the Friday rush.",
      },
      {
        title: "Keep more",
        body: "Orders that come to you direct carry no delivery-app commission. Your customer list stays yours.",
      },
      {
        title: "Easy",
        body: "We set it up for you, on the number you already use. Your customers need no new app.",
      },
      {
        title: "Trusted",
        body: "A local team, Arabic and English, built on WhatsApp's official Business Platform.",
      },
    ],
  },
  product: {
    eyebrow: "ALYR Chat · Early access",
    title: "Sell, book and get paid in the chat.",
    body:
      "Your customers keep messaging you the way they already do. ALYR Chat adds the booking, the order, the payment link and the updates, and your team sees it all in one place.",
    business: "Dana Home Services",
    businessMeta: "Business account",
    workspace: "Workspace",
    note: "Sample conversation with a fictional business.",
    tabsLabel: "What the product does",
    pause: "Pause the demo",
    play: "Play the demo",
    demos: [
      {
        id: "book",
        tab: "Book",
        chat: [
          { from: "customer", text: "Hi, the AC in the majlis is leaking. Can someone come tomorrow?" },
          { from: "business", text: "We can. Pick a time that suits you.", action: "Choose a time" },
          { from: "business", text: "Booking 214 confirmed: AC service visit, Tue 14 Oct, 4:30 PM." },
          { from: "business", text: "Reminder: your visit is today at 4:30 PM." },
        ],
        panel: {
          title: "Bookings",
          badge: "Tue 14 Oct",
          rows: [
            { lead: "2:00 PM", main: "Generator service", sub: "Khalid Al-Naimi", trail: "Booked", tone: "done" },
            { lead: "4:30 PM", main: "AC service visit", sub: "Mariam Al-Kuwari", trail: "New", tone: "signal" },
            { lead: "6:00 PM", main: "Electrical inspection", sub: "Yousef Al-Emadi", trail: "Booked", tone: "done" },
          ],
        },
        caption: "Free times come from your opening hours. Two customers can never take the same slot.",
      },
      {
        id: "order",
        tab: "Order",
        chat: [
          { from: "customer", text: "I need two AC filters and a thermostat." },
          { from: "business", text: "Here is our order page. Pick what you need.", action: "Open the order page" },
          { from: "business", text: "Order 1042 received: 3 items, QAR 385." },
        ],
        panel: {
          title: "Order 1042",
          badge: "New",
          rows: [
            { lead: "2 ×", main: "AC filter", trail: "QAR 120", tone: "signal" },
            { lead: "1 ×", main: "Smart thermostat", trail: "QAR 265", tone: "signal" },
          ],
          total: ["Total", "QAR 385"],
        },
        caption: "The customer orders from a page made for their phone. Your team sees it the moment it lands.",
      },
      {
        id: "pay",
        tab: "Pay",
        chat: [
          { from: "business", text: "Order 1042 is confirmed. You can pay here.", action: "Pay QAR 385" },
          { from: "business", text: "Received QAR 385 for order 1042. Thank you." },
        ],
        panel: {
          title: "Payments",
          badge: "Today",
          rows: [
            { main: "Order 1042", sub: "Mariam Al-Kuwari", trail: "QAR 385 · Paid", tone: "signal" },
            { main: "On account", sub: "Al Rayyan Villas · 41 days", trail: "QAR 1,850 · Reminded", tone: "done" },
          ],
        },
        caption: "Payments settle in your own gateway account. ALYR never holds your money.",
      },
      {
        id: "track",
        tab: "Track",
        chat: [
          { from: "business", text: "Order 1042 is confirmed." },
          { from: "business", text: "Order 1042 is ready for pickup." },
          { from: "customer", text: "On my way." },
        ],
        panel: {
          title: "Order 1042",
          badge: "Ready",
          rows: [
            { lead: "10:02", main: "Received", tone: "done" },
            { lead: "10:05", main: "Confirmed", tone: "done" },
            { lead: "11:40", main: "Ready for pickup", trail: "Customer told", tone: "signal" },
            { lead: "", main: "Collected", tone: "quiet" },
          ],
        },
        caption: "Each change of status messages the customer, so nobody has to ask.",
      },
      {
        id: "inbox",
        tab: "Team inbox",
        chat: [
          { from: "customer", text: "Is the thermostat covered by a warranty?" },
          { from: "staff", name: "Yusuf", text: "Yes, 12 months. I will bring the receipt with me tomorrow." },
        ],
        panel: {
          title: "Inbox",
          badge: "3 open",
          rows: [
            { main: "Mariam Al-Kuwari", sub: "Is the thermostat covered by a warranty?", trail: "Yusuf", tone: "signal" },
            { main: "Khalid Al-Naimi", sub: "Is the generator part in?", trail: "Unassigned", tone: "quiet" },
            { main: "Staff note", sub: "Mariam prefers calls after 5 PM.", trail: "Team only", tone: "done" },
          ],
        },
        caption: "One number, the whole team. When a person answers, the assistant steps back.",
      },
    ],
    facts: [
      {
        title: "Keep your number",
        body: "Connect the WhatsApp Business number your customers already know. The app stays on your phone.",
      },
      {
        title: "Paid straight to you",
        body: "Payment links use your own gateway account. ALYR never holds or moves your money.",
      },
      {
        title: "No message without consent",
        body: "A customer who says stop is not messaged again. Every consent is recorded.",
      },
    ],
  },
  who: {
    eyebrow: "Who it's for",
    title: "For businesses that already run on WhatsApp.",
    rows: [
      {
        name: "Restaurants and cafes",
        body: "Your menu in your customers' chat. Orders come to you direct, and your regulars stay yours.",
        tags: ["Order", "Pay"],
      },
      {
        name: "Clinics and salons",
        body: "Bookings and reminders taken in the chat, without the phone tag.",
        tags: ["Book", "Remind"],
      },
      {
        name: "Home and field services",
        body: "Scheduled visits, updates on the day, and payment when the job is done.",
        tags: ["Schedule", "Pay"],
      },
      {
        name: "Shops and trading",
        body: "Orders, payment links, and credit accounts with reminders that stay polite.",
        tags: ["Order", "Collect"],
      },
    ],
    other: "Run something else? Tell us how you work today.",
  },
  built: {
    eyebrow: "How it is built",
    title: "Careful by design.",
    items: [
      {
        icon: "security",
        title: "Official WhatsApp only",
        body: "Built on Meta's WhatsApp Business Platform. No unofficial tools that put your number at risk.",
      },
      {
        icon: "data",
        title: "Your records stay yours",
        body: "Each business is separated inside the database itself, not by a setting someone can forget.",
      },
      {
        icon: "users",
        title: "People stay in charge",
        body: "Automation handles the routine. Your team can step into any conversation at any moment.",
      },
      {
        icon: "document",
        title: "Arabic and English",
        body: "Every customer message and every screen works in both languages.",
      },
    ],
  },
  company: {
    eyebrow: "What comes next",
    body:
      "We start with the chat. As you grow, ALYR adds payments, books and a website, all on the same customer list.",
  },
  cta: {
    title: "Let us set it up for you.",
    body:
      "Tell us how you take orders and bookings today. A person from ALYR replies, in Arabic or English, and shows you the same work on your own menu or price list.",
    whatsapp: "Message us on WhatsApp",
    email: "Write to us",
    write: "Or write to",
    pending: "Our WhatsApp line is being set up. Please check back shortly.",
  },
  footer: {
    line: "We do the tech. You run the business.",
    rights: "ALYR. Built in Qatar.",
    workspace: "Staff sign-in",
    disclaimer: "ALYR works with WhatsApp Business. It is not affiliated with WhatsApp or Meta.",
  },
};

const ar: Copy = {
  meta: {
    title: "ALYR · خلّ شغلك رقمي بدون فريق تقنية",
    description:
      "تحوّل ALYR محادثات عملائك إلى طلبات وحجوزات ومدفوعات، ونحن نجهّزها لك. للمطاعم والمقاهي والعيادات والصالونات والمحلات في قطر، بالعربية والإنجليزية.",
  },
  skip: "انتقل إلى المحتوى",
  nav: {
    product: "المنتج",
    approach: "لماذا ALYR",
    who: "لمن",
    cta: "تواصل معنا",
    other: "English",
    home: "الصفحة الرئيسية لـ ALYR",
    menu: "القائمة",
    sections: "الأقسام",
  },
  hero: {
    eyebrow: "علينا التقنية، وعليك شغلك",
    title: ["خلّ شغلك رقمي.", "بدون فريق تقنية."],
    body:
      "تحوّل ALYR محادثات عملائك إلى طلبات وحجوزات ومدفوعات، ونحن نجهّزها لك. تعمل على رقم واتساب الذي تستخدمه اليوم، بالعربية والإنجليزية.",
    primary: "شاهد كيف تعمل",
    secondary: "لماذا يختارها أصحاب الأعمال",
    facts: ["نجهّزها لك", "عملاؤك يبقون لك", "العربية والإنجليزية جنباً إلى جنب"],
    visual: {
      label: "من عمل متفرّق إلى نظام واحد",
      before: "اليوم",
      chips: ["من حجز الساعة ٤؟", "طلب على ورقة", "صورة تحويل بنكي", "٣ رسائل لم يُردّ عليها"],
      after: "نظام واحد",
      nodes: ["حُجز", "طُلب", "دُفع", "سُلّم"],
      record: "الطلب 1042 · مدفوع · في الطريق",
      note: "مثال توضيحي",
    },
  },
  approach: {
    eyebrow: "لماذا يهمّك",
    statement:
      "عملاؤك يراسلونك قبل أن يزوروك أو يطلبوا. تضيع المحادثات، وتُكتب الطلبات على الورق، ويصير الدفع صورة تحويل. والأعمال الرابحة تجعل المحادثة واجهة محلها.",
    steps: [
      {
        title: "بِع أكثر",
        body: "لا تضيع الطلبات في المحادثة، حتى بعد الدوام أو في زحمة الجمعة.",
      },
      {
        title: "احتفظ بأكثر",
        body: "الطلبات التي تصلك مباشرة بلا عمولة تطبيقات التوصيل، وقائمة عملائك تبقى لك.",
      },
      {
        title: "سهل",
        body: "نجهّزها لك على الرقم الذي تستخدمه اليوم، وعملاؤك لا يحتاجون تطبيقاً جديداً.",
      },
      {
        title: "موثوق",
        body: "فريق محلي، بالعربية والإنجليزية، ومبني على منصة واتساب للأعمال الرسمية.",
      },
    ],
  },
  product: {
    eyebrow: "ALYR Chat · وصول مبكر",
    title: "استقبل الطلبات والحجوزات والدفع في المحادثة.",
    body:
      "يواصل عملاؤك مراسلتك كما اعتادوا. ويضيف ALYR Chat الحجز والطلب ورابط الدفع والتحديثات، وفريقك يرى كل شيء في مكان واحد.",
    business: "دانة للخدمات المنزلية",
    businessMeta: "حساب أعمال",
    workspace: "مساحة العمل",
    note: "محادثة توضيحية مع شركة غير حقيقية.",
    tabsLabel: "ماذا يفعل المنتج",
    pause: "إيقاف العرض",
    play: "تشغيل العرض",
    demos: [
      {
        id: "book",
        tab: "الحجز",
        chat: [
          { from: "customer", text: "السلام عليكم، مكيف المجلس يسرّب ماء. ممكن أحد يجي بكرة؟" },
          { from: "business", text: "وعليكم السلام، أكيد. اختر الوقت المناسب لك.", action: "اختر الوقت" },
          { from: "business", text: "تم تأكيد الحجز 214: زيارة صيانة مكيف، الثلاثاء ١٤ أكتوبر، ٤:٣٠ م." },
          { from: "business", text: "تذكير: موعد زيارتك اليوم الساعة ٤:٣٠ م." },
        ],
        panel: {
          title: "الحجوزات",
          badge: "الثلاثاء ١٤ أكتوبر",
          rows: [
            { lead: "٢:٠٠ م", main: "صيانة مولّد", sub: "خالد النعيمي", trail: "محجوز", tone: "done" },
            { lead: "٤:٣٠ م", main: "زيارة صيانة مكيف", sub: "مريم الكواري", trail: "جديد", tone: "signal" },
            { lead: "٦:٠٠ م", main: "فحص كهربائي", sub: "يوسف العمادي", trail: "محجوز", tone: "done" },
          ],
        },
        caption: "الأوقات المتاحة تأتي من ساعات عملك، ولا يمكن لعميلين أن يحجزا الموعد نفسه.",
      },
      {
        id: "order",
        tab: "الطلب",
        chat: [
          { from: "customer", text: "أحتاج فلترين للمكيف وثرموستات." },
          { from: "business", text: "تفضل صفحة الطلب، اختر ما تحتاجه.", action: "افتح صفحة الطلب" },
          { from: "business", text: "تم استلام الطلب 1042: ٣ أصناف، ٣٨٥ ر.ق." },
        ],
        panel: {
          title: "الطلب 1042",
          badge: "جديد",
          rows: [
            { lead: "٢ ×", main: "فلتر مكيف", trail: "١٢٠ ر.ق", tone: "signal" },
            { lead: "١ ×", main: "ثرموستات ذكي", trail: "٢٦٥ ر.ق", tone: "signal" },
          ],
          total: ["الإجمالي", "٣٨٥ ر.ق"],
        },
        caption: "يطلب العميل من صفحة مصممة لهاتفه، ويراها فريقك لحظة وصولها.",
      },
      {
        id: "pay",
        tab: "الدفع",
        chat: [
          { from: "business", text: "تم تأكيد الطلب 1042. يمكنك الدفع من هنا.", action: "ادفع ٣٨٥ ر.ق" },
          { from: "business", text: "تم استلام ٣٨٥ ر.ق عن الطلب 1042. شكراً لك." },
        ],
        panel: {
          title: "المدفوعات",
          badge: "اليوم",
          rows: [
            { main: "الطلب 1042", sub: "مريم الكواري", trail: "٣٨٥ ر.ق · مدفوع", tone: "signal" },
            { main: "على الحساب", sub: "فلل الريان · ٤١ يوماً", trail: "١٬٨٥٠ ر.ق · تم التذكير", tone: "done" },
          ],
        },
        caption: "تُسوّى المدفوعات في حساب بوابة الدفع الخاص بك. ALYR لا تحتفظ بأموالك أبداً.",
      },
      {
        id: "track",
        tab: "المتابعة",
        chat: [
          { from: "business", text: "تم تأكيد الطلب 1042." },
          { from: "business", text: "الطلب 1042 جاهز للاستلام." },
          { from: "customer", text: "أنا في الطريق." },
        ],
        panel: {
          title: "الطلب 1042",
          badge: "جاهز",
          rows: [
            { lead: "١٠:٠٢", main: "تم الاستلام", tone: "done" },
            { lead: "١٠:٠٥", main: "تم التأكيد", tone: "done" },
            { lead: "١١:٤٠", main: "جاهز للاستلام", trail: "أُبلغ العميل", tone: "signal" },
            { lead: "", main: "تم التسليم", tone: "quiet" },
          ],
        },
        caption: "كل تغيير في الحالة يصل إلى العميل برسالة، فلا يحتاج أحد أن يسأل.",
      },
      {
        id: "inbox",
        tab: "صندوق الفريق",
        chat: [
          { from: "customer", text: "هل الثرموستات عليه ضمان؟" },
          { from: "staff", name: "يوسف", text: "نعم، ضمان ١٢ شهراً. سأحضر الفاتورة معي غداً." },
        ],
        panel: {
          title: "الوارد",
          badge: "٣ مفتوحة",
          rows: [
            { main: "مريم الكواري", sub: "هل الثرموستات عليه ضمان؟", trail: "يوسف", tone: "signal" },
            { main: "خالد النعيمي", sub: "هل وصلت قطعة المولّد؟", trail: "غير مسندة", tone: "quiet" },
            { main: "ملاحظة داخلية", sub: "مريم تفضّل الاتصال بعد ٥ مساءً.", trail: "للفريق فقط", tone: "done" },
          ],
        },
        caption: "رقم واحد والفريق كله. وحين يردّ أحد الموظفين يتوقف المساعد الآلي.",
      },
    ],
    facts: [
      {
        title: "احتفظ برقمك",
        body: "اربط رقم واتساب للأعمال الذي يعرفه عملاؤك. ويبقى التطبيق على هاتفك.",
      },
      {
        title: "المبلغ يصلك مباشرة",
        body: "روابط الدفع تستخدم حساب بوابة الدفع الخاص بك. ALYR لا تحتفظ بأموالك ولا تنقلها.",
      },
      {
        title: "لا رسالة بلا موافقة",
        body: "من يطلب الإيقاف لا تصله رسائل بعدها، وكل موافقة تُسجَّل.",
      },
    ],
  },
  who: {
    eyebrow: "لمن",
    title: "للشركات التي تعمل على واتساب أصلاً.",
    rows: [
      {
        name: "المطاعم والمقاهي",
        body: "قائمتك داخل محادثة عملائك. الطلبات تصلك مباشرة، وزبائنك الدائمون يبقون لك.",
        tags: ["طلب", "دفع"],
      },
      {
        name: "العيادات والصالونات",
        body: "حجوزات وتذكيرات داخل المحادثة، بلا اتصالات متكررة.",
        tags: ["حجز", "تذكير"],
      },
      {
        name: "الخدمات المنزلية والميدانية",
        body: "زيارات مجدولة، وتحديثات في يوم الموعد، ودفع عند إنجاز العمل.",
        tags: ["جدولة", "دفع"],
      },
      {
        name: "المحلات والتجارة",
        body: "طلبات وروابط دفع وحسابات آجلة مع تذكيرات لبقة.",
        tags: ["طلب", "تحصيل"],
      },
    ],
    other: "نشاطك مختلف؟ أخبرنا كيف يسير العمل لديك اليوم.",
  },
  built: {
    eyebrow: "كيف بُني",
    title: "الحرص جزء من التصميم.",
    items: [
      {
        icon: "security",
        title: "واتساب الرسمي فقط",
        body: "مبني على منصة واتساب للأعمال من Meta. لا أدوات غير رسمية تعرّض رقمك للخطر.",
      },
      {
        icon: "data",
        title: "سجلاتك تبقى لك",
        body: "بيانات كل شركة مفصولة داخل قاعدة البيانات نفسها، لا بإعداد قد يُنسى.",
      },
      {
        icon: "users",
        title: "القرار للإنسان",
        body: "الأتمتة تتولى المهام المتكررة، وفريقك يستطيع الدخول إلى أي محادثة في أي لحظة.",
      },
      {
        icon: "document",
        title: "بالعربية والإنجليزية",
        body: "كل رسالة للعميل وكل شاشة تعمل باللغتين.",
      },
    ],
  },
  company: {
    eyebrow: "ما القادم",
    body:
      "نبدأ من المحادثة. ومع نموّ عملك تضيف ALYR المدفوعات والحسابات والموقع، كلها على قائمة العملاء نفسها.",
  },
  cta: {
    title: "دعنا نجهّزها لك.",
    body:
      "أخبرنا كيف تستقبل الطلبات والحجوزات اليوم. يردّ عليك شخص من ALYR بالعربية أو الإنجليزية، ويريك العمل نفسه على قائمتك أو أسعارك.",
    whatsapp: "راسلنا على واتساب",
    email: "اكتب لنا",
    write: "أو راسلنا على",
    pending: "رقم واتساب الخاص بنا قيد الإعداد. نرجو العودة قريباً.",
  },
  footer: {
    line: "علينا التقنية، وعليك شغلك.",
    rights: "ALYR. صُنع في قطر.",
    workspace: "دخول الموظفين",
    disclaimer: "تعمل ALYR مع واتساب للأعمال، وليست تابعة لواتساب أو Meta.",
  },
};

export const copy: Record<Locale, Copy> = { en, ar };
