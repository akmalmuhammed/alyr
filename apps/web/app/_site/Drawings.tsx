import { copy, type Caption, type Locale, type SampleKey } from "./copy";
import type { ReportWords } from "./ReportPhone";
import { rich } from "./Text";
import "./drawings.css";

// Drawings of real ALYR screens for the public pages, at true proportions and in the
// product's own wording, for fictional businesses. Each is a picture, not a working
// screen: nothing in here is focusable, and each figure is marked as a sample once.
// Styles are in drawings.css under `.d-*`.

/** "What it shows · SAMPLE", on a hairline ending in a tick: only for a drawing that means
 * nothing without its words (the no-CR foot, the agreement). Every other
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

/** The words around the Sunday report's message (ReportPhone), for each sample. */
export function reportWords(locale: Locale): Record<SampleKey, ReportWords> {
  const r = copy[locale].report;
  const samples = copy[locale].agent.samples;
  const words = (key: SampleKey): ReportWords => ({
    meta: r.meta, day: r.day, time: r.time, alt: r.alt[key], monogram: samples[key].monogram,
  });
  return { bakery: words("bakery"), salon: words("salon"), homeservices: words("homeservices") };
}
