// How the customer pages write an amount (ALY-112, D-039 "As built"). One helper, so the
// order page, the payment page and the tracking page agree.
//
// Amounts are integers in dirhams (1 QAR = 100). English writes «QAR 24», «QAR 24.50»,
// «QAR 1,234». Arabic writes the amount, then «ر.ق», in Western digits: «24 ر.ق»,
// «24.50 ر.ق», «1,234 ر.ق». Qatar's consumer-protection law (Law 8 of 2008, Article 17)
// requires prices in Arabic, clearly shown; it names no digit style or abbreviation. Western
// digits and «ر.ق» after the amount are how Qatari companies write it online (Vodafone Qatar's
// Arabic site, for one) and match the rest of ALYR's Arabic. The Arabic locale ar-QA would
// give Arabic-Indic digits and «ر.ق.»; that is one line to change here if the reviewer
// prefers it. It mirrors `fmt_qar` and `fmt_qar_ar` in the API (`core/normalise.py`).

export type Lang = "en" | "ar";

/** The number only: «24», «24.50», «1,234». */
export function amount(dirhams: number): string {
  const sign = dirhams < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(dirhams) / 100);
  const part = Math.abs(dirhams) % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${part ? `.${String(part).padStart(2, "0")}` : ""}`;
}

/** The currency's written form in the page's language. */
export function currency(lang: Lang): string {
  return lang === "ar" ? "ر.ق" : "QAR";
}

/** «QAR 24» or «24 ر.ق». */
export function formatPrice(dirhams: number, lang: Lang): string {
  return lang === "ar" ? `${amount(dirhams)} ${currency(lang)}` : `${currency(lang)} ${amount(dirhams)}`;
}

/** Two prices written out in full: «QAR 12 – QAR 18», «12 – 18 ر.ق» (never "from"). */
export function formatRange(low: number, high: number, lang: Lang): string {
  if (lang === "ar") return `${amount(low)} – ${amount(high)} ${currency(lang)}`;
  return `${formatPrice(low, lang)} – ${amount(high)}`;
}
