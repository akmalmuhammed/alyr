import { Rich } from "../_agent/AgentDashboard";
import type { AgentView } from "../_agent/types";
import { copy, type Caption, type Locale, type Report } from "./copy";
import { CxTop, TickPath } from "./Frames";
import { OFFER_LIVE } from "./site";
import { rich } from "./Text";
import "./drawings.css";

// Drawings of real ALYR screens for the public pages, at true proportions and in the
// product's own wording, for fictional businesses. Each is a picture, not a working
// screen: nothing in here is focusable, and each figure says what it shows in its caption.
// Styles are in drawings.css under `.d-*`.

type Track = (typeof copy)["en"]["home"]["sample"];

/** "FIG 01 · what it shows · SAMPLE, FICTIONAL BAKERY", on a hairline ending in a tick.
 * `fictional` names a sample other than the bakery. */
export function FigCaption({ locale, caption, fictional, className }: {
  locale: Locale; caption: Caption; fictional?: string; className?: string;
}) {
  const f = copy[locale].fig;
  const n = OFFER_LIVE && caption.nOffer ? caption.nOffer : caption.n;
  return (
    <figcaption className={`cap${className ? ` ${className}` : ""}`}>
      <span className="cap-n">{f.label} <bdi>{n}</bdi></span>
      <span className="cap-sep" aria-hidden="true">·</span>
      <span>{rich(caption.text)}</span>
      <span className="cap-sep" aria-hidden="true">·</span>
      <span>{fictional ?? f.fictional}</span>
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

/** The weekly report as the owner reads it: one WhatsApp message in the product's words.
 * Lines arrive one by one under `.motion` (home.css), once. */
export function ReportBubble({ report }: { report: Report }) {
  let line = 0;
  return (
    <div className="d-report" aria-hidden="true">
      <p className="d-report-text" dir="auto">
        <span className="d-rl d-report-head" style={{ "--i": line++ } as React.CSSProperties}>{rich(report.heading)}</span>
        <span className="d-rl" style={{ "--i": line++ } as React.CSSProperties}>{report.week}</span>
        {report.sections.map((section) => (
          <span key={section.title} className="d-report-sec">
            <span className="d-rl d-report-title" style={{ "--i": line++ } as React.CSSProperties}>{section.title}</span>
            {section.lines.map((text) => (
              <span key={text} className="d-rl" style={{ "--i": line++ } as React.CSSProperties}>{rich(text)}</span>
            ))}
          </span>
        ))}
        <span className="d-time" dir="auto">{report.time}</span>
      </p>
    </div>
  );
}

// ----------------------------------------------- a corner of each product's screen

type Crops = (typeof copy)["en"]["home"]["suite"]["crops"];

/** ALYR Chat: the bottom of the order page, where the customer pays. */
export function OrderBarCrop({ crops }: { crops: Crops }) {
  return (
    <div className="d-crop d-crop-bar" aria-hidden="true">
      <div className="d-bar">
        <div className="d-sum"><span>{crops.items}</span><b>{rich(crops.total)}</b></div>
        <span className="d-btn"><span>{rich(crops.pay)}</span></span>
      </div>
    </div>
  );
}

/** ALYR Bookings: the free times on the booking page, one chosen. */
export function TimesCrop({ crops }: { crops: Crops }) {
  return (
    <div className="d-crop d-crop-times" aria-hidden="true">
      <div className="d-times">
        {crops.times.map((time) => (
          <span key={time} className={`d-time-slot${time === crops.time ? " on" : ""}`} dir="auto">{time}</span>
        ))}
      </div>
    </div>
  );
}

/** ALYR Agent: the week in one sentence, as the home screen's headline says it. */
export function SummaryCrop({ view }: { view: AgentView }) {
  return (
    <div className="d-crop d-crop-summary" aria-hidden="true" dir={view.dir} lang={view.lang}>
      <span className="d-crop-k">{view.header.when}</span>
      <p className="d-crop-sum">
        {view.header.summary.slice(0, 2).map((s, i) => (
          <span key={i} className={s.muted ? "is-muted" : undefined}>{i > 0 && " "}<Rich parts={s.text} /></span>
        ))}
      </p>
    </div>
  );
}

/** "0–30 days" with its range kept left to right, so Arabic does not read it "30–0". */
function ranges(text: string) {
  return text.split(/(\d+–\d+)/).map((piece, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{piece}</bdi> : piece));
}

/** ALYR Accounts: what is owed, by age. */
export function AgeBarCrop({ view, label }: { view: AgentView; label: string }) {
  const owed = view.owed;
  if (!owed) return null;
  return (
    <div className="d-crop d-crop-owed" aria-hidden="true" dir={view.dir} lang={view.lang}>
      <span className="d-crop-k">{label}</span>
      <b className="d-crop-total"><bdi>{owed.total_text}</bdi></b>
      <span className="d-agebar">
        {owed.segments.map((s, i) => s.share > 0 && <span key={s.key} className={`a${i}`} style={{ flexGrow: s.share }} />)}
      </span>
      <span className="d-agelegend">
        {owed.segments.map((s, i) => (
          <span key={s.key}><i className={`a${i}`} /><span>{ranges(s.label)}</span></span>
        ))}
      </span>
    </div>
  );
}
