"use client";

// Product analytics with PostHog (D-070). The one place that touches PostHog: every other
// file calls these functions, and everything works the same without a key.
//
// Two levels, chosen by the visitor or owner in the consent prompt (Consent.tsx):
// - Until they choose, or if they say no: counted without cookies (PostHog's cookieless
//   server hash). Page views, clicks, errors and page speed; no recordings, nothing kept in
//   the browser but the choice itself.
// - If they allow it: cookies, so a returning visit is recognised, plus session recordings
//   and heatmaps.
//
// Never, at either level:
// - customer data: the customer pages (/s, /b, /pay, /t) and the back office (/ops) never
//   load this file;
// - in the workspace and onboarding: any text or input in a recording or a captured click
//   (all masked), and any recording of the inbox (founder's rule: ALYR never sees
//   customers' conversations);
// - names, emails or phone numbers as properties: an owner is known by their user ID and
//   their business's ID only;
// - IDs in addresses: every address is cut to its path, IDs replaced, before it leaves.
//
// Events go to our own address, /ingest, which forwards them to PostHog's EU region
// (next.config.ts for the app, site-worker.js for alyr.qa).

import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const UI_HOST = "https://eu.posthog.com";
/** Query parameters that may travel with an event: where the visitor came from. */
const KEPT_PARAMS = ["s", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
const SOURCE_KEY = "alyr-src";
const CHOICE_KEY = "alyr-analytics";
/** Addresses that are never recorded, even with consent. */
const NEVER_RECORD = [/^\/app\/inbox/, /^\/(s|b|pay|t)\//, /^\/ops/];

export type Choice = "granted" | "denied";
type Mode = "site" | "product";

let started = false;
let mode: Mode = "site";
const listeners = new Set<(choice: Choice | null) => void>();

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

const URL_PROPS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$session_entry_url", "$prev_pageview_pathname", "$external_click_url"];

/** The visitor's choice from the consent prompt, or null if they have not chosen. */
export function readChoice(): Choice | null {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** Start PostHog once per page. `site` is alyr.qa; `product` is /start and the workspace,
 * where every text and input is masked. Returns false when analytics is off (no key). */
export function startAnalytics(surface: Mode): boolean {
  if (started || !KEY || typeof window === "undefined") return started;
  started = true;
  mode = surface;
  const product = surface === "product";
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: UI_HOST,
    // Cookies only after "Allow"; until then, and after "No", the cookieless count.
    cookieless_mode: "on_reject",
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    capture_pageview: product ? "history_change" : true,
    capture_pageleave: true,
    autocapture: true,
    enable_heatmaps: true,
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true, network_timing: false },
    rageclick: true,
    // In the product nothing an owner or a customer wrote leaves the browser, not even
    // a button's label: clicks are known by their place on the page.
    mask_all_text: product,
    mask_all_element_attributes: product,
    // Recordings start only after "Allow" (applyRecording), and never on NEVER_RECORD.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: product ? "*" : "[data-ph-mask]",
      blockSelector: "[data-ph-block]",
      recordCrossOriginIframes: false,
    },
    disable_surveys: false,
    before_send: (event) => {
      if (!event) return event;
      const props = event.properties ?? {};
      for (const name of URL_PROPS) if (name in props) props[name] = cleanUrl(props[name]);
      if (typeof props.$pathname === "string") {
        const cleaned = cleanUrl(props.$pathname);
        props.$pathname = typeof cleaned === "string" ? cleaned.replace(/^https?:\/\/[^/]+/, "") : "";
      }
      delete props.$referring_domain_full;
      return event;
    },
    loaded: (ph) => {
      // No choice yet counts as "no" for now: counted without cookies until they choose.
      if (readChoice() === "granted") ph.opt_in_capturing({ captureEventName: null });
      else ph.opt_out_capturing();
      ph.register({ surface, lang: document.documentElement.lang || "en", source: firstSource() });
      applyRecording();
    },
  });
  return true;
}

/** Record the visitor's choice, apply it at once and keep it for next time. */
export function setChoice(choice: Choice) {
  try { localStorage.setItem(CHOICE_KEY, choice); } catch { /* storage may be blocked */ }
  if (started) {
    if (choice === "granted") posthog.opt_in_capturing({ captureEventName: "analytics_allowed" });
    else posthog.opt_out_capturing();
    applyRecording();
  }
  listeners.forEach((listener) => listener(choice));
}

/** Forget the choice so the prompt asks again (the privacy notice's "Change your choice"). */
export function resetChoice() {
  try { localStorage.removeItem(CHOICE_KEY); } catch { /* fine */ }
  listeners.forEach((listener) => listener(null));
}

export function onChoice(listener: (choice: Choice | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Record this page only with consent and only where recording is allowed. Called on load,
 * on a choice, and whenever the workspace changes section. */
export function applyRecording(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  if (!started) return;
  const allowed = readChoice() === "granted" && !NEVER_RECORD.some((rule) => rule.test(pathname));
  if (allowed && !posthog.sessionRecordingStarted()) posthog.startSessionRecording();
  if (!allowed && posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
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
 * results are counted per business. Only with consent: a cookieless visit stays anonymous. */
export function identifyOwner(userId: string, businessId: string | null, role: string) {
  if (!started || !userId || readChoice() !== "granted") return;
  posthog.identify(userId, { role });
  if (businessId) posthog.group("business", businessId);
}

export function analyticsMode(): Mode {
  return mode;
}
