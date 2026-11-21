import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./Button";
import { cx } from "./variants";

export type PagerStep = {
  /** "Previous page" / "Next page": the button's name for screen readers. */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * The foot of a list: where you are ("1 to 14 of 14 · QAR 4,849 in open orders") and two arrows. The
 * words are the screen's (write the range with `pageRange` from tableLogic.ts); the arrows point along the
 * reading direction and mirror in Arabic. `summary` is announced politely when it changes, so a
 * screen reader hears that the page changed.
 */
export function Pager({ summary, previous, next, navLabel, className }: {
  summary: ReactNode;
  previous: PagerStep;
  next: PagerStep;
  /** The nav's name ("Pages of orders"). */
  navLabel: string;
  className?: string;
}) {
  return (
    <nav className={cx("u-pager", className)} aria-label={navLabel}>
      <p className="u-pager-summary" aria-live="polite">{summary}</p>
      <div className="u-pager-steps">
        <IconButton size="xs" icon={<Icon name="left" />} label={previous.label} disabled={previous.disabled} onClick={previous.onClick} />
        <IconButton size="xs" icon={<Icon name="right" />} label={next.label} disabled={next.disabled} onClick={next.onClick} />
      </div>
    </nav>
  );
}
