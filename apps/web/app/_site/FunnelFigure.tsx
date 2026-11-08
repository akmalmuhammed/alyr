import type { CSSProperties } from "react";
import { copy, type Locale } from "./copy";
import { SampleMark } from "./Frames";
import { rich } from "./Text";
// funnel.css comes with home.css (one stylesheet for the homepage)

// The hero's figure (ALY-330, D-156): one enquiry followed through the four stages, as four
// small cards of the fictional Qirfa Bakery's own screens on one Carbon plate, joined by one
// line. A card with a dashed edge is a step our team does by hand; a solid card is a screen
// that runs today (the design system's solid and dashed rules). The HTML is the finished
// figure: the line is drawn and the last station is Volt. With motion wanted (`.motion`) the
// stations rise along the line once and the line draws; with reduced motion or no scripts
// nothing moves. Every word comes from `copy.ts` (copyHome.ts).

const n = (index: number) => ({ "--i": index }) as CSSProperties;

export function FunnelFigure({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const f = t.home.funnel;
  return (
    <figure className="fn" aria-label={f.label}>
      <div className="fn-plate">
        <div className="fn-bar">
          <b>{rich(f.shop)}</b>
          <span className="fn-sub">{f.sub}</span>
          <SampleMark label={t.fig.sample} />
        </div>
        <ol className="fn-track">
          {f.stations.map((s, index) => (
            <li key={s.key} className={`fn-st${s.team ? " is-team" : ""}`} style={n(index)}>
              <span className="fn-head">
                <span className="fn-n" aria-hidden="true">{`0${index + 1}`}</span>
                <span className="fn-name">{s.name}</span>
              </span>
              <span className="fn-card">
                <small>{rich(s.card[0])}</small>
                <b>{rich(s.card[1])}</b>
                <small>{rich(s.card[2])}</small>
              </span>
              <span className="fn-line">{s.line}</span>
              <span className="fn-tag">
                <i className="fn-dot" aria-hidden="true" />
                <span>{rich(s.tag)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
