import type { LanguageCode } from "@/domain/model";
import {
  formatPortfolioMoney,
  formatPortfolioMoneyCompact,
  formatSignedPortfolioMoney
} from "@/domain/portfolio";

/**
 * Recorded values are private by default. Callers pass this explicit state
 * instead of choosing their own mask, so visual text and assistive output stay
 * aligned across every value surface.
 */
export type ValueVisibility = "hidden" | "visible";

export interface RecordedValueFormatInput {
  readonly amountMinor: number;
  readonly currency: string;
  readonly language: LanguageCode;
  readonly visibility: ValueVisibility;
  readonly compact?: boolean;
  readonly locale?: string;
  readonly isolateBidi?: boolean;
}

export interface FormattedRecordedValue {
  /** Text rendered on screen. */
  readonly text: string;
  /** Equivalent text that never asks a screen reader to pronounce the mask. */
  readonly accessibilityLabel: string;
}

const RECORDED_VALUE_MASK = "\u2022".repeat(6);
export const LEFT_TO_RIGHT_ISOLATE = "\u2066";
export const POP_DIRECTIONAL_ISOLATE = "\u2069";

/**
 * Keeps an ISO currency code, sign and amount together inside RTL copy.
 *
 * Currency codes are Latin while Arabic-formatted digits and punctuation are
 * bidi-sensitive. A directional isolate gives the complete financial token a
 * stable left-to-right boundary without changing the surrounding paragraph.
 */
export function bidiIsolateFinancialToken(
  token: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `${LEFT_TO_RIGHT_ISOLATE}${token}${POP_DIRECTIONAL_ISOLATE}`
    : token;
}

function bidiIsolateCurrencyCode(
  currency: string,
  language: LanguageCode
): string {
  return bidiIsolateFinancialToken(currency, language);
}

export function valueVisibilityFromHidden(
  amountsHidden: boolean
): ValueVisibility {
  return amountsHidden ? "hidden" : "visible";
}

export function recordedValueHiddenAccessibilityLabel(
  currency: string,
  language: LanguageCode,
  isolateBidi = false
): string {
  return language === "ar"
    ? `${
        isolateBidi
          ? bidiIsolateCurrencyCode(currency, language)
          : currency
      }، القيمة المسجّلة مخفية`
    : `${currency}, recorded amount hidden`;
}

/**
 * Formats one user-recorded amount for both pixels and accessibility.
 *
 * Hidden output deliberately retains only the currency. Dates, item names and
 * counts can still be composed by the caller without disclosing the amount.
 */
export function formatRecordedValue({
  amountMinor,
  compact = false,
  currency,
  isolateBidi = false,
  language,
  locale = language === "ar" ? "ar-QA" : "en-QA",
  visibility
}: RecordedValueFormatInput): FormattedRecordedValue {
  if (visibility === "hidden") {
    const hiddenToken = `${currency} ${RECORDED_VALUE_MASK}`;
    return {
      text: isolateBidi
        ? bidiIsolateFinancialToken(hiddenToken, language)
        : hiddenToken,
      accessibilityLabel: recordedValueHiddenAccessibilityLabel(
        currency,
        language,
        isolateBidi
      )
    };
  }

  const text = compact
    ? formatPortfolioMoneyCompact(amountMinor, currency, locale)
    : formatPortfolioMoney(amountMinor, currency, locale);
  const isolatedText = isolateBidi
    ? bidiIsolateFinancialToken(text, language)
    : text;
  return {
    text: isolatedText,
    accessibilityLabel: isolatedText
  };
}

export function formatSignedRecordedValue({
  amountMinor,
  currency,
  isolateBidi = false,
  language,
  locale = language === "ar" ? "ar-QA" : "en-QA",
  visibility
}: Omit<RecordedValueFormatInput, "compact">): FormattedRecordedValue {
  if (visibility === "hidden") {
    const hiddenToken = `${currency} ${RECORDED_VALUE_MASK}`;
    return {
      text: isolateBidi
        ? bidiIsolateFinancialToken(hiddenToken, language)
        : hiddenToken,
      accessibilityLabel: recordedValueHiddenAccessibilityLabel(
        currency,
        language,
        isolateBidi
      )
    };
  }
  const text = formatSignedPortfolioMoney(
    amountMinor,
    currency,
    locale
  );
  const isolatedText = isolateBidi
    ? bidiIsolateFinancialToken(text, language)
    : text;
  return {
    text: isolatedText,
    accessibilityLabel: isolatedText
  };
}
