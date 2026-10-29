"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, Symbol } from "./brand";
import type { FlowSet, PanelRow } from "./copy";
import { SampleMark } from "./Frames";
import { words } from "./pace";

type Props = {
  flow: FlowSet;
  /** The "Sample" mark at the end of the tab row, and the line said first to screen readers
   * and crawlers (site audit 03, A1). */
  sample: string;
  note: string;
};

const two = (value: number) => String(value).padStart(2, "0");

/**
 * How an ALYR product works, drawn as it happens: a message leaves the customer's phone, passes
 * through WhatsApp, ALYR does its work in the background, the team's screen updates and
 * the reply travels back. Each story is a list of steps from `copy.ts`; the figure shows
 * everything that has happened up to the current one.
 *
 * It opens on a finished frame: the first story's last step, with the customer's chat, ALYR's
 * work and the team's screen all filled (framer-review P5; a figure is judged on its first
 * frame). Once 60% of it is on screen, or its top is past the middle of a short screen, it
 * plays that story forward from its first step, moving on to the next story when one ends.
 * Picking a story keeps it playing but stays on that story; picking a step pauses. With
 * reduced motion nothing plays and nothing travels: it stays on the finished frame, a story
 * picked opens finished too, and the steps are read one tap at a time.
 *
 * Each step dwells as long as it takes to read what it adds to the drawing: its title and
 * the work lines it ticks, at `--read-word` a word, plus `--dwell-beat`, never under
 * `--dwell-min` (site.css, `.fx-progress`; all of it follows `--pace`). The paragraph under
 * the title is for a visitor who pauses or picks a step.
 */
export function FlowDiagram({ flow, sample, note }: Props) {
  const stories = flow.stories;
  const last = (index: number) => stories[index].steps.length - 1;
  // The HTML draws the first story finished; what each step adds arrives once it plays
  // (site audit F2: nothing hidden in the first view).
  const [at, setAt] = useState({ story: 0, step: stories[0].steps.length - 1 });
  const [moved, setMoved] = useState(false);
  const [started, setStarted] = useState(false);
  const begun = useRef(false);
  const begin = () => {
    begun.current = true;
    setStarted(true);
  };
  const [auto, setAuto] = useState(true);
  const [pinned, setPinned] = useState(false);
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
      ([entry]) => {
        setOnScreen(entry.intersectionRatio >= 0.25);
        const enough = entry.intersectionRatio >= 0.6
          || (entry.isIntersecting && entry.boundingClientRect.top < window.innerHeight * 0.5);
        if (!enough || media.matches) return;
        // From the finished frame back to the first step, then forward, once it is read.
        if (begun.current) return;
        begin();
        setMoved(true);
        setAt({ story: 0, step: 0 });
      },
      { threshold: [0, 0.25, 0.6, 1] },
    );
    if (node) watch.observe(node);
    return () => {
      clearTimeout(first);
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", seen);
      watch.disconnect();
    };
  }, []);

  const story = stories[at.story];
  const steps = story.steps;
  const now = steps[at.step];
  const playing = auto && onScreen && shown && !still && started;

  // Everything that has happened so far in this story.
  const past = steps.slice(0, at.step + 1);
  const chat = past.flatMap((step, index) => (step.chat ? [{ ...step.chat, index }] : [])).slice(-3);
  const work = past
    .flatMap((step, index) =>
      (step.work ?? []).map((text, n) => ({ text, key: `${index}-${n}`, fresh: index === at.step })),
    )
    .slice(-6);
  const records: (PanelRow & { id: string })[] = [];
  for (const step of past) {
    if (!step.record) continue;
    const seen = records.findIndex((row) => row.id === step.record?.id);
    if (seen >= 0) records[seen] = step.record;
    else records.push(step.record);
  }

  // The part of the drawing doing the work in this step, and the wire the signal is on.
  const lit = now.move === "out" ? "customer" : now.move === "team" ? "team" : "alyr";
  const phoneWire = now.move === "in" ? "go" : now.move === "out" ? "back" : undefined;
  const teamWire = now.move === "team" ? "go" : now.move === "back" ? "back" : undefined;

  function next() {
    setMoved(true);
    setAt((current) => {
      if (current.step + 1 < stories[current.story].steps.length) {
        return { story: current.story, step: current.step + 1 };
      }
      return { story: pinned ? current.story : (current.story + 1) % stories.length, step: 0 };
    });
  }

  function chooseStory(index: number, focus = false) {
    setPinned(true);
    setMoved(true);
    begin();
    setAt({ story: index, step: still ? last(index) : 0 });
    if (focus) tabs.current[index]?.focus();
  }

  function chooseStep(index: number) {
    setAuto(false);
    setMoved(true);
    begin();
    setAt({ story: at.story, step: index });
  }

  function onKey(event: React.KeyboardEvent) {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
    if (step) {
      event.preventDefault();
      chooseStory((at.story + step + stories.length) % stories.length, true);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      chooseStory(event.key === "Home" ? 0 : stories.length - 1, true);
    }
  }

  return (
    <div className="fx" ref={root} data-playing={playing || undefined} data-moved={moved || undefined}>
      <p className="sr-only">{note}</p>
      <div className="demo-bar" data-nosnippet>
        <div className="demo-tabs" role="tablist" aria-label={flow.tabsLabel} onKeyDown={onKey}>
          {stories.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => { tabs.current[index] = node; }}
              role="tab"
              type="button"
              id={`fx-tab-${item.id}`}
              aria-selected={index === at.story}
              aria-controls="fx-stage"
              tabIndex={index === at.story ? 0 : -1}
              className="demo-tab"
              onClick={() => chooseStory(index)}
            >
              {item.tab}
            </button>
          ))}
        </div>
        {!still && (
          <button type="button" className="demo-toggle" data-paused={auto ? undefined : ""} onClick={() => setAuto(!auto)}>
            <span className={auto ? "demo-pause" : "demo-play"} aria-hidden="true" />
            {auto ? flow.pause : flow.play}
          </button>
        )}
        <SampleMark label={sample} className="fx-sample" />
      </div>

      <div className="fx-stage" id="fx-stage" role="tabpanel" aria-labelledby={`fx-tab-${story.id}`} key={story.id} data-nosnippet>
        <section className="fx-node fx-customer" data-lit={lit === "customer" || undefined} aria-label={flow.customer.name}>
          <header className="fx-head">
            <Icon name="users" className="fx-ico" />
            <span>
              <b>{flow.customer.name}</b>
              {flow.customer.sub && <small>{flow.customer.sub}</small>}
            </span>
          </header>
          <div className="wa wa-mini fx-phone">
            <ol className="wa-thread">
              {chat.map((line) =>
                line.from === "event" ? (
                  <li key={line.index} className="wa-day fx-event"><span>{line.text}</span></li>
                ) : (
                  <li key={line.index} className={`wa-msg wa-tail ${line.from === "customer" ? "wa-out" : "wa-in"}`}>
                    <div className="wa-bubble">
                      <span className="wa-text" dir="auto">{line.text}</span>
                    </div>
                    {line.action && (
                      <div className="wa-cta">
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="ico-flip"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                        {line.action}
                      </div>
                    )}
                  </li>
                ),
              )}
            </ol>
          </div>
        </section>

        {/* The wire to the customer runs through WhatsApp; the signal travels along it. */}
        <div className="fx-link" data-dir={phoneWire} aria-hidden="true">
          <span className="fx-wire" />
          {phoneWire && <span className="fx-signal" key={`${story.id}-${at.step}`} />}
          <span className="fx-station" />
          <span className="fx-via">
            <b>{flow.whatsapp.name}</b>
            {flow.whatsapp.sub && <small>{flow.whatsapp.sub}</small>}
          </span>
        </div>

        <section className="fx-node fx-alyr" data-lit={lit === "alyr" || undefined} aria-label={flow.alyr.name}>
          <header className="fx-head">
            <span className="fx-mark" aria-hidden="true"><Symbol className="fx-symbol" /></span>
            <span>
              <b>{flow.alyr.name}</b>
              {flow.alyr.sub && <small>{flow.alyr.sub}</small>}
            </span>
          </header>
          <ul className="fx-work">
            {work.length === 0 && <li className="fx-idle">{flow.alyr.idle}</li>}
            {work.map((line) => (
              <li key={line.key} data-fresh={line.fresh || undefined}>
                <Icon name="check" className="fx-tick" />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="fx-link fx-link-short" data-dir={teamWire} aria-hidden="true">
          <span className="fx-wire" />
          {teamWire && <span className="fx-signal" key={`${story.id}-${at.step}`} />}
        </div>

        <section className="fx-node fx-team" data-lit={lit === "team" || undefined} aria-label={flow.team.name}>
          <header className="fx-head">
            <Icon name="dashboard" className="fx-ico" />
            <span>
              <b>{flow.team.name}</b>
              {flow.team.sub && <small>{flow.team.sub}</small>}
            </span>
          </header>
          <ul className="fx-records">
            {records.length === 0 && <li className="fx-idle">{flow.team.idle}</li>}
            {records.map((row) => (
              <li key={`${row.id}-${row.trail}`} className={`row row-${row.tone ?? "done"}`}>
                {row.lead !== undefined && <span className="row-lead">{row.lead}</span>}
                <span className="row-main">
                  <b>{row.main}</b>
                  {row.sub && <small dir="auto" className={row.wrap ? "is-wrap" : undefined}>{row.sub}</small>}
                </span>
                {row.trail && <span className="row-trail">{row.trail}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="fx-now" aria-live={playing ? "off" : "polite"} data-nosnippet>
        <span className="fx-count" dir="ltr" aria-hidden="true">{two(at.step + 1)} / {two(steps.length)}</span>
        <div className="fx-say" key={`${story.id}-${at.step}`}>
          <h3>{now.title}</h3>
          <p>{now.body}</p>
        </div>
      </div>

      <ol className="fx-steps" aria-label={flow.stepsLabel} key={`steps-${story.id}`} data-nosnippet>
        {steps.map((step, index) => (
          <li key={index}>
            <button
              type="button"
              className="fx-step"
              aria-current={index === at.step ? "step" : undefined}
              data-done={index < at.step || undefined}
              onClick={() => chooseStep(index)}
            >
              <span className="fx-step-n" aria-hidden="true">{two(index + 1)}</span>
              <span className="fx-step-t">{step.title}</span>
              {index === at.step && playing && (
                <span
                  className="fx-progress"
                  aria-hidden="true"
                  style={{ "--words": words(step.title, ...(step.work ?? [])) } as React.CSSProperties}
                  onAnimationEnd={next}
                />
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
