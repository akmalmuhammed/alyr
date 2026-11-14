export type ThemeChoice = "light" | "dark" | "auto";
export type LanguageChoice = "en" | "ar";

/**
 * Normalises Eastern Arabic numerals (both Arabic-Indic and Persian/Urdu) into standard Latin digits (0-9).
 */
export function normalizeDigits(input: string): string {
  const easternToArabicMap: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"
  };
  return input.replace(/[٠-٩۰-۹]/g, (d) => easternToArabicMap[d] ?? d);
}

/**
 * Sanitises an input code string into at most 6 digits.
 */
export function sanitizeCode(input: string): string {
  const normalized = normalizeDigits(input);
  return normalized.replace(/\D/g, "").slice(0, 6);
}

/**
 * Validates whether the given string is exactly a 6-digit code.
 */
export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Basic email format check.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Formats a money value according to language rules.
 * English: "QAR 500"
 * Arabic: "500\u00a0ر.ق"
 */
export function formatMoney(amount: number | string, lang: LanguageChoice = "en"): string {
  const str = String(amount);
  if (lang === "ar") {
    return `${str}\u00a0ر.ق`;
  }
  return `QAR ${str}`;
}

/**
 * Formats seconds into mm:ss format.
 */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
