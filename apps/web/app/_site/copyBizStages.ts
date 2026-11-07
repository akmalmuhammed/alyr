// The words of the homepage's "your business, in four stages" section (ALY-330), English and
// Arabic: what ALYR sets up for each kind of business at Discover, Convert, Manage and Scale.
// The business's name, its day split by the fold, its sample chats and its message to us come
// from `home.business` in copy.ts; only the four lines are new. Rules for the lines:
// - Discover and Scale are done by the team today (the check-up and the monthly review), so
//   they say "our team" and name no product; a product is named only where it is built and on.
// - Convert and Manage name only built products (ALYR Chat, Shelf, Bookings, Accounts, Agent).
//   ALYR Docs is not named: it is built and off for every shop (D-039, honesty.md).
// - No payment link (payments are on hold), nothing coming, no AI wording, no numbers.
// The Arabic is a draft until the native review (ALY-66).

import type { ProductKey } from "./site";

/** One business's four lines. `convertOn` and `manageOn` are the built products each line runs on. */
export type BizStageRow = {
  discover: string;
  convert: string;
  convertOn: ProductKey[];
  manage: string;
  manageOn: ProductKey[];
};

export type BizStagesCopy = {
  eyebrow: string;
  title: string;
  /** The tab row's name, for screen readers. */
  tabsLabel: string;
  /** The four stages, in order: its name and the few words under it. */
  stages: { id: "discover" | "convert" | "manage" | "scale"; name: string; tagline: string }[];
  /** The label before the products a line runs on, and the label of a line our team does. */
  runsOn: string;
  team: string;
  /** Read before each panel's four stages, with the business's name after it. */
  listLabel: string;
  /** The last stage is the same for every business. */
  scale: { line: string; on: ProductKey[] };
  /** One line per business, by the id of its tab (#bakery). */
  rows: Record<string, BizStageRow>;
  /** Under the fold, in the Convert stage's words. */
  foldNote: string;
};

export const bizStagesEn: BizStagesCopy = {
  eyebrow: "By business",
  title: "Tell us your business.\nSee your four stages.",
  tabsLabel: "Businesses",
  stages: [
    { id: "discover", name: "Discover", tagline: "Be found" },
    { id: "convert", name: "Convert", tagline: "Win the sale" },
    { id: "manage", name: "Manage", tagline: "Run the day" },
    { id: "scale", name: "Scale", tagline: "Grow" },
  ],
  runsOn: "Runs on",
  team: "Our team",
  listLabel: "The four stages for",
  scale: {
    line: "Each month our team goes through your numbers with you and picks three things to improve.",
    on: ["agent"],
  },
  foldNote: "The same hour, today and with ALYR.",
  rows: {
    bakery: {
      discover: "Our team looks at how customers find your bakery today, and fixes what is missing.",
      convert: "Customers order from your menu page in the chat, and every order lands on one screen.",
      convertOn: ["chat", "shelf"],
      manage: "Office regulars order on account. You see who owes what and send reminders with one press.",
      manageOn: ["accounts", "agent"],
    },
    groceries: {
      discover: "Our team looks at how customers find your shop today, and fixes what is missing.",
      convert: "Customers order from a menu page in the chat, and every order lands on one screen.",
      convertOn: ["chat", "shelf"],
      manage: "Credit sales are written down and a customer gets their balance when they ask.",
      manageOn: ["accounts", "agent"],
    },
    wholesale: {
      discover: "Our team looks at how new buyers find you today, and fixes what is missing.",
      convert: "Each customer group has its own prices, and customers order from the page or by an item’s code.",
      convertOn: ["chat", "shelf"],
      manage: "See who owes how much and for how long, and send reminders whose tone fits how late it is.",
      manageOn: ["accounts", "agent"],
    },
    fashion: {
      discover: "Our team looks at how customers find your shop today, and fixes what is missing.",
      convert: "Customers order from your catalog page in the chat, and what has sold out says so.",
      convertOn: ["chat", "shelf"],
      manage: "Orders and stock on one screen, with the week’s orders counted for you.",
      manageOn: ["shelf", "agent"],
    },
    restaurant: {
      discover: "Our team looks at how customers find your restaurant today, and fixes what is missing.",
      convert: "Customers order from your menu page in the chat, and your team sees each order on one screen.",
      convertOn: ["chat", "shelf"],
      manage: "Companies that order on account are tracked, with payment reminders.",
      manageOn: ["accounts", "agent"],
    },
    salon: {
      discover: "Our team looks at how customers find your salon today, and fixes what is missing.",
      convert: "Customers pick a free time in the chat, and the confirmation goes at once.",
      convertOn: ["bookings"],
      manage: "A reminder goes two hours before each visit, and the no-shows are counted.",
      manageOn: ["bookings", "agent"],
    },
    "home-services": {
      discover: "Our team looks at how customers find your company today, and fixes what is missing.",
      convert: "Visits are booked from the chat, with a reminder before each, and parts are ordered from a page.",
      convertOn: ["bookings", "chat"],
      manage: "Contract customers are on account, with payment reminders.",
      manageOn: ["accounts", "agent"],
    },
  },
};

export const bizStagesAr: BizStagesCopy = {
  eyebrow: "حسب النشاط",
  title: "أخبرنا بنشاطك،\nوشاهد مراحله الأربع.",
  tabsLabel: "الأنشطة",
  stages: [
    { id: "discover", name: "الاستكشاف", tagline: "أن يجدك العملاء" },
    { id: "convert", name: "إتمام البيع", tagline: "من السؤال إلى الطلب" },
    { id: "manage", name: "الإدارة", tagline: "تسيير اليوم" },
    { id: "scale", name: "التوسّع", tagline: "النمو" },
  ],
  runsOn: "يعمل عبر",
  team: "فريقنا",
  listLabel: "المراحل الأربع لنشاط",
  scale: {
    line: "كل شهر يراجع فريقنا أرقامك معك ونختار ثلاثة أمور لتحسينها.",
    on: ["agent"],
  },
  foldNote: "الساعة نفسها، اليوم ومع ALYR.",
  rows: {
    bakery: {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "يطلب العملاء من صفحة قائمتك داخل المحادثة، ويصل كل طلب إلى شاشة واحدة.",
      convertOn: ["chat", "shelf"],
      manage: "عملاء المكاتب يطلبون على الحساب. تعرف من عليه كم، وترسل التذكيرات بضغطة واحدة.",
      manageOn: ["accounts", "agent"],
    },
    groceries: {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "يطلب العملاء من صفحة قائمة داخل المحادثة، ويصل كل طلب إلى شاشة واحدة.",
      convertOn: ["chat", "shelf"],
      manage: "تُسجَّل المبيعات الآجلة، ويصل العميل رصيده حين يسأل عنه.",
      manageOn: ["accounts", "agent"],
    },
    wholesale: {
      discover: "يفحص فريقنا كيف يجدك المشترون الجدد اليوم، ويُصلح ما ينقص.",
      convert: "لكل مجموعة عملاء أسعارها، ويطلب العملاء من الصفحة أو برمز الصنف.",
      convertOn: ["chat", "shelf"],
      manage: "تعرف من عليه كم ومنذ متى، وترسل تذكيرات تناسب نبرتُها مدى التأخر.",
      manageOn: ["accounts", "agent"],
    },
    fashion: {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "يطلب العملاء من صفحة كتالوجك داخل المحادثة، وما نفد يظهر أنه نفد.",
      convertOn: ["chat", "shelf"],
      manage: "الطلبات والمخزون على شاشة واحدة، وطلبات الأسبوع محسوبة لك.",
      manageOn: ["shelf", "agent"],
    },
    restaurant: {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "يطلب العملاء من صفحة قائمتك داخل المحادثة، ويرى فريقك كل طلب على شاشة واحدة.",
      convertOn: ["chat", "shelf"],
      manage: "الشركات التي تطلب على الحساب متابَعة، مع تذكيرات بالدفع.",
      manageOn: ["accounts", "agent"],
    },
    salon: {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "يختار العملاء موعداً متاحاً داخل المحادثة، ويصلهم التأكيد فوراً.",
      convertOn: ["bookings"],
      manage: "يصل تذكير قبل كل زيارة بساعتين، ويُحسب من لم يحضر.",
      manageOn: ["bookings", "agent"],
    },
    "home-services": {
      discover: "يفحص فريقنا كيف يجدك العملاء اليوم، ويُصلح ما ينقص.",
      convert: "تُحجز الزيارات من المحادثة مع تذكير قبل كل زيارة، وتُطلب القطع من صفحة.",
      convertOn: ["bookings", "chat"],
      manage: "عملاء العقود على الحساب، مع تذكيرات بالدفع.",
      manageOn: ["accounts", "agent"],
    },
  },
};

export const bizStagesCopy = { en: bizStagesEn, ar: bizStagesAr };
