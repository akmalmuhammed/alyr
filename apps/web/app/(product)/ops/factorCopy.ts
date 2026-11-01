// Every word on the second-factor screens of the back office (ALY-125, D-136), in English and
// Arabic. The rest of the console is English only; these screens are the ones a member of staff
// meets at the door, so they read in either language, chosen by the switch on the screen and kept
// with the workspace's own choice (`_workspace/lang.ts`). The Arabic is a draft for a native
// reviewer (ALY-66).

import type { Lang } from "../_workspace/lang";

export type Words = {
  switchTo: string;
  switchLabel: string;
  signOut: string;
  // The code prompt (the account has an authenticator; this session has not used it yet)
  promptTitle: string;
  promptBody: string;
  codeLabel: string;
  recoveryLabel: string;
  useRecovery: string;
  useApp: string;
  recoveryHint: string;
  continue: string;
  lostPhone: string;
  // Wrong, paused, offline
  wrong: string;
  paused: (minutes: number) => string;
  offline: string;
  notStaff: string;
  // Enrolment closed
  closedTitle: string;
  closedBody: string;
  // Setting up
  setupTitle: string;
  setupStepScan: string;
  qrLabel: string;
  cannotScan: string;
  openInApp: string;
  setupStepType: string;
  setupCodeLabel: string;
  turnOn: string;
  start: string;
  // The recovery codes
  codesTitle: string;
  codesBody: string;
  copyCodes: string;
  copied: string;
  downloadCodes: string;
  savedIt: string;
  done: string;
  codesFileHead: string;
  // The Security screen
  securityTitle: string;
  securityLead: string;
  appHeading: string;
  appOn: (date: string) => string;
  appOff: string;
  requiredHeading: string;
  requiredYes: string;
  requiredNo: string;
  recoveryHeading: string;
  recoveryLeft: (n: number) => string;
  changeHeading: string;
  changeBody: string;
  currentLabel: string;
  replace: string;
  newCodes: string;
  turnOff: string;
  turnOffClosed: string;
  check: string;
  checked: string;
  replaced: string;
  turnedOff: string;
  // The audit-trail line under the screen
  note: string;
};

/** "10 minutes" / «10 دقائق», with the Arabic number agreement. */
export function minutesText(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 minute" : `${n} minutes`;
  if (n === 1) return "دقيقة واحدة";
  if (n === 2) return "دقيقتين";
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

/** "10 codes left" / «بقي 10 رموز», the same. */
export function codesLeftText(n: number, lang: Lang): string {
  if (lang === "en") return n === 1 ? "1 code left" : `${n} codes left`;
  if (n === 0) return "لم يبقَ أي رمز";
  if (n === 1) return "بقي رمز واحد";
  if (n === 2) return "بقي رمزان";
  if (n >= 3 && n <= 10) return `بقي ${n} رموز`;
  return `بقي ${n} رمزاً`;
}

export const COPY: Record<Lang, Words> = {
  en: {
    switchTo: "العربية",
    switchLabel: "Show this page in Arabic",
    signOut: "Sign out",
    promptTitle: "Enter your authenticator code",
    promptBody: "The console asks for a second step. Open your authenticator app and type the 6-digit code it shows for ALYR.",
    codeLabel: "Code from your app",
    recoveryLabel: "Recovery code",
    useRecovery: "Use a recovery code instead",
    useApp: "Use the code from my app",
    recoveryHint: "A recovery code works once. After you use it, make new ones on the Security screen.",
    continue: "Continue",
    lostPhone: "No phone and no recovery codes? The break-glass in docs/runbooks/staff-sign-in.md puts it right.",
    wrong: "That code is wrong, or has already been used. A code works once: wait for the next one.",
    paused: (m) => `Too many wrong codes. Try again in ${minutesText(m, "en")}.`,
    offline: "The console could not be reached. Check your connection and try again.",
    notStaff: "This console is for ALYR staff only.",
    closedTitle: "This account has no authenticator yet",
    closedBody: "The console now asks for an authenticator app, and this account has none. Setting one up from here is closed, so that someone who only reads your inbox cannot add their own phone. Ask whoever runs ALYR to open enrolment for you (docs/runbooks/staff-sign-in.md, “open-enrolment”).",
    setupTitle: "Set up your authenticator app",
    setupStepScan: "1. In an authenticator app on your phone, add an account and scan this square.",
    qrLabel: "Setup square for your authenticator app",
    cannotScan: "Cannot scan it? Type this key into the app instead:",
    openInApp: "Open it in my authenticator app",
    setupStepType: "2. Type the 6-digit code the app now shows.",
    setupCodeLabel: "Code from your app",
    turnOn: "Turn on",
    start: "Start",
    codesTitle: "Keep your recovery codes",
    codesBody: "If you lose your phone, each of these codes lets you in once. This is the only time they are shown. Save them in your password manager now.",
    copyCodes: "Copy the codes",
    copied: "Copied.",
    downloadCodes: "Download as a text file",
    savedIt: "I have saved them",
    done: "Done",
    codesFileHead: "ALYR console recovery codes. Each works once.",
    securityTitle: "Security",
    securityLead: "How your account opens the console. A code from the mailbox is the first step; an authenticator app is the second.",
    appHeading: "Authenticator app",
    appOn: (d) => `On since ${d}`,
    appOff: "Off",
    requiredHeading: "Second step required",
    requiredYes: "Yes: the console asks for it at every sign-in.",
    requiredNo: "Not yet: the console does not ask for it. It is switched on after you have set up the app and saved your recovery codes.",
    recoveryHeading: "Recovery codes",
    recoveryLeft: (n) => codesLeftText(n, "en"),
    changeHeading: "Change it",
    changeBody: "Every change needs a current code from your app, or a recovery code.",
    currentLabel: "Current code",
    replace: "Replace the app",
    newCodes: "Make new recovery codes",
    turnOff: "Turn it off",
    turnOffClosed: "Turning it off is closed while the second step is required. Replace the app instead.",
    check: "Check my app",
    checked: "That code is right.",
    replaced: "Your new app is on.",
    turnedOff: "The authenticator app is off.",
    note: "Setting up, replacing and turning it off are written to the audit log, and ALYR emails you each time.",
  },
  ar: {
    switchTo: "English",
    switchLabel: "عرض هذه الصفحة بالإنجليزية",
    signOut: "تسجيل الخروج",
    promptTitle: "أدخل رمز تطبيق المصادقة",
    promptBody: "تطلب اللوحة خطوة ثانية. افتح تطبيق المصادقة واكتب الرمز المكوّن من 6 أرقام الظاهر لحساب ALYR.",
    codeLabel: "الرمز من تطبيقك",
    recoveryLabel: "رمز الاسترداد",
    useRecovery: "استخدم رمز استرداد بدلاً من ذلك",
    useApp: "استخدم الرمز من تطبيقي",
    recoveryHint: "رمز الاسترداد يعمل مرة واحدة. بعد استخدامه، أنشئ رموزاً جديدة من شاشة الأمان.",
    continue: "متابعة",
    lostPhone: "لا هاتف ولا رموز استرداد؟ يعالج ذلك دليل الطوارئ في docs/runbooks/staff-sign-in.md.",
    wrong: "الرمز خاطئ أو سبق استخدامه. كل رمز يعمل مرة واحدة، فانتظر الرمز التالي.",
    paused: (m) => `رموز خاطئة كثيرة. حاول مرة أخرى بعد ${minutesText(m, "ar")}.`,
    offline: "تعذّر الوصول إلى اللوحة. تحقق من اتصالك وحاول مرة أخرى.",
    notStaff: "هذه اللوحة لفريق ALYR فقط.",
    closedTitle: "ليس لهذا الحساب تطبيق مصادقة بعد",
    closedBody: "تطلب اللوحة الآن تطبيق مصادقة، وليس لهذا الحساب تطبيق. إعداده من هنا مغلق، حتى لا يستطيع من يقرأ بريدك الإلكتروني فقط أن يضيف هاتفه. اطلب ممّن يدير ALYR أن يفتح لك الإعداد (docs/runbooks/staff-sign-in.md، «open-enrolment»).",
    setupTitle: "إعداد تطبيق المصادقة",
    setupStepScan: "1. في تطبيق مصادقة على هاتفك، أضف حساباً وامسح هذا المربع.",
    qrLabel: "مربع إعداد تطبيق المصادقة",
    cannotScan: "لا تستطيع المسح؟ اكتب هذا المفتاح في التطبيق بدلاً من ذلك:",
    openInApp: "افتحه في تطبيق المصادقة",
    setupStepType: "2. اكتب الرمز المكوّن من 6 أرقام الذي يظهر الآن في التطبيق.",
    setupCodeLabel: "الرمز من تطبيقك",
    turnOn: "تشغيل",
    start: "ابدأ",
    codesTitle: "احتفظ برموز الاسترداد",
    codesBody: "إذا فقدت هاتفك، يفتح لك كل رمز من هذه الرموز الباب مرة واحدة. هذه هي المرة الوحيدة التي تظهر فيها. احفظها الآن في مدير كلمات المرور.",
    copyCodes: "نسخ الرموز",
    copied: "تم النسخ.",
    downloadCodes: "تنزيل كملف نصي",
    savedIt: "حفظتها",
    done: "تم",
    codesFileHead: "رموز استرداد لوحة ALYR. كل رمز يعمل مرة واحدة.",
    securityTitle: "الأمان",
    securityLead: "كيف يفتح حسابك اللوحة. الرمز الذي يصل إلى بريدك هو الخطوة الأولى، وتطبيق المصادقة هو الخطوة الثانية.",
    appHeading: "تطبيق المصادقة",
    appOn: (d) => `يعمل منذ ${d}`,
    appOff: "متوقف",
    requiredHeading: "الخطوة الثانية مطلوبة",
    requiredYes: "نعم: تطلبها اللوحة عند كل تسجيل دخول.",
    requiredNo: "ليس بعد: لا تطلبها اللوحة. تُفعَّل بعد أن تُعدّ التطبيق وتحفظ رموز الاسترداد.",
    recoveryHeading: "رموز الاسترداد",
    recoveryLeft: (n) => codesLeftText(n, "ar"),
    changeHeading: "تغييره",
    changeBody: "كل تغيير يحتاج إلى رمز حالي من تطبيقك أو رمز استرداد.",
    currentLabel: "الرمز الحالي",
    replace: "استبدال التطبيق",
    newCodes: "إنشاء رموز استرداد جديدة",
    turnOff: "إيقافه",
    turnOffClosed: "الإيقاف مغلق ما دامت الخطوة الثانية مطلوبة. استبدل التطبيق بدلاً من ذلك.",
    check: "تحقق من تطبيقي",
    checked: "الرمز صحيح.",
    replaced: "تم تشغيل تطبيقك الجديد.",
    turnedOff: "تم إيقاف تطبيق المصادقة.",
    note: "الإعداد والاستبدال والإيقاف تُسجَّل في سجل التدقيق، وترسل لك ALYR بريداً في كل مرة.",
  },
};
