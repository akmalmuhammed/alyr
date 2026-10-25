// How an order reaches the customer, as the workspace's Orders list and the tracking page read
// it (`fulfilment` on `GET /api/orders` and `GET /api/track/...`; ALY-150 part 2,
// specs/014-pricing-pack). The key exists only on orders made while the shop's "Delivery and
// pickup" was on, so an order without it is drawn exactly as before. No imports, so each helper
// can be tested (`fulfil.test.mjs`).

export type Lang = "en" | "ar";

/** The order's own copy of the choice: what the customer chose and what it cost then (dirhams). */
export type Fulfilment = {
  mode: "pickup" | "delivery";
  fee: number;
  fee_text?: string;
  zone?: string;
  zone_ar?: string;
  address?: string;
  note?: string;
  /** The day it is to be delivered, "2026-10-21". */
  deliver_on?: string | null;
};

/** "Wed 21 Oct", "الأربعاء 21 أكتوبر": a calendar day, in Western digits, whatever the device's zone. */
export function dayShort(iso: string, lang: Lang): string {
  const day = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(day);
}

// The shop's one flat fee is named "Delivery" when it is the whole delivery (and "Other areas"
// beside real zones). "Delivery to Delivery" reads wrong, so that name is no area at all.
const WHOLE_DELIVERY = new Set(["delivery", "التوصيل"]);

/** The area as the order kept it, in the reader's language; empty when it is just "Delivery". */
export function zoneName(f: Pick<Fulfilment, "zone" | "zone_ar">, lang: Lang): string {
  const name = ((lang === "ar" ? f.zone_ar || f.zone : f.zone || f.zone_ar) ?? "").trim();
  return WHOLE_DELIVERY.has(name.toLowerCase()) ? "" : name;
}

/** What an order's total is made of when the lines are not enough to see it: the goods, before
 *  any discount, are the total less the fee plus what came off. */
export function goodsBeforeDiscount(order: { total: number; subtotal?: number; discount_total?: number; fulfilment?: { fee?: number } | null }): number {
  return order.subtotal ?? order.total - (order.fulfilment?.fee ?? 0) + (order.discount_total ?? 0);
}
