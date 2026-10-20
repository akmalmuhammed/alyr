// The Discounts form's small pure helpers (ALY-150): what a person types becomes what the API
// takes, and back. No screen in it, so each can be tested (`pricing.test.mjs`).
//
// Amounts are whole dirhams (100 = QAR 1). A riyal amount typed with up to two decimals is
// read as text and turned into dirhams by moving the digits, never by multiplying a float, so
// 0.29 is 29 and 1.15 is 115 (1.15 * 100 is 114.99999999999999 as a float).

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Digits typed on an Arabic keyboard become 0-9; an Arabic decimal or comma separator, a dot. */
export function western(text: string): string {
  let out = "";
  for (const char of text) {
    const a = ARABIC_INDIC.indexOf(char);
    const p = EASTERN_PERSIAN.indexOf(char);
    if (a >= 0) out += String(a);
    else if (p >= 0) out += String(p);
    else if (char === "٫" || char === "," || char === "،") out += ".";
    else out += char;
  }
  return out;
}

/** "12.5" riyals to 1250 dirhams. Null when it is not an amount (more than two decimals,
 *  letters, a minus sign). An empty box is null too: the caller decides what empty means. */
export function riyalsToDirhams(text: string): number | null {
  const clean = western(text).trim();
  const match = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(clean);
  if (!match) return null;
  const cents = (match[2] ?? "").padEnd(2, "0");
  return Number(match[1]) * 100 + Number(cents);
}

/** 1250 dirhams to "12.50" for an input; whole riyals have no decimals ("12"); empty for nothing. */
export function dirhamsToRiyals(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const whole = Math.floor(value / 100);
  const part = value % 100;
  if (part === 0) return String(whole);
  return `${whole}.${String(part).padStart(2, "0")}`;
}

/** A percentage typed with up to three decimals, as the API takes it. Null when it is not one,
 *  or is not more than 0 and at most 100. The text is returned (not a float) so "12.50" stays
 *  exact; the caller sends it as a number. */
export function percentText(text: string): string | null {
  const clean = western(text).trim().replace(/%$/, "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(clean);
  if (!match) return null;
  const value = Number(`${match[1]}.${match[2] ?? "0"}`);
  if (!(value > 0 && value <= 100)) return null;
  return clean;
}

/** A whole number from 1 up to `max`, typed. Null for empty, a decimal, zero or too big. */
export function wholeNumber(text: string, max: number): number | null {
  const clean = western(text).trim();
  if (!/^\d{1,9}$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 1 && value <= max ? value : null;
}

/** A code as the form shows it: capitals, Western digits, no spaces. The API folds the rest. */
export function shownCode(text: string): string {
  return western(text).replace(/\s+/g, "").replace(/[.]/g, "").toUpperCase();
}

/** 3 to 24 letters, numbers, dashes or underscores, at least 3 of them letters or numbers. */
export function codeOk(code: string): boolean {
  return /^[\p{L}\p{N}_-]{3,24}$/u.test(code) && code.replace(/[-_]/g, "").length >= 3;
}

/**
 * An ISO time as the shop's wall clock, for a date-time input ("2026-10-20T09:00"). The shop's
 * clock is Doha's (Asia/Qatar, no daylight saving), whatever the device says. The API takes a
 * value without a zone as the shop's wall clock, so what goes back is what was shown.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
