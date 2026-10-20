"use client";

// Margin and value, in the lists (ALY-150 part 3, specs/014-pricing-pack): a quiet pill on each
// item that has a cost, the value of the stock at cost on the Stock tab, the estimated margin
// of an order in the Orders list, and the line about the cost column in the import sheet.
//
// THE PROMISE: these are drawn only for owners and admins of a shop that keeps costs. Every hook
// here is called with `on` (the screen says whether the person may see money and the feature is
// on); with `on` false it asks for nothing and returns nothing, so an agent's browser never
// requests a cost, a margin or a valuation, and a shop that does not keep costs sees nothing new.
// The routes refuse anyone else anyway. Amounts are dirhams, written by the customer pages' own
// helper («QAR 24», «24 ر.ق»); the percentages are the API's strings.

import { useEffect, useState } from "react";
import { api, type ItemMargin, type OrderMargin as OrderMarginData, type Setup, type Valuation } from "./catalogApi";
import type { Lang } from "./catalogCopy";
import { COST } from "./costCopy";
import { pctShown } from "./costMath";
import { formatPrice } from "../_customer/price";
import "./cost.css";

const money = (dirhams: number, lang: Lang) => (dirhams < 0 ? `−${formatPrice(-dirhams, lang)}` : formatPrice(dirhams, lang));

/**
 * The margin of each item that has a cost, by item, fetched with the list. `version` is whatever
 * changes when the list is loaded again, so a new price or cost is picked up with it.
 */
export function useItemMargins(on: boolean, version: unknown): Record<string, ItemMargin> | null {
  const [found, setFound] = useState<Record<string, ItemMargin> | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    api<{ margins: Record<string, ItemMargin> }>("/api/items/margins").then((r) => { if (live) setFound(r.margins); }).catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [on, version]);
  return on ? found : null;
}

/** The estimated margin of each order that kept a cost, by order, fetched with the orders. */
export function useOrderMargins(manager: boolean, version: unknown): Record<string, OrderMarginData> | null {
  // Whether the shop keeps costs is asked once, from the Catalog's own setup; only a manager asks.
  const [keeps, setKeeps] = useState(false);
  const [found, setFound] = useState<Record<string, OrderMarginData> | null>(null);
  useEffect(() => {
    if (!manager) return;
    let live = true;
    api<Setup>("/api/items/setup").then((s) => { if (live) setKeeps(s.features.cost_margin === true); }).catch(() => { if (live) setKeeps(false); });
    return () => { live = false; };
  }, [manager]);
  const on = manager && keeps;
  useEffect(() => {
    if (!on) return;
    let live = true;
    api<{ margins: Record<string, OrderMarginData> }>("/api/orders/margins").then((r) => { if (live) setFound(r.margins); }).catch(() => { if (live) setFound(null); });
    return () => { live = false; };
  }, [on, version]);
  return on ? found : null;
}

/** "Margin 37.5%" on an item, or "Below cost" in the warning tone; nothing when no cost is kept. */
export function MarginPill({ lang, margin }: { lang: Lang; margin: ItemMargin | undefined }) {
  const t = COST[lang];
  if (!margin) return null;
  return (
    <span className="ct-pills">
      <span className={`sh-pill ct-pill cs-pill ${margin.below_cost ? "wait" : ""}`}>
        {margin.below_cost ? t.pillBelow : t.pill(pctShown(margin.pct))}
      </span>
    </span>
  );
}

/** "Stock value: QAR 2,506.96 at cost", with how many items are left out for having no cost. */
export function StockValue({ lang, on, version }: { lang: Lang; on: boolean; version: unknown }) {
  const t = COST[lang];
  const [value, setValue] = useState<Valuation | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    api<Valuation>("/api/items/valuation").then((r) => { if (live) setValue(r); }).catch(() => { if (live) setValue(null); });
    return () => { live = false; };
  }, [on, version]);
  if (!on || !value || (value.items === 0 && value.missing === 0)) return null;
  return (
    <section className="cs-value" aria-label={t.stockRegion}>
      <b className="num">{value.items > 0 ? t.stockValue(money(value.value, lang)) : t.stockValueNone}</b>
      {value.missing > 0 && <small>{t.stockMissing(value.missing)}. {t.stockMissingNote}</small>}
    </section>
  );
}

/** "Estimated margin QAR 45 (55%)" under an order, and a word when some of its items had no cost. */
export function OrderMargin({ lang, margin }: { lang: Lang; margin: OrderMarginData | undefined }) {
  const t = COST[lang];
  if (!margin) return null;
  const negative = margin.amount < 0;
  return (
    <div className={`cs-order ${negative ? "below" : ""}`} role="group" aria-label={t.orderRegion}>
      <span className="num">{t.order(money(margin.amount, lang), pctShown(margin.pct))}</span>
      {negative && <small>{t.orderBelow}</small>}
      {!margin.complete && <small>{t.orderPartial}</small>}
    </div>
  );
}

/** One plain line in the import sheet about the optional cost column. */
export function CostImportNote({ lang }: { lang: Lang }) {
  return <p className="ct-hint cs-import">{COST[lang].importColumn}</p>;
}
