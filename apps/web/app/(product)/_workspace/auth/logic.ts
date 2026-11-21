// Pure logic of the sign-in and sign-up screens: the code boxes, a typed price, a countdown.
// Erasable TypeScript with no React, so `node --test` runs it directly. Digits and money reuse the
// product's own helpers (login/code.ts, _ui/format.ts) instead of a second copy.

import { codeDigits } from "../../login/code.ts";
import { money } from "../../../_ui/format.ts";

export type ThemeChoice = "light" | "dark" | "auto";
export type LanguageChoice = "en" | "ar";

export const CODE_LENGTH = 6;

const EASTERN = /[٠-٩۰-۹]/g;

/** Arabic-Indic and Persian digits turned into 0 to 9; everything else is kept as typed. */
export function normalizeDigits(input: string): string {
  return input.replace(EASTERN, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** What a code field may hold: Latin digits only, at most six (a pasted "٧٣٠-٥١٨" becomes "730518"). */
export function sanitizeCode(input: string): string {
  return codeDigits(input).slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type CodeEdit = {
  /** The six boxes after the edit; "" is an empty box. */
  digits: string[];
  /** The box that takes focus next. */
  focus: number;
};

/**
 * Applies what was typed or pasted into box `index`. One character fills that box and moves on; a
 * run of characters (a paste, or the browser's one-time-code fill) is spread from `index` over the
 * boxes after it, or from the first box when it is a whole code. Anything that is not a digit,
 * Arabic digits included, is read as its Latin digit or dropped. Emptying a box empties only it.
 */
export function applyCodeInput(digits: readonly string[], index: number, typed: string): CodeEdit {
  const next = Array.from({ length: CODE_LENGTH }, (_, i) => digits[i] ?? "");
  const clean = sanitizeCode(typed);
  if (!clean) {
    next[index] = "";
    return { digits: next, focus: index };
  }
  const start = clean.length >= CODE_LENGTH ? 0 : index;
  let last = start;
  for (let i = 0; i < clean.length && start + i < CODE_LENGTH; i++) {
    next[start + i] = clean[i];
    last = start + i;
  }
  return { digits: next, focus: Math.min(CODE_LENGTH - 1, last + 1) };
}

/** A price as typed ("35", "1,200", "٣٥", "12.5") as a number of riyals, or null when it is not one. */
export function parsePrice(typed: string): number | null {
  const text = normalizeDigits(typed).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Number(text);
}

/** A typed price as the product writes money: "QAR 1,200" in English, "1,200 ر.ق" in Arabic. */
export function formatMoney(typed: number | string, lang: LanguageChoice = "en"): string {
  const riyals = typeof typed === "number" ? typed : parsePrice(typed);
  if (riyals === null) return String(typed);
  return money(Math.round(riyals * 100), lang);
}

/** Seconds as m:ss ("0:42"). */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export type ServiceLine = { name: string; minutes: number; price: string; deposit: string };

/** A length in minutes as the price list writes it: "40 min", "90 min", "4 h", "2 h 30 min" (Arabic: «40 د», «4 س»). */
export function durationLabel(minutes: number, lang: LanguageChoice): string {
  const min = lang === "ar" ? "د" : "min";
  const hour = lang === "ar" ? "س" : "h";
  // Up to two hours the list counts in minutes ("90 min"); longer jobs count in hours ("4 h", "2 h 30 min").
  if (minutes < 120) return `${minutes} ${min}`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} ${hour} ${rest} ${min}` : `${h} ${hour}`;
}

export type ServiceSummary = { count: number; low: number; high: number; withDeposit: number };

/** What the "setup so far" panel says about the price list: how many lines have a price, the range, how many take a deposit. */
export function summarizeServices(services: readonly ServiceLine[]): ServiceSummary | null {
  const prices = services.map((s) => parsePrice(s.price)).filter((p): p is number => p !== null);
  if (!prices.length) return null;
  const withDeposit = services.filter((s) => (parsePrice(s.deposit) ?? 0) > 0).length;
  return { count: services.length, low: Math.min(...prices), high: Math.max(...prices), withDeposit };
}

export type QuoteLine = { product: string; dirhams: number | null };

/** The monthly total of a published quote, in dirhams. A line with no amount is included in the price. */
export function quoteTotal(lines: readonly QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + (line.dirhams ?? 0), 0);
}

/** A list line is kept only when it has a name; the last line left cannot be removed. */
export function canRemoveService(count: number): boolean {
  return count > 1;
}
