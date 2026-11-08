// The homepage's "One workspace for every kind of business" mosaic (ALY-330, founder's brief of
// 8 Nov 2026, item 5): every solution ALYR has today, each as one card with its own drawn
// screen. The six products reuse the product names, descriptors and states from `copy.ts`
// (`products.items`) and their screen fragments from SuiteFrame.tsx; this file holds the rest.
//
// Honest by construction (honesty.md): the products are described as set up with each
// business, never as running for businesses; ALYR Docs is built and off for every shop, so its
// card says it is set up with you; the check-up and the monthly review are done by our team
// (the software for them is not built); the Sunday report is left out (built, never sent to an
// owner); payment links are not shown. No AI wording. The figures are the fictional Qirfa
// Bakery's, marked as a sample once, in the section's head. Arabic is a draft until ALY-66.

export type WorkspaceCardKey =
  | "chat" | "bookings" | "agent" | "accounts" | "shelf" | "docs"
  | "checkup" | "pages" | "monthly";

/** The words on one card: a small label, a one-sentence headline and at most one line. */
export type WorkspaceCard = { chip: string; title: string; line: string };

export type WorkspaceGridCopy = {
  title: string;
  lead: string;
  /** The one "Sample" mark of the whole grid, beside the fictional shop's name. */
  sample: string;
  shop: string;
  cards: Record<WorkspaceCardKey, WorkspaceCard>;
  /** The check-up card names who does the work; the review card likewise. */
  team: string;
  /** The customer's order page, as drawn on the "Your own pages" card. */
  pages: {
    soldOut: string;
    items: { name: string; price: string; note?: string; tone?: "few" | "out" }[];
  };
  /** The three actions drawn on the monthly review card (a sample's, each tied to a number). */
  monthly: { actions: [string, string, string] };
  /** The grid's accessible name. */
  label: string;
};

export const workspaceGridEn: WorkspaceGridCopy = {
  title: "One workspace for\nevery kind of business.",
  lead: "Six products on one record, and the work our team does with you.",
  sample: "Sample",
  shop: "Qirfa Bakery",
  team: "Done by our team",
  label: "Everything ALYR does, on one grid",
  cards: {
    chat: {
      chip: "Inbox",
      title: "Orders and questions from WhatsApp, in one team inbox.",
      line: "Each order is tracked from confirmed to complete.",
    },
    bookings: {
      chip: "Appointments",
      title: "Appointments from the chat, with a reminder before each.",
      line: "Two customers can never take the same slot.",
    },
    agent: {
      chip: "Numbers",
      title: "What needs you today, and your week in numbers.",
      line: "Each line says what it counted.",
    },
    accounts: {
      chip: "Credit",
      title: "Who owes you, and for how long.",
      line: "Reminders go when you press Send.",
    },
    shelf: {
      chip: "Stock",
      title: "Your items with prices, sizes and stock.",
      line: "Sold out shows on the order page, so nothing sells twice.",
    },
    docs: {
      chip: "Paperwork",
      title: "Receipts and invoices from your sales.",
      line: "Arabic first, English beneath.",
    },
    checkup: {
      chip: "The check-up",
      title: "How customers find you and choose you, counted.",
      line: "Five numbers, recorded as your starting point.",
    },
    pages: {
      chip: "Your own pages",
      title: "An order page and a booking page of your own.",
      line: "With a QR card for your counter, in Arabic and English.",
    },
    monthly: {
      chip: "The monthly review",
      title: "Each month, the five numbers again, and three things to do next.",
      line: "We count them with you.",
    },
  },
  pages: {
    soldOut: "Sold out",
    items: [
      { name: "Pistachio kunafa cheesecake", price: "QAR 85", note: "Only 1 left today", tone: "few" },
      { name: "Saffron milk cake, slice", price: "QAR 26", tone: "out" },
    ],
  },
  monthly: {
    actions: [
      "Reply to enquiries within 30 minutes.",
      "Add your hours and photos to your Google profile.",
      "Write to customers who have not been back in 60 days.",
    ],
  },
};

export const workspaceGridAr: WorkspaceGridCopy = {
  title: "مساحة عمل واحدة\nلكل نوع من الأنشطة.",
  lead: "ستة منتجات على سجل واحد، والعمل الذي يقوم به فريقنا معك.",
  sample: "مثال",
  shop: "مخبز قرفة",
  team: "يجريه فريقنا",
  label: "كل ما تقدّمه ALYR في شبكة واحدة",
  cards: {
    chat: {
      chip: "الوارد",
      title: "طلبات واتساب وأسئلته في صندوق واحد للفريق.",
      line: "يُتابَع كل طلب من التأكيد إلى الاكتمال.",
    },
    bookings: {
      chip: "المواعيد",
      title: "مواعيد من المحادثة، مع تذكير قبل كل موعد.",
      line: "لا يحجز عميلان الموعد نفسه.",
    },
    agent: {
      chip: "الأرقام",
      title: "ما يحتاجك اليوم، وأسبوعك بالأرقام.",
      line: "كل سطر يذكر ما جرى عدّه.",
    },
    accounts: {
      chip: "الآجل",
      title: "من عليه مستحقات لك، ومنذ متى.",
      line: "تُرسل التذكيرات حين تضغط إرسال.",
    },
    shelf: {
      chip: "المخزون",
      title: "أصنافك بأسعارها ومقاساتها ومخزونها.",
      line: "يظهر النفاد في صفحة الطلب، فلا يُباع الصنف مرتين.",
    },
    docs: {
      chip: "المستندات",
      title: "إيصالات وفواتير من مبيعاتك.",
      line: "بالعربية أولاً، والإنجليزية تحتها.",
    },
    checkup: {
      chip: "الفحص",
      title: "كيف يجدك العملاء ولماذا يختارونك، بالأرقام.",
      line: "خمسة أرقام تُسجَّل نقطةَ بداية لك.",
    },
    pages: {
      chip: "صفحاتك",
      title: "صفحة طلب وصفحة حجز خاصتان بنشاطك.",
      line: "مع بطاقة QR لكاونترك، بالعربية والإنجليزية.",
    },
    monthly: {
      chip: "المراجعة الشهرية",
      title: "كل شهر، الأرقام الخمسة من جديد وثلاثة أمور نعمل عليها.",
      line: "نعدّها معك.",
    },
  },
  pages: {
    soldOut: "نفد",
    items: [
      { name: "تشيز كيك الكنافة بالفستق", price: "85 ر.ق", note: "المتبقي اليوم 1 فقط", tone: "few" },
      { name: "كيك الحليب بالزعفران، قطعة", price: "26 ر.ق", tone: "out" },
    ],
  },
  monthly: {
    actions: [
      "الردّ على الاستفسارات خلال 30 دقيقة.",
      "إضافة ساعات عملك وصورك إلى ملفك في جوجل.",
      "مراسلة العملاء الذين لم يعودوا منذ 60 يوماً.",
    ],
  },
};
