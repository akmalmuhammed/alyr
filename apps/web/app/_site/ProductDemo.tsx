"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./brand";
import type { Copy } from "./copy";

type Props = { product: Copy["product"] };

/**
 * The product, shown as it is used: a conversation on one side and what the team sees
 * on the other. It plays through the five jobs by itself while on screen, stops for
 * good the moment the visitor picks a tab, and can be paused. With reduced motion it
 * does not play at all and every message is simply there.
 */
export function ProductDemo({ product }: Props) {
  const demos = product.demos;
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [onScreen, setOnScreen] = useState(false);
  const [still, setStill] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(media.matches);
    const first = setTimeout(sync, 0);
    media.addEventListener("change", sync);
    const node = root.current;
    const watch = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.35 },
    );
    if (node) watch.observe(node);
    return () => {
      clearTimeout(first);
      media.removeEventListener("change", sync);
      watch.disconnect();
    };
  }, []);

  const playing = auto && onScreen && !still;
  const demo = demos[active];

  function choose(index: number, focus = false) {
    setAuto(false);
    setActive(index);
    if (focus) tabs.current[index]?.focus();
  }

  function onKey(event: React.KeyboardEvent) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (step) {
      event.preventDefault();
      choose((active + step + demos.length) % demos.length, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      choose(event.key === "Home" ? 0 : demos.length - 1, true);
    }
  }

  return (
    <div className="demo" ref={root} data-playing={playing || undefined}>
      <div className="demo-bar">
        <div className="demo-tabs" role="tablist" aria-label={product.tabsLabel} onKeyDown={onKey}>
          {demos.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => { tabs.current[index] = node; }}
              role="tab"
              type="button"
              id={`demo-tab-${item.id}`}
              aria-selected={index === active}
              aria-controls="demo-stage"
              tabIndex={index === active ? 0 : -1}
              className="demo-tab"
              onClick={() => choose(index)}
            >
              <span className="demo-tab-n" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {item.tab}
              {index === active && playing && (
                <span
                  className="demo-tab-bar"
                  aria-hidden="true"
                  onAnimationEnd={() => setActive((active + 1) % demos.length)}
                />
              )}
            </button>
          ))}
        </div>
        {!still && (
          <button type="button" className="demo-toggle" onClick={() => setAuto(!auto)}>
            <span className={auto ? "demo-pause" : "demo-play"} aria-hidden="true" />
            {auto ? product.pause : product.play}
          </button>
        )}
      </div>

      <div
        className="demo-stage"
        id="demo-stage"
        role="tabpanel"
        aria-labelledby={`demo-tab-${demo.id}`}
        key={demo.id}
      >
        <section className="chat" aria-label={product.business}>
          <header className="chat-top">
            <span className="chat-avatar" aria-hidden="true">{product.business.slice(0, 1)}</span>
            <span>
              <b>{product.business}</b>
              <small>{product.businessMeta}</small>
            </span>
          </header>
          <ol className="chat-lines">
            {demo.chat.map((line, index) => (
              <li
                key={index}
                className={`msg msg-${line.from}`}
                style={{ "--i": index } as React.CSSProperties}
              >
                {line.name && <span className="msg-name">{line.name}</span>}
                <span dir="auto">{line.text}</span>
                {line.action && (
                  <span className="msg-action">
                    {line.action}
                    <Icon name="arrow-up-right" className="ico ico-flip" />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-label={product.workspace}>
          <header className="panel-top">
            <span className="panel-kicker">{product.workspace}</span>
            <b>{demo.panel.title}</b>
            <span className="panel-badge">{demo.panel.badge}</span>
          </header>
          <ul className="panel-rows">
            {demo.panel.rows.map((row, index) => (
              <li
                key={index}
                className={`row row-${row.tone ?? "done"}`}
                style={{ "--i": demo.chat.length + index * 0.35 } as React.CSSProperties}
              >
                {row.lead !== undefined && <span className="row-lead">{row.lead}</span>}
                <span className="row-main">
                  <b>{row.main}</b>
                  {row.sub && <small dir="auto">{row.sub}</small>}
                </span>
                {row.trail && <span className="row-trail">{row.trail}</span>}
              </li>
            ))}
          </ul>
          {demo.panel.total && (
            <p
              className="panel-total"
              style={{ "--i": demo.chat.length + demo.panel.rows.length * 0.35 } as React.CSSProperties}
            >
              <span>{demo.panel.total[0]}</span>
              <b>{demo.panel.total[1]}</b>
            </p>
          )}
          <p className="panel-caption">{demo.caption}</p>
        </section>
      </div>
      <p className="demo-note">{product.note}</p>
    </div>
  );
}
