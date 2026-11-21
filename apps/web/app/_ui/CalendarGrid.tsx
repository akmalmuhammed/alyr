"use client";

import { Fragment, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { Meter } from "./Meter";
import { COMPACT_MINUTES, dayWindow, freeGaps, hourTicks, layoutLanes, nowOffset, placeSpan, toClock, toMinutes } from "./calendarLayout";
import { cx } from "./variants";

export type CalendarState = "booked" | "now" | "came" | "noshow" | "unmarked" | "held";

export const CALENDAR_STATES: readonly CalendarState[] = ["booked", "now", "came", "noshow", "unmarked", "held"];

const STATE_ICON: Partial<Record<CalendarState, IconName>> = { came: "check", noshow: "x", unmarked: "clock", held: "lock", now: "pulse" };

export type CalendarResource = {
  id: string;
  /** A person or a bay: "Bay 1", "Detailing · Yusuf". */
  name: ReactNode;
  /** The line under the name: hours and time booked ("07:00–22:00 · 3 h 30 booked"). */
  detail?: ReactNode;
  /** At the end of the heading: how many bookings. */
  count?: ReactNode;
  /** The share of open time that is booked, 0 to 1, as a thin meter under the heading; `label` says what it measures ("Bay 1 is 23% booked"). */
  meter?: { value: number; label: string };
  /** When this person or bay is not working: shaded, with a label ("Starts 09:00", "Break", "Finished 18:00"). */
  off?: readonly { from: string; to: string; label: ReactNode }[];
};

export type CalendarBlock = {
  id: string;
  resource: string;
  /** "HH:MM", 24 hours. */
  start: string;
  end: string;
  /** Who: the customer's name. */
  title: ReactNode;
  /** What: the service. */
  service?: ReactNode;
  state?: CalendarState;
  /** More lines, shown when the booking is long enough: "B-2241 · booked on WhatsApp", a quote. */
  lines?: readonly ReactNode[];
  /** The block's name for screen readers: who, what, when and the state, in one sentence. */
  label: string;
  onOpen?: () => void;
};

/**
 * A day as a time axis and a column per person or bay. Bookings are blocks placed by their start and
 * length (from the tokens' row height: 72 px an hour); overlapping ones share the column side by side;
 * hours a column is not working are shaded; the now line crosses every column with its time in the
 * axis; and free stretches of `freeSlots.minLength` minutes or more can be offered, shown when the
 * pointer or focus is on the column (always on a touch screen). More columns than fit scroll sideways
 * with the time axis staying put. In Arabic the columns run from the right.
 *
 * Only the geometry is here. Whether the data is fresh, what a state means and every word on a block
 * come from the screen (it polls its own endpoint; this draws what it is given).
 */
export function CalendarGrid({
  day, resources, blocks, now = null, formatTime = (clock) => clock, cornerLabel, stateLabels, caption,
  freeSlots, legendNote, showLegend = true, maxHeight, columnMin, className,
}: {
  day: { start: string; end: string };
  resources: readonly CalendarResource[];
  blocks: readonly CalendarBlock[];
  /** "HH:MM" on the shop's clock; null for a day that is not today. */
  now?: string | null;
  /** The one place times are written; swap it to flip between 24 hours and 12. */
  formatTime?: (clock: string) => string;
  /** At the top of the axis: the time zone ("Doha"). */
  cornerLabel?: ReactNode;
  /** One short word for each state, for the legend and for screen readers. */
  stateLabels: Record<CalendarState, string>;
  /** The grid's name for screen readers ("Bookings on Thursday 12 November"). */
  caption: string;
  freeSlots?: {
    minLength?: number;
    /** "13:00 · free until 17:00" (and the button's name). */
    label: (gap: { resource: string; start: string; end: string }) => string;
    onPick?: (gap: { resource: string; start: string; end: string }) => void;
  };
  /** A mono line at the end of the legend ("Updates by itself"). */
  legendNote?: ReactNode;
  showLegend?: boolean;
  /** Gives the grid its own scroll, and the headings something to stick to. Any CSS length. */
  maxHeight?: string;
  /** The narrowest a column gets before the grid scrolls sideways. Any CSS length. */
  columnMin?: string;
  className?: string;
}) {
  const win = useMemo(() => dayWindow(day.start, day.end), [day.start, day.end]);
  const ticks = useMemo(() => hourTicks(win), [win]);
  const nowAt = now ? nowOffset(win, toMinutes(now)) : null;
  const firstTickGap = ticks.length > 0 ? ticks[0] * 60 - win.start : 0;

  const style = {
    "--u-cal-cols": resources.length,
    "--u-cal-hours": win.length / 60,
    "--u-cal-first": firstTickGap / 60,
    "--u-cal-colmin": columnMin,
  } as CSSProperties;

  return (
    <div className={cx("u-cal", className)} role="group" aria-label={caption} style={style}>
      <div className={cx("u-cal-scroll", maxHeight && "u-cal-scroll--y")} style={maxHeight ? { maxBlockSize: maxHeight } : undefined}>
        <div className="u-cal-head">
          <div className="u-cal-corner">{cornerLabel}</div>
          {resources.map((r) => (
            <div key={r.id} className="u-cal-colhead">
              <div className="u-cal-colname">
                <span className="u-cal-name">{r.name}</span>
                {r.count !== undefined ? <span className="u-cal-count">{r.count}</span> : null}
              </div>
              {r.detail ? <div className="u-cal-detail">{r.detail}</div> : null}
              {r.meter ? <Meter value={r.meter.value} max={1} label={r.meter.label} size="sm" /> : null}
            </div>
          ))}
        </div>

        <div className="u-cal-body">
          <div className="u-cal-axis" aria-hidden="true">
            {ticks.map((h) => (
              <span key={h} className="u-cal-tick" style={{ "--s": h * 60 - win.start } as CSSProperties}>{formatTime(toClock(h * 60))}</span>
            ))}
            {nowAt !== null && now ? <span className="u-cal-nowtag" style={{ "--s": nowAt } as CSSProperties}>{formatTime(now)}</span> : null}
          </div>

          {resources.map((r) => {
            const mine = blocks.filter((b) => b.resource === r.id);
            const lanes = layoutLanes(mine.map((b) => ({ id: b.id, start: toMinutes(b.start), end: toMinutes(b.end) })));
            const offs = (r.off ?? []).map((o) => ({ ...o, span: { start: toMinutes(o.from), end: toMinutes(o.to) } }));
            const gaps = freeSlots
              ? freeGaps(win, [...mine.map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end) })), ...offs.map((o) => o.span)], freeSlots.minLength ?? 30)
              : [];
            return (
              <div key={r.id} className="u-cal-col">
                {offs.map((o, i) => {
                  const placed = placeSpan(win, o.span);
                  if (!placed) return null;
                  return (
                    <div key={i} className="u-cal-off" style={{ "--s": placed.offset, "--l": placed.length } as CSSProperties}>
                      <span>{o.label}</span>
                    </div>
                  );
                })}
                {gaps.map((g) => {
                  const placed = placeSpan(win, g);
                  if (!placed || !freeSlots) return null;
                  const gap = { resource: r.id, start: toClock(g.start), end: toClock(g.end) };
                  const text = freeSlots.label(gap);
                  return (
                    <button
                      key={`${g.start}-${g.end}`}
                      type="button"
                      className="u-cal-free"
                      style={{ "--s": placed.offset } as CSSProperties}
                      onClick={() => freeSlots.onPick?.(gap)}
                    >
                      <Icon name="plus" size="sm" />
                      <span>{text}</span>
                    </button>
                  );
                })}
                {mine.map((b) => {
                  const placed = placeSpan(win, { start: toMinutes(b.start), end: toMinutes(b.end) });
                  if (!placed) return null;
                  const lane = lanes.get(b.id) ?? { lane: 0, lanes: 1 };
                  const state = b.state ?? "booked";
                  const icon = STATE_ICON[state];
                  const compact = placed.length < COMPACT_MINUTES;
                  const Tag = b.onOpen ? "button" : "div";
                  return (
                    <Tag
                      key={b.id}
                      {...(b.onOpen ? { type: "button" as const, onClick: b.onOpen } : {})}
                      className={cx("u-cal-block", `u-cal-block--${state}`, compact && "u-cal-block--compact")}
                      style={{ "--s": placed.offset, "--l": placed.length, "--lane": lane.lane, "--lanes": lane.lanes } as CSSProperties}
                      aria-label={b.label}
                    >
                      <span className="u-cal-line">
                        <span className="u-cal-who">{b.title}</span>
                        {compact && b.service ? <span className="u-cal-what">{b.service}</span> : null}
                        {icon ? <Icon name={icon} size="sm" className="u-cal-state" /> : null}
                      </span>
                      {!compact ? (
                        <span className="u-cal-line u-cal-line--sub">
                          <bdi className="u-cal-time">{formatTime(b.start)}–{formatTime(b.end)}</bdi>
                          {b.service ? <span className="u-cal-what">{b.service}</span> : null}
                        </span>
                      ) : null}
                      {!compact && b.lines?.map((line, i) => <span key={i} className="u-cal-extra">{line}</span>)}
                    </Tag>
                  );
                })}
              </div>
            );
          })}

          {nowAt !== null ? <div className="u-cal-nowline" aria-hidden="true" style={{ "--s": nowAt } as CSSProperties} /> : null}
        </div>
      </div>

      {showLegend ? (
        <div className="u-cal-legend">
          {CALENDAR_STATES.map((state) => (
            <Fragment key={state}>
              <span className="u-cal-key"><span className={cx("u-cal-swatch", `u-cal-swatch--${state}`)} aria-hidden="true" />{stateLabels[state]}</span>
            </Fragment>
          ))}
          {legendNote ? <span className="u-cal-legend-note">{legendNote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
