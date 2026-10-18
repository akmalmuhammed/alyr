// Every word the "Your WhatsApp" card says, in English and Arabic, in one place so a reviewer
// can read them together (ALY-66: the Arabic is a draft until a native speaker has been
// through it). The component holds no text. Both languages are written against the same
// shape, so a missing Arabic line is a type error, not a hole on a phone.
//
// The commands are the ones the shop's WhatsApp number answers (ALY-130, D-040): the English
// word and the Arabic word both work, in either interface language.

export type Lang = "en" | "ar";
export type Command = "today" | "orders" | "bookings" | "owed" | "report" | "help";

const en = {
  title: "Your WhatsApp",
  sub: "Ask ALYR about the shop from your own phone.",

  // ── link ─────────────────────────────────────────────
  linkTitle: "Link WhatsApp",
  linkIntro: "Link your phone and ALYR answers your questions on WhatsApp, like how today is going. It takes under a minute.",
  steps: [
    "Get a code here.",
    "From your phone, send the message below to your shop's WhatsApp number.",
    "ALYR replies when your phone is linked.",
  ],
  getCode: "Get a code",
  gettingCode: "Getting your code…",
  messageLabel: "Send exactly this message",
  sendTo: "Send it from your phone to your shop's WhatsApp number.",
  copy: "Copy message",
  copied: "Copied",
  expiresIn: "Expires in",
  minutes: (m: string) => `${m} minutes`,
  expired: "This code has expired.",
  newCode: "Get a new code",
  cancel: "Cancel",
  waiting: "Waiting for your message…",
  justLinked: "Linked. Your phone now answers to you.",
  linked: "Linked",
  numberEnds: "Number ending",
  since: (date: string) => `since ${date}`,
  linkedNote: "Your phone answers the questions below. Only you can use it: it is tied to your sign-in.",
  unlink: "Unlink",
  unlinkAsk: "Unlink this number? Your phone will stop answering questions. You can link it again any time.",
  unlinkYes: "Yes, unlink",
  keepLinked: "Keep it linked",
  otherNumber: "Use a different number",
  unlinked: "Unlinked. That phone no longer answers questions.",
  demoNote: "Sign in with your own account to link your phone.",

  // ── where you work ───────────────────────────────────
  workTitle: "Where do you work?",
  workHint: "Choose how you mostly work. Everything stays available in both places.",
  workOptions: {
    portal: { name: "In the workspace", hint: "At a screen, on this site" },
    whatsapp: { name: "On WhatsApp", hint: "From my phone, by message" },
    both: { name: "Both", hint: "Whichever is closer" },
  },
  needLink: "Link your phone above so ALYR can answer you on WhatsApp.",

  // ── what you can send ────────────────────────────────
  sendTitle: "What you can send",
  sendIntroLinked: (role: string) => `As ${role}, you can send these to your shop's WhatsApp number.`,
  sendIntroUnlinked: (role: string) => `As ${role}, once your phone is linked you can send these to your shop's WhatsApp number.`,
  commands: {
    today: { word: "TODAY", arabic: "اليوم", what: "How the day is going" },
    orders: { word: "ORDERS", arabic: "الطلبات", what: "Open orders, newest first" },
    bookings: { word: "BOOKINGS", arabic: "الحجوزات", what: "Today's bookings, in time order" },
    owed: { word: "OWED", arabic: "المستحقات", what: "Who owes you, and who is late" },
    report: { word: "REPORT", arabic: "تقرير", what: "Last week's report, if you are on its list" },
    help: { word: "HELP", arabic: "مساعدة", what: "This list, on your phone" },
  } as Record<Command, { word: string; arabic: string; what: string }>,
  commandNotes: {
    today: { agent: "Counts only, no amounts" },
    orders: { agent: "Without amounts" },
  } as Partial<Record<Command, { agent: string }>>,
  bothLanguages: "Each word works in English or Arabic.",
  roles: { owner: "owner", admin: "admin", agent: "agent" } as Record<string, string>,

  // ── trouble ──────────────────────────────────────────
  loading: "Loading…",
  loadFailed: "Cannot load your WhatsApp settings right now.",
  retry: "Try again",
  codeFailed: "Could not get a code. Try again.",
  saveFailed: "Could not save that. Try again.",
};

export type Copy = typeof en;

const ar: Copy = {
  title: "واتساب الخاص بك",
  sub: "اسأل ALYR عن المحل من هاتفك.",

  linkTitle: "اربط واتساب",
  linkIntro: "اربط هاتفك ليجيب ALYR عن أسئلتك على واتساب، مثل كيف يسير اليوم. يستغرق أقل من دقيقة.",
  steps: [
    "احصل على رمز من هنا.",
    "من هاتفك، أرسل الرسالة أدناه إلى رقم واتساب المحل.",
    "يردّ ALYR عندما يتم ربط هاتفك.",
  ],
  getCode: "احصل على رمز",
  gettingCode: "جارٍ إحضار الرمز…",
  messageLabel: "أرسل هذه الرسالة كما هي",
  sendTo: "أرسلها من هاتفك إلى رقم واتساب المحل.",
  copy: "انسخ الرسالة",
  copied: "تم النسخ",
  expiresIn: "ينتهي خلال",
  minutes: (m: string) => `${m} دقائق`,
  expired: "انتهت صلاحية هذا الرمز.",
  newCode: "احصل على رمز جديد",
  cancel: "إلغاء",
  waiting: "بانتظار رسالتك…",
  justLinked: "تم الربط. هاتفك الآن باسمك.",
  linked: "مربوط",
  numberEnds: "الرقم المنتهي بـ",
  since: (date: string) => `منذ ${date}`,
  linkedNote: "يجيب هاتفك عن الأسئلة أدناه. لا يستخدمه غيرك: فهو مربوط بحسابك.",
  unlink: "فك الربط",
  unlinkAsk: "فك ربط هذا الرقم؟ سيتوقف هاتفك عن الإجابة عن الأسئلة. يمكنك ربطه من جديد في أي وقت.",
  unlinkYes: "نعم، فك الربط",
  keepLinked: "أبقِه مربوطاً",
  otherNumber: "استخدم رقماً آخر",
  unlinked: "تم فك الربط. هذا الهاتف لم يعد يجيب عن الأسئلة.",
  demoNote: "سجّل الدخول بحسابك لتربط هاتفك.",

  workTitle: "أين تعمل؟",
  workHint: "اختر كيف تعمل غالباً. كل شيء يبقى متاحاً في المكانين.",
  workOptions: {
    portal: { name: "في مساحة العمل", hint: "أمام الشاشة، على هذا الموقع" },
    whatsapp: { name: "على واتساب", hint: "من هاتفي، برسالة" },
    both: { name: "الاثنان", hint: "الأقرب إليّ" },
  },
  needLink: "اربط هاتفك أعلاه ليجيبك ALYR على واتساب.",

  sendTitle: "ما يمكنك إرساله",
  sendIntroLinked: (role: string) => `بصفتك ${role}، يمكنك إرسال هذه الكلمات إلى رقم واتساب المحل.`,
  sendIntroUnlinked: (role: string) => `بصفتك ${role}، بعد ربط هاتفك يمكنك إرسال هذه الكلمات إلى رقم واتساب المحل.`,
  commands: {
    today: { word: "TODAY", arabic: "اليوم", what: "كيف يسير اليوم" },
    orders: { word: "ORDERS", arabic: "الطلبات", what: "الطلبات المفتوحة، الأحدث أولاً" },
    bookings: { word: "BOOKINGS", arabic: "الحجوزات", what: "حجوزات اليوم حسب الوقت" },
    owed: { word: "OWED", arabic: "المستحقات", what: "من عليه دين لك ومن تأخر" },
    report: { word: "REPORT", arabic: "تقرير", what: "تقرير الأسبوع الماضي، إن كنت ضمن من يصلهم" },
    help: { word: "HELP", arabic: "مساعدة", what: "هذه القائمة على هاتفك" },
  },
  commandNotes: {
    today: { agent: "أعداد فقط، بلا مبالغ" },
    orders: { agent: "بلا مبالغ" },
  },
  bothLanguages: "كل كلمة تعمل بالعربية أو بالإنجليزية.",
  roles: { owner: "صاحب المحل", admin: "مدير", agent: "موظف" },

  loading: "جارٍ التحميل…",
  loadFailed: "تعذّر تحميل إعدادات واتساب الآن.",
  retry: "حاول مرة أخرى",
  codeFailed: "تعذّر الحصول على رمز. حاول مرة أخرى.",
  saveFailed: "تعذّر الحفظ. حاول مرة أخرى.",
};

export const COPY: Record<Lang, Copy> = { en, ar };

/** The commands one role can send in a shop with these modules, in the order HELP lists them
 *  (core/actions.py is the source: owner and admin see everything, an agent no `OWED`). */
export function commandsFor(role: string, modules: string[]): Command[] {
  const money = role === "owner" || role === "admin";
  const out: Command[] = ["today"];
  if (modules.includes("orders")) out.push("orders");
  if (modules.includes("bookings")) out.push("bookings");
  if (money && modules.includes("ledger")) out.push("owed");
  out.push("report", "help");
  return out;
}
