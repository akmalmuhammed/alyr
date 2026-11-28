// The words the final screen pass (agent P3) adds, in English and Arabic: ALYR's own records on This
// week, Checks and the Why sheet; the steps only the owner takes, folded; the Answers screen while it
// is still counting; review replies on Proof; and what a value that was empty is called. Components
// hold no text. Whole sentences per language; counts through `counted()`; Western digits. No first
// person and no AI words. The Arabic is a careful draft for the native reviewer (ALY-66).

import { counted, isolate, type Noun } from "../../../_ui/format.ts";
import type { DayKey } from "../discoveryApi.ts";

const n = (value: number) => value.toLocaleString("en");

const N = {
  order: { en: ["order", "orders"], ar: ["طلب واحد", "طلبان", "طلبات", "طلباً"] },
  booking: { en: ["booking", "bookings"], ar: ["حجز واحد", "حجزان", "حجوزات", "حجزاً"] },
  answer: { en: ["answer", "answers"], ar: ["إجابة واحدة", "إجابتان", "إجابات", "إجابة"] },
  tool: { en: ["answer tool", "answer tools"], ar: ["أداة إجابة واحدة", "أداتا إجابة", "أدوات إجابة", "أداة إجابة"] },
  point: { en: ["point", "points"], ar: ["نقطة واحدة", "نقطتان", "نقاط", "نقطة"] },
  star: { en: ["star", "stars"], ar: ["نجمة واحدة", "نجمتان", "نجوم", "نجمة"] },
  check: { en: ["check", "checks"], ar: ["فحص واحد", "فحصان", "فحوصات", "فحصاً"] },
} satisfies Record<string, Noun>;

/** Which of the two a business takes through ALYR: both, orders only or bookings only. */
export type Counted = "both" | "orders" | "bookings";

const DAYS_EN: Record<DayKey, [one: string, many: string, short: string]> = {
  sat: ["Saturday", "Saturdays", "Sat"], sun: ["Sunday", "Sundays", "Sun"], mon: ["Monday", "Mondays", "Mon"],
  tue: ["Tuesday", "Tuesdays", "Tue"], wed: ["Wednesday", "Wednesdays", "Wed"], thu: ["Thursday", "Thursdays", "Thu"], fri: ["Friday", "Fridays", "Fri"],
};
const DAYS_AR: Record<DayKey, string> = {
  sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة",
};
const listEn = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const listAr = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join("، ")} و${items[items.length - 1]}`);

const totalsEn = (orders: number | null, bookings: number | null) =>
  [orders !== null ? counted(orders, N.order, "en") : "", bookings !== null ? counted(bookings, N.booking, "en") : ""].filter(Boolean).join(" and ");
const totalsAr = (orders: number | null, bookings: number | null) =>
  [orders !== null ? counted(orders, N.order, "ar") : "", bookings !== null ? counted(bookings, N.booking, "ar") : ""].filter(Boolean).join(" و");
const whatEn: Record<Counted, string> = { both: "Orders or bookings", orders: "Orders", bookings: "Bookings" };
const whatAr: Record<Counted, string> = { both: "وصلت طلبات أو حجوزات", orders: "وصلت طلبات", bookings: "وصلت حجوزات" };

export const T3 = {
  en: {
    // ── ALYR's own records (This week, the Why sheet, Checks) ──
    ownTitle: "Your own records in ALYR",
    ownSub: (from: string, to: string) => `Orders and bookings counted in ALYR from ${from} to ${to}. Your listed hours are checked against them.`,
    ownSource: (label: string, when: string) => `${label} · read ${when}`,
    dayShort: (day: DayKey) => DAYS_EN[day][2],
    dayMany: (day: DayKey) => DAYS_EN[day][1],
    pointAll: (what: Counted, busiest: DayKey | null, orders: number | null, bookings: number | null, weeks: number) => (busiest
      ? `${whatEn[what]} came in on every day of the week; ${DAYS_EN[busiest][1]} were the busiest, with ${totalsEn(orders, bookings)} in ${n(weeks)} weeks.`
      : `${whatEn[what]} came in on every day of the week.`),
    pointQuiet: (quiet: DayKey[], busiest: DayKey | null, orders: number | null, bookings: number | null, weeks: number) => (busiest
      ? `${DAYS_EN[busiest][1]} were the busiest, with ${totalsEn(orders, bookings)} in ${n(weeks)} weeks; nothing came in on ${listEn(quiet.map((d) => DAYS_EN[d][1]))}.`
      : `Nothing came in on ${listEn(quiet.map((d) => DAYS_EN[d][1]))} in ${n(weeks)} weeks.`),
    busiest: "Busiest",
    barValue: (orders: number | null, bookings: number | null) => [orders, bookings].filter((x): x is number => x !== null).map(n).join(" + "),
    dayAria: (day: DayKey, orders: number | null, bookings: number | null) => `${DAYS_EN[day][1]}: ${totalsEn(orders, bookings)}`,
    weekTotals: (orders: number | null, bookings: number | null, weeks: number) => `${totalsEn(orders, bookings)} in ${n(weeks)} weeks`,
    ownEmptyTitle: "No orders or bookings in ALYR in the last 4 weeks yet.",
    ownEmptyBody: "When customers order or book through ALYR, each day shows here, and your listed hours are checked against it.",
    ownOffTitle: "Orders and bookings are not taken through ALYR yet.",
    ownOffBody: "So ALYR has no records of its own to set against your listed hours. The checks of your listing still run.",
    ownPartial: "ALYR started counting during these 4 weeks, so the first days may show less than came in. The hours check waits for 4 full weeks.",
    ownInTicket: "In ALYR, the last 4 weeks",
    // ── Checks: the "Your own data" group's facts ──
    factsTitle: "What ALYR's own records hold",
    fActivity: "Orders and bookings, last 4 weeks",
    fPages: "Your pages on ALYR",
    fBookingPage: "Booking page",
    fOrderPage: "Order page",
    fWhatsapp: "Your confirmed WhatsApp number",
    fNames: "Your name in ALYR",
    fNotOn: "Not taken through ALYR",
    countsOnly: "Your role sees the counts only. The owner sees the pages, the number and the names.",
    // ── This week: the steps only the owner takes, folded ──
    stepShow: "Show the step",
    stepHide: "Hide the step",
    stepWebsite: "On your website",
    stepYourself: "You do this",
    // ── a value that was empty, named for what it is ──
    noneOf: { hours: "No hours", category: "No category", name: "No name", phone: "No phone number", whatsapp_link: "No WhatsApp link", review_reply: "No reply" } as Record<string, string>,
    noneOther: "Empty",
    // ── Proof: review replies ──
    replyTo: (stars: number, author: string) => (author ? `Review by ${author}, rated ${counted(stars, N.star, "en")}` : `Review rated ${counted(stars, N.star, "en")}`),
    replyLang: (lang: string) => (lang === "ar" ? "Reply in Arabic, the language of the review" : "Reply in English, the language of the review"),
    replyLabel: "The reply",
    // ── Answers while it is still counting ──
    neTitle: "Still counting answers.",
    neSub: (topic: string, en: number, ar: number, tools: number) =>
      `A share is named only from 30 answers per answer tool in each language. ${topic ? `About ${topic}, there are` : "There are"} ${counted(en, N.answer, "en")} in English and ${counted(ar, N.answer, "en")} in Arabic so far, from ${counted(tools, N.tool, "en")}.`,
    progTitle: "Toward 30 answers",
    progRow: (count: number) => `${n(count)} of 30 counted`,
    progNamed: (named: number) => (named === 0 ? "Not named yet" : named === 1 ? "Named in 1" : `Named in ${n(named)}`),
    progLeft: (left: number) => `${n(left)} to go`,
    progAria: (name: string, count: number, named: number) => `${name}: ${n(count)} of 30 answers counted, named in ${n(named)}.`,
    whyTitle: "Why 30",
    whyBody: (most: number, swing: number) => `With ${counted(most, N.answer, "en")}, one answer more or less moves a share by ${counted(swing, N.point, "en")}. With 30, it moves it by about 3, so a share starts to say something.`,
    nextTitle: "Next count",
    nextAt: (when: string) => `The weekly check-up asks again on ${when}.`,
    nextManual: "The next count comes with the next check-up started from Checks.",
    soFarTitle: "Counted so far",
    // ── Set up ──
    sameCount: (count: number) => `Each kind is checked against ${counted(count, N.check, "en")}; the kind decides which ones.`,
  },
  ar: {
    ownTitle: "سجلاتك في ALYR",
    ownSub: (from: string, to: string) => `الطلبات والحجوزات المحسوبة في ALYR من ${isolate(from)} إلى ${isolate(to)}. وتُقارَن بها ساعات عملك المنشورة.`,
    ownSource: (label: string, when: string) => `${label} · قُرئت ${isolate(when)}`,
    dayShort: (day: DayKey) => DAYS_AR[day],
    dayMany: (day: DayKey) => `أيام ${DAYS_AR[day]}`,
    pointAll: (what: Counted, busiest: DayKey | null, orders: number | null, bookings: number | null, weeks: number) => (busiest
      ? `${whatAr[what]} في كل أيام الأسبوع، وكانت أيام ${DAYS_AR[busiest]} الأكثر ازدحاماً: ${totalsAr(orders, bookings)} خلال ${n(weeks)} أسابيع.`
      : `${whatAr[what]} في كل أيام الأسبوع.`),
    pointQuiet: (quiet: DayKey[], busiest: DayKey | null, orders: number | null, bookings: number | null, weeks: number) => (busiest
      ? `كانت أيام ${DAYS_AR[busiest]} الأكثر ازدحاماً: ${totalsAr(orders, bookings)} خلال ${n(weeks)} أسابيع، ولم يصل شيء أيام ${listAr(quiet.map((d) => DAYS_AR[d]))}.`
      : `لم يصل شيء أيام ${listAr(quiet.map((d) => DAYS_AR[d]))} في ${n(weeks)} أسابيع.`),
    busiest: "الأكثر",
    barValue: (orders: number | null, bookings: number | null) => [orders, bookings].filter((x): x is number => x !== null).map(n).join(" + "),
    dayAria: (day: DayKey, orders: number | null, bookings: number | null) => `أيام ${DAYS_AR[day]}: ${totalsAr(orders, bookings)}`,
    weekTotals: (orders: number | null, bookings: number | null, weeks: number) => `${totalsAr(orders, bookings)} في ${n(weeks)} أسابيع`,
    ownEmptyTitle: "لا طلبات ولا حجوزات في ALYR خلال آخر 4 أسابيع بعد.",
    ownEmptyBody: "حين يطلب العملاء أو يحجزون عبر ALYR، يظهر كل يوم هنا، وتُقارَن به ساعات عملك المنشورة.",
    ownOffTitle: "لا تُستقبل الطلبات والحجوزات عبر ALYR بعد.",
    ownOffBody: "لذلك لا سجلات لدى ALYR تقارن بها ساعات عملك المنشورة. وتبقى فحوصات ملفك التجاري جارية.",
    ownPartial: "بدأت ALYR العدّ خلال هذه الأسابيع الأربعة، فقد تُظهر الأيام الأولى أقل مما وصل. وينتظر فحص الساعات 4 أسابيع كاملة.",
    ownInTicket: "في ALYR، آخر 4 أسابيع",
    factsTitle: "ما تحفظه سجلات ALYR",
    fActivity: "الطلبات والحجوزات، آخر 4 أسابيع",
    fPages: "صفحاتك على ALYR",
    fBookingPage: "صفحة الحجز",
    fOrderPage: "صفحة الطلب",
    fWhatsapp: "رقم واتساب المؤكَّد",
    fNames: "اسمك في ALYR",
    fNotOn: "لا تُستقبل عبر ALYR",
    countsOnly: "يرى دورك الأعداد فقط. ويرى المالك الصفحات والرقم والأسماء.",
    stepShow: "اعرض الخطوة",
    stepHide: "أخفِ الخطوة",
    stepWebsite: "في موقعك",
    stepYourself: "تقوم بها أنت",
    noneOf: { hours: "بلا ساعات", category: "بلا تصنيف", name: "بلا اسم", phone: "بلا رقم هاتف", whatsapp_link: "بلا رابط واتساب", review_reply: "بلا رد" } as Record<string, string>,
    noneOther: "فارغ",
    replyTo: (stars: number, author: string) => (author ? `مراجعة كتبها ${isolate(author)}، تقييمها ${counted(stars, N.star, "ar")}` : `مراجعة تقييمها ${counted(stars, N.star, "ar")}`),
    replyLang: (lang: string) => (lang === "ar" ? "الرد بالعربية، لغة المراجعة" : "الرد بالإنجليزية، لغة المراجعة"),
    replyLabel: "الرد",
    neTitle: "ما زال عدّ الإجابات جارياً.",
    neSub: (topic: string, en: number, ar: number, tools: number) =>
      `لا تُذكر نسبة إلا من 30 إجابة لكل أداة في كل لغة. ${topic ? `وعن ${topic} ` : ""}وصلت حتى الآن ${counted(en, N.answer, "ar")} بالإنجليزية و${counted(ar, N.answer, "ar")} بالعربية، من ${counted(tools, N.tool, "ar")}.`,
    progTitle: "نحو 30 إجابة",
    progRow: (count: number) => `حُسبت ${n(count)} من 30`,
    progNamed: (named: number) => (named === 0 ? "لم يُذكر بعد" : `ذُكر في ${n(named)}`),
    progLeft: (left: number) => `بقي ${n(left)}`,
    progAria: (name: string, count: number, named: number) => `${name}: حُسبت ${n(count)} من 30 إجابة، وذُكر نشاطك في ${n(named)}.`,
    whyTitle: "لماذا 30",
    whyBody: (most: number, swing: number) => `مع ${counted(most, N.answer, "ar")}، تحرّك إجابةٌ واحدة زائدة أو ناقصة النسبةَ ${counted(swing, N.point, "ar")}. ومع 30 تحرّكها نحو 3 نقاط، فتبدأ النسبة تعني شيئاً.`,
    nextTitle: "العدّ التالي",
    nextAt: (when: string) => `يسأل الفحص الأسبوعي مجدداً ${isolate(when)}.`,
    nextManual: "يأتي العدّ التالي مع الفحص التالي الذي يبدأ من صفحة الفحوصات.",
    soFarTitle: "ما حُسب حتى الآن",
    sameCount: (count: number) => `لكل نوع ${counted(count, N.check, "ar")}، والنوع يحدّد أيّها.`,
  },
};

export type Copy3 = (typeof T3)["en"];
