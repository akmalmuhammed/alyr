"use client";

// ALYR Agent on the public site: the real dashboard (`app/_agent/AgentDashboard`) in its
// showcase mode, fed with the samples captured from the engine, set in a workspace window.
// Beside it, the agent's feed: what ALYR did this afternoon, one thing at a time, each with
// its time and a Volt tick, while the dashboard's "Done for you" count steps up with each
// (07-site-brief.md §1). Every word arrives as props from `copy.ts`, so no copy is bundled.
//
// - The static HTML has the "Done for you" count as it stood before the feed's events, so
//   the count only ever goes up: the feed then plays and each event adds to it.
// - Without JavaScript: the dashboard of the first sample, and the whole feed, composed.
// - With reduced motion, or once the 4 s failsafe has removed `motion`: the same, composed,
//   and the count at its final value.
// - Otherwise the feed waits until the figure is on screen, then plays once (under 5 s, so
//   it needs no pause control), and again whenever the visitor picks another sample.
// - The newest event is on top. Events are drawn newest first and the list slides down by
//   one event as each arrives (a transform, so nothing around it moves).
// The switch (Bakery, Salon, Home services) shows only when scripts run (`.al-js`).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AgentDashboard, Rich } from "../_agent/AgentDashboard";
import type { AgentView, Rich as RichParts } from "../_agent/types";
import type { AgentFigure as FigureCopy, Caption, FeedEvent, SampleKey } from "./copy";
import { rich } from "./Text";
import "./drawings.css";
import "./agentfig.css";

type Props = {
  variant: "hero" | "spot" | "agent";
  views: Partial<Record<SampleKey, AgentView>>;
  /** The samples the switch offers, in order. */
  order: SampleKey[];
  /** The sample shown first (by default the first in `order`). */
  start?: SampleKey;
  text: FigureCopy;
  figLabel: string;
  caption: Caption;
  label: string;
  switcher?: boolean;
  feed?: boolean;
  /** Cropped to its first screen and taken out of the tab order (the homepage hero, whose
   * whole screen is the next section's figure). */
  crop?: boolean;
  headingLevel?: 2 | 3;
  /** Drawn beside the window: the callouts (the homepage's spotlight). */
  aside?: ReactNode;
  under?: string;
  id?: string;
};

/** The first event arrives no earlier than this after navigation: after the plate, the
 * window and the status chip (home.css), so the hero builds in one order. */
const FIRST_AT = 1200;
const STEP = 700;
/** The status dot lights this long before the first event. */
const LIGHT_LEAD = 400;

// useLayoutEffect warns on the server; the placement only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function count(value: string): number {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

/** The view as it stood before the feed's events still to come: each "Done for you" row
 * that an unshown event counts towards is that many lower. */
function before(view: AgentView, events: FeedEvent[], shown: number): AgentView {
  if (shown >= events.length) return view;
  const minus: Record<string, number> = {};
  for (const event of events.slice(shown)) for (const key of event.adds) minus[key] = (minus[key] ?? 0) + 1;
  return {
    ...view,
    done: {
      ...view.done,
      rows: view.done.rows.map((row) =>
        minus[row.key] ? { ...row, value: (count(row.value) - minus[row.key]).toLocaleString("en-US") } : row,
      ),
    },
  };
}

/** A flag's words, taken from the dashboard itself so the two always agree. */
function flagged(view: AgentView, flag: NonNullable<FeedEvent["flag"]>): { line: RichParts; rule: string } | null {
  if (flag.from === "suggestion") {
    const card = view.suggestions.find((s) => s.key === flag.key);
    return card ? { line: card.title, rule: card.rule } : null;
  }
  const need = view.needs.items.find((n) => n.key === flag.key);
  return need ? { line: [{ b: String(need.count) }, " ", ...need.words], rule: need.rule } : null;
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentFigure({
  variant, views, order, start, text, figLabel, caption, label, switcher = false, feed = false, crop = false,
  headingLevel = 2, aside, under, id,
}: Props) {
  const [sample, setSample] = useState<SampleKey>(start ?? order[0]);
  const [phase, setPhase] = useState<"composed" | "waiting" | "playing">("composed");
  // With a feed, the page is drawn with the count before the feed (see above).
  const [shown, setShown] = useState(feed ? 0 : Number.POSITIVE_INFINITY);
  const [run, setRun] = useState(0);
  const [wait, setWait] = useState(0);
  const [announce, setAnnounce] = useState("");
  const root = useRef<HTMLElement>(null);
  const feedBox = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const timers = useRef<number[]>([]);

  const s = text.samples[sample];
  const events = useMemo(() => (feed ? s.feed : []), [feed, s.feed]);
  const view = views[sample]!;
  const shownView = useMemo(() => before(view, events, shown), [view, events, shown]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // Plays the feed from its first event: the count goes back to where it stood, and each
  // event then arrives in turn. The dashboard is drawn afresh first (its key), so going back
  // is not mistaken for a change worth a tick.
  const play = (length: number, delay: number) => {
    clear();
    setShown(0);
    setRun((r) => r + 1);
    setWait(delay);
    setPhase("playing");
    for (let i = 1; i <= length; i++) {
      timers.current.push(window.setTimeout(() => setShown(i), delay + (i - 1) * STEP));
    }
  };

  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // On hydration the feed plays only while the page still wants motion: once the failsafe
  // has removed it (a slow phone), the composed feed is already on screen and stays.
  const moving = () => document.documentElement.classList.contains("motion") && !still();

  useEffect(() => {
    if (!feed) return;
    if (!moving()) {
      // still: the count goes straight to its final value, beside the composed feed
      const done = window.setTimeout(() => setShown(Number.POSITIVE_INFINITY), 0);
      timers.current.push(done);
      return clear;
    }
    // The feed starts when the feed itself is in view (on a phone it sits under the window,
    // just below "Done for you", which is then in view too).
    const node = feedBox.current ?? root.current;
    const length = events.length;
    // Not on screen yet: the feed waits, hidden, with the count where it stood before it.
    const box = node?.getBoundingClientRect();
    const visible = !!box && box.top < window.innerHeight * 0.85 && box.bottom > 0;
    if (visible) {
      const begin = window.setTimeout(() => play(length, Math.max(300, FIRST_AT - performance.now())), 0);
      timers.current.push(begin);
      return clear;
    }
    const wait = window.setTimeout(() => {
      setShown(0);
      setRun((r) => r + 1);
      setPhase("waiting");
    }, 0);
    timers.current.push(wait);
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        watch.disconnect();
        play(length, 300);
      },
      { threshold: 0.3 },
    );
    if (node) watch.observe(node);
    return () => {
      watch.disconnect();
      clear();
    };
    // Runs once, on hydration; picking a sample plays the feed again from `choose`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (key: SampleKey) => {
    if (key === sample) return;
    setSample(key);
    setAnnounce(text.samples[key].announce);
    // A choice replays the feed whenever motion is allowed, failsafe or not.
    if (feed && !still()) play(text.samples[key].feed.length, 300);
    else {
      clear();
      setShown(Number.POSITIVE_INFINITY);
      setPhase("composed");
    }
  };

  // Newest first: the list is drawn newest at the top and moved up past the events still to
  // come, so the newest one shown sits at the top. In a row of events (the hero between
  // phone and wide screens) every event has its own place and nothing moves.
  useIsoLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const place = () => {
      const items = Array.from(node.children) as HTMLElement[];
      const n = items.length;
      const column = n > 1 && items[0].offsetTop !== items[n - 1].offsetTop;
      let offset = 0;
      if (phase !== "composed" && column && shown < n) {
        const last = items[n - 1];
        offset = shown <= 0 ? last.offsetTop + last.offsetHeight : items[n - shown].offsetTop;
      }
      node.style.translate = offset ? `0 ${-offset}px` : "";
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(node);
    return () => watch.disconnect();
  }, [phase, shown, sample, run]);

  const window_ = (
    <div className={`aw${crop ? " is-crop" : ""}`} inert={crop || undefined}>
      <div className="aw-bar" aria-hidden="true">
        <span className="aw-mono">{s.monogram}</span>
        <b>{s.shop}</b>
        <span className="aw-path">{text.path}</span>
      </div>
      <div className="aw-body">
        <AgentDashboard key={`${sample}-${run}`} view={shownView} mode="showcase" headingLevel={headingLevel} />
      </div>
    </div>
  );

  return (
    <figure ref={root} id={id} className={`afig afig-${variant}`} aria-label={label} data-feed={feed || undefined} data-phase={feed ? phase : undefined}>
      {switcher && (
        <div className="af-switch" role="group" aria-label={text.switchLabel}>
          <span className="af-switch-k" aria-hidden="true">{text.switchLabel}</span>
          <span className="af-switch-row">
            {order.map((key) => (
              <button key={key} type="button" className="af-opt" aria-pressed={key === sample} onClick={() => choose(key)}>
                {text.samples[key].tab}
              </button>
            ))}
          </span>
          <span className="sr-only" aria-live="polite">{announce}</span>
        </div>
      )}
      <div className="af-stage">
        {variant === "hero" && <span className="af-plate" aria-hidden="true" />}
        {window_}
        {feed && (
          <div
            className="af-feed"
            data-phase={phase}
            data-start={shown <= 0 || undefined}
            ref={feedBox}
            style={{ "--af-light": `${wait - LIGHT_LEAD}ms` } as CSSProperties}
          >
            <p className="af-status">
              <span className="af-dot" aria-hidden="true" />
              <bdi>{text.status}</bdi>
            </p>
            <div className="af-view">
            <ol className="af-list" aria-label={text.feedLabel} ref={list}>
              {events.map((event, index) => ({ event, index })).reverse().map(({ event, index }) => {
                const flag = event.flag ? flagged(view, event.flag) : null;
                return (
                  <li
                    key={`${sample}-${index}`}
                    className={`af-item${index < shown ? " is-on" : ""}${flag ? " is-flag" : ""}`}
                    style={{ "--i": index } as CSSProperties}
                  >
                    <span className="af-at"><bdi>{event.at}</bdi></span>
                    <span className="af-tick"><Tick /></span>
                    <span className="af-what">
                      <b>{event.title}</b>
                      {flag ? (
                        <span className="af-line"><Rich parts={flag.line} /></span>
                      ) : (
                        event.line && <span className="af-line">{rich(event.line)}</span>
                      )}
                      {flag && <span className="af-rule">{flag.rule}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            </div>
          </div>
        )}
        {aside && <div className="af-aside">{aside}</div>}
      </div>
      <figcaption className="cap">
        <span className="cap-n">{figLabel} <bdi>{caption.n}</bdi></span>
        <span className="cap-sep" aria-hidden="true">·</span>
        <span>{rich(caption.text)}</span>
        <span className="cap-sep" aria-hidden="true">·</span>
        <span>{s.fictional}</span>
      </figcaption>
      {under && <p className="af-under">{rich(under)}</p>}
    </figure>
  );
}
