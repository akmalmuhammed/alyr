"use client";

// The shop's opening hours and its days off (ALY-259, D-141, spec 043), for an owner or admin:
// the week, a day at a time (`BookingsWeek.tsx`), and the days nobody can book: Eid, a holiday,
// a closure, or one person's leave. The booking page and the free times follow both at once. A
// day off never cancels a booking: the screen says how many are still booked inside it and
// opens the day, so the owner moves or cancels them. Words in `bookingsCopy.ts`.

import { useCallback, useEffect, useState } from "react";
import { send } from "./bookingsApi";
import type { BookingsCopy, Lang } from "./bookingsCopy";
import { WeekEditor } from "./BookingsWeek";
import { checkClosure, rangeText, type Period } from "./bookingsWeekLogic";

type Person = { id: string; name: string; name_ar: string; active: boolean };
type Closure = {
  id: string; first: string; last: string; reason: string; reason_ar: string; standing: number;
  resource: { id: string; name: string; name_ar: string } | null;
};

function nameOf(p: { name: string; name_ar: string }, lang: Lang): string {
  return lang === "ar" && p.name_ar ? p.name_ar : p.name;
}

export function BookingsHours({ t, lang, people, say, changed, openDay }: {
  t: BookingsCopy; lang: Lang; people: Person[]; say: (text: string) => void;
  changed: () => void; openDay: (day: string) => void;
}) {
  const [periods, setPeriods] = useState<Period[] | null>(null);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    const [hours, off] = await Promise.all([send("/api/hours", "GET"), send("/api/closures", "GET")]);
    if (!hours.code) setPeriods(hours.data.periods as Period[]);
    if (!off.code) {
      setClosures(off.data.closures as Closure[]);
      setToday(off.data.today as string);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  if (!periods) return <p className="bk-quiet" role="status">{t.loading}</p>;
  return (
    <>
      <section className="bk-part" aria-labelledby="bk-hours">
        <h3 id="bk-hours">{t.hoursTitle}</h3>
        <p className="bk-quiet">{t.hoursHint}</p>
        <WeekEditor
          key={JSON.stringify(periods)} t={t} idp="bk-shop-week" periods={periods} saveLabel={t.saveHours}
          onSave={async (next) => {
            const { code } = await send("/api/hours", "PUT", { periods: next });
            if (!code) { say(t.hoursSaved); await load(); changed(); }
            return code;
          }}
        />
      </section>

      <section className="bk-part" aria-labelledby="bk-off">
        <h3 id="bk-off">{t.closuresTitle}</h3>
        <p className="bk-quiet">{t.closuresHint}</p>
        {closures.length === 0 ? (
          <p className="bk-empty">{t.closuresNone}</p>
        ) : (
          <ul className="bk-people bk-closures">
            {closures.map((c) => {
              const when = rangeText(c.first, c.last, lang, today);
              const who = c.resource ? nameOf(c.resource, lang) : t.closureShop;
              const reason = (lang === "ar" && c.reason_ar) || c.reason;
              const what = `${when}, ${who}`;
              return (
                <li key={c.id} className="bk-person bk-closure">
                  <div className="bk-service-head">
                    <p className="bk-service-name"><b><bdi>{when}</bdi></b></p>
                    <p className="bk-facts">
                      <span><bdi>{who}</bdi></span>
                      {reason && <span><bdi>{reason}</bdi></span>}
                      {c.standing > 0 && <span className="bk-standing">{t.closureStanding(c.standing)}</span>}
                    </p>
                  </div>
                  <div className="bk-acts">
                    {c.standing > 0 && (
                      <button type="button" className="btn small" aria-label={t.seeDayFor(what)}
                        onClick={() => openDay(c.first > today ? c.first : today)}>{t.seeDay}</button>
                    )}
                    <button type="button" className="btn small" aria-label={t.removeClosureFor(what)}
                      onClick={async () => {
                        const { code } = await send(`/api/closures/${c.id}`, "DELETE");
                        say(code ? t.errors[code] ?? t.errors.generic : t.closureRemoved);
                        if (!code) { await load(); changed(); }
                      }}>{t.removeClosure}</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <AddClosure
          t={t} lang={lang} people={people.filter((p) => p.active)} today={today}
          onAdd={async (body) => {
            const { code, data } = await send("/api/closures", "POST", body);
            if (code) return code;
            const standing = (data.closure as Closure).standing;
            say(standing > 0 ? t.closureAddedStanding(standing) : t.closureAdded);
            await load();
            changed();
            return "";
          }}
        />
      </section>
    </>
  );
}

function AddClosure({ t, lang, people, today, onAdd }: {
  t: BookingsCopy; lang: Lang; people: Person[]; today: string;
  onAdd: (body: Record<string, unknown>) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [who, setWho] = useState("");
  const [reason, setReason] = useState("");
  const [reasonAr, setReasonAr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <div className="bk-acts">
        <button type="button" id="bk-closure-add" className="btn" onClick={() => setOpen(true)}>{t.addClosure}</button>
      </div>
    );
  }
  return (
    <form className="bk-form" noValidate aria-labelledby="bk-closure-title" onSubmit={async (e) => {
      e.preventDefault();
      const wrong = checkClosure(first, last || first, today);
      if (wrong) { setError(wrong); return; }
      setBusy(true);
      const code = await onAdd({
        first, last: last || first, resource_id: who || null, reason, reason_ar: reasonAr,
      });
      setBusy(false);
      if (code) { setError(code); return; }
      setOpen(false);
      setFirst(""); setLast(""); setWho(""); setReason(""); setReasonAr(""); setError("");
    }}>
      <h4 id="bk-closure-title">{t.addClosure}</h4>
      <div className="bk-grid start">
        <label className="bk-field" htmlFor="bk-closure-first"><span>{t.closureFirst}</span>
          <input id="bk-closure-first" type="date" value={first} dir="ltr" required aria-invalid={error === "closure_dates"}
            onChange={(e) => { setFirst(e.target.value); if (!last || last < e.target.value) setLast(e.target.value); setError(""); }} /></label>
        <label className="bk-field" htmlFor="bk-closure-last"><span>{t.closureLast}</span>
          <input id="bk-closure-last" type="date" value={last} dir="ltr" min={first || undefined} aria-describedby="bk-closure-last-hint"
            onChange={(e) => { setLast(e.target.value); setError(""); }} />
          <small id="bk-closure-last-hint">{t.closureLastHint}</small></label>
        {people.length > 0 && (
          <label className="bk-field" htmlFor="bk-closure-who"><span>{t.closureWho}</span>
            <select id="bk-closure-who" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">{t.closureShop}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{nameOf(p, lang)}</option>)}
            </select></label>
        )}
      </div>
      <div className="bk-grid start">
        <label className="bk-field" htmlFor="bk-closure-reason"><span>{t.closureReason}</span>
          <input id="bk-closure-reason" value={reason} maxLength={120} dir="auto" autoComplete="off" aria-describedby="bk-closure-reason-hint"
            onChange={(e) => setReason(e.target.value)} />
          <small id="bk-closure-reason-hint">{t.closureReasonHint}</small></label>
        <label className="bk-field" htmlFor="bk-closure-reason-ar"><span>{t.closureReasonAr}</span>
          <input id="bk-closure-reason-ar" value={reasonAr} maxLength={120} dir="rtl" lang="ar" autoComplete="off"
            onChange={(e) => setReasonAr(e.target.value)} /></label>
      </div>
      {error && <p className="bk-error" role="alert">{t.errors[error] ?? t.errors.generic}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary" disabled={busy}>{t.closureSave}</button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setError(""); }}>{t.close}</button>
      </div>
    </form>
  );
}
