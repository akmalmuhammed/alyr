"use client";

// The compact table for a customer in a price group, or a shop that wants it for everyone
// (ALY-112): code, name with its unit or pack, price and a quantity stepper, one line per
// item or per size. On a phone each row is two short lines inside the screen's width, so
// nothing needs to scroll sideways; on a laptop it is a table with a header. The table
// semantics are kept for screen readers either way.

import { memo } from "react";
import { Glyph } from "../Frame";
import type { Lang } from "../price";
import { most, next } from "./cart";
import { cmpQty, fmtQty, fmtQtyUnit, unitFor, unitShort } from "../qty";
import { say, T } from "./copy";
import type { Item, Variant } from "./types";
import { Price, Stepper } from "./ui";

export type Row = { item: Item; variant: Variant | null; choose: boolean };

/** One row per size, one for an item with none; an item with a required choice is one row
 *  that opens the item. */
export function rowsOf(items: Item[]): Row[] {
  return items.flatMap((item): Row[] => {
    if (item.option_groups.some((g) => g.required)) return [{ item, variant: null, choose: true }];
    if (item.variants.length > 1) return item.variants.map((variant) => ({ item, variant, choose: false }));
    return [{ item, variant: null, choose: false }];
  });
}

type Props = {
  row: Row;
  lang: Lang;
  qty: number;
  canOrder: boolean;
  /** The shop's "show the item code" feature. */
  showSku?: boolean;
  onOpen: (item: Item) => void;
  onSet: (item: Item, variantId: string | null, qty: number) => void;
  onLimit: (item: Item) => void;
};

function Line({ row, lang, qty, canOrder, showSku = true, onOpen, onSet, onLimit }: Props) {
  const t = T[lang];
  const { item, variant } = row;
  const variantId = variant ? variant.id : item.variants.length === 1 ? item.variants[0].id : null;
  const name = say(lang, item.name, item.name_ar);
  const part = variant ? say(lang, variant.name, variant.name_ar) : "";
  const price = variant ? variant.price : item.price;
  const listPrice = variant ? variant.list_price : item.list_price;
  const sold = item.sold_out || (variant?.sold_out ?? false);
  const orderable = item.orderable && !(variant?.sold_out ?? false);
  const code = item.code === null ? "" : String(item.code);
  const meta = [
    (variant?.sku || item.sku) ? `${t.sku} ${variant?.sku || item.sku}` : "",
    item.unit && item.unit !== "piece" ? t.units[item.unit] ?? item.unit : "",
    item.quantity?.show_unit
      ? t.amountHint(fmtQtyUnit(item.quantity.step, unitFor(item), lang), fmtQtyUnit(item.min_order, unitFor(item), lang))
      : [
          item.pack_size && item.pack_size > 1 ? t.pack(fmtQty(item.pack_size)) : "",
          item.min_order > 1 ? t.minimum(fmtQty(item.min_order)) : "",
        ].filter(Boolean).join(" · "),
  ].filter(Boolean).join(" · ");
  const left = variant ? variant.left : item.left;
  const label = part ? `${name}, ${part}` : name;
  const atMax = cmpQty(qty, most(item, variantId)) >= 0;
  return (
    <div role="row" className={`ox-wrow ${orderable ? "" : "off"}`}>
      {showSku && <span role="cell" className="ox-wsku" dir="ltr">{code}</span>}
      <span role="cell" className="ox-wname">
        <button type="button" className="ox-wopen" onClick={() => onOpen(item)} dir="auto">
          {name}{part ? <> <span className="ox-wpart">{part}</span></> : null}
        </button>
        {meta && <small dir="auto">{meta}</small>}
        {sold ? <span className="ox-pill off">{t.soldOut}</span> : left !== null && left > 0 ? <span className="ox-pill few">{item.daily ? t.onlyLeftToday(fmtQtyUnit(left, unitFor(item), lang)) : t.onlyLeft(fmtQtyUnit(left, unitFor(item), lang))}</span> : null}
        {!sold && item.note && <small className="ox-wnote" dir="auto">{say(lang, item.note.en, item.note.ar)}</small>}
      </span>
      <span role="cell" className="ox-wprice">
        <Price value={price} lang={lang} />
        {item.quantity?.show_unit && <small className="ox-per">{t.perUnit(unitShort(unitFor(item), lang))}</small>}
        {listPrice !== null && <s className="ox-was"><Price value={listPrice} lang={lang} /></s>}
      </span>
      <span role="cell" className="ox-wqty">
        {orderable && canOrder && (
          row.choose ? (
            <button type="button" className="ox-choose" onClick={() => onOpen(item)} aria-label={t.chooseNamed(name)}>{t.choose}</button>
          ) : qty > 0 ? (
            <Stepper qty={qty} text={fmtQtyUnit(qty, unitFor(item), lang)} atMax={atMax}
              labels={{ minus: `${t.remove}: ${label}`, plus: `${t.moreOne}: ${label}`, quantity: `${t.quantity}: ${label}` }}
              onMinus={() => onSet(item, variantId, next(item, qty, -1, variantId))}
              onPlus={() => { const to = next(item, qty, 1, variantId); if (to === qty) onLimit(item); else onSet(item, variantId, to); }} />
          ) : (
            <button type="button" className="ox-add" aria-label={t.addNamed(label)} onClick={() => onSet(item, variantId, next(item, 0, 1, variantId))}>
              <Glyph name="plus" />
            </button>
          )
        )}
      </span>
    </div>
  );
}

const WholesaleLine = memo(Line);

export function Wholesale({
  rows, lang, label, qtyOf, showSku = true, ...rest
}: Omit<Props, "row" | "qty"> & { rows: Row[]; label: string; qtyOf: (item: Item, variant: Variant | null) => number }) {
  const t = T[lang];
  return (
    <div role="table" className={`ox-wtable ${showSku ? "" : "nosku"}`} aria-label={label}>
      <div role="rowgroup">
        <div role="row" className="ox-whead">
          {showSku && <span role="columnheader">{t.code}</span>}
          <span role="columnheader">{t.nameHead}</span>
          <span role="columnheader">{t.priceHead}</span>
          <span role="columnheader">{t.quantity}</span>
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row) => (
          <WholesaleLine key={`${row.item.id}-${row.variant?.id ?? ""}`} row={row} lang={lang} qty={qtyOf(row.item, row.variant)} showSku={showSku} {...rest} />
        ))}
      </div>
    </div>
  );
}
