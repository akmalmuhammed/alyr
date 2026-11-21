import { FLIPS_IN_RTL, ICONS, type IconName } from "./icons";

export type IconSize = "sm" | "md" | "lg";

/**
 * One interface icon. A 24 grid, a line with square ends and mitred corners, no fill, drawn in
 * `currentColor` and rendered at 16px unless a size says otherwise.
 *
 * Icons are decoration: the svg is `aria-hidden` unless `label` is given, which turns it into an
 * image with that name (the words must come from the screen's copy file, in both languages).
 * Glyphs that point along the reading direction mirror in right-to-left; `flip` forces it.
 */
export function Icon({ name, size = "md", label, flip, className }: {
  name: IconName;
  size?: IconSize;
  label?: string;
  flip?: boolean;
  className?: string;
}) {
  const mirrors = flip ?? FLIPS_IN_RTL.has(name);
  const classes = ["u-icon", `u-icon--${size}`, mirrors ? "u-icon--flip" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      focusable="false"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {ICONS[name].split("M").filter(Boolean).map((d, i) => <path key={i} d={`M${d}`} />)}
    </svg>
  );
}

export type { IconName };
