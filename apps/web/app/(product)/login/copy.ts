// Every word on the workspace sign-in page (/login), in English and Arabic. The Arabic is a
// draft for a native reviewer (ALY-66); where /start already says the same thing, it uses the
// same words.

import type { Lang } from "../_workspace/lang";

type Words = {
  lead: string;
  switchTo: string;
  switchLabel: string;
  email: string;
  send: string;
  /** Said around the address the code went to, which is shown left to right in both languages. */
  sentBefore: string;
  sentAfter: string;
  devCode: string;
  code: string;
  signIn: string;
  other: string;
  tooMany: string;
  cannotSend: string;
  wrong: string;
  offline: string;
};

export const COPY: Record<Lang, Words> = {
  en: {
    lead: "Sign in to your shop's workspace",
    switchTo: "العربية",
    switchLabel: "Show this page in Arabic",
    email: "Work email",
    send: "Send me a code",
    sentBefore: "If ",
    sentAfter: " has an account, a 6-digit code is on its way. It works for 10 minutes.",
    devCode: "Local development only, no email is sent: your code is",
    code: "Code",
    signIn: "Sign in",
    other: "Use a different email",
    tooMany: "Too many codes requested. Try again in an hour.",
    cannotSend: "Codes cannot be sent right now. Try again shortly.",
    wrong: "That code is wrong or has expired. Check it, or request a new one.",
    offline: "Cannot reach ALYR. Check your connection and try again.",
  },
  ar: {
    lead: "سجّل الدخول إلى مساحة عمل متجرك",
    switchTo: "English",
    switchLabel: "اعرض هذه الصفحة بالإنجليزية",
    email: "البريد الإلكتروني للعمل",
    send: "أرسل لي رمزاً",
    sentBefore: "إذا كان للبريد ",
    sentAfter: " حساب، فرمز من 6 أرقام في الطريق إليه. صالح لمدة 10 دقائق.",
    devCode: "للتطوير المحلي فقط، لم يُرسل بريد: رمزك",
    code: "الرمز",
    signIn: "سجّل الدخول",
    other: "استخدم بريداً آخر",
    tooMany: "طلبت رموزاً كثيرة. حاول بعد ساعة.",
    cannotSend: "تعذّر إرسال الرموز الآن. حاول بعد قليل.",
    wrong: "الرمز غير صحيح أو انتهت صلاحيته. تحقق منه أو اطلب رمزاً جديداً.",
    offline: "تعذّر الوصول إلى ALYR. تحقق من الاتصال وحاول مرة أخرى.",
  },
};
