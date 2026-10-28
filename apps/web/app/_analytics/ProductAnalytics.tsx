"use client";

// Analytics in onboarding (/start) and the workspace (/app) (D-070). Mounted only there:
// never on the customer pages, the payment page or the back office. A signed-in owner is
// known by their user ID and their business's ID; nothing else about them is sent.

import { useEffect } from "react";
import { identifyOwner, startAnalytics } from "./posthog";

/** Ask who is signed in and, if someone is, tell PostHog their user and business IDs. Called
 * on load, and again by /start once a new owner has signed in or created their business. */
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
  useEffect(() => {
    if (startAnalytics("product")) identifyFromSession();
  }, []);
  return null;
}
