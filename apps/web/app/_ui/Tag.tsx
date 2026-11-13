import type { ReactNode } from "react";
import { cx, statusClass, tagClass } from "./variants";
import type { DotTone, StatusTone, TagTone } from "./variants";

/** The small round mark of a state. Decorative: the words beside it carry the meaning. */
export function Dot({ tone = "n", className }: { tone?: DotTone; className?: string }) {
  return <span className={cx("u-dot", `u-dot--${tone}`, className)} aria-hidden="true" />;
}

/** A state that is a property of an object in a table or a header: a soft fill, a dot and a word. */
export function Tag({ tone = "n", dot = true, className, children }: {
  tone?: TagTone;
  /** Hide the dot when the tag is a plain label ("Sample", "Low stock"). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={tagClass(tone, className)}>
      {dot ? <Dot tone={tone === "n" ? "n" : tone === "ink" ? "ink" : tone} className="u-tag-dot" /> : null}
      {children}
    </span>
  );
}

/**
 * A dot and a word for a state in a table cell. Volt dot: happening now or just done. Green:
 * healthy. Amber: waiting. Red: failed. Hollow ring: switched off. Never colour alone.
 */
export function Status({ tone = "n", className, children }: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={statusClass(tone, className)}>
      <Dot tone={tone} />
      <span>{children}</span>
    </span>
  );
}
