// The cart's arithmetic and rules, with no screen in it (ALY-112), so each can be tested.
//
// A line is one item with one size and one set of extras. The price on a line is the price
// the customer was last shown for one; the checkout compares it with the shop's price and a
// change is shown before payment (`ReviewSheet`).

import {
  addQty, ceilToStep, cmpQty, isMeasure, isMultiple, lineTotal, MAX_QUANTITY as QTY_MAX, maxQty,
  milli, minQty, subQty,
} from "../qty.ts";
import type { Item } from "./types";

export type Line = {
  key: string;
  itemId: string;
  variantId: string | null;
  optionIds: string[];
  qty: number;
  /** The price of one, size and extras included, as the customer was last shown it. */
  unit: number;
  name: string;
  name_ar: string;
  variant: string;
  variant_ar: string;
  extras: { name: string; name_ar: string }[];
  /** The 320 px photo, if there is one, for the review. */
  src: string;
  /** The item's code, for the WhatsApp message (a line saved before codes existed has none). */
  code?: number | null;
  /** The item's unit, so a measure's quantity says it ("0.5 kg"); a line saved before has none. */
  unitKey?: string;
};

export const MAX_QUANTITY = QTY_MAX;

// The pieces the rules read; an `Item` has them all, and the tests pass a few.
type Rules = Pick<Item, "min_order" | "pack_size" | "unit" | "left"> & Partial<Item>;

/** How far one tap on + moves: the item's step. For a counted unit that is a whole pack when the
 *  item is sold by the pack (pieces or hours in lots); a box or a pack is already the pack, so
 *  those count by one. For something sold by weight or volume it is the step the owner chose
 *  (0.25 kg). The API sends it as `quantity.step`; a page without it reads the older fields. */
export function step(item: Pick<Item, "pack_size" | "unit"> & Partial<Item>): number {
  if (item.quantity) return item.quantity.step;
  const pack = item.pack_size ?? 0;
  return pack > 1 && item.unit !== "box" && item.unit !== "pack" ? pack : 1;
}

/** The least that can be ordered: the smallest order, rounded up to a whole step. */
export function smallest(item: Pick<Item, "min_order" | "pack_size" | "unit"> & Partial<Item>): number {
  const by = step(item);
  return ceilToStep(maxQty(item.min_order, by), by);
}

/** The most that can be asked for: what is left when that is small enough to be told. */
export function most(item: Pick<Item, "left" | "variants">, variantId?: string | null): number {
  const variant = variantId ? item.variants?.find((v) => v.id === variantId) : undefined;
  const left = variant?.left ?? item.left;
  return left === null || left === undefined ? MAX_QUANTITY : minQty(left, MAX_QUANTITY);
}

/** The quantity after pressing + (dir 1) or - (dir -1). Below the smallest it is removed (0);
 *  at the most there is no further. */
export function next(item: Rules, qty: number, dir: 1 | -1, variantId?: string | null): number {
  const cap = most({ left: item.left, variants: item.variants ?? [] }, variantId);
  if (dir === 1) {
    const to = qty === 0 ? smallest(item) : addQty(qty, step(item));
    return cmpQty(to, cap) <= 0 ? to : qty;
  }
  const to = subQty(qty, step(item));
  return cmpQty(to, smallest(item)) < 0 ? 0 : to;
}

export type Problem = {
  code: "bad" | "not_whole" | "below_minimum" | "off_step" | "not_enough";
  minimum?: number;
  step?: number;
  suggest?: number;
  left?: number;
};

/** Why a typed amount cannot be ordered, or `null` when it can. The same rules the API applies
 *  (`qty.check`), so a customer is told before the checkout is. */
export function problem(item: Rules, q: number, variantId?: string | null): Problem | null {
  if (!(q > 0) || cmpQty(q, MAX_QUANTITY) > 0) return { code: "bad" };
  const by = step(item);
  if (!isMeasure(item.unit) && milli(q) % 1000 !== 0) return { code: "not_whole" };
  if (cmpQty(q, item.min_order) < 0) return { code: "below_minimum", minimum: item.min_order };
  if (item.unit !== "box" && item.unit !== "pack" && !isMultiple(q, by)) {
    return { code: "off_step", step: by, suggest: ceilToStep(q, by) };
  }
  const cap = most({ left: item.left, variants: item.variants ?? [] }, variantId);
  if (cmpQty(q, cap) > 0) return { code: "not_enough", left: cap };
  return null;
}

/** The same item, size and extras are one line, whatever order the extras were picked in. */
export function keyOf(itemId: string, variantId: string | null, optionIds: string[]): string {
  return `${itemId}|${variantId ?? ""}|${[...optionIds].sort().join(",")}`;
}

/** The order's total in dirhams: each line is its price times its quantity, rounded once. */
export function total(lines: Pick<Line, "qty" | "unit">[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l.unit, l.qty), 0);
}

/** How many things the bar says are in the order: whole quantities add up as they always did; a
 *  quantity of 0.5 kg is one thing, not half. */
export function count(lines: Pick<Line, "qty">[]): number {
  return lines.reduce((sum, l) => sum + (milli(l.qty) % 1000 === 0 ? l.qty : 1), 0);
}

/** The price of one: the size's price (the item's, if it has no sizes) plus each extra. */
export function unitPrice(item: Pick<Item, "price" | "variants" | "option_groups">, variantId: string | null, optionIds: string[]): number {
  const only = item.variants.length === 1 ? item.variants[0] : undefined;
  const variant = item.variants.find((v) => v.id === variantId) ?? only;
  const base = variant ? variant.price : item.price;
  const extras = item.option_groups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .reduce((sum, o) => sum + o.price_delta, 0);
  return base + extras;
}

/** What is still to choose before this can go in the order: a size, a required group, or
 *  more extras picked than a group allows. */
export function missing(
  item: Pick<Item, "variants" | "option_groups">, variantId: string | null, optionIds: string[],
): { variant: boolean; groups: string[]; tooMany: string[] } {
  const needsSize = item.variants.length > 1 && !item.variants.some((v) => v.id === variantId);
  const groups: string[] = [];
  const tooMany: string[] = [];
  for (const group of item.option_groups) {
    const picked = group.options.filter((o) => optionIds.includes(o.id)).length;
    if (group.required && picked === 0) groups.push(group.id);
    if (picked > group.max_choices) tooMany.push(group.id);
  }
  return { variant: needsSize, groups, tooMany };
}

/** The item's name with its size and extras, as the customer reads it, in one language. */
export function lineName(line: Pick<Line, "name" | "name_ar" | "variant" | "variant_ar" | "extras">, lang: "en" | "ar"): string {
  const ar = lang === "ar";
  const parts = [
    ar ? line.variant_ar || line.variant : line.variant,
    ...line.extras.map((e) => (ar ? e.name_ar || e.name : e.name)),
  ].filter(Boolean);
  const name = ar ? line.name_ar || line.name : line.name;
  return parts.length ? `${name} (${parts.join(ar ? "، " : ", ")})` : name;
}
