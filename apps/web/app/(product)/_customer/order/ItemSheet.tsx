"use client";

// One item in full (ALY-112): every photo, the whole description, the sizes and choices with
// their prices, how many it can be ordered in, and when it can be ordered. A customer with
// their own link picks and adds it; anyone else is only looking. A missing required choice
// is named, marked on the choice itself and read out, before anything is added.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatPrice, type Lang } from "../price";
import { missing, most, next, smallest, step, unitPrice } from "./cart";
import { say, T } from "./copy";
import { PriceLine, StatusLine } from "./ItemCard";
import type { Group, Item } from "./types";
import { Glyph } from "../Frame";
import { Dialog, DialogHead, Price, Stepper, Tile } from "./ui";

export type Chosen = { variantId: string | null; optionIds: string[]; qty: number };

type Errors = { variant: boolean; groups: string[]; tooMany: string[] };
const NONE: Errors = { variant: false, groups: [], tooMany: [] };

function Choice({
  group, lang, picked, onPick, error, invalid, canOrder, describedBy,
}: {
  group: Group; lang: Lang; picked: string[]; onPick: (ids: string[]) => void; error: string; invalid: boolean;
  canOrder: boolean; describedBy: string;
}) {
  const t = T[lang];
  const single = group.max_choices === 1;
  const name = say(lang, group.name, group.name_ar);
  const legendId = useId();
  const toggle = (id: string) => {
    if (single) onPick([id]);
    else onPick(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  };
  return (
    <fieldset className={`ox-field ${invalid ? "bad" : ""}`} role={single ? "radiogroup" : "group"}
      aria-labelledby={legendId} aria-describedby={error ? describedBy : undefined}
      aria-invalid={single && invalid ? true : undefined} aria-required={group.required || undefined}>
      <legend id={legendId}>
        <span dir="auto">{name}</span>
        <small>{group.required ? t.required : t.optional}{!single ? ` · ${t.upTo(group.max_choices)}` : ""}</small>
      </legend>
      {group.options.map((o) => {
        const on = picked.includes(o.id);
        return (
          <label key={o.id} className={`ox-opt ${on ? "on" : ""}`}>
            {canOrder
              ? <input type={single ? "radio" : "checkbox"} name={group.id} checked={on} onChange={() => toggle(o.id)} />
              : null}
            <span className="ox-opt-name" dir="auto">{say(lang, o.name, o.name_ar)}</span>
            {o.price_delta !== 0 && <bdi className="num ox-nb ox-opt-price">{o.price_delta > 0 ? "+" : ""}{formatPrice(o.price_delta, lang)}</bdi>}
          </label>
        );
      })}
      {error && <p className="ox-err" id={describedBy} role="alert">{error}</p>}
    </fieldset>
  );
}

export function ItemSheet({
  item, lang, canOrder, showSku = true, fetchFull, onAdd, onClose, onLimit, whatsapp,
}: {
  item: Item; lang: Lang; canOrder: boolean; fetchFull: (id: string) => Promise<Item | null>;
  /** The shop's "show the item code" feature. */
  showSku?: boolean;
  onAdd: (item: Item, pick: Chosen) => void; onClose: () => void; onLimit: (item: Item) => void;
  /** A visitor with no link of their own, to a shop with a WhatsApp number: the sheet offers to
   *  send this item (with the size and quantity chosen) as a message. `href` is the link. */
  whatsapp?: (item: Item, pick: Chosen) => string;
}) {
  const t = T[lang];
  const name = say(lang, item.name, item.name_ar);
  const [full, setFull] = useState<Item | null>(null);
  const [shot, setShot] = useState(0);
  const sizeId = useId();
  const only = item.variants.length === 1 ? item.variants[0].id : null;
  const [variantId, setVariantId] = useState<string | null>(only);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [qty, setQty] = useState(() => smallest(item));
  const [errors, setErrors] = useState<Errors>(NONE);
  const [summary, setSummary] = useState("");
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (item.photo_count > 1) fetchFull(item.id).then((f) => { if (live && f) setFull(f); }).catch(() => undefined);
    return () => { live = false; };
  }, [item.id, item.photo_count, fetchFull]);

  const photos = full?.photos?.length ? full.photos : [item.cover];
  const unit = unitPrice(item, variantId, optionIds);
  const description = say(lang, item.description, item.description_ar);
  const cap = most(item, variantId);
  const sized = item.variants.length > 1;

  const labels = useMemo(() => ({
    minus: `${t.remove}: ${name}`, plus: `${t.moreOne}: ${name}`, quantity: `${t.quantity}: ${name}`,
  }), [t, name]);

  /** Is everything that must be chosen chosen? If not, name what is missing (and say false). */
  function validate(): boolean {
    const found = missing(item, variantId, optionIds);
    if (found.variant || found.groups.length || found.tooMany.length) {
      setErrors(found);
      const lines: string[] = [];
      if (found.variant) lines.push(t.chooseSize(name));
      for (const g of item.option_groups) {
        if (found.groups.includes(g.id)) lines.push(t.chooseGroup(say(lang, g.name, g.name_ar), name));
        if (found.tooMany.includes(g.id)) lines.push(t.chooseFewer(g.max_choices, say(lang, g.name, g.name_ar), name));
      }
      setSummary(lines.join(" "));
      // Take the customer to the first thing to fix.
      requestAnimationFrame(() => body.current?.querySelector<HTMLElement>(".ox-field.bad input, .ox-field.bad")?.focus());
      return false;
    }
    setErrors(NONE);
    return true;
  }

  function add() {
    if (validate()) onAdd(item, { variantId, optionIds, qty: Math.min(qty, cap) });
  }

  const chosenAll = (() => { const f = missing(item, variantId, optionIds); return !(f.variant || f.groups.length || f.tooMany.length); })();
  const waLink = whatsapp && chosenAll ? whatsapp(item, { variantId, optionIds, qty: Math.min(qty, cap) }) : "";

  const groupError = (g: Group): string => {
    if (errors.groups.includes(g.id)) return t.chooseGroup(say(lang, g.name, g.name_ar), name);
    if (errors.tooMany.includes(g.id)) return t.chooseFewer(g.max_choices, say(lang, g.name, g.name_ar), name);
    return "";
  };

  return (
    <Dialog label={name} onClose={onClose}>
      <DialogHead title={name} closeLabel={t.close} onClose={onClose} />
      <div className="ox-dbody" ref={body}>
        <div className="ox-hero">
          <Tile photo={photos[Math.min(shot, photos.length - 1)]} sizes="(min-width: 34rem) 33rem, 100vw" ratio="4 / 3"
            className="ox-big" alt={photos.length > 1 ? t.photoOf(shot + 1, photos.length) : ""} eager />
          {photos.length > 1 && (
            <div className="ox-thumbs" role="group" aria-label={name}>
              {photos.map((p, i) => (
                <button key={`${p.src}-${i}`} type="button" aria-pressed={i === shot} aria-label={t.photoOf(i + 1, photos.length)} onClick={() => setShot(i)}>
                  <Tile photo={p} sizes="56px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ox-facts">
          <PriceLine item={item} lang={lang} />
          <StatusLine item={item} lang={lang} />
          {description && <p className="ox-long" dir="auto">{description}</p>}
          {item.tags.length > 0 && <ul className="ox-tags">{item.tags.map((tag) => <li key={tag} dir="auto">{tag}</li>)}</ul>}
          <p className="ox-meta">
            {[
              item.unit && item.unit !== "piece" ? t.units[item.unit] ?? item.unit : "",
              item.pack_size && item.pack_size > 1 ? t.pack(item.pack_size) : "",
              item.min_order > 1 ? t.minimum(item.min_order) : "",
              showSku && item.code !== null ? t.itemCode(item.code) : "",
              showSku && item.sku ? `${t.sku} ${item.sku}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        </div>

        {summary && <p className="ox-err summary" role="alert">{t.fixBelow} {summary}</p>}

        {sized && (
          <fieldset className={`ox-field ${errors.variant ? "bad" : ""}`} role="radiogroup" aria-labelledby={`${sizeId}-l`}
            aria-describedby={errors.variant ? `${sizeId}-e` : undefined} aria-invalid={errors.variant ? true : undefined} aria-required="true">
            <legend id={`${sizeId}-l`}><span>{t.size}</span><small>{t.required}</small></legend>
            {item.variants.map((v) => (
              <label key={v.id} className={`ox-opt ${variantId === v.id ? "on" : ""} ${v.sold_out ? "gone" : ""}`}>
                {canOrder
                  ? <input type="radio" name={`${sizeId}-v`} checked={variantId === v.id} disabled={v.sold_out}
                      onChange={() => { setVariantId(v.id); setQty((q) => Math.max(smallest(item), Math.min(q, most(item, v.id)))); }} />
                  : null}
                <span className="ox-opt-name" dir="auto">{say(lang, v.name, v.name_ar)}</span>
                {v.sold_out
                  ? <span className="ox-pill off">{t.sizeSoldOut}</span>
                  : v.left !== null && v.left > 0 ? <span className="ox-pill few">{item.daily ? t.onlyLeftToday(v.left) : t.onlyLeft(v.left)}</span> : null}
                <Price value={v.price} lang={lang} className="ox-opt-price" />
              </label>
            ))}
            {errors.variant && <p className="ox-err" id={`${sizeId}-e`} role="alert">{t.chooseSize(name)}</p>}
          </fieldset>
        )}

        {item.option_groups.map((g) => (
          <Choice key={g.id} group={g} lang={lang} canOrder={canOrder}
            picked={optionIds.filter((id) => g.options.some((o) => o.id === id))}
            onPick={(ids) => setOptionIds((all) => [...all.filter((id) => !g.options.some((o) => o.id === id)), ...ids])}
            error={groupError(g)} invalid={errors.groups.includes(g.id) || errors.tooMany.includes(g.id)}
            describedBy={`${sizeId}-${g.id}`} />
        ))}
      </div>

      {canOrder && item.orderable && whatsapp && (
        <footer className="ox-dfoot wa">
          <Stepper qty={qty} atMax={qty >= cap} labels={labels}
            onMinus={() => setQty((q) => Math.max(smallest(item), q - step(item)))}
            onPlus={() => { const to = next(item, qty, 1, variantId); if (to === qty) onLimit(item); else setQty(to); }} />
          {waLink ? (
            <a className="cx-btn ox-addbtn" href={waLink} target="_blank" rel="noopener noreferrer">
              <Glyph name="wa" /><span>{t.startOrder}</span>
            </a>
          ) : (
            <button type="button" className="cx-btn ox-addbtn" onClick={() => void validate()}>
              <Glyph name="wa" /><span>{t.startOrder}</span>
            </button>
          )}
          <button type="button" className="ox-link ox-listbtn" onClick={add}>{t.addToList}</button>
          <p className="ox-quiet center ox-hint">{t.waHint}</p>
        </footer>
      )}
      {canOrder && item.orderable && !whatsapp && (
        <footer className="ox-dfoot">
          <Stepper qty={qty} atMax={qty >= cap} labels={labels}
            onMinus={() => setQty((q) => Math.max(smallest(item), q - step(item)))}
            onPlus={() => { const to = next(item, qty, 1, variantId); if (to === qty) onLimit(item); else setQty(to); }} />
          <button type="button" className="cx-btn ox-addbtn" onClick={add}
            aria-label={`${t.addToOrder}: ${formatPrice(unit * qty, lang)}`}>
            <span>{t.addShort}</span><span aria-hidden="true">·</span>
            <Price value={unit * qty} lang={lang} />
          </button>
        </footer>
      )}
    </Dialog>
  );
}
