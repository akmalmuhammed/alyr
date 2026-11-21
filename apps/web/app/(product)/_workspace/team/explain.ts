// The server's refusals, in the shop's words and both languages. The API answers a refusal with a short
// English sentence (routes/auth.py, core/auth.py); the screen recognises the ones the team can meet and
// says them whole, and leaves every other failure to the kit's `say` (offline, signed out, 5xx).
// Erasable TypeScript only, so `node --test` runs it.

import { ApiError, say } from "../../../_ui/api.ts";
import type { Lang } from "../../../_ui/format.ts";

type Words = { en: string; ar: string };

const KNOWN: Array<[RegExp, Words]> = [
  [/at least one owner/i, {
    en: "A business must keep at least one owner. Make someone else an owner first.",
    ar: "يجب أن يبقى للمنشأة مالك واحد على الأقل. اجعل شخصاً آخر مالكاً أولاً.",
  }],
  [/only an owner can (make|change|remove)/i, {
    en: "Only an owner can make, change or remove an owner.",
    ar: "المالك وحده يستطيع تعيين مالك أو تغيير دوره أو إزالته.",
  }],
  [/already on the team/i, {
    en: "That email is already on the team.",
    ar: "هذا البريد الإلكتروني موجود في الفريق بالفعل.",
  }],
  [/only an owner or admin/i, {
    en: "Only an owner or admin can change the team.",
    ar: "المالك والمدير فقط يستطيعان تعديل الفريق.",
  }],
  [/give a name and a valid email/i, {
    en: "Give a name and a valid email address.",
    ar: "اكتب الاسم وبريداً إلكترونياً صحيحاً.",
  }],
  [/cannot remove yourself/i, {
    en: "You cannot remove yourself from the team.",
    ar: "لا يمكنك إزالة نفسك من الفريق.",
  }],
  [/no such team member/i, {
    en: "That person is no longer on the team. Reload the list.",
    ar: "لم يعد هذا الشخص في الفريق. أعد تحميل القائمة.",
  }],
];

/** The sentence for a failed team action or load, in the person's language. */
export function explain(error: unknown, lang: Lang): string {
  if (error instanceof ApiError && error.message) {
    for (const [pattern, words] of KNOWN) if (pattern.test(error.message)) return words[lang];
  }
  return say(error, lang);
}

/** True when the failure is "no connection": the screen keeps what it has and says so. */
export function isOffline(error: unknown): boolean {
  return error instanceof ApiError && error.code === "offline";
}
