// Every word of marking an order paid and of choosing how customers pay, in English and Arabic
// (ALY-170, specs/024-pay-on-collection). The Arabic is a draft until a native speaker has been
// through it (ALY-66). Both languages are written against one shape, so a missing Arabic line is
// a type error.

import type { Lang } from "./catalogCopy";

const en = {
  markPaid: "Mark paid",
  how: "How did they pay?",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  card_terminal: "Card machine",
  reference: "Reference (optional)",
  save: "Save as paid",
  cancel: "Cancel",
  failed: "That did not save. Try again.",
  already: "This order is already paid.",
  // ── how customers pay ────────────────────────────────
  waysTitle: "How customers pay",
  waysOnline: "Customers pay online with a payment link",
  waysLater: "Customers pay when they collect, and you mark the order paid",
  waysPick: "Which ways you take",
  waysSaved: "Saved",
  waysNeed: "Choose at least one way.",
};

const ar: typeof en = {
  markPaid: "تسجيل كمدفوع",
  how: "كيف دفع؟",
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  cheque: "شيك",
  card_terminal: "بطاقة عبر الجهاز",
  reference: "المرجع (اختياري)",
  save: "حفظ كمدفوع",
  cancel: "إلغاء",
  failed: "لم يُحفظ. حاول مرة أخرى.",
  already: "هذا الطلب مدفوع بالفعل.",
  waysTitle: "كيف يدفع العملاء",
  waysOnline: "يدفع العملاء إلكترونياً عبر رابط الدفع",
  waysLater: "يدفع العملاء عند الاستلام، وتسجّل أنت الطلب كمدفوع",
  waysPick: "الطرق التي تقبلها",
  waysSaved: "تم الحفظ",
  waysNeed: "اختر طريقة واحدة على الأقل.",
};

export const ORDER_PAY: Record<Lang, typeof en> = { en, ar };
