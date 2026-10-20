import type { BookingPage } from "./copy";
import { CxTop, Phone, TickPath } from "./Frames";
import { rich } from "./Text";
import "./drawings.css";

// Drawings of the customer's own pages, at true proportions and in the product's words.
// No import of `copy.ts` values, so a client component (the product pages' demo) can draw
// them without shipping the site's copy. Each is a picture: nothing in it is focusable.

/** The booking page (`/b/`) with a service, a day and a time chosen. Its steps are numbered
 * by a CSS counter, so a step a figure leaves out leaves no gap in the count. */
export function BookingScreen({ page }: { page: BookingPage }) {
  return (
    <div className="d-cx">
      <CxTop shop={page.shop} monogram={page.monogram} context={page.context} />
      <div className="d-main">
        <div className="d-hero">
          <span className="d-eyebrow">{page.eyebrow}</span>
          <b className="d-h1">{page.title}</b>
          <span className="d-who-chip">{page.as} <b>{page.customer}</b></span>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done" />{page.steps[0]}</b>
          <div className="d-card">
            {page.services.map((s) => (
              <div key={s.name} className={`d-choice${s.on ? " on" : ""}`}>
                <span className="d-row-text"><b>{s.name}</b><span>{rich(s.meta)}</span></span>
                <span className="d-radio">{s.on && <TickPath />}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done" />{page.steps[1]}</b>
          <div className="d-days">
            {page.days.map((d) => (
              <span key={d.day} className={`d-day${d.on ? " on" : ""}`}>
                <small>{d.top}</small><b>{d.day}</b><span>{d.month}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="d-section">
          <b className="d-h2"><span className="d-step done" />{page.steps[2]}</b>
          <div className="d-times">
            {page.times.map((time) => (
              <span key={time} className={`d-time-slot${time === page.time ? " on" : ""}`} dir="auto">{time}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="d-bar">
        <div className="d-sum"><span>{page.summary[0]}</span><b dir="auto">{page.summary[1]}</b></div>
        <span className="d-btn"><TickPath />{page.confirm}</span>
      </div>
    </div>
  );
}

/** The booking page on the customer's phone. */
export function BookingPhone({ page, className }: { page: BookingPage; className?: string }) {
  return (
    <Phone className={`d-book-phone${className ? ` ${className}` : ""}`}>
      <BookingScreen page={page} />
    </Phone>
  );
}
