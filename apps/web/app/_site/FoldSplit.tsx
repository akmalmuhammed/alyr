"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

type Props = {
  /** The group's name, the two sides' names, the slider's name, and its value ("{n}% with ALYR"). */
  label: string;
  today: string;
  with: string;
  slider: string;
  value: string;
  /** The two drawings, server HTML: the owner's chats today, and the same day in ALYR. */
  before: ReactNode;
  after: ReactNode;
};

// Where the fold's middle rests across the drawing, on a wide screen: a little more of the
// day with ALYR than without. A phone is too narrow to read both halves at once, so there
// it rests with the whole day with ALYR, and "Today" wipes back.
const REST = 0.42;
const STEP = 0.05;

/**
 * One business's day, split by the fold (ALY-209). The owner's chats today on one side, the
 * same customers as ALYR keeps them on the other, and a 45° fold between them that can be
 * dragged, moved with the arrow keys, or sent to either side with its two buttons. The
 * first time the drawing is read, the fold sweeps across it once, from today to its
 * resting place, and the unread count climbs as it goes.
 *
 * `p` is where the middle of the fold stands across the drawing, 0 at the start edge and 1
 * at the end. The line is at 45°, so it clears the drawing entirely only half the
 * drawing's height beyond either edge: those are the two ends (`ends`). The geometry is
 * CSS (room.css, `.split`); this only moves `--p`. The drawings are pictures (aria-hidden):
 * the lists under them say the same in words.
 */
export function FoldSplit({ label, today, with: withAlyr, slider, value, before, after }: Props) {
  const [p, setP] = useState(REST);
  const [ends, setEnds] = useState({ lo: 0, hi: 1 });
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const dragging = useRef(false);

  useEffect(() => {
    const node = root.current;
    const box = view.current;
    if (!node || !box) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 47.99rem)");
    const panel = node.closest<HTMLElement>("[role='tabpanel']");
    const counter = node.querySelector<HTMLElement>("[data-unread]");
    let swept = false;
    let frame = 0;
    const timers: number[] = [];
    const measure = () => {
      const reach = box.clientHeight / 2 / Math.max(1, box.clientWidth);
      return { lo: -reach, hi: 1 + reach };
    };
    const rest = () => (narrow.matches ? measure().lo : REST);
    setEnds(measure());
    const resize = new ResizeObserver(() => setEnds(measure()));
    resize.observe(box);

    // A drawing not yet on screen waits with the whole day still "today"; one already on
    // screen simply rests.
    if (!still && node.getBoundingClientRect().top > window.innerHeight * 0.5) {
      setP(measure().hi);
      node.dataset.wait = "";
    } else {
      swept = true;
      setP(rest());
    }

    function sweep() {
      if (swept || touched.current) return;
      swept = true;
      delete node!.dataset.wait;
      const from = measure().hi;
      const to = rest();
      const start = performance.now();
      const run = (now: number) => {
        const t = Math.min(1, (now - start) / 1600);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        if (!touched.current) setP(from + (to - from) * eased);
        if (t < 1 && !touched.current) frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
      // the unread count climbs while the fold is still crossing
      const total = Number(counter?.dataset.unread ?? 0);
      if (counter && total) {
        [0.28, 0.63, 1].forEach((share, index) => {
          timers.push(window.setTimeout(() => { counter.textContent = String(Math.round(total * share)); }, index * 380));
        });
      }
    }

    // Read once: on screen, and its business the one chosen.
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (!panel || panel.classList.contains("is-on"))) sweep();
      },
      { threshold: 0.55 },
    );
    seen.observe(node);
    // A business chosen later sweeps when its tab opens, if it is on screen by then.
    const chosen = new MutationObserver(() => {
      if (!panel?.classList.contains("is-on") || swept) return;
      const frameBox = node.getBoundingClientRect();
      if (frameBox.top < window.innerHeight && frameBox.bottom > 0) sweep();
    });
    if (panel) chosen.observe(panel, { attributes: true, attributeFilter: ["class"] });

    return () => {
      seen.disconnect();
      chosen.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const rtl = () => (root.current ? getComputedStyle(root.current).direction === "rtl" : false);
  const clamp = (value: number) => Math.min(ends.hi, Math.max(ends.lo, value));

  function hold() {
    touched.current = true;
    if (root.current) delete root.current.dataset.wait;
  }

  // The fold's middle follows the pointer across the drawing.
  function follow(event: PointerEvent) {
    const box = view.current?.getBoundingClientRect();
    if (!box) return;
    const along = rtl() ? box.right - event.clientX : event.clientX - box.left;
    setP(clamp(along / box.width));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    hold();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    follow(event);
  }

  function onKey(event: KeyboardEvent) {
    const flip = rtl() ? -1 : 1;
    const moves: Record<string, number> = {
      ArrowRight: STEP * flip, ArrowLeft: -STEP * flip, ArrowUp: STEP, ArrowDown: -STEP,
      PageUp: STEP * 4, PageDown: -STEP * 4,
    };
    let next: number | undefined;
    if (event.key in moves) next = p + moves[event.key];
    else if (event.key === "Home") next = ends.lo;
    else if (event.key === "End") next = ends.hi;
    if (next === undefined) return;
    event.preventDefault();
    hold();
    setP(clamp(next));
  }

  function go(to: number) {
    hold();
    if (root.current) root.current.dataset.glide = "";
    setP(to);
    window.setTimeout(() => { if (root.current) delete root.current.dataset.glide; }, 700);
  }

  // How far across its travel the fold stands, and so how much of the day is with ALYR.
  const across = (p - ends.lo) / (ends.hi - ends.lo);
  const share = Math.round((1 - across) * 100);
  return (
    <div className="split" ref={root} role="group" aria-label={label} style={{ "--p": p } as CSSProperties}>
      <div
        className="split-view"
        ref={view}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dragging.current && follow(event)}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        <div className="split-before" aria-hidden="true">{before}</div>
        <div className="split-after" aria-hidden="true">{after}</div>
        <span className="split-fold" aria-hidden="true" />
        <span
          className="split-handle"
          role="slider"
          tabIndex={0}
          aria-label={slider}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(across * 100)}
          aria-valuetext={value.replace("{n}", String(share))}
          onKeyDown={onKey}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></svg>
        </span>
        <button type="button" className="split-go split-go-before" aria-pressed={p >= ends.hi - 0.01} onClick={() => go(ends.hi)}>{today}</button>
        <button type="button" className="split-go split-go-after" aria-pressed={p <= ends.lo + 0.01} onClick={() => go(ends.lo)}>{withAlyr}</button>
      </div>
    </div>
  );
}
