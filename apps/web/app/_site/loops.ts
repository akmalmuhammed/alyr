// The figures that keep playing (founder, 26 Oct 2026: "always it should be always on
// animations and motions"; alyr-design/motion.md rule 1): the homepage's "How we work with
// you" cards (HowCards.tsx, how.css), the products frame's six tiles (SuiteFrame.tsx,
// suite.css) and the product pages' signature figures (LastOne.tsx, PaymentPaper.tsx,
// moment.css). The flows, the demos and the hero's live Agent figure run themselves.
//
// The motion is CSS; this only says when. A group (`data-loop`) holds players
// (`data-loop-play`), each played by adding `is-in` (to it and to its `data-loop-part`s):
// every animation fills backwards, so its first frame is the earlier state and it ends on
// the finished one, which is also the HTML. After its last move a player's finished state
// holds while its new words are read (`--loop-hold`, from `--words` and the pace's dwell
// tokens), then one element fades out (`loop-out`). When that fade ends, the player is played
// again (`is-again`: no row stagger, no arrival; `is-loop`: it fades back in): each of its CSS
// animations is wound back to its start. (Taking `is-in` off and on again does not restart
// them: inside a size container, Chrome does not restyle the subtree on a forced layout, and
// an animation whose name stays in the list carries on where it was.) No timers: the cycle is
// the CSS's, so `--pace` tunes it.
//
// It stops when nobody is watching: a group off screen (an IntersectionObserver) or in a
// hidden tab (`visibilitychange`) has its running animations paused where they are, and
// carried on when it is back. Its Pause control (Frames.tsx `LoopToggle`, WCAG 2.2.2) stops
// it for good, at its finished state, until Play. With reduced motion nothing is watched or
// played; every figure is the finished HTML and the CSS keys nothing on these classes.

import { LOOP_CSS } from "./loopStyle";

const CYCLE = new Set(["loop-in", "loop-out"]);

type Group = {
  root: HTMLElement;
  players: HTMLElement[];
  toggle: HTMLButtonElement | null;
  paused: boolean;
  seen: boolean;
  held: Animation[];
};

/** An animation of the scene itself, not the fade between cycles or a hover's transition. */
function isScene(animation: Animation): boolean {
  return typeof CSSAnimation !== "undefined" && animation instanceof CSSAnimation && !CYCLE.has(animation.animationName);
}

const partsOf = (player: HTMLElement) => [player, ...Array.from(player.querySelectorAll<HTMLElement>("[data-loop-part]"))];

/** Wind every CSS animation of these elements and their insides back to its start (its
 * delay included), after the classes that change them are in place. */
function rewind(nodes: Element[]) {
  for (const node of nodes) {
    for (const animation of node.getAnimations({ subtree: true })) {
      if ("animationName" in animation) animation.currentTime = 0;
    }
  }
}

/** A player still moving (or waiting on a beat of its scene); its hold does not count. */
function busy(player: HTMLElement): boolean {
  return player.getAnimations({ subtree: true }).some((a) => isScene(a) && a.playState === "running");
}

export function startLoops(): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const groups: Group[] = Array.from(document.querySelectorAll<HTMLElement>("[data-loop]")).map((root) => ({
    root,
    players: Array.from(root.querySelectorAll<HTMLElement>("[data-loop-play]")).concat(root.hasAttribute("data-loop-play") ? [root] : []),
    toggle: root.querySelector<HTMLButtonElement>("[data-loop-toggle]"),
    paused: false,
    seen: false,
    held: [],
  }));
  if (!groups.length) return () => {};
  // The cycle's styles, now that they can be used (loopStyle.ts says why not before).
  if (!document.getElementById("alyr-loop")) {
    const style = document.createElement("style");
    style.id = "alyr-loop";
    style.textContent = LOOP_CSS;
    document.head.append(style);
  }
  // Figures can be reached long after the first 4 s; the page has hydrated and this will play
  // them, so the failsafe that drops `motion` is no longer needed (motion.md rule 3).
  if (!reduce.matches) window.clearTimeout(window.__alyrMotion);
  const off: (() => void)[] = [];
  const groupOf = (node: Element) => groups.find((g) => g.root.contains(node))!;

  /** The How cards' return line, drawn with Improve each time it plays. */
  function drawLine(root: HTMLElement, again: boolean) {
    if (!root.hasAttribute("data-hw")) return;
    if (!again) {
      root.classList.add("is-looped");
      return;
    }
    root.classList.add("is-redraw", "is-looped");
    rewind(Array.from(root.querySelectorAll(".hw-loop, .hw-tick")));
  }

  /** Play a player: `first` as it is first seen (with its row's stagger and its parts'
   * arrival), `again` from a visitor's hover, focus or press, `auto` at the end of a cycle. */
  function play(player: HTMLElement, mode: "first" | "again" | "auto") {
    if (reduce.matches) return;
    const group = groupOf(player);
    const parts = partsOf(player);
    if (mode === "first") {
      if (player.classList.contains("is-in") || group.paused) return;
      for (const node of parts) node.classList.add("is-in");
    } else {
      for (const node of parts) node.classList.add("is-in");
      player.classList.add("is-again");
      player.classList.toggle("is-loop", mode === "auto");
      rewind([player]); // from its first frame again
    }
    if (player.dataset.hwCard === "improve") drawLine(group.root, mode !== "first");
    shown(group, true);
  }

  /** The Pause control is there while its figure plays (and while it is paused). */
  function shown(group: Group, on: boolean) {
    group.root.toggleAttribute("data-loop-on", on);
    if (group.toggle) group.toggle.hidden = !on;
  }

  /** A visitor's hover, focus or press: a resting player plays again at once. Paused, it plays
   * once and rests finished (the CSS runs no cycle while paused). */
  function replay(player: HTMLElement) {
    if (reduce.matches || busy(player)) return;
    play(player, "again");
  }

  // ------------------------------------------------- holding a group nobody can see
  function hold(group: Group) {
    if (group.held.length) return;
    group.held = group.root.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && "animationName" in a);
    for (const animation of group.held) animation.pause();
  }
  function release(group: Group) {
    const held = group.held;
    group.held = [];
    for (const animation of held) if (animation.playState === "paused") animation.play();
  }
  const sync = (group: Group) => (group.seen && document.visibilityState === "visible" ? release(group) : hold(group));

  const watch = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const group = groups.find((g) => g.root === entry.target);
      if (!group) continue;
      group.seen = entry.isIntersecting;
      sync(group);
    }
  });
  for (const group of groups) watch.observe(group.root);
  const onVisible = () => groups.forEach(sync);
  document.addEventListener("visibilitychange", onVisible);
  off.push(() => {
    watch.disconnect();
    document.removeEventListener("visibilitychange", onVisible);
  });

  // ------------------------------------------------------------- the cycle
  for (const group of groups) {
    const onEnd = (event: AnimationEvent) => {
      if (event.animationName !== "loop-out" || group.paused || reduce.matches) return;
      // Chrome can send the end again on the next frame, once the fade has been wound back
      // and is running: only a fade that really finished starts a cycle.
      const fade = (event.target as Element).getAnimations().find((a) => "animationName" in a && (a as CSSAnimation).animationName === "loop-out");
      if (fade && fade.playState !== "finished") return;
      const player = (event.target as Element).closest<HTMLElement>("[data-loop-play]");
      if (player) play(player, "auto");
    };
    group.root.addEventListener("animationend", onEnd);
    off.push(() => group.root.removeEventListener("animationend", onEnd));
  }

  // ------------------------------------------------------------- Pause and Play
  for (const group of groups) {
    const { toggle } = group;
    if (!toggle) continue;
    const onToggle = () => {
      group.paused = !group.paused;
      group.root.toggleAttribute("data-paused", group.paused);
      toggle.setAttribute("aria-label", (group.paused ? toggle.dataset.play : toggle.dataset.pause) ?? "");
      if (group.paused) {
        // still, at once, on the finished state: every part played, every move at its end
        group.held = [];
        for (const player of group.players) for (const node of partsOf(player)) node.classList.add("is-in");
        for (const animation of group.root.getAnimations({ subtree: true })) {
          if (!isScene(animation)) continue;
          try {
            animation.finish();
          } catch {
            /* an animation that cannot finish is left as it is */
          }
        }
      } else {
        for (const player of group.players) play(player, "again");
      }
    };
    toggle.addEventListener("click", onToggle);
    off.push(() => toggle.removeEventListener("click", onToggle));
  }

  // Reduced motion chosen while on the page: the CSS drops every move at once; the control
  // goes with it. Turned off again, the CSS plays what had played, and the cycles carry on.
  const onReduce = () => {
    for (const group of groups) shown(group, !reduce.matches && group.players.some((p) => p.classList.contains("is-in")));
  };
  reduce.addEventListener("change", onReduce);
  off.push(() => reduce.removeEventListener("change", onReduce));

  if (reduce.matches) return () => off.forEach((fn) => fn());

  // -------------------------------------------- when each player first plays
  // "How we work with you": each card once half of its canvas is in view (how.css staggers a
  // row); a hover with a mouse, the keyboard's focus or a press of its canvas plays it again.
  for (const card of document.querySelectorAll<HTMLElement>("[data-hw-card]")) {
    const canvas = card.querySelector<HTMLElement>(".hw-canvas");
    const button = card.querySelector<HTMLButtonElement>("[data-hw-play]");
    if (!canvas || !button) continue;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.5) return;
      seen.disconnect();
      play(card, "first");
    }, { threshold: 0.5 });
    seen.observe(canvas);
    const onEnter = (event: PointerEvent) => { if (event.pointerType === "mouse") replay(card); };
    const onFocus = () => { if (button.matches(":focus-visible")) replay(card); };
    const onPress = () => replay(card);
    canvas.addEventListener("pointerenter", onEnter);
    button.addEventListener("focus", onFocus);
    button.addEventListener("click", onPress);
    off.push(() => {
      seen.disconnect();
      canvas.removeEventListener("pointerenter", onEnter);
      button.removeEventListener("focus", onFocus);
      button.removeEventListener("click", onPress);
    });
  }

  // The products frame: each tile once 60% of it is in view, on every screen; a hover with a
  // mouse or the keyboard's focus plays a resting tile again.
  for (const tile of document.querySelectorAll<HTMLElement>("[data-tile]")) {
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.6) return;
      seen.disconnect();
      play(tile, "first");
    }, { threshold: 0.6 });
    seen.observe(tile);
    const onEnter = (event: PointerEvent) => { if (event.pointerType === "mouse") replay(tile); };
    const onFocus = () => { if (tile.matches(":focus-visible")) replay(tile); };
    tile.addEventListener("pointerenter", onEnter);
    tile.addEventListener("focus", onFocus);
    off.push(() => {
      seen.disconnect();
      tile.removeEventListener("pointerenter", onEnter);
      tile.removeEventListener("focus", onFocus);
    });
  }

  // A product page's signature figure plays once it is substantially in view, so its ending is
  // seen (08-rulings.md): 60% of it on screen, or its top past the middle of the screen. On a
  // wide screen the whole figure starts at once; on a phone, where its three parts stack, each
  // part starts as it arrives (moment.css counts each part's delays from its own first beat),
  // and the figure's cycle with the first. From then on the whole figure plays together.
  const wide = window.matchMedia("(min-width: 62rem)").matches;
  for (const figure of document.querySelectorAll<HTMLElement>("[data-sig]")) {
    const targets = wide ? [figure] : Array.from(figure.querySelectorAll<HTMLElement>(".sig-part"));
    const started = new Set<Element>();
    const start = (target: Element) => {
      if (started.has(target) || groupOf(figure).paused) return;
      started.add(target);
      enough.unobserve(target);
      past.unobserve(target);
      if (target === figure) play(figure, "first");
      else {
        target.classList.add("is-in");
        if (!figure.classList.contains("is-in")) {
          figure.classList.add("is-in");
          shown(groupOf(figure), true);
        }
      }
    };
    const enough = new IntersectionObserver(
      (entries) => { for (const entry of entries) if (entry.intersectionRatio >= 0.6) start(entry.target); },
      { threshold: 0.6 },
    );
    const past = new IntersectionObserver(
      (entries) => { for (const entry of entries) if (entry.isIntersecting) start(entry.target); },
      { rootMargin: "0px 0px -50% 0px" },
    );
    for (const target of targets) {
      enough.observe(target);
      past.observe(target);
    }
    off.push(() => {
      enough.disconnect();
      past.disconnect();
    });
  }

  return () => off.forEach((fn) => fn());
}
