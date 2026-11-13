import type { ReactNode } from "react";
import { cx } from "./variants";

export type DeltaTone = "ok" | "warn" | "bad" | "n";

/**
 * A number tile: a mono caps label, a 28 px figure (Instrument Sans, tabular), an optional
 * delta in mono and a muted line. `children` is for a small chart under the figure. The
 * caller counted the figure and says how in the line or in the panel footer; the tile does
 * not decide anything.
 */
export function Stat({ label, value, delta, tone = "ok", sub, className, children }: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: DeltaTone;
  sub?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("u-stat", className)}>
      <div className="u-label">{label}</div>
      <div className="u-stat-row">
        <span className="u-stat-value u-fig">{value}</span>
        {delta ? <span className={cx("u-stat-delta u-mono", `u-delta--${tone}`)}><bdi dir="ltr">{delta}</bdi></span> : null}
      </div>
      {children}
      {sub ? <div className="u-stat-sub">{sub}</div> : null}
    </div>
  );
}

/**
 * The Carbon band: one per page, a row of up to four figures on Carbon with the top inline-end
 * corner cut at 45 degrees (the Command Fold). Its children are BandItems. On a phone the
 * figures go two by two.
 */
export function Band({ children, className, ...rest }: { className?: string; children: ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, "className">) {
  return (
    <section {...rest} className={cx("u-band", className)}>
      {children}
    </section>
  );
}

/** One figure of the band: label, a 32 px figure, a unit or delta in mono, a line below. */
export function BandItem({ label, value, unit, delta, tone = "volt", sub, children }: {
  label: ReactNode;
  value: ReactNode;
  /** Mono text after the figure ("of 52 slots", "late"). */
  unit?: ReactNode;
  /** A change beside the figure ("+12%"). `volt` (default) is a rise; the others read as state. */
  delta?: ReactNode;
  tone?: "volt" | "ok" | "warn" | "bad";
  sub?: ReactNode;
  /** A small chart under the line, drawn with the band's own marks. */
  children?: ReactNode;
}) {
  return (
    <div className="u-band-item">
      <div className="u-label u-label--band">{label}</div>
      <div className="u-stat-row">
        <span className="u-band-value u-fig">{value}</span>
        {unit ? <span className="u-band-unit u-mono">{unit}</span> : null}
        {delta ? <span className={cx("u-band-delta u-mono", `u-band-delta--${tone}`)}><bdi dir="ltr">{delta}</bdi></span> : null}
      </div>
      {sub ? <div className="u-band-sub">{sub}</div> : null}
      {children}
    </div>
  );
}
