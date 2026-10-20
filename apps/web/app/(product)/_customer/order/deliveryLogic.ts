// The customer's pickup-or-delivery choice (ALY-150 part 2): what they picked, whether it is
// enough to pay, and what to tell them about free delivery. No screen and no value imports, so
// each rule can be tested (`delivery.test.mjs`). Amounts are whole dirhams, integers only.

import type { DeliveryOptions, FulfilmentBody, Zone } from "./types";

/** The one zone with no id (the shop's flat fee) is chosen by this word in the page's state. */
export const FLAT = "flat";
export const MIN_ADDRESS = 3;
// The API keeps 300 characters of an address and 200 of a note; the box stops there so nothing is cut quietly.
export const MAX_ADDRESS = 300;
export const MAX_NOTE = 200;

export type Mode = "pickup" | "delivery";
/** What the customer has picked so far. `mode` and `zone` are empty until they choose. */
export type Choice = { mode: Mode | ""; zone: string; address: string; note: string };
export const EMPTY: Choice = { mode: "", zone: "", address: "", note: "" };

/** Why the choice is not enough to pay yet, or null when it is. */
export type Need = "mode" | "zone" | "address" | null;

export const keyOf = (zone: Zone): string => zone.id ?? FLAT;
export const storageKey = (slug: string): string => `alyr-fulfil:${slug}`;

/** What was kept in `sessionStorage` for this shop; anything unreadable is nothing. */
export function readSaved(raw: string | null): Choice {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<Choice> | null;
    if (!data || typeof data !== "object") return EMPTY;
    return {
      mode: data.mode === "pickup" || data.mode === "delivery" ? data.mode : "",
      zone: typeof data.zone === "string" ? data.zone.slice(0, 64) : "",
      address: typeof data.address === "string" ? data.address.slice(0, MAX_ADDRESS) : "",
      note: typeof data.note === "string" ? data.note.slice(0, MAX_NOTE) : "",
    };
  } catch {
    return EMPTY;
  }
}

/**
 * The choice as the shop's options allow it. A mode the shop does not offer is dropped; when only
 * one way is offered it is the way; a zone that is no longer offered is dropped; when there is
 * only one place to deliver to it is the place. Nothing is guessed between two real choices.
 */
export function settle(choice: Choice, options: DeliveryOptions): Choice {
  let mode: Choice["mode"] = choice.mode;
  if (mode === "pickup" && !options.pickup) mode = "";
  if (mode === "delivery" && !options.delivery) mode = "";
  if (!mode) {
    if (options.pickup && !options.delivery) mode = "pickup";
    else if (options.delivery && !options.pickup) mode = "delivery";
  }
  let zone = choice.zone;
  if (mode === "delivery") {
    if (!options.zones.some((z) => keyOf(z) === zone)) zone = "";
    if (!zone && options.zones.length === 1) zone = keyOf(options.zones[0]);
  } else {
    zone = "";
  }
  return { ...choice, mode, zone };
}

/** What is still missing before the order can be paid for (the address is the order's own need). */
export function needOf(choice: Choice): Need {
  if (!choice.mode) return "mode";
  if (choice.mode === "delivery") {
    if (!choice.zone) return "zone";
    if (choice.address.replace(/\s+/g, " ").trim().length < MIN_ADDRESS) return "address";
  }
  return null;
}

/** The cart check asks about the mode and the area only: typing an address must not ask again. */
export function checkBody(choice: Choice): Partial<FulfilmentBody> | undefined {
  if (!choice.mode) return undefined;
  if (choice.mode === "pickup") return { mode: "pickup" };
  if (!choice.zone) return undefined;
  return { mode: "delivery", zone_id: choice.zone === FLAT ? null : choice.zone };
}

/** The order carries the whole choice. */
export function orderBody(choice: Choice): FulfilmentBody | undefined {
  if (!choice.mode) return undefined;
  if (choice.mode === "pickup") return { mode: "pickup", zone_id: null, address: "", note: "" };
  if (!choice.zone) return undefined;
  return {
    mode: "delivery", zone_id: choice.zone === FLAT ? null : choice.zone,
    address: choice.address.replace(/\s+/g, " ").trim(), note: choice.note.replace(/\s+/g, " ").trim(),
  };
}

export function zoneOf(options: DeliveryOptions, choice: Choice): Zone | undefined {
  return choice.mode === "delivery" ? options.zones.find((z) => keyOf(z) === choice.zone) : undefined;
}

/**
 * How much more of the goods (after discounts) gets the fee waived, or null when there is
 * nothing to say: the zone has no free-over amount, it has no fee, or the goods are already there.
 */
export function moreForFree(goods: number | undefined, zone: Pick<Zone, "fee" | "free_over"> | undefined): number | null {
  if (!zone || goods === undefined || zone.free_over === null || zone.fee <= 0) return null;
  if (!Number.isInteger(goods) || !Number.isInteger(zone.free_over)) return null;
  return goods < zone.free_over ? zone.free_over - goods : null;
}
