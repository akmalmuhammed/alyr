"use client";

// Pickup or delivery, on the order page's review (ALY-150 part 2, specs/014-pricing-pack). Drawn
// only while the shop has "Delivery and pickup" on; with it off the review is exactly what it was.
// A customer picks collect or delivery (a statement when the shop offers only one), an area from
// the shop's list, writes the address as plain words and, if they like, a note. There are no maps
// and nothing is guessed between two real choices. What it costs is the review's own fee line
// (`FeeRows`), worked out by the shop in the cart check, never here.

import { useId } from "react";
import { formatPrice, type Lang } from "../price";
import { zoneName } from "../fulfil";
import { D, dayWords } from "./deliveryCopy";
import { keyOf, MAX_ADDRESS, MAX_NOTE, type Choice, type Need } from "./deliveryLogic";
import { say } from "./copy";
import type { DeliveryOptions, DeliveryQuote, Zone } from "./types";
import "./delivery.css";

const feeWords = (zone: Zone, lang: Lang) => (zone.fee === 0 ? D[lang].free : formatPrice(zone.fee, lang));

/** The words under an area's name: free over, the minimum, the days and the cut-off. */
function zoneDetails(zone: Zone, lang: Lang): string[] {
  const d = D[lang];
  const out: string[] = [];
  if (zone.free_over !== null && zone.fee > 0) out.push(d.freeOver(formatPrice(zone.free_over, lang)));
  if (zone.min_order > 0) out.push(d.minimum(formatPrice(zone.min_order, lang)));
  const days = say(lang, zone.days_text, zone.days_text_ar);
  const cutoff = say(lang, zone.cutoff_text, zone.cutoff_text_ar);
  const when = [zone.days.length === 0 ? d.deliversEvery : d.delivers(days), cutoff].filter(Boolean);
  out.push(when.join(" · "));
  return out;
}

function Option({ name, checked, onPick, children }: { name: string; checked: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <label className={`ox-ro ${checked ? "on" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <span className="ox-ro-body">{children}</span>
    </label>
  );
}

type Props = {
  lang: Lang;
  options: DeliveryOptions;
  choice: Choice;
  need: Need;
  /** The shop's sentence when it cannot serve the choice (a minimum, no delivery day). */
  problem: string;
  onMode: (mode: "pickup" | "delivery") => void;
  onZone: (key: string) => void;
  onAddress: (text: string) => void;
  onNote: (text: string) => void;
  addressRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function Delivery({ lang, options, choice, need, problem, onMode, onZone, onAddress, onNote, addressRef }: Props) {
  const d = D[lang];
  const id = useId();
  const both = options.pickup && options.delivery;
  const zones = options.zones;
  const delivering = choice.mode === "delivery";
  const chosen = zones.find((z) => keyOf(z) === choice.zone);
  // The shop's one flat fee is just "Delivery": nothing to say "to".
  const one = zones.length === 1 ? zoneName({ zone: zones[0].name, zone_ar: zones[0].name_ar }, lang) : "";
  const hint =
    need === "mode" ? d.needMode : need === "zone" ? d.needZone : need === "address" ? d.needAddress : "";

  return (
    <section className="ox-ful" aria-labelledby={`${id}-t`} data-fulfilment>
      {both ? (
        <fieldset className="ox-ful-set">
          <legend id={`${id}-t`}>{d.title}</legend>
          <div className="ox-ful-modes" role="radiogroup" aria-labelledby={`${id}-t`}>
            <Option name={`${id}-mode`} checked={choice.mode === "pickup"} onPick={() => onMode("pickup")}>
              <b>{d.pickup}</b><small>{d.pickupHint}</small>
            </Option>
            <Option name={`${id}-mode`} checked={choice.mode === "delivery"} onPick={() => onMode("delivery")}>
              <b>{d.delivery}</b><small>{d.deliveryHint}</small>
            </Option>
          </div>
        </fieldset>
      ) : (
        <div className="ox-ful-stmt">
          <b id={`${id}-t`}>{options.pickup ? d.pickupOnly : d.deliveryOnly}</b>
          <span>{options.pickup ? d.pickupOnlyHint : d.deliveryOnlyHint}</span>
        </div>
      )}

      {delivering && zones.length > 1 && (
        <fieldset className="ox-ful-set">
          <legend>{d.areaLegend}</legend>
          <div className="ox-ful-zones" role="radiogroup" aria-label={d.areaLegend}>
            {zones.map((zone) => (
              <Option key={keyOf(zone)} name={`${id}-zone`} checked={choice.zone === keyOf(zone)} onPick={() => onZone(keyOf(zone))}>
                <span className="ox-ro-top">
                  <b dir="auto">{say(lang, zone.name, zone.name_ar)}</b>
                  <span className="num"><bdi>{feeWords(zone, lang)}</bdi></span>
                </span>
                {zoneDetails(zone, lang).map((line) => <small key={line} dir="auto">{line}</small>)}
              </Option>
            ))}
          </div>
        </fieldset>
      )}
      {delivering && zones.length === 1 && (
        <div className="ox-ful-stmt one">
          <span className="ox-ro-top">
            <b dir="auto">{one ? d.oneArea(one) : d.deliveryFee}</b>
            <span className="num"><bdi>{feeWords(zones[0], lang)}</bdi></span>
          </span>
          {zoneDetails(zones[0], lang).map((line) => <small key={line} dir="auto">{line}</small>)}
        </div>
      )}

      {/* What the shop cannot serve (a minimum, no delivery day) is said beside the choice that causes it. */}
      {!hint && problem && <p className="ox-err" role="alert" dir="auto">{problem}</p>}

      {delivering && chosen && (
        <div className="ox-ful-text">
          <div className={`ox-ful-field ${need === "address" ? "ask" : ""}`}>
            <label htmlFor={`${id}-address`}>{d.address}</label>
            <textarea id={`${id}-address`} ref={addressRef} className="ox-area" rows={2} maxLength={MAX_ADDRESS} value={choice.address}
              dir="auto" autoComplete="street-address" enterKeyHint="next" aria-describedby={`${id}-address-h`}
              aria-invalid={need === "address" && choice.address.trim() !== "" ? true : undefined}
              onChange={(e) => onAddress(e.target.value)} />
            <small id={`${id}-address-h`}>{d.addressHint}</small>
          </div>
          <div className="ox-ful-field">
            <label htmlFor={`${id}-note`}>{d.note}</label>
            <textarea id={`${id}-note`} className="ox-area" rows={2} maxLength={MAX_NOTE} value={choice.note}
              dir="auto" aria-describedby={`${id}-note-h`} onChange={(e) => onNote(e.target.value)} />
            <small id={`${id}-note-h`}>{d.noteHint}</small>
          </div>
        </div>
      )}

      <p className="ox-ful-hint" role="status" aria-live="polite">{hint}</p>
    </section>
  );
}

type FeeProps = {
  lang: Lang;
  /** What the shop answered for this exact order; null while it is being asked. */
  quote: DeliveryQuote | null;
  zone: Zone | undefined;
  /** The goods after discounts, as the shop worked them out. */
  goods: number | undefined;
  /** Show the Items line too (the discounts block, which already has it, is not drawn). */
  items: number | null;
  /** How much more gets the fee waived, or null. */
  more: number | null;
};

/** The delivery fee as a line of its own, after the discounts: "Delivery to Al Wakra  QAR 15",
 *  "Free", the day it comes, and what to add for free delivery. */
export function FeeRows({ lang, quote, zone, goods, items, more }: FeeProps) {
  const d = D[lang];
  void goods;
  const named = quote?.zone ?? zone;
  const name = named ? zoneName({ zone: named.name, zone_ar: named.name_ar }, lang) : "";
  const day = quote ? dayWords(say(lang, quote.deliver_on_text ?? "", quote.deliver_on_text_ar ?? ""), lang) : "";
  const free = !!quote && (quote.fee ?? 0) === 0;
  return (
    <div className="ox-brk fee" role="group" aria-label={d.deliveryFee}>
      {items !== null && <div className="ox-sum"><span>{d.items}</span><bdi className="num ox-nb">{formatPrice(items, lang)}</bdi></div>}
      <div className="ox-sum off">
        <span>
          <bdi dir="auto">{name ? d.deliveryTo(name) : d.deliveryFee}</bdi>
          {day && <small dir="auto">{day}</small>}
        </span>
        {quote ? <bdi className="num ox-nb">{free ? d.feeFree : formatPrice(quote.fee ?? 0, lang)}</bdi> : <span className="ox-nb">{d.checking}</span>}
      </div>
      {quote && more !== null && more > 0 && <p className="ox-nudge" dir="auto">{d.nudge(formatPrice(more, lang))}</p>}
    </div>
  );
}
