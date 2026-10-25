import { copy, type Caption, type Locale, type SampleKey } from "./copy";
import { CxTop, TickPath } from "./Frames";
import type { ReportWords } from "./ReportPhone";
import { rich } from "./Text";
import "./drawings.css";

// Drawings of real ALYR screens for the public pages, at true proportions and in the
// product's own wording, for fictional businesses. Each is a picture, not a working
// screen: nothing in here is focusable, and each figure is marked as a sample once.
// Styles are in drawings.css under `.d-*`.

type Track = (typeof copy)["en"]["home"]["sample"];

/** "What it shows · SAMPLE", on a hairline ending in a tick: only for a drawing that means
 * nothing without its words (the trust pair, the no-CR foot, the agreement). Every other
 * drawing carries the "Sample" mark in its own chrome instead (SampleMark). Put it first in
 * the figure, so screen readers and crawlers meet the sample word before the drawing; the
 * figure's `fig-cap-end` class shows it underneath. */
export function FigCaption({ locale, caption, className }: {
  locale: Locale; caption: Caption; className?: string;
}) {
  const f = copy[locale].fig;
  return (
    <figcaption className={`cap${className ? ` ${className}` : ""}`}>
      <span>{rich(caption.text)}</span>
      <span className="cap-sep" aria-hidden="true">·</span>
      <span>{f.sample}</span>
    </figcaption>
  );
}

/** The order tracking page (`/t/`). */
export function TrackScreen({ sample, lang }: { sample: Track; lang: Locale }) {
  const t = sample.track;
  return (
    <div className="d-cx" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <CxTop shop={sample.shop} monogram={sample.monogram} context={t.context} />
      <div className="d-main">
        <div className="d-hero">
          <span className="d-eyebrow">{t.eyebrow}</span>
          <b className="d-h1">{rich(t.title)}</b>
          <span className="d-status">{t.status}</span>
        </div>
        <ol className="d-card d-track">
          {t.steps.map((step) => (
            <li key={step.label} className={`${step.reached ? "reached" : ""}${step.now ? " now" : ""}`}>
              <span className="d-node">{step.reached && <TickPath />}</span>
              <span className="d-track-text"><b>{step.label}</b><span>{step.at}</span></span>
            </li>
          ))}
        </ol>
        <div className="d-card d-person">
          <span className="d-avatar-lg">{t.person.name.slice(0, 1)}</span>
          <p><b>{t.person.name}</b>{t.person.rest}</p>
        </div>
        <p className="d-note">{t.updates}</p>
      </div>
    </div>
  );
}

/** The words around the Sunday report's message (ReportPhone), for each sample. */
export function reportWords(locale: Locale): Record<SampleKey, ReportWords> {
  const r = copy[locale].report;
  const samples = copy[locale].agent.samples;
  const words = (key: SampleKey): ReportWords => ({
    meta: r.meta, day: r.day, time: r.time, alt: r.alt[key], monogram: samples[key].monogram,
  });
  return { bakery: words("bakery"), salon: words("salon"), homeservices: words("homeservices") };
}
