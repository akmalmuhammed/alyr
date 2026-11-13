import type { CSSProperties } from "react";
import { cx } from "./variants";
import { skeletonWidth } from "./tableLogic";

/**
 * A grey bar that stands where something will be, so the page keeps its shape while it loads and
 * nothing jumps when the data arrives. It does not shimmer, pulse or move: it is a placeholder, not
 * a promise. It is hidden from screen readers; the region that holds it says "loading" (see
 * SkeletonRows, or `aria-busy` and a `loadingLabel` on the Table).
 */
export function Skeleton({ width, height, round = false, className }: {
  /** A share of the container as a number out of 100, or any CSS length. */
  width?: number | string;
  /** Any CSS length; the line height of body text when left out. */
  height?: string;
  round?: boolean;
  className?: string;
}) {
  const style = {
    "--u-skel-w": typeof width === "number" ? `${width}%` : width,
    "--u-skel-h": height,
  } as CSSProperties;
  return <span aria-hidden="true" className={cx("u-skel", round && "u-skel--round", className)} style={style} />;
}

/** Lines of text, the last one shorter. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <span className={cx("u-skel-text", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 && lines > 1 ? 56 : 100} />)}
    </span>
  );
}

/**
 * A list of rows that holds the place of a list while it loads: `columns` bars per row, each row the
 * height of a real one. `label` is the sentence screen readers get ("Loading orders").
 */
export function SkeletonRows({ rows = 6, columns = 4, label, compact = false, className }: {
  rows?: number;
  columns?: number;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={cx("u-skel-rows", compact && "u-skel-rows--compact", className)}>
      <span className="u-sr">{label}</span>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="u-skel-row" aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => <Skeleton key={c} width={skeletonWidth(r, c)} />)}
        </div>
      ))}
    </div>
  );
}
