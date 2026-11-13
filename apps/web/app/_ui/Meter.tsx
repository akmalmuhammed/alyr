import { cx, meterPercent } from "./variants";
import type { MeterTone } from "./variants";

/**
 * A thin bar for a share of a whole (7 of 10 slots taken). The track is quiet; the fill is the
 * text colour, or a state colour when the share is itself a state. `label` names it for screen
 * readers and says what is measured; write the figures beside it in text, since the bar alone
 * is not an answer.
 */
export function Meter({ value, max = 100, label, tone = "ink", size = "sm", className }: {
  value: number;
  max?: number;
  label: string;
  tone?: MeterTone;
  /** sm 4 px, md 6 px. */
  size?: "sm" | "md";
  className?: string;
}) {
  const percent = meterPercent(value, max);
  return (
    <div
      className={cx("u-meter", `u-meter--${size}`, `u-meter--${tone}`, className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(value, 0), max)}
    >
      <span className="u-meter-fill" style={{ inlineSize: `${percent}%` }} />
    </div>
  );
}
