"use client";

// The three forms staff use at the desk (ALY-259, D-142, spec 043): write a visit down (a
// walk-in standing there, or a booking by phone), move a booking, cancel one. A customer the
// shop already has is found by name or number instead of typed again; a move shows the free
// times for that person; and before anything is sent the form says when the customer cannot be
// messaged (they never wrote, or said stop), so staff tell them themselves. What the API says
// afterwards is read in `BookingsDay.tsx`. Words in `bookingsCopy.ts`; the small functions in
// `bookingsDeskLogic.ts`.

import { useEffect, useState } from "react";
import type { BookingsCopy, Lang } from "./bookingsCopy";
import {
  addMinutes, clock, resourceName, warningFor, type DayBooking, type Resource, type Service,
} from "./bookingsDeskLogic";
import { nowIn, zonedIso } from "./bookingsTime";

type Match = { id: string; name: string; phone: string | null; lang: Lang; consent: string };

export function ResourceSelect({ t, lang, active, value, onChange, id }: {
  t: BookingsCopy; lang: Lang; active: Resource[]; value: string; onChange: (v: string) => void; id: string;
}) {
  if (active.length === 0) return null;
  return (
    <label className="bk-field" htmlFor={id}>
      <span>{t.who}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t.anyone}</option>
        {active.map((r) => <option key={r.id} value={r.id}>{resourceName(r, lang)}</option>)}
      </select>
    </label>
  );
}

export function AddBooking({ t, lang, services, active, day, zone, onDone, onClose, error }: {
  t: BookingsCopy; lang: Lang; services: Service[]; active: Resource[]; day: string; zone: string; error: string;
  onDone: (body: unknown) => void; onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [resourceId, setResourceId] = useState("");
  const [time, setTime] = useState(() => (nowIn(zone).day === day ? nowIn(zone).time : "10:00"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [here, setHere] = useState(true);
  const [picked, setPicked] = useState<Match | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  // A customer the shop has: found by what is typed in the name or the number, a moment after
  // the typing stops. What is shown is worked out below, so a stale list never lingers.
  const typed = name.trim().length >= 2 ? name.trim() : phone.replace(/\D/g, "").length >= 3 ? phone.trim() : "";
  useEffect(() => {
    if (!typed) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/bookings/customers?q=${encodeURIComponent(typed)}`, { cache: "no-store" });
        if (live && response.ok) setMatches((await response.json()).customers);
      } catch { /* the form still works by typing the customer in */ }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [typed]);
  const shown = typed && !picked ? matches : [];

  const service = services.find((s) => s.id === serviceId);
  const consent = picked ? picked.consent : "unknown";
  return (
    <form className="bk-form" onSubmit={(e) => {
      e.preventDefault();
      onDone({
        service_id: serviceId, starts_at: zonedIso(day, time, zone), resource_id: resourceId || null,
        walk_in: here, ...(picked ? { contact_id: picked.id } : { customer: { name, phone, lang } }),
      });
    }}>
      <h3>{t.addTitle}</h3>
      <p className="bk-quiet">{t.addHint}</p>
      <div className="bk-grid start">
        <label className="bk-field" htmlFor="bk-add-service">
          <span>{t.service}</span>
          <select id="bk-add-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            {services.map((s) => <option key={s.id} value={s.id}>{lang === "ar" && s.name_ar ? s.name_ar : s.name}</option>)}
          </select>
        </label>
        <ResourceSelect t={t} lang={lang} active={active} value={resourceId} onChange={setResourceId} id="bk-add-who" />
        <label className="bk-field" htmlFor="bk-add-time">
          <span>{t.time}</span>
          <input id="bk-add-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required dir="ltr" aria-describedby="bk-add-ends" />
          {service && time && <small id="bk-add-ends"><bdi>{t.endsAt(addMinutes(time, service.duration_minutes), t.minutes(service.duration_minutes))}</bdi></small>}
        </label>
      </div>

      {picked ? (
        <div className="bk-picked" role="group" aria-label={t.usingCustomer}>
          <p><span>{t.usingCustomer}</span> <b><bdi>{picked.name}</bdi></b> {picked.phone && <bdi dir="ltr" className="bk-ref">{picked.phone}</bdi>}</p>
          <button type="button" className="btn small ghost" onClick={() => setPicked(null)}>{t.changeCustomer}</button>
        </div>
      ) : (
        <div className="bk-grid start">
          <div className="bk-findwrap">
            <label className="bk-field" htmlFor="bk-add-name">
              <span>{t.name}</span>
              <input id="bk-add-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} required dir="auto" autoComplete="off" aria-describedby="bk-add-find" />
              <small id="bk-add-find">{t.findHint}</small>
            </label>
            {shown.length > 0 && (
              <ul className="bk-matches" aria-label={t.matchesLabel}>
                {shown.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="btn small bk-match" onClick={() => { setPicked(c); setName(c.name); setPhone(c.phone ?? ""); }}>
                      <b><bdi>{c.name}</bdi></b> {c.phone && <bdi dir="ltr" className="bk-ref">{c.phone}</bdi>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="bk-field" htmlFor="bk-add-phone">
            <span>{t.phone}</span>
            <input id="bk-add-phone" type="tel" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} required dir="ltr" autoComplete="off" aria-describedby="bk-add-phone-hint" />
            <small id="bk-add-phone-hint">{t.phoneHint}</small>
          </label>
        </div>
      )}

      <label className="bk-check">
        <input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} aria-describedby="bk-here-hint" />
        <span>{t.hereNow}</span>
      </label>
      <small id="bk-here-hint" className="bk-quiet">{t.hereNowHint}</small>
      {!here && consent !== "granted" && (
        <p className="bk-warn" role="status"><bdi>{warningFor(consent, picked?.phone ?? phone, t)}</bdi></p>
      )}
      {error && <p className="bk-error" role="alert">{error}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary">{t.addSave}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t.close}</button>
      </div>
    </form>
  );
}

export function MoveBooking({ t, lang, b, active, zone, onDone, onClose, error }: {
  t: BookingsCopy; lang: Lang; b: DayBooking; active: Resource[]; zone: string; error: string;
  onDone: (body: unknown) => void; onClose: () => void;
}) {
  const [day, setDay] = useState(b.day);
  const [time, setTime] = useState(b.starts_local);
  const [resourceId, setResourceId] = useState(b.resource?.id ?? "");
  // The free times for this booking's service on that day, for that person or anyone, with its
  // own time not counted against it. Each answer is kept with the day and person it is for, so
  // an old one is never read as the new one.
  const [found, setFound] = useState<{ key: string; times: string[]; closed: { reason: string; reason_ar: string } | null } | null>(null);
  const key = `${day}|${resourceId}`;
  useEffect(() => {
    if (!day) return;
    let live = true;
    fetch(`/api/bookings/${b.id}/times?day=${day}${resourceId ? `&resource_id=${resourceId}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { if (live) setFound({ key, times: data.times, closed: data.closed }); })
      .catch(() => { if (live) setFound({ key, times: [], closed: null }); });
    return () => { live = false; };
  }, [b.id, day, resourceId, key]);
  const current = found && found.key === key ? found : null;
  const chips = current ? current.times.map((iso) => clock(iso, zone)) : [];
  const warning = warningFor(b.consent, b.phone, t);

  return (
    <form className="bk-form inline" onSubmit={(e) => {
      e.preventDefault();
      onDone({ starts_at: zonedIso(day, time, zone), resource_id: resourceId || null });
    }}>
      <h4>{t.moveTitle(b.number)}</h4>
      <p className="bk-quiet"><bdi>{t.movingFrom(b.starts_local, resourceName(b.resource, lang))}</bdi></p>
      <div className="bk-grid start">
        <label className="bk-field" htmlFor={`bk-mv-day-${b.id}`}>
          <span>{t.newDay}</span>
          <input id={`bk-mv-day-${b.id}`} type="date" value={day} onChange={(e) => setDay(e.target.value)} required dir="ltr" />
        </label>
        <ResourceSelect t={t} lang={lang} active={active} value={resourceId} onChange={setResourceId} id={`bk-mv-who-${b.id}`} />
      </div>
      <div role="group" aria-labelledby={`bk-mv-free-${b.id}`} className="bk-free">
        <p id={`bk-mv-free-${b.id}`} className="bk-quiet">{t.freeTimes}</p>
        {!current && <p className="bk-quiet" role="status">{t.loadingTimes}</p>}
        {current?.closed && <p className="bk-quiet"><bdi>{t.closedFor((lang === "ar" && current.closed.reason_ar) || current.closed.reason)}</bdi></p>}
        {current && chips.length === 0 && <p className="bk-quiet">{t.noFreeTimes}</p>}
        {chips.length > 0 && (
          <div className="bk-chips">
            {chips.map((c) => (
              <button key={c} type="button" className="btn small bk-chip" aria-pressed={c === time} onClick={() => setTime(c)}>
                <bdi dir="ltr">{c}</bdi>
              </button>
            ))}
          </div>
        )}
      </div>
      <label className="bk-field" htmlFor={`bk-mv-time-${b.id}`}>
        <span>{t.anotherTime}</span>
        <input id={`bk-mv-time-${b.id}`} type="time" value={time} onChange={(e) => setTime(e.target.value)} required dir="ltr" />
      </label>
      {warning && <p className="bk-warn" role="status"><bdi>{warning}</bdi></p>}
      {error && <p className="bk-error" role="alert">{error}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary">{t.save}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t.close}</button>
      </div>
    </form>
  );
}

export function CancelBooking({ t, b, onDone, onClose, error }: {
  t: BookingsCopy; b: DayBooking; error: string; onDone: (refund: boolean | null) => void; onClose: () => void;
}) {
  const [choice, setChoice] = useState<"rule" | "refund" | "keep">("rule");
  const paid = b.deposit_state === "paid";
  const warning = warningFor(b.consent, b.phone, t);
  return (
    <form className="bk-form inline" onSubmit={(e) => {
      e.preventDefault();
      onDone(choice === "rule" ? null : choice === "refund");
    }}>
      <h4>{t.cancelTitle(b.number)}</h4>
      {paid && (
        <fieldset className="bk-choices">
          <legend>{t.cancelPaid}</legend>
          {(["rule", "refund", "keep"] as const).map((c) => (
            <label key={c} className="bk-check">
              <input type="radio" name={`bk-cancel-${b.id}`} checked={choice === c} onChange={() => setChoice(c)} />
              <span>{c === "rule" ? t.byRule : c === "refund" ? t.refund : t.keep}</span>
            </label>
          ))}
        </fieldset>
      )}
      {warning && <p className="bk-warn" role="status"><bdi>{warning}</bdi></p>}
      {error && <p className="bk-error" role="alert">{error}</p>}
      <div className="bk-acts">
        <button type="submit" className="btn primary">{t.confirmCancel}</button>
        <button type="button" className="btn ghost" onClick={onClose}>{t.keepBooking}</button>
      </div>
    </form>
  );
}
