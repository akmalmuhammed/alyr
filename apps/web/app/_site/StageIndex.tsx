"use client";

import { useEffect, useRef } from "react";

/** The chapter bar over the four stages: 01 to 04, each a link to its band. It sticks under the
 * header while the stages pass (stages.css). With scripts, the band being read is marked
 * `aria-current` and a thin ink rule under the bar fills with how far through the stages you
 * are (`--p`, 0 to 1); without them it is plain links and the rule stays empty. Nothing here
 * moves the page. */
export function StageIndex({ label, items }: { label: string; items: { id: string; n: string; name: string }[] }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = nav.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const links = new Map(Array.from(root.querySelectorAll<HTMLAnchorElement>("a")).map((a) => [a.getAttribute("href")!.slice(1), a]));
    const seen = new Map<string, number>();
    const mark = () => {
      // the band with the most of it in the middle of the screen is the one being read
      let best = "";
      let most = 0;
      seen.forEach((ratio, id) => {
        if (ratio > most) { most = ratio; best = id; }
      });
      links.forEach((a, id) => (id === best ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        mark();
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: [0, .25, .5, .75, 1] },
    );
    const bands = Array.from(links.keys()).map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    bands.forEach((el) => io.observe(el));

    // the progress rule: from the first band's top to the last band's bottom, at the bottom edge
    // of the bar. One frame at a time, passive, and nothing but a custom property is written.
    let frame = 0;
    const progress = () => {
      frame = 0;
      const first = bands[0];
      const last = bands[bands.length - 1];
      if (!first || !last) return;
      const top = first.getBoundingClientRect().top + window.scrollY;
      const end = last.getBoundingClientRect().bottom + window.scrollY - window.innerHeight;
      const p = end > top ? (window.scrollY - top) / (end - top) : 0;
      root.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(progress);
    };
    progress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <nav className="st-nav" aria-label={label} ref={nav}>
      <ol className="wrap">
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>
              <span className="st-nav-n" aria-hidden="true">{item.n}</span>
              <span>{item.name}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
