"use client";

// The order before it is paid for (ALY-112). Every time it opens, and every time it
// changes, the whole order is checked again against the shop: is each item still for sale,
// is there enough, is it still the price the customer was shown, does its schedule allow it
// on the day chosen. Whatever changed is shown here, in words, with what to do about it,
// and nothing is paid until the customer has seen it. A price that moved needs a tap to
// accept; a sold-out item can be swapped; a cut-off that passed offers the next day.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Glyph } from "../Frame";
import type { Lang } from "../price";
import { formatPrice } from "../price";
import { ApiError, checkCart, placeOrder, type CartBody } from "./api";
import { lineName, next, total as totalOf, type Line } from "./cart";
import { say, T } from "./copy";
import type { Check, Checked, Customer, Day, Item, Placed } from "./types";
import { Dialog, DialogHead, Price, Stepper, Tile } from "./ui";

type Props = {
  slug: string;
  token: string;
  lang: Lang;
  lines: Line[];
  /** The latest of each item in the cart, for its rules and the days it is made for. */
  lookup: (id: string) => Item | undefined;
  customer: Customer;
  table: string;
  forDate: string | null;
  onForDate: (date: string | null) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  accept: (key: string, unit: number) => void;
  swap: (key: string, alternative: NonNullable<Checked["alternatives"]>[number]) => void;
  choose: (itemId: string) => void;
  onPlaced: (placed: Placed) => void;
  onClose: () => void;
};

const BLOCKING = ["price_changed"];

function shortDay(iso: string, lang: Lang): string {
  const day = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(day);
}

/** The days every dated item in the order can be ready on. */
function commonDays(lines: Line[], lookup: (id: string) => Item | undefined): Day[] | null {
  const lists = lines.map((l) => lookup(l.itemId)?.order_for_dates).filter((d): d is Day[] => Array.isArray(d));
  if (lists.length === 0) return null;
  return lists.reduce((all, one) => all.filter((d) => one.some((o) => o.date === d.date)));
}

export function ReviewSheet(props: Props) {
  const { slug, token, lang, lines, lookup, customer, table, forDate, onForDate } = props;
  const t = T[lang];
  // What the shop said, for the order as it was when it was asked. Once the order changes the
  // answer is old and is not shown against the new lines.
  const [got, setGot] = useState<{ sig: string; check: Check } | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "placing" | "offline">("checking");
  const [message, setMessage] = useState("");
  const asked = useRef(0);

  const days = commonDays(lines, lookup);
  const dated = days !== null;
  const dayKey = days ? days.map((d) => d.date).join(",") : "";
  // The chosen day must be one every dated item allows; else the first that is.
  useEffect(() => {
    if (!dated) { if (forDate) onForDate(null); return; }
    const list = dayKey ? dayKey.split(",") : [];
    if (list.length && !list.includes(forDate ?? "")) onForDate(list[0]);
  }, [dated, dayKey, forDate, onForDate]);

  const body = useMemo<CartBody>(() => ({
    items: lines.map((l) => ({
      product_id: l.itemId, quantity: l.qty, variant_id: l.variantId, option_ids: l.optionIds, expected_price: l.unit,
    })),
    for_date: dated ? forDate : null,
  }), [lines, forDate, dated]);

  const sig = JSON.stringify(body);
  const check = got && got.sig === sig ? got.check : null;

  const run = useCallback(async () => {
    const mine = ++asked.current;
    if (body.items.length === 0) { setGot(null); setState("ready"); return; }
    setState((s) => (s === "placing" ? s : "checking"));
    try {
      const result = await checkCart(slug, body, token);
      if (mine !== asked.current) return;
      setGot({ sig: JSON.stringify(body), check: result });
      setState("ready");
    } catch (error) {
      if (mine !== asked.current) return;
      if (error instanceof ApiError && error.status === 0) setState("offline");
      else { setMessage(error instanceof ApiError && error.refusal ? say(lang, error.refusal.message, error.refusal.message_ar) : t.failed); setState("ready"); }
    }
  }, [slug, token, body, lang, t]);

  // Checked when it opens and again whenever the order or the day changes; a little wait
  // so a customer tapping + a few times asks once.
  useEffect(() => {
    const wait = setTimeout(() => { void run(); }, 180);
    return () => clearTimeout(wait);
  }, [run]);

  const verdicts = useMemo(() => {
    const byIndex = new Map<number, Checked>();
    check?.lines.forEach((l) => byIndex.set(l.index, l));
    return byIndex;
  }, [check]);

  const changed = lines.filter((_, i) => verdicts.get(i)?.code === "price_changed");
  const broken = lines.filter((_, i) => { const v = verdicts.get(i); return v && !v.ok && !BLOCKING.includes(v.code ?? ""); });
  const placing = state === "placing";
  const checking = state === "checking" || (check === null && state !== "offline");
  const clear = check?.ok === true && state === "ready" && changed.length === 0;
  const shown = clear && check ? check.total : totalOf(lines);

  async function place(payment: "link" | "account") {
    setState("placing");
    setMessage("");
    try {
      const placed = await placeOrder(slug, { ...body, payment, table }, token);
      props.onPlaced(placed);
    } catch (error) {
      if (error instanceof ApiError && error.refusal) {
        // Changed between the check and the tap: the same screen, with what changed.
        const refusal = error.refusal;
        setMessage(say(lang, refusal.message, refusal.message_ar));
        if (refusal.lines) setGot({ sig, check: { ok: false, lines: refusal.lines, total: totalOf(lines) } });
        setState("ready");
        if (!refusal.lines) void run();
      } else {
        setMessage(error instanceof ApiError && error.status === 0 ? t.offline : t.failed);
        setState(error instanceof ApiError && error.status === 0 ? "offline" : "ready");
      }
    }
  }

  const labels = (name: string) => ({ minus: `${t.remove}: ${name}`, plus: `${t.moreOne}: ${name}`, quantity: `${t.quantity}: ${name}` });

  function row(line: Line, index: number) {
    const verdict = verdicts.get(index);
    const item = lookup(line.itemId);
    const name = lineName(line, lang);
    const code = verdict && !verdict.ok ? verdict.code : "";
    const words = verdict && !verdict.ok ? say(lang, verdict.message ?? "", verdict.message_ar ?? "") : "";
    const change =
      code === "not_enough" ? (verdict?.max_quantity ?? 0) :
      code === "below_minimum" ? (verdict?.minimum ?? 0) :
      code === "not_pack_multiple" ? (verdict?.suggest ?? 0) : 0;
    const gone = ["sold_out", "unavailable", "variant_unavailable", "option_invalid"].includes(code ?? "") || (code === "not_enough" && change === 0);
    const needsChoice = ["variant_required", "option_required", "option_too_many"].includes(code ?? "");
    const timing = ["not_now", "closed", "after_cutoff", "not_that_day", "past"].includes(code ?? "");
    return (
      <li key={line.key} className={`ox-line ${code ? "bad" : ""} ${code === "price_changed" ? "moved" : ""}`}>
        <Tile photo={line.src ? { state: "ready", w: null, h: null, src: line.src, srcset: "" } : null} sizes="56px" className="ox-lthumb" />
        <div className="ox-ltext">
          <b dir="auto">{name}</b>
          <span className="ox-lprice">
            <Price value={line.unit} lang={lang} />
            {code === "price_changed" && verdict?.new_price !== undefined && (
              <> <Glyph name="arrow" className="flip ox-lflip" /> <Price value={verdict.new_price} lang={lang} className="ox-new" /></>
            )}
          </span>
          {code === "price_changed" && verdict?.old_price !== undefined && verdict.new_price !== undefined && (
            <p className="ox-lmsg" role="status">{t.priceWas(formatPrice(verdict.old_price, lang), formatPrice(verdict.new_price, lang))}</p>
          )}
          {code && code !== "price_changed" && <p className="ox-lmsg" role="alert">{words}</p>}
          <div className="ox-lact">
            {code === "price_changed" && verdict?.new_price !== undefined && (
              <button type="button" className="ox-link" onClick={() => props.accept(line.key, verdict.new_price as number)}>{t.accept}</button>
            )}
            {change > 0 && <button type="button" className="ox-link" onClick={() => props.setQty(line.key, change)}>{t.changeTo(change)}</button>}
            {needsChoice && <button type="button" className="ox-link" onClick={() => props.choose(line.itemId)}>{t.chooseNow}</button>}
            {timing && verdict?.next_date && (
              <button type="button" className="ox-link" onClick={() => props.onForDate(verdict.next_date as string)}>{t.pickDay(shortDay(verdict.next_date, lang))}</button>
            )}
            {(gone || timing || code === "below_minimum") && <button type="button" className="ox-link" onClick={() => props.remove(line.key)}>{t.removeLine}</button>}
          </div>
          {verdict?.alternatives && verdict.alternatives.length > 0 && (
            <div className="ox-alts" role="group" aria-label={t.tryInstead}>
              {verdict.alternatives.map((a) => (
                <button key={`${a.item_id}-${a.variant_id}`} type="button" className="ox-alt" onClick={() => props.swap(line.key, a)}>
                  <span dir="auto">{say(lang, a.name, a.name_ar)}</span> <Price value={a.price} lang={lang} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ox-lqty">
          <Stepper qty={line.qty} atMax={false} labels={labels(name)}
            onMinus={() => (item ? props.setQty(line.key, next(item, line.qty, -1, line.variantId)) : props.setQty(line.key, line.qty - 1))}
            onPlus={() => (item ? props.setQty(line.key, next(item, line.qty, 1, line.variantId)) : props.setQty(line.key, line.qty + 1))} />
        </div>
      </li>
    );
  }

  return (
    <Dialog label={t.yourOrder} onClose={props.onClose} wide>
      <DialogHead title={t.yourOrder} closeLabel={t.close} onClose={props.onClose} />
      <div className="ox-dbody">
        <div className="ox-state" role="status" aria-live="polite">
          {checking && <p className="ox-quiet">{t.checking}</p>}
          {state === "offline" && <p className="ox-warn"><Glyph name="alert" />{t.offline}</p>}
          {!checking && clear && lines.length > 0 && <p className="ox-good"><Glyph name="check" />{t.allGood}</p>}
          {!checking && (changed.length > 0 || broken.length > 0) && (
            <p className="ox-warn"><Glyph name="alert" /><span><b>{t.changedTitle}.</b> {t.changedHint}</span></p>
          )}
        </div>

        {lines.length === 0 ? <p className="ox-quiet">{t.noLines}</p> : <ul className="ox-lines">{lines.map(row)}</ul>}

        {days && days.length > 0 && (
          <fieldset className="ox-field days" role="radiogroup" aria-labelledby="ox-days-l">
            <legend id="ox-days-l"><span>{t.forDay}</span><small>{t.forDayHint}</small></legend>
            <div className="ox-daylist">
              {days.map((d) => (
                <label key={d.date} className={`ox-day ${forDate === d.date ? "on" : ""}`}>
                  <input type="radio" name="ox-day" checked={forDate === d.date} onChange={() => onForDate(d.date)} />
                  <span>{say(lang, d.label, d.label_ar)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {days && days.length === 0 && <p className="ox-lmsg" role="alert">{t.cartChanged}</p>}
        {message && <p className="ox-err summary" role="alert">{message}</p>}
      </div>

      <footer className="ox-dfoot col">
        <div className="ox-sum"><span>{t.total}</span><Price value={shown} lang={lang} className="ox-total" /></div>
        {changed.length > 0 ? (
          <button type="button" className="cx-btn" onClick={() => changed.forEach((line) => {
            const v = verdicts.get(lines.indexOf(line));
            if (v?.new_price !== undefined) props.accept(line.key, v.new_price);
          })}>{t.accept}</button>
        ) : (
          <button type="button" className="cx-btn" disabled={!clear || placing} onClick={() => void place("link")}>
            <Glyph name="card" />{placing ? t.placing : t.pay(formatPrice(shown, lang))}
          </button>
        )}
        {customer.can_use_account && changed.length === 0 && (
          <button type="button" className="cx-btn ghost" disabled={!clear || placing} onClick={() => void place("account")}>{t.account}</button>
        )}
        {!clear && !checking && changed.length === 0 && lines.length > 0 && state !== "offline" && <p className="ox-quiet center">{t.fixFirst}</p>}
        {state === "offline" && <button type="button" className="cx-btn ghost" onClick={() => void run()}>{t.retry}</button>}
      </footer>
    </Dialog>
  );
}
