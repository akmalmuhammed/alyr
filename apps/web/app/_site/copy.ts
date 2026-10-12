// Every word on the public site, in English and Arabic. Components contain no text.
// The homepage is about ALYR the company: the tech partner for small and mid-sized
// businesses. ALYR Chat, the first product, has its own page. Voice follows the Brand &
// Growth Playbook (11 Oct 2026): plain words, one idea per sentence, no hype, and no
// number or promise we cannot yet show (see docs/brand.md).
// The Arabic is written natively, not translated line by line, and still needs a
// native speaker's review before launch (docs/brand.md).

import type { IconName } from "./brand";

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

/** One conversation and the records it becomes; drawn on the homepage. */
export type Figure = {
  label: string;
  business: string;
  chat: { from: "customer" | "business"; text: string; time: string; action?: string }[];
  via: string;
  rows: { icon: IconName; title: string; detail: string; status: string; done?: boolean }[];
  note: string;
};

type Meta = { title: string; description: string };
type Titled = { title: string; body: string };

export type Copy = {
  meta: { home: Meta; chat: Meta };
  skip: string;
  nav: {
    services: string; product: string; approach: string; cta: string; other: string;
    home: string; menu: string; sections: string;
  };
  hero: {
    eyebrow: string;
    title: [string, string];
    body: string;
    primary: string;
    secondary: string;
    facts: string[];
    board: {
      label: string;
      heading: string;
      rows: { icon: IconName; title: string; detail: string; tag: string; featured?: boolean }[];
    };
  };
  why: { eyebrow: string; statement: string };
  services: { eyebrow: string; title: string; items: (Titled & { icon: IconName })[] };
  teaser: { eyebrow: string; title: string; body: string; cta: string; figure: Figure };
  approach: { eyebrow: string; title: string; steps: Titled[] };
  who: { eyebrow: string; title: string; rows: { name: string; body: string }[]; other: string };
  built: { eyebrow: string; title: string; items: (Titled & { icon: IconName })[] };
  cta: { title: string; body: string; whatsapp: string; email: string; write: string; pending: string };
  footer: { line: string; rights: string; workspace: string; disclaimer: string };
  product: {
    eyebrow: string;
    title: string;
    body: string;
    business: string;
    businessMeta: string;
    today: string;
    typeHere: string;
    workspace: string;
    note: string;
    tabsLabel: string;
    pause: string;
    play: string;
    demos: Demo[];
    facts: Titled[];
    why: { eyebrow: string; statement: string; pillars: Titled[] };
    who: { eyebrow: string; title: string; rows: { name: string; body: string; tags: string[] }[]; other: string };
    next: { eyebrow: string; body: string };
    cta: { title: string; body: string };
  };
};

const en: Copy = {
  meta: {
    home: {
      title: "ALYR · Go digital without the IT team",
      description:
        "ALYR is the tech partner for small and mid-sized businesses in Qatar: websites, systems, automation and our own products, set up and looked after for you. Arabic and English.",
    },
    chat: {
      title: "ALYR Chat · Sell, book and get paid in the chat",
      description:
        "ALYR Chat turns your customers' WhatsApp messages into orders, bookings and payments, set up for you. For restaurants, cafes, clinics, salons and shops in Qatar.",
    },
  },
  skip: "Skip to content",
  nav: {
    services: "What we do",
    product: "ALYR Chat",
    approach: "How we work",
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
      "ALYR is the tech partner for small and mid-sized businesses in Qatar. Websites, systems, automation and our own products: we set them up, connect them and keep them working.",
    primary: "See what we do",
    secondary: "Meet ALYR Chat",
    facts: ["One partner for all your tech", "Set up and looked after for you", "Arabic and English, side by side"],
    board: {
      label: "What ALYR sets up for a business",
      heading: "What we set up for you",
      rows: [
        { icon: "cloud", title: "Website and online store", detail: "Fast, bilingual, and yours", tag: "Service" },
        { icon: "users", title: "Customer systems", detail: "CRM, bookings and portals", tag: "Service" },
        { icon: "workflow", title: "Automation", detail: "Your tools talking to each other", tag: "Service" },
        { icon: "dashboard", title: "Dashboards", detail: "The numbers you actually check", tag: "Service" },
        { icon: "check", title: "ALYR Chat", detail: "Orders, bookings and payments in WhatsApp", tag: "Our product", featured: true },
      ],
    },
  },
  why: {
    eyebrow: "Why ALYR",
    statement:
      "Most small businesses do not need another app. They need someone who makes the technology work together, explains it in plain words, and is still there next month.",
  },
  services: {
    eyebrow: "What we do",
    title: "Everything tech, under one roof.",
    items: [
      {
        icon: "cloud",
        title: "Websites and online stores",
        body: "A site that loads fast, reads well in Arabic and English, and takes orders or enquiries.",
      },
      {
        icon: "users",
        title: "Customer systems",
        body: "CRM, booking and customer portals, so nothing lives only in one person's phone.",
      },
      {
        icon: "workflow",
        title: "Automation and integrations",
        body: "We connect the tools you already pay for and remove the copying between them.",
      },
      {
        icon: "dashboard",
        title: "Dashboards and reporting",
        body: "Sales, bookings and money owed on one screen you will actually open.",
      },
      {
        icon: "ai",
        title: "AI assistants",
        body: "Drafting replies, sorting requests and answering common questions, always with a person in charge.",
      },
      {
        icon: "settings",
        title: "Setup, training and support",
        body: "We install it, train your team in their language, and stay with you after launch.",
      },
    ],
  },
  teaser: {
    eyebrow: "Our first product",
    title: "ALYR Chat",
    body:
      "Sell, book and get paid in the chat. Your customers keep messaging you on WhatsApp; ALYR Chat turns those messages into orders, bookings and payments your team sees in one place.",
    cta: "See ALYR Chat",
    figure: {
      label: "One chat becomes a booking, an order and a payment",
      business: "Zaitoon Grill",
      chat: [
        { from: "customer", text: "Table for 4 tonight at 8? And the mixed grill ready when we arrive.", time: "6:42 PM" },
        { from: "business", text: "Done. Table for 4 at 8:00 PM, and the grill is ordered. Pay ahead here.", time: "6:42 PM", action: "Pay QAR 180" },
      ],
      via: "ALYR turns it into",
      rows: [
        { icon: "calendar", title: "Booking", detail: "Table for 4 · today 8:00 PM", status: "Confirmed" },
        { icon: "document", title: "Order 1042", detail: "Mixed grill platter", status: "QAR 180" },
        { icon: "check", title: "Payment", detail: "By link, to your own account", status: "Paid", done: true },
      ],
      note: "Illustrative, with a fictional restaurant",
    },
  },
  approach: {
    eyebrow: "How we work",
    title: "Four steps, one team.",
    steps: [
      {
        title: "See the real system",
        body: "We start with how work actually moves: the chats, the paper, the spreadsheet, the handoffs.",
      },
      {
        title: "Design the better way",
        body: "Remove the steps nobody needs. Decide who owns each one that stays.",
      },
      {
        title: "Build what makes it run",
        body: "Software and automation that fit the new way of working, not the old habit.",
      },
      {
        title: "Stay until it is used",
        body: "Train the team, measure what changed, and keep improving it.",
      },
    ],
  },
  who: {
    eyebrow: "Who we work with",
    title: "Owner-run businesses that have outgrown paper and spreadsheets.",
    rows: [
      { name: "Restaurants and cafes", body: "Online ordering, a menu that stays current, and payments that add up at the end of the day." },
      { name: "Clinics and salons", body: "Bookings, reminders and a customer list that survives a change of receptionist." },
      { name: "Home and field services", body: "Scheduling, job updates and invoices sent before the van leaves." },
      { name: "Shops and trading", body: "A catalogue, stock you can trust, and credit accounts that get collected." },
    ],
    other: "Run something else? Tell us how you work today.",
  },
  built: {
    eyebrow: "How it is built",
    title: "Careful by design.",
    items: [
      {
        icon: "security",
        title: "Official platforms only",
        body: "We build on the official tools of WhatsApp, payment providers and cloud platforms. No shortcuts that put your business at risk.",
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
  cta: {
    title: "Tell us what is slowing you down.",
    body:
      "A website, a system, a messy process, or a question about tech. A person from ALYR replies, in Arabic or English.",
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
  product: {
    eyebrow: "ALYR Chat · Early access",
    title: "Sell, book and get paid in the chat.",
    body:
      "Your customers keep messaging you the way they already do. ALYR Chat adds the booking, the order, the payment link and the updates, and your team sees it all in one place.",
    business: "Dana Home Services",
    businessMeta: "Business account",
    today: "Today",
    typeHere: "Message",
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
          { from: "staff", text: "Yes, 12 months. I will bring the receipt with me tomorrow." },
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
    why: {
      eyebrow: "Why owners choose it",
      statement:
        "Your customers already message you before they visit or order. Those chats get lost, orders end up on paper, and payment means a transfer screenshot. The businesses that win treat the chat as their shop counter.",
      pillars: [
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
    next: {
      eyebrow: "What comes next",
      body:
        "We start with the chat. As you grow, ALYR adds payments, books and a website, all on the same customer list.",
    },
    cta: {
      title: "Let us set it up for you.",
      body:
        "Tell us how you take orders and bookings today. A person from ALYR replies, in Arabic or English, and shows you the same work on your own menu or price list.",
    },
  },
};

const ar: Copy = {
  meta: {
    home: {
      title: "ALYR · خلّ شغلك رقمي بدون فريق تقنية",
      description:
        "ALYR شريكك التقني للمنشآت الصغيرة والمتوسطة في قطر: مواقع وأنظمة وأتمتة ومنتجاتنا الخاصة، نجهّزها لك ونتابعها. بالعربية والإنجليزية.",
    },
    chat: {
      title: "ALYR Chat · استقبل الطلبات والحجوزات والدفع في المحادثة",
      description:
        "يحوّل ALYR Chat رسائل عملائك على واتساب إلى طلبات وحجوزات ومدفوعات، ونحن نجهّزه لك. للمطاعم والمقاهي والعيادات والصالونات والمحلات في قطر.",
    },
  },
  skip: "انتقل إلى المحتوى",
  nav: {
    services: "ماذا نقدّم",
    product: "ALYR Chat",
    approach: "كيف نعمل",
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
      "ALYR شريكك التقني للمنشآت الصغيرة والمتوسطة في قطر. مواقع وأنظمة وأتمتة ومنتجاتنا الخاصة: نجهّزها ونربطها ببعض ونتابع عملها.",
    primary: "شاهد ماذا نقدّم",
    secondary: "تعرّف على ALYR Chat",
    facts: ["شريك واحد لكل ما يخص التقنية", "نجهّزها لك ونتابعها", "العربية والإنجليزية جنباً إلى جنب"],
    board: {
      label: "ما تجهّزه ALYR للمنشأة",
      heading: "ما نجهّزه لك",
      rows: [
        { icon: "cloud", title: "موقع ومتجر إلكتروني", detail: "سريع، بلغتين، وملكك", tag: "خدمة" },
        { icon: "users", title: "أنظمة العملاء", detail: "إدارة العملاء والحجوزات والبوابات", tag: "خدمة" },
        { icon: "workflow", title: "الأتمتة", detail: "أدواتك تتكلم مع بعضها", tag: "خدمة" },
        { icon: "dashboard", title: "لوحات المتابعة", detail: "الأرقام التي تراجعها فعلاً", tag: "خدمة" },
        { icon: "check", title: "ALYR Chat", detail: "طلبات وحجوزات ومدفوعات عبر واتساب", tag: "منتجنا", featured: true },
      ],
    },
  },
  why: {
    eyebrow: "لماذا ALYR",
    statement:
      "أغلب المنشآت الصغيرة لا تحتاج تطبيقاً جديداً. تحتاج من يجعل التقنية تعمل مع بعضها، ويشرحها بكلام واضح، ويبقى موجوداً الشهر القادم.",
  },
  services: {
    eyebrow: "ماذا نقدّم",
    title: "كل ما يخص التقنية، في مكان واحد.",
    items: [
      {
        icon: "cloud",
        title: "المواقع والمتاجر الإلكترونية",
        body: "موقع سريع، واضح بالعربية والإنجليزية، ويستقبل الطلبات والاستفسارات.",
      },
      {
        icon: "users",
        title: "أنظمة العملاء",
        body: "إدارة العملاء والحجوزات وبوابات العملاء، حتى لا تبقى المعلومة في هاتف شخص واحد.",
      },
      {
        icon: "workflow",
        title: "الأتمتة والربط",
        body: "نربط الأدوات التي تدفع ثمنها اليوم ونلغي النسخ واللصق بينها.",
      },
      {
        icon: "dashboard",
        title: "لوحات المتابعة والتقارير",
        body: "المبيعات والحجوزات والمبالغ المستحقة في شاشة واحدة ستفتحها فعلاً.",
      },
      {
        icon: "ai",
        title: "مساعدات الذكاء الاصطناعي",
        body: "صياغة الردود وفرز الطلبات والإجابة عن الأسئلة المتكررة، والقرار دائماً بيد إنسان.",
      },
      {
        icon: "settings",
        title: "التجهيز والتدريب والدعم",
        body: "نركّبها، وندرّب فريقك بلغته، ونبقى معك بعد التشغيل.",
      },
    ],
  },
  teaser: {
    eyebrow: "منتجنا الأول",
    title: "ALYR Chat",
    body:
      "استقبل الطلبات والحجوزات والدفع في المحادثة. يواصل عملاؤك مراسلتك على واتساب، ويحوّل ALYR Chat رسائلهم إلى طلبات وحجوزات ومدفوعات يراها فريقك في مكان واحد.",
    cta: "شاهد ALYR Chat",
    figure: {
      label: "محادثة واحدة تصير حجزاً وطلباً ودفعة",
      business: "مشاوي زيتون",
      chat: [
        { from: "customer", text: "طاولة لأربعة الليلة الساعة ٨؟ ونبي المشاوي المشكلة جاهزة أول ما نوصل.", time: "٦:٤٢ م" },
        { from: "business", text: "تم. طاولة لأربعة الساعة ٨:٠٠ م، وطلب المشاوي مسجّل. ادفع مقدماً من هنا.", time: "٦:٤٢ م", action: "ادفع ١٨٠ ر.ق" },
      ],
      via: "ALYR تحوّلها إلى",
      rows: [
        { icon: "calendar", title: "حجز", detail: "طاولة لأربعة · اليوم ٨:٠٠ م", status: "مؤكد" },
        { icon: "document", title: "الطلب 1042", detail: "طبق مشاوي مشكلة", status: "١٨٠ ر.ق" },
        { icon: "check", title: "دفعة", detail: "برابط، إلى حسابك مباشرة", status: "مدفوع", done: true },
      ],
      note: "مثال توضيحي لمطعم غير حقيقي",
    },
  },
  approach: {
    eyebrow: "كيف نعمل",
    title: "أربع خطوات، وفريق واحد.",
    steps: [
      {
        title: "نرى النظام كما هو",
        body: "نبدأ من الطريقة التي يسير بها العمل فعلاً: المحادثات والأوراق والجداول وتسليم المهام.",
      },
      {
        title: "نصمّم الطريقة الأفضل",
        body: "نحذف الخطوات التي لا يحتاجها أحد، ونحدد من المسؤول عن كل خطوة تبقى.",
      },
      {
        title: "نبني ما يشغّلها",
        body: "برمجيات وأتمتة تناسب الطريقة الجديدة، لا العادة القديمة.",
      },
      {
        title: "نبقى حتى تُستخدم",
        body: "ندرّب الفريق، ونقيس ما تغيّر، ونواصل التحسين.",
      },
    ],
  },
  who: {
    eyebrow: "مع من نعمل",
    title: "منشآت يديرها أصحابها وتجاوزت الورق والجداول.",
    rows: [
      { name: "المطاعم والمقاهي", body: "طلب إلكتروني، وقائمة محدّثة دائماً، ومدفوعات تتطابق آخر اليوم." },
      { name: "العيادات والصالونات", body: "حجوزات وتذكيرات وقائمة عملاء لا تضيع بتغيّر موظف الاستقبال." },
      { name: "الخدمات المنزلية والميدانية", body: "جدولة، وتحديثات للعمل، وفواتير تُرسل قبل تحرك الفريق." },
      { name: "المحلات والتجارة", body: "كتالوج، ومخزون تثق به، وحسابات آجلة تُحصَّل." },
    ],
    other: "نشاطك مختلف؟ أخبرنا كيف يسير العمل لديك اليوم.",
  },
  built: {
    eyebrow: "كيف بُني",
    title: "الحرص جزء من التصميم.",
    items: [
      {
        icon: "security",
        title: "المنصات الرسمية فقط",
        body: "نبني على الأدوات الرسمية لواتساب ومزوّدي الدفع والمنصات السحابية. لا طرق مختصرة تعرّض عملك للخطر.",
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
  cta: {
    title: "أخبرنا ما الذي يعطّل عملك.",
    body:
      "موقع، أو نظام، أو إجراء متعب، أو سؤال عن التقنية. يردّ عليك شخص من ALYR بالعربية أو الإنجليزية.",
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
  product: {
    eyebrow: "ALYR Chat · وصول مبكر",
    title: "استقبل الطلبات والحجوزات والدفع في المحادثة.",
    body:
      "يواصل عملاؤك مراسلتك كما اعتادوا. ويضيف ALYR Chat الحجز والطلب ورابط الدفع والتحديثات، وفريقك يرى كل شيء في مكان واحد.",
    business: "دانة للخدمات المنزلية",
    businessMeta: "حساب أعمال",
    today: "اليوم",
    typeHere: "مراسلة",
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
          { from: "staff", text: "نعم، ضمان ١٢ شهراً. سأحضر الفاتورة معي غداً." },
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
    why: {
      eyebrow: "لماذا يختاره أصحاب الأعمال",
      statement:
        "عملاؤك يراسلونك قبل أن يزوروك أو يطلبوا. تضيع المحادثات، وتُكتب الطلبات على الورق، ويصير الدفع صورة تحويل. والأعمال الرابحة تجعل المحادثة واجهة محلها.",
      pillars: [
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
    next: {
      eyebrow: "ما القادم",
      body:
        "نبدأ من المحادثة. ومع نموّ عملك تضيف ALYR المدفوعات والحسابات والموقع، كلها على قائمة العملاء نفسها.",
    },
    cta: {
      title: "دعنا نجهّزها لك.",
      body:
        "أخبرنا كيف تستقبل الطلبات والحجوزات اليوم. يردّ عليك شخص من ALYR بالعربية أو الإنجليزية، ويريك العمل نفسه على قائمتك أو أسعارك.",
    },
  },
};

export const copy: Record<Locale, Copy> = { en, ar };
