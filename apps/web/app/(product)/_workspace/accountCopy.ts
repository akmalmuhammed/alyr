// Every word the "Your account" screen says, in English and Arabic, in one place so a reviewer
// can read them together (ALY-66: the Arabic is a draft until a native speaker has been through
// it). The component holds no text. Both languages are written against the same shape, so a
// missing Arabic line is a type error, not a hole on a phone. specs/040, D-081.

export type Lang = "en" | "ar";
export type Refusal = "demo" | "invalid" | "same" | "staff" | "too_many" | "code" | "taken";

const en = {
  eyebrow: "Account",
  title: "Your account",
  sub: "The email you sign in with, the businesses you work for, and your business's data.",

  // ── sign-in email ────────────────────────────────────
  emailTitle: "Sign-in email",
  emailHint: "ALYR emails a code to this address each time you sign in.",
  change: "Change",
  newEmail: "New email address",
  sendCode: "Email me a code",
  sending: "Sending…",
  codeSent: (email: string) => `We emailed a code to ${email}. Type it here to make it your sign-in email.`,
  codeLabel: "Code from the email",
  confirm: "Change my sign-in email",
  confirming: "Changing…",
  cancel: "Cancel",
  otherAddress: "Use another address",
  devCode: (code: string) => `Local development only, no email is sent: the code is ${code}`,
  changed: (email: string) =>
    `Your sign-in email is now ${email}. We told your old address, and signed you out on your other devices.`,
  demoEmail: "The open demo has no sign-in email. Sign in to change yours.",
  refusals: {
    demo: "The open demo has no sign-in email to change.",
    invalid: "That is not an email address. Check it and try again.",
    same: "That is already your sign-in email.",
    staff: "ALYR staff accounts change their sign-in email through ALYR.",
    too_many: "Too many codes asked for. Try again in an hour.",
    code: "That code is wrong or has expired. Check the email, or ask for a new code.",
    taken: "That address already signs someone in to ALYR. Sign in with it, or choose another.",
  } satisfies Record<Refusal, string>,
  failed: "That did not work. Check your connection and try again.",

  // ── businesses ───────────────────────────────────────
  businessesTitle: "Your businesses",
  businessesHint: "Each business keeps its own customers, orders and team. Signing in opens the one you used last.",
  oneBusiness: "You work for one business on ALYR.",
  openNow: "Open now",
  open: "Open",
  opening: "Opening…",
  as: (role: string) => `You are ${role}`,
  roles: { owner: "the owner", admin: "an admin", agent: "an agent" } as Record<string, string>,

  // ── data ─────────────────────────────────────────────
  dataTitle: "Your data",
  dataHint: "Everything this business keeps in ALYR, to keep your own copy, give an accountant, or take elsewhere.",
  dataInside: [
    "Customers, messages, orders, bookings and credit accounts",
    "The catalog, prices, stock and its history",
    "Every document's PDF, your logo and stamp, and the catalog's photos",
    "The team, the settings and the activity record",
  ],
  dataFormat: "One ZIP of CSV files that Excel opens, Arabic intact, with a note on how to read them. Money is in dirhams (100 = QAR 1).",
  download: "Download all data",
  dataNotice: "Every owner gets an email each time the data is downloaded.",
  ownersOnly: "Only an owner can download all of the business's data.",

  loading: "Loading…",
  loadFailed: "Your account could not be loaded just now.",
  retry: "Try again",
};

const ar: typeof en = {
  eyebrow: "الحساب",
  title: "حسابك",
  sub: "البريد الذي تدخل به، والأنشطة التي تعمل لها، وبيانات نشاطك.",

  emailTitle: "بريد الدخول",
  emailHint: "يرسل ALYR رمزاً إلى هذا العنوان في كل مرة تدخل فيها.",
  change: "تغيير",
  newEmail: "عنوان البريد الجديد",
  sendCode: "أرسل لي رمزاً",
  sending: "جارٍ الإرسال…",
  codeSent: (email: string) => `أرسلنا رمزاً إلى ${email}. اكتبه هنا ليصبح بريد الدخول لديك.`,
  codeLabel: "الرمز من الرسالة",
  confirm: "غيّر بريد الدخول",
  confirming: "جارٍ التغيير…",
  cancel: "إلغاء",
  otherAddress: "استخدم عنواناً آخر",
  devCode: (code: string) => `للتطوير المحلي فقط، لا تُرسل رسالة: الرمز هو ${code}`,
  changed: (email: string) =>
    `أصبح بريد الدخول لديك ${email}. أبلغنا عنوانك القديم، وسجّلنا خروجك من أجهزتك الأخرى.`,
  demoEmail: "العرض التجريبي المفتوح ليس له بريد دخول. ادخل بحسابك لتغيير بريدك.",
  refusals: {
    demo: "العرض التجريبي المفتوح ليس له بريد دخول لتغييره.",
    invalid: "هذا ليس عنوان بريد صحيحاً. تحقق منه وحاول مرة أخرى.",
    same: "هذا هو بريد الدخول لديك بالفعل.",
    staff: "حسابات فريق ALYR تغيّر بريد الدخول عن طريق ALYR.",
    too_many: "طلبت رموزاً كثيرة. حاول مرة أخرى بعد ساعة.",
    code: "الرمز غير صحيح أو انتهت صلاحيته. راجع الرسالة أو اطلب رمزاً جديداً.",
    taken: "هذا العنوان يُدخل شخصاً آخر إلى ALYR. ادخل به، أو اختر عنواناً آخر.",
  },
  failed: "لم ينجح ذلك. تحقق من الاتصال وحاول مرة أخرى.",

  businessesTitle: "أنشطتك",
  businessesHint: "لكل نشاط عملاؤه وطلباته وفريقه. عند الدخول يُفتح النشاط الذي استخدمته آخر مرة.",
  oneBusiness: "تعمل لنشاط واحد على ALYR.",
  openNow: "مفتوح الآن",
  open: "افتح",
  opening: "جارٍ الفتح…",
  as: (role: string) => `أنت ${role}`,
  roles: { owner: "صاحب المحل", admin: "مدير", agent: "موظف" },

  dataTitle: "بياناتك",
  dataHint: "كل ما يحفظه هذا النشاط في ALYR، لتحتفظ بنسختك، أو تعطيها لمحاسب، أو تنقلها إلى مكان آخر.",
  dataInside: [
    "العملاء والرسائل والطلبات والحجوزات والحسابات الآجلة",
    "الكتالوج والأسعار والمخزون وسجله",
    "ملف PDF لكل مستند، وشعارك وختمك، وصور الكتالوج",
    "الفريق والإعدادات وسجل النشاط",
  ],
  dataFormat: "ملف ZIP من ملفات CSV يفتحها Excel والعربية سليمة، مع ملاحظة تشرح قراءتها. المبالغ بالدرهم (100 = 1 ريال).",
  download: "نزّل كل البيانات",
  dataNotice: "يصل بريد إلى كل مالك في كل مرة تُنزَّل فيها البيانات.",
  ownersOnly: "تنزيل كل بيانات النشاط للمالك فقط.",

  loading: "جارٍ التحميل…",
  loadFailed: "تعذّر تحميل حسابك الآن.",
  retry: "حاول مرة أخرى",
};

export const COPY: Record<Lang, typeof en> = { en, ar };
