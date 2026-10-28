"use client";

// The cost price on the item sheet (ALY-150 part 3, specs/014-pricing-pack): what one costs the
// owner, beside the price; what each size costs when it differs; the margin that leaves, worked
// out in the browser as the owner types; a calm note where a price is under the cost; and the
// history of the cost.
//
// THE PROMISE: cost and margin are for owners and admins, and only while the shop keeps costs.
// `CatalogEdit` turns this on with `enabled` (`access.can_manage` and `features.cost_margin`);
// when it is off nothing here is drawn and `useItemCost` makes no request at all. The API
// refuses anyone else anyway (403 for an agent, 422 `feature_off` while the feature is off).
//
// The cost is held apart from the item's own form: the item is saved as it always was, and then
// the cost is sent to its own route, only if a cost box changed. Money is typed in riyals and
// becomes whole dirhams in `costInput.ts`; the margin is `costMath.ts`: no float anywhere.

import { useCallback, useEffect, useState } from "react";
import { api, nameOf, stamp, whoIs, type CostBody, type CostSaved, type CostView } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { COST } from "./costCopy";
import { deltaOf, parseCost, priceOf } from "./costInput";
import { belowCost, marginOf, pctShown, todaysPrice, type Below } from "./costMath";
import { dirhamsToRiyals } from "./pricingMoney";
import { Field, Fold, Icon } from "./CatalogUi";
import { formatPrice } from "../_customer/price";
import "./cost.css";

/** The parts of the item's form the cost needs to know about (the price, a sale, the sizes). */
export type CostForm = {
  price: string; sale: string; saleEnds: string;
  variants: { id?: string; name: string; name_ar: string; delta: string; active: boolean }[];
};

export type ItemCost = ReturnType<typeof useItemCost>;

/**
 * The item's cost as the sheet holds it. With `enabled` false nothing is asked and nothing is
 * kept. Only what the owner types is held (`typed`); what is shown is that, or what the API said.
 */
export function useItemCost({ itemId, enabled }: { itemId: string | null; enabled: boolean }) {
  const [view, setView] = useState<CostView | null>(null);
  const [failed, setFailed] = useState(false);
  const [typedCost, setTypedCost] = useState<string | null>(null);
  const [typedSizes, setTypedSizes] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!enabled || !itemId) return;
    let live = true;
    api<CostView>(`/api/items/${itemId}/cost`).then((r) => { if (live) setView(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [enabled, itemId]);

  const costText = typedCost ?? dirhamsToRiyals(view?.cost);
  const sizeText = (id: string) => typedSizes[id] ?? dirhamsToRiyals(view?.variants.find((v) => v.id === id)?.cost);

  /** What changed, as the route takes it, and what is wrong with a box. Nothing changed gives a null body. */
  const patch = useCallback((): { body: CostBody | null; errors: { cost?: true; sizes: Record<string, true> } } => {
    const errors: { cost?: true; sizes: Record<string, true> } = { sizes: {} };
    const body: CostBody = {};
    if (typedCost !== null) {
      const parsed = parseCost(typedCost);
      if (!parsed.ok) errors.cost = true;
      else if (parsed.value !== (view?.cost ?? null)) body.cost = parsed.value;
    }
    const sizes: Record<string, number | null> = {};
    for (const [id, text] of Object.entries(typedSizes)) {
      const parsed = parseCost(text);
      if (!parsed.ok) errors.sizes[id] = true;
      else if (parsed.value !== (view?.variants.find((v) => v.id === id)?.cost ?? null)) sizes[id] = parsed.value;
    }
    if (Object.keys(sizes).length) body.variants = sizes;
    return { body: "cost" in body || body.variants ? body : null, errors };
  }, [typedCost, typedSizes, view]);

  const found = patch();
  const hasErrors = Boolean(found.errors.cost) || Object.keys(found.errors.sizes).length > 0;
  return {
    enabled, view, failed,
    loading: enabled && Boolean(itemId) && !view && !failed,
    costText, sizeText,
    setCost: setTypedCost,
    setSize: (id: string, text: string) => setTypedSizes((all) => ({ ...all, [id]: text })),
    /** Something about the cost was changed (or is wrong): the sheet has unsaved work. */
    dirty: found.body !== null || hasErrors,
    /** The boxes that cannot be read, shown only once the owner has tried to save. */
    errors: attempted ? found.errors : { sizes: {} as Record<string, true> },
    /** Asked before the item is saved: false when a cost box holds something that is not an amount. */
    check(): boolean { setAttempted(true); return !hasErrors; },
    /** Sends what changed to the cost route; null when nothing changed. Throws what the route refuses. */
    async save(id: string): Promise<CostSaved | null> {
      const { body } = patch();
      return body ? api<CostSaved>(`/api/items/${id}/cost`, "PUT", body as Record<string, unknown>) : null;
    },
  };
}

const money = (dirhams: number, lang: Lang) => (dirhams < 0 ? `−${formatPrice(-dirhams, lang)}` : formatPrice(dirhams, lang));

/** The numbers the sheet needs from the form: today's price and the sizes that sell. */
function live(form: CostForm, cost: ItemCost) {
  const normal = priceOf(form.price);
  const sale = priceOf(form.sale);
  const today = todaysPrice(normal, sale, form.saleEnds);
  const itemCost = parseCost(cost.costText);
  return {
    today, saleOn: normal !== null && today !== null && today < normal, itemCost,
    sizes: form.variants.filter((v) => v.active).map((v) => {
      const own = v.id ? parseCost(cost.sizeText(v.id)) : { value: null, ok: true };
      return { id: v.id, name: v.name, name_ar: v.name_ar, delta: deltaOf(v.delta), own };
    }),
  };
}

/** "Margin QAR 37.50 · 37.5%", in the warning tone with the words "Below cost" when it is negative. */
function MarginLine({ lang, price, cost, sale }: { lang: Lang; price: number | null; cost: number | null; sale: boolean }) {
  const t = COST[lang];
  const m = marginOf(price, cost);
  if (!m) return null;
  const negative = m.amount < 0;
  return (
    <p className={`cs-margin ${negative ? "below" : ""}`} role="status">
      <b className="num">{t.margin(money(m.amount, lang), pctShown(m.pct))}</b>
      {(negative || sale) && <small>{negative ? t.marginBelow : t.marginSale}</small>}
    </p>
  );
}

/** A calm note, not an alert: a price under the cost is the owner's to decide, and saving still works. */
export function BelowNote({ lang, lines }: { lang: Lang; lines: string[] }) {
  const t = COST[lang];
  if (lines.length === 0) return null;
  return (
    <div className="cs-warn" role="status" aria-label={t.warnLabel}>
      <Icon name="warn" />
      <div>{lines.map((line, i) => <p key={i} dir="auto">{line}</p>)}</div>
    </div>
  );
}

/** The cost box under the price, its margin, and the note where a price is under the cost. */
export function CostPrice({ lang, form, cost }: { lang: Lang; form: CostForm; cost: ItemCost }) {
  const t = COST[lang];
  const now = live(form, cost);
  const typed = now.itemCost;
  const below: Below[] = typed.ok || now.sizes.length
    ? belowCost({
      price: priceOf(form.price), sale: priceOf(form.sale), itemCost: typed.ok ? typed.value : null,
      sizes: now.sizes.filter((s) => s.delta !== null).map((s) => ({
        name: nameOf({ name: s.name, name_ar: s.name_ar }, lang), delta: s.delta ?? 0, cost: s.own.ok ? s.own.value : null,
      })),
    })
    : [];
  const lines = below.map((b) => t.below(b.sale, b.size, money(b.price, lang), money(b.cost, lang)));
  return (
    <div className="cs-box">
      <Field label={t.cost} hint={t.costHint} error={cost.errors.cost ? t.badCost : undefined}>
        <input value={cost.costText} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => cost.setCost(e.target.value)} />
      </Field>
      {cost.loading && <p className="ct-hint" role="status">{t.costLoading}</p>}
      {cost.failed && <p className="ct-hint" role="status">{t.costFailed}</p>}
      <MarginLine lang={lang} price={now.today} cost={typed.ok ? typed.value : null} sale={now.saleOn} />
      <BelowNote lang={lang} lines={lines} />
    </div>
  );
}

/** What one size costs, when it differs from the item; its margin follows from its own price. */
export function CostSize({ lang, form, cost, index }: { lang: Lang; form: CostForm; cost: ItemCost; index: number }) {
  const t = COST[lang];
  const v = form.variants[index];
  if (!v) return null;
  if (!v.id) return <p className="ct-hint">{t.sizeSaveFirst}</p>;
  const now = live(form, cost);
  const own = parseCost(cost.sizeText(v.id));
  const delta = deltaOf(v.delta);
  const effective = own.ok ? (own.value ?? (now.itemCost.ok ? now.itemCost.value : null)) : null;
  const price = now.today !== null && delta !== null ? now.today + delta : null;
  return (
    <div className="cs-box">
      <Field label={t.sizeCost} hint={t.sizeCostHint} error={cost.errors.sizes[v.id] ? t.badCost : undefined}>
        <input value={cost.sizeText(v.id)} inputMode="decimal" dir="ltr" autoComplete="off" onChange={(e) => cost.setSize(v.id as string, e.target.value)} />
      </Field>
      <MarginLine lang={lang} price={price} cost={effective} sale={now.saleOn} />
    </div>
  );
}

/** Who set which cost, and when. Only for an item that exists and a cost the API has told. */
export function CostHistory({ lang, cost }: { lang: Lang; cost: ItemCost }) {
  const t = COST[lang];
  const rows = cost.view?.history ?? [];
  return (
    <Fold title={t.historyTitle} summary={rows.length ? String(rows.length) : undefined}>
      {cost.loading && <p className="ct-hint" role="status">{t.costLoading}</p>}
      {cost.failed && <p className="ct-hint">{t.costFailed}</p>}
      {cost.view && rows.length === 0 && <p className="ct-hint">{t.historyNone}</p>}
      {rows.length > 0 && (
        <ul className="ct-log">
          {rows.map((r, i) => (
            <li key={i}>
              <b className="num" dir="ltr">{r.cost === null ? t.historyRemoved : money(r.cost, lang)}</b>
              <span><bdi dir="auto">{r.variant || t.historyItem}</bdi> · {t.historyBy(whoIs(r.by, COPY[lang]))}{r.reason ? <> · <bdi dir="auto">{r.reason}</bdi></> : null}</span>
              <time className="num" dateTime={r.at} dir="ltr">{stamp(r.at, lang)}</time>
            </li>
          ))}
        </ul>
      )}
    </Fold>
  );
}
