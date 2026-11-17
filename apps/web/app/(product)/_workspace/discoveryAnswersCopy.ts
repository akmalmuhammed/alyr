// Every word the Answers view says, in English and Arabic, in one place (ALY-326, spec 068,
// D-168). The components hold no text. Both languages are written against one shape, so a missing
// Arabic line is a type error, not a hole on a phone. The Arabic is a draft until ALY-66.
//
// Words (docs honesty.md): this view is about what other tools answer, so it says "answer tools"
// and "answers" («أدوات الإجابة»، «الإجابات»). It never says AI or assistant, never names a
// product, never says ALYR asks a model, and never says what an answer tool "knows" or "thinks":
// it says what was counted. What comes from the API already in the reader's language (the
// headline, the rule line, the limits, the caution, an answer's error, the sample note) is not here.

import type { Lang } from "./lang";

/** Arabic count with its noun: 1 and 2 are words, 3 to 10 the plural, 11 and more the singular. */
function an(n: number, one: string, two: string, few: string, many: string): string {
  return n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}
const pl = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/** English ordinal: 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n: number): string {
  const last = n % 100;
  if (last >= 11 && last <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const answersAr = (n: number) => an(n, "إجابة واحدة", "إجابتان", "إجابات", "إجابة");

const en = {
  intro: "When people ask an answer tool for your trade in your city, is your business named? ALYR asks a few plain public questions and counts the answers.",
  partName: "Answers",
  partHint: "How often your business is named when people ask answer tools for your trade in your city",

  // ── not switched on ──────────────────────────────────
  offTitle: "Not switched on",
  offText: "Choose your trade and your city, then switch it on. The next check-up asks six plain questions, such as \"best car care in Doha\", and counts the answers.",
  offAgent: "The owner or an admin can switch this on.",
  switchOn: "Switch on",
  switchOff: "Switch off",
  save: "Save",
  tradeLabel: "Your trade",
  cityLabel: "Your city",
  chooseOne: "Choose one",
  switchedOn: "Switched on. The next check-up asks the questions.",
  switchedOff: "Switched off. What was asked stays here.",
  saved: "Saved.",

  // ── the questions ────────────────────────────────────
  questionsTitle: "The questions",
  questionsNote: "These are the only questions asked. They name no business, no person and no number, and you choose the trade and the city from lists.",
  readOnlyLine: (trade: string, city: string) => `Trade: ${trade}. City: ${city}.`,
  notAskedYet: "Not asked yet. The next check-up asks these questions.",
  inEnglish: "English",
  inArabic: "Arabic",

  // ── a check-up in progress ───────────────────────────
  running: "Check-up running",
  runningText: "The questions are asked as part of the check-up. This page updates when it is done.",
  slow: "This is taking longer than usual. Check again in a moment.",
  checkNow: "Check now",
  asked: "Asked",

  // ── the result ───────────────────────────────────────
  answersTitle: "Answer by answer",
  named: "Named",
  notNamed: "Not named",
  notCounted: "Not counted",
  inList: (n: number, size: number) => `${ordinal(n)} in a list of ${size}`,
  inSentence: "Named in a sentence, not in a list",
  alsoNamed: "Also named",
  whatItSaid: "What it said",
  matchedOn: (words: string) => `Matched on: ${words}`,
  sourceLabel: "Source",
  languageLabel: "Question asked in",

  competitorsTitle: "Also named in the answers",
  competitorsNote: "Other businesses the answers list, counted by name as the answers wrote them.",
  competitorsNone: "No other names were listed.",
  inAnswers: (n: number) => `in ${pl(n, "answer", "answers")}`,

  historyTitle: "Check-up by check-up",
  namedOf: (named: number, counted: number) => `Named in ${named} of ${pl(counted, "answer", "answers")}`,
  tooFew: "Too few answers counted to measure",

  howTitle: "How this is counted",

  // ── Home and Reports ─────────────────────────────────
  homeLink: "See the answers",
};

const ar: typeof en = {
  intro: "عندما يسأل الناس إحدى أدوات الإجابة عن مجالك في مدينتك، هل يُذكر نشاطك؟ يطرح ALYR بضعة أسئلة عامة وبسيطة ويحسب الإجابات.",
  partName: "الإجابات",
  partHint: "عدد المرات التي يُذكر فيها نشاطك عندما يسأل الناس أدوات الإجابة عن مجالك في مدينتك",

  offTitle: "غير مفعّل",
  offText: "اختر مجالك ومدينتك ثم فعّل الفحص. يطرح الفحص التالي ستة أسئلة عامة، مثل «أفضل خدمات العناية بالسيارات في الدوحة»، ويحسب الإجابات.",
  offAgent: "يستطيع المالك أو المدير تفعيل هذا.",
  switchOn: "تفعيل",
  switchOff: "إيقاف",
  save: "حفظ",
  tradeLabel: "مجالك",
  cityLabel: "مدينتك",
  chooseOne: "اختر واحداً",
  switchedOn: "تم التفعيل. سيطرح الفحص التالي الأسئلة.",
  switchedOff: "تم الإيقاف. ما طُرح من قبل يبقى هنا.",
  saved: "تم الحفظ.",

  questionsTitle: "الأسئلة",
  questionsNote: "هذه هي الأسئلة الوحيدة التي تُطرح. لا تذكر أي نشاط ولا شخصاً ولا رقماً، وتختار المجال والمدينة من قوائم.",
  readOnlyLine: (trade, city) => `المجال: ${trade}. المدينة: ${city}.`,
  notAskedYet: "لم تُطرح بعد. سيطرحها الفحص التالي.",
  inEnglish: "الإنجليزية",
  inArabic: "العربية",

  running: "الفحص جارٍ",
  runningText: "تُطرح الأسئلة ضمن الفحص. تتحدّث هذه الصفحة عند انتهائه.",
  slow: "يستغرق هذا وقتاً أطول من المعتاد. تحقق بعد قليل.",
  checkNow: "تحقق الآن",
  asked: "طُرحت",

  answersTitle: "إجابة بإجابة",
  named: "ذُكر",
  notNamed: "لم يُذكر",
  notCounted: "لم تُحتسب",
  inList: (n, size) => `في المرتبة ${n} ضمن قائمة من ${size}`,
  inSentence: "ذُكر في جملة، وليس في قائمة",
  alsoNamed: "ذُكر أيضاً",
  whatItSaid: "ما جاء في الإجابة",
  matchedOn: (words) => `طابقت: ${words}`,
  sourceLabel: "المصدر",
  languageLabel: "لغة السؤال",

  competitorsTitle: "أسماء أخرى في الإجابات",
  competitorsNote: "نشاطات أخرى تذكرها الإجابات في قوائمها، تُعدّ بالاسم كما كتبته الإجابات.",
  competitorsNone: "لم تُذكر أسماء أخرى في قوائم الإجابات.",
  inAnswers: (n) => `في ${answersAr(n)}`,

  historyTitle: "فحصاً بفحص",
  namedOf: (named, counted) => `ذُكر في ${named} من ${answersAr(counted)}`,
  tooFew: "عدد الإجابات المحسوبة قليل جداً للقياس",

  howTitle: "كيف تُحتسب",

  homeLink: "عرض الإجابات",
};

export const A: Record<Lang, typeof en> = { en, ar };
