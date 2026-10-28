"use client";

// The Stock tab (ALY-104): every item the shop counts, what is on the shelf in the system,
// and three things the counter does all day: stock received, stock wasted, and the shelf
// counted. A count shows the difference from the system before it is recorded and needs a
// reason when they differ. Below, the log of every change, with who made it and why.

import { useCallback, useEffect, useState } from "react";
import { fmtQtyUnit, isMeasure, qtyForApi, subQty, unitFor, unitShort } from "../_customer/qty";
import { api, nameOf, sayError, stamp, toQty, whoIs, type Item, type ListResult, type Movement, type Variant } from "./catalogApi";
import { COPY, type Lang } from "./catalogCopy";
import { Field, Icon, Sheet, Tile, type Toast } from "./CatalogUi";
import { StockValue } from "./Margin";

type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;
type Mode = "received" | "wasted" | "count";
// What the API writes when nobody said why: the log line already says it in the person's language.
const GENERIC = ["Opening count", "Stock received", "Counted, no difference", "Order placed"];
type Target = { item: Item; variant: Variant; mode: Mode };

/** "+2.5 kg", "−0.5 kg", "0": a change in stock with its sign (a minus sign, not a hyphen). */
function signed(n: number, unit = "piece", lang: Lang = "en") {
  return n > 0 ? `+${fmtQtyUnit(n, unit, lang)}` : n < 0 ? `−${fmtQtyUnit(Math.abs(n), unit, lang)}` : "0";
}

/** What the system says is left of one variant: the number in stock, or today's allowance. */
function systemOf(item: Item, v: Variant) {
  return item.stock_rule === "daily_limit" ? v.left ?? 0 : v.on_hand;
}

export function CatalogStock({ lang, onChanged, push, clear, costs = false }: { lang: Lang; onChanged: () => void; push: Push; clear: () => void; costs?: boolean }) {
  const t = COPY[lang];
  const [items, setItems] = useState<Item[] | null>(null);
  const [log, setLog] = useState<Movement[]>([]);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, moves] = await Promise.all([
        api<ListResult>("/api/items?filter=stocked&limit=500"),
        api<{ log: Movement[] }>("/api/items/stock-log?limit=40"),
      ]);
      setItems(list.items);
      setLog(moves.log);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !target) void load(); }, 20_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load, target]);

  const labels = { pending: t.photoSaving, failed: t.photoFailed, missing: t.addPhoto };
  const rows = (items ?? []).flatMap((item) =>
    item.variants.filter((v) => v.active).map((variant) => ({ item, variant })),
  );

  return (
    <section className="ct-stockwrap" aria-labelledby="ct-stock-h">
      <header className="ct-subhead">
        <h2 id="ct-stock-h">{t.stockTitle}</h2>
        <p>{t.stockSub}</p>
      </header>

      {costs && <StockValue lang={lang} on={costs} version={items} />}

      {failed && (
        <div className="ct-banner bad" role="status">
          <span>{t.offline}</span>
          <button type="button" className="btn small" onClick={() => void load()}>{t.retry}</button>
        </div>
      )}
      {items === null && !failed && <p className="ct-quiet" role="status">{t.loading}</p>}

      {items !== null && rows.length === 0 && (
        <section className="sh-tile raised ct-empty">
          <span className="sh-glyph"><Icon name="stock" /></span>
          <h2>{t.stockEmptyTitle}</h2>
          <p>{t.stockEmptyText}</p>
        </section>
      )}

      {rows.length > 0 && (
        <ul className="ct-stocklist">
          {rows.map(({ item, variant }) => {
            const system = systemOf(item, variant);
            const name = nameOf(item, lang) || t.untitled;
            const size = variant.is_default ? "" : nameOf(variant, lang);
            const daily = item.stock_rule === "daily_limit";
            const low = !daily && system > 0 && system <= 5;
            return (
              <li key={variant.id} className="ct-stockrow">
                <span className="ct-photo sm"><Tile photo={item.cover} sizes="56px" labels={labels} /></span>
                <span className="ct-stock-text">
                  <b dir="auto">{name}</b>
                  {size && <small dir="auto">{size}</small>}
                  {item.status !== "live" && <small>{t.status[item.status]}</small>}
                </span>
                <span className={`ct-stock-n ${system === 0 ? "none" : low ? "low" : ""}`}>
                  <b className="num" dir="auto">{fmtQtyUnit(system, unitFor(item), lang)}</b>
                  <small>{system === 0 ? t.noneLeft : daily ? `${t.today} ${t.of(fmtQtyUnit(variant.daily_limit ?? 0, unitFor(item), lang))}` : low ? t.stockNow + " · " + t.left(fmtQtyUnit(system, unitFor(item), lang)) : t.stockNow}</small>
                </span>
                <span className="ct-stock-acts">
                  {([["received", t.received], ["wasted", t.wasted], ["count", t.countShelf]] as const).map(([mode, word]) => (
                    <button key={mode} type="button" className="btn ct-btn" onClick={() => { clear(); setTarget({ item, variant, mode }); }}>
                      {word}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <header className="ct-subhead">
        <h2>{t.movements}</h2>
      </header>
      {log.length === 0 ? <p className="ct-quiet">{t.movementsNone}</p> : (
        <ul className="ct-movelist">
          {log.map((m) => {
            const name = lang === "ar" && m.item_ar ? m.item_ar : m.item || m.item_ar;
            const size = lang === "ar" && m.variant_ar ? m.variant_ar : m.variant;
            return (
              <li key={m.id}>
                <b className={`ct-delta num ${m.delta > 0 ? "up" : m.delta < 0 ? "down" : ""}`} dir="auto">{signed(m.delta, m.unit ?? "piece", lang)}</b>
                <span className="ct-move-text">
                  <span><b dir="auto">{name || t.untitled}</b>{size ? <span dir="auto"> · {size}</span> : null}</span>
                  <small>
                    {t.kinds[m.kind] ?? m.kind}
                    {m.order_number ? ` · ${t.orderNo(m.order_number)}` : ""}
                    {m.reason && m.kind !== "sold" && !GENERIC.includes(m.reason) ? ` · ${m.reason}` : ""}
                    {` · ${t.balance(fmtQtyUnit(m.balance_after, m.unit ?? "piece", lang))}`}
                  </small>
                  <small>{t.by(whoIs(m.actor.name, t))}{m.via === "whatsapp" ? ` · ${t.viaWhatsapp}` : ""} · <time className="num" dateTime={m.created_at} dir="ltr">{stamp(m.created_at, lang)}</time></small>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {target && (
        <StockSheet lang={lang} target={target} onClose={() => setTarget(null)}
          onDone={(message) => { setTarget(null); push(message); void load(); onChanged(); }} />
      )}
    </section>
  );
}

function StockSheet({ lang, target, onClose, onDone }: {
  lang: Lang; target: Target; onClose: () => void; onDone: (message: string) => void;
}) {
  const t = COPY[lang];
  const { item, variant, mode } = target;
  const system = systemOf(item, variant);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(mode === "count" && system === 0 ? t.reasonsCount[3] : "");
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);

  // A quantity: a whole number, or up to three decimals for something sold by weight or volume.
  const measure = isMeasure(item.unit);
  const n = toQty(amount, item.unit);
  const valid = n !== null && (mode === "count" ? n >= 0 : n > 0);
  const difference = mode === "count" && n !== null ? subQty(n, system) : 0;
  const needReason = mode === "wasted" || (mode === "count" && valid && difference !== 0);
  const ideas = mode === "received" ? t.reasonsReceived : mode === "wasted" ? t.reasonsWasted : t.reasonsCount;
  const name = nameOf(item, lang) || t.untitled;
  const size = variant.is_default ? "" : nameOf(variant, lang);

  async function record() {
    if (!valid || n === null) { setFailure(t.errors.bad_quantity); return; }
    if (needReason && !reason.trim()) { setFailure(mode === "count" ? t.reasonRequired : t.errors.reason_needed); return; }
    setSaving(true);
    setFailure("");
    try {
      if (mode === "count") {
        const done = await api<{ difference: number }>(`/api/items/${item.id}/count`, "POST", { counted: qtyForApi(n), reason: reason.trim(), variant_id: variant.id });
        onDone(done.difference === 0 ? t.countSame : t.countDifferent(done.difference > 0, fmtQtyUnit(Math.abs(done.difference), item.unit, lang)));
      } else {
        await api(`/api/items/${item.id}/stock`, "POST", { kind: mode, quantity: qtyForApi(n), reason: reason.trim(), variant_id: variant.id });
        onDone(t.stockSaved);
      }
    } catch (error) {
      setFailure(sayError(error, lang, t));
      setSaving(false);
    }
  }

  const title = mode === "received" ? t.received : mode === "wasted" ? t.wasted : t.countShelf;
  return (
    <Sheet title={title} subtitle={size ? `${name} · ${size}` : name} onClose={onClose} closeLabel={t.close}
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancel}</button>
          <button type="submit" form="ct-stock-form" className="btn primary ct-btn ct-grow" disabled={saving || !valid}>{saving ? t.recording : t.record}</button>
        </>
      )}>
      <form id="ct-stock-form" className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void record(); }}>
        {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
        <div className="ct-system">
          <span>{t.stockNow}</span>
          <b className="num" dir="auto">{fmtQtyUnit(system, unitFor(item), lang)}</b>
        </div>
        <Field label={mode === "received" ? t.receivedFor : mode === "wasted" ? t.wastedFor : t.counted}
          hint={measure ? t.inUnit(unitShort(item.unit, lang)) : undefined}>
          <input className="ct-bignum" value={amount} inputMode={measure ? "decimal" : "numeric"} dir="ltr" autoComplete="off" data-autofocus
            onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {mode === "count" && valid && (
          <p className={`ct-diff ${difference === 0 ? "same" : difference > 0 ? "up" : "down"}`} role="status">
            <Icon name={difference === 0 ? "check" : difference > 0 ? "up" : "low"} />
            <span><b>{t.difference}: <bdi className="num">{signed(difference, item.unit, lang)}</bdi></b>{" "}
              {difference === 0 ? t.same : difference > 0 ? t.more : t.fewer}</span>
          </p>
        )}
        {(mode !== "count" || (valid && difference !== 0)) && (
          <>
            <Field label={needReason ? t.reasonFor : t.reason}>
              <input value={reason} dir="auto" maxLength={200} autoComplete="off" onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="ct-chips wrap" role="group" aria-label={t.reason}>
              {ideas.map((idea) => (
                <button key={idea} type="button" className="ct-chip" aria-pressed={reason === idea} onClick={() => setReason(reason === idea ? "" : idea)}>
                  {reason === idea && <Icon name="check" className="sh-ico ct-chip-tick" />}{idea}
                </button>
              ))}
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}
