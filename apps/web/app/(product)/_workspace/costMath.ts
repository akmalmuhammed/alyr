// The small pure helpers of the cost screens (ALY-150 part 3): what a typed cost becomes, the
// margin it leaves, and where a price is under the cost. No screen in it, so each can be tested
// (`cost.test.mjs`). What a person types is turned into dirhams in `costInput.ts`, which builds
// on `pricingMoney.ts` (its riyals-to-dirhams step moves digits instead of multiplying a float);
// this file takes dirhams only and imports nothing, so Node can run it as it is.
//
// All amounts are whole dirhams (100 = QAR 1). A margin is the price less the cost; its share is
// the amount as a percentage of the price, rounded half up to ONE decimal, exactly as the API does
// it (`costs.pct`: Decimal, ROUND_HALF_UP, so a half goes away from zero for a negative margin
// too). Every figure is a whole number far below 2^53, so the division is exact.

/** The API's own limit for a cost (`costs.MAX_COST`), in dirhams: QAR 1,000,000. */
export const MAX_COST = 100_000_000;

/**
 * `amount` as a share of `price`, in percent with one decimal ("37.5", "-12.0", "100.0"), halves
 * going away from zero; null for a price of zero or less.
 */
export function percentOf(amount: number, price: number): string | null {
  if (!(price > 0)) return null;
  // floor(a * 1000 / p + 1/2), in tenths of a percent
  const tenths = Math.floor((Math.abs(amount) * 2000 + price) / (2 * price));
  const sign = amount < 0 && tenths > 0 ? "-" : "";
  return `${sign}${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** One unit's margin at a price, or null when there is no cost or no price. */
export function marginOf(price: number | null, cost: number | null): { amount: number; pct: string | null } | null {
  if (price === null || cost === null) return null;
  const amount = price - cost;
  return { amount, pct: percentOf(amount, price) };
}

/** "37.5" stays, "40.0" becomes "40", a minus sign is drawn as a real minus: "−12.5". Null stays null. */
export function pctShown(pct: string | null | undefined): string | null {
  if (pct === null || pct === undefined || pct === "") return null;
  return pct.replace(/\.0$/, "").replace(/^-/, "−");
}

/** Today's date in the shop's clock (Doha), "2026-10-20". */
export function qatarToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * The price a customer pays now: the sale price while a sale is on (it is set, lower than the
 * price, and its last day has not passed), else the price. Null when there is no price.
 */
export function todaysPrice(price: number | null, sale: number | null, saleEnds: string, today: string = qatarToday()): number | null {
  if (price === null) return null;
  if (sale !== null && sale > 0 && sale < price && (!saleEnds || saleEnds >= today)) return sale;
  return price;
}

export type Below = { sale: boolean; size: string; price: number; cost: number };

/**
 * Where an item sells for less than it costs, as typed: its price and its sale price, and each
 * size's (price plus its difference). A size with no cost of its own costs what the item costs.
 * This is the API's `costs.warnings` worked out while the owner is still typing; after a save the
 * API's own sentence is the one shown.
 */
export function belowCost(args: {
  price: number | null; sale: number | null; itemCost: number | null;
  sizes: { name: string; delta: number; cost: number | null }[];
}): Below[] {
  const out: Below[] = [];
  const rows = [{ name: "", delta: 0, cost: null as number | null }, ...args.sizes];
  for (const row of rows) {
    const cost = row.cost ?? args.itemCost;
    if (cost === null) continue;
    for (const [sale, base] of [[false, args.price], [true, args.sale]] as const) {
      if (base === null || base <= 0) continue;
      const price = base + row.delta;
      if (price < cost) out.push({ sale, size: row.name, price, cost });
    }
  }
  return out;
}
