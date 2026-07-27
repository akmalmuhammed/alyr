import type { LanguageCode } from "@/domain/model";
import {
  formatPortfolioMoney,
  formatPortfolioMoneyCompact
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
}

export interface FormattedRecordedValue {
  /** Text rendered on screen. */
  readonly text: string;
  /** Equivalent text that never asks a screen reader to pronounce the mask. */
  readonly accessibilityLabel: string;
}

const RECORDED_VALUE_MASK = "\u2022".repeat(6);

export function valueVisibilityFromHidden(
  amountsHidden: boolean
): ValueVisibility {
  return amountsHidden ? "hidden" : "visible";
}

export function recordedValueHiddenAccessibilityLabel(
  currency: string,
  language: LanguageCode
): string {
  return language === "ar"
    ? `${currency}، القيمة المسجّلة مخفية`
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
  language,
  locale = language === "ar" ? "ar-QA" : "en-QA",
  visibility
}: RecordedValueFormatInput): FormattedRecordedValue {
  if (visibility === "hidden") {
    return {
      text: `${currency} ${RECORDED_VALUE_MASK}`,
      accessibilityLabel: recordedValueHiddenAccessibilityLabel(
        currency,
        language
      )
    };
  }

  const text = compact
    ? formatPortfolioMoneyCompact(amountMinor, currency, locale)
    : formatPortfolioMoney(amountMinor, currency, locale);
  return {
    text,
    accessibilityLabel: text
  };
}
