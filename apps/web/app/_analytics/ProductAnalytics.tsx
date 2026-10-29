"use client";

// Analytics in onboarding (/start) and the workspace (/app) (D-070). Mounted only there:
// never on the customer pages, the payment page or the back office. Every text and input is
// masked; the inbox is never recorded. A signed-in owner who allowed analytics is known by
// their user ID and their business's ID; nothing else about them is sent.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Consent } from "./Consent";
import { applyRecording, identifyOwner, onChoice, startAnalytics } from "./posthog";

/** Ask who is signed in and, if someone is, tell PostHog their user and business IDs. Called
 * on load, after "Allow", and by /start once a new owner has signed in or created their
 * business. Does nothing without consent. */
export async function identifyFromSession() {
  try {
    const r = await fetch("/api/auth/me", { cache: "no-store" });
    if (!r.ok) return;
    const me = (await r.json()) as { signed_in?: boolean; id?: string; business_id?: string; role?: string };
    if (me.signed_in && me.id) identifyOwner(me.id, me.business_id ?? null, me.role ?? "");
  } catch {
    /* analytics never gets in the way */
  }
}

export function ProductAnalytics() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!startAnalytics("product")) return;
    const first = setTimeout(() => { setOn(true); identifyFromSession(); }, 0);
    const stop = onChoice((choice) => { if (choice === "granted") identifyFromSession(); });
    return () => { clearTimeout(first); stop(); };
  }, []);
  // The workspace changes section without a page load: stop recording on the inbox.
  useEffect(() => { applyRecording(pathname ?? ""); }, [pathname]);
  return on ? <Consent surface="product" /> : null;
}
