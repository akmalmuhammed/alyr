"use client";

// The Bookings day view (ALY-27, D-084, spec 033): one column per person or chair (one list
// for a shop with none), each booking a card with what staff do next: came, didn't come,
// move, cancel, and a deposit to mark refunded. A walk-in or a booking taken by phone is
// added from the same screen (the forms are in `BookingsDeskForms.tsx`), and after each one the
// screen says what became of the message to the customer. Owners and admins open the setup
// (services, hours, people and chairs, deposits and reviews) from the bar; it takes the place of
// the day until they go back. Everything goes through the API, which writes the activity
// record. Words in `bookingsCopy.ts`; money from `_customer/price.ts`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "../_customer/price";
import { BookingsSetup, type Part } from "./BookingsSetup";
import { BOOKINGS, type BookingsCopy, type Lang } from "./bookingsCopy";
import { AddBooking, CancelBooking, MoveBooking } from "./BookingsDeskForms";
import {
  answerFor, clock, resourceName, type DayBooking, type Period, type Resource, type Service, type Told,
} from "./bookingsDeskLogic";
import { shift } from "./bookingsTime";
import "./bookings.css";

type DayView = {
  day: string; today: string; timezone: string; hours: Period[]; resources: Resource[];
  bookings: DayBooking[]; services: Service[]; closed: { reason: string; reason_ar: string } | null;
};
type Panel = { kind: "move" | "cancel"; id: string } | null;

const LANE = "lane";

/** When someone works on a day, as one range: "14:00–22:00" (kept left to right in Arabic). */
function span(periods: Period[]): { range: string } {
  return { range: `${periods[0].opens}–${periods[periods.length - 1].closes}` };
}

function dayTitle(day: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

async function call(
  url: string, body?: unknown, method = "POST",
): Promise<{ ok: boolean; code: string; told: Told | null }> {
  try {
    const response = await fetch(url, {
      method, headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, code: "", told: data?.told ?? null };
    const detail = data?.detail;
    return { ok: false, code: (typeof detail === "object" && detail?.code) || "generic", told: null };
  } catch {
    return { ok: false, code: "generic", told: null };
  }
}

function DepositLine({ b, t, lang, zone }: { b: DayBooking; t: BookingsCopy; lang: Lang; zone: string }) {
  if (!b.deposit || b.deposit_state === "none") return null;
  const amount = formatPrice(b.deposit, lang);
  const words = b.deposit_state === "due"
    ? t.deposit.due(amount, b.hold_until ? clock(b.hold_until, zone) : "")
    : b.deposit_state === "paid"
      ? (b.left_to_pay > 0 ? t.deposit.paid(amount, formatPrice(b.left_to_pay, lang)) : t.deposit.paidAll(amount))
      : (t.deposit[b.deposit_state as "kept" | "refund_due" | "refunded" | "expired"] ?? (() => ""))(amount);
  return <p className={`bk-deposit is-${b.deposit_state}`}><bdi>{words}</bdi></p>;
}

export function BookingsDay({ lang, canManage }: { lang: Lang; canManage: boolean }) {
  const t = BOOKINGS[lang];
  const [day, setDay] = useState<string | null>(null);
  const [view, setView] = useState<DayView | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [adding, setAdding] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<Part | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/bookings/day${day ? `?day=${day}` : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data: DayView = await response.json();
      setView(data);
      setNow(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [day]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    // A quiet refresh: new bookings from the chat appear; nothing moves or animates.
    const timer = setInterval(load, 15_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const columns = useMemo(() => {
    if (!view) return [];
    const why = (c: { reason: string; reason_ar: string }) => t.closedFor((lang === "ar" && c.reason_ar) || c.reason);
    if (view.resources.length === 0) {
      return [{
        id: LANE, title: t.allBookings,
        sub: view.closed ? why(view.closed) : view.hours.length ? span(view.hours) : t.shopClosed,
        off: view.closed !== null, bookings: view.bookings,
      }];
    }
    return view.resources.map((r) => ({
      id: r.id,
      title: resourceName(r, lang),
      sub: view.closed ? why(view.closed) : r.leave ? why(r.leave) : r.off ? t.dayOff : r.today.length ? span(r.today) : t.shopClosed,
      off: r.off || r.today.length === 0,
      bookings: view.bookings.filter((b) => b.resource?.id === r.id),
    }));
  }, [view, lang, t]);

  /** Do something to a booking, then say so: the action's own sentence and, when it messaged the
   * customer, whether it could (a customer who never wrote, or said stop, is not messaged). */
  async function act(url: string, body: unknown, done: string) {
    setError("");
    const result = await call(url, body);
    if (!result.ok) {
      setError(t.errors[result.code] ?? t.errors.generic);
      return false;
    }
    setPanel(null);
    setSaid(answerFor(done, result.told, t));
    await load();
    return true;
  }

  if (!view) {
    return <p className="bk-quiet" role="status">{offline ? t.offline : t.loading}</p>;
  }
  const zone = view.timezone;
  const active = view.resources.filter((r) => r.active);
  const shown = day ?? view.day;

  if (setup) {
    return (
      <section className="bk" aria-label={t.setup}>
        <BookingsSetup lang={lang} start={setup} onChanged={load}
          onClose={(to) => { setSetup(null); if (to) setDay(to); }} />
      </section>
    );
  }

  return (
    <section className="bk" aria-labelledby="bk-day-title">
      <div className="bk-bar">
        <div className="bk-nav" role="group" aria-label={t.dayLabel}>
          <button type="button" className="btn small" aria-label={t.prev} onClick={() => setDay(shift(shown, -1))}>
            <svg className="bk-ico ico-flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="btn small" disabled={shown === view.today} onClick={() => setDay(view.today)}>{t.today}</button>
          <button type="button" className="btn small" aria-label={t.next} onClick={() => setDay(shift(shown, 1))}>
            <svg className="bk-ico ico-flip" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <h2 id="bk-day-title" className="bk-title">{dayTitle(shown, lang)}</h2>
          <span className="bk-count num">{t.count(view.bookings.filter((b) => b.status !== "cancelled").length)}</span>
        </div>
        <div className="bk-barbtns">
          {canManage && <button type="button" className="btn" onClick={() => setSetup("services")}>{t.setup}</button>}
          <button type="button" className="btn volt" aria-expanded={adding} onClick={() => { setAdding(!adding); setError(""); }}>{t.add}</button>
        </div>
      </div>
      {offline && <p className="bk-quiet" role="status">{t.offline}</p>}
      <p className="bk-said" role="status" aria-live="polite">{said}</p>

      {adding && view.services.length === 0 && (
        <div className="bk-form" role="status">
          <p>{canManage ? t.needService : t.needServiceAgent}</p>
          <div className="bk-acts">
            {canManage && <button type="button" className="btn primary" onClick={() => setSetup("services")}>{t.addFirst}</button>}
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>{t.close}</button>
          </div>
        </div>
      )}
      {adding && view.services.length > 0 && (
        <AddBooking t={t} lang={lang} services={view.services} active={active} day={shown} zone={zone}
          onDone={async (body) => { const ok = await act("/api/bookings", body, t.added); if (ok) setAdding(false); }}
          onClose={() => setAdding(false)} error={error} />
      )}

      {view.services.length === 0 && (
        <div className="bk-empty">
          <p>{t.noServices}</p>
          {canManage && <button type="button" className="btn small" onClick={() => setSetup("services")}>{t.addFirst}</button>}
        </div>
      )}
      {view.resources.length === 0 && <p className="bk-quiet">{t.oneLane}</p>}

      <div className="bk-cols">
        {columns.map((col) => (
          <section key={col.id} className={`bk-col${col.off ? " is-off" : ""}`} aria-labelledby={`bk-col-${col.id}`}>
            <header className="bk-colhead">
              <h3 id={`bk-col-${col.id}`}>{col.title}</h3>
              <span className="num">{typeof col.sub === "string" ? col.sub : <>{t.works} <bdi dir="ltr">{col.sub.range}</bdi></>}</span>
            </header>
            {col.bookings.length === 0 ? (
              <p className="bk-empty">{t.nothing}</p>
            ) : (
              <ol className="bk-list">
                {col.bookings.map((b) => {
                  const started = new Date(b.starts_at).getTime() < now;
                  const open = panel?.id === b.id ? panel.kind : null;
                  return (
                    <li key={b.id} className={`bk-card is-${b.status}`}>
                      <div className="bk-row">
                        <b className="bk-when num" dir="ltr">{b.starts_local}–{b.ends_local}</b>
                        <span className={`bk-status is-${b.status}`}>{t.status[b.status] ?? b.status}</span>
                      </div>
                      <p className="bk-who"><b><bdi>{b.customer}</bdi></b> <span className="bk-ref num" dir="ltr">#{b.number}</span>
                        {b.walk_in && <span className="bk-tag">{t.walkIn}</span>}</p>
                      <p className="bk-what"><bdi>{lang === "ar" && b.service_ar ? b.service_ar : b.service}</bdi></p>
                      <DepositLine b={b} t={t} lang={lang} zone={zone} />
                      {b.note && <p className="bk-note" dir="auto">{b.note}</p>}
                      {b.status === "booked" && !open && (
                        <div className="bk-acts">
                          {started && <button type="button" className="btn small" onClick={() => act(`/api/bookings/${b.id}/outcome`, { status: "completed" }, t.status.completed)}>{t.came}</button>}
                          {started && <button type="button" className="btn small" onClick={() => act(`/api/bookings/${b.id}/outcome`, { status: "no_show" }, t.status.no_show)}>{t.noShow}</button>}
                          <button type="button" className="btn small" onClick={() => { setPanel({ kind: "move", id: b.id }); setError(""); }}>{t.move}</button>
                          <button type="button" className="btn small" onClick={() => { setPanel({ kind: "cancel", id: b.id }); setError(""); }}>{t.cancel}</button>
                        </div>
                      )}
                      {b.deposit_state === "refund_due" && canManage && (
                        <div className="bk-acts">
                          <button type="button" className="btn small" onClick={() => act(`/api/bookings/${b.id}/deposit-refunded`, undefined, t.deposit.refunded(formatPrice(b.deposit, lang)))}>{t.refunded}</button>
                        </div>
                      )}
                      {open === "move" && (
                        <MoveBooking t={t} lang={lang} b={b} active={active} zone={zone} error={error}
                          onDone={(body) => act(`/api/bookings/${b.id}/move`, body, t.moved)} onClose={() => setPanel(null)} />
                      )}
                      {open === "cancel" && (
                        <CancelBooking t={t} b={b} error={error}
                          onDone={(refund) => act(`/api/bookings/${b.id}/cancel`, { refund }, t.cancelled)} onClose={() => setPanel(null)} />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        ))}
      </div>
      {view.bookings.some((b) => b.deposit) && <p className="bk-quiet">{t.standIn}</p>}
    </section>
  );
}
