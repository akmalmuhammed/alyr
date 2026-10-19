// What a discounted order came to, in the Orders list (ALY-150): the goods, each discount with
// the rule in words, and the total. Drawn only for an order that had a discount; the order's
// figures are whole dirhams from the API and are written by the customer pages' own helper, so
// Arabic reads «20 ر.ق». A discount whose order was cancelled is shown struck through as returned.

import { formatPrice } from "../_customer/price";
import type { Lang } from "./catalogCopy";
import { PRICING } from "./pricingCopy";

type Discount = {
  kind: "coupon" | "auto"; code: string; name: string; name_ar: string; text: string; text_ar: string;
  amount: number; returned: boolean;
};
type Order = { total: number; subtotal?: number; discount_total?: number; discounts?: Discount[] };

export function OrderSum({ order, lang }: { order: Order; lang: Lang }) {
  const p = PRICING[lang].order;
  const ar = lang === "ar";
  const rows = order.discounts ?? [];
  return (
    <div className="pr-sum" role="group" aria-label={p.summary}>
      <div className="pr-sumrow">
        <span>{p.items}</span>
        <span className="num"><bdi>{formatPrice(order.subtotal ?? order.total + (order.discount_total ?? 0), lang)}</bdi></span>
      </div>
      {rows.map((d, i) => {
        const label = d.kind === "coupon" ? d.code : (ar ? d.name_ar || d.name : d.name || d.name_ar) || p.discount;
        const named = d.kind === "coupon" ? (ar ? d.name_ar || d.name : d.name || d.name_ar) : "";
        return (
          <div key={i} className={`pr-sumrow off ${d.returned ? "back" : ""}`}>
            <span>
              <bdi dir="auto">{label}{named ? ` · ${named}` : ""}</bdi>
              <small dir="auto">{ar ? d.text_ar || d.text : d.text}{d.returned ? ` · ${p.returned}` : ""}</small>
            </span>
            <span className="num"><bdi>{p.off(formatPrice(d.amount, lang))}</bdi></span>
          </div>
        );
      })}
      <div className="pr-sumrow total">
        <span>{p.total}</span>
        <span className="num"><bdi>{formatPrice(order.total, lang)}</bdi></span>
      </div>
    </div>
  );
}
