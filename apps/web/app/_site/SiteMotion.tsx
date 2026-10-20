"use client";

import { useEffect } from "react";

/**
 * The page's scroll behaviour, in one place: the header tightening, the header turning
 * Carbon while it sits over a full-bleed Carbon section, sections arriving, and the
 * approach statement lighting up word by word as it is read. Also, on every page: the
 * language link lands on the section being read (`/ar/bookings#how`), and a question
 * linked by its address opens.
 *
 * Everything here is an enhancement. Without JavaScript, or with reduced motion on, the
 * page is complete and still (see the `.al-js` and `prefers-reduced-motion` rules).
 */
export function SiteMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-header]");
    const statement = document.querySelector<HTMLElement>("[data-statement]");
    const words = statement ? Array.from(statement.querySelectorAll<HTMLElement>("[data-w]")) : [];
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
    document.querySelectorAll("[data-reveal], [data-m]").forEach((node) => seen.observe(node));

    // The language link keeps the section being read.
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

    // A question's address opens the question.
    const openQuestion = () => {
      const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
      if (target instanceof HTMLDetailsElement) target.open = true;
    };
    openQuestion();
    window.addEventListener("hashchange", openQuestion);

    // The header turns Carbon while its middle line (about 30 px down) is over a full-bleed
    // Carbon section. An observer on that one line, so nothing measures the page as it loads.
    const over = new Map<Element, boolean>();
    let dark: IntersectionObserver | null = null;
    const watchDark = () => {
      dark?.disconnect();
      over.clear();
      if (!header) return;
      dark = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) over.set(entry.target, entry.isIntersecting);
          header.toggleAttribute("data-on-dark", Array.from(over.values()).some(Boolean));
        },
        { rootMargin: `-30px 0px -${Math.max(0, window.innerHeight - 31)}px 0px` },
      );
      document.querySelectorAll(".band-in, .cta").forEach((node) => dark?.observe(node));
    };
    watchDark();

    let lit = -1;
    let queued = false;
    const update = () => {
      queued = false;
      header?.toggleAttribute("data-scrolled", window.scrollY > 12);
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
    window.addEventListener("resize", watchDark);
    return () => {
      document.removeEventListener("click", onLanguage, true);
      window.removeEventListener("hashchange", openQuestion);
      seen.disconnect();
      dark?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("resize", watchDark);
    };
  }, []);
  return null;
}
