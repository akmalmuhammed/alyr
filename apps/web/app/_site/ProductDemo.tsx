"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoSet, Locale } from "./copy";
import { SampleMark, WaDoc } from "./Frames";
import { BookingPhone, DocLinkPhone } from "./PageDrawings";
import { words } from "./pace";

type Props = {
  product: DemoSet;
  locale: Locale;
  /** The "Sample" mark, for a tab that shows the team's screen alone (the phone's header
   * says "Sample business" on the others). */
  sample: string;
  /** What the demo is, said first to screen readers and crawlers (site audit 03, A1). */
  note: string;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** A clock time as WhatsApp shows it: "4:12 PM", or "٤:١٢ م" in Arabic. Formatted by
 * hand so the server and the browser always produce the same text. */
function clock(locale: Locale, minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const text = `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
  if (locale === "ar") {
    return `${text.replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)])} ${hour < 12 ? "ص" : "م"}`;
  }
  return `${text} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * The product, shown as it is used: a conversation on one side and what the team sees
 * on the other. It plays through the jobs by itself while on screen, stops for good the
 * moment the visitor picks a tab, and can be paused. With reduced motion it does not play
 * at all and every message is simply there. Each conversation starts at its own time
 * (`start`), so the times on the messages agree with the panel beside them. A tab with no
 * conversation shows the team's screen alone; a panel with a `page` shows the page the
 * customer opened (the booking page) instead of the team's rows.
 *
 * A tab dwells until its last message or row has arrived and its caption can be read (the
 * caption's words at `--read-word` a word), plus `--dwell-beat`, never under `--dwell-min`
 * (site.css, `.demo-tab-bar`; all of it follows `--pace`).
 */
export function ProductDemo({ product, locale, sample, note }: Props) {
  const demos = product.demos;
  const [active, setActive] = useState(0);
  // The first tab opens finished, as the HTML draws it; messages arrive one by one only once
  // the demo has moved on (site audit F2: nothing hidden in the first view).
  const [moved, setMoved] = useState(false);
  const [auto, setAuto] = useState(true);
  const [onScreen, setOnScreen] = useState(false);
  const [still, setStill] = useState(false);
  // A hidden tab stops it too, as it stops off screen (nothing plays that nobody sees).
  const [shown, setShown] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(media.matches);
    const first = setTimeout(sync, 0);
    media.addEventListener("change", sync);
    const seen = () => setShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", seen);
    const node = root.current;
    const watch = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.35 },
    );
    if (node) watch.observe(node);
    return () => {
      clearTimeout(first);
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", seen);
      watch.disconnect();
    };
  }, []);

  // On a narrow screen the tab row scrolls sideways. Keep the selected tab in view
  // without moving the page itself.
  useEffect(() => {
    const tab = tabs.current[active];
    const row = tab?.parentElement;
    if (!tab || !row || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: tab.offsetLeft - row.offsetLeft - 8, behavior: "smooth" });
  }, [active]);

  const playing = auto && onScreen && shown && !still;
  const demo = demos[active];
  // The `--i` of the last thing to arrive (messages count 1 each, rows 0.35, then the total).
  const last = demo.panel.total
    ? demo.chat.length + demo.panel.rows.length * 0.35
    : demo.panel.rows.length > 0
      ? demo.chat.length + (demo.panel.rows.length - 1) * 0.35
      : Math.max(0, demo.chat.length - 1);

  function choose(index: number, focus = false) {
    setAuto(false);
    setMoved(true);
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
    <div className="demo" ref={root} data-playing={playing || undefined} data-moved={moved || undefined}>
      <p className="sr-only">{note}</p>
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
              {item.tab}
              {index === active && playing && (
                <span
                  className="demo-tab-bar"
                  aria-hidden="true"
                  style={{ "--words": words(demo.caption), "--last": moved ? last : 0 } as React.CSSProperties}
                  onAnimationEnd={() => {
                    setMoved(true);
                    setActive((active + 1) % demos.length);
                  }}
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
        className={`demo-stage${demo.chat.length === 0 ? " is-panel" : ""}`}
        id="demo-stage"
        role="tabpanel"
        aria-labelledby={`demo-tab-${demo.id}`}
        key={demo.id}
        data-nosnippet
      >
        {/* The customer's own phone, drawn to look like the WhatsApp chat they already use:
            their messages on the sending side, the business's replies on the other. */}
        {demo.chat.length > 0 && (
        <section className="phone" aria-label={product.business}>
          <div className="wa">
            <header className="wa-top">
              <svg className="wa-back ico-flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
              <span className="wa-avatar" aria-hidden="true">{product.avatar ?? product.business.slice(0, 1)}</span>
              <span className="wa-who">
                <b>{product.business}</b>
                <small aria-hidden="true">{product.businessMeta}</small>
              </span>
              <svg className="wa-act wa-video" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
              <svg className="wa-act" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
              <svg className="wa-act" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
            </header>

            <ol className="wa-thread">
              <li className="wa-day"><span>{product.today}</span></li>
              {demo.chat.map((line, index) => {
                // something the customer did on a page, not a message: a chip, as WhatsApp marks a day
                if (line.from === "event") {
                  return (
                    <li key={index} className="wa-day fx-event" style={{ "--i": index } as React.CSSProperties}>
                      <span dir="auto">{line.text}</span>
                    </li>
                  );
                }
                const mine = line.from === "customer";
                const tail = index === 0 || (demo.chat[index - 1].from === "customer") !== mine;
                return (
                  <li
                    key={index}
                    className={`wa-msg ${mine ? "wa-out" : "wa-in"} ${tail ? "wa-tail" : ""}`}
                    style={{ "--i": index } as React.CSSProperties}
                  >
                    <div className={`wa-bubble${line.doc ? " has-doc" : ""}`}>
                      {line.doc && <WaDoc name={line.doc.name} meta={line.doc.meta} />}
                      <span className="wa-text" dir="auto">{line.text}</span>
                      <span className="wa-meta">
                        <span dir="ltr">{clock(locale, line.at ?? demo.start + index * 2)}</span>
                        {mine && (
                          <svg className="wa-ticks" viewBox="0 0 18 12" aria-hidden="true">
                            <path d="M1 6.5 4.2 9.7 10.6 2.3" />
                            <path d="M7.2 9.7 13.6 2.3" transform="translate(3.4 0)" />
                          </svg>
                        )}
                      </span>
                    </div>
                    {[...(line.action ? [line.action] : []), ...(line.actions ?? [])].map((action) => (
                      <div key={action} className="wa-cta">
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="ico-flip"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                        {action}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ol>

            <footer className="wa-bar" aria-hidden="true">
              <span className="wa-input">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0" /><path d="M9 10h.01M15 10h.01" /></svg>
                <span>{product.typeHere}</span>
                <svg viewBox="0 0 24 24"><path d="m16.5 6.5-7.4 7.4a2 2 0 0 0 2.8 2.8l7.8-7.8a4 4 0 0 0-5.7-5.7l-8 8a6 6 0 0 0 8.5 8.5l7-7" /></svg>
                <svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>
              </span>
              <span className="wa-mic">
                <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" /></svg>
              </span>
            </footer>
          </div>
        </section>
        )}

        <section className="panel" aria-label={demo.panel.kicker ?? product.workspace}>
          <header className="panel-top">
            <span className="panel-kicker">{demo.panel.kicker ?? product.workspace}</span>
            <b>{demo.panel.title}</b>
            <span className="panel-badge">{demo.panel.badge}</span>
            {demo.chat.length === 0 && <SampleMark label={sample} />}
          </header>
          {demo.panel.page && (
            <div className="panel-page">
              <BookingPhone page={demo.panel.page} className="panel-phone" />
            </div>
          )}
          {demo.panel.doc && (
            <div className="panel-page">
              <DocLinkPhone page={demo.panel.doc} className="panel-phone" />
            </div>
          )}
          {demo.panel.rows.length > 0 && (
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
                  {row.sub && <small dir="auto" className={row.wrap ? "is-wrap" : undefined}>{row.sub}</small>}
                </span>
                {row.trail && <span className="row-trail">{row.trail}</span>}
                {row.acts && (
                  <span className="row-acts">
                    {row.acts.map((act) => <span key={act} className="row-act">{act}</span>)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          )}
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
    </div>
  );
}

