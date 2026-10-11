// Every word on the public site, in English and Arabic. Components contain no text.
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
  cta: { title: string; body: string; button: string; write: string; pending: string };
  footer: { line: string; rights: string; workspace: string };
};

const en: Copy = {
  meta: {
    title: "ALYR · Transform the business. Not just the interface.",
    description:
      "ALYR builds the systems businesses in Qatar and the GCC run on. The first product turns your WhatsApp number into bookings, orders, payments and tracking, with your whole team in one inbox.",
  },
  skip: "Skip to content",
  nav: {
    product: "Product",
    approach: "Approach",
    who: "Who it's for",
    cta: "Request early access",
    other: "العربية",
    home: "ALYR home",
    menu: "Menu",
    sections: "Sections",
  },
  hero: {
    eyebrow: "Built in Qatar for the GCC",
    title: ["Transform the business.", "Not just the interface."],
    body:
      "ALYR builds the systems businesses in Qatar and the GCC run on. Our first product turns the WhatsApp number you already have into bookings, orders, payments and tracking, with your whole team in one inbox.",
    primary: "See the product",
    secondary: "How we work",
    facts: [
      "Official WhatsApp Business Platform",
      "Arabic and English",
      "Your number, your payment account",
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
    eyebrow: "Approach",
    statement:
      "A business does not become digital when it gets a new website. It becomes digital when its customers, its team, its money and its data move through one system.",
    steps: [
      {
        title: "See the real system",
        body: "We start with how work actually moves: the chats, the paper, the spreadsheet, the handoffs.",
      },
      {
        title: "Design the better model",
        body: "Remove the steps nobody needs. Decide who owns each one that stays.",
      },
      {
        title: "Build what makes it run",
        body: "Software and automation that fit the new model, not the old habit.",
      },
      {
        title: "Stay until it is used",
        body: "Train the team, measure what changed, and keep improving it.",
      },
    ],
  },
  product: {
    eyebrow: "Product 01 · Early access",
    title: "Your WhatsApp number, running the front desk.",
    body:
      "Customers keep chatting the way they already do. Behind the chat, ALYR books the visit, takes the order, collects the payment and keeps everyone updated.",
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
      {
        name: "Travel, visa and document services",
        body: "Every request tracked from the first message to done, with the customer kept informed.",
        tags: ["Track", "Update"],
      },
    ],
    other: "Run something else? Tell us how the work moves today.",
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
    eyebrow: "The company",
    body:
      "ALYR is building the operating tools GCC businesses actually need. WhatsApp is where we start. More products are on the way.",
  },
  cta: {
    title: "See it on your own number.",
    body:
      "We are onboarding the first businesses in Qatar. Tell us how you take bookings and orders today, and we will show you the same work in ALYR.",
    button: "Request early access",
    write: "Or write to",
    pending: "Our contact address is being set up. Please check back shortly.",
  },
  footer: {
    line: "Transform the business. Not just the interface.",
    rights: "ALYR. Built in Qatar.",
    workspace: "Staff sign-in",
  },
};

const ar: Copy = {
  meta: {
    title: "ALYR · نغيّر طريقة العمل، لا شكل الواجهة فقط",
    description:
      "تبني ALYR الأنظمة التي تعمل عليها الشركات في قطر والخليج. منتجنا الأول يحوّل رقم واتساب الخاص بك إلى حجوزات وطلبات ومدفوعات ومتابعة، مع فريقك كله في صندوق واحد.",
  },
  skip: "انتقل إلى المحتوى",
  nav: {
    product: "المنتج",
    approach: "منهجنا",
    who: "لمن",
    cta: "اطلب الوصول المبكر",
    other: "English",
    home: "الصفحة الرئيسية لـ ALYR",
    menu: "القائمة",
    sections: "الأقسام",
  },
  hero: {
    eyebrow: "من قطر إلى الخليج",
    title: ["نغيّر طريقة العمل.", "لا شكل الواجهة فقط."],
    body:
      "تبني ALYR الأنظمة التي تعمل عليها الشركات في قطر والخليج. منتجنا الأول يحوّل رقم واتساب الذي تملكه اليوم إلى حجوزات وطلبات ومدفوعات ومتابعة، مع فريقك كله في صندوق واحد.",
    primary: "شاهد المنتج",
    secondary: "كيف نعمل",
    facts: ["منصة واتساب للأعمال الرسمية", "بالعربية والإنجليزية", "رقمك وحساب الدفع الخاص بك"],
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
    eyebrow: "منهجنا",
    statement:
      "لا تصبح الشركة رقمية حين تحصل على موقع جديد. تصبح رقمية حين يتحرك عملاؤها وفريقها وأموالها وبياناتها داخل نظام واحد.",
    steps: [
      {
        title: "نرى النظام كما هو",
        body: "نبدأ من الطريقة التي يسير بها العمل فعلاً: المحادثات والأوراق والجداول وتسليم المهام.",
      },
      {
        title: "نصمّم النموذج الأفضل",
        body: "نحذف الخطوات التي لا يحتاجها أحد، ونحدد من المسؤول عن كل خطوة تبقى.",
      },
      {
        title: "نبني ما يشغّله",
        body: "برمجيات وأتمتة تناسب النموذج الجديد، لا العادة القديمة.",
      },
      {
        title: "نبقى حتى يُستخدم",
        body: "ندرّب الفريق، ونقيس ما تغيّر، ونواصل التحسين.",
      },
    ],
  },
  product: {
    eyebrow: "المنتج 01 · وصول مبكر",
    title: "رقم واتساب الخاص بك يدير الاستقبال.",
    body:
      "يواصل عملاؤك المراسلة كما اعتادوا. وخلف المحادثة تحجز ALYR الموعد، وتستلم الطلب، وتحصّل المبلغ، وتُبقي الجميع على اطلاع.",
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
      {
        name: "السفر والتأشيرات وتخليص المعاملات",
        body: "كل طلب متابَع من أول رسالة حتى الإنجاز، والعميل على اطلاع دائم.",
        tags: ["متابعة", "تحديث"],
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
    eyebrow: "الشركة",
    body:
      "تبني ALYR أدوات التشغيل التي تحتاجها شركات الخليج فعلاً. نبدأ من واتساب، ومنتجات أخرى في الطريق.",
  },
  cta: {
    title: "شاهده يعمل على رقمك.",
    body:
      "نستقبل الآن أولى الشركات في قطر. أخبرنا كيف تستقبل الحجوزات والطلبات اليوم، وسنريك العمل نفسه داخل ALYR.",
    button: "اطلب الوصول المبكر",
    write: "أو راسلنا على",
    pending: "عنوان التواصل قيد الإعداد. نرجو العودة قريباً.",
  },
  footer: {
    line: "نغيّر طريقة العمل، لا شكل الواجهة فقط.",
    rights: "ALYR. صُنع في قطر.",
    workspace: "دخول الموظفين",
  },
};

export const copy: Record<Locale, Copy> = { en, ar };
