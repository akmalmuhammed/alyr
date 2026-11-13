import type { ReactNode } from "react";
import { Dot } from "./Tag";
import { cx, stepState } from "./variants";
import type { StepState } from "./variants";

export type TimelineTone = "ok" | "warn" | "bad" | "volt" | "n";

export type TimelineItem = {
  key?: string | number;
  /** What happened, as a sentence. */
  text: ReactNode;
  /** When and how, in mono: "09:38 · pay link". Times are 24 hour. */
  meta?: ReactNode;
  /** Volt: happening now or just done. Green healthy, amber waiting, red failed. Default: a plain grey dot. */
  tone?: TimelineTone;
};

/** What happened, newest first or oldest first as the caller sorts: a hairline down the start edge with a dot per event. */
export function Timeline({ items, className }: { items: readonly TimelineItem[]; className?: string }) {
  return (
    <ol className={cx("u-timeline", className)}>
      {items.map((item, index) => (
        <li key={item.key ?? index} className="u-timeline-item">
          <Dot tone={item.tone ?? "n"} className="u-timeline-dot" />
          <div className="u-timeline-text">{item.text}</div>
          {item.meta ? <div className="u-timeline-meta u-mono">{item.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────────────────

/**
 * A short run of numbered steps: done (Volt, a check), current (solid, its number), to do
 * (outlined). Volt is confirmed progress here: use it for steps that really happened.
 * `stateLabels` are the words for screen readers after each step ("done", "current"); the
 * current step also carries aria-current="step".
 */
export function Steps({ steps, current, stateLabels, label, className }: {
  steps: readonly ReactNode[];
  /** Index of the current step. Steps before it are done. Use steps.length when all are done. */
  current: number;
  stateLabels?: Partial<Record<StepState, string>>;
  /** The name of the list for screen readers ("Setup progress"). */
  label?: string;
  className?: string;
}) {
  return (
    <ol className={cx("u-steps", className)} aria-label={label}>
      {steps.map((step, index) => {
        const state = stepState(index, current);
        return (
          <li key={index} className={cx("u-step", `u-step--${state}`)} aria-current={state === "current" ? "step" : undefined}>
            <span className="u-step-mark u-mono" aria-hidden="true">
              {state === "done" ? <StepCheck /> : index + 1}
            </span>
            <span className="u-step-label">{step}</span>
            {stateLabels?.[state] ? <span className="u-sr">{stateLabels[state]}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepCheck() {
  return (
    <svg className="u-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}
