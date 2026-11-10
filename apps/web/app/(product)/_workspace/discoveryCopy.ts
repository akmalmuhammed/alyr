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
// counted; no AI words, no first person for the product, nothing that is not built. Phase 2
// (spec 066) adds one thing a person can do with a change ALYR prepared: approve it, with one tap
// on the exact before and after. Where a finding has no change, it keeps "I did this" and "Skip",
// and nothing says ALYR will do it. The guarantee line is the spec's, word for word.
// Times and amounts come from `discoveryLogic.ts`; counts agree through `an()` below in Arabic.

import type { Lang } from "./lang";
import type { DayKey, FactKey, FindingStatus, Kind, PartKey, ProposalStatus, Severity } from "./discoveryApi";
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
  views: { home: "Home", todo: "To do", proposals: "Proposals", reviews: "Reviews", reports: "Reports", settings: "Settings" } as Record<View, string>,
  viewsLabel: "Discovery views",
  waitingN: (n: number) => `${n} waiting`,
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
  // The ruler on Home (ALY-332): the two marks, and the word under the lowest part.
  rulerNow: (n: number) => `Now ${n}`,
  rulerWas: (n: number) => `Last check-up ${n}`,
  lowestPart: "Lowest",
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
  stepOther: { start: "Started the check-up", findings: "Saved what was found", reviews: "Saved the reviews", score: "Worked out the score" } as Record<"start" | "findings" | "reviews" | "score", string>,
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
    agent: "ALYR can change this after you approve", owner: "Needs you or Google", process: "Changes how your branches work",
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

  // ── Phase 2: the guarantee and who approves ──────────
  guarantee: "Nothing is applied without your tap.",
  sampleChange: "Sample business: this changes the made-up listing inside ALYR, not anything on Google.",
  ownerApproves: "The owner approves changes.",
  approversNote: "The owner, an admin or the branch's manager approves changes.",
  closesChange: "Its waiting change will be closed.",
  alreadyDone: "That was already done. Nothing was repeated.",
  errors: {
    proposal_changed: "This change was updated. It is shown again: review it before you approve.",
    proposal_closed: "This change is closed. Nothing was applied.",
  } as Record<"proposal_changed" | "proposal_closed", string>,

  // ── Phase 2: Home and To do ──────────────────────────
  reviewChanges: (n: number) => `Review ${pl(n, "change", "changes")}`,
  proposalsTitle: "Proposals",
  allProposals: "All proposals",
  theChange: "The change",
  reviewChange: "Review the change",
  nowLabel: "Now",
  proposedLabel: "Proposed",
  changeReady: "Change ready",
  appliedNote: {
    none: "Applied", pending: "Applied. The next check-up confirms it.", confirmed: "Applied and confirmed by a check-up",
    not_confirmed: "Applied, but a check-up still found it",
  } as Record<"none" | "pending" | "confirmed" | "not_confirmed", string>,

  // ── Phase 2: the Proposals area ──────────────────────
  proposalTabsLabel: "Show",
  proposalTabs: { live: "Waiting", done: "Done", closed: "Closed" } as Record<"live" | "done" | "closed", string>,
  proposalCount: (tab: "live" | "done" | "closed", n: number) => (tab === "live" ? `${n} waiting` : tab === "done" ? `${n} done` : `${n} closed`),
  applyingN: (n: number) => `${n} being applied`,
  proposalsEmpty: {
    live: "Nothing is waiting. The next check-up may find something.",
    done: "Nothing applied yet. A change you approve shows here once it is applied.",
    closed: "Nothing closed.",
  } as Record<"live" | "done" | "closed", string>,
  proposalStatus: {
    proposed: "Waiting for approval", approved: "Being applied", applied: "Applied", failed: "Not applied", declined: "Declined",
    expired: "Expired", undone: "Undone",
  } as Record<ProposalStatus, string>,
  rowWhen: (status: ProposalStatus, date: string) =>
    status === "proposed" ? `Waiting until ${date}` : status === "approved" ? `Approved ${date}` : status === "applied" ? `Applied ${date}`
      : status === "declined" ? `Declined ${date}` : status === "expired" ? `Expired on ${date}` : status === "undone" ? `Undone ${date}` : `Tried ${date}`,
  fieldAt: (label: string, where: string) => `${label} on ${where}`,
  expiresOn: (date: string) => `Expires ${bidi(date)}`,

  // ── Phase 2: the approval sheet ──────────────────────
  approve: "Approve",
  decline: "Decline",
  dayHeader: "Day",
  theReview: "The review",
  ruleLine: "By rule:",
  beingApplied: "Being applied",
  beingAppliedText: "Approved. The change is being made. This shows the result as soon as it is done.",
  stepApproved: (by: string, channel: "whatsapp" | "portal" | "") =>
    `Approved${by ? ` by ${bidi(by)}` : ""}${channel === "whatsapp" ? " from WhatsApp" : channel === "portal" ? " in the workspace" : ""}`,
  stepMaking: "Making the change",
  stepMade: "Change made",
  appliedLine: (when: string, by: string, channel: "whatsapp" | "portal" | "") =>
    `Applied ${bidi(when)}.${by ? ` Approved by ${bidi(by)}${channel === "whatsapp" ? " from WhatsApp" : channel === "portal" ? " in the workspace" : ""}.` : ""}`,
  undoUntil: (date: string) => `You can undo this until ${bidi(date)}.`,
  verifyPending: "The next check-up confirms it.",
  verifyConfirmedOn: (date: string) => `Confirmed by the check-up of ${bidi(date)}.`,
  verifyConfirmed: "Confirmed by a later check-up.",
  verifyNotOn: (date: string) => `Applied, but the check-up of ${bidi(date)} still found it.`,
  verifyNot: "Applied, but the next check-up still found it.",
  failedHead: "Not applied",
  declinedLine: (when: string, by: string, channel: "whatsapp" | "portal" | "") =>
    `Declined ${bidi(when)}${by ? ` by ${bidi(by)}` : ""}${channel === "whatsapp" ? " from WhatsApp" : channel === "portal" ? " in the workspace" : ""}.`,
  coolOff: "The same change is not proposed again for 14 days.",
  expiredLine: (date: string) => `Expired on ${bidi(date)}. Nothing was applied.`,
  undoneLine: (when: string) => `Undone${when ? ` ${bidi(when)}` : ""}.`,
  undoneNote: (where: string) => `The next check-up looks at ${where} again.`,
  history: "History",
  announce: {
    approved: "Approved. The change is being applied.", applied: "The change was applied.", failed: "The change was not applied.",
    declined: "Declined.", undone: "Undone.",
  } as Record<"approved" | "applied" | "failed" | "declined" | "undone", string>,

  // ── Phase 2: confirming a fact, and preparing a change ──
  proposedChange: "Proposed change",
  proposedChanges: "Proposed changes",
  reviewAndApprove: "Review and approve",
  prepare: "Prepare the change",
  confirmTitles: {
    hours: "Confirm the real opening hours", phone: "Confirm the real phone number", category: "Confirm the real category",
    name: "Confirm the real name", whatsapp: "Confirm the real WhatsApp number",
  } as Record<FactKey, string>,
  factIntro: "A change is only made from details you confirm. Nothing is applied without your tap.",
  daysLong: {
    sat: "Saturday", sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday",
  } as Record<DayKey, string>,
  daysShort: { sat: "Sat", sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri" } as Record<DayKey, string>,
  to: "to",
  closedWord: "closed",
  noneText: "none",
  opens: "Opens",
  closes: "Closes",
  closedDay: "Closed",
  phoneLabel: "Phone number",
  whatsappLabel: "WhatsApp number",
  categoryLabel: "Category",
  nameLabel: "Name",
  timeHint: "24-hour, like 07:00",
  phoneHint: "With the country code, like +974 5555 0112",
  factErrors: {
    required: "Fill this in.", time: "Use the 24-hour form, like 07:00.", order: "Closing must be after opening.",
    phone: "Start with + and the country code: 7 to 15 digits.",
  } as Record<"required" | "time" | "order" | "phone", string>,
  factTooLong: (max: number) => `Use ${max} characters or fewer.`,
  saveFact: "Confirm and prepare the change",
  saveFactPlain: "Save",
  cancel: "Cancel",

  // ── Phase 2: Settings ────────────────────────────────
  messagesTitle: "Messages on WhatsApp",
  messagesIntro: "A change waiting for approval can be sent to a team number on WhatsApp, with the exact change and three buttons. Nothing changes until someone taps Approve.",
  receiverSwitch: "Send changes to approve",
  linkFirst: "Link this number first",
  last4: (digits: string) => `Ends in ${digits}`,
  noReceivers: "No team numbers have been added yet.",
  openTeam: "Open Team",
  dailyLimit: "Most messages one person gets in a day",
  dailyHint: "None are sent between 22:00 and 07:00. A change that is not sent waits here.",
  templateNote: "Messages are sent only while the person's 24-hour WhatsApp window is open, until Meta approves the message's wording. Until then changes wait here.",
  managersTitle: "Branch managers",
  managersIntro: "A branch manager is a team member with the staff role who may approve the changes for their own branch, and no other.",
  managersFor: (place: string) => `Managers of ${place}`,
  noStaff: "No team member has the staff role yet.",
  detailsTitle: "Confirmed details",
  detailsIntro: "A change is made only from these details, each confirmed by a person.",
  factNames: { hours: "Opening hours", phone: "Phone number", category: "Category", name: "Name", whatsapp: "WhatsApp number" } as Record<FactKey, string>,
  notConfirmed: "Not confirmed yet",
  confirmedBy: (name: string, date: string) => `Confirmed by ${bidi(name)}, ${bidi(date)}`,
  confirmedOnly: (date: string) => `Confirmed ${bidi(date)}`,
  factSample: "Sample details",
  factDefault: "Taken from the place's own details",
  edit: "Edit",
  weeklyTitle: "Weekly check-up",
  weeklyLabel: "Run a check-up every week",
  weeklyHint: "A check-up starts once a week, when the last one is over 7 days old. It only looks. Changes still wait for a tap.",
  saved: "Saved.",
};

/** A name or a date set inside a sentence keeps its own direction (isolated, so the sentence does not reorder it). */
function bidi(text: string): string {
  return `\u2068${text}\u2069`;
}

const STEP_RULES_EN: Record<PartKey, string> = {
  presence: "Checked the listing rules", reviews: "Checked the review rules", website: "Checked the website rules",
  whatsapp: "Checked the WhatsApp rules", ai: "Checked the rules",
};

const ar: typeof en = {
  // ── the section ──────────────────────────────────────
  title: "الاكتشاف",
  sub: "كيف يجد العملاء نشاطك في خرائط Google وعلى موقعك وفي واتساب، يفحصها ALYR بقواعد واضحة.",
  views: { home: "الرئيسية", todo: "المهام", proposals: "التعديلات المقترحة", reviews: "التقييمات", reports: "التقارير", settings: "الإعدادات" },
  viewsLabel: "أقسام الاكتشاف",
  waitingN: (n) => (n === 1 ? "واحد بالانتظار" : n === 2 ? "اثنان بالانتظار" : `${n} بالانتظار`),
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
  rulerNow: (n) => `الآن ${n}`,
  rulerWas: (n) => `الفحص السابق ${n}`,
  lowestPart: "الأدنى",
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
  stepOther: { start: "بدأ الفحص", findings: "حُفظ ما وُجد", reviews: "حُفظت التقييمات", score: "حُسبت الدرجة" },
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
    agent: "يمكن لـALYR تعديل هذا بعد موافقتك", owner: "تحتاجك أو تحتاج Google", process: "تغيّر طريقة عمل فروعك",
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

  // ── Phase 2: the guarantee and who approves ──────────
  guarantee: "لا يُطبَّق شيء قبل أن تضغط.",
  sampleChange: "نشاط توضيحي: هذا يغيّر ملفاً تجارياً وهمياً داخل ALYR، ولا يغيّر شيئاً في Google.",
  ownerApproves: "يوافق المالك على التعديلات.",
  approversNote: "يوافق على التعديلات المالك أو المدير أو مسؤول الفرع.",
  closesChange: "سيُغلق التعديل المنتظر لهذا الأمر.",
  alreadyDone: "سبق تنفيذ هذا. لم يُكرَّر شيء.",
  errors: {
    proposal_changed: "تغيّر هذا التعديل. يظهر من جديد: راجعه قبل أن توافق.",
    proposal_closed: "أُغلق هذا التعديل. لم يُطبَّق شيء.",
  },

  // ── Phase 2: Home and To do ──────────────────────────
  reviewChanges: (n) => `مراجعة ${an(n, "تعديل واحد", "تعديلين", "تعديلات", "تعديلاً")}`,
  proposalsTitle: "التعديلات المقترحة",
  allProposals: "كل التعديلات المقترحة",
  theChange: "التعديل",
  reviewChange: "مراجعة التعديل",
  nowLabel: "الحالي",
  proposedLabel: "المقترح",
  changeReady: "تعديل جاهز",
  appliedNote: {
    none: "طُبّق التعديل", pending: "طُبّق التعديل. يؤكده الفحص التالي.", confirmed: "طُبّق التعديل وأكّده فحص",
    not_confirmed: "طُبّق التعديل، لكن فحصاً ما زال يجد المشكلة",
  },

  // ── Phase 2: the Proposals area ──────────────────────
  proposalTabsLabel: "عرض",
  proposalTabs: { live: "بالانتظار", done: "منجزة", closed: "مغلقة" },
  proposalCount: (tab, n) =>
    tab === "live" ? an(n, "تعديل واحد بالانتظار", "تعديلان بالانتظار", "تعديلات بالانتظار", "تعديلاً بالانتظار")
      : tab === "done" ? an(n, "تعديل واحد منجز", "تعديلان منجزان", "تعديلات منجزة", "تعديلاً منجزاً")
        : an(n, "تعديل واحد مغلق", "تعديلان مغلقان", "تعديلات مغلقة", "تعديلاً مغلقاً"),
  applyingN: (n) => (n === 1 ? "واحد قيد التطبيق" : n === 2 ? "اثنان قيد التطبيق" : `${n} قيد التطبيق`),
  proposalsEmpty: {
    live: "لا شيء بالانتظار. قد يجد الفحص التالي شيئاً.",
    done: "لم يُطبَّق شيء بعد. يظهر هنا التعديل الذي توافق عليه بعد تطبيقه.",
    closed: "لا شيء مغلق.",
  },
  proposalStatus: {
    proposed: "بانتظار الموافقة", approved: "يجري تطبيقه", applied: "طُبّق", failed: "لم يُطبَّق", declined: "مرفوض",
    expired: "انتهت مدته", undone: "تم التراجع عنه",
  },
  rowWhen: (status, date) =>
    status === "proposed" ? `بانتظار الموافقة حتى ${date}` : status === "approved" ? `تمت الموافقة ${date}` : status === "applied" ? `طُبّق ${date}`
      : status === "declined" ? `رُفض ${date}` : status === "expired" ? `انتهت مدته في ${date}` : status === "undone" ? `تم التراجع ${date}` : `جرت المحاولة ${date}`,
  fieldAt: (label, where) => `${label} في ${where}`,
  expiresOn: (date) => `تنتهي مدته ${bidi(date)}`,

  // ── Phase 2: the approval sheet ──────────────────────
  approve: "موافقة",
  decline: "رفض",
  dayHeader: "اليوم",
  theReview: "التقييم",
  ruleLine: "حسب القاعدة:",
  beingApplied: "يجري التطبيق",
  beingAppliedText: "تمت الموافقة. يجري تنفيذ التعديل. تظهر النتيجة هنا فور انتهائه.",
  stepApproved: (by, channel) =>
    `تمت الموافقة${by ? ` بواسطة ${bidi(by)}` : ""}${channel === "whatsapp" ? " من واتساب" : channel === "portal" ? " من مساحة العمل" : ""}`,
  stepMaking: "يجري تنفيذ التعديل",
  stepMade: "تم تنفيذ التعديل",
  appliedLine: (when, by, channel) =>
    `طُبّق التعديل ${bidi(when)}.${by ? ` وافق عليه ${bidi(by)}${channel === "whatsapp" ? " من واتساب" : channel === "portal" ? " من مساحة العمل" : ""}.` : ""}`,
  undoUntil: (date) => `يمكنك التراجع عن هذا التعديل حتى ${bidi(date)}.`,
  verifyPending: "يؤكده الفحص التالي.",
  verifyConfirmedOn: (date) => `أكّده فحص ${bidi(date)}.`,
  verifyConfirmed: "أكّده فحص لاحق.",
  verifyNotOn: (date) => `طُبّق التعديل، لكن فحص ${bidi(date)} ما زال يجد المشكلة.`,
  verifyNot: "طُبّق التعديل، لكن الفحص التالي ما زال يجد المشكلة.",
  failedHead: "لم يُطبَّق",
  declinedLine: (when, by, channel) =>
    `رُفض التعديل ${bidi(when)}${by ? ` بواسطة ${bidi(by)}` : ""}${channel === "whatsapp" ? " من واتساب" : channel === "portal" ? " من مساحة العمل" : ""}.`,
  coolOff: "لا يُقترح التعديل نفسه مجدداً قبل مرور 14 يوماً.",
  expiredLine: (date) => `انتهت مدة هذا التعديل في ${bidi(date)}. لم يُطبَّق شيء.`,
  undoneLine: (when) => `جرى التراجع عن التعديل${when ? ` ${bidi(when)}` : ""}.`,
  undoneNote: (where) => `سيفحص الفحص التالي ${where} مجدداً.`,
  history: "السجل",
  announce: {
    approved: "تمت الموافقة. يجري تطبيق التعديل.", applied: "طُبّق التعديل.", failed: "لم يُطبَّق التعديل.",
    declined: "تم الرفض.", undone: "تم التراجع.",
  },

  // ── Phase 2: confirming a fact, and preparing a change ──
  proposedChange: "التعديل المقترح",
  proposedChanges: "التعديلات المقترحة",
  reviewAndApprove: "مراجعة وموافقة",
  prepare: "تجهيز التعديل",
  confirmTitles: {
    hours: "أكّد ساعات العمل الفعلية", phone: "أكّد رقم الهاتف الفعلي", category: "أكّد الفئة الفعلية",
    name: "أكّد الاسم الفعلي", whatsapp: "أكّد رقم واتساب الفعلي",
  },
  factIntro: "لا يُجرى تعديل إلا من تفاصيل تؤكدها. لا يُطبَّق شيء قبل أن تضغط.",
  daysLong: { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" },
  daysShort: { sat: "السبت", sun: "الأحد", mon: "الاثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة" },
  to: "إلى",
  closedWord: "مغلق",
  noneText: "لا شيء",
  opens: "الفتح",
  closes: "الإغلاق",
  closedDay: "مغلق",
  phoneLabel: "رقم الهاتف",
  whatsappLabel: "رقم واتساب",
  categoryLabel: "الفئة",
  nameLabel: "الاسم",
  timeHint: "نظام 24 ساعة، مثل 07:00",
  phoneHint: "مع رمز الدولة، مثل +974 5555 0112",
  factErrors: {
    required: "املأ هذا الحقل.", time: "استخدم نظام 24 ساعة، مثل 07:00.", order: "يجب أن يكون الإغلاق بعد الفتح.",
    phone: "ابدأ بـ + ورمز الدولة: من 7 إلى 15 رقماً.",
  },
  factTooLong: (max) => `استخدم ${max} حرفاً أو أقل.`,
  saveFact: "تأكيد وتجهيز التعديل",
  saveFactPlain: "حفظ",
  cancel: "إلغاء",

  // ── Phase 2: Settings ────────────────────────────────
  messagesTitle: "الرسائل على واتساب",
  messagesIntro: "يمكن إرسال التعديل المنتظر موافقتك إلى رقم من الفريق على واتساب، مع التعديل بالتفصيل وثلاثة أزرار. لا يتغير شيء قبل أن يضغط أحدهم «موافقة».",
  receiverSwitch: "إرسال التعديلات للموافقة",
  linkFirst: "اربط هذا الرقم أولاً",
  last4: (digits) => `ينتهي بـ ${digits}`,
  noReceivers: "لم تُضَف أرقام للفريق بعد.",
  openTeam: "فتح الفريق",
  dailyLimit: "أكثر عدد من الرسائل يصل شخصاً واحداً في اليوم",
  dailyHint: "لا يُرسل شيء بين 22:00 و07:00. التعديل الذي لا يُرسل ينتظر هنا.",
  templateNote: "لا تُرسل الرسائل إلا ما دامت نافذة واتساب البالغة 24 ساعة مفتوحة للشخص، إلى أن توافق Meta على صياغة الرسالة. إلى ذلك الحين تنتظر التعديلات هنا.",
  managersTitle: "مسؤولو الفروع",
  managersIntro: "مسؤول الفرع عضو في الفريق بدور الموظف يوافق على تعديلات فرعه فقط، ولا يوافق على غيرها.",
  managersFor: (place) => `مسؤولو ${place}`,
  noStaff: "لا يوجد عضو بدور الموظف في الفريق بعد.",
  detailsTitle: "التفاصيل المؤكدة",
  detailsIntro: "لا يُجرى تعديل إلا من هذه التفاصيل، وقد أكّد كلاً منها شخص.",
  factNames: { hours: "ساعات العمل", phone: "رقم الهاتف", category: "الفئة", name: "الاسم", whatsapp: "رقم واتساب" },
  notConfirmed: "لم يُؤكَّد بعد",
  confirmedBy: (name, date) => `أكّده ${bidi(name)}، ${bidi(date)}`,
  confirmedOnly: (date) => `أُكّد ${bidi(date)}`,
  factSample: "تفاصيل توضيحية",
  factDefault: "مأخوذ من تفاصيل الفرع نفسها",
  edit: "تعديل",
  weeklyTitle: "الفحص الأسبوعي",
  weeklyLabel: "إجراء فحص كل أسبوع",
  weeklyHint: "يبدأ فحص مرة في الأسبوع حين يمضي على آخر فحص أكثر من 7 أيام. يكتفي بالنظر. وتبقى التعديلات بانتظار ضغطتك.",
  saved: "تم الحفظ.",
};

const PART_NAMES_AR: Record<PartKey, string> = ar.partNames;

export const T = { en, ar };
export type Copy = typeof en;
