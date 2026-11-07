"use client";

import { useEffect, useRef } from "react";

/** The chapter index beside the four stages: 01 to 04, each a link to its panel. It sticks on
 * wide screens (stages.css). With scripts, the panel being read is marked `aria-current`, so the
 * index shows where you are; without them it is plain links. Nothing here moves the page. */
export function StageIndex({ label, items }: { label: string; items: { id: string; n: string; name: string }[] }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = nav.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const links = new Map(Array.from(root.querySelectorAll<HTMLAnchorElement>("a")).map((a) => [a.getAttribute("href")!.slice(1), a]));
    const seen = new Map<string, number>();
    const mark = () => {
      // the panel with the most of it in the middle band of the screen is the one being read
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
    links.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="st-nav" aria-label={label} ref={nav}>
      <ol>
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
