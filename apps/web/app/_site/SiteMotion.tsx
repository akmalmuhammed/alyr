"use client";

import { useEffect } from "react";

/**
 * The page's scroll behaviour, in one place: the header tightening, the header turning
 * Carbon while it sits over a full-bleed Carbon section, sections arriving, and the
 * approach statement lighting up word by word as it is read.
 *
 * Everything here is an enhancement. Without JavaScript, or with reduced motion on, the
 * page is complete and still (see the `.al-js` and `prefers-reduced-motion` rules).
 */
export function SiteMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-header]");
    const statement = document.querySelector<HTMLElement>("[data-statement]");
    const words = statement ? Array.from(statement.querySelectorAll<HTMLElement>("[data-w]")) : [];
    const dark = Array.from(document.querySelectorAll<HTMLElement>(".band-in, .cta"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            seen.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    document.querySelectorAll("[data-reveal]").forEach((node) => seen.observe(node));

    let lit = -1;
    let queued = false;
    const update = () => {
      queued = false;
      header?.toggleAttribute("data-scrolled", window.scrollY > 12);
      if (header) {
        // Over Carbon when the middle of the header is over a Carbon section.
        const line = header.getBoundingClientRect().height / 2;
        header.toggleAttribute("data-on-dark", dark.some((section) => {
          const box = section.getBoundingClientRect();
          return box.top <= line && box.bottom > line;
        }));
      }
      if (!statement || still) return;
      const box = statement.getBoundingClientRect();
      const height = window.innerHeight;
      // Reading starts when the text enters the lower part of the screen and is done
      // by the time it reaches the upper third.
      const progress = (height * 0.82 - box.top) / (box.height + height * 0.3);
      const count = Math.max(0, Math.min(words.length, Math.round(progress * words.length)));
      if (count === lit) return;
      lit = count;
      words.forEach((word, index) => word.toggleAttribute("data-on", index < count));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    if (still) words.forEach((word) => word.setAttribute("data-on", ""));
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      seen.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return null;
}
