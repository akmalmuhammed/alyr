import type { ReactNode } from "react";
import { cx } from "./variants";

export type WorkbenchPane = "list" | "main" | "context";

/**
 * The layout of a screen you work in all day (the inbox): a list on the inline start, the thing you
 * are working on in the middle, and what is known about it on the inline end. It fills the height it
 * is given and each pane scrolls on its own, so the list stays put while a long thread scrolls.
 * There is no content padding: the panes draw their own headers edge to edge.
 *
 * Wide (62rem and up, measured on the workbench itself): three panes. Below that the context pane
 * goes away. On a phone (under 48rem) one pane shows at a time: `pane` says which, and the screen
 * moves between them (a back arrow, a row to open). Panes are labelled regions, so a screen reader
 * can jump between them.
 */
export function Workbench({ list, main, context, pane = "main", labels, className }: {
  list: ReactNode;
  main: ReactNode;
  context?: ReactNode;
  /** Which pane a phone shows. Ignored where more than one fits. */
  pane?: WorkbenchPane;
  labels: { list: string; main: string; context: string };
  className?: string;
}) {
  return (
    <div className={cx("u-wb", className)}>
      <div className={cx("u-wb-grid", `u-wb--${pane}`)}>
        <section className="u-wb-pane u-wb-list" aria-label={labels.list}>{list}</section>
        <section className="u-wb-pane u-wb-main" aria-label={labels.main}>{main}</section>
        {context ? <aside className="u-wb-pane u-wb-context" aria-label={labels.context}>{context}</aside> : null}
      </div>
    </div>
  );
}
