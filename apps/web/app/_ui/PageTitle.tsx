import type { ElementType, ReactNode } from "react";
import { cx } from "./variants";

/**
 * The title row of a page: a 24 px title, one muted sentence that says what the page shows, and a
 * right-hand slot for the page's actions (the one Volt button goes last). No eyebrow, no hero
 * type. `level` is 1 for the page's own title.
 */
export function PageTitle({ title, sub, right, level = 1, className }: {
  title: ReactNode;
  /** One sentence. It may carry the day's count in words ("14 open orders across five places"). */
  sub?: ReactNode;
  right?: ReactNode;
  level?: 1 | 2;
  className?: string;
}) {
  const Heading = `h${level}` as ElementType;
  return (
    <div className={cx("u-title-row", className)}>
      <div className="u-title-text">
        <Heading className="u-title">{title}</Heading>
        {sub ? <p className="u-title-sub">{sub}</p> : null}
      </div>
      {right ? <div className="u-title-right">{right}</div> : null}
    </div>
  );
}

/**
 * The small mono caps label of a block: "SALES TODAY", "LAST ORDERS". In Arabic it is written
 * in the Arabic face without capitals or tracking. Use `as` for its element (a heading when it
 * titles a section of the page).
 */
export function SectionLabel({ as: Tag = "div", className, children }: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx("u-label", className)}>{children}</Tag>;
}

/** A labelled block of a page: the label row (with an optional right-hand link) and its content. */
export function Section({ label, right, level = 2, className, children }: {
  label: ReactNode;
  right?: ReactNode;
  level?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const Heading = `h${level}` as ElementType;
  return (
    <section className={cx("u-section", className)}>
      <div className="u-section-head">
        <Heading className="u-label u-section-label">{label}</Heading>
        {right ? <div className="u-section-right">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}
