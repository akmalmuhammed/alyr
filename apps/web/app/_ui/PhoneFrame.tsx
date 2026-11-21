"use client";

import type { ReactNode } from "react";
import { PhoneContext } from "./env";
import { cx } from "./variants";

/**
 * A 390-wide frame that shows a screen as it looks on a phone, for the gallery and for review. The
 * kit's phone variants (the Table's cards) switch on inside it whatever the window is, so a desktop
 * browser can show both at once. It is not for the product: a real phone is a real viewport.
 */
export function PhoneFrame({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <figure className={cx("u-phone", className)}>
      <div className="u-phone-screen">
        <PhoneContext value>{children}</PhoneContext>
      </div>
      {caption ? <figcaption className="u-phone-cap">{caption}</figcaption> : null}
    </figure>
  );
}
