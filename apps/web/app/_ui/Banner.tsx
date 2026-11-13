import type { ReactNode } from "react";
import { Dot } from "./Tag";
import { bannerClass, bannerRole } from "./variants";
import type { BannerTone } from "./variants";

/**
 * A line of state under the page title: a soft tone fill, a dot, a sentence in the text colour
 * and one action at the end (a link or a quiet button, passed as `action`). One per page. A
 * bad banner is announced at once (role alert); the others are read in turn (role status).
 * Say what the number is and where it comes from; never an alarm without a count.
 */
export function Banner({ tone = "n", action, className, children }: {
  tone?: BannerTone;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={bannerClass(tone, className)} role={bannerRole(tone)}>
      <Dot tone={tone} className="u-banner-dot" />
      <p className="u-banner-text">{children}</p>
      {action ? <div className="u-banner-action">{action}</div> : null}
    </div>
  );
}
