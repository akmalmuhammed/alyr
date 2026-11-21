// What the product says when a call to the API does not work, in English and Arabic. One place,
// so every screen refuses in the same words. `api.ts` picks from these; a screen adds its own
// sentences for the refusals it knows by `code` (see `say`). Every Arabic line is a draft until
// the native review (ALY-66).

export type Say = { en: string; ar: string };

export const API_COPY = {
  /** No answer at all: the network is down or the request never left. */
  offline: { en: "No connection. Try again.", ar: "لا يوجد اتصال. حاول مجدداً." },
  /** 401: the sign-in has ended. */
  signedOut: { en: "Your sign-in ended. Sign in again.", ar: "انتهى تسجيل دخولك. سجّل الدخول من جديد." },
  /** 403 with no reason given. */
  forbidden: { en: "You do not have access to this.", ar: "ليست لديك صلاحية لهذا." },
  /** 404 with no reason given. */
  gone: { en: "That is no longer there.", ar: "لم يعد هذا موجوداً." },
  /** 409 with no reason given: someone else changed it first. */
  changed: { en: "This changed just now. Refresh and try again.", ar: "تغيّر هذا للتو. حدّث الصفحة وحاول مجدداً." },
  /** 422: the request was not in the shape the API takes. */
  invalid: { en: "Check what you entered and try again.", ar: "تحقق مما أدخلته وحاول مجدداً." },
  /** 429. */
  tooMany: { en: "Too many tries. Wait a moment and try again.", ar: "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً." },
  /** 5xx. */
  server: { en: "That did not work on our side. Try again in a moment.", ar: "لم ينجح ذلك من جانبنا. حاول بعد قليل." },
  /** Anything else. */
  failed: { en: "That did not work. Try again.", ar: "لم ينجح ذلك. حاول مجدداً." },
} as const satisfies Record<string, Say>;

export type ApiCopyKey = keyof typeof API_COPY;
