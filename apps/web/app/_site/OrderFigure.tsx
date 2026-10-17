"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./brand";
import type { OrderItem, OrderPage } from "./copy";
import { fill } from "./fill";
import { CxFoot, CxTop, Phone } from "./Frames";

// The hero's phone: the product's real order page (`/s/`) for the sample bakery, with
// steppers that work. Nothing is sent anywhere; it only adds up. The static HTML is the
// page as it opens, so it is complete before this hydrates.

const MOST = 9;

const amount = (text: string) => Number(text.replace(/[^\d.]/g, "")) || 0;

/** A value that rolls when it changes: the old one leaves, the new one arrives, on the
 * spring. With reduced motion the new value simply replaces the old (home.css). */
function Roll({ value }: { value: string }) {
  const [view, setView] = useState({ now: value, old: "", key: 0, up: true });
  if (view.now !== value) {
    setView({ now: value, old: view.now, key: view.key + 1, up: amount(value) >= amount(view.now) });
  }
  return (
    <span className={`roll ${view.up ? "up" : "down"}`}>
      {view.key > 0 && <span key={`old-${view.key}`} className="roll-old" aria-hidden="true">{view.old}</span>}
      <span key={`new-${view.key}`} className={view.key > 0 ? "roll-new" : undefined}>{view.now}</span>
    </span>
  );
}

export function OrderFigure({ order, other }: { order: OrderPage; other: string }) {
  const items = order.sections.flatMap((section) => section.items);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.qty])),
  );
  const [said, setSaid] = useState("");
  const refocus = useRef<string | null>(null);
  const base = useId();

  const count = items.reduce((sum, item) => sum + qty[item.id], 0);
  const total = items.reduce((sum, item) => sum + qty[item.id] * item.price, 0);
  const counted = (n: number) => fill(n === 1 ? order.count.one : order.count.other, { n });
  const money = (n: number) => fill(order.money, { n: n.toLocaleString("en") });
  const control = (item: OrderItem, part: "add" | "more") => `${base}-${item.id}-${part}`;

  function change(item: OrderItem, by: number) {
    const now = qty[item.id];
    if (by > 0 && now >= MOST) {
      setSaid(fill(order.max, { item: item.name }));
      return;
    }
    const next = Math.max(0, Math.min(MOST, now + by));
    if (next === now) return;
    // The control that was pressed may disappear (− at one, + on an empty row), so
    // keep the keyboard where the eye is.
    if (now === 0) refocus.current = control(item, "more");
    else if (next === 0) refocus.current = control(item, "add");
    setQty({ ...qty, [item.id]: next });
    const nextTotal = total + (next - now) * item.price;
    setSaid(
      fill(order.announce, {
        item: item.name, qty: next, count: counted(count - now + next), total: nextTotal.toLocaleString("en"),
      }),
    );
  }

  useEffect(() => {
    if (!refocus.current) return;
    document.getElementById(refocus.current)?.focus();
    refocus.current = null;
  });

  return (
    <Phone live className="hero-phone">
      <div className="d-cx">
        <CxTop shop={order.shop} monogram={order.monogram} context={order.context} other={order.other} lang={other} />
        <div className="d-main">
          <div className="d-hero">
            <span className="d-eyebrow">{order.eyebrow}</span>
            <b className="d-h1">{order.title}</b>
            <span className="d-who-chip">{order.as} <b>{order.customer}</b></span>
          </div>
          <div className="d-cats" aria-hidden="true">
            {order.categories.map((category, index) => (
              <span key={category} className={index === 0 ? "on" : undefined}>{category}</span>
            ))}
          </div>
          {order.sections.map((section) => (
            <div key={section.name} className="d-section">
              <b className="d-h2">{section.name}</b>
              <div className="d-card">
                {section.items.map((item) => (
                  <div key={item.id} className="d-row">
                    <span className="d-row-text">
                      <b>{item.name}</b>
                      <span dir="auto">{money(item.price)}</span>
                    </span>
                    {qty[item.id] ? (
                      <span className="d-stepper">
                        <button type="button" aria-label={fill(order.less, { item: item.name })} onClick={() => change(item, -1)}>
                          <Icon name="minus" className="ico" />
                        </button>
                        <Roll value={String(qty[item.id])} />
                        <button
                          type="button"
                          id={control(item, "more")}
                          aria-label={fill(order.more, { item: item.name })}
                          aria-disabled={qty[item.id] >= MOST || undefined}
                          onClick={() => change(item, 1)}
                        >
                          <Icon name="plus" className="ico" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="d-add"
                        id={control(item, "add")}
                        aria-label={fill(order.add, { item: item.name })}
                        onClick={() => change(item, 1)}
                      >
                        <Icon name="plus" className="ico" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <CxFoot powered={order.powered} />
        </div>
        <div className="d-bar" data-empty={count === 0 || undefined} aria-hidden="true">
          <div className="d-sum">
            <span><Roll value={counted(count)} /></span>
            <b dir="auto"><Roll value={money(total)} /></b>
          </div>
          <span className="d-btn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z M3 10h18" /></svg>
            {fill(order.pay, { total: total.toLocaleString("en") })}
          </span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{said}</p>
    </Phone>
  );
}
