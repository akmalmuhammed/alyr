import type { ReactNode } from "react";

// Amounts ("QAR 1,850", "449 ر.ق"), order numbers ("#1043", "رقم 1043") and the names
// ALYR and its products are kept whole: they sit in <bdi> so an Arabic line never reorders
// them, and an amount never breaks across two lines.
const KEEP = /([−+]?QAR\s?[\d,]+(?:\.\d+)?|[−+]?[\d,]+(?:\.\d+)?\s?ر\.ق|#\d{3,}|رقم\s\d+|ALYR(?: (?:Chat|Bookings|Agent|Accounts|Payroll))?)/g;

// In an Arabic sentence, a run of Latin words (a sample customer's name, "Noor A.", or
// "Marina Desk Co-working") is kept whole too, with its own trailing full stop: otherwise
// the stop of an initial lands on the wrong side of the name.
const KEEP_AR = new RegExp(`${KEEP.source.slice(0, -1)}|[A-Za-z][A-Za-z'’.\\-]*(?: [A-Za-z][A-Za-z'’.\\-]*)*)`, "g");
const ARABIC = /[؀-ۿ]/;

const kind = (part: string) =>
  /^[−+]?(QAR|[\d,])/.test(part) ? "money" : /^(#|رقم)/.test(part) ? "ref" : undefined;

/** A heading from `copy.ts` that names where its lines break (a line feed): each line its
 * own span, set as a block (`.line`), so a phone and a laptop break it in the same place. */
export function lines(text: string): ReactNode {
  if (!text.includes("\n")) return rich(text);
  return text.split("\n").map((line, index) => (
    <span key={index} className="line">{rich(line)}</span>
  ));
}

/** A sentence from `copy.ts` with its amounts, order numbers and product names protected. */
export function rich(text: string): ReactNode {
  const parts = text.split(ARABIC.test(text) ? KEEP_AR : KEEP);
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
