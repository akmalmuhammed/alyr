// Every word of the "Not sent" screen (specs/036, go-live checklist item 26), in English and
// Arabic. The Arabic is a draft until the native review (ALY-66). The screen holds no text of
// its own; WhatsApp's own reason is shown as WhatsApp gives it, in English.

import type { Lang } from "./catalogCopy";

export type { Lang };

/** Why a message did not reach the customer, as the API names it (`core/not_sent.py`). */
export type Reason =
  | "gave_up" | "whatsapp" | "window_closed" | "no_consent" | "opted_out"
  | "no_marketing_consent" | "no_back_in_stock_consent";

/** Why it cannot go again now: a reason above, or its picture or file was never kept. */
export type WhyNot = Exclude<Reason, "gave_up" | "whatsapp"> | "file_lost";

type Words = {
  eyebrow: string;
  title: string;
  sub: (days: number) => string;
  empty: (days: number) => string;
  loading: string;
  offline: string;
  retry: string;
  retrying: string;
  queued: string;
  failed: string;
  whatsappSaid: string;
  reason: Record<Reason, string>;
  whyNot: Record<WhyNot, string>;
};

export const NS: Record<Lang, Words> = {
  en: {
    eyebrow: "Messages",
    title: "Not sent",
    sub: (days) => `Messages of the last ${days} days that did not reach a customer, and why. Send one again once the reason is gone.`,
    empty: (days) => `Every message of the last ${days} days went out.`,
    loading: "Loading…",
    offline: "Cannot reach ALYR. Check your connection and try again.",
    retry: "Send again",
    retrying: "Sending…",
    queued: "On its way again.",
    failed: "It could not be sent again. Try once more, or tell ALYR.",
    whatsappSaid: "WhatsApp's reason:",
    reason: {
      gave_up: "ALYR could not hand it to WhatsApp after several tries.",
      whatsapp: "WhatsApp did not deliver it.",
      window_closed: "Held back: WhatsApp allows a free message only within 24 hours of the customer's last message.",
      no_consent: "Held back: the customer has not agreed to messages from the shop.",
      opted_out: "Held back: the customer asked for no more messages.",
      no_marketing_consent: "Held back: the customer has not agreed to offers.",
      no_back_in_stock_consent: "Held back: the customer did not ask to hear when this is back.",
    },
    whyNot: {
      window_closed: "It can go once the customer writes to you again.",
      no_consent: "It can go once the customer agrees to hear from the shop.",
      opted_out: "It can go only if the customer writes START.",
      no_marketing_consent: "It can go only to a customer who agreed to offers.",
      no_back_in_stock_consent: "It can go only to a customer who asked about this item.",
      file_lost: "Its picture or file was not kept. Send it again from where you made it.",
    },
  },
  ar: {
    eyebrow: "الرسائل",
    title: "لم تُرسل",
    sub: (days) => `رسائل آخر ${days} يوماً التي لم تصل إلى العميل، وسبب ذلك. أعد إرسال الرسالة بعد زوال السبب.`,
    empty: (days) => `خرجت كل رسائل آخر ${days} يوماً.`,
    loading: "جارٍ التحميل…",
    offline: "تعذّر الوصول إلى ALYR. تحقق من الاتصال وحاول مرة أخرى.",
    retry: "أعد الإرسال",
    retrying: "جارٍ الإرسال…",
    queued: "في طريقها من جديد.",
    failed: "تعذّرت إعادة الإرسال. حاول مرة أخرى أو أخبر ALYR.",
    whatsappSaid: "سبب واتساب:",
    reason: {
      gave_up: "لم يتمكن ALYR من تسليمها إلى واتساب بعد عدة محاولات.",
      whatsapp: "لم يوصلها واتساب.",
      window_closed: "أُوقفت: يسمح واتساب بالرسالة الحرة خلال 24 ساعة فقط من آخر رسالة من العميل.",
      no_consent: "أُوقفت: لم يوافق العميل على تلقي رسائل من المتجر.",
      opted_out: "أُوقفت: طلب العميل عدم مراسلته.",
      no_marketing_consent: "أُوقفت: لم يوافق العميل على تلقي العروض.",
      no_back_in_stock_consent: "أُوقفت: لم يطلب العميل إبلاغه بعودة هذا الصنف.",
    },
    whyNot: {
      window_closed: "يمكن إرسالها حين يراسلك العميل من جديد.",
      no_consent: "يمكن إرسالها حين يوافق العميل على تلقي رسائل المتجر.",
      opted_out: "لا يمكن إرسالها إلا إذا كتب العميل «ابدأ» أو START.",
      no_marketing_consent: "تُرسل فقط إلى عميل وافق على تلقي العروض.",
      no_back_in_stock_consent: "تُرسل فقط إلى عميل سأل عن هذا الصنف.",
      file_lost: "لم تُحفظ صورتها أو ملفها. أرسلها من جديد من حيث أنشأتها.",
    },
  },
};
