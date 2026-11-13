/* eslint-disable @next/next/no-img-element -- the address is a shop's own stored photo, sized by the caller */
import type { CSSProperties } from "react";
import { UiIcon } from "./UiIcon";
import { cx, initials as initialsOf, rem, shopColour } from "./variants";

/**
 * A person as initials in a circle. Decorative by default (the name is written beside it); give
 * `label` when it stands alone. `tone="ink"` is for the person who is signed in. Initials come
 * from `name` (first letter of the first two words) unless `initials` is given.
 */
export function Avatar({ name, initials, size = 28, tone = "subtle", label, className }: {
  name?: string;
  initials?: string;
  /** Pixels: 20, 24, 28 (default), 32, 36, 40, 44, 52. */
  size?: number;
  tone?: "subtle" | "ink";
  label?: string;
  className?: string;
}) {
  const text = initials ?? initialsOf(name ?? "");
  const step = size <= 24 ? "sm" : size >= 40 ? "lg" : "md";
  return (
    <span
      className={cx("u-avatar", `u-avatar--${step}`, tone === "ink" && "u-avatar--ink", className)}
      style={{ "--u-box": rem(size) } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {text}
    </span>
  );
}

/**
 * A square thumbnail for an item: its photo when there is one, otherwise one of the six shop
 * colours (stable for the same `seed`) with the item's initials, or an image mark. Radius 4.
 */
export function Thumb({ size = 40, seed = 0, initials, src, alt = "", className }: {
  size?: number;
  /** Picks the colour: an id or a name. */
  seed?: number | string;
  /** Shown on the colour. Omit for the plain image mark. */
  initials?: string;
  src?: string;
  /** Empty for a decorative thumbnail (the item name is written beside it). */
  alt?: string;
  className?: string;
}) {
  const style = { "--u-box": rem(size) } as CSSProperties;
  if (src) {
    return (
      <span className={cx("u-thumb u-thumb--photo", className)} style={style}>
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className={cx("u-thumb", `u-thumb--c${shopColour(seed)}`, className)} style={style} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      {initials ? initials : <UiIcon name="image" className="u-thumb-mark" />}
    </span>
  );
}
