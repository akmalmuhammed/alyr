import type { ElementType, ReactNode } from "react";
import { cx } from "./variants";

/**
 * A surface with a hairline and an 8 px radius, no shadow. Put a PanelHeader first, the work
 * in the middle (PanelBody for padded content) and a PanelFooter last. `clip` rounds the
 * content to the corners: use it when the panel holds a table or a list with filled rows; leave
 * it off when the panel holds controls, so their focus rings are not cut.
 */
export function Panel({ as: Tag = "section", clip = false, className, children, ...rest }: {
  as?: ElementType;
  clip?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className">) {
  return (
    <Tag {...rest} className={cx("u-panel", clip && "u-panel--clip", className)}>
      {children}
    </Tag>
  );
}

/**
 * The 52 px header of a panel: a 14 px title, an optional muted word beside it ("since
 * yesterday 09:40", a count), and a right-hand slot (a link, tabs, a count). `level` is the
 * heading level of the title; take it from the page so headings run in order.
 */
export function PanelHeader({ title, sub, right, level = 2, className }: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  level?: 2 | 3 | 4;
  className?: string;
}) {
  const Heading = `h${level}` as ElementType;
  return (
    <div className={cx("u-panel-head", className)}>
      <div className="u-panel-heading">
        <Heading className="u-panel-title">{title}</Heading>
        {sub ? <span className="u-panel-sub">{sub}</span> : null}
      </div>
      {right ? <div className="u-panel-right">{right}</div> : null}
    </div>
  );
}

/** Padded content for a panel. */
export function PanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("u-panel-body", className)}>{children}</div>;
}

/**
 * The footer of a panel: a mono note on a quiet fill. Write "By rule: ..." here wherever the
 * product counted something by rule, so the rule is on the screen. The words are the caller's.
 */
export function PanelFooter({ right, className, children }: { right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cx("u-panel-foot", className)}>
      <p className="u-panel-note">{children}</p>
      {right ? <div className="u-panel-right">{right}</div> : null}
    </div>
  );
}
