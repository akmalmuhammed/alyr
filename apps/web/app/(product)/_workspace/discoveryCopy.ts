// Every word the Discovery screens say, in English and Arabic, in one place so a reviewer can
// read them together (ALY-322, spec 065). The components hold no text. Both languages are
// written against one shape, so a missing Arabic line is a type error, not a hole on a phone.
// The Arabic is a draft until the native review (ALY-66).
//
// What comes from the API already in the reader's language is not here: a finding's title, why,
// what happens and what is needed, its evidence, a report's headline. The sentences of a run's
// log are English by contract, so an Arabic screen words each known step itself (`stepSnapshot`,
// `stepRules`) and falls back to the log's sentence only for a step it does not know.
//
// Voice (docs/agent-dashboard/06-messaging.md, alyr-design/honesty.md): by rule, with what was
// counted; no AI words, no first person for the product, nothing that is not built (a fix is
// something the owner does and marks, so there is no "approve" and no "ALYR will do it").
// Times and amounts come from `discoveryLogic.ts`; counts agree through `an()` below in Arabic.

import type { Lang } from "./lang";
import type { FindingStatus, Kind, PartKey, Severity } from "./discoveryApi";
import type { View } from "./discoveryLogic";

export type { Lang };

/** Arabic count with its noun: 1 and 2 are words, 3 to 10 the plural, 11 and more the singular. */
function an(n: number, one: string, two: string, few: string, many: string): string {
  return n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}
const pl = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

const en = {
  // ── the section ──────────────────────────────────────
  title: "Discovery",
  sub: "How customers find your business on Google, on your website and on WhatsApp, checked by rule.",
  views: { home: "Home", todo: "To do", reviews: "Reviews", reports: "Reports", answers: "Answers" } as Record<View, string>,
  viewsLabel: "Discovery views",
  loading: "Loading Discovery",
  retry: "Try again",
  offline: "Cannot reach ALYR right now. Try again in a moment.",
  failed: "That did not work. Try again.",
  forbidden: "Only the owner or an admin can do this.",
  moduleOff: "Discovery is not switched on for your shop.",
  seeProducts: "See products",
  close: "Close",
  undo: "Undo",
  dismiss: "Dismiss",
  sample: {
    tag: "Sample data",
    text: "A made-up business, so you can see how Discovery works. Nothing here is about your shop.",
  },

  // ── Home: the score line ─────────────────────────────
  scoreOf: "of 100",
  scoreLabel: "Score",
  scoreSr: (n: number) => `Score ${n} out of 100`,
  notMeasured: "Not measured yet",
  changeUp: (n: number) => `Up ${pl(n, "point", "points")} since the last check-up`,
  changeDown: (n: number) => `Down ${pl(n, "point", "points")} since the last check-up`,
  changeSame: "No change since the last check-up",
  lastCheck: (when: string) => `Last check-up ${when}`,
  byRule: "By rule:",
  howScored: "How the score is made",
  runCheckup: "Run check-up",
  runAgain: "Try again",
  turnOn: "Turn on Discovery",

  // ── Home: the card and the lists ─────────────────────
  doNext: "Do this next",
  why: "Why it matters",
  whatHappens: "What happens",
  whatNeeded: "What is needed",
  seeEvidence: "See the evidence",
  didThis: "I did this",
  skip: "Skip",
  upNext: "Up next",
  done: "Done",
  allToDo: "All to-dos",
  caughtUpTitle: "Nothing to do right now",
  caughtUpText: "The next check-up shows what changed.",

  // ── Home: empty and running ──────────────────────────
  slotScore: "Your score shows here",
  slotNext: "The first thing to do shows here",
  slotDone: "What you finish shows here",
  noConnectionTitle: "See how customers find you",
  noConnectionText: "Turn on Discovery and run a check-up. It looks at your listing, your website and your WhatsApp link, and gives you a short list of what to fix. For now it uses a sample business, so you can see how it works. Nothing is changed or sent.",
  noConnectionAgent: "Ask the owner or an admin to turn Discovery on.",
  noRunTitle: "Run your first check-up",
  noRunText: "It takes a moment. Each step shows here as it finishes, then your score and a short list of what to do.",
  queuedTitle: "Waiting to start",
  runningTitle: "Checking now",
  runningText: "Each step shows here as it finishes.",
  nextStep: "The next step shows here as soon as it is logged.",
  stepSnapshot: "Looked at your listings and website",
  stepRules: (family: PartKey | null) => (family ? STEP_RULES_EN[family] : "Checked the rules"),
  stepOther: { start: "Started the check-up", findings: "Saved what was found", reviews: "Saved the reviews", score: "Worked out the score", answers: "Asked the public questions and counted the answers" } as Record<"start" | "findings" | "reviews" | "score" | "answers", string>,
  stepNotDone: "Did not finish",
  slowTitle: "This is taking longer than usual",
  slowText: "It keeps running on its own. Check again in a moment.",
  checkAgain: "Check again",
  runFinished: (score: number | null) => (score === null ? "Check-up finished." : `Check-up finished. Score ${score}.`),
  failedTitle: "The check-up did not finish",
  failedText: "Something stopped it. Nothing was changed.",
  reasonLabel: "Reason",
  failedLog: "What ran before it stopped",
  tooSoon: (minutes: number) => `A check-up ran a moment ago. You can run another in ${pl(minutes, "minute", "minutes")}.`,

  // ── the finding sheet ────────────────────────────────
  evidence: "Evidence",
  evidenceNone: "No evidence was kept for this one.",
  foundBy: "How it was found",
  firstSeen: (when: string) => `First seen ${when}`,
  lastSeen: (when: string) => `Last seen ${when}`,
  putBack: "Put back on the list",
  notDoneYet: "Not done yet",
  statusLine: {
    open: "",
    skipped: "You skipped this. It stays here until you put it back.",
    owner_done: "You marked this done. The next check-up confirms it.",
    verified: "A later check-up no longer found this.",
    gone: "A later check-up no longer found this.",
  } as Record<FindingStatus, string>,
  ownerMarks: "The owner or an admin marks a to-do as done or skipped.",
  toastDone: "Marked as done.",
  toastSkipped: "Skipped.",
  toastBack: "Back on the list.",
  statusWord: {
    open: "Open", skipped: "Skipped", owner_done: "Marked done", verified: "Confirmed by a check-up", gone: "No longer found",
  } as Record<FindingStatus, string>,
  severityLabel: "Priority",
  severity: { high: "High", medium: "Medium", low: "Low" } as Record<Severity, string>,

  // ── To do ────────────────────────────────────────────
  tabsLabel: "Show",
  tabs: { open: "Open", skipped: "Skipped", done: "Done" } as Record<"open" | "skipped" | "done", string>,
  groups: {
    agent: "Fixes to a listing or page", owner: "Needs you or Google", process: "Changes how your branches work",
  } as Record<Kind, string>,
  listCount: (tab: "open" | "skipped" | "done", n: number) => (tab === "open" ? `${n} to do` : tab === "skipped" ? `${n} skipped` : `${n} done`),
  todoEmpty: { open: "Nothing to do right now.", skipped: "Nothing skipped.", done: "Nothing done yet. What you finish shows here." } as Record<"open" | "skipped" | "done", string>,
  todoNoRun: "Run a check-up from Home to see what there is to do.",
  toHome: "Go to Home",
  placeLabel: "Place",
  allPlaces: "All places",
  wholeBusiness: "Whole business",

  // ── Reviews ──────────────────────────────────────────
  reviewsCount: "Reviews",
  reviewsAverage: "Average",
  reviewsUnanswered: "Without a reply",
  outOfFive: "out of 5",
  noRatings: "No ratings yet",
  starsLabel: "Rating",
  starsAny: "Any rating",
  stars: { "3": "3 stars or fewer", "2": "2 stars or fewer", "1": "1 star" } as Record<"3" | "2" | "1", string>,
  onlyUnanswered: "Without a reply",
  replied: "Replied",
  noReply: "No reply yet",
  theReply: "The reply",
  ratingSr: (n: number) => `${n} out of 5 stars`,
  seeTodo: "See the to-do",
  reviewsEmpty: "Reviews show here once a check-up has found them.",
  reviewsNone: "No reviews match these filters.",
  clearFilters: "Clear filters",

  // ── Reports ──────────────────────────────────────────
  monthLabel: "Month",
  reportsEmpty: "No check-up has run yet. Run one from Home and its report shows here.",
  reportScore: "Score",
  scoreStart: "At the start",
  scoreEnd: "At the end",
  checkups: (n: number) => pl(n, "check-up", "check-ups"),
  changeUpMonth: (n: number) => `Up ${pl(n, "point", "points")} over the month`,
  changeDownMonth: (n: number) => `Down ${pl(n, "point", "points")} over the month`,
  changeSameMonth: "No change over the month",
  preparedOn: (when: string) => `Prepared ${when}`,
  fixedTitle: "Fixed",
  stillOpenTitle: "Still open",
  newTitle: "New this month",
  none: "None",
  byPart: "By part",
  partNames: { presence: "Presence", reviews: "Reviews", website: "Website", whatsapp: "WhatsApp", ai: "" } as Record<PartKey, string>,
  partHints: {
    presence: "Your listing: found, claimed, hours, phone, photos",
    reviews: "Replies to reviews, and the rating",
    website: "Each place on your website",
    whatsapp: "A WhatsApp link that reaches the right number",
    ai: "",
  } as Record<PartKey, string>,
  measuredOf: (value: number) => `${value} of 100`,
};

const STEP_RULES_EN: Record<PartKey, string> = {
  presence: "Checked the listing rules", reviews: "Checked the review rules", website: "Checked the website rules",
  whatsapp: "Checked the WhatsApp rules", ai: "Checked the rules",
};

const ar: typeof en = {
  // ── the section ──────────────────────────────────────
  title: "الاكتشاف",
  sub: "كيف يجد العملاء نشاطك في خرائط Google وعلى موقعك وفي واتساب، يفحصها ALYR بقواعد واضحة.",
  views: { home: "الرئيسية", todo: "المهام", reviews: "التقييمات", reports: "التقارير", answers: "الإجابات" },
  viewsLabel: "أقسام الاكتشاف",
  loading: "جارٍ تحميل الاكتشاف",
  retry: "حاول مجدداً",
  offline: "تعذّر الوصول إلى ALYR الآن. حاول بعد قليل.",
  failed: "لم تنجح العملية. حاول مجدداً.",
  forbidden: "هذا متاح للمالك أو المدير فقط.",
  moduleOff: "الاكتشاف غير مفعّل لمحلك.",
  seeProducts: "عرض المنتجات",
  close: "إغلاق",
  undo: "تراجع",
  dismiss: "إخفاء",
  sample: {
    tag: "بيانات توضيحية",
    text: "نشاط غير حقيقي لتشاهد كيف يعمل الاكتشاف. لا شيء هنا يخص محلك.",
  },

  // ── Home: the score line ─────────────────────────────
  scoreOf: "من 100",
  scoreLabel: "الدرجة",
  scoreSr: (n) => `الدرجة ${n} من 100`,
  notMeasured: "لم تُقَس بعد",
  changeUp: (n) => `ارتفعت ${an(n, "نقطة واحدة", "نقطتان", "نقاط", "نقطة")} منذ الفحص الأخير`,
  changeDown: (n) => `انخفضت ${an(n, "نقطة واحدة", "نقطتان", "نقاط", "نقطة")} منذ الفحص الأخير`,
  changeSame: "لا تغيّر منذ الفحص الأخير",
  lastCheck: (when) => `آخر فحص ${when}`,
  byRule: "حسب القاعدة:",
  howScored: "كيف تُحسب الدرجة",
  runCheckup: "ابدأ الفحص",
  runAgain: "حاول مجدداً",
  turnOn: "فعّل الاكتشاف",

  // ── Home: the card and the lists ─────────────────────
  doNext: "ابدأ بهذا",
  why: "لماذا يهم",
  whatHappens: "ما الذي يحدث",
  whatNeeded: "ما المطلوب",
  seeEvidence: "عرض الدليل",
  didThis: "أنجزتُ هذا",
  skip: "تخطَّ",
  upNext: "التالي",
  done: "المنجز",
  allToDo: "كل المهام",
  caughtUpTitle: "لا شيء مطلوب الآن",
  caughtUpText: "يُظهر الفحص التالي ما تغيّر.",

  // ── Home: empty and running ──────────────────────────
  slotScore: "تظهر درجتك هنا",
  slotNext: "يظهر هنا أول ما يجب فعله",
  slotDone: "يظهر هنا ما تنجزه",
  noConnectionTitle: "اعرف كيف يجدك العملاء",
  noConnectionText: "فعّل الاكتشاف وابدأ فحصاً. يتحقق من قائمتك في الخرائط وموقعك ورابط واتساب، ويعطيك قائمة قصيرة بما يجب إصلاحه. يستخدم الآن نشاطاً توضيحياً لتشاهد كيف يعمل. لا يتغيّر شيء ولا يُرسل شيء.",
  noConnectionAgent: "اطلب من المالك أو المدير تفعيل الاكتشاف.",
  noRunTitle: "ابدأ أول فحص",
  noRunText: "يستغرق لحظات. تظهر كل خطوة هنا فور انتهائها، ثم درجتك وقائمة قصيرة بما يجب فعله.",
  queuedTitle: "بانتظار البدء",
  runningTitle: "الفحص جارٍ",
  runningText: "تظهر كل خطوة هنا فور انتهائها.",
  nextStep: "تظهر الخطوة التالية هنا فور تسجيلها.",
  stepSnapshot: "فُحصت قوائمك وموقعك",
  stepRules: (family) => (family ? `طُبّقت قواعد ${PART_NAMES_AR[family]}` : "طُبّقت القواعد"),
  stepOther: { start: "بدأ الفحص", findings: "حُفظ ما وُجد", reviews: "حُفظت التقييمات", score: "حُسبت الدرجة", answers: "طُرحت الأسئلة العامة وحُسبت الإجابات" },
  stepNotDone: "لم تكتمل",
  slowTitle: "الفحص يستغرق أطول من المعتاد",
  slowText: "يواصل العمل من تلقاء نفسه. تحقق مجدداً بعد قليل.",
  checkAgain: "تحقق مجدداً",
  runFinished: (score) => (score === null ? "انتهى الفحص." : `انتهى الفحص. الدرجة ${score}.`),
  failedTitle: "لم يكتمل الفحص",
  failedText: "توقف الفحص قبل أن يكتمل. لم يتغيّر شيء.",
  reasonLabel: "السبب",
  failedLog: "ما جرى قبل أن يتوقف",
  tooSoon: (minutes) => `أُجري فحص قبل قليل. يمكنك إجراء فحص آخر بعد ${an(minutes, "دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة")}.`,

  // ── the finding sheet ────────────────────────────────
  evidence: "الدليل",
  evidenceNone: "لم يُحفظ دليل لهذا الأمر.",
  foundBy: "كيف عُثر عليه",
  firstSeen: (when) => `رُصد أول مرة ${when}`,
  lastSeen: (when) => `رُصد آخر مرة ${when}`,
  putBack: "أعده إلى القائمة",
  notDoneYet: "لم يُنجز بعد",
  statusLine: {
    open: "",
    skipped: "تخطّيت هذا. يبقى هنا حتى تعيده إلى القائمة.",
    owner_done: "سجّلت هذا منجزاً. يؤكده الفحص التالي.",
    verified: "لم يجد فحص لاحق هذا الأمر.",
    gone: "لم يجد فحص لاحق هذا الأمر.",
  },
  ownerMarks: "يسجّل المالك أو المدير إنجاز المهمة أو تخطيها.",
  toastDone: "سُجّل منجزاً.",
  toastSkipped: "تم التخطي.",
  toastBack: "عاد إلى القائمة.",
  statusWord: {
    open: "مفتوح", skipped: "متخطّى", owner_done: "سُجّل منجزاً", verified: "أكّده فحص", gone: "لم يعد موجوداً",
  },
  severityLabel: "الأولوية",
  severity: { high: "عالية", medium: "متوسطة", low: "منخفضة" },

  // ── To do ────────────────────────────────────────────
  tabsLabel: "عرض",
  tabs: { open: "مفتوحة", skipped: "متخطّاة", done: "منجزة" },
  groups: {
    agent: "إصلاحات في قائمة أو صفحة", owner: "تحتاجك أو تحتاج Google", process: "تغيّر طريقة عمل فروعك",
  },
  listCount: (tab, n) =>
    tab === "open" ? an(n, "مهمة واحدة مفتوحة", "مهمتان مفتوحتان", "مهام مفتوحة", "مهمة مفتوحة")
      : tab === "skipped" ? an(n, "مهمة واحدة متخطّاة", "مهمتان متخطّاتان", "مهام متخطّاة", "مهمة متخطّاة")
        : an(n, "مهمة واحدة منجزة", "مهمتان منجزتان", "مهام منجزة", "مهمة منجزة"),
  todoEmpty: { open: "لا شيء مطلوب الآن.", skipped: "لا شيء متخطّى.", done: "لم يُنجز شيء بعد. يظهر هنا ما تنجزه." },
  todoNoRun: "ابدأ فحصاً من الرئيسية لترى ما يجب فعله.",
  toHome: "الانتقال إلى الرئيسية",
  placeLabel: "الفرع",
  allPlaces: "كل الفروع",
  wholeBusiness: "النشاط كله",

  // ── Reviews ──────────────────────────────────────────
  reviewsCount: "التقييمات",
  reviewsAverage: "المتوسط",
  reviewsUnanswered: "بلا رد",
  outOfFive: "من 5",
  noRatings: "لا تقييمات بعد",
  starsLabel: "التقييم",
  starsAny: "أي تقييم",
  stars: { "3": "3 نجوم فأقل", "2": "نجمتان فأقل", "1": "نجمة واحدة" },
  onlyUnanswered: "بلا رد",
  replied: "تم الرد",
  noReply: "بلا رد بعد",
  theReply: "الرد",
  ratingSr: (n) => `${n} من 5 نجوم`,
  seeTodo: "عرض المهمة",
  reviewsEmpty: "تظهر التقييمات هنا بعد أن يعثر عليها فحص.",
  reviewsNone: "لا تقييمات تطابق هذه الخيارات.",
  clearFilters: "مسح الخيارات",

  // ── Reports ──────────────────────────────────────────
  monthLabel: "الشهر",
  reportsEmpty: "لم يُجرَ أي فحص بعد. ابدأ فحصاً من الرئيسية ويظهر تقريره هنا.",
  reportScore: "الدرجة",
  scoreStart: "في البداية",
  scoreEnd: "في النهاية",
  checkups: (n) => an(n, "فحص واحد", "فحصان", "فحوصات", "فحصاً"),
  changeUpMonth: (n) => `ارتفعت ${an(n, "نقطة واحدة", "نقطتان", "نقاط", "نقطة")} خلال الشهر`,
  changeDownMonth: (n) => `انخفضت ${an(n, "نقطة واحدة", "نقطتان", "نقاط", "نقطة")} خلال الشهر`,
  changeSameMonth: "لا تغيّر خلال الشهر",
  preparedOn: (when) => `أُعدّ ${when}`,
  fixedTitle: "ما أُصلح",
  stillOpenTitle: "ما زال مفتوحاً",
  newTitle: "جديد هذا الشهر",
  none: "لا شيء",
  byPart: "حسب الجزء",
  partNames: { presence: "الحضور", reviews: "التقييمات", website: "الموقع الإلكتروني", whatsapp: "واتساب", ai: "" },
  partHints: {
    presence: "قائمتك: هل وُجدت، وهل هي موثّقة، والساعات والهاتف والصور",
    reviews: "الرد على التقييمات، ومتوسط التقييم",
    website: "كل فرع على موقعك",
    whatsapp: "رابط واتساب يصل إلى الرقم الصحيح",
    ai: "",
  },
  measuredOf: (value) => `${value} من 100`,
};

const PART_NAMES_AR: Record<PartKey, string> = ar.partNames;

export const T = { en, ar };
export type Copy = typeof en;
