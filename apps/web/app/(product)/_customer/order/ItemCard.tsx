"use client";

// One item in the list (ALY-112): a photo in a box that never jumps, the name, a line of its
// description, the customer's price, what is true about when it can be ordered, and one
// control: add, choose, or a stepper. A sold-out item is greyed with its reason and no
// control. Opening the row shows the item in full.

import { memo } from "react";
import { Glyph } from "../Frame";
import type { Lang } from "../price";
import { most, next } from "./cart";
import { say, T } from "./copy";
import type { Item } from "./types";
import { Price, PriceRange, Stepper, Tile } from "./ui";

export type CardProps = {
  item: Item;
  lang: Lang;
  /** menu: a photo beside the name; grid: a photo above it, two to a row; list: compact rows
   *  with no photo (the shop's type chooses, `layout.style`). */
  look: "menu" | "grid" | "list";
  /** How many of this item are in the order, over every size and set of extras. */
  inOrder: number;
  /** The quantity of the one simple line, when the item has no choices to make. */
  simpleQty: number;
  /** Someone with their own link: they may order. Anyone else is only looking. */
  canOrder: boolean;
  /** The shop's "quick quantity" feature: a plus and a stepper on the row. Off, the row's button
   *  opens the item and the customer adds from there. */
  quick?: boolean;
  onOpen: (item: Item) => void;
  onSet: (item: Item, qty: number) => void;
  onLimit: (item: Item) => void;
};

/** The price block: the price, a range for sizes, what it replaces, and why it differs. */
export function PriceLine({ item, lang }: { item: Item; lang: Lang }) {
  const t = T[lang];
  const ranged = item.price_max !== null;
  return (
    <span className="ox-price">
      {ranged
        ? <PriceRange low={item.price_min} high={item.price_max as number} lang={lang} className="ox-now" />
        : <Price value={item.price_min} lang={lang} className="ox-now" />}
      {!ranged && item.list_price !== null && (
        <s className="ox-was"><span className="ox-sr">{lang === "ar" ? "بدلاً من " : "instead of "}</span><Price value={item.list_price} lang={lang} /></s>
      )}
      {item.price_source === "group"
        ? <span className="ox-tag">{t.yourPrice}</span>
        : !ranged && item.list_price !== null ? <span className="ox-tag sale">{t.sale}</span> : null}
    </span>
  );
}

/** What to say under the name: how many are left, or when it can be ordered. */
export function StatusLine({ item, lang }: { item: Item; lang: Lang }) {
  const t = T[lang];
  const bits: { text: string; tone: string }[] = [];
  if (item.sold_out) bits.push({ text: t.soldOut, tone: "off" });
  else if (item.left !== null && item.left > 0) bits.push({ text: item.daily ? t.onlyLeftToday(item.left) : t.onlyLeft(item.left), tone: "few" });
  if (item.note && !item.sold_out) bits.push({ text: say(lang, item.note.en, item.note.ar), tone: item.orderable ? "when" : "later" });
  if (bits.length === 0) return null;
  return (
    <span className="ox-status">
      {bits.map((b) => <span key={b.text} className={`ox-pill ${b.tone}`}>{b.text}</span>)}
    </span>
  );
}

function Card({ item, lang, look, inOrder, simpleQty, canOrder, quick = true, onOpen, onSet, onLimit }: CardProps) {
  const t = T[lang];
  const name = say(lang, item.name, item.name_ar);
  const description = say(lang, item.description, item.description_ar);
  const choose = item.needs_choice || !quick;
  const atMax = simpleQty >= most(item);
  return (
    <li className={`ox-card ${item.orderable ? "" : "off"}`}>
      <button type="button" className="ox-open" onClick={() => onOpen(item)}
        aria-label={`${name}${item.sold_out ? `. ${t.soldOut}` : ""}`}>
        {look !== "list" && <Tile photo={item.cover} sizes={look === "grid" ? "(min-width: 34rem) 260px, 46vw" : "88px"} className="ox-thumb" />}
        <span className="ox-text">
          <span className="ox-name" dir="auto">{name}</span>
          {description && look !== "list" && <span className="ox-desc" dir="auto">{description}</span>}
          <PriceLine item={item} lang={lang} />
          <StatusLine item={item} lang={lang} />
        </span>
      </button>
      <div className="ox-act">
        {item.orderable && canOrder && (
          choose ? (
            <button type="button" className="ox-choose" onClick={() => onOpen(item)} aria-label={t.chooseNamed(name)}>
              {inOrder > 0 ? <span className="num ox-count">{inOrder}</span> : null}
              {t.choose}
            </button>
          ) : simpleQty > 0 ? (
            <Stepper qty={simpleQty} atMax={atMax}
              labels={{ minus: `${t.remove}: ${name}`, plus: `${t.moreOne}: ${name}`, quantity: `${t.quantity}: ${name}` }}
              onMinus={() => onSet(item, next(item, simpleQty, -1))}
              onPlus={() => { const to = next(item, simpleQty, 1); if (to === simpleQty) onLimit(item); else onSet(item, to); }} />
          ) : (
            <button type="button" className="ox-add" aria-label={t.addNamed(name)} onClick={() => onSet(item, next(item, 0, 1))}>
              <Glyph name="plus" />
            </button>
          )
        )}
        {!item.orderable && item.sold_out && <span className="ox-off-label">{t.soldOut}</span>}
      </div>
    </li>
  );
}

// A card is redrawn only when its own data, the language or its place in the order changes,
// so a refresh that changed one item does not redraw the list.
export const ItemCard = memo(Card);
