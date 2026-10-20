// What a person types into the cost screens, as the API takes it (ALY-150 part 3): riyals with
// up to two decimals become whole dirhams by `pricingMoney.ts`, which moves the digits and never
// multiplies a float. The arithmetic on the result is in `costMath.ts`.

import { MAX_COST } from "./costMath";
import { riyalsToDirhams, western } from "./pricingMoney";

/** What a cost box holds: `ok` is false for something that is not an amount; empty is a valid "no cost". */
export function parseCost(text: string): { value: number | null; ok: boolean } {
  if (!text.trim()) return { value: null, ok: true };
  const value = riyalsToDirhams(text);
  return value === null || value > MAX_COST ? { value: null, ok: false } : { value, ok: true };
}

/** A price box, in dirhams; null when empty or not an amount. */
export function priceOf(text: string): number | null {
  return text.trim() ? riyalsToDirhams(text) : null;
}

/** A size's price difference as typed ("-2", "1.5", empty is 0), in dirhams; null when it is not a number. */
export function deltaOf(text: string): number | null {
  const clean = western(text).trim().replace(/^−/, "-");
  if (!clean) return 0;
  const negative = clean.startsWith("-");
  const value = riyalsToDirhams(negative ? clean.slice(1) : clean);
  return value === null ? null : negative ? -value : value;
}
