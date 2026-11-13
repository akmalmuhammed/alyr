// The charts: a sparkline, an area chart, bars, a ring and a stacked bar. Plain SVG and CSS, no
// chart library. The rules they follow:
//  - Volt marks one thing, today (or the busiest day). Everything else is the text colour or a grey.
//  - Every chart carries a sentence for screen readers INSIDE it (`summary`, required): a chart is
//    never the only way the numbers reach a person. The sentence is the caller's, in both languages.
//  - Time runs right to left in Arabic: the drawing mirrors, and the first value sits at the inline
//    start. Tick labels are HTML, so they are never mirrored, and each is in <bdi> so a number range
//    keeps its order.
//  - No animation, no hover tooltips: the figures sit beside the chart in text.
// They draw in a unit box and CSS sizes them, so a 28px sparkline and a full-width trend are one drawing.

import type { CSSProperties, ReactNode } from "react";
import { areaPolygon, barFractions, percent, plotPoints, pointsAttribute, ringFraction, stackShares } from "./chartScale";
import type { StackPart } from "./chartScale";
import { cx } from "./variants";

const SPARK_W = 100;
const SPARK_H = 28;
const AREA_W = 100;
const AREA_H = 40;

function Dot({ x, y, width, height, signal }: { x: number; y: number; width: number; height: number; signal?: boolean }) {
  const style = { "--u-x": percent(x / width), "--u-y": percent(y / height) } as CSSProperties;
  return <span className={cx("u-chart-dot", signal && "u-chart-dot--signal")} style={style} aria-hidden="true" />;
}

/**
 * A line of recent values with a dot on the last one. Grey line, dark dot; `signal` makes the dot Volt
 * (the last value is today's, and today is the one thing worth marking); `onBand` is for a Carbon band.
 */
export function Spark({ values, summary, width, signal = false, onBand = false, className }: {
  values: readonly number[];
  summary: string;
  /** Any CSS length. Default 10rem. */
  width?: string;
  signal?: boolean;
  onBand?: boolean;
  className?: string;
}) {
  const points = plotPoints(values, SPARK_W, SPARK_H, { pad: 4 });
  const last = points[points.length - 1];
  return (
    <span className={cx("u-chart", "u-spark", onBand && "u-chart--band", className)} style={width ? ({ "--u-chart-w": width } as CSSProperties) : undefined}>
      <span className="u-chart-plot">
        <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polyline className="u-chart-line" points={pointsAttribute(points)} fill="none" />
        </svg>
        {last ? <Dot x={last.x} y={last.y} width={SPARK_W} height={SPARK_H} signal={signal || onBand} /> : null}
      </span>
      <span className="u-sr">{summary}</span>
    </span>
  );
}

/**
 * A trend: a dark line over a faint fill, three hairline gridlines, an optional grey comparison line
 * (the same days last week), and a dot on the last value. `xLabels` are the ticks under it, first
 * to last in reading order.
 */
export function Area({ values, compare, min, xLabels, summary, signal = true, height, className }: {
  values: readonly number[];
  /** A second series for the grey comparison line; same length as `values`. */
  compare?: readonly number[];
  /** A floor for the scale, so a trend does not look steeper than it is. */
  min?: number;
  xLabels?: readonly string[];
  summary: string;
  /** The last dot is Volt: it is today. */
  signal?: boolean;
  /** Any CSS length. */
  height?: string;
  className?: string;
}) {
  const all = compare ? [...values, ...compare] : values;
  const lo = min !== undefined ? Math.min(min, ...all) : Math.min(...all);
  const hi = Math.max(...all);
  const scale = { pad: 4, min: lo, max: hi === lo ? lo + 1 : hi };
  const points = plotPoints(values, AREA_W, AREA_H, scale);
  const ghost = compare ? plotPoints(compare, AREA_W, AREA_H, scale) : null;
  const last = points[points.length - 1];
  return (
    <span className={cx("u-chart", "u-area", className)} style={height ? ({ "--u-chart-h": height } as CSSProperties) : undefined}>
      <span className="u-chart-plot">
        <svg viewBox={`0 0 ${AREA_W} ${AREA_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="u-chart-grid" d={`M0 ${AREA_H / 4}H${AREA_W}M0 ${AREA_H / 2}H${AREA_W}M0 ${(AREA_H * 3) / 4}H${AREA_W}`} />
          {ghost ? <polyline className="u-chart-ghost" points={pointsAttribute(ghost)} fill="none" /> : null}
          <polygon className="u-chart-fill" points={areaPolygon(points, AREA_H)} />
          <polyline className="u-chart-line u-chart-line--strong" points={pointsAttribute(points)} fill="none" />
        </svg>
        {last ? <Dot x={last.x} y={last.y} width={AREA_W} height={AREA_H} signal={signal} /> : null}
      </span>
      {xLabels && xLabels.length > 0 ? (
        <ol className="u-chart-x" aria-hidden="true">
          {xLabels.map((label, i) => <li key={i}><bdi>{label}</bdi></li>)}
        </ol>
      ) : null}
      <span className="u-sr">{summary}</span>
    </span>
  );
}

/**
 * Columns, one per value (a day of the week, an hour). Grey bars; `peak` (the busiest) is the text
 * colour; `today` is Volt, the one mark. Labels run under the bars in reading order, so a week reads
 * right to left in Arabic.
 */
export function Bars({ values, labels, today, peak, summary, height, className }: {
  values: readonly number[];
  labels?: readonly string[];
  today?: number;
  peak?: number;
  summary: string;
  /** Any CSS length. */
  height?: string;
  className?: string;
}) {
  const shares = barFractions(values);
  return (
    <span className={cx("u-chart", "u-bars", className)} style={height ? ({ "--u-chart-h": height } as CSSProperties) : undefined}>
      <span className="u-bars-plot" aria-hidden="true">
        {shares.map((share, i) => (
          <span key={i} className="u-bars-col">
            <span
              className={cx("u-bar", i === today && "u-bar--today", i === peak && i !== today && "u-bar--peak")}
              style={{ "--u-share": share } as CSSProperties}
            />
          </span>
        ))}
      </span>
      {labels && labels.length > 0 ? (
        <ol className="u-bars-labels" aria-hidden="true">
          {labels.map((label, i) => <li key={i} className={cx(i === today && "u-bars-label--today")}><bdi>{label}</bdi></li>)}
        </ol>
      ) : null}
      <span className="u-sr">{summary}</span>
    </span>
  );
}

/** A share of a whole as a ring. The arc runs the way the language reads. `children` sit in the middle (a figure). */
export function Ring({ value, total = 1, size = "md", summary, tone = "ink", children, className }: {
  value: number;
  total?: number;
  size?: "md" | "lg";
  summary: string;
  tone?: "ink" | "ok" | "warn" | "bad";
  children?: ReactNode;
  className?: string;
}) {
  const fraction = ringFraction(value, total);
  return (
    <span className={cx("u-chart", "u-ring", `u-ring--${size}`, `u-ring--${tone}`, className)}>
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="u-ring-track" cx="18" cy="18" r="16.4" fill="none" pathLength="100" />
        {fraction > 0 ? <circle className="u-ring-arc" cx="18" cy="18" r="16.4" fill="none" pathLength="100" strokeDasharray={`${Math.round(fraction * 10000) / 100} 100`} /> : null}
      </svg>
      {children ? <span className="u-ring-centre" aria-hidden="true">{children}</span> : null}
      <span className="u-sr">{summary}</span>
    </span>
  );
}

export type StackTone = "ink" | "strong" | "ctl" | "ok" | "warn" | "bad";

/**
 * Parts of a whole in one bar with a small gap between them: the age of what is owed (text, grey,
 * amber, red), the day's bookings (came, did not come, not marked, to come). Parts of zero drop out.
 */
export function Stack({ parts, summary, size = "sm", className }: {
  parts: readonly StackPart<StackTone>[];
  summary: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const shares = stackShares(parts);
  return (
    <span className={cx("u-chart", "u-stack", `u-stack--${size}`, className)}>
      <span className="u-stack-bar" aria-hidden="true">
        {shares.map((s) => <span key={s.index} className={cx("u-stack-part", `u-stack-part--${s.tone}`)} style={{ flexGrow: s.share }} />)}
      </span>
      <span className="u-sr">{summary}</span>
    </span>
  );
}
