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
 * - On phones, the contact bar shows once the hero's button has scrolled away and hides
 *   while the closing call to action is on screen.
 * - The scroll choreography (GSAP) loads after first paint and keeps the `motion` class.
 */
export function HomeMotion() {
  const [choreograph, setChoreograph] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const undo: (() => void)[] = [];

    // ------------------------------------------------------------- the phone contact bar
    const bar = document.querySelector<HTMLElement>("[data-bar]");
    const heroButton = document.querySelector<HTMLElement>("[data-hero-cta]");
    const closing = document.getElementById("contact");
    if (bar && heroButton && closing) {
      let heroGone = false;
      let closingSeen = false;
      const watch = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === heroButton) heroGone = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          // Reached or passed: the footer below it stays clear too.
          if (entry.target === closing) closingSeen = entry.isIntersecting || entry.boundingClientRect.top < 0;
        }
        bar.toggleAttribute("data-show", heroGone && !closingSeen);
        // the header's button turns Volt once the hero's own has scrolled away (site.css)
        root.toggleAttribute("data-hero-gone", heroGone);
      });
      watch.observe(heroButton);
      watch.observe(closing);
      undo.push(() => watch.disconnect());
    }

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
