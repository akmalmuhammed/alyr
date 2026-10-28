"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatScene, Copy } from "./copy";
import "./xray.css";

type Inside = Copy["product"]["inside"];
/** The drawn phone's words; `note` says first, to screen readers and crawlers, that the
 * business is fictional (its header says "Sample business" for the eye). */
type Phone = { business: string; businessMeta: string; avatar?: string; today: string; typeHere: string; note: string };

// The three groups, in order, and what the drawing shows for each: the customer's phone;
// the team's workspace behind it; the phone in X-ray, with the message's path through ALYR.
const LAYERS = ["phone", "team", "xray"] as const;

/**
 * ALYR Chat's "Everything it does today" as the phone with X-ray (ALY-209). The features are
 * the list they always were; the drawing beside it shows the one being read. Reading down
 * the list (the item crossing the middle of the screen, or under the pinned phone on a
 * phone) or pressing a feature's name shows it.
 *
 * - For your customers: the customer's own WhatsApp, the feature as they meet it.
 * - For your team: the team's workspace comes in behind the phone, with what it records.
 * - Behind the scenes: the phone turns to X-ray, the fold sweeps across it once, and the
 *   message's path through ALYR is drawn with what ALYR checked on the way.
 *
 * Without scripts the list is the three columns it was and no drawing is shown
 * (xray.css). With reduced motion each scene is drawn finished, with no travel.
 */
export function ChatXray({ inside, phone }: { inside: Inside; phone: Phone }) {
  const [on, setOn] = useState("0-0");
  const root = useRef<HTMLDivElement>(null);
  // a feature chosen by its button holds for a moment against a scroll still settling
  const chosenAt = useRef(0);
  const [group, item] = on.split("-").map(Number);
  const layer = LAYERS[group] ?? "phone";
  const scene: ChatScene = inside.groups[group].items[item].scene;

  // The feature being read: the one crossing the reading line, which sits at the middle of
  // a wide screen and just under the pinned phone on a narrow one.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const narrow = window.matchMedia("(max-width: 61.99rem)");
    let watch: IntersectionObserver | null = null;
    const start = () => {
      watch?.disconnect();
      watch = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const key = (entry.target as HTMLElement).dataset.k;
            if (entry.isIntersecting && key && performance.now() - chosenAt.current > 1000) setOn(key);
          }
        },
        { rootMargin: narrow.matches ? "-72% 0px -26% 0px" : "-48% 0px -50% 0px" },
      );
      node.querySelectorAll(".xr-item").forEach((li) => watch!.observe(li));
    };
    start();
    narrow.addEventListener("change", start);
    node.classList.add("is-live");
    return () => {
      watch?.disconnect();
      narrow.removeEventListener("change", start);
    };
  }, []);

  return (
    <div className="xr" ref={root} data-layer={layer}>
      <div className="xr-list">
        {inside.groups.map((g, gi) => (
          <div key={g.name} className="xr-group" data-layer={LAYERS[gi]}>
            <h3 className="inside-name">
              <span className="signal" aria-hidden="true" />
              {g.name}
            </h3>
            <ul className="inside-list">
              {g.items.map((it, ii) => {
                const key = `${gi}-${ii}`;
                return (
                  <li key={it.title} className={`xr-item${key === on ? " is-on" : ""}`} data-k={key}>
                    <h4>
                      <button type="button" className="xr-show" aria-pressed={key === on} onClick={() => { chosenAt.current = performance.now(); setOn(key); }}>
                        {it.title}
                      </button>
                    </h4>
                    <p>{it.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="xr-pin">
        <p className="sr-only">{phone.note}</p>
        <div className="xr-stage" aria-hidden="true" data-nosnippet>
          {/* the team's screen, behind the phone */}
          <div className="xr-desk">
            <div className="xr-desk-top"><b>{inside.xray.inbox}</b></div>
            <Side rows={layer === "team" ? scene.side : undefined} />
          </div>
          {/* the message's path, beside the phone in X-ray */}
          <div className="xr-path">
            <ol className="xr-nodes">
              {inside.xray.path.map((node, index) => (
                <li key={node} className={`xr-node xr-node-${index}`}>
                  <span className="xr-dot" />
                  <b>{node}</b>
                  {index === 0 && (
                    <div className="xr-checks">
                      <span className="xr-checks-k">{inside.xray.checks}</span>
                      <Side rows={layer === "xray" ? scene.side : undefined} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <span className="xr-pulse" key={on} />
          </div>
          <div className="xr-phone">
            <div className="wa">
              <header className="wa-top">
                <svg className="wa-back ico-flip" viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" /></svg>
                <span className="wa-avatar">{phone.avatar ?? phone.business.slice(0, 1)}</span>
                <span className="wa-who">
                  <b>{phone.business}</b>
                  <small>{phone.businessMeta}</small>
                </span>
              </header>
              <ol className="wa-thread" key={on}>
                <li className="wa-day"><span>{phone.today}</span></li>
                {scene.chat.map((line, index) => {
                  const style = { "--i": index } as React.CSSProperties;
                  if (line.from === "event") {
                    return <li key={index} className="wa-day xr-event" style={style}><span dir="auto">{line.text}</span></li>;
                  }
                  const mine = line.from === "customer";
                  const tail = index === 0 || (scene.chat[index - 1].from === "customer") !== mine;
                  return (
                    <li key={index} className={`wa-msg ${mine ? "wa-out" : "wa-in"} ${tail ? "wa-tail" : ""}`} style={style}>
                      <div className="wa-bubble">
                        <span className="wa-text" dir="auto">{line.text}</span>
                        <span className="wa-meta">
                          {line.at && <span dir="ltr">{line.at}</span>}
                          {line.state && <State state={line.state} />}
                        </span>
                      </div>
                      {line.action && (
                        <div className="wa-cta">
                          <svg viewBox="0 0 24 24" className="ico-flip"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                          <span dir="auto">{line.action}</span>
                        </div>
                      )}
                      {line.test && <span className="xr-test">{inside.xray.test}</span>}
                    </li>
                  );
                })}
              </ol>
              <footer className="wa-bar">
                <span className="wa-input"><span>{phone.typeHere}</span></span>
                <span className="wa-mic">
                  <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" /><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" /></svg>
                </span>
              </footer>
            </div>
            <span className="xr-sweep" key={layer === "xray" ? on : "off"} />
          </div>
        </div>
        <p className="xr-cap">{inside.xray.caption}</p>
      </div>
    </div>
  );
}

/** What the team's screen or ALYR records beside the chat: one line each, its state at the end. */
function Side({ rows }: { rows?: ChatScene["side"] }) {
  return (
    <ul className="xr-side">
      {(rows ?? []).map((row, index) => (
        <li key={row.main} className={`xr-row is-${row.tone ?? "ok"}`} style={{ "--i": index } as React.CSSProperties}>
          <span className="xr-row-t">
            <b dir="auto">{row.main}</b>
            {row.sub && <small dir="auto">{row.sub}</small>}
          </span>
          {row.trail && <span className="xr-row-s" dir="auto">{row.trail}</span>}
        </li>
      ))}
    </ul>
  );
}

/** A message's ticks as ALYR records them, seen only in X-ray: waiting (a clock that turns
 * into a tick once sent), sent, or read. */
function State({ state }: { state: "wait" | "sent" | "read" }) {
  return (
    <span className={`xr-state is-${state}`}>
      {state === "wait" && (
        <svg className="xr-clock" viewBox="0 0 18 12"><circle cx="9" cy="6" r="4.6" /><path d="M9 3.6V6l1.6 1.2" /></svg>
      )}
      <svg className="wa-ticks" viewBox="0 0 18 12">
        <path d="M1 6.5 4.2 9.7 10.6 2.3" />
        {state === "read" && <path d="M7.2 9.7 13.6 2.3" transform="translate(3.4 0)" />}
      </svg>
    </span>
  );
}
