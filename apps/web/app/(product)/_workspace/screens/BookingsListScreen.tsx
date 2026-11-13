"use client";

// Bookings: the day by person or chair, and the list ALYR Agent's links open (`?show=unmarked`,
// `no_show`, `repeat_no_show`). Moved out of Screens.tsx unchanged when that file was split into
// one file per screen.

import { useCallback, useState } from "react";
import { BookingsDay } from "../BookingsDay";
import { usePolling } from "../poll";
import { shopNameShown } from "../shopLedger";
import { T } from "../screensCopy";
import {
  AssignSelect, DAY_MS, SHOWS, ScreenFrame, ShowFilter, activeFilter, getJson, giveRow, maybe, useShopFacts,
  type Person, type ScreenProps,
} from "./shared";

type BookingRow = {
  id: string; number: number; service: string; when_text: string; status: string;
  customer: string; note: string; starts_at: string; assigned: Person | null;
};

export function BookingsListScreen({ lang, intro, show = null, onClearShow, modules, business }: ScreenProps) {
  const { members, canManage, summary } = useShopFacts(modules);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  // Refreshed with the data, so "has this visit started" never calls the clock while rendering.
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const t = T[lang];
  const filter = activeFilter(show, "bookings");
  const filterLine = <ShowFilter filter={filter} lang={lang} onClearShow={onClearShow} />;

  const refresh = useCallback(async () => {
    try {
      const lookBack = show && SHOWS[show]?.tab === "bookings";
      const range = lookBack
        ? `?first=${new Date(Date.now() - 90 * DAY_MS).toISOString().slice(0, 10)}&last=${new Date(Date.now() + 8 * DAY_MS).toISOString().slice(0, 10)}`
        : "";
      await maybe<{ bookings: BookingRow[] }>(`/api/bookings${range}`, { bookings: [] }).then((b) => setBookings(b.bookings));
      setNow(Date.now());
      setError("");
    } catch {
      setError(t.unreachable);
    }
  }, [show, t]);

  // Every 10 s while the screen is on show, and at once when what is asked for changes or the
  // person comes back to the tab.
  usePolling(refresh, 10_000);

  async function bookingAction(booking: BookingRow, action: "completed" | "no_show" | "cancel") {
    const cancel = action === "cancel";
    await getJson(`/api/bookings/${booking.id}/${cancel ? "cancel" : "outcome"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: cancel ? undefined : JSON.stringify({ status: action }),
    });
    refresh();
  }

  async function giveTo(path: string, userId: string | null) {
    await giveRow(path, userId);
    refresh();
  }

  // The rows each ALYR Agent filter counts, with the same rules as the engine's.
  const missedTwice = new Set(
    Object.entries(
      bookings.filter((b) => b.status === "no_show").reduce<Record<string, number>>(
        (n, b) => ({ ...n, [b.customer]: (n[b.customer] ?? 0) + 1 }), {}),
    ).filter(([, n]) => n >= 2).map(([name]) => name),
  );
  const shownBookings = bookings.filter((b) => {
    const started = new Date(b.starts_at).getTime() < now;
    if (filter === "unmarked") return b.status === "booked" && started;
    if (filter === "no_show") return b.status === "no_show";
    if (filter === "repeat_no_show") return b.status === "booked" && !started && missedTwice.has(b.customer);
    return true;
  });

  return (
    <ScreenFrame lang={lang} error={error} title={t.tabBookings} shop={shopNameShown(lang, summary?.shop, business)} sub={t.bookingsSub} intro={intro}>
      {filterLine}
      {/* The day by person or chair (ALY-27, D-084). A link from the Agent opens the
          filtered list below instead, with exactly the visits it counted. */}
      {!filter && <BookingsDay lang={lang} canManage={canManage} />}
      {filter && (
        shownBookings.length === 0 ? (
          <p className="empty-note">{t.noBookings}</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{t.when}</th>
                  <th>{t.service}</th>
                  <th>{t.customer}</th>
                  <th>{t.assignedTo}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {shownBookings.map((b) => (
                  <tr key={b.id} className="norow">
                    <td><b className="num" dir="ltr">{b.when_text}</b><br /><span className="mono">#{b.number}</span></td>
                    <td>{b.service}{b.note && <div className="booking-said" dir="auto">{b.note}</div>}</td>
                    <td>{b.customer}</td>
                    <td>
                      <AssignSelect value={b.assigned} members={members} label={t.assignedTo} nobody={t.nobody}
                        onChange={(id) => giveTo(`/api/bookings/${b.id}/assign`, id)} />
                    </td>
                    <td>
                      <span className={`pill ${b.status === "booked" ? "p0" : b.status === "completed" ? "none" : "p1"}`}>{t.bk[b.status]}</span>
                      {b.status === "booked" && (
                        <span className="booking-acts">
                          {new Date(b.starts_at).getTime() < now && (
                            <>
                              <button className="btn small" onClick={() => bookingAction(b, "completed")}>{t.came}</button>
                              <button className="btn small" onClick={() => bookingAction(b, "no_show")}>{t.noShow}</button>
                            </>
                          )}
                          <button className="btn small" onClick={() => bookingAction(b, "cancel")}>{t.cancel}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </ScreenFrame>
  );
}
