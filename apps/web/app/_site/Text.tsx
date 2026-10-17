import type { ReactNode } from "react";

// Amounts ("QAR 1,850", "449 ر.ق"), order numbers ("#1043", "رقم 1043") and the name ALYR
// are kept whole: they sit in <bdi> so an Arabic line never reorders them, and an amount
// never breaks across two lines.
const KEEP = /(QAR\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s?ر\.ق|#\d{3,}|رقم\s\d+|ALYR(?: Chat)?)/g;

const kind = (part: string) => (part.startsWith("ALYR") ? undefined : /^(#|رقم)/.test(part) ? "ref" : "money");

/** A sentence from `copy.ts` with its amounts, order numbers and product names protected. */
export function rich(text: string): ReactNode {
  const parts = text.split(KEEP);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <bdi key={index} className={kind(part)}>
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}
