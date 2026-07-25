export const SUPPORTED_LOCALES = ["en", "ar"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_DIRECTIONS = {
  en: "ltr",
  ar: "rtl",
} as const satisfies Record<SupportedLocale, "ltr" | "rtl">;

/**
 * Stable semantic keys only. Platform clients own translated strings and
 * native presentation, but may not invent different consequences or statuses.
 */
export const PRODUCT_MESSAGE_KEYS = [
  "nav.home",
  "nav.assets",
  "nav.family",
  "nav.vault",
  "action.search",
  "action.capture",
  "action.add_photo",
  "action.add_proof",
  "action.review",
  "action.export",
  "capture.quick_passport",
  "capture.identity",
  "capture.location",
  "capture.proof",
  "capture.review",
  "location.exact",
  "location.user_placed",
  "location.approximate",
  "location.unknown",
  "evidence.pending",
  "evidence.reviewed_by_you",
  "evidence.missing_original",
  "sync.on_device",
  "sync.queued",
  "sync.uploading",
  "sync.processing",
  "sync.synced",
  "sync.needs_attention",
  "disclosure.not_legal_verification",
  "disclosure.not_guaranteed_backup",
] as const;

export type ProductMessageKey = (typeof PRODUCT_MESSAGE_KEYS)[number];
