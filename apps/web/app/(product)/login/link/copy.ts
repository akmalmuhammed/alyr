// Every word on the page the "your workspace is ready" email opens (/login/link), in English and
// Arabic. The Arabic is a draft for a native reviewer (ALY-66); where /login says the same thing,
// it uses the same words.

import type { Lang } from "../../_workspace/lang";

type Words = {
  lead: string;
  switchTo: string;
  switchLabel: string;
  hint: string;
  open: string;
  useCode: string;
  /** The link is unknown, was used, or ran out. */
  gone: string;
  /** The address has no token in it (cut off by a mail program, or typed by hand). */
  missing: string;
  tooMany: string;
  offline: string;
};

export const COPY: Record<Lang, Words> = {
  en: {
    lead: "Your workspace is ready",
    switchTo: "العربية",
    switchLabel: "Show this page in Arabic",
    hint: "This link signs you in once. Press the button to open your workspace.",
    open: "Open your workspace",
    useCode: "Sign in with a code instead",
    gone: "This link has expired or was already used. Sign in with a code instead.",
    missing: "This link is incomplete. Open it again from your email, or sign in with a code.",
    tooMany: "Too many tries. Try again in an hour.",
    offline: "Cannot reach ALYR. Check your connection and try again.",
  },
  ar: {
    lead: "مساحة عملك جاهزة",
    switchTo: "English",
    switchLabel: "اعرض هذه الصفحة بالإنجليزية",
    hint: "يسجّل هذا الرابط دخولك مرة واحدة. اضغط الزر لتفتح مساحة عملك.",
    open: "افتح مساحة عملك",
    useCode: "سجّل الدخول برمز بدلاً من ذلك",
    gone: "انتهت صلاحية هذا الرابط أو سبق استخدامه. سجّل الدخول برمز بدلاً من ذلك.",
    missing: "هذا الرابط ناقص. افتحه من بريدك مرة أخرى، أو سجّل الدخول برمز.",
    tooMany: "محاولات كثيرة. حاول بعد ساعة.",
    offline: "تعذّر الوصول إلى ALYR. تحقق من الاتصال وحاول مرة أخرى.",
  },
};
