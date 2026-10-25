"use client";

// ALYR Agent on the public site: the real dashboard (`app/_agent/AgentDashboard`) in its
// showcase mode, fed with the samples captured from the engine, set in a workspace window.
// Beside it, the agent's feed: what ALYR did this afternoon, newest on top, each with its time
// and a Volt tick. Every word arrives as props from `copy.ts`, so no copy is bundled.
//
// The live sample (the founder, 25 Oct 2026; `alyr-design/motion.md`, "The live Agent
// figure"). The one figure on the site that keeps moving, as the workspace does:
// - The HTML is the settled moment, 16:20: the engine's dashboard and the whole feed. Without
//   scripts, with reduced motion, or before the page has loaded, that is what shows.
// - After load, while the figure is on screen and the tab is in view, the sample's script
//   (`samples.*.live`) plays one event every few seconds: the event arrives at the top of the
//   feed and the dashboard's clock and numbers move with it (`live.ts`, in the engine's own
//   words), a changed figure rolling to its new value. At the end it fades back to 16:20 and
//   starts again.
// - It stops when the figure leaves the screen, when the tab is hidden and with reduced
//   motion, and a pause button stops it for good until pressed again (WCAG 2.2.2).
// - Nothing moves the page: the feed's settled list keeps its place (unseen, still read by
//   screen readers), and the live rows above it are placed with transforms.
// The switch (Bakery, Salon, Home services) shows only when scripts run (`.al-js`).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentDashboard, Rich } from "../_agent/AgentDashboard";
import type { AgentView, Rich as RichParts } from "../_agent/types";
import type { AgentFigure as FigureCopy, FeedEvent, SampleKey } from "./copy";
import { SampleMark } from "./Frames";
import { flagLine, liveView } from "./live";
import { SAMPLE_EVENT } from "./ReportSwitch";
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
  /** The "Sample" mark in the window's title bar, for a figure without the sample switch
   * (whose label, "Sample business", already marks the set). */
  sample?: string;
  label: string;
  switcher?: boolean;
  /** The feed beside the window, and with it the live sample. */
  feed?: boolean;
  /** Cropped to its first screen and taken out of the tab order (the homepage hero, whose
   * whole screen is the next section's figure). */
  crop?: boolean;
  headingLevel?: 2 | 3;
  /** Drawn beside the window: the callouts (the homepage's spotlight). */
  aside?: ReactNode;
  /** Opens the rest of the screen (a native `<details>`): on /agent's phone layout after its
   * four numbers (site audit P1-c); in the homepage's spotlight at every width, after Needs
   * you now and the suggestions (framer-review P2). */
  more?: string;
  id?: string;
  /** Tells other figures on the page which sample was picked (`alyr:sample` with this id):
   * /agent's Sunday report follows the switch (ReportSwitch.tsx). */
  sync?: string;
};

/** The pace: one event every 4 s, every 5 s on a phone, where the motion stays lighter. The
 * first comes half a beat after the figure goes live, which is this long after load. */
const BEAT = 4000;
const BEAT_PHONE = 5000;
const AFTER_LOAD = 1500;
const PHONE = "(max-width: 47.99rem)";
const STILL = "(prefers-reduced-motion: reduce)";

// useLayoutEffect warns on the server; the placement only matters in the browser.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A motion token in milliseconds (`--dur-3` and the like), read from the page. */
function token(name: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ms = value.endsWith("ms") ? parseFloat(value) : value.endsWith("s") ? parseFloat(value) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : fallback;
}

type Row = { id: string; event: FeedEvent; flag: RichParts | null; fresh: boolean };

function Tick() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Item({ row }: { row: Row }) {
  const { event, flag } = row;
  return (
    <li className={`af-item${flag ? " is-flag" : ""}${row.fresh ? " is-new" : ""}`}>
      <span className="af-at"><bdi>{event.at}</bdi></span>
      <span className="af-tick"><Tick /></span>
      <span className="af-what">
        <b>{event.title}</b>
        {flag ? (
          <span className="af-line"><Rich parts={flag} /></span>
        ) : (
          event.line && <span className="af-line">{rich(event.line)}</span>
        )}
      </span>
    </li>
  );
}

export function AgentFigure({
  variant, views, order, start, text, sample: mark, label, switcher = false, feed = false, crop = false, sync,
  headingLevel = 2, aside, more, id,
}: Props) {
  const [sample, setSample] = useState<SampleKey>(start ?? order[0]);
  // "still": the settled moment (the HTML); "live": the sample plays.
  const [phase, setPhase] = useState<"still" | "live">("still");
  const [step, setStep] = useState(0);
  // Counts each return to the opening, so its rows are new ones, placed without travelling.
  const [cycle, setCycle] = useState(0);
  // Going back to the opening: "out" while the changed parts fade, "in" while they return.
  const [reset, setReset] = useState<"out" | "in" | null>(null);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  // Read once on the client; the page's markup never depends on it.
  const [shown, setShown] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const [announce, setAnnounce] = useState("");
  const root = useRef<HTMLElement>(null);
  const viewBox = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const liveList = useRef<HTMLOListElement>(null);

  const s = text.samples[sample];
  const base = views[sample]!;
  const script = s.live;
  const live = feed && phase === "live";
  const view = useMemo(() => (live ? liveView(base, script, step) : base), [live, base, script, step]);
  // Every other sentence the summary will show, so the header is as tall as the longest from
  // the first paint (drawn on the server too).
  const room = useMemo(() => {
    if (!feed) return undefined;
    const said = (v: AgentView) => JSON.stringify(v.header.summary);
    const seen = new Set([said(base)]);
    const out: AgentView["header"]["summary"][] = [];
    for (let i = 1; i <= script.length; i++) {
      const v = liveView(base, script, i);
      if (seen.has(said(v))) continue;
      seen.add(said(v));
      out.push(v.header.summary);
    }
    return out;
  }, [feed, base, script]);

  // The settled feed, newest first, as the HTML draws it.
  const opening = useMemo<Row[]>(
    () => s.feed.map((event, index) => ({
      id: `${sample}-o${index}`, event, fresh: false,
      flag: event.flag ? flagLine(base, event.flag) : null,
    })).reverse(),
    [s.feed, sample, base],
  );
  // The live feed: the opening, then each event played so far, newest first; one row more than
  // the feed holds, the one leaving.
  const rows = useMemo<Row[]>(() => {
    if (!live) return opening;
    const played = script.slice(0, step).map((event, index) => ({
      id: `${sample}-${cycle}-${index}`, event, fresh: true,
      flag: event.flag ? flagLine(liveView(base, script, index + 1), event.flag) : null,
    })).reverse();
    const settled = opening.map((row) => ({ ...row, id: `${row.id}-${cycle}` }));
    return [...played, ...settled].slice(0, opening.length + 1);
  }, [live, opening, script, step, sample, cycle, base]);

  // ------------------------------------------------------------ when it may move
  useEffect(() => {
    if (!feed) return;
    const still = window.matchMedia(STILL);
    let timer = 0;
    const go = () => {
      window.clearTimeout(timer);
      if (still.matches) return;
      timer = window.setTimeout(() => setPhase("live"), AFTER_LOAD);
    };
    // Reduced motion, chosen or changed: the settled moment, at once.
    const sync = () => {
      if (still.matches) {
        window.clearTimeout(timer);
        setPhase("still");
        setStep(0);
        setReset(null);
      } else go();
    };
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    still.addEventListener("change", sync);

    const seen = () => setShown(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", seen);

    const watch = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.05)),
      { threshold: [0, 0.05, 0.25] },
    );
    if (root.current) watch.observe(root.current);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", go);
      still.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", seen);
      watch.disconnect();
    };
  }, [feed]);

  const running = live && !paused && onScreen && shown && reset === null;

  // ------------------------------------------------------------------ the beat
  useEffect(() => {
    if (!running) return;
    const beat = window.matchMedia(PHONE).matches ? BEAT_PHONE : BEAT;
    const wait = step === 0 ? beat / 2 : beat;
    const next = window.setTimeout(() => {
      if (step < script.length) setStep(step + 1);
      else setReset("out");
    }, wait);
    return () => window.clearTimeout(next);
  }, [running, step, script.length, sample, cycle]);

  // Back to the opening without a jump: what changed fades out, the opening goes in its place
  // unseen, and fades in; the next event comes a beat later.
  useEffect(() => {
    if (!reset) return;
    const fade = token("--dur-3", 480);
    const next = window.setTimeout(() => {
      if (reset === "out") {
        setStep(0);
        setCycle((c) => c + 1);
        setReset("in");
      } else setReset(null);
    }, reset === "out" ? fade : fade + 50);
    return () => window.clearTimeout(next);
  }, [reset]);

  const choose = (key: SampleKey) => {
    if (key === sample) return;
    setSample(key);
    setStep(0);
    setCycle((c) => c + 1);
    setReset(null);
    setAnnounce(text.samples[key].announce);
    if (sync) window.dispatchEvent(new CustomEvent(SAMPLE_EVENT, { detail: { id: sync, key } }));
  };

  // ------------------------------------------------------- placing the live rows
  // Each live row takes the place of a row of the settled list (the slots): stacked in a
  // column, each under the one above it; in a row of events (the hero between phone and wide
  // screens), in the settled list's own cells. A row that no longer fits fades out.
  useIsoLayoutEffect(() => {
    const sizer = list.current;
    const layer = liveList.current;
    const box = viewBox.current;
    if (!sizer || !layer || !box) return;
    const place = () => {
      const slots = Array.from(sizer.children) as HTMLElement[];
      const items = Array.from(layer.children) as HTMLElement[];
      if (!slots.length) return;
      const column = slots.length < 2 || slots[0].offsetLeft === slots[1].offsetLeft;
      const mask = getComputedStyle(box).maskImage;
      const masked = !!mask && mask !== "none";
      const height = box.clientHeight;
      layer.toggleAttribute("data-column", column);
      const first: HTMLElement[] = [];
      let y = 0;
      for (const [k, item] of items.entries()) {
        // a row just drawn takes its place at once; after that it travels between places
        if (!item.hasAttribute("data-at")) {
          item.style.transition = "none";
          first.push(item);
        }
        const slot = slots[Math.min(k, slots.length - 1)];
        item.style.width = `${column ? sizer.clientWidth : slot.offsetWidth}px`;
        const x = column ? 0 : slot.offsetLeft;
        const top = column ? y : slot.offsetTop;
        if (column) y += item.offsetHeight;
        item.style.translate = `${x}px ${top}px`;
        item.setAttribute("data-at", String(k));
        const out = k >= slots.length || (column && (masked ? top >= height : top + item.offsetHeight > height + 1));
        item.toggleAttribute("data-out", out);
      }
      if (first.length) {
        void layer.offsetHeight;
        for (const item of first) item.style.transition = "";
      }
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(sizer);
    return () => watch.disconnect();
  }, [rows, live]);

  const window_ = (
    <div className={`aw${crop ? " is-crop" : ""}`} inert={crop || undefined}>
      <div className="aw-bar" aria-hidden="true">
        <span className="aw-mono">{s.monogram}</span>
        <b>{s.shop}</b>
        {mark && !switcher && <SampleMark label={mark} />}
        <span className="aw-path">{text.path}</span>
      </div>
      <div className="aw-body">
        <AgentDashboard key={sample} view={view} mode="showcase" headingLevel={headingLevel} headings={false}
          ruleLines={false} labels={{ suggestions: text.suggestions }}
          live={feed ? (reset ? "hush" : "roll") : undefined} summaryRoom={room} />
      </div>
    </div>
  );

  return (
    <figure ref={root} id={id} className={`afig afig-${variant}`} aria-label={label} data-feed={feed || undefined}
      data-live={live || undefined} data-reset={reset ?? undefined}>
      {/* First, before any of the sample's numbers: what this is, for screen readers, search
          and assistants (site audit 03, A1). The eye reads the mark in the title bar. */}
      <figcaption className="sr-only">{s.fictional}</figcaption>
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
      <div className="af-stage" data-nosnippet>
        {variant === "hero" && <span className="af-plate" aria-hidden="true" />}
        {window_}
        {more && (
          <details className="af-more">
            <summary>
              <span>{more}</span>
              <span className="qa-mark" aria-hidden="true" />
            </summary>
          </details>
        )}
        {feed && (
          <div className="af-feed">
            <div className="af-head">
              <p className="af-status">
                <span className="af-dot" aria-hidden="true" />
                <bdi>{text.status}</bdi>
              </p>
              {/* Drawn from the start so nothing moves when it shows; shown only once the
                  sample moves (never without scripts or with reduced motion). */}
              <button type="button" className="af-pause" aria-label={paused ? text.play : text.pause}
                onClick={() => setPaused(!paused)}>
                <span className={paused ? "demo-play" : "demo-pause"} aria-hidden="true" />
              </button>
            </div>
            <div className="af-view" ref={viewBox}>
              {/* The settled feed: the HTML's, and what a screen reader reads. While the sample
                  moves it keeps its place unseen, and the live rows are drawn over it. */}
              <ol className="af-list" aria-label={text.feedLabel} ref={list}>
                {opening.map((row) => <Item key={row.id} row={{ ...row, fresh: false }} />)}
              </ol>
              {live && (
                <ol className="af-list af-live" aria-hidden="true" ref={liveList}>
                  {rows.map((row) => <Item key={row.id} row={row} />)}
                </ol>
              )}
            </div>
          </div>
        )}
        {aside && <div className="af-aside">{aside}</div>}
      </div>
    </figure>
  );
}
