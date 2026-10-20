// The paper of ALYR Docs: receipt RC-0042 and the paper's own labels, in the words the
// engine prints (`modules/documents/words.py`, render/sample.py). The same on the English and
// the Arabic page, because the paper is the paper. Its own module, so the drawn paper can be
// used by the product pages' demo (a client component) without shipping the site's copy.

/** A word as the paper prints it: Arabic first, English beside it. */
export type Pair = { ar: string; en: string };

/** One document as the engine lays it out on paper (render/sample.py): the same words on
 * the English and the Arabic page, because the paper is the paper. */
export type PaperDoc = {
  kind: Pair;
  number: string;
  date: Pair;
  shop: { name: Pair; address: Pair };
  customer: Pair;
  payment: Pair;
  lines: { name: Pair; qty: string; unit: string; price: string; total: string }[];
  subtotal: string;
  total: string;
  paid: string;
  notes: Pair;
  /** The note a shop with no CR number gets on every receipt (`NOTES.unregistered`). */
  noCr: Pair;
  code: string;
  /** For the series rail under the A4: the numbers before and after this one. */
  series: { before: string[]; next: string };
};

/** The paper's own labels (`words.py`), the same on both pages. */
export type PaperLabels = {
  no: Pair; date: Pair; customer: Pair; payment: Pair; index: Pair; description: Pair; qty: Pair;
  unit: Pair; total: Pair; subtotal: Pair; grand: Pair; paid: Pair; notes: Pair; currency: string;
  code: string; page: string; issued: string;
};

export const PAPER_LABELS: PaperLabels = {
  no: { ar: "الرقم", en: "No." },
  date: { ar: "التاريخ", en: "Date" },
  customer: { ar: "العميل", en: "Customer" },
  payment: { ar: "الدفع", en: "Payment" },
  index: { ar: "م", en: "#" },
  description: { ar: "الوصف", en: "Description" },
  qty: { ar: "الكمية", en: "Qty" },
  unit: { ar: "سعر الوحدة", en: "Unit price" },
  total: { ar: "الإجمالي", en: "Total" },
  subtotal: { ar: "المجموع الفرعي", en: "Subtotal" },
  grand: { ar: "الإجمالي", en: "Total" },
  paid: { ar: "المدفوع", en: "Paid" },
  notes: { ar: "ملاحظات", en: "Notes" },
  currency: "ر.ق",
  code: "رمز المستند",
  page: "صفحة 1 من 1",
  issued: "صدر عبر ALYR",
};

/** Receipt RC-0042: Aisha Hamad's cash payment for order #1461, Monday 19 Oct 2026. The
 * engine's own sample uses a retired family name (02 §8), so the site draws its own paper.
 * The shop's CR number is left off rather than made up (02 §4.1d). */
export const RC0042: PaperDoc = {
  kind: { ar: "إيصال", en: "Receipt" },
  number: "RC-0042",
  date: { ar: "19 أكتوبر 2026", en: "19 Oct 2026" },
  shop: {
    name: { ar: "مخبز قرفة", en: "Qirfa Bakery" },
    address: { ar: "بن محمود، الدوحة، قطر", en: "Bin Mahmoud, Doha, Qatar" },
  },
  customer: { ar: "عائشة حمد", en: "Aisha Hamad" },
  payment: { ar: "نقدًا", en: "Cash" },
  lines: [
    { name: { ar: "كيك الحليب بالزعفران، قطعة", en: "Saffron milk cake, slice" }, qty: "2", unit: "قطعة", price: "26.00", total: "52.00" },
    { name: { ar: "كرواسون بالزبدة", en: "Butter croissant" }, qty: "1", unit: "قطعة", price: "12.00", total: "12.00" },
  ],
  subtotal: "64.00",
  total: "64.00",
  paid: "64.00",
  notes: { ar: "شكرًا لتسوّقكم من مخبز قرفة.", en: "Thank you for shopping at Qirfa Bakery." },
  noCr: {
    ar: "لا يوجد رقم سجل تجاري مسجّل للبائع. هذا المستند إيصال وليس فاتورة ضريبية. لا تقدّم ALYR استشارات ضريبية.",
    en: "The seller has no commercial registration number on file. This document is a receipt and is not a tax invoice. ALYR does not give tax advice.",
  },
  code: "9F3A 7C21 D0B4 11E8",
  series: { before: ["RC-0040", "RC-0041"], next: "RC-0043" },
};

