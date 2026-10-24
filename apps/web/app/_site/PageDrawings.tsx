import type { ReactNode } from "react";
import { Icon } from "./brand";
import type { BookingPage } from "./copy";
import type { DocLinkPage } from "./copyDocs";
import type { OrderItem } from "./copyShelf";
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

// ------------------------------------------------------------ the order page (`/s/`)

/** A photo slot with no photo yet: the order page's own blank tile (`Tile` in the product). */
export function PhotoTile({ className }: { className?: string }) {
  return (
    <span className={`d-tile${className ? ` ${className}` : ""}`}>
      <Icon name="image" className="d-tile-glyph" />
    </span>
  );
}

/** One item card, as `ItemCard.tsx` lays it out: the photo, the name, the price, what is
 * true about it, and one control. A sold-out item is greyed, with "Sold out" and no control.
 * `end` replaces the control (the stepper, or the figure's own states). */
export function OrderRow({ item, soldOut, qty, end, className }: {
  item: OrderItem; soldOut: string; qty?: string; end?: ReactNode; className?: string;
}) {
  const out = item.tone === "out";
  return (
    <div className={`d-row d-item${out ? " is-out" : ""}${className ? ` ${className}` : ""}`}>
      <PhotoTile />
      <span className="d-row-text">
        <b>{item.name}</b>
        <span className="d-price">{rich(item.price)}</span>
        {item.note && !out && <span className={`d-pill ${item.tone ?? "when"}`}>{item.note}</span>}
      </span>
      {end ?? (out ? (
        <span className="d-off">{soldOut}</span>
      ) : qty ? (
        <span className="d-stepper" aria-hidden="true">
          <span className="d-step-b"><Icon name="minus" className="ico" /></span>
          <span className="roll">{qty}</span>
          <span className="d-step-b"><Icon name="plus" className="ico" /></span>
        </span>
      ) : (
        <span className="d-add"><Icon name="plus" className="ico" /></span>
      ))}
    </div>
  );
}

// -------------------------------------------------------- a document's page (`/d/`)

/** The page a customer opens from a document's link (`(product)/d/[slug]/page.tsx`): the
 * kind and number, when it was issued, whether it is paid or what cancelled it, its lines,
 * its total and Download PDF. It shows nothing about the customer. */
export function DocLinkScreen({ page }: { page: DocLinkPage }) {
  return (
    <div className="d-cx">
      <CxTop shop={page.shop} monogram={page.monogram} context={page.context} />
      <div className="d-main">
        <div className="d-hero">
          <span className="d-eyebrow">{page.eyebrow}</span>
          <b className="d-h1 d-docno"><bdi dir="ltr">{page.number}</bdi></b>
          <span className="d-issued">{page.issued}</span>
          <span className={`d-doc-status is-${page.tone}`}><span>{rich(page.status)}</span></span>
        </div>
        <div className="d-section">
          <b className="d-h2">{page.linesLabel}</b>
          <div className="d-card">
            {page.lines.map((line) => (
              <div key={line.name} className="d-row d-doc-line">
                <span className="d-row-text"><b>{line.name}</b><span><bdi>{line.meta}</bdi></span></span>
                <bdi className="d-amt">{line.total}</bdi>
              </div>
            ))}
            {page.totals.map((row) => (
              <div key={row.label} className={`d-row d-doc-line${row.strong ? " is-total" : ""}`}>
                <span className="d-row-text"><b>{row.label}</b></span>
                <bdi className="d-amt">{row.value}</bdi>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="d-bar">
        <span className="d-btn is-line"><Icon name="download" className="ico" />{page.download}</span>
      </div>
    </div>
  );
}

/** A document's page on the customer's phone. */
export function DocLinkPhone({ page, className }: { page: DocLinkPage; className?: string }) {
  return (
    <Phone className={`d-doc-phone${className ? ` ${className}` : ""}`}>
      <DocLinkScreen page={page} />
    </Phone>
  );
}
