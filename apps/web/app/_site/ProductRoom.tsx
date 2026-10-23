"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The homepage's products as a control room (ALY-209). The index, the steps and the drawn
 * workspace are server HTML (HomePage.tsx, `Suite`); this component only says which product
 * is being read and points the camera at its corner.
 *
 * - Wide screens, with scripts: the workspace is pinned beside the steps. The step crossing
 *   the middle of the screen is the one being read: its corner is brought forward at true
 *   size and plays its job once; before the first and after the last, the camera pulls
 *   back to the whole workspace.
 * - Phones, or no scripts: each step has its own corner under its words (home.css), and
 *   the step being read plays it. The index becomes a pinned row of names.
 * - Reduced motion: the same frames, with no travel; each corner shows its finished state.
 *
 * The camera is measured, not guessed: the desk is laid out at true size, and the scale and
 * offset that centre a corner are set on it as one transform, which CSS eases.
 */
export function ProductRoom({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const room = root.current;
    if (!room) return;
    const stage = room.querySelector<HTMLElement>(".room-stage");
    const desk = room.querySelector<HTMLElement>(".room-desk");
    const steps = Array.from(room.querySelectorAll<HTMLElement>(".room-step"));
    const links = Array.from(room.querySelectorAll<HTMLAnchorElement>(".room-index a"));
    const row = room.querySelector<HTMLElement>(".room-index ol");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 62rem)");
    let on = "all";

    // The camera: the whole desk fitted to the stage, or one corner at true size (never
    // larger), centred. Measured in the desk's own layout box, before its transform.
    function aim() {
      if (!stage || !desk || !wide.matches) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const tile = on === "all" ? null : desk.querySelector<HTMLElement>(`.room-tile[data-k="${on}"]`);
      let scale: number;
      let x: number;
      let y: number;
      if (tile) {
        scale = Math.min(1, (w * 0.8) / tile.offsetWidth, (h * 0.74) / tile.offsetHeight);
        x = tile.offsetLeft + tile.offsetWidth / 2;
        y = tile.offsetTop + tile.offsetHeight / 2;
      } else {
        scale = Math.min(w / desk.offsetWidth, h / desk.offsetHeight) * 0.9;
        x = desk.offsetWidth / 2;
        y = desk.offsetHeight / 2;
      }
      desk.style.transform = `translate(${w / 2 - x * scale}px, ${h / 2 - y * scale}px) scale(${scale})`;
    }

    // Count a corner's figures up to their value, once, when it plays: "QAR 38" from
    // QAR 0. The words come back exactly as drawn at the end.
    const counting = new WeakSet<Node>();
    function count(scope: Element) {
      if (still.matches) return;
      scope.querySelectorAll(".d-sum b, .d-crop-sum, .d-crop-total").forEach((node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        while (walker.nextNode()) texts.push(walker.currentNode as Text);
        for (const text of texts) {
          if (counting.has(text) || !/\d/.test(text.data)) continue;
          counting.add(text);
          const original = text.data;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / 720);
            const eased = 1 - Math.pow(1 - t, 3);
            text.data = t < 1
              ? original.replace(/\d[\d,]*/g, (figure) => {
                const value = Math.round(Number(figure.replace(/,/g, "")) * eased);
                return figure.includes(",") ? value.toLocaleString("en-US") : String(value);
              })
              : original;
            if (t < 1) requestAnimationFrame(tick);
            else counting.delete(text);
          };
          requestAnimationFrame(tick);
        }
      });
    }

    function show(key: string) {
      if (key === on) return;
      on = key;
      room!.dataset.on = key;
      for (const node of room!.querySelectorAll<HTMLElement>("[data-k]")) {
        const mine = node.dataset.k === key;
        // a step's or a tile's `is-on` replays its corner's job; the index marks where you are
        if (node.matches(".room-step, .room-tile")) node.classList.toggle("is-on", mine);
      }
      links.forEach((link) => {
        if (link.dataset.k === key) link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      });
      const tile = wide.matches ? desk?.querySelector(`.room-tile[data-k="${key}"]`) : null;
      const step = steps.find((node) => node.dataset.k === key);
      const playing = tile ?? step?.querySelector(".room-crop");
      if (playing) count(playing);
      aim();
      // on phones the index is a row that scrolls sideways: keep the current name in view
      // without moving the page
      const link = links.find((node) => node.dataset.k === key);
      if (row && link && row.scrollWidth > row.clientWidth) {
        const box = link.getBoundingClientRect();
        const frame = row.getBoundingClientRect();
        if (box.left < frame.left || box.right > frame.right) {
          row.scrollBy({ left: box.left - frame.left - (frame.width - box.width) / 2, behavior: still.matches ? "auto" : "smooth" });
        }
      }
    }

    // The step crossing the middle of the screen is the one being read.
    const reading = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) show((entry.target as HTMLElement).dataset.k ?? "all");
          // scrolled back above the first step: the whole workspace again
          else if (entry.target === steps[0] && entry.boundingClientRect.top > 0) show("all");
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    steps.forEach((step) => reading.observe(step));

    aim();
    const resize = new ResizeObserver(() => aim());
    if (stage) resize.observe(stage);
    wide.addEventListener("change", aim);

    return () => {
      reading.disconnect();
      resize.disconnect();
      wide.removeEventListener("change", aim);
    };
  }, []);

  return (
    <div className="room" data-on="all" ref={root}>
      {children}
    </div>
  );
}
