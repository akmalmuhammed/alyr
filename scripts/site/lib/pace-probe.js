// Timing probe for ALYR's timed pieces. Evaluated in the page by shoot.mjs --eval (no
// screenshot is used). Returns JSON: every animation and transition each piece runs, with
// its delay, duration and end, and for the flows and demos each step's dwell.
(async (spec) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const now = () => document.timeline.currentTime;
  const cls = (n) => (n.getAttribute("class") || n.tagName.toLowerCase()).split(/\s+/)[0];
  function anims(root, since = -Infinity) {
    return document
      .getAnimations()
      .filter((a) => {
        const t = a.effect && a.effect.target;
        return t && root.contains(t) && (a.startTime ?? now()) >= since - 5;
      })
      .map((a) => {
        const tm = a.effect.getComputedTiming();
        const start = (a.startTime ?? now()) - since;
        return {
          what: a.animationName || `transition:${a.transitionProperty}`,
          on: cls(a.effect.target),
          delay: Math.round(tm.delay),
          dur: Math.round(tm.duration),
          end: Math.round(start + tm.delay + tm.duration),
        };
      });
  }
  function summary(list) {
    // one line per distinct (what, on, dur): first delay, last delay, count, last end
    const groups = new Map();
    for (const a of list) {
      const key = `${a.what}|${a.on}|${a.dur}`;
      const g = groups.get(key) ?? { what: a.what, on: a.on, dur: a.dur, n: 0, d0: Infinity, d1: -Infinity, end: 0 };
      g.n++; g.d0 = Math.min(g.d0, a.delay); g.d1 = Math.max(g.d1, a.delay); g.end = Math.max(g.end, a.end);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.end - b.end);
  }
  const total = (list) => list.reduce((m, a) => (Number.isFinite(a.end) ? Math.max(m, a.end) : m), 0);
  const into = async (node, block = "center") => { node.scrollIntoView({ block, behavior: "instant" }); await sleep(60); };

  const out = { url: location.pathname, motion: document.documentElement.classList.contains("motion") };

  // ── one-shot pieces: trigger, then read every animation they start ──────────
  async function oneShot(name, root, trigger, wait = 120, prescroll = true) {
    if (!root) return (out[name] = { missing: true });
    if (prescroll) { await into(root); await sleep(300); }
    const t0 = now();
    await trigger(root);
    await sleep(wait);
    const list = anims(root, t0);
    out[name] = { total: total(list), parts: summary(list) };
  }

  // ── flows and demos: per step dwell, plus what each step's arrival runs ──────
  async function stepper(name, root, opts) {
    if (!root) return (out[name] = { missing: true });
    const { bar, current, tab, tabs, stage, live = 3, max = 80 } = opts;
    await into(root);
    // wait until it plays
    for (let i = 0; i < 100 && !root.querySelector(bar); i++) await sleep(50);
    const steps = [];
    let seen = null;
    let lastChange = now();
    let wrapped = false;
    const startTab = 0;
    const visited = new Set();
    for (let i = 0; i < max; i++) {
      let node = root.querySelector(bar);
      for (let k = 0; k < 200 && (!node || node === seen); k++) { await sleep(20); node = root.querySelector(bar); }
      if (!node || node === seen) break;
      seen = node;
      const t = now();
      const anim = node.getAnimations()[0];
      const tabIndex = [...root.querySelectorAll(tabs)].findIndex((n) => n.getAttribute("aria-selected") === "true");
      const stepIndex = current ? [...root.querySelectorAll(current.all)].findIndex((n) => n.matches(current.on)) : 0;
      if (visited.has(`${tabIndex}:${stepIndex}`) && steps.length) { wrapped = true; break; }
      visited.add(`${tabIndex}:${stepIndex}`);
      await sleep(40);
      const arrive = anims(root.querySelector(stage) ?? root, t - 120).filter((a) => !a.on.includes("progress") && !a.on.includes("tab-bar"));
      const arriveNow = root.querySelector(".fx-now") ? anims(root.querySelector(".fx-now"), t - 120) : [];
      const all = [...arrive, ...arriveNow];
      steps.push({
        tab: tabIndex, step: stepIndex,
        dwell: Math.round(anim.effect.getComputedTiming().duration),
        words: node.style.getPropertyValue("--words") || undefined,
        arrive: total(all),
        parts: summary(all).map((g) => `${g.what}@${g.on} ${g.dur}ms d${g.d0}${g.d1 !== g.d0 ? "-" + g.d1 : ""}${g.n > 1 ? " x" + g.n : ""}`),
        wall: i < live ? undefined : null,
      });
      if (i < live) {
        await new Promise((r) => node.addEventListener("animationend", r, { once: true }));
        steps[steps.length - 1].wall = Math.round(now() - t);
      } else {
        anim.finish();
      }
      lastChange = t;
    }
    const sum = steps.reduce((s, x) => s + x.dwell, 0);
    out[name] = { steps: steps.length, cycle: sum, wrapped, list: steps };
  }

  for (const piece of spec) {
    const root = document.querySelectorAll(piece.sel)[piece.i ?? 0];
    if (piece.kind === "flow") {
      await stepper(piece.name, root, { bar: ".fx-progress", current: { all: ".fx-step", on: "[aria-current]" }, tabs: ".demo-tab", stage: ".fx-stage", live: piece.live ?? 3 });
    } else if (piece.kind === "demo") {
      await stepper(piece.name, root, { bar: ".demo-tab-bar", tabs: ".demo-tab", stage: ".demo-stage", live: piece.live ?? 2 });
    } else if (piece.kind === "sig") {
      await oneShot(piece.name, root, async (r) => { r.scrollIntoView({ block: "center", behavior: "instant" }); for (let i = 0; i < 60 && !r.classList.contains("is-in"); i++) await sleep(20); }, 150, false);
    } else if (piece.kind === "tile") {
      const tiles = [...document.querySelectorAll("[data-tile]")];
      const res = {};
      for (const tile of tiles) {
        const t0 = now();
        await into(tile);
        tile.dispatchEvent(new PointerEvent("pointerenter")); tile.focus();
        await sleep(120);
        const list = anims(tile, t0);
        res[(tile.parentElement.className.split(" ")[1] ?? "") + ":" + (tile.getAttribute("href") || "").split("/").pop()] = { total: total(list), parts: summary(list).map((g) => `${g.what}@${g.on} ${g.dur}ms d${g.d0}${g.d1 !== g.d0 ? "-" + g.d1 : ""}${g.n > 1 ? " x" + g.n : ""}`) };
      }
      out[piece.name] = res;
    } else if (piece.kind === "reveal") {
      // the first [data-reveal] group not yet in
      const nodes = [...document.querySelectorAll(piece.sel)].filter((n) => !n.classList.contains("is-in"));
      if (!nodes.length) { out[piece.name] = { missing: true }; continue; }
      const t0 = now();
      await into(nodes[0], "end");
      await sleep(200);
      const host = nodes[0].parentElement.parentElement;
      const list = anims(host, t0);
      out[piece.name] = { total: total(list), parts: summary(list) };
    } else if (piece.kind === "click") {
      await oneShot(piece.name, root, async (r) => { const b = r.querySelectorAll(piece.click)[piece.n ?? 1]; b.click(); }, piece.wait ?? 150);
    } else if (piece.kind === "split") {
      // FoldSplit: the sweep is requestAnimationFrame, the counter setTimeout: watch them
      if (!root) { out[piece.name] = { missing: true }; continue; }
      const handle = root.querySelector("[role=slider]");
      const counter = root.querySelector("[data-unread]");
      window.scrollTo(0, 0);
      await sleep(200);
      const marks = [];
      let last = handle?.getAttribute("aria-valuenow");
      let lastCount = counter?.textContent;
      const t0 = now();
      root.scrollIntoView({ block: "center", behavior: "instant" });
      for (let i = 0; i < 160; i++) {
        await sleep(16);
        const v = handle?.getAttribute("aria-valuenow");
        const c = counter?.textContent;
        if (v !== last) { marks.push(["fold", Math.round(now() - t0), v]); last = v; }
        if (c !== lastCount) { marks.push(["count", Math.round(now() - t0), c]); lastCount = c; }
      }
      const folds = marks.filter((m) => m[0] === "fold");
      const counts = marks.filter((m) => m[0] === "count");
      out[piece.name] = {
        sweep: folds.length ? folds[folds.length - 1][1] - folds[0][1] : null,
        sweepFirst: folds[0]?.[1], sweepLast: folds[folds.length - 1]?.[1],
        counts: counts.map((c) => c[1] + "ms=" + c[2]),
      };
    } else if (piece.kind === "heading") {
      const nodes = [...document.querySelectorAll("[data-split]")].filter((n) => !n.classList.contains("is-split"));
      if (!nodes.length) { out[piece.name] = { missing: true }; continue; }
      const node = nodes[piece.n ?? 0];
      const t0 = now();
      await into(node);
      await sleep(250);
      const list = anims(node, t0);
      out[piece.name] = { total: total(list), parts: summary(list), gsap: !!window.gsap };
    }
  }
  return out;
})(__SPEC__)
