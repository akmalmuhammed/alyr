"use client";

// Product analytics with PostHog (D-070). The one place that touches PostHog: every other
// file calls `startAnalytics`, `track` or `identifyOwner` and works the same without a key.
//
// What is never sent, by design:
// - no cookies: the public site counts visitors with PostHog's cookieless server hash;
//   the product keeps nothing in the browser between visits;
// - no screen recordings, no automatic capture of clicks or text, no surveys;
// - no customer data: the customer pages (/s, /b, /pay, /t) and the back office never load
//   this file; in the workspace only the section's name is counted (a page view of
//   /app/inbox, never what is in it); every address is stripped to its path, with IDs
//   replaced, before it leaves;
// - no names, emails or phone numbers: a signed-in owner is known by their user ID and
//   their business's ID only.
//
// Events go to our own address, /ingest, which forwards them to PostHog's EU region
// (next.config.ts for the app, site-worker.js for alyr.qa), so the security policy stays
// "self only" and the data's location is fixed to the EU (docs/data-residency.md).

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const UI_HOST = "https://eu.posthog.com";
/** Query parameters that may travel with an event: where the visitor came from. */
const KEPT_PARAMS = ["s", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
const SOURCE_KEY = "alyr-src";

let started = false;

/** An address reduced to what analytics needs: its path with IDs replaced, and only the
 * source parameters. `https://alyr.qa/app/inbox?contact=…#x` → `https://alyr.qa/app/inbox`. */
export function cleanUrl(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  try {
    const url = new URL(value, "https://alyr.qa");
    const path = url.pathname
      .split("/")
      .map((part) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part) || /\d{4,}/.test(part) || part.length > 32
          ? ":id"
          : part,
      )
      .join("/");
    const kept = new URLSearchParams();
    for (const name of KEPT_PARAMS) {
      const v = url.searchParams.get(name);
      if (v) kept.set(name, v.slice(0, 64));
    }
    const query = kept.toString();
    return `${url.origin}${path}${query ? `?${query}` : ""}`;
  } catch {
    return undefined;
  }
}

const URL_PROPS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url", "$prev_pageview_pathname"];

/** Start PostHog once per page. `site` is alyr.qa (cookieless, anonymous); `product` is
 * /start and the workspace (an owner is identified after signing in). Returns false when
 * analytics is off (no key, or in a page that must not load it). */
export function startAnalytics(mode: "site" | "product"): boolean {
  if (started || !KEY || typeof window === "undefined") return started;
  started = true;
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: UI_HOST,
    autocapture: false,
    capture_pageview: mode === "product" ? "history_change" : true,
    capture_pageleave: true,
    disable_session_recording: true,
    disable_surveys: true,
    enable_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    persistence: "memory",
    person_profiles: "identified_only",
    respect_dnt: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    ...(mode === "site" ? { cookieless_mode: "always" as const } : {}),
    before_send: (event) => {
      if (!event) return event;
      const props = event.properties ?? {};
      for (const name of URL_PROPS) if (name in props) props[name] = cleanUrl(props[name]);
      if (typeof props.$pathname === "string") props.$pathname = (cleanUrl(props.$pathname) as string)?.replace(/^https:\/\/[^/]+/, "") ?? "";
      delete props.$referring_domain_full;
      return event;
    },
  });
  posthog.register({ surface: mode, lang: document.documentElement.lang || "en", source: firstSource() });
  return true;
}

/** Where this visit came from (`?s=` on a link, a QR code or a leave-behind), kept for the
 * visit only so a click three pages later still knows it. */
function firstSource(): string {
  let source = "";
  try {
    source = new URLSearchParams(window.location.search).get("s")?.slice(0, 64) ?? "";
    const kept = sessionStorage.getItem(SOURCE_KEY);
    if (kept && !source) return kept;
    if (source && !kept) sessionStorage.setItem(SOURCE_KEY, source);
    return kept || source || "direct";
  } catch {
    return source || "direct";
  }
}

/** Count something that happened. Properties must never carry a name, an email, a phone
 * number, a message or a customer's anything. */
export function track(event: string, properties: Record<string, string | number | boolean | null | undefined> = {}) {
  if (!started) return;
  posthog.capture(event, properties);
}

/** After an owner signs in: know them by their user ID and their business by its ID, so
 * results are counted per business. Nothing else about them is sent. */
export function identifyOwner(userId: string, businessId: string | null, role: string) {
  if (!started || !userId) return;
  posthog.identify(userId, { role });
  if (businessId) posthog.group("business", businessId);
}
