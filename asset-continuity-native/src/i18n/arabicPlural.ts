export type ArabicCardinalPluralCategory =
  | "zero"
  | "one"
  | "two"
  | "few"
  | "many"
  | "other";

const ARABIC_INDIC_DIGITS = [
  "٠",
  "١",
  "٢",
  "٣",
  "٤",
  "٥",
  "٦",
  "٧",
  "٨",
  "٩"
] as const;

/**
 * Deterministic Arabic cardinal selection for the integer counts rendered by
 * Heldat. Hermes does not guarantee Intl.PluralRules on every Android device,
 * so route modules must not construct that API during evaluation.
 */
export function selectArabicCardinalPlural(
  value: number
): ArabicCardinalPluralCategory {
  const absolute = Math.abs(value);

  if (!Number.isFinite(absolute) || !Number.isInteger(absolute)) {
    return "other";
  }
  if (absolute === 0) return "zero";
  if (absolute === 1) return "one";
  if (absolute === 2) return "two";

  const remainder = absolute % 100;
  if (remainder >= 3 && remainder <= 10) return "few";
  if (remainder >= 11 && remainder <= 99) return "many";
  return "other";
}

/**
 * Small display fallback for runtimes that omit Intl.NumberFormat. It is used
 * only for UI counts; financial values continue through the portfolio value
 * formatter and its stricter precision rules.
 */
export function formatArabicDisplayNumber(
  value: number,
  maximumFractionDigits: 0 | 1 = 1
): string {
  if (!Number.isFinite(value)) return String(value);

  let ascii =
    maximumFractionDigits === 0
      ? Math.round(value).toFixed(0)
      : value.toFixed(1).replace(/0$/u, "").replace(/\.$/u, "");

  ascii = ascii.replace(/\./gu, "٫");
  return ascii.replace(
    /\d/gu,
    (digit) => ARABIC_INDIC_DIGITS[Number(digit)] ?? digit
  );
}
