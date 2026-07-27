import type { LanguageCode } from "@/domain/model";

export interface LocalizedDateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export type LocalizedDateValidation = "invalid" | "future" | null;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeLocaleDigits(value: string): string {
  return [...value]
    .map((character) => {
      const arabic = ARABIC_INDIC.indexOf(character);
      if (arabic >= 0) return String(arabic);
      const eastern = EASTERN_ARABIC_INDIC.indexOf(character);
      if (eastern >= 0) return String(eastern);
      return character;
    })
    .join("");
}

export function localizeDateDigits(
  value: string,
  language: LanguageCode
): string {
  if (language !== "ar") return value;
  return value.replace(/[0-9]/gu, (digit) => ARABIC_INDIC[Number(digit)]!);
}

export function datePartsFromIso(
  value: string,
  language: LanguageCode
): LocalizedDateParts {
  const [year = "", month = "", day = ""] = value.slice(0, 10).split("-");
  return {
    day: localizeDateDigits(String(Number(day) || ""), language),
    month: localizeDateDigits(String(Number(month) || ""), language),
    year: localizeDateDigits(year, language)
  };
}

function normalizedPart(value: string): string {
  return normalizeLocaleDigits(value).trim();
}

export function isoFromLocalizedDateParts(
  parts: LocalizedDateParts
): string | null {
  const dayText = normalizedPart(parts.day);
  const monthText = normalizedPart(parts.month);
  const yearText = normalizedPart(parts.year);
  if (
    !/^\d{1,2}$/u.test(dayText) ||
    !/^\d{1,2}$/u.test(monthText) ||
    !/^\d{4}$/u.test(yearText)
  ) {
    return null;
  }
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${yearText.padStart(4, "0")}-${monthText.padStart(
    2,
    "0"
  )}-${dayText.padStart(2, "0")}`;
}

export function validateLocalizedDateParts(
  parts: LocalizedDateParts,
  todayIso: string
): LocalizedDateValidation {
  const iso = isoFromLocalizedDateParts(parts);
  if (!iso) return "invalid";
  return iso > todayIso ? "future" : null;
}

export function shouldStackLocalizedDateFields(
  width: number,
  fontScale: number
): boolean {
  return width <= 340 || fontScale >= 1.3;
}
