"use client";

import { useEffect } from "react";

// When each of "How we work with you"'s scenes plays (HowStack.tsx). The motion is CSS, in
// how.css, keyed on `.motion .hw-card.is-in`; this adds `is-in` once, when a panel's scene is
// mostly on screen, and plays it again on a press of its inset. Nothing loops. With reduced
// motion, or when the head script did not ask for motion, it does nothing: every scene is
// the finished HTML.

export function HowStackPlay() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !root.classList.contains("motion")) return;
    // The scenes can be reached long after the first 4 s; the page has hydrated and this will
    // play them, so the failsafe that drops `motion` is no longer needed (motion.md rule 3).
    window.clearTimeout(window.__alyrMotion);
    const vis = Array.from(document.querySelectorAll<HTMLElement>("[data-hk-vis]"));
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          seen.unobserve(entry.target);
        }
      },
      { threshold: 0.6 },
    );
    vis.forEach((node) => seen.observe(node));
    // A press plays it again from its first frame (a finished CSS animation is wound back).
    const again = (event: Event) => {
      const node = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-hk-vis]");
      if (!node) return;
      node.classList.add("is-in");
      for (const animation of node.getAnimations({ subtree: true })) if ("animationName" in animation) animation.currentTime = 0;
    };
    const buttons = vis.flatMap((node) => Array.from(node.querySelectorAll<HTMLElement>("[data-hk-play]")));
    buttons.forEach((button) => button.addEventListener("click", again));
    return () => {
      seen.disconnect();
      buttons.forEach((button) => button.removeEventListener("click", again));
    };
  }, []);
  return null;
}
