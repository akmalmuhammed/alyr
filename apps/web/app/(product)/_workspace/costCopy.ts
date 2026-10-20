// Every word the cost price and margin screens say, in English and Arabic, in one place
// (ALY-150 part 3, specs/014-pricing-pack; the Arabic is a draft until a native speaker has been
// through it, ALY-66). The components hold no text. Both languages are written against one
// shape, so a missing Arabic line is a type error, not a hole on a phone.
//
// Only owners and admins ever see these words, and only while the shop keeps costs: the screens
// that use this file are not drawn for anyone else (`Margin.tsx`, `CostFields.tsx`).
//
// Amounts are written by `../_customer/price.ts` («QAR 24», «24 ر.ق»). Where an amount or a
// percentage sits inside a sentence it is wrapped in an isolate so the digits keep their order
// in Arabic. A negative figure is written with a real minus sign inside the isolate.

import type { Lang } from "./catalogCopy";

/** Keeps an amount or a percentage in one run inside a sentence of the other direction. */
const iso = (text: string) => `⁨${text}⁩`;

/** «صنف واحد», «صنفان», «3 أصناف», «11 صنفاً», each followed by what is said about them. */
function itemsAr(n: number, rest: string): string {
  if (n === 1) return `صنف واحد ${rest}`;
  if (n === 2) return `صنفان ${rest}`;
  return `${n} ${n <= 10 ? "أصناف" : "صنفاً"} ${rest}`;
}

const en = {
  // ── the item sheet ───────────────────────────────────
  cost: "Cost price (QAR)",
  costHint: "What one costs you. Optional. Only owners and admins see it.",
  sizeCost: "Cost of this size (QAR)",
  sizeCostHint: "Empty: same as the item.",
  sizeSaveFirst: "Save the item first, then set the cost of a new size.",
  margin: (amount: string, pct: string | null) => `Margin ${iso(amount)}${pct === null ? "" : ` · ${iso(`${pct}%`)}`}`,
  marginBelow: "Below cost",
  marginSale: "At the sale price",
  marginToday: "At today's price",
  below: (sale: boolean, size: string, price: string, cost: string) =>
    `The ${sale ? "sale price" : "price"}${size ? ` (${size})` : ""} ${iso(price)} is below what it costs you (${iso(cost)}). You can still save it.`,
  warnLabel: "Price below cost",
  costLoading: "Loading the cost…",
  costFailed: "The cost could not be loaded. The rest of the item can still be saved.",
  badCost: "Use an amount in riyals, for example 40 or 45.50, or leave it empty.",
  costNotSaved: (why: string) => `The item was saved, but its cost was not. ${why} Open the item to set it again.`,
  historyTitle: "Cost history",
  historyNone: "No cost has been kept for this item yet.",
  historyItem: "The item",
  historyRemoved: "Cost taken away",
  historyBy: (who: string) => `by ${iso(who)}`,
  // ── the list ─────────────────────────────────────────
  pill: (pct: string | null) => (pct === null ? "Margin" : `Margin ${iso(`${pct}%`)}`),
  pillBelow: "Below cost",
  // ── the Stock tab ────────────────────────────────────
  stockValue: (amount: string) => `Stock value: ${iso(amount)} at cost`,
  stockValueNone: "Stock value: no cost kept yet",
  stockMissing: (n: number) => `${n} ${n === 1 ? "item has" : "items have"} no cost kept`,
  stockMissingNote: "Not counted in the value.",
  stockRegion: "Value of the stock at cost",
  // ── the orders list ──────────────────────────────────
  order: (amount: string, pct: string | null) => `Estimated margin ${iso(amount)}${pct === null ? "" : ` (${iso(`${pct}%`)})`}`,
  orderBelow: "Below cost",
  orderPartial: "some items have no cost kept",
  orderRegion: "Estimated margin of this order",
  // ── the import sheet ─────────────────────────────────
  importColumn: "The last column, \"Cost price (QAR)\", is optional. Fill it to set what each item costs you; leave it empty to keep the cost as it is. Only owners and admins see costs, and only they can import them.",
};

export type CostCopy = typeof en;

const ar: CostCopy = {
  cost: "سعر التكلفة (ر.ق)",
  costHint: "ما تكلفه الوحدة عليك. اختياري. لا يراه إلا المالكون والمشرفون.",
  sizeCost: "تكلفة هذا المقاس (ر.ق)",
  sizeCostHint: "إن تُرك فارغاً فهو مثل تكلفة الصنف.",
  sizeSaveFirst: "احفظ الصنف أولاً، ثم حدّد تكلفة المقاس الجديد.",
  margin: (amount, pct) => `الهامش ${iso(amount)}${pct === null ? "" : ` · ${iso(`${pct}%`)}`}`,
  marginBelow: "أقل من التكلفة",
  marginSale: "بسعر العرض",
  marginToday: "بسعر اليوم",
  below: (sale, size, price, cost) =>
    `${sale ? "سعر العرض" : "السعر"}${size ? ` (${size})` : ""} ${iso(price)} أقل من تكلفته عليك (${iso(cost)}). يمكنك حفظه مع ذلك.`,
  warnLabel: "السعر أقل من التكلفة",
  costLoading: "جارٍ تحميل التكلفة…",
  costFailed: "تعذّر تحميل التكلفة. ما زال بإمكانك حفظ بقية بيانات الصنف.",
  badCost: "استخدم مبلغاً بالريال، مثلاً 40 أو 45.50، أو اتركه فارغاً.",
  costNotSaved: (why) => `حُفظ الصنف، لكن لم تُحفظ تكلفته. ${why} افتح الصنف لتحديدها من جديد.`,
  historyTitle: "سجل التكلفة",
  historyNone: "لم تُسجَّل تكلفة لهذا الصنف بعد.",
  historyItem: "الصنف",
  historyRemoved: "أُزيلت التكلفة",
  historyBy: (who) => `بواسطة ${iso(who)}`,
  pill: (pct) => (pct === null ? "الهامش" : `الهامش ${iso(`${pct}%`)}`),
  pillBelow: "أقل من التكلفة",
  stockValue: (amount) => `قيمة المخزون: ${iso(amount)} بسعر التكلفة`,
  stockValueNone: "قيمة المخزون: لم تُسجَّل تكلفة بعد",
  stockMissing: (n) => itemsAr(n, "بلا تكلفة مسجّلة"),
  stockMissingNote: "لا تدخل في القيمة.",
  stockRegion: "قيمة المخزون بسعر التكلفة",
  order: (amount, pct) => `الهامش التقديري ${iso(amount)}${pct === null ? "" : ` (${iso(`${pct}%`)})`}`,
  orderBelow: "أقل من التكلفة",
  orderPartial: "لم تُسجَّل تكلفة لبعض الأصناف",
  orderRegion: "الهامش التقديري لهذا الطلب",
  importColumn: "العمود الأخير «سعر التكلفة (ر.ق)» اختياري. املأه لتحديد ما يكلّفك كل صنف، واتركه فارغاً لتبقى التكلفة كما هي. لا يرى التكلفة إلا المالكون والمشرفون، ولا يستوردها غيرهم.",
};

export const COST: Record<Lang, CostCopy> = { en, ar };
