"use client";

// Analytics on alyr.qa (D-070): page views, and a count of every press of a button that
// contacts ALYR (any link marked `data-cta`). Cookieless and anonymous; see posthog.ts.

import { useEffect } from "react";
import { startAnalytics, track } from "./posthog";

export function SiteAnalytics() {
  useEffect(() => {
    if (!startAnalytics("site")) return;
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
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
