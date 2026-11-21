import type { ElementType, ReactNode } from "react";
import { Dot } from "./Tag";
import { cx } from "./variants";

/**
 * The empty state of a filtered or searched list: "Nothing matches that", with a way back
 * ("Clear search"). Centred in its panel. For a first-run object (the first order, the first
 * booking) use DashedSlot instead, which draws the place the thing will appear.
 */
export function Empty({ title, level = 3, action, className, children }: {
  title: ReactNode;
  level?: 2 | 3 | 4;
  action?: ReactNode;
  className?: string;
  /** One sentence: what is true, and what to do about it. */
  children?: ReactNode;
}) {
  const Heading = `h${level}` as ElementType;
  return (
    <div className={cx("u-empty", className)}>
      <Heading className="u-empty-title">{title}</Heading>
      {children ? <p className="u-empty-text">{children}</p> : null}
      {action ? <div className="u-empty-action">{action}</div> : null}
    </div>
  );
}

/**
 * The first-run empty state: a dashed outline with the hollow pending dot, saying what will
 * appear here ("Your first order shows here"). Dashed means a slot waiting to become true, so
 * use it only for something the product can do today and the shop has not done yet.
 */
export function DashedSlot({ title, level = 3, action, className, children }: {
  title: ReactNode;
  level?: 2 | 3 | 4;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = `h${level}` as ElementType;
  return (
    <div className={cx("u-slot", className)}>
      <Dot tone="pending" className="u-slot-dot" />
      <div className="u-slot-body">
        <Heading className="u-slot-title">{title}</Heading>
        {children ? <p className="u-slot-text">{children}</p> : null}
      </div>
      {action ? <div className="u-slot-action">{action}</div> : null}
    </div>
  );
}
