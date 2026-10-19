// How an order reaches its customer, in the Orders list (ALY-150 part 2): a Pickup or Delivery
// pill, and for a delivery the area, address, note and day. Drawn only for an order made while
// the shop's "Delivery and pickup" was on (the order has a `fulfilment`); every other order reads
// exactly as before. The fee is a line of the order's sum (`OrderSum`). Above the list, a filter
// of All / Pickup / Delivery appears only when at least one order has a choice on it.

import { dayShort, zoneName, type Fulfilment } from "../_customer/fulfil";
import type { Lang } from "./catalogCopy";
import { DELIVERY } from "./deliveryCopy";
import "./delivery.css";

export type FulfilFilter = "all" | "pickup" | "delivery";

/** The pill that goes under the customer's name. */
export function FulfilPill({ fulfilment, lang }: { fulfilment: Fulfilment; lang: Lang }) {
  const d = DELIVERY[lang].order;
  return <span className="pill none">{fulfilment.mode === "delivery" ? d.delivery : d.pickup}</span>;
}

/** Where it goes, in the Items cell: the area, the address, the day, and the customer's note. */
export function FulfilDetails({ fulfilment, lang }: { fulfilment: Fulfilment; lang: Lang }) {
  const d = DELIVERY[lang].order;
  if (fulfilment.mode !== "delivery") return null;
  const zone = zoneName(fulfilment, lang);
  return (
    <div className="dl-how">
      {zone && <span className="dl-where" dir="auto">{d.to(zone)}</span>}
      {/* What the customer typed may be in the other script; it sits inside the line, which keeps the screen's direction. */}
      {fulfilment.address && <span><bdi dir="auto">{fulfilment.address}</bdi></span>}
      {fulfilment.deliver_on && <span>{d.day(dayShort(fulfilment.deliver_on, lang))}</span>}
      {fulfilment.note && <span>{d.note(`⁨${fulfilment.note}⁩`)}</span>}
    </div>
  );
}

/** Whether an order is shown under the chosen filter. An order with no choice on it shows only under All. */
export function matchesFilter(order: { fulfilment?: Fulfilment | null }, filter: FulfilFilter): boolean {
  if (filter === "all") return true;
  return order.fulfilment?.mode === filter;
}

/** The chips above the list: only when at least one order has a choice on it. */
export function FulfilFilters({ value, onChange, lang, show }: {
  value: FulfilFilter; onChange: (next: FulfilFilter) => void; lang: Lang; show: boolean;
}) {
  const d = DELIVERY[lang].order;
  if (!show) return null;
  const chips: [FulfilFilter, string][] = [["all", d.all], ["pickup", d.pickups], ["delivery", d.deliveries]];
  return (
    <fieldset className="dl-filter">
      <legend>{d.filterLabel}</legend>
      {chips.map(([key, label]) => (
        <label key={key} className="dl-chip">
          <input type="radio" name="dl-filter" checked={value === key} onChange={() => onChange(key)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
