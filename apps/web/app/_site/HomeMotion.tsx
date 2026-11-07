"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// GSAP and its plugins arrive in their own chunk, only when motion is wanted and only
// after the first paint, so they never hold up the first screen.
const Choreography = dynamic(() => import("./Choreography"), { ssr: false });

declare global {
  interface Window {
    /** The failsafe set before paint in document.tsx: removes `motion` after 4 s. */
    __alyrMotion?: number;
  }
}

const STILL = "(prefers-reduced-motion: reduce)";

/**
 * The homepage's behaviour after hydration. Everything here is an enhancement: without
 * JavaScript, or with reduced motion, every section is complete and still. (The language
 * link and questions opened by their address are SiteMotion's, on every page.)
 *
 * The scroll choreography (GSAP) loads after first paint and keeps the `motion` class.
 * (The phone's contact bar, on every page, is SiteMotion's.)
 */
export function HomeMotion() {
  const [choreograph, setChoreograph] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const undo: (() => void)[] = [];

    // ------------------------------------------------------- motion, only when wanted
    const still = window.matchMedia(STILL).matches;
    if (still || !root.classList.contains("motion")) return () => undo.forEach((fn) => fn());

    // Hydration proves scripts run, so the 4 s failsafe set before paint would only take
    // the motion away from a slow phone. A longer one replaces it, for the case where the
    // choreography's chunk never arrives; the choreography clears it when it starts.
    window.clearTimeout(window.__alyrMotion);
    window.__alyrMotion = window.setTimeout(() => root.classList.remove("motion"), 10_000);

    // The choreography, once the page has loaded and the browser is idle, so its chunk never
    // competes with the first screen. If that takes longer than the failsafe (10 s from
    // hydration, set above), the page simply stays still.
    const idle = window.requestIdleCallback
      ? (run: () => void) => window.requestIdleCallback(run, { timeout: 1200 })
      : (run: () => void) => window.setTimeout(run, 200);
    const start = () => idle(() => setChoreograph(true));
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    undo.push(() => window.removeEventListener("load", start));

    return () => undo.forEach((fn) => fn());
  }, []);

  return choreograph ? <Choreography /> : null;
}
