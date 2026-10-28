"use client";

// Analytics on alyr.qa (D-070): page views, clicks, errors and page speed, counted without
// cookies until the visitor allows more in the consent prompt; plus a named event for every
// press of a button that contacts ALYR (any link marked `data-cta`). See posthog.ts.

import { useEffect, useState } from "react";
import { Consent } from "./Consent";
import { startAnalytics, track } from "./posthog";

export function SiteAnalytics() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!startAnalytics("site")) return;
    const first = setTimeout(() => setOn(true), 0);
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[data-cta]");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      track("cta_click", {
        cta: link.getAttribute("data-cta") ?? "",
        channel: href.startsWith("https://wa.me") ? "whatsapp" : href.startsWith("mailto:") ? "email" : "page",
        page: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick);
    return () => { clearTimeout(first); document.removeEventListener("click", onClick); };
  }, []);
  return on ? <Consent surface="site" /> : null;
}
