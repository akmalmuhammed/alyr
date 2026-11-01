import type { CSSProperties, ReactNode } from "react";
import { Rich } from "../_agent/AgentDashboard";
import { AGENT_LABELS } from "../_agent/labels";
import type { AgentView } from "../_agent/types";
import { copy, type Locale } from "./copy";
import { Phone, SampleMark, TickPath } from "./Frames";
import { LoopToggle } from "./LoopToggle";
import { words } from "./pace";
import { SAMPLES } from "./samples";
import { rich } from "./Text";
import "./drawings.css";
// how.css comes with home.css (one stylesheet for the homepage)

// "How we work with you" as four cards (ALY-226; the founder approved the Framer prototype,
// docs/framer-review/04-triptych-prototype-log.md): check, set up, see and improve, each a
// still Carbon canvas cut at 45° with one small scene from the product for the fictional
// Qirfa Bakery, its title and two lines under it. The last card's words say that we check
// again (ALY-303: the line back to Check and its floating words are gone).
//
// The HTML is every scene's finished state. With motion
// wanted (`.motion`), loops.ts adds `is-in` to a card as it comes into view (staggered
// across a row) and how.css plays its scene from the start: every animation fills
// backwards, so its first frame is the earlier state, and it ends on the finished one. The
// finished scene holds while its new words are read (`--words`), fades, and plays again
// (founder, 26 Oct 2026: motion always on), each card on its own cycle; a hover, focus or
// tap replays a card at once. One Pause control stops all four
// (WCAG 2.2.2); they stop off screen and in a hidden tab too. Without scripts or with
// reduced motion nothing moves and everything is finished.
//
// The numbers on See and Improve come from the engine's bakery sample (`SAMPLES`), in ALYR
// Agent's own labels; the earlier values a scene starts from are derived from them, never
// typed. The cards are one figure set: one "Sample" mark, in Check's window.

/** A step `n` of the scene, as a number of `--stagger` beats after the card starts. */
const at = (n: number) => ({ "--t": n }) as CSSProperties;

/** A box the product ticks: Volt with its tick once the step is true. */
function Box({ t }: { t: number }) {
  return (
    <span className="hw-box" style={at(t)}>
      <span className="hw-fill"><TickPath /></span>
    </span>
  );
}

/** A drawn window: a notch at its top inline-end corner, a hairline along the notch. */
function Win({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`hw-win${className ? ` ${className}` : ""}`}>{children}</div>;
}

/** A value that changes: the earlier ones leave along 45° as the next arrives. Each item is
 * a value and the beat it arrives on; the first is there from the start. */
function Swap({ values }: { values: [string, number][] }) {
  return (
    <span className="hw-swap">
      {values.map(([value, t], index) => {
        const next = values[index + 1];
        const last = index === values.length - 1;
        // an earlier value: in at its beat (none for the first), out at the next one's
        return (
          <span key={value} className={last ? "hw-now" : "hw-was"} style={at(next ? next[1] : t)}>
            <span className={index > 0 ? "hw-in" : undefined} style={at(t)}><bdi>{value}</bdi></span>
          </span>
        );
      })}
    </span>
  );
}

/** "QAR 7,129" / "7,129 ر.ق", as the sample prints its money. */
function money(dirhams: number, unit: string, unitFirst: boolean) {
  const value = Math.round(dirhams / 100).toLocaleString("en-US");
  return unitFirst ? `${unit} ${value}` : `${value} ${unit}`;
}

// ---------------------------------------------------------------- 1. check
function Check({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const s = t.home.how.scenes.check;
  const bakery = t.agent.samples.bakery;
  return (
    <Win className="hw-sheet">
      <div className="aw-bar">
        <span className="aw-mono">{bakery.monogram}</span>
        <b>{bakery.shop}</b>
        <SampleMark label={t.fig.sample} />
      </div>
      <div className="hw-pad">
        <b className="hw-h">{s.title}</b>
        <ul className="hw-rows">
          {s.rows.map((row, index) => (
            <li key={row.what}>
              <Box t={index * 6} />
              <span className="hw-words">
                <span>{row.what}</span>
                <small className="hw-arrive" style={at(index * 6 + 2)}>{rich(row.found)}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Win>
  );
}

// ---------------------------------------------------------------- 2. set up
function Setup({ locale }: { locale: Locale }) {
  const s = copy[locale].home.how.scenes.setup;
  const sub = (n: number) => s.sub.replace("{n}", String(n));
  return (
    <div className="hw-set">
      <Win className="hw-list">
        <div className="hw-pad">
          <span className="hw-k">{s.eyebrow}</span>
          <span className="hw-swap hw-h">
            <span className="hw-was" style={at(6)}>{s.title}</span>
            <span className="hw-now"><span className="hw-in" style={at(7)}>{s.done}</span></span>
          </span>
          <Swap values={[[sub(2), 0], [sub(3), 1]]} />
          <span className="hw-progress"><span style={at(6)} /></span>
          <ul className="hw-rows hw-steps">
            {s.steps.map((step, index) => (
              <li key={step}>
                {index < s.steps.length - 1 ? <span className="hw-box is-on"><span className="hw-fill"><TickPath /></span></span> : <Box t={0} />}
                <span className="hw-words"><span>{step}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </Win>
      <Phone className="hw-phone">
        <div className="hw-orders">
          <span className="hw-orders-top"><b>{s.phone}</b><span className="hw-k">{s.today}</span></span>
          <span className="hw-order hw-arrive" style={at(20)}>
            <span className="hw-wash" style={at(24)} />
            <span className="hw-order-top">
              <b><bdi dir="ltr">{s.order}</bdi> · {rich(s.who)}</b>
              <span className="hw-tag">{s.tag}</span>
            </span>
            <small>{s.what}</small>
          </span>
        </div>
      </Phone>
    </div>
  );
}

// ---------------------------------------------------------------- 3. see
function See({ locale }: { locale: Locale }) {
  const view: AgentView = SAMPLES[locale].bakery;
  const labels = AGENT_LABELS[view.lang];
  const s = copy[locale].home.how.scenes.see;
  const orders = view.kpis.find((kpi) => kpi.key === "orders");
  const waiting = view.needs.items.find((item) => item.key === "waiting");
  const sent = view.done.rows.find((row) => row.key === "sent");
  const others = view.done.rows.filter((row) => row.key !== "sent");
  if (!orders || !waiting || !sent) return null;
  // the earlier values: one order and two messages ago (the order's reply, then the confirmation)
  const less = (value: string, by: number) => String(Number(value.replace(/,/g, "")) - by);
  return (
    <Win className="hw-agent">
      <div className="hw-bar">
        <bdi>{copy[locale].products.items.agent.name}</bdi>
        <span>{view.header.updated}</span>
      </div>
      <div className="hw-pad">
        <span className="hw-kpi">
          <span>{orders.label}</span>
          <b><Swap values={[[less(orders.value, 1), 0], [orders.value, 5]]} /></b>
        </span>
        <span className="hw-k">{labels.needs}</span>
        <ul className="hw-needs">
          <li>
            <b><bdi>{waiting.count}</bdi></b>
            <span className="hw-words"><span><Rich parts={waiting.words} /></span>{waiting.detail && <small><Rich parts={waiting.detail} /></small>}</span>
          </li>
          {/* the row that comes, is ticked as the order is confirmed, and goes: out of the
              flow, folded shut at rest, so the finished screen is the sample's own */}
          <li className="hw-live" style={at(5)}>
            <span className="hw-fold" style={at(40)}>
              <b><bdi>1</bdi></b>
              <span className="hw-words"><span>{s.confirm.words}</span><small>{rich(s.confirm.detail)}</small></span>
              <Box t={35} />
            </span>
          </li>
        </ul>
        <div className="hw-done">
          <span className="hw-k">{labels.done}</span>
          <ul className="hw-ledger">
            <li>
              <b><Swap values={[[less(sent.value, 2), 0], [less(sent.value, 1), 15], [sent.value, 35]]} /></b>
              <span>{sent.label}</span>
              <Box t={15} />
            </li>
            {others.map((row) => (
              <li key={row.key}><b><bdi>{row.value}</bdi></b><span>{row.label}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </Win>
  );
}

// ---------------------------------------------------------------- 4. improve
function Improve({ locale }: { locale: Locale }) {
  const view: AgentView = SAMPLES[locale].bakery;
  const s = copy[locale].home.how.scenes.improve;
  const sales = view.kpis.find((kpi) => kpi.key === "sales");
  const sentence = view.header.summary.find((part) => part.muted);
  if (!sales || !view.week) return null;
  // last week to the same moment: each past day's last week, and today's up to 16:20
  const days = view.week.days.filter((day) => day.state === "past" || day.state === "today");
  const last = days.reduce((sum, day) => sum + ((day.state === "today" ? day.last_by_now : day.last) ?? 0), 0);
  const now = days.reduce((sum, day) => sum + (day.value ?? 0), 0);
  const share = now > 0 ? Math.min(1, last / now) : 0;
  const unit = sales.unit ?? "";
  return (
    <Win className="hw-week">
      <div className="hw-bar">
        <bdi>{copy[locale].products.items.agent.name}</bdi>
        <span>{view.header.when}</span>
      </div>
      <div className="hw-pad">
        {sentence && <b className="hw-sentence hw-arrive" style={at(0)}><Rich parts={sentence.text} /></b>}
        <span className="hw-kpi">
          <span>{sales.label}</span>
          {sales.change && <b className="hw-up hw-arrive" style={at(18)}><Rich parts={sales.change.text} /></b>}
        </span>
        <div className="hw-bars" style={{ "--last": share } as CSSProperties}>
          <span className="hw-col">
            <small><bdi>{money(last, unit, sales.unit_first)}</bdi></small>
            <i className="hw-was-bar" />
          </span>
          <span className="hw-col">
            <small className="hw-arrive" style={at(12)}><bdi>{money(now, unit, sales.unit_first)}</bdi></small>
            <i className="hw-now-bar" style={at(6)} />
          </span>
        </div>
        <span className="hw-legend"><span>{s.last}</span><span>{s.now}</span></span>
        {view.kpi_caption && <small className="hw-cap">{view.kpi_caption}</small>}
      </div>
    </Win>
  );
}

const SCENE = { check: Check, setup: Setup, see: See, improve: Improve } as const;

/** The words a scene adds as it plays, read while its finished state holds before it plays
 * again (`--words`; loopStyle.ts sums the hold with `--read-word`, `--dwell-beat`, `--dwell-min`). */
function sceneWords(key: keyof typeof SCENE, locale: Locale): number {
  const s = copy[locale].home.how.scenes;
  const plain = (parts: { b: string }[] | (string | { b: string })[]) => parts.map((p) => (typeof p === "string" ? p : p.b)).join(" ");
  if (key === "check") return words(...s.check.rows.map((row) => row.found));
  if (key === "setup") return words(s.setup.done, s.setup.sub, s.setup.order, s.setup.who, s.setup.tag, s.setup.what);
  if (key === "see") return words(s.see.confirm.words, s.see.confirm.detail);
  const view = SAMPLES[locale].bakery;
  const sentence = view.header.summary.find((part) => part.muted);
  const sales = view.kpis.find((kpi) => kpi.key === "sales");
  return words(sentence ? plain(sentence.text) : "", sales?.change ? plain(sales.change.text) : "", s.improve.now);
}
const KEYS = ["check", "setup", "see", "improve"] as const;

/** The four cards. */
export function HowCards({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const w = t.home.how;
  return (
    <div className="hw" data-hw data-loop>
      {/* for screen readers and crawlers, before any number: the business is fictional */}
      <p className="sr-only">{t.agent.samples.bakery.fictional}</p>
      <ol className="hw-cards">
        {KEYS.map((key, index) => {
          const Scene = SCENE[key];
          const step = w.steps[index];
          const scene = w.scenes[key];
          return (
            <li key={key} className={`hw-card hw-${key}`} style={{ "--k": index, "--words": sceneWords(key, locale) } as CSSProperties}
              data-hw-card={key} data-loop-play>
              {/* the title first for a screen reader; the canvas is drawn above it (how.css) */}
              <h3 className="hw-title">{rich(step.title)}</h3>
              <p className="hw-body">{rich(step.body)}</p>
              <div className="hw-canvas">
                <div className="hw-scene" inert aria-hidden="true" data-nosnippet>
                  <Scene locale={locale} />
                </div>
                {/* the whole canvas plays its scene again: a tap, a click or the keyboard */}
                <button type="button" className="hw-play" aria-label={scene.replay} aria-describedby={`hw-${key}-say`} data-hw-play />
              </div>
              <p className="sr-only" id={`hw-${key}-say`}>{scene.label}</p>
            </li>
          );
        })}
      </ol>
      <LoopToggle words={t.loop} name={t.loop.names.how} className="hw-toggle" />
    </div>
  );
}
