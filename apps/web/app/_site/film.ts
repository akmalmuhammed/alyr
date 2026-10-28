// The hero's film, played (HeroFilm.tsx, filmScript.ts; D-062). The film is CSS: this only says
// when, as loops.ts does for the figures that keep playing.
//
// - After load (HomeMotion calls it, only when motion is wanted), it has the rest of the canvas
//   drawn (FilmScenes), then writes the film's tracks into the page and adds `is-on`: every
//   track starts at the still, so the first frame is the one already on screen, and from there
//   the film loops.
// - It stops when nobody is watching: off screen (an IntersectionObserver) or in a hidden tab,
//   every track is paused where it is and carried on when it is back. Its Pause control holds
//   the frame (as a film does) until Play.
// - Reduced motion, chosen or changed while on the page: the still, and no Pause control.
// - The last shot's numbers belong to the real dashboard (FilmDash.tsx): it is told when the film
//   reaches 16:20 and when it goes back to 16:19 under the closing fold.
// - When the screen crosses the phone's width the camera's track changes; every track is set
//   back to the same time so the film stays in step.

import { DASH, filmCss, trackClasses } from "./filmScript";
import { FILM_DASH_EVENT } from "./FilmDash";
import { FILM_MOUNT, FILM_READY } from "./FilmScenes";
import { FILM_SCENE_CSS } from "./filmStyle";
import { LIVE_CSS } from "./liveStyle";
import { LOOP_CSS } from "./loopStyle";

const STILL = "(prefers-reduced-motion: reduce)";
const PHONE = "(max-width: 47.99rem)";

/** The Pause control's place, at the end of the plate's bar. */
const TOGGLE_CSS =
  ".hf .hf-toggle{bottom:calc((44px * var(--fz) - 2.75rem) / 2);inset-inline-end:calc(48px * var(--fz) - .75rem);color:var(--on-band-quiet)}" +
  ".hf .hf-toggle:hover{color:var(--on-band)}" +
  ".hf .hf-toggle:focus-visible{outline:var(--focus-width) solid var(--focus-on-band);outline-offset:-2px}" +
  "@media (max-width:47.99rem){.hf .hf-toggle{bottom:calc((40px * var(--fz) - 2.75rem) / 2);inset-inline-end:calc(var(--space-3) - .75rem)}}";

function style(id: string, css: string) {
  if (document.getElementById(id)) return;
  const node = document.createElement("style");
  node.id = id;
  node.textContent = css;
  document.head.append(node);
}

export function startFilm(): () => void {
  const found = document.querySelector<HTMLElement>("[data-film]");
  if (!found) return () => {};
  const root: HTMLElement = found;
  const toggle = root.querySelector<HTMLButtonElement>("[data-loop-toggle]");
  const reduce = window.matchMedia(STILL);
  const phone = window.matchMedia(PHONE);
  let seen = true;
  let paused = false;
  let on = false;
  let drawn = false;
  let starting = false;
  let timer = 0;
  const later = (fn: () => void) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 400 }) : window.setTimeout(fn, 0));

  const running = () =>
    root.getAnimations({ subtree: true }).filter((a) => "animationName" in a && String((a as CSSAnimation).animationName).startsWith("hfk-"));
  const camera = () => running().find((a) => String((a as CSSAnimation).animationName).startsWith("hfk-cam-"));
  const dash = (at: "before" | "after") => window.dispatchEvent(new CustomEvent(FILM_DASH_EVENT, { detail: at }));

  /** The next change of the last shot's numbers, from where the camera's track is. */
  function schedule() {
    window.clearTimeout(timer);
    const ref = camera();
    if (!on || paused || !seen || !ref || root.hasAttribute("data-hold")) return;
    const timing = ref.effect?.getComputedTiming();
    const progress = timing?.progress;
    const length = Number(timing?.duration);
    if (progress == null || !Number.isFinite(length)) return;
    const after = DASH.after / DASH.loop;
    const before = DASH.before / DASH.loop;
    const until = (f: number) => ((f - progress + 1) % 1) * length;
    const [next, wait] = until(after) < until(before) ? (["after", until(after)] as const) : (["before", until(before)] as const);
    timer = window.setTimeout(() => {
      dash(next);
      schedule();
    }, Math.max(0, wait) + 20);
  }

  function run() {
    // `data-hold` keeps it where it is (the capture scripts set it to draw one moment)
    const playing = on && !paused && seen && document.visibilityState === "visible" && !root.hasAttribute("data-hold");
    for (const a of running()) {
      if (playing && a.playState === "paused") a.play();
      else if (!playing && a.playState === "running") a.pause();
    }
    if (playing) schedule();
    else window.clearTimeout(timer);
  }

  function begin() {
    if (on || reduce.matches) return;
    // first the rest of the canvas (FilmCanvas), drawn a few windows at a time; then the film
    if (!drawn) {
      style("alyr-film-scenes", FILM_SCENE_CSS);
      window.dispatchEvent(new Event(FILM_MOUNT));
      return;
    }
    if (starting) return;
    starting = true;
    // Each step in its own moment, so none holds the page up for long: the tracks are written,
    // then the parts start in two frames (the camera, the last shot and the clock first: they
    // are what is on screen, the still; then the rest, each window laid out as it starts); then
    // every track is set to the camera's time, so they all play as one.
    later(() => {
      const css = filmCss() + TOGGLE_CSS;
      later(() => {
        style("alyr-loop", LOOP_CSS);
        style("alyr-agent-live-film", LIVE_CSS);
        style("alyr-film", css);
        const names = trackClasses().map((c) => `.${c}`).join(",");
        // two batches: what is on screen in the still, then the rest of the canvas
        const groups: Element[][] = [
          [root.querySelector(".hf-world"), root.querySelector(".hf-cover"), root.querySelector(".hf-bar"), root.querySelector(".hf-dash"), root.querySelector(".hf-cap-week")].filter((x): x is Element => !!x),
          Array.from(root.querySelectorAll(".hf-card:not(.hf-dash), .hf-lanes, .hf-cap:not(.hf-cap-week)")),
        ];
        const go = (el: Element, top: boolean) => {
          if (top) el.classList.add("hf-live");
          if (el.matches(names)) el.classList.add("hf-go");
          for (const part of el.querySelectorAll(names)) part.classList.add("hf-go");
        };
        const step = (i: number) => {
          if (reduce.matches) return;
          if (i < groups.length) {
            for (const el of groups[i]) go(el, true);
            requestAnimationFrame(() => step(i + 1));
            return;
          }
          starting = false;
          on = true;
          root.classList.add("is-on");
          if (toggle) toggle.hidden = false;
          align();
        };
        step(0);
      });
    });
  }

  function stop() {
    on = false;
    paused = false;
    starting = false;
    root.classList.remove("is-on");
    for (const el of root.querySelectorAll(".hf-go")) el.classList.remove("hf-go");
    root.removeAttribute("data-paused");
    if (toggle) toggle.hidden = true;
    window.clearTimeout(timer);
    dash("after");
  }

  /** Every track to the camera's time: once all have started, and after the camera's track
   * changed with the layout. */
  function align() {
    const ref = camera();
    if (!ref || ref.currentTime == null) return;
    for (const a of running()) if (a !== ref) a.currentTime = ref.currentTime;
    run();
  }

  const ready = () => {
    drawn = true;
    begin();
  };
  window.addEventListener(FILM_READY, ready, { once: true });
  const watch = new IntersectionObserver((entries) => {
    seen = entries.some((e) => e.isIntersecting);
    run();
  }, { threshold: 0 });
  watch.observe(root);
  const visibility = () => run();
  document.addEventListener("visibilitychange", visibility);
  const motion = () => (reduce.matches ? stop() : begin());
  reduce.addEventListener("change", motion);
  const layout = () => requestAnimationFrame(align);
  phone.addEventListener("change", layout);
  const press = () => {
    paused = !paused;
    root.toggleAttribute("data-paused", paused);
    if (toggle) toggle.setAttribute("aria-label", (paused ? toggle.dataset.play : toggle.dataset.pause) ?? "");
    run();
  };
  toggle?.addEventListener("click", press);

  begin();

  return () => {
    watch.disconnect();
    window.removeEventListener(FILM_READY, ready);
    document.removeEventListener("visibilitychange", visibility);
    reduce.removeEventListener("change", motion);
    phone.removeEventListener("change", layout);
    toggle?.removeEventListener("click", press);
    window.clearTimeout(timer);
  };
}
