"use client";

// A week of working hours, edited a day at a time (ALY-259, D-141, spec 043): switch a day on or
// off, give it one period or several (a break in the middle is two), copy one day's hours to the
// whole week. Used for the shop's opening hours and for one person's or chair's own hours. The
// week is checked in the page's language (`bookingsWeekLogic.ts`) before it is sent, and the API
// checks it again. Words in `bookingsCopy.ts`.

import { useState } from "react";
import type { BookingsCopy } from "./bookingsCopy";
import {
  addSpan, checkWeek, periodsFrom, sameEveryDay, weekFrom, type Day, type Period,
} from "./bookingsWeekLogic";

export function WeekEditor({ t, idp, periods, saveLabel, onSave }: {
  t: BookingsCopy; idp: string; periods: Period[]; saveLabel: string;
  onSave: (periods: Period[]) => Promise<string>;
}) {
  const [week, setWeek] = useState<Day[]>(() => weekFrom(periods));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = (weekday: number, next: Day) => { setWeek(week.map((d, i) => (i === weekday ? next : d))); setError(""); };
  const setSpan = (weekday: number, index: number, edit: Partial<{ opens: string; closes: string }>) =>
    change(weekday, { ...week[weekday], spans: week[weekday].spans.map((s, i) => (i === index ? { ...s, ...edit } : s)) });

  return (
    <form className="bk-week" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const wrong = checkWeek(week);
      if (wrong) { setError(t.dayError(t.weekdays[wrong.weekday], t.errors[wrong.code])); return; }
      setBusy(true);
      const code = await onSave(periodsFrom(week));
      setBusy(false);
      if (code) setError(t.errors[code] ?? t.errors.generic);
    }}>
      {week.map((day, weekday) => {
        const name = t.weekdays[weekday];
        const id = `${idp}-${weekday}`;
        return (
          <div key={weekday} className={`bk-wday${day.on ? "" : " is-off"}`} role="group" aria-label={name}>
            <label className="bk-check">
              <input type="checkbox" checked={day.on} onChange={(e) => change(weekday, { ...day, on: e.target.checked })} />
              <span>{name}</span>
            </label>
            {day.on ? (
              <div className="bk-spans">
                {day.spans.map((s, i) => (
                  <div key={i} className="bk-span" dir="ltr">
                    <label className="bk-visually" htmlFor={`${id}-o${i}`}>{t.from} {name}</label>
                    <input id={`${id}-o${i}`} type="time" value={s.opens} onChange={(e) => setSpan(weekday, i, { opens: e.target.value })} />
                    <span aria-hidden="true">–</span>
                    <label className="bk-visually" htmlFor={`${id}-c${i}`}>{t.to} {name}</label>
                    <input id={`${id}-c${i}`} type="time" value={s.closes} onChange={(e) => setSpan(weekday, i, { closes: e.target.value })} />
                    {day.spans.length > 1 && (
                      <button type="button" className="btn small bk-iconbtn" aria-label={t.removeSpan(name, `${s.opens}–${s.closes}`)}
                        onClick={() => change(weekday, { ...day, spans: day.spans.filter((_, k) => k !== i) })}>
                        <svg className="bk-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    )}
                    {i === day.spans.length - 1 && (
                      <button type="button" className="btn small bk-addspan" aria-label={t.addSpanFor(name)}
                        onClick={() => change(weekday, addSpan(day))}>{t.addSpan}</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="bk-quiet bk-closedday">{t.closedDay}</span>
            )}
          </div>
        );
      })}
      {error && <p className="bk-error" role="alert">{error}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary" disabled={busy}>{saveLabel}</button>
        <button type="button" className="btn ghost" aria-describedby={`${idp}-same`}
          onClick={() => { setWeek(sameEveryDay(week)); setError(""); }}>{t.sameDays}</button>
      </div>
      <small id={`${idp}-same`} className="bk-quiet">{t.sameDaysHint}</small>
    </form>
  );
}
