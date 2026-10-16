"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// The homepage's scroll choreography. Loaded on its own, after first paint, only when the
// visitor has not asked for reduced motion (HomeMotion). The moves themselves are mostly
// CSS in home.css, keyed on `.is-in`; GSAP says when, scrubs the two progress rules, splits
// the section headings into lines and leans the main buttons toward the pointer.
// Tokens: durations 120 / 240 / 480 / 720 ms, `expo.out` for arrivals (the CSS `--ease`),
// 60 ms stagger, one travel vector at 45°.

const ARRIVE = "expo.out";
const ONCE = "top 88%";

export default function Choreography() {
  useGSAP(() => {
    const root = document.documentElement;
    // The failsafe got there first: the page is already showing everything, still.
    if (!root.classList.contains("motion")) return;
    window.clearTimeout(window.__alyrMotion);

    // Things that arrive once, when read. CSS does the move; this only says when.
    gsap.utils.toArray<HTMLElement>("[data-m]").forEach((node) => {
      ScrollTrigger.create({ trigger: node, start: node.dataset.start ?? ONCE, once: true, onEnter: () => node.classList.add("is-in") });
    });

    // Section headings rise line by line out of a mask. Lines only, never characters:
    // splitting Arabic into letters would break how they join. Screen readers get the
    // whole heading (aria: "auto"), and it splits again when the width or fonts change.
    // Arabic headings are not split at all: the split put a full stop that follows
    // "ALYR Chat" (in its <bdi>) on a line of its own. They rise whole, from a mask.
    const arabic = root.lang === "ar";
    gsap.utils.toArray<HTMLElement>("[data-split]").forEach((heading) => {
      if (arabic) {
        gsap.fromTo(
          heading,
          { clipPath: "inset(0 0 100% 0)", y: 24 },
          {
            clipPath: "inset(0 0 -10% 0)", y: 0, duration: 0.72, ease: ARRIVE,
            scrollTrigger: { trigger: heading, start: ONCE, once: true },
          },
        );
        return;
      }
      SplitText.create(heading, {
        type: "lines",
        mask: "lines",
        aria: "auto",
        autoSplit: true,
        linesClass: "split-line",
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: 0.72,
            ease: ARRIVE,
            stagger: 0.06,
            scrollTrigger: { trigger: heading, start: ONCE, once: true },
          }),
      });
    });

    // The Carbon band: the rule beside the modules fills Volt as they are read.
    const story = document.querySelector<HTMLElement>("[data-story]");
    const storyFill = story?.querySelector<HTMLElement>("[data-fill]");
    if (story && storyFill) {
      gsap.fromTo(
        storyFill,
        { scaleY: 0 },
        { scaleY: 1, ease: "none", scrollTrigger: { trigger: story, start: "top 50%", end: "bottom 50%", scrub: 0.4 } },
      );
    }

    // How it works: the rail fills Volt with the scroll, and each step's node turns as
    // the fill reaches it. Across on wide screens, down the start edge on phones.
    const rail = document.querySelector<HTMLElement>("[data-rail]");
    const railFill = rail?.querySelector<HTMLElement>("[data-rail-fill]");
    const railSteps = rail ? gsap.utils.toArray<HTMLElement>(rail.querySelectorAll("[data-rail-step]")) : [];
    if (rail && railFill && railSteps.length) {
      const media = gsap.matchMedia();
      media.add({ wide: "(min-width: 62rem)", narrow: "(max-width: 61.99rem)" }, (context) => {
        const wide = Boolean(context.conditions?.wide);
        const axis = wide ? "scaleX" : "scaleY";
        const last = railSteps.length - 1;
        gsap.fromTo(
          railFill,
          { [axis]: 0 },
          {
            [axis]: 1,
            ease: "none",
            scrollTrigger: {
              trigger: rail,
              start: wide ? "top 78%" : "top 72%",
              end: wide ? "top 34%" : "bottom 58%",
              scrub: 0.4,
              onUpdate: (self) => {
                railSteps.forEach((step, index) => step.classList.toggle("is-on", self.progress >= index / last - 0.001));
              },
            },
          },
        );
      });
    }

    // The main buttons lean 2 to 3 px toward the pointer, on devices with a fine pointer.
    const leaners = gsap.utils.toArray<HTMLElement>("[data-lean]");
    if (!leaners.length || !window.matchMedia("(pointer: fine)").matches) return;
    const pulls = leaners.map((button) => ({
      button,
      x: gsap.quickTo(button, "x", { duration: 0.48, ease: "power3.out" }),
      y: gsap.quickTo(button, "y", { duration: 0.48, ease: "power3.out" }),
    }));
    const lean = (event: PointerEvent) => {
      for (const { button, x, y } of pulls) {
        const box = button.getBoundingClientRect();
        const dx = event.clientX - (box.left + box.width / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const reach = box.width * 0.9;
        const distance = Math.hypot(dx, dy);
        if (distance > reach) {
          x(0);
          y(0);
          continue;
        }
        const pull = 3 * (1 - distance / reach);
        x((dx / (distance || 1)) * pull);
        y((dy / (distance || 1)) * pull);
      }
    };
    window.addEventListener("pointermove", lean, { passive: true });
    return () => window.removeEventListener("pointermove", lean);
  });

  return null;
}
