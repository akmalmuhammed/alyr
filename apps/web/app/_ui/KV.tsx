import type { ReactNode } from "react";
import { cx } from "./variants";

/** A list of definition rows: a key on one side, a value on the other, a hairline between. */
export function KVList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cx("u-kvlist", className)}>{children}</dl>;
}

/**
 * One definition row. The key is 13 px muted; the value is 13 px medium, right-aligned (left in
 * Arabic: it follows the end of the line). `mono` sets the value in IBM Plex Mono: use it for
 * identifiers, times, phone numbers and money, not for words ("Included", "No fee").
 */
export function KV({ k, mono = false, className, children }: {
  k: ReactNode;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("u-kv", className)}>
      <dt className="u-kv-key">{k}</dt>
      <dd className={cx("u-kv-value", mono && "u-mono")}>{children}</dd>
    </div>
  );
}
