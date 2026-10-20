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
import type { WaPart } from "./wa";
import { Dialog, DialogHead, Price, Stepper, Tile } from "./ui";

const up = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

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
  /** The shop's "pickup or delivery day" feature. Off, nobody is asked and an order for an item
   *  made to order is for the earliest day the shop can do it. */
  askDay?: boolean;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  accept: (key: string, unit: number) => void;
  swap: (key: string, alternative: NonNullable<Checked["alternatives"]>[number]) => void;
  choose: (itemId: string) => void;
  onPlaced: (placed: Placed) => void;
  onClose: () => void;
  /** The same order as WhatsApp messages (ALY-136), when the shop has given its number. */
  whatsapp?: WaPart[];
  /** The shop's discounts are on (ALY-150): the review has a code box and shows what came off.
   *  Off, the review asks and shows exactly what it always did. */
  discounts?: boolean;
};

const BLOCKING = ["price_changed"];
const MAX_CODES = 3;

/** A code as the shop's API compares it: capitals, Western digits, no spaces, dashes or underscores. */
const codeText = (text: string) => text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s+/g, "").toUpperCase();
const sameCode = (a: string, b: string) => codeText(a).replace(/[-_]/g, "") === codeText(b).replace(/[-_]/g, "");

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
  const { slug, token, lang, lines, lookup, customer, table, forDate, onForDate, askDay = true } = props;
  const t = T[lang];
  // What the shop said, for the order as it was when it was asked. Once the order changes the
  // answer is old and is not shown against the new lines.
  const [got, setGot] = useState<{ sig: string; check: Check } | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "placing" | "offline">("checking");
  const [message, setMessage] = useState("");
  const asked = useRef(0);
  // Discount codes (ALY-150): what the customer typed lives here and nowhere else, so closing
  // the review forgets it. A code the shop says does not work is dropped from the order and its
  // sentence is kept under the box until the customer types again.
  const [off, setOff] = useState(false);
  const couponsOn = !!props.discounts && !off;
  const [codes, setCodes] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [rejected, setRejected] = useState<{ code: string; text: string } | null>(null);
  const messageEl = useRef<HTMLParagraphElement>(null);

  const days = commonDays(lines, lookup);
  const dated = days !== null;
  const dayKey = days ? days.map((d) => d.date).join(",") : "";
  // The chosen day must be one every dated item allows; else the first that is.
  useEffect(() => {
    if (!dated || !askDay) { if (forDate) onForDate(null); return; }
    const list = dayKey ? dayKey.split(",") : [];
    if (list.length && !list.includes(forDate ?? "")) onForDate(list[0]);
  }, [dated, askDay, dayKey, forDate, onForDate]);

  const body = useMemo<CartBody>(() => ({
    items: lines.map((l) => ({
      product_id: l.itemId, quantity: l.qty, variant_id: l.variantId, option_ids: l.optionIds, expected_price: l.unit,
    })),
    for_date: dated && askDay ? forDate : null,
    ...(couponsOn ? { coupons: codes } : {}),
  }), [lines, forDate, dated, askDay, couponsOn, codes]);

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
      // A code that does not work for this order is taken out of it, and the shop's sentence
      // stays under the box. (It is asked again by itself, without the code.)
      const failed = (result.pricing?.coupons ?? []).filter((c) => !c.ok);
      if (failed.length > 0) {
        setCodes((all) => all.filter((c) => !failed.some((f) => sameCode(f.code, c))));
        const last = failed[failed.length - 1];
        setRejected({ code: last.code, text: say(lang, last.message ?? "", last.message_ar ?? "") });
      }
    } catch (error) {
      if (mine !== asked.current) return;
      if (error instanceof ApiError && error.status === 0) setState("offline");
      else if (error instanceof ApiError && error.refusal?.code === "feature_off") {
        // The shop switched its discounts off while this was open: the review goes back to the plain one.
        setOff(true);
        setCodes([]);
      } else { setMessage(error instanceof ApiError && error.refusal ? say(lang, error.refusal.message, error.refusal.message_ar) : t.failed); setState("ready"); }
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
      // With discounts on, the order says what total the customer was shown; if it now comes to
      // something else it is refused with the new figures, never charged differently.
      const placed = await placeOrder(slug, { ...body, payment, table, ...(couponsOn && check ? { expected_total: check.total } : {}) }, token);
      props.onPlaced(placed);
    } catch (error) {
      if (error instanceof ApiError && error.refusal) {
        // Changed between the check and the tap: the same screen, with what changed.
        const refusal = error.refusal;
        if (couponsOn && refusal.code.startsWith("coupon_") && refusal.coupon) {
          // The code stopped working (ended, used up, minimum...) or never did: out of the order, with its reason under the box.
          const bad = refusal.coupon;
          setCodes((all) => all.filter((c) => !sameCode(bad, c)));
          setRejected({ code: bad, text: say(lang, refusal.message, refusal.message_ar) });
          setState("ready");
          return;
        }
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

  // ── discount codes (ALY-150) ──
  // What the shop last said about the codes, even while the next answer is on its way, so a chip
  // does not blink out and back as the order is asked again.
  const pricing = couponsOn ? (check ?? got?.check ?? null)?.pricing : undefined;
  const verdictOf = (code: string) => pricing?.coupons.find((c) => sameCode(c.code, code));

  function apply() {
    const code = codeText(typed);
    if (!code) return;
    if (codes.some((c) => sameCode(c, code))) { setNote(t.codeDuplicate); return; }
    if (codes.length >= MAX_CODES) { setNote(t.codeMax); return; }
    setCodes([...codes, code]);
    setTyped("");
    setNote("");
    setRejected(null);
  }

  function drop(code: string) {
    setCodes(codes.filter((c) => c !== code));
    setRejected(null);
    setNote("");
  }

  // A sentence about the whole order (the total changed) is brought into view: it is at the end of a scrolling sheet.
  useEffect(() => {
    if (message) messageEl.current?.scrollIntoView({ block: "nearest" });
  }, [message]);

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
          {couponsOn && verdict?.ok && (verdict.discount ?? 0) > 0 && verdict.line_total !== undefined && verdict.line_total_after !== undefined && (
            <span className="ox-lafter">
              <span className="ox-sr">{t.was} </span><s><Price value={verdict.line_total} lang={lang} /></s>
              <span className="ox-sr"> {t.now} </span><Price value={verdict.line_total_after} lang={lang} className="ox-new" />
            </span>
          )}
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
        </div>
        <div className="ox-lqty">
          <Stepper qty={line.qty} atMax={false} labels={labels(name)}
            onMinus={() => (item ? props.setQty(line.key, next(item, line.qty, -1, line.variantId)) : props.setQty(line.key, line.qty - 1))}
            onPlus={() => (item ? props.setQty(line.key, next(item, line.qty, 1, line.variantId)) : props.setQty(line.key, line.qty + 1))} />
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

        {askDay === false && days && days.length > 0 && (
          <p className="ox-quiet">{t.readyOn(up(say(lang, days[0].label, days[0].label_ar)))}</p>
        )}
        {askDay && days && days.length > 0 && (
          <fieldset className="ox-field days" role="radiogroup" aria-labelledby="ox-days-l">
            <legend id="ox-days-l"><span>{t.forDay}</span><small>{t.forDayHint}</small></legend>
            <div className="ox-daylist">
              {days.map((d) => (
                <label key={d.date} className={`ox-day ${forDate === d.date ? "on" : ""}`}>
                  <input type="radio" name="ox-day" checked={forDate === d.date} onChange={() => onForDate(d.date)} />
                  <span>{up(say(lang, d.label, d.label_ar))}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {days && days.length === 0 && <p className="ox-lmsg" role="alert">{t.cartChanged}</p>}
        {couponsOn && lines.length > 0 && (
          <section className={`ox-coupon ${rejected ? "bad" : ""}`} aria-labelledby="ox-coupon-l">
            <label id="ox-coupon-l" htmlFor="ox-coupon-in">{t.codeLabel}</label>
            <div className="ox-coupon-row">
              <input id="ox-coupon-in" className="cx-input" value={typed} dir="ltr" lang="en" autoComplete="off" autoCapitalize="characters"
                spellCheck={false} enterKeyHint="done" maxLength={40}
                aria-invalid={rejected || note ? true : undefined} aria-describedby={rejected || note ? "ox-coupon-err" : undefined}
                onChange={(e) => { setTyped(e.target.value); if (rejected) setRejected(null); if (note) setNote(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }} />
              <button type="button" className="cx-btn ghost ox-apply" disabled={!typed.trim()} onClick={apply}>{t.codeApply}</button>
            </div>
            {(rejected || note) && <p className="ox-err" id="ox-coupon-err" role="alert" dir="auto">{rejected?.text || note}</p>}
            {codes.length > 0 && (
              <ul className="ox-codes" aria-label={t.codeAppliedLabel} aria-live="polite">
                {codes.map((code) => {
                  const verdict = verdictOf(code);
                  return (
                    <li key={code} className="ox-codechip">
                      <b className="num" dir="ltr">{code}</b>
                      {verdict?.ok ? <span className="ox-chipoff">{`−${formatPrice(verdict.amount, lang)}`}</span> : <span className="ox-chipoff">{t.codeChecking}</span>}
                      <button type="button" aria-label={t.codeRemove(code)} onClick={() => drop(code)}><Glyph name="close" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
        {couponsOn && clear && check?.pricing && check.pricing.discounts.length > 0 && (
          <div className="ox-brk" role="group" aria-label={t.discountOf}>
            <div className="ox-sum"><span>{t.subtotal}</span><Price value={check.pricing.subtotal} lang={lang} /></div>
            {check.pricing.discounts.map((d) => (
              <div key={d.id} className="ox-sum off">
                <span>
                  <bdi dir="auto">{d.kind === "coupon" ? d.code : say(lang, d.name, d.name_ar) || t.discountOf}</bdi>
                  <small dir="auto">{say(lang, d.text, d.text_ar)}</small>
                </span>
                <bdi className="num ox-nb">{`−${formatPrice(d.amount, lang)}`}</bdi>
              </div>
            ))}
          </div>
        )}
        {message && <p className="ox-err summary" role="alert" ref={messageEl}>{message}</p>}
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
        {props.whatsapp && props.whatsapp.length > 0 && lines.length > 0 && (
          <>
            {props.whatsapp.length > 1 && <p className="ox-quiet center">{t.partsHint(props.whatsapp.length)}</p>}
            {props.whatsapp.map((part, i) => (
              <a key={part.href} className="cx-btn ghost" href={part.href} target="_blank" rel="noopener noreferrer">
                <Glyph name="wa" />{props.whatsapp && props.whatsapp.length > 1 ? t.partOf(i + 1, props.whatsapp.length) : t.sendOnWhatsApp}
              </a>
            ))}
          </>
        )}
      </footer>
    </Dialog>
  );
}
