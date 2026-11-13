"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./variants";

/**
 * A square filter chip. `on` is the filter that is applied. It is a toggle button
 * (aria-pressed), so a row of chips is a row of independent filters; use Tabs when exactly one
 * view is shown at a time. The first chip of a row is usually "All" with the total as its count.
 */
export function Chip({ on = false, count, className, children, type = "button", ...native }: {
  on?: boolean;
  /** A count in mono after the label. A zero is still shown: it is true. */
  count?: number | string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "aria-pressed">) {
  return (
    <button {...native} type={type} aria-pressed={on} className={cx("u-chip", on && "u-chip--on", className)}>
      <span>{children}</span>
      {count !== undefined && count !== "" ? <span className="u-chip-count u-mono">{count}</span> : null}
    </button>
  );
}
