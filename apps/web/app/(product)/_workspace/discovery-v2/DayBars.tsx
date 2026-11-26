// The annotated small bars: orders and bookings in ALYR on the last few of one weekday, over the
// hatched band where the listing said Closed. First-party data (workstream C): drawn only when the
// adapter has it. Time runs right to left in Arabic (the grid follows the direction).

import type { CSSProperties } from "react";
import { T, type D2Lang } from "./copy";
import type { FirstParty } from "./adapter";
import type { WhereKey } from "./copy";
import { barUnits } from "./logic";
import { Ltr, day } from "./parts";

export function DayBars({ fp, where, lang }: { fp: FirstParty; where: WhereKey; lang: D2Lang }) {
  const t = T[lang];
  const orders = barUnits(fp.weeks.map((w) => w.orders));
  const bookings = barUnits(fp.weeks.map((w) => w.bookings));
  const style = (units: number) => ({ "--d2-u": units }) as CSSProperties;
  return (
    <div className="d2-bars" role="img" aria-label={`${t.barsLabel(fp.weeks.length, fp.day)}. ${fp.weeks.map((w) => t.barTitle(day(w.date, lang), w.orders, w.bookings)).join("; ")}.`}>
      <div className="d2-bars-cap" aria-hidden="true">
        <span>{t.barsCaption(fp.weeks.length, fp.day)}</span>
        <span className="d2-bars-key"><span><i className="d2-key-o" />{t.orders}</span><span><i className="d2-key-b" />{t.bookings}</span></span>
      </div>
      <div className="d2-bars-plot" aria-hidden="true" style={{ "--d2-cols": fp.weeks.length } as CSSProperties}>
        {fp.listingSaidClosed ? <div className="d2-bars-band"><span>{t.barsBand(where, fp.weeks.length)}</span></div> : null}
        {fp.weeks.map((w, i) => (
          <div className="d2-bars-col" key={w.date}>
            <span className="d2-bars-v"><Ltr>{t.barValue(w.orders, w.bookings)}</Ltr></span>
            <div className="d2-bars-bar">
              {orders[i] > 0 ? <i className="d2-bar-o" style={style(orders[i])} /> : null}
              {bookings[i] > 0 ? <i className="d2-bar-b" style={style(bookings[i])} /> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="d2-bars-x" aria-hidden="true" style={{ "--d2-cols": fp.weeks.length } as CSSProperties}>
        {fp.weeks.map((w) => <span key={w.date}>{day(w.date, lang)}</span>)}
      </div>
    </div>
  );
}
