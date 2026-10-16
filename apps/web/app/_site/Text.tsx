import type { ReactNode } from "react";

// Amounts ("QAR 1,850", "449 ر.ق") and the name ALYR are kept whole: in Arabic they sit in
// <bdi> so the line never reorders them, and an amount never breaks across two lines.
const KEEP = /(QAR\s?[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s?ر\.ق|ALYR(?: Chat)?)/g;

/** A sentence from `copy.ts` with its amounts and product names protected. */
export function rich(text: string): ReactNode {
  const parts = text.split(KEEP);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <bdi key={index} className={part.startsWith("ALYR") ? undefined : "money"}>
        {part}
      </bdi>
    ) : (
      part
    ),
  );
}
