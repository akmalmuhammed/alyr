import type { CSSProperties, ReactNode } from "react";
import { CLOSED, heatLevel } from "./heat";
import { cx } from "./variants";

export type HeatColumn = {
  id: string;
  /** The column's heading: a day name and date, a count, a thin meter. The screen draws it. */
  head: ReactNode;
  /** The column for today: a quiet fill behind it. */
  today?: boolean;
  /** Said once, in the first closed hour of this column: "Closed until 13:00". */
  closedNote?: ReactNode;
};

/**
 * How busy each hour of each day is, as a grid: a column per day, a row per hour, a number in every
 * hour that has anything, darker for more (four steps of the text colour). Hours the shop is closed are
 * a flat fill with no number. Today's column carries the now line, in Volt ink, the one mark.
 *
 * A real table underneath (days are column headings, hours are row headings), so a screen reader reads
 * "Thursday, 09:00, 3 bookings". `counts[c][r]` is column c, hour row r; -1 means closed. In Arabic the
 * columns run from the right, so the week reads the way the language does.
 */
export function HourHeat({
  columns, firstHour, counts, hourLabel, cornerLabel, caption, summary, now, levelMax, countLabel, className,
}: {
  columns: readonly HeatColumn[];
  /** The hour of the first row (7 for 07:00). */
  firstHour: number;
  counts: readonly (readonly number[])[];
  /** The one place an hour is written ("07:00"); swap it to flip between 24 hours and 12. */
  hourLabel: (hour: number) => string;
  /** Over the hour labels: "Starts in". */
  cornerLabel?: ReactNode;
  /** The table's name for screen readers. */
  caption: string;
  /** What the picture says, for screen readers: the busiest day and hour. */
  summary: string;
  /** The now line: which column, and where in the hours (minutes since midnight). */
  now?: { column: string; minutes: number } | null;
  /** Spreads counts over the four steps when a busy week would otherwise be all the darkest. */
  levelMax?: number;
  /** "3 bookings": a cell's name for screen readers, so the number is never read bare. */
  countLabel: (count: number) => string;
  className?: string;
}) {
  const rows = Math.max(0, ...counts.map((c) => c.length));
  const at = now ? now.minutes / 60 - firstHour : null;
  const nowRow = at === null ? null : Math.floor(at);
  const within = at === null || nowRow === null ? 0 : at - nowRow;

  return (
    <div className={cx("u-heat", className)}>
      <table className="u-heat-table" style={{ "--u-heat-cols": columns.length } as CSSProperties}>
        <caption className="u-sr">{caption}. {summary}</caption>
        <thead>
          <tr>
            <th scope="col" className="u-heat-corner">{cornerLabel}</th>
            {columns.map((c) => <th key={c.id} scope="col" className={cx("u-heat-head", c.today && "u-heat-head--today")}>{c.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <th scope="row" className="u-heat-hour"><bdi>{hourLabel(firstHour + r)}</bdi></th>
              {columns.map((c, ci) => {
                const count = counts[ci]?.[r] ?? 0;
                const closed = count === CLOSED;
                const level = closed ? 0 : heatLevel(count, levelMax);
                const firstClosed = closed && (counts[ci]?.[r - 1] ?? 0) !== CLOSED;
                return (
                  <td
                    key={c.id}
                    className={cx("u-heat-cell", closed ? "u-heat-cell--closed" : `u-heat-cell--l${level}`, c.today && "u-heat-cell--today")}
                  >
                    {!closed && count > 0 ? <span className="u-heat-count"><span aria-hidden="true">{count}</span><span className="u-sr">{countLabel(count)}</span></span> : null}
                    {firstClosed && c.closedNote ? <span className="u-heat-closed">{c.closedNote}</span> : null}
                    {now && now.column === c.id && nowRow === r ? <span className="u-heat-now" aria-hidden="true" style={{ "--u-within": within } as CSSProperties} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
