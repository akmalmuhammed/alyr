// ALYR's own records as an annotated chart: orders and bookings per weekday over the last 4 weeks,
// one sentence stating the point, the busiest weekday marked (the one Volt signal of the chart),
// and where the counts came from and when they were read. Drawn on This week (a section, or inside
// an hours ask's ticket) and in the Why sheet. With nothing counted it says so plainly over an
// empty axis; with orders and bookings not taken through ALYR it says that instead. Saturday
// first; in Arabic the grid follows the direction, so time runs right to left.

import type { CSSProperties } from "react";
import { Mark } from "../shellParts";
import { T, type D2Lang } from "./copy";
import { T3 } from "./copy3";
import { Say, day, dayTime } from "./parts";
import type { OwnRecordsView } from "./ownLogic";
import { DAYS } from "../discoveryApi";

/** The one sentence the chart makes, or the empty state's title. */
export function ownPoint(view: OwnRecordsView, lang: D2Lang): string {
  const t = T3[lang];
  if (view.state === "off") return t.ownOffTitle;
  if (view.state === "empty") return t.ownEmptyTitle;
  return view.quiet.length
    ? t.pointQuiet(view.quiet, view.busiest, view.orders, view.bookings, view.weeks)
    : t.pointAll(view.what, view.busiest, view.orders, view.bookings, view.weeks);
}

export function OwnSource({ view, lang }: { view: OwnRecordsView; lang: D2Lang }) {
  if (view.state === "off" || !view.readAt) return null;
  return (
    <span className="d2-own-src">
      <span className="d2-own-src-mk" aria-hidden="true"><Mark /></span>
      <Say lang={lang}>{T3[lang].ownSource(view.source, dayTime(view.readAt, lang))}</Say>
    </span>
  );
}

export function OwnChart({ view, lang, compact = false }: { view: OwnRecordsView; lang: D2Lang; compact?: boolean }) {
  const t = T3[lang];
  const t1 = T[lang];
  if (view.state === "off") return null;
  const point = ownPoint(view, lang);
  const days = view.state === "content" ? view.weekdays : DAYS.map((d) => ({ day: d, orders: null, bookings: null, total: 0, share: 0 }));
  const both = view.state === "content" && view.what === "both";
  const label = view.state === "content" ? `${point} ${days.map((d) => t.dayAria(d.day, d.orders, d.bookings)).join("; ")}.` : point;
  return (
    <figure className={`d2-own-chart${compact ? " d2-own-compact" : ""}${view.state === "empty" ? " d2-own-none" : ""}`} role="img" aria-label={label}>
      {view.state === "content" ? (
        <div className="d2-own-key" aria-hidden="true">
          {view.what !== "bookings" ? <span><i className="d2-key-o" />{t1.orders}</span> : null}
          {view.what !== "orders" ? <span><i className="d2-key-b" />{t1.bookings}</span> : null}
        </div>
      ) : null}
      <div className="d2-own-plot" aria-hidden="true">
        {days.map((d) => (
          <div className="d2-own-col" key={d.day} data-busiest={view.state === "content" && view.busiest === d.day ? "" : undefined}>
            {d.total > 0 ? <span className="d2-own-v"><bdi dir="ltr">{both ? t.barValue(d.orders, d.bookings) : d.total.toLocaleString("en")}</bdi></span> : null}
            <div className="d2-own-bar" style={{ "--d2-f": d.share } as CSSProperties}>
              {d.total > 0 && d.orders ? <i className="d2-bar-o" style={{ flexGrow: d.orders }} /> : null}
              {d.total > 0 && d.bookings ? <i className="d2-bar-b" style={{ flexGrow: d.bookings }} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="d2-own-x" aria-hidden="true">
        {days.map((d) => (
          <span key={d.day} data-busiest={view.state === "content" && view.busiest === d.day ? "" : undefined}>
            {t.dayShort(d.day)}
            {view.state === "content" && view.busiest === d.day ? <b>{t.busiest}</b> : null}
          </span>
        ))}
      </div>
      {view.state === "empty" ? <figcaption className="d2-own-empty">{compact ? null : <><b>{t.ownEmptyTitle}</b> </>}<span>{t.ownEmptyBody}</span></figcaption> : null}
    </figure>
  );
}

/** The section on This week. */
export function OwnRecords({ view, lang }: { view: OwnRecordsView; lang: D2Lang }) {
  const t = T3[lang];
  const range = view.state !== "off" && view.from && view.to ? t.ownSub(day(view.from, lang), day(view.to, lang)) : "";
  return (
    <section className="d2-own" aria-labelledby="d2-own-title">
      <header className="d2-own-head">
        <div>
          <h2 className="d2-section" id="d2-own-title">{t.ownTitle}</h2>
          {range ? <p className="d2-small d2-muted"><Say lang={lang}>{range}</Say></p> : null}
        </div>
        <OwnSource view={view} lang={lang} />
      </header>
      <div className="d2-own-card">
        {view.state === "off" ? (
          <p className="d2-own-off"><b>{t.ownOffTitle}</b> <span className="d2-muted">{t.ownOffBody}</span></p>
        ) : (
          <>
            {view.state === "content" ? <p className="d2-own-point"><Say lang={lang}>{ownPoint(view, lang)}</Say></p> : null}
            <OwnChart view={view} lang={lang} />
            {view.state === "content" && !view.covered ? <p className="d2-small d2-muted d2-own-note">{t.ownPartial}</p> : null}
          </>
        )}
      </div>
    </section>
  );
}
