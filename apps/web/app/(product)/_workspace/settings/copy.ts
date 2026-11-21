// Every word of Settings (Your account, Data and privacy), in English and Arabic, in one place.
// Components hold no text. Arabic is a draft until the native review (ALY-66).
//
// What these words may claim is checked against the product, not the drawings: the close
// timeline says only what `core/subscription.py` (seven days' notice, the cancel email) and
// `core/erase.py` (60 days, spec 042, D-116) do; the data note says what `core/export.py` does.
// Erasable TypeScript with no imports, so `node --test` reads it (copy.test.mjs).

export type Lang = "en" | "ar";

const NBSP = " ";

/** «QAR 9,840», «9,840 ر.ق»: the amount with its currency, never broken. */
function qar(n: number, lang: Lang): string {
  const figure = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return lang === "ar" ? `${figure}${NBSP}ر.ق` : `QAR${NBSP}${figure}`;
}

function bookings(n: number, lang: Lang): string {
  const digits = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (lang === "en") return `${digits}${NBSP}${n === 1 ? "booking" : "bookings"}`;
  if (n === 1) return "حجز واحد";
  if (n === 2) return "حجزان";
  const tail = n % 100;
  return n === 0 || (tail >= 3 && tail <= 10) ? `${digits}${NBSP}حجوزات` : `${digits}${NBSP}حجزاً`;
}

function customers(n: number, lang: Lang): string {
  const digits = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (lang === "en") return `${digits}${NBSP}${n === 1 ? "customer" : "customers"}`;
  if (n === 1) return "عميل واحد";
  if (n === 2) return "عميلان";
  const tail = n % 100;
  return n === 0 || (tail >= 3 && tail <= 10) ? `${digits}${NBSP}عملاء` : `${digits}${NBSP}عميلاً`;
}

export interface SettingsCopy {
  // ── the page ─────────────────────────────────────────
  accountTitle: string;
  accountSub: string;
  privacyTitle: string;
  privacySub: string;
  titleAction: string;
  loadingLabel: string;
  loadedAt: (time: string) => string;
  offlineBanner: (time: string) => string;
  errorBanner: string;
  retry: string;
  dismiss: string;

  // ── You ──────────────────────────────────────────────
  youTitle: string;
  teamRoles: string;
  nameLabel: string;
  nameHint: string;
  roleLabel: string;
  roleHint: string;
  roles: { owner: string; admin: string; agent: string };
  youAreRole: { owner: string; admin: string; agent: string };

  // ── sign-in email ────────────────────────────────────
  emailTitle: string;
  emailChange: string;
  emailHelp: string;
  sessionNote: string;

  // ── businesses ───────────────────────────────────────
  businessesTitle: string;
  businessesSub: string;
  openNow: string;
  open: string;
  opening: string;
  businessesNote: string;

  // ── language, appearance, sign out ───────────────────
  languageTitle: string;
  languageSub: string;
  languageName: { en: string; ar: string };
  languageDirection: { en: string; ar: string };
  appearanceTitle: string;
  appearanceSub: string;
  themeLight: string;
  themeDark: string;
  themeAuto: string;
  signOutTitle: string;
  signOutHelp: string;
  signOutAction: string;

  // ── Data and privacy: your data ──────────────────────
  downloadAll: string;
  dataTitle: string;
  dataSub: string;
  dataIncludes: readonly string[];
  dataFormat: string;
  whoCanDownload: string;
  whoCanDownloadValue: string;
  money: string;
  moneyValue: string;
  limit: string;
  limitValue: string;
  dataLeftOut: string;
  dataRule: string;
  downloadTitle: string;
  downloadBody: string;
  downloadConfirm: string;
  downloadKeep: string;
  downloadOffline: string;

  // ── Data and privacy: customers' data ────────────────
  customersTitle: string;
  customersSub: string;
  customersBody: string;
  customersRule: string;

  // ── Data and privacy: what ALYR keeps ────────────────
  keepsTitle: string;
  keptIn: string;
  keptInValue: string;
  keepConversations: string;
  keepWhileOpen: string;
  keepDocuments: string;
  keepAfter: string;
  keepAfterValue: string;
  keepBackups: string;
  keepBackupsValue: string;
  keepStaff: string;
  keepStaffValue: string;
  keepsNote: string;

  // ── Data and privacy: close the account ──────────────
  closeTitle: string;
  closeBody: string;
  closeAction: string;
  closeOwnersOnly: string;

  // ── dialog: change the sign-in email ─────────────────
  mailTitle: string;
  mailSteps: readonly [string, string];
  mailStepDone: string;
  mailStepCurrent: string;
  mailAddressLabel: string;
  mailAddressHint: string;
  mailSend: string;
  mailCancel: string;
  mailNow: string;
  mailNew: string;
  mailSent: string;
  mailCodeLabel: string;
  mailCodeNote: string;
  mailResend: string;
  mailTellsOld: string;
  mailSignsOut: string;
  mailAnother: string;
  mailConfirm: string;
  mailDone: (email: string) => string;
  mailRefusals: Record<"demo" | "invalid" | "same" | "staff" | "too_many" | "code" | "taken" | "offline" | "failed", string>;

  // ── dialog: close the account ────────────────────────
  closeDialogTitle: (name: string) => string;
  closeWhatHappens: string;
  closeToday: string;
  closeUntil: (day: string) => string;
  closeFrom: (day: string) => string;
  closeTodayText: string;
  closeUntilText: string;
  closeFromText: string;
  closeEraseText: string;
  closeImpact: (bookingCount: number, afterDay: string, customerCount: number, owed: number) => string;
  closeHaveCopy: string;
  closeHaveCopyHint: (day: string) => string;
  closeNote: string;
  closeKeep: string;
  closeConfirm: (day: string) => string;
  closeFailed: string;
  closeAsked: string;

  // ── no permission (an admin or an agent) ─────────────
  noAccessBody: string;
}

const en: SettingsCopy = {
  accountTitle: "Your account",
  accountSub: "Your name, how you sign in, the businesses you work for and how the workspace looks for you.",
  privacyTitle: "Data and privacy",
  privacySub: "Your own copy of everything, what ALYR keeps, what to do when a customer asks about their data, and closing the account.",
  titleAction: "Each action here asks first",
  loadingLabel: "Loading your account",
  loadedAt: (time) => `Loaded ${time}`,
  offlineBanner: (time) => `What is on screen was loaded at ${time}. Changes cannot be saved until the connection is back.`,
  errorBanner: "Your account could not be loaded just now.",
  retry: "Try again",
  dismiss: "Close",

  youTitle: "You",
  teamRoles: "Team · Roles",
  nameLabel: "Your name",
  nameHint: "An owner sets it on Team.",
  roleLabel: "Role",
  roleHint: "An owner changes it on Team.",
  roles: { owner: "Owner", admin: "Admin", agent: "Agent" },
  youAreRole: { owner: "You are the owner", admin: "You are an admin", agent: "You are an agent" },

  emailTitle: "Sign-in email",
  emailChange: "Change",
  emailHelp: "ALYR emails a 6-digit code to this address each time you sign in. There is no password to remember or to leak.",
  sessionNote: "A sign-in lasts 30 days on each device. Changing your sign-in email signs you out on your other devices.",

  businessesTitle: "Your businesses",
  businessesSub: "signing in opens the one you used last",
  openNow: "Open now",
  open: "Open",
  opening: "Opening",
  businessesNote: "Each business keeps its own customers, orders and team. Opening one reloads the workspace.",

  languageTitle: "Language",
  languageSub: "kept on this device",
  languageName: { en: "English", ar: "العربية" },
  languageDirection: { en: "Left to right", ar: "Right to left" },
  appearanceTitle: "Appearance",
  appearanceSub: "kept on this device",
  themeLight: "Light",
  themeDark: "Dark",
  themeAuto: "As the device",
  signOutTitle: "Sign out of this device",
  signOutHelp: "You come back with a new code from your email.",
  signOutAction: "Sign out",

  downloadAll: "Download all data",
  dataTitle: "Your data",
  dataSub: "everything this business keeps in ALYR",
  dataIncludes: [
    "Customers, messages, orders, bookings and credit accounts",
    "The catalog, prices, stock and its history",
    "Every document's PDF, your logo and stamp, and the catalog's photos",
    "The team, the settings and the activity record",
  ],
  dataFormat: "One ZIP of CSV files that Excel opens, Arabic intact, with a note on how to read them. To keep your own copy, give an accountant, or take elsewhere.",
  whoCanDownload: "Who can download",
  whoCanDownloadValue: "Owners only",
  money: "Money",
  moneyValue: `Dirhams, 100 = QAR${NBSP}1`,
  limit: "Limit",
  limitValue: "5 downloads an hour",
  dataLeftOut: "Left out of the ZIP: sign-in codes and sessions, keys and secrets, the spreadsheets you uploaded, and what ALYR charges you.",
  dataRule: "By rule: every owner gets an email each time the data is downloaded, and the download goes on the activity record.",
  downloadTitle: "Download all the data?",
  downloadBody: "The ZIP is made while you wait. Every owner of the business gets an email that you downloaded it, and it goes on the activity record.",
  downloadConfirm: "Download",
  downloadKeep: "Not now",
  downloadOffline: "Downloading needs a connection.",

  customersTitle: "Customers' data",
  customersSub: "when a customer asks",
  customersBody: "A customer who asks for a copy of their data, or to be forgotten, asks the business. An owner or an admin does either from the customer's conversation in the Inbox, and it goes on the customer's record with who did it.",
  customersRule: "By rule: a customer can be forgotten once no order is open and no booking is ahead. A receipt or invoice already issued is never changed.",

  keepsTitle: "What ALYR keeps",
  keptIn: "Kept in",
  keptInValue: "Google Cloud, Doha region",
  keepConversations: "Conversations and orders",
  keepWhileOpen: "While the account is open",
  keepDocuments: "Issued documents",
  keepAfter: "After the account closes",
  keepAfterValue: "60 days, then erased",
  keepBackups: "Copies in backups",
  keepBackupsValue: "Gone 35 days later",
  keepStaff: "ALYR staff see",
  keepStaffValue: "Counts, never message text",
  keepsNote: "ALYR holds no money and no card numbers. What the law makes ALYR keep, such as its own invoices to you, stays.",

  closeTitle: "Close the account",
  closeBody: "Closing ends the plan with seven days' notice. Everything works until then. After that ALYR sends nothing more for you on WhatsApp and charges you nothing more, and your data stays 60 days for you to download before it is erased.",
  closeAction: "Close the account",
  closeOwnersOnly: "Owners only. Asks you to confirm.",

  mailTitle: "Change your sign-in email",
  mailSteps: ["New address", "Code from the email"],
  mailStepDone: "done",
  mailStepCurrent: "current",
  mailAddressLabel: "New email address",
  mailAddressHint: "ALYR emails a 6-digit code to this address. It works for 10 minutes.",
  mailSend: "Email me a code",
  mailCancel: "Cancel",
  mailNow: "Now",
  mailNew: "New",
  mailSent: "We emailed a code to the new address. Type it here to make it your sign-in email.",
  mailCodeLabel: "6-digit code",
  mailCodeNote: "Works for 10 minutes · 5 tries",
  mailResend: "Send a new code",
  mailTellsOld: "We tell your old address, so nobody can change it behind your back.",
  mailSignsOut: "You are signed out on your other devices. This one stays signed in.",
  mailAnother: "Use another address",
  mailConfirm: "Change my sign-in email",
  mailDone: (email) => `Your sign-in email is now ${email}. We told your old address and signed you out on your other devices.`,
  mailRefusals: {
    demo: "The open demo has no sign-in email to change.",
    invalid: "That is not an email address. Check it and try again.",
    same: "That is already your sign-in email.",
    staff: "ALYR staff accounts change their sign-in email through ALYR.",
    too_many: "Too many codes asked for. Try again in an hour.",
    code: "That code is wrong or has expired. Check the email, or ask for a new code.",
    taken: "That address already signs someone in to ALYR. Sign in with it, or choose another.",
    offline: "No connection. Check it and try again.",
    failed: "That did not work. Check your connection and try again.",
  },

  closeDialogTitle: (name) => `Close the ${name} account?`,
  closeWhatHappens: "What happens, and when",
  closeToday: "Today",
  closeUntil: (day) => `Until ${day}`,
  closeFrom: (day) => `From ${day}`,
  closeTodayText: "You ask to close. Every owner gets an email with the date. Nothing else changes.",
  closeUntilText: "Seven days' notice. Everything works as usual. To change your mind, reply to that email and ALYR keeps the account.",
  closeFromText: "ALYR sends nothing more for you on WhatsApp and charges you nothing more. The workspace stays open and you can still download your data.",
  closeEraseText: "ALYR erases the business's data, except what the law makes it keep, such as its invoices to you. Copies in backups are gone 35 days after that.",
  closeImpact: (b, day, c, owed) =>
    `${bookings(b, "en")} ${b === 1 ? "is" : "are"} after ${day} and ${customers(c, "en")} ${c === 1 ? "owes" : "owe"} ${qar(owed, "en")}. From that day ALYR sends no reminders for you.`,
  closeHaveCopy: "I have my own copy of the data, or I do not need one",
  closeHaveCopyHint: (day) => `You can download it again until ${day}.`,
  closeNote: "Only an owner can close the account.",
  closeKeep: "Keep the account",
  closeConfirm: (day) => `Close on ${day}`,
  closeFailed: "That did not work. Check your connection and try again.",
  closeAsked: "Closing is asked for. Every owner gets an email with the date.",

  noAccessBody: "Only an owner can download all of the business's data or close the account.",
};

const ar: SettingsCopy = {
  accountTitle: "حسابك",
  accountSub: "اسمك، وطريقة دخولك، والأنشطة التي تعمل لها، وشكل مساحة العمل لك.",
  privacyTitle: "البيانات والخصوصية",
  privacySub: "نسختك من كل شيء، وما تحتفظ به ALYR، وما تفعله حين يسأل عميل عن بياناته، وإغلاق الحساب.",
  titleAction: "كل إجراء هنا يسألك أولاً",
  loadingLabel: "جارٍ تحميل حسابك",
  loadedAt: (time) => `حُمّلت ${time}`,
  offlineBanner: (time) => `ما تراه على الشاشة حُمّل الساعة ${time}. لا يمكن حفظ التغييرات حتى يعود الاتصال.`,
  errorBanner: "تعذّر تحميل حسابك الآن.",
  retry: "حاول مرة أخرى",
  dismiss: "إغلاق",

  youTitle: "أنت",
  teamRoles: "الفريق · الأدوار",
  nameLabel: "اسمك",
  nameHint: "يحدده مالك النشاط في صفحة الفريق.",
  roleLabel: "الدور",
  roleHint: "يغيّره مالك النشاط في صفحة الفريق.",
  roles: { owner: "صاحب المحل", admin: "مدير", agent: "موظف" },
  youAreRole: { owner: "أنت صاحب المحل", admin: "أنت مدير", agent: "أنت موظف" },

  emailTitle: "بريد الدخول",
  emailChange: "تغيير",
  emailHelp: "ترسل ALYR رمزاً من 6 أرقام إلى هذا العنوان في كل مرة تدخل فيها. لا توجد كلمة مرور تتذكرها أو تتسرب.",
  sessionNote: "يدوم الدخول 30 يوماً على كل جهاز. تغيير بريد الدخول يُخرجك من أجهزتك الأخرى.",

  businessesTitle: "أنشطتك",
  businessesSub: "عند الدخول يُفتح النشاط الذي استخدمته آخر مرة",
  openNow: "مفتوح الآن",
  open: "افتح",
  opening: "جارٍ الفتح",
  businessesNote: "لكل نشاط عملاؤه وطلباته وفريقه. فتح نشاط آخر يعيد تحميل مساحة العمل.",

  languageTitle: "اللغة",
  languageSub: "تُحفظ على هذا الجهاز",
  languageName: { en: "English", ar: "العربية" },
  languageDirection: { en: "من اليسار إلى اليمين", ar: "من اليمين إلى اليسار" },
  appearanceTitle: "المظهر",
  appearanceSub: "يُحفظ على هذا الجهاز",
  themeLight: "فاتح",
  themeDark: "داكن",
  themeAuto: "مثل الجهاز",
  signOutTitle: "الخروج من هذا الجهاز",
  signOutHelp: "تعود برمز جديد من بريدك.",
  signOutAction: "خروج",

  downloadAll: "نزّل كل البيانات",
  dataTitle: "بياناتك",
  dataSub: "كل ما يحفظه هذا النشاط في ALYR",
  dataIncludes: [
    "العملاء والرسائل والطلبات والحجوزات والحسابات الآجلة",
    "الكتالوج والأسعار والمخزون وسجله",
    "ملف PDF لكل مستند، وشعارك وختمك، وصور الكتالوج",
    "الفريق والإعدادات وسجل النشاط",
  ],
  dataFormat: "ملف ZIP من ملفات CSV يفتحها Excel والعربية سليمة، مع ملاحظة تشرح قراءتها. لتحتفظ بنسختك، أو تعطيها لمحاسب، أو تنقلها إلى مكان آخر.",
  whoCanDownload: "من يستطيع التنزيل",
  whoCanDownloadValue: "المالك فقط",
  money: "المبالغ",
  moneyValue: `بالدرهم، 100 = 1${NBSP}ر.ق`,
  limit: "الحد",
  limitValue: "5 تنزيلات في الساعة",
  dataLeftOut: "لا يشمل الملف: رموز الدخول وجلساته، والمفاتيح والأسرار، والجداول التي رفعتها، وما تحاسبك عليه ALYR.",
  dataRule: "القاعدة: يصل بريد إلى كل مالك في كل مرة تُنزَّل فيها البيانات، ويُسجَّل التنزيل في سجل النشاط.",
  downloadTitle: "تنزيل كل البيانات؟",
  downloadBody: "يُجهَّز الملف وأنت تنتظر. يصل بريد إلى كل مالك للنشاط بأنك نزّلته، ويُسجَّل في سجل النشاط.",
  downloadConfirm: "نزّل",
  downloadKeep: "ليس الآن",
  downloadOffline: "التنزيل يحتاج إلى اتصال.",

  customersTitle: "بيانات العملاء",
  customersSub: "حين يسأل عميل",
  customersBody: "العميل الذي يطلب نسخة من بياناته أو أن يُنسى يطلب ذلك من النشاط. يفعل المالك أو المدير أيّاً من الأمرين من محادثة العميل في المحادثات، ويُسجَّل على سجل العميل مع اسم من فعله.",
  customersRule: "القاعدة: يمكن نسيان العميل متى لم يبقَ طلب مفتوح ولا حجز قادم. الإيصال أو الفاتورة التي صدرت لا تتغير.",

  keepsTitle: "ما تحتفظ به ALYR",
  keptIn: "مكان الحفظ",
  keptInValue: "Google Cloud، منطقة الدوحة",
  keepConversations: "المحادثات والطلبات",
  keepWhileOpen: "ما دام الحساب مفتوحاً",
  keepDocuments: "المستندات الصادرة",
  keepAfter: "بعد إغلاق الحساب",
  keepAfterValue: "60 يوماً ثم تُمحى",
  keepBackups: "النسخ الاحتياطية",
  keepBackupsValue: "تزول بعد 35 يوماً",
  keepStaff: "ما يراه فريق ALYR",
  keepStaffValue: "أعداداً، لا نص الرسائل",
  keepsNote: "لا تحتفظ ALYR بأموال ولا بأرقام بطاقات. وما يلزمها القانون بحفظه، مثل فواتيرها إليك، يبقى.",

  closeTitle: "إغلاق الحساب",
  closeBody: "الإغلاق ينهي الخطة بمهلة سبعة أيام. يعمل كل شيء حتى انتهائها. بعدها لا ترسل ALYR شيئاً باسمك على واتساب ولا تحاسبك على شيء، وتبقى بياناتك 60 يوماً لتنزّلها قبل أن تُمحى.",
  closeAction: "أغلق الحساب",
  closeOwnersOnly: "للمالك فقط. يطلب منك التأكيد.",

  mailTitle: "تغيير بريد الدخول",
  mailSteps: ["العنوان الجديد", "الرمز من الرسالة"],
  mailStepDone: "تمّت",
  mailStepCurrent: "الحالية",
  mailAddressLabel: "عنوان البريد الجديد",
  mailAddressHint: "ترسل ALYR رمزاً من 6 أرقام إلى هذا العنوان. يعمل 10 دقائق.",
  mailSend: "أرسل لي رمزاً",
  mailCancel: "إلغاء",
  mailNow: "الآن",
  mailNew: "الجديد",
  mailSent: "أرسلنا رمزاً إلى العنوان الجديد. اكتبه هنا ليصبح بريد الدخول لديك.",
  mailCodeLabel: "الرمز المكوّن من 6 أرقام",
  mailCodeNote: "يعمل 10 دقائق · 5 محاولات",
  mailResend: "أرسل رمزاً جديداً",
  mailTellsOld: "نُبلغ عنوانك القديم، فلا يستطيع أحد تغييره من وراء ظهرك.",
  mailSignsOut: "يُسجَّل خروجك من أجهزتك الأخرى. ويبقى هذا الجهاز مسجّلاً للدخول.",
  mailAnother: "استخدم عنواناً آخر",
  mailConfirm: "غيّر بريد الدخول",
  mailDone: (email) => `أصبح بريد الدخول لديك ${email}. أبلغنا عنوانك القديم، وسجّلنا خروجك من أجهزتك الأخرى.`,
  mailRefusals: {
    demo: "العرض التجريبي المفتوح ليس له بريد دخول لتغييره.",
    invalid: "هذا ليس عنوان بريد صحيحاً. تحقق منه وحاول مرة أخرى.",
    same: "هذا هو بريد الدخول لديك بالفعل.",
    staff: "حسابات فريق ALYR تغيّر بريد الدخول عن طريق ALYR.",
    too_many: "طلبت رموزاً كثيرة. حاول مرة أخرى بعد ساعة.",
    code: "الرمز غير صحيح أو انتهت صلاحيته. راجع الرسالة أو اطلب رمزاً جديداً.",
    taken: "هذا العنوان يُدخل شخصاً آخر إلى ALYR. ادخل به، أو اختر عنواناً آخر.",
    offline: "لا يوجد اتصال. تحقق منه وحاول مرة أخرى.",
    failed: "لم ينجح ذلك. تحقق من الاتصال وحاول مرة أخرى.",
  },

  closeDialogTitle: (name) => `إغلاق حساب ${name}؟`,
  closeWhatHappens: "ما الذي يحدث ومتى",
  closeToday: "اليوم",
  closeUntil: (day) => `حتى ${day}`,
  closeFrom: (day) => `من ${day}`,
  closeTodayText: "تطلب الإغلاق. يصل بريد بالتاريخ إلى كل مالك. ولا يتغير شيء آخر.",
  closeUntilText: "مهلة سبعة أيام. يعمل كل شيء كالمعتاد. إن غيّرت رأيك فردّ على تلك الرسالة وتُبقي ALYR الحساب.",
  closeFromText: "لا ترسل ALYR شيئاً باسمك على واتساب ولا تحاسبك على شيء. تبقى مساحة العمل مفتوحة ويمكنك تنزيل بياناتك.",
  closeEraseText: "تمحو ALYR بيانات النشاط، إلا ما يلزمها القانون بحفظه، مثل فواتيرها إليك. وتزول النسخ الاحتياطية بعد ذلك بـ 35 يوماً.",
  closeImpact: (b, day, c, owed) =>
    `${bookings(b, "ar")} بعد ${day}، و${customers(c, "ar")} ${c === 1 ? "عليه" : c === 2 ? "عليهما" : "عليهم"} ${qar(owed, "ar")} لك. بعد ذلك اليوم لا ترسل ALYR تذكيرات باسمك.`,
  closeHaveCopy: "لدي نسخة من البيانات، أو لا أحتاج إلى نسخة",
  closeHaveCopyHint: (day) => `يمكنك تنزيلها مرة أخرى حتى ${day}.`,
  closeNote: "المالك وحده يستطيع إغلاق الحساب.",
  closeKeep: "أبقِ الحساب",
  closeConfirm: (day) => `أغلق في ${day}`,
  closeFailed: "لم ينجح ذلك. تحقق من الاتصال وحاول مرة أخرى.",
  closeAsked: "طُلب الإغلاق. يصل بريد بالتاريخ إلى كل مالك.",

  noAccessBody: "المالك وحده يستطيع تنزيل كل بيانات النشاط أو إغلاق الحساب.",
};

export const SETTINGS_COPY: Record<Lang, SettingsCopy> = { en, ar };
