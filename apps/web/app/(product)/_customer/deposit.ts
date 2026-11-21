// A shop's rule for a booking's deposit, in the customer's words (ALY-27, D-084, spec 033).
// The booking page shows it beside the confirm button, the payment page again before paying,
// and the workspace's setup shows the owner the same sentence. It mirrors
// `terms_sentence` in the API (`modules/bookings/words.py`), which the chat message uses.
// The Arabic is a draft until a native speaker reviews it (ALY-66).

import type { Lang } from "./price";

export type DepositTerms = {
  no_show: "keep" | "refund";
  late_cancel: "keep" | "refund";
  cancel_hours: number;
  hold_minutes?: number;
};

/** The cancel window as Arabic counts it after «من» or «بـ», where the dual is «ساعتين»:
 *  «ساعة واحدة», «ساعتين», «3 ساعات», «24 ساعة». `by` joins «بـ» to it. Mirrors `hours_ar` in the API. */
export function hoursAr(hours: number, by = false): string {
  if (hours === 1) return by ? "بساعة واحدة" : "ساعة واحدة";
  if (hours === 2) return by ? "بساعتين" : "ساعتين";
  const text = hours >= 3 && hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  return by ? `بـ${text}` : text;
}

/** What happens to a paid deposit, in one or two sentences. */
export function termsSentence(terms: DepositTerms, lang: Lang): string {
  const h = terms.cancel_hours;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  const keepNoShow = terms.no_show === "keep";
  const keepLate = terms.late_cancel === "keep";
  if (lang === "ar") {
    const rule = keepNoShow && keepLate
      ? `إذا لم تحضر، أو ألغيت قبل الموعد بأقل من ${hoursAr(h)}، يحتفظ المحل بالعربون.`
      : keepNoShow
        ? `إذا لم تحضر يحتفظ المحل بالعربون. وإذا ألغيت قبل الموعد بأقل من ${hoursAr(h)} يُرد إليك.`
        : keepLate
          ? `إذا ألغيت قبل الموعد بأقل من ${hoursAr(h)} يحتفظ المحل بالعربون. وإذا لم تحضر يُرد إليك.`
          : "يُرد العربون إليك إذا ألغيت أو لم تحضر.";
    return `${rule} إذا ألغيت قبل الموعد ${hoursAr(h, true)} أو أكثر يُرد إليك العربون.`;
  }
  const rule = keepNoShow && keepLate
    ? `If you do not come, or cancel less than ${hours} before, the shop keeps the deposit.`
    : keepNoShow
      ? `If you do not come, the shop keeps the deposit. If you cancel less than ${hours} before, it is refunded.`
      : keepLate
        ? `If you cancel less than ${hours} before, the shop keeps the deposit. If you do not come, it is refunded.`
        : "The deposit is refunded if you cancel or do not come.";
  return `${rule} Cancel ${hours} or more before and it is refunded.`;
}

/** Card payments wait for the shop's own payment provider (hard rule 3, D-044). Until then a
 *  deposit link opens ALYR's test payment page, and every place that shows one says so. */
export const STAND_IN = {
  en: "Card payments go live with the shop's payment provider. Until then this link opens a test payment page and no money moves.",
  ar: "يبدأ الدفع بالبطاقة مع مزوّد الدفع الخاص بالمحل. حتى ذلك الحين يفتح هذا الرابط صفحة دفع تجريبية ولا تُنقل أي أموال.",
} as const;
