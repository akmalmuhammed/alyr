// Quantities on the customer pages and in the workspace (ALY-149, D-039 "As built (decimal
// quantities)", specs/013-decimal-quantities/spec.md). One module, so the order page, the
// review, the tracking page, the WhatsApp message and the owner's stock screens read, write and
// add quantities the same way.
//
// A quantity is an exact decimal with at most three places: 12, 0.5, 12.25. It arrives from the
// API as a JSON number. A float cannot hold 0.1 exactly, so no screen adds, compares or multiplies
// two quantities with `+`, `<` or `*`: it goes through thousandths, whole numbers (`milli`),
// and back (`unmilli`). Money is the same: a line is `lineTotal(price, qty)`, the price of one in
// dirhams times the quantity rounded half up to a dirham, the rule the API uses (`qty.line_total`);
// both are tested against one table, `specs/013-decimal-quantities/rounding.json`.
//
// Digits are Western in English and in Arabic, with a point for the decimal mark, as the rest of
// the workspace. Typed text is read in either language's digits and decimal marks.

import type { Lang } from "./price";

export type Unit = {
  key: string;
  en: string;
  ar: string;
  /** Written after a quantity of a measure; empty for a counted unit. */
  short: string;
  short_ar: string;
  measure: boolean;
  /** The step an item sold by this measure starts with (a quarter kilo). */
  step?: number;
};

/** The units the shop can sell by, in the order the pickers show them. The keys are the API's. */
export const UNITS: Unit[] = [
  { key: "piece", en: "Piece", ar: "قطعة", short: "", short_ar: "", measure: false },
  { key: "pack", en: "Pack", ar: "عبوة", short: "", short_ar: "", measure: false },
  { key: "box", en: "Box", ar: "علبة", short: "", short_ar: "", measure: false },
  { key: "portion", en: "Portion", ar: "حصة", short: "", short_ar: "", measure: false },
  { key: "hour", en: "Hour", ar: "ساعة", short: "", short_ar: "", measure: false },
  { key: "kg", en: "Kilogram", ar: "كيلوغرام", short: "kg", short_ar: "كغ", measure: true, step: 0.25 },
  { key: "g", en: "Gram", ar: "غرام", short: "g", short_ar: "غ", measure: true, step: 50 },
  { key: "l", en: "Litre", ar: "لتر", short: "L", short_ar: "لتر", measure: true, step: 0.25 },
  { key: "ml", en: "Millilitre", ar: "مليلتر", short: "ml", short_ar: "مل", measure: true, step: 50 },
  { key: "m", en: "Metre", ar: "متر", short: "m", short_ar: "م", measure: true, step: 0.5 },
  { key: "tola", en: "Tola", ar: "تولة", short: "tola", short_ar: "تولة", measure: true, step: 0.5 },
];
const BY_KEY = new Map(UNITS.map((u) => [u.key, u] as const));

export const unitOf = (key: string): Unit | undefined => BY_KEY.get(key);
export const isMeasure = (key: string): boolean => BY_KEY.get(key)?.measure ?? false;

/** The unit to write beside a quantity of this item: its own for something sold in fractions
 *  (the API's `quantity.show_unit`), none otherwise, so an item sold by whole numbers reads "3"
 *  as it always did. */
export function unitFor(item: { unit: string; quantity?: { show_unit?: boolean } }): string {
  return item.quantity?.show_unit ? item.unit : "piece";
}

/** The unit for a quantity on an order line: the one it was ordered in when it was ordered by
 *  fractions (`shown`), or whenever the quantity itself is a fraction. */
export function lineUnit(q: number, unit: string, shown: boolean): string {
  return shown || milli(q) % 1000 !== 0 ? unit : "piece";
}

/** The most one order line may ask for, as the API says. */
export const MAX_QUANTITY = 999;

// ── thousandths ───────────────────────────────────────────

/** A quantity in thousandths, a whole number. `Math.round` only absorbs the float noise of a
 *  number that came from decimal text with at most three places. */
export const milli = (q: number): number => Math.round(q * 1000);

/** Thousandths back to a quantity. The result is the float nearest the decimal; it is only ever
 *  shown, sent, or turned back into thousandths. */
export const unmilli = (m: number): number => m / 1000;

export const addQty = (a: number, b: number): number => unmilli(milli(a) + milli(b));
export const subQty = (a: number, b: number): number => unmilli(milli(a) - milli(b));
export const cmpQty = (a: number, b: number): number => Math.sign(milli(a) - milli(b));
export const minQty = (a: number, b: number): number => (milli(a) <= milli(b) ? a : b);
export const maxQty = (a: number, b: number): number => (milli(a) >= milli(b) ? a : b);
export const sumQty = (qs: number[]): number => unmilli(qs.reduce((n, q) => n + milli(q), 0));

/** `q` is a whole number of `step`s. */
export const isMultiple = (q: number, step: number): boolean => step > 0 && milli(q) % milli(step) === 0;

/** The least multiple of `step` that is at least `q`. */
export function ceilToStep(q: number, step: number): number {
  const s = milli(step);
  return unmilli(Math.ceil(milli(q) / s) * s);
}

/** The greatest multiple of `step` that is at most `q`. */
export function floorToStep(q: number, step: number): number {
  const s = milli(step);
  return unmilli(Math.floor(milli(q) / s) * s);
}

// ── money ─────────────────────────────────────────────────

/** What one line costs in dirhams: the price of one times the quantity, rounded half up to a
 *  dirham. Whole numbers all the way (thousandths times dirhams stays far below 2^53). */
export function lineTotal(price: number, q: number): number {
  const exact = price * milli(q); // dirhams x thousandths
  const rounded = exact + 500;
  return (rounded - (rounded % 1000)) / 1000;
}

/** The order's total: each line rounded alone, then added. */
export function orderTotal(lines: { price: number; qty: number }[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l.price, l.qty), 0);
}

// ── writing ───────────────────────────────────────────────

/** A quantity as a person reads it: "3", "0.5", "12.25". Western digits in both languages. */
export function fmtQty(q: number): string {
  const m = milli(q);
  const sign = m < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(m) / 1000);
  const part = Math.abs(m) % 1000;
  if (part === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(part).padStart(3, "0").replace(/0+$/, "")}`;
}

/** A quantity with its unit when the unit is a measure: "0.5 kg", «0.5 كغ». A counted unit is the
 *  bare number, as ever. */
export function fmtQtyUnit(q: number, unit: string, lang: Lang): string {
  const u = BY_KEY.get(unit);
  const text = fmtQty(q);
  if (!u || !u.measure) return text;
  return `${text} ${lang === "ar" ? u.short_ar : u.short}`;
}

/** The unit's short name alone, for a label ("per kg"); empty for a counted unit. */
export function unitShort(unit: string, lang: Lang): string {
  const u = BY_KEY.get(unit);
  if (!u || !u.measure) return "";
  return lang === "ar" ? u.short_ar : u.short;
}

/** A quantity for the API: a number when whole, else its decimal text, so a fraction never
 *  travels as a float. */
export function qtyForApi(q: number): number | string {
  return milli(q) % 1000 === 0 ? q : fmtQty(q);
}

// ── reading what is typed ─────────────────────────────────

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

function westernDigits(text: string): string {
  let out = "";
  for (const ch of text) {
    const e = EASTERN.indexOf(ch);
    const p = PERSIAN.indexOf(ch);
    out += e >= 0 ? String(e) : p >= 0 ? String(p) : ch === "٫" ? "." : ch === "٬" ? "," : ch;
  }
  return out;
}

/** The quantity in typed text, or `null` when it is not one: "0.5", "٠٫٥", "0,5", " 12 ", "1,250".
 *  At most three decimals; a comma is a decimal mark unless it groups exactly three digits. */
export function readQty(text: string): number | null {
  let s = westernDigits(text).replace(/[\s ]/g, "");
  if (!s) return null;
  // A comma groups thousands ("1,250", "1,250.5") or, alone and not before exactly three numerals,
  // marks the decimals ("0,5"). Commas anywhere else make it no quantity ("1,2,3").
  if (s.includes(",")) {
    const grouped = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s);
    if (grouped) s = s.replace(/,/g, "");
    else if (/^\d*,\d+$/.test(s) && s.split(",")[1].length !== 3) s = s.replace(",", ".");
    else return null;
  }
  if (!/^\d+(\.\d{1,3})?$|^\.\d{1,3}$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return unmilli(Number(whole || "0") * 1000 + Number(frac.padEnd(3, "0")));
}

/** Typed text is a quantity but with more than three decimals ("0.1234"). */
export function tooManyPlaces(text: string): boolean {
  const s = westernDigits(text).replace(/[\s ]/g, "");
  return /^\d*[.,]\d{4,}$/.test(s);
}
