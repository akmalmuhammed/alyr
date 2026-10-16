"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// GSAP and its plugins arrive in their own chunk, only when motion is wanted and only
// after the first paint, so they never hold up the first screen.
const Choreography = dynamic(() => import("./Choreography"), { ssr: false });

declare global {
  interface Window {
    /** The failsafe set before paint in document.tsx: removes `motion` after 2.5 s. */
    __alyrMotion?: number;
  }
}

const WIDE = "(min-width: 62rem)";
const STILL = "(prefers-reduced-motion: reduce)";

/**
 * The homepage's behaviour after hydration. Everything here is an enhancement: without
 * JavaScript, or with reduced motion, every section is complete and still.
 *
 * - The language link lands on the section being read (`/ar#price`).
 * - A question linked by its address opens.
 * - On phones, the contact bar shows once the hero's button has scrolled away and hides
 *   while the closing call to action is on screen.
 * - On wide screens, the Carbon band's figures stay in place and change as each module
 *   is read (only with motion; otherwise each module keeps its own figure beside it).
 * - The scroll choreography (GSAP) loads after first paint and keeps the `motion` class.
 */
export function HomeMotion() {
  const [choreograph, setChoreograph] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const undo: (() => void)[] = [];

    // ---------------------------------------------- the language link keeps the section
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section[id]"));
    const onLanguage = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-lang]");
      if (!link) return;
      const reading = window.innerHeight * 0.35;
      let here = "";
      for (const section of sections) if (section.getBoundingClientRect().top <= reading) here = section.id;
      const url = new URL(link.href);
      url.hash = here ? `#${here}` : "";
      link.href = url.toString();
    };
    document.addEventListener("click", onLanguage, true);
    undo.push(() => document.removeEventListener("click", onLanguage, true));

    // -------------------------------------------- a question's address opens the question
    const openQuestion = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    openQuestion();
    window.addEventListener("hashchange", openQuestion);
    undo.push(() => window.removeEventListener("hashchange", openQuestion));

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
      });
      watch.observe(heroButton);
      watch.observe(closing);
      undo.push(() => watch.disconnect());
    }

    // ------------------------------------------------------- motion, only when wanted
    const still = window.matchMedia(STILL).matches;
    if (still || !root.classList.contains("motion")) return () => undo.forEach((fn) => fn());

    // The Carbon band's sticky story, on wide screens.
    const story = document.querySelector<HTMLElement>("[data-story]");
    const wide = window.matchMedia(WIDE);
    let steps: IntersectionObserver | null = null;
    const setStory = () => {
      steps?.disconnect();
      steps = null;
      if (!story) return;
      if (!wide.matches) {
        story.removeAttribute("data-story-on");
        return;
      }
      story.setAttribute("data-story-on", "");
      story.setAttribute("data-at", story.getAttribute("data-at") ?? "0");
      steps = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) story.setAttribute("data-at", (entry.target as HTMLElement).dataset.text ?? "0");
          }
        },
        { rootMargin: "-45% 0px -45% 0px" },
      );
      story.querySelectorAll("[data-text]").forEach((node) => steps?.observe(node));
    };
    setStory();
    wide.addEventListener("change", setStory);
    undo.push(() => {
      wide.removeEventListener("change", setStory);
      steps?.disconnect();
    });

    // The choreography, after first paint and when the browser is idle.
    const idle = window.requestIdleCallback
      ? (run: () => void) => window.requestIdleCallback(run, { timeout: 1200 })
      : (run: () => void) => window.setTimeout(run, 200);
    const frame = window.requestAnimationFrame(() => idle(() => setChoreograph(true)));
    undo.push(() => window.cancelAnimationFrame(frame));

    return () => undo.forEach((fn) => fn());
  }, []);

  return choreograph ? <Choreography /> : null;
}
