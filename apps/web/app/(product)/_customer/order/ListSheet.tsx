"use client";

// A visitor's list (ALY-136): someone who opened the shop's page without a link of their own
// picks items, and this is the list they are about to send. It does nothing the shop could
// disagree with later: no check, no payment, just the items, their quantities and the message
// that WhatsApp opens with. The shop (or the chat, when its number runs on ALYR) answers with
// the real price and what is in stock.

import { Glyph } from "../Frame";
import type { Lang } from "../price";
import { lineName, next, total as totalOf, type Line } from "./cart";
import { T } from "./copy";
import type { Item } from "./types";
import { Dialog, DialogHead, Price, Stepper, Tile } from "./ui";
import type { WaPart } from "./wa";

type Props = {
  lang: Lang;
  lines: Line[];
  lookup: (id: string) => Item | undefined;
  parts: WaPart[];
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  onClose: () => void;
};

export function ListSheet({ lang, lines, lookup, parts, setQty, remove, onClose }: Props) {
  const t = T[lang];
  const labels = (name: string) => ({ minus: `${t.remove}: ${name}`, plus: `${t.moreOne}: ${name}`, quantity: `${t.quantity}: ${name}` });
  return (
    <Dialog label={t.yourList} onClose={onClose} wide>
      <DialogHead title={t.yourList} closeLabel={t.close} onClose={onClose} />
      <div className="ox-dbody">
        {lines.length === 0 ? <p className="ox-quiet">{t.listEmpty}</p> : (
          <ul className="ox-lines">
            {lines.map((line) => {
              const item = lookup(line.itemId);
              const name = lineName(line, lang);
              return (
                <li key={line.key} className="ox-line">
                  <Tile photo={line.src ? { state: "ready", w: null, h: null, src: line.src, srcset: "" } : null} sizes="56px" className="ox-lthumb" />
                  <div className="ox-ltext">
                    <b dir="auto">{name}</b>
                    <span className="ox-lprice">
                      <Price value={line.unit} lang={lang} />
                      {(line.code ?? item?.code) != null && <> · <span className="ox-codeline">{t.code} <bdi className="num">{line.code ?? item?.code}</bdi></span></>}
                    </span>
                    <div className="ox-lact">
                      <button type="button" className="ox-link" onClick={() => remove(line.key)}>{t.removeLine}</button>
                    </div>
                  </div>
                  <div className="ox-lqty full">
                    <Stepper qty={line.qty} atMax={false} labels={labels(name)}
                      onMinus={() => (item ? setQty(line.key, next(item, line.qty, -1, line.variantId)) : setQty(line.key, line.qty - 1))}
                      onPlus={() => (item ? setQty(line.key, next(item, line.qty, 1, line.variantId)) : setQty(line.key, line.qty + 1))} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="ox-dfoot col">
        <div className="ox-sum"><span>{t.total}</span><Price value={totalOf(lines)} lang={lang} className="ox-total" /></div>
        {parts.length > 1 && <p className="ox-quiet center">{t.partsHint(parts.length)}</p>}
        {parts.map((part, i) => (
          <a key={part.href} className={`cx-btn ${i > 0 ? "ghost" : ""}`} href={part.href} target="_blank" rel="noopener noreferrer">
            <Glyph name="wa" />{parts.length > 1 ? t.partOf(i + 1, parts.length) : t.startOrder}
          </a>
        ))}
        {parts.length > 0 && <p className="ox-quiet center">{t.waHint}</p>}
      </footer>
    </Dialog>
  );
}
