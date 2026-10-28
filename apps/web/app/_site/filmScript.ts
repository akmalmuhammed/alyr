// The homepage hero's film (D-062, the founder's choice of 28 Oct 2026, prototype 05D): one
// afternoon at the fictional Qirfa Bakery, Thursday 15:58 to 16:20, told in the product's own
// screens on a Carbon plate cut by the fold. This file is the film's script and its camera,
// and it writes the film as CSS: one keyframe track per moving part, all on one clock.
//
// - The film is CSS animations only (transform and opacity, on the compositor). Every track
//   runs for the same loop, `calc(64 * var(--play-4))` (35.9 s at pace 1.3), so `--pace` tunes
//   the whole film; the times below are seconds at the pace it was timed at (1.3), written as
//   fractions of the loop.
// - It starts on its still (`STILL`, the ALYR Agent home at 16:20), which is also the HTML, so
//   the first frame after load is the frame before it: nothing jumps. With reduced motion or
//   without scripts the still is all there is.
// - The canvas is one plane of windows in three lanes (Orders, Bookings, Money), each lane
//   starting 440 further along than the one under it, so their starts follow the fold. The
//   camera moves by translate and scale only; its path is sampled here into keyframes.
// - Arabic mirrors it: the canvas is laid out from the inline start, and every horizontal
//   move is multiplied by `--dir`.
// - Every number agrees with the homepage's sample at 16:20 (the bakery's Agent sample, the
//   products frame, the order flow): docs/framer-review/09-hero-film-log.md lists them.
//
// The server component (HeroFilm.tsx) takes the positions and the still from here; the client
// (film.ts) writes the tracks into the page after load.

import { motion } from "../_tokens/tokens";

// ------------------------------------------------------------------ time
/** A number to so many places. */
const round = (n: number, places: number) => Number(n.toFixed(places));
/** The pace the film was timed at. A different `--pace` scales the whole film. */
const TIMED_AT = 1.3;
const sec = (token: string) => (parseFloat(token) * (token.endsWith("ms") ? 0.001 : 1) * TIMED_AT) / motion.pace.pace;
const P2 = sec(motion.pace["play-2"]);
const P3 = sec(motion.pace["play-3"]);
const P4 = sec(motion.pace["play-4"]);
const STAG = sec(motion.pace["play-stagger"]);
/** One loop, in `--play-4` beats (the CSS duration is this many `--play-4`). */
export const BEATS = 64;
export const L = BEATS * P4;
const TRAVEL = parseFloat(motion.travel.travel);
const EASE_CSS = motion.ease.ease;
const EASE_ARGS = EASE_CSS.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];

/** What happens when (film seconds). The clock in the plate's bar follows `CLOCK`. */
export const E = {
  aisha: 0.9, // 15:58 Aisha I. asks whether her order is ready; it waits for the team
  remind: 5.2, // 16:00 Noor A.'s reminder goes, two hours before her 6:00 pm cake tasting
  lina: 9.85, // 16:09 Lina F.'s order #1441 takes the last cheesecake; it goes on her account
  conf: 13.55, // 16:11 Yusuf confirms #1441 on the Orders screen; ALYR tells Lina
  sIn: 16.25, // 16:13 Sara M. writes
  sOut: 16.85, // 16:13 the order page goes back at once
  ready: 20.35, // 16:15 #1440 marked ready; ALYR tells Omar A.
  maha: 21.05, // 16:16 Maha J. books 6:30 pm; ALYR confirms it
  done: 21.75, // 16:17 Omar collects; #1440 marked done; ALYR thanks him
  flag: 22.45, // 16:18 Needs a look: QAR 3,400 owed for over 30 days
  sOrder: 25.25, // 16:19 Sara orders 7 items, QAR 98
  row1442: 26.95, // 16:19 #1442 lands on the Orders screen, New
  dash: 30.15, // 16:20 the ALYR Agent home counts it: 50 orders, QAR 8,520
} as const;
export const CLOSE = 34.6; // the fold closes over the film
export const RESET = 35.25; // the canvas goes back to 15:58 under it
/** The still: reduced motion, no scripts, and the film's first frame. The ALYR Agent home at
 * 16:20, settled: the one screen, in the dashboard sample's numbers. It is the last moment
 * before the fold closes, so the film moves as soon as it starts (founder, 29 Oct 2026: "all
 * animations should start right away"); the home's own beat comes round again in each loop. */
export const STILL = CLOSE - 0.35;

/** The clock's minutes (after midnight) at each event; between two events it runs evenly. */
const CLOCK: [number, number][] = [
  [0, 958], [E.remind, 960], [E.lina, 969], [E.conf, 971], [E.sIn, 973], [E.ready, 975],
  [E.maha, 976], [E.done, 977], [E.flag, 978], [E.sOrder, 979], [E.dash - 0.4, 980],
];
export function clockAt(t: number): number {
  if (t <= CLOCK[0][0]) return CLOCK[0][1];
  for (let i = 1; i < CLOCK.length; i++) {
    const [t1, m1] = CLOCK[i];
    const [t0, m0] = CLOCK[i - 1];
    if (t <= t1) return Math.floor(m0 + (m1 - m0) * ((t - t0) / (t1 - t0)) + 1e-6);
  }
  return CLOCK[CLOCK.length - 1][1];
}
export const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
/** Every minute the clock shows, in order, with when it starts showing. */
export const MINUTES: { at: number; m: number }[] = (() => {
  const out: { at: number; m: number }[] = [{ at: 0, m: CLOCK[0][1] }];
  for (let t = 0; t <= E.dash; t += 0.01) {
    const m = clockAt(t);
    if (m !== out[out.length - 1].m) out.push({ at: round(t, 2), m });
  }
  return out;
})();

// ------------------------------------------------------------------ the canvas
export type CardKey = "inbox" | "chat" | "table" | "stock" | "book" | "noor" | "owed" | "lina" | "dash";
type Rect = { x: number; y: number; w: number; h: number };
/** World units are px at scale 1, from the canvas's top inline-start corner. */
export const CARDS: Record<CardKey | "pair", Rect> = {
  inbox: { x: 880, y: 44, w: 380, h: 316 },
  chat: { x: 1300, y: 44, w: 420, h: 316 },
  table: { x: 1760, y: 44, w: 540, h: 316 },
  stock: { x: 2340, y: 44, w: 400, h: 316 },
  book: { x: 440, y: 484, w: 440, h: 340 },
  noor: { x: 920, y: 484, w: 360, h: 316 },
  owed: { x: 0, y: 924, w: 440, h: 316 },
  lina: { x: 480, y: 924, w: 360, h: 316 },
  dash: { x: 2820, y: 44, w: 520, h: 500 },
  pair: { x: 1300, y: 44, w: 1000, h: 316 }, // Sara's chat and the Orders screen, side by side
};
export type LaneKey = "orders" | "bookings" | "money";
export const LANES: { key: LaneKey; x: number; y: number; end: number }[] = [
  { key: "orders", x: 880, y: 0, end: 2740 },
  { key: "bookings", x: 440, y: 440, end: 1280 },
  { key: "money", x: 0, y: 880, end: 840 },
];
const WORLD_BOTTOM = 1240;

// ------------------------------------------------------------------ the stages
/** The film is drawn on a stage of fixed size, scaled as a whole to the screen (`--fz`):
 * "wide" beside the headline (and under it on a tablet), "phone" under the text. */
export type Layout = "wide" | "phone";
type Geo = { w: number; h: number; bar: number; inset: number; phone: boolean };
export const STAGE: Record<Layout, Geo> = {
  wide: { w: 1000, h: 724, bar: 44, inset: 48, phone: false },
  phone: { w: 390, h: 360, bar: 40, inset: 16, phone: true },
};
/** The phone plate's cut corner (`--cut-plate-sm`, 3rem). */
export const PHONE_CUT = 48;
/** x of the fold at height y on the wide stage: from the top inline-end to the bottom
 * inline-start, 45°. */
const foldX = (g: Geo, y: number) => g.h - y;

type View = { s: number; tx: number; ty: number };
function focal(g: Geo, key: CardKey | "pair", k: number): View {
  const c = CARDS[key];
  const avail = g.h - g.bar;
  if (g.phone) {
    const fit = Math.min(1, (g.w - 28) / c.w, (avail - 62) / c.h);
    const s = fit * k;
    return { s, tx: g.w / 2 - (c.x + c.w / 2) * s, ty: avail - 14 - (c.y + c.h) * s };
  }
  const fitK = key === "pair" ? 0.56 : key === "dash" ? 0.8 : key === "table" ? 0.9 : 1;
  const s = fitK * k;
  return { s, tx: g.w - g.inset - (c.x + c.w) * s, ty: avail - 66 - (c.y + c.h) * s };
}
function wideView(g: Geo, mid: boolean): View {
  const avail = g.h - g.bar;
  if (g.phone) {
    const s = mid ? 0.34 : 0.3;
    return { s, tx: 14 - (mid ? 300 : 0) * s, ty: avail - 12 - WORLD_BOTTOM * s };
  }
  const s = mid ? 0.49 : 0.43;
  const y0 = avail - 22 - (WORLD_BOTTOM - 880) * s; // the Money lane's top
  return { s, tx: foldX(g, y0) + 20, ty: y0 - 880 * s };
}

type Key = { t: number; v: "wide" | "mid" | [CardKey | "pair", number]; move?: boolean; dip?: number };
const KEYS: Key[] = [
  { t: 0, v: "wide" },
  { t: 3.1, v: "wide" },
  { t: 4.75, v: ["book", 1], move: true },
  { t: 8.3, v: ["book", 1.035] },
  { t: 9.7, v: ["stock", 1], move: true, dip: 0.5 },
  { t: 12.2, v: ["stock", 1.035] },
  { t: 13.1, v: ["table", 1], move: true },
  { t: 15.2, v: ["table", 1.03] },
  { t: 16.1, v: ["chat", 1], move: true, dip: 0.12 },
  { t: 18.9, v: ["chat", 1.035] },
  { t: 20.2, v: "mid", move: true },
  { t: 24.0, v: "mid" },
  { t: 25.1, v: ["pair", 1], move: true },
  { t: 26.0, v: ["pair", 1.015] },
  { t: 26.9, v: ["table", 1], move: true },
  { t: 28.6, v: ["table", 1.035] },
  { t: 30.0, v: ["dash", 1], move: true, dip: 0.45 },
  { t: CLOSE + 0.7, v: ["dash", 1.045] },
];
const viewOf = (g: Geo, k: Key): View => (k.v === "wide" ? wideView(g, false) : k.v === "mid" ? wideView(g, true) : focal(g, k.v[0], k.v[1]));
const sine = (p: number) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, p))) - 1) / 2;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** State time: the canvas goes back to its start under the closing fold. */
const st = (t: number) => (t >= RESET ? t - L : t);

/** Where the camera is at film time t: the world point under a fixed anchor is carried across
 * with sine in-out and the scale in log space, pulling back on the long moves; a hold drifts in
 * at an even pace, so the shot is never quite still. */
export function camAt(layout: Layout, time: number): View {
  const g = STAGE[layout];
  const t = st(time);
  if (t <= KEYS[0].t) return viewOf(g, KEYS[0]);
  const R = g.phone ? { x: g.w / 2, y: (g.h - g.bar) / 2 } : { x: g.w - g.inset - 230, y: (g.h - g.bar) / 2 + 40 };
  for (let i = 1; i < KEYS.length; i++) {
    const b = KEYS[i];
    if (t > b.t) continue;
    const a = KEYS[i - 1];
    const A = viewOf(g, a);
    const B = viewOf(g, b);
    const p = (t - a.t) / (b.t - a.t);
    const u = b.move ? sine(p) : p;
    const wa = { x: (R.x - A.tx) / A.s, y: (R.y - A.ty) / A.s };
    const wb = { x: (R.x - B.tx) / B.s, y: (R.y - B.ty) / B.s };
    const s = Math.exp(lerp(Math.log(A.s), Math.log(B.s), u) - (b.dip ?? 0) * Math.sin(Math.PI * u));
    return { s, tx: R.x - lerp(wa.x, wb.x, u) * s, ty: R.y - lerp(wa.y, wb.y, u) * s };
  }
  return viewOf(g, KEYS[KEYS.length - 1]);
}

const r2 = (n: number) => round(n, 2);
const r4 = (n: number) => round(n, 4);
/** The camera's transform: horizontal moves follow the inline direction. */
export const camCss = (v: View) => `translate(calc(var(--dir) * ${r2(v.tx)}px), ${r2(v.ty)}px) scale(${r4(v.s)})`;

// ------------------------------------------------------------------ the editor's light
// Each window's strength through the film: the one the event is on is lit, the rest step back.
type Shot = [number, number, Partial<Record<CardKey | "_", number>>];
const SHOTS: Shot[] = [
  [-2, 3.1, { _: 0.92 }],
  [4.6, 8.3, { book: 1, noor: 0.25, _: 0.1 }],
  [9.5, 12.2, { stock: 1, table: 0.25, _: 0.1 }],
  [13.0, 15.2, { table: 1, stock: 0.2, chat: 0.2, _: 0.1 }],
  [16.0, 18.9, { chat: 1, inbox: 0.25, table: 0.2, _: 0.1 }],
  [20.1, 24.0, { inbox: 0.96, book: 0.96, owed: 0.96, lina: 0.96, noor: 0.7, chat: 0.6, _: 0.5 }],
  [25.0, 26.0, { chat: 1, table: 0.9, _: 0.1 }],
  [26.8, 28.6, { table: 1, chat: 0.16, stock: 0.16, _: 0.1 }],
  [29.9, 40, { dash: 1, _: 0 }],
];

// ------------------------------------------------------------------ captions
/** A caption: mono words on a hairline that draws from the window's start and ends in a tick
 * (the shape of a figure caption), over the window the event is on. */
export type CapKey = "lanes" | "reminder" | "stock" | "confirm" | "page" | "order" | "week";
export const CAPS: { key: CapKey; a: number; b: number; card?: CardKey }[] = [
  { key: "lanes", a: 0.55, b: 2.95 },
  { key: "reminder", a: E.remind + 0.25, b: 8.1, card: "book" },
  { key: "stock", a: E.lina + 0.3, b: 12.0, card: "stock" },
  { key: "confirm", a: E.conf + 0.2, b: 15.0, card: "table" },
  { key: "page", a: E.sOut + 0.3, b: 18.7, card: "chat" },
  { key: "order", a: E.row1442 + 0.2, b: 28.45, card: "table" },
  { key: "week", a: E.dash + 0.45, b: CLOSE - 0.1, card: "dash" },
];

/** A caption's place in the world for one layout, at the shot it belongs to: over its window,
 * clear of the fold (or of the phone's cut corner) for as long as it is on screen (the camera
 * drifts while it holds, so the clearance is the larger of its first and last moments; the
 * week's caption is also the still), drawn at true size (`--cs` undoes the camera's scale). */
export function capGeometry(layout: Layout, key: CapKey) {
  const g = STAGE[layout];
  const cap = CAPS.find((c) => c.key === key)!;
  const v = camAt(layout, cap.a + 0.3);
  let x: number;
  let y: number;
  let w: number;
  if (cap.card) {
    const r = CARDS[cap.card];
    // the clearance in world units, at the caption's first moment and at its last
    let clearWorld = 0;
    for (const at of [v, camAt(layout, cap.b)]) {
      const ax = at.tx + r.x * at.s;
      const ay = at.ty + r.y * at.s - 14;
      const clear = g.phone ? Math.max(0, PHONE_CUT + 8 - ay) : Math.max(0, foldX(g, ay - 24) + 12 - ax);
      clearWorld = Math.max(clearWorld, clear / at.s);
    }
    x = v.tx + (r.x + clearWorld) * v.s;
    y = v.ty + r.y * v.s - 14;
    w = (r.w - clearWorld) * v.s;
  } else {
    const l = LANES[0];
    y = v.ty + (l.y + 30) * v.s - 34;
    x = g.phone ? 14 : Math.max(v.tx + l.x * v.s, foldX(g, y - 18) + 14);
    w = Math.min(g.w - g.inset - x, 420);
  }
  return { x: r2((x - v.tx) / v.s), y: r2((y - v.ty) / v.s), w: r2(Math.max(120, w)), cs: r4(1 / v.s) };
}

/** The lanes' names and their rules, in the two shots that show all three lanes. */
export type LaneShot = "wide" | "mid";
export function laneGeometry(layout: Layout, shot: LaneShot, key: LaneKey) {
  const g = STAGE[layout];
  const v = viewOf(g, { t: 0, v: shot });
  const l = LANES.find((x) => x.key === key)!;
  const y = v.ty + (l.y + 30) * v.s;
  const sx = v.tx + l.x * v.s;
  const lx = g.phone ? Math.max(sx, 14) : Math.max(sx, foldX(g, y - 16) + 14);
  const rx = g.phone ? Math.max(sx, 0) : Math.max(sx, foldX(g, y));
  const ex = v.tx + l.end * v.s;
  const shown = y > 26 && y < g.h - g.bar - 18;
  const w = (sx2: number) => r2((sx2 - v.tx) / v.s);
  return { lx: w(lx), ly: r2((y - 19 - v.ty) / v.s), rx: w(rx), rw: r2(Math.max(0, ex - rx) / v.s), ry: r2((y - v.ty) / v.s), cs: r4(1 / v.s), shown };
}

// ------------------------------------------------------------------ keyframes
type Vals = { o?: number; x?: number; y?: number; s?: number; sx?: number; c?: string };
type Frame = [number, Vals, boolean?]; // time, values, an eased segment starts here
const OFF = TRAVEL * 0.7071;

function css(v: Vals): string {
  const out: string[] = [];
  if (v.o !== undefined) out.push(`opacity:${r2(v.o)}`);
  const tf: string[] = [];
  if (v.x !== undefined || v.y !== undefined) tf.push(`translate(calc(var(--dir)*${r2(v.x ?? 0)}px),${r2(v.y ?? 0)}px)`);
  if (v.s !== undefined) tf.push(`scale(${r4(v.s)})`);
  if (v.sx !== undefined) tf.push(`scaleX(${r4(v.sx)})`);
  if (tf.length) out.push(`transform:${tf.join(" ")}`);
  if (v.c !== undefined) out.push(`clip-path:${v.c}`);
  return out.join(";");
}
const pct = (t: number) => `${round((Math.min(L, Math.max(0, t)) / L) * 100, 4)}%`;

function keyframes(name: string, frames: Frame[]): string {
  const sorted = frames.map((f, i) => ({ f, i })).sort((a, b) => a.f[0] - b.f[0] || a.i - b.i).map((x) => x.f);
  const body = sorted
    .map(([t, v, eased]) => `${pct(t)}{${css(v)}${eased ? `;animation-timing-function:${EASE_CSS}` : ""}}`)
    .join("");
  return `@keyframes ${name}{${body}}`;
}

/** A part that changes at given times: each change moves from the values before it to its own
 * over `d` (eased unless `lin`). At `RESET` it is put back to how it started, unseen. */
type Move = { t: number; to: Vals; d?: number; lin?: boolean };
function track(init: Vals, moves: Move[], reset = true): Frame[] {
  const out: Frame[] = [[0, init]];
  let cur = init;
  for (const m of moves) {
    out.push([m.t, cur, !m.lin]);
    cur = { ...cur, ...m.to };
    out.push([m.t + (m.d ?? P4), cur]);
  }
  if (reset) {
    out.push([RESET - 0.002, cur]);
    out.push([RESET, init]);
    out.push([L, init]);
  } else out.push([L, cur]);
  return out;
}
/** Arrives along 45° (from the inline-end top) at a, and stays. */
const arriveAt = (a: number, d = P4) => track({ o: 0, x: OFF, y: -OFF }, [{ t: a, to: { o: 1, x: 0, y: 0 }, d }]);
/** Shown until a, then gone (it fades). */
const leaveAt = (a: number, d = P2) => track({ o: 1 }, [{ t: a, to: { o: 0 }, d, lin: true }]);
/** Gone until a, then shown (it fades in). */
const showAt = (a: number, d = P2) => track({ o: 0 }, [{ t: a, to: { o: 1 }, d, lin: true }]);
/** A Volt mark: on at a, held while the event is the news, then gone. */
const voltAt = (a: number, hold = 1.9) => track({ o: 0 }, [{ t: a, to: { o: 1 }, d: P2, lin: true }, { t: a + hold, to: { o: 0 }, d: P4, lin: true }]);
/** In at a, out at b: arrives along 45° and leaves the same way. */
const during = (a: number, b: number) =>
  track({ o: 0, x: OFF, y: -OFF }, [
    { t: a, to: { o: 1, x: 0, y: 0 } },
    { t: b, to: { o: 0, x: -OFF * 0.7, y: OFF * 0.7 }, d: P3 },
    { t: b + P3 + 0.01, to: { x: OFF, y: -OFF }, d: 0.01, lin: true },
  ]);

function focusOf(card: CardKey, t: number): number {
  const v = (s: Shot) => s[2][card] ?? s[2]._ ?? 0.3;
  if (t <= SHOTS[0][1]) return v(SHOTS[0]);
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    if (t >= s[0] && t <= s[1]) return v(s);
    const n = SHOTS[i + 1];
    if (n && t > s[1] && t < n[0]) return lerp(v(s), v(n), sine((t - s[1]) / (n[0] - s[1])));
  }
  return v(SHOTS[SHOTS.length - 1]);
}
function focusTrack(card: CardKey): Frame[] {
  const out: Frame[] = [];
  const times = new Set<number>([0, L]);
  for (const s of SHOTS) for (const t of [s[0], s[1]]) if (t > 0 && t < L) times.add(t);
  for (let i = 0; i < SHOTS.length - 1; i++) {
    const a = SHOTS[i][1];
    const b = SHOTS[i + 1][0];
    for (let k = 1; k < 4; k++) times.add(a + ((b - a) * k) / 4);
  }
  times.add(RESET - 0.002);
  times.add(RESET);
  for (const t of [...times].sort((a, b) => a - b)) out.push([t, { o: focusOf(card, st(t)) }]);
  return out;
}

function cameraTrack(layout: Layout): Frame[] {
  const out: Frame[] = [];
  const times = new Set<number>([0, L, RESET - 0.002, RESET]);
  for (let i = 1; i < KEYS.length; i++) {
    const a = KEYS[i - 1].t;
    const b = Math.min(KEYS[i].t, RESET);
    const step = KEYS[i].move ? 0.1 : 0.5;
    for (let t = a; t < b; t += step) times.add(round(t, 3));
    times.add(b);
  }
  for (const t of [...times].filter((t) => t >= 0 && t <= L).sort((a, b) => a - b)) {
    const v = camAt(layout, t);
    out.push([t, { x: v.tx, y: v.ty, s: v.s }]);
  }
  return out;
}

/** The fold closing over the film and opening again: a Carbon cover, the stage's size, shows only
 * where x + y >= k, and k sweeps from past the far corner down to the fold and back, so its 45°
 * edge crosses the canvas and leaves it again. Drawn as a clip-path, so no box ever reaches past
 * the plate. Always five points, so every two frames match. */
function coverPoly(g: Geo, k: number): string {
  const box: [number, number][] = [[0, 0], [g.w, 0], [g.w, g.h], [0, g.h]];
  const out: [number, number][] = [];
  const inside = (p: [number, number]) => p[0] + p[1] >= k;
  for (let i = 0; i < box.length; i++) {
    const p = box[i];
    const q = box[(i + 1) % box.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) {
      const t = (k - p[0] - p[1]) / (q[0] + q[1] - p[0] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  if (!out.length) out.push([g.w, g.h]);
  while (out.length < 5) out.push(out[out.length - 1]);
  return `polygon(${out.map(([x, y]) => `${r2(x)}px ${r2(y)}px`).join(",")})`;
}
function coverTrack(layout: Layout): Frame[] {
  const g = STAGE[layout];
  const hi = g.w + g.h + 2;
  const lo = g.phone ? 0 : g.h - 2;
  const at = (k: number): Vals => ({ c: coverPoly(g, k) });
  const out: Frame[] = [[0, at(hi)], [CLOSE, at(hi)]];
  const n = 12;
  for (let i = 1; i <= n; i++) out.push([CLOSE + ((RESET - CLOSE) * i) / n, at(hi + (lo - hi) * sine(i / n))]);
  for (let i = 1; i <= n; i++) {
    const p = i / n;
    out.push([RESET + (L - RESET) * p, at(lo + (hi - lo) * (1 - Math.pow(1 - p, 3)))]);
  }
  return out;
}

// ------------------------------------------------------------------ the inbox
/** The team's inbox: every conversation's last message and when it came, newest on top. A row
 * moves up when its conversation changes. */
export type ConvKey = "sara" | "omar" | "maha" | "lina" | "noor" | "aisha" | "rania" | "mariam" | "tariq";
export const CONVS: { key: ConvKey; ev: { t: number; at: string; say: number }[] }[] = [
  { key: "sara", ev: [{ t: -99, at: "mon", say: 0 }, { t: E.sIn, at: "16:13", say: 1 }, { t: E.sOut, at: "16:13", say: 2 }, { t: E.sOrder + 0.55, at: "16:19", say: 3 }] },
  { key: "omar", ev: [{ t: -99, at: "15:56", say: 0 }, { t: E.ready + 0.1, at: "16:15", say: 1 }, { t: E.done + 0.1, at: "16:17", say: 2 }] },
  { key: "maha", ev: [{ t: -99, at: "mon", say: 0 }, { t: E.maha + 0.2, at: "16:16", say: 1 }] },
  { key: "lina", ev: [{ t: -99, at: "tue", say: 0 }, { t: E.lina + 0.1, at: "16:09", say: 1 }, { t: E.conf + 0.1, at: "16:11", say: 2 }] },
  { key: "noor", ev: [{ t: -99, at: "sun", say: 0 }, { t: E.remind + 0.1, at: "16:00", say: 1 }] },
  { key: "aisha", ev: [{ t: -99, at: "13:20", say: 0 }, { t: E.aisha, at: "15:58", say: 1 }] },
  { key: "rania", ev: [{ t: -99, at: "15:52", say: 0 }] },
  { key: "mariam", ev: [{ t: -99, at: "15:47", say: 0 }] },
  { key: "tariq", ev: [{ t: -99, at: "15:32", say: 0 }] },
];
export const INBOX_ROW = 54;
const minutesOf = (at: string) => (/^\d/.test(at) ? Number(at.slice(0, 2)) * 60 + Number(at.slice(3)) : -1);
const lastEv = (c: (typeof CONVS)[number], t: number) => {
  let k = 0;
  c.ev.forEach((e, i) => {
    if (e.t <= t) k = i;
  });
  return k;
};
function ranks(t: number): number[] {
  const order = CONVS.map((c, i) => ({ i, m: minutesOf(c.ev[lastEv(c, t)].at), f: c.ev[lastEv(c, t)].t }));
  order.sort((a, b) => b.m - a.m || b.f - a.f || a.i - b.i);
  const rank: number[] = [];
  order.forEach((o, r) => (rank[o.i] = r));
  return rank;
}
/** Each conversation's row at film time t (0 is the top). */
export const inboxRank = (i: number, t: number) => ranks(t)[i];
const INBOX_T = [...new Set(CONVS.flatMap((c) => c.ev.map((e) => e.t)).filter((t) => t > -99))].sort((a, b) => a - b);

// ------------------------------------------------------------------ the chats
/** A chat as the team sees it: the newest message at the foot, each arriving as it is sent, the
 * older ones scrolling up and out at the top. Heights are the drawn heights. */
export type Msg = { k: string; t: number; kind: "in" | "out" | "day" | "event"; h: number };
export const CHAT_VIEW = 272;
export const THREADS: Record<"chat" | "noor" | "lina", Msg[]> = {
  chat: [
    { k: "mon", t: -99, kind: "day", h: 20 },
    { k: "old", t: -99, kind: "out", h: 32 },
    { k: "today", t: E.sIn - 0.02, kind: "day", h: 20 },
    { k: "in", t: E.sIn, kind: "in", h: 32 },
    { k: "out", t: E.sOut, kind: "out", h: 63 },
    { k: "event", t: E.sOrder, kind: "event", h: 22 },
    { k: "confirm", t: E.sOrder + 0.55, kind: "out", h: 32 },
  ],
  noor: [
    { k: "sun", t: -99, kind: "day", h: 20 },
    { k: "booked", t: -99, kind: "out", h: 67 },
    { k: "thanks", t: -99, kind: "in", h: 32 },
    { k: "today", t: E.remind + 0.08, kind: "day", h: 20 },
    { k: "remind", t: E.remind + 0.1, kind: "out", h: 49 },
  ],
  lina: [
    { k: "tue", t: -99, kind: "day", h: 20 },
    { k: "thanks", t: -99, kind: "in", h: 32 },
    { k: "today", t: E.lina + 0.08, kind: "day", h: 20 },
    { k: "received", t: E.lina + 0.1, kind: "out", h: 67 },
    { k: "confirmed", t: E.conf + 0.1, kind: "out", h: 32 },
  ],
};
export function threadTops(msgs: Msg[]): number[] {
  const tops: number[] = [];
  let y = 14;
  for (const m of msgs) {
    tops.push(y);
    y += m.h + 10;
  }
  return tops;
}
function threadScroll(msgs: Msg[]): Frame[] {
  const tops = threadTops(msgs);
  const off = (i: number) => Math.min(0, CHAT_VIEW - 14 - (tops[i] + msgs[i].h));
  let last = 0;
  msgs.forEach((m, i) => {
    if (m.t <= -99) last = i;
  });
  const moves: Move[] = [];
  msgs.forEach((m, i) => {
    if (m.t > -99 && m.kind !== "day") moves.push({ t: m.t, to: { y: off(i) } });
  });
  return track({ y: off(last) }, moves);
}

// ------------------------------------------------------------------ the Orders screen
export type OrderKey = "1442" | "1441" | "1440" | "1439" | "1438" | "1437" | "1436";
export type OrderState = "new" | "confirmed" | "ready" | "done";
export const ROWS: { n: OrderKey; from: number; states: { t: number; s: OrderState }[]; pay: "unpaid" | "account" }[] = [
  { n: "1442", from: E.row1442, states: [{ t: -99, s: "new" }], pay: "unpaid" },
  { n: "1441", from: E.lina, states: [{ t: -99, s: "new" }, { t: E.conf, s: "confirmed" }], pay: "account" },
  { n: "1440", from: -99, states: [{ t: -99, s: "confirmed" }, { t: E.ready, s: "ready" }, { t: E.done, s: "done" }], pay: "account" },
  { n: "1439", from: -99, states: [{ t: -99, s: "new" }], pay: "unpaid" },
  { n: "1438", from: -99, states: [{ t: -99, s: "new" }], pay: "unpaid" },
  { n: "1437", from: -99, states: [{ t: -99, s: "ready" }], pay: "account" },
  { n: "1436", from: -99, states: [{ t: -99, s: "ready" }], pay: "unpaid" },
];
export const ORDER_ROW = 50;
/** A row's place at the end of the film (the HTML's): the rows that came later push it down. */
export const rowTop = (i: number) => i * ORDER_ROW;
/** The time a status button is pressed, just before its row changes. */
const PRESS = 0.32;

// ------------------------------------------------------------------ all the tracks
export type Track = { sel: string; frames: Frame[]; delay?: "word" };

/** Every moving part of the film, by the class it carries in HeroFilm.tsx. */
export function tracks(): Track[] {
  const out: Track[] = [];
  const add = (sel: string, frames: Frame[], delay?: "word") => out.push({ sel, frames, delay });

  // windows
  for (const k of Object.keys(CARDS) as (CardKey | "pair")[]) if (k !== "pair") add(`hf-c-${k}`, focusTrack(k));

  // the inbox
  CONVS.forEach((c, i) => {
    const moves: Move[] = [];
    let prev = inboxRank(i, -1);
    for (const t of INBOX_T) {
      const r = inboxRank(i, t);
      if (r !== prev) moves.push({ t, to: { y: r * INBOX_ROW } });
      prev = r;
    }
    add(`hf-ib-${c.key}`, track({ y: inboxRank(i, -1) * INBOX_ROW }, moves));
    c.ev.forEach((e, j) => {
      if (c.ev.length < 2) return;
      const next = c.ev[j + 1];
      const shown = e.t <= -99 ? (next ? leaveAt(next.t) : null) : next ? track({ o: 0 }, [{ t: e.t, to: { o: 1 }, d: P2, lin: true }, { t: next.t, to: { o: 0 }, d: P2, lin: true }]) : showAt(e.t);
      if (shown) add(`hf-ib-${c.key}-${j}`, shown);
    });
  });
  add("hf-ib-aisha-v", voltAt(E.aisha, 1.6));

  // the chats
  for (const id of Object.keys(THREADS) as (keyof typeof THREADS)[]) {
    const msgs = THREADS[id];
    add(`hf-th-${id}`, threadScroll(msgs));
    for (const m of msgs) if (m.t > -99) add(`hf-m-${id}-${m.k}`, m.kind === "day" ? showAt(m.t, P3) : arriveAt(m.t));
  }
  add("hf-m-chat-v", voltAt(E.sOut, 1.6));

  // the Orders screen: rows land at the top and push the others down; a status button is pressed
  // by the team, then the row's status changes
  ROWS.forEach((r, i) => {
    const below = ROWS.slice(0, i).filter((x) => x.from > -99);
    const start = (i - below.length) * ORDER_ROW;
    const moves: Move[] = below
      .slice()
      .sort((a, b) => a.from - b.from)
      .map((x, k) => ({ t: x.from, to: { y: start + (k + 1) * ORDER_ROW } }));
    add(`hf-r-${r.n}`, track({ y: r.from > -99 ? 0 : start }, moves));
    if (r.from > -99) {
      add(`hf-r-${r.n}-in`, arriveAt(r.from));
      add(`hf-r-${r.n}-v`, voltAt(r.from + 0.1));
    }
    r.states.forEach((s, j) => {
      if (r.states.length < 2) return;
      const next = r.states[j + 1];
      add(`hf-r-${r.n}-${s.s}`, s.t <= -99 ? leaveAt(next.t) : next ? track({ o: 0 }, [{ t: s.t, to: { o: 1 }, d: P2, lin: true }, { t: next.t, to: { o: 0 }, d: P2, lin: true }]) : showAt(s.t));
      if (next) add(`hf-r-${r.n}-${s.s}-press`, track({ o: 0 }, [{ t: next.t - PRESS, to: { o: 1 }, d: 0.05, lin: true }, { t: next.t, to: { o: 0 }, d: P2, lin: true }]));
    });
  });
  add("hf-r-1441-conf-v", voltAt(E.conf, 1.3));

  // the Stock screen: the last cake sells; the log gains its row at the top
  add("hf-st-1", leaveAt(E.lina, P3));
  add("hf-st-0", arriveAt(E.lina, P3));
  add("hf-st-few", leaveAt(E.lina + 0.35, P2));
  add("hf-st-out", arriveAt(E.lina + 0.35, P3));
  add("hf-lg-0", arriveAt(E.lina));
  add("hf-lg-v", voltAt(E.lina + 0.1));
  add("hf-lg-rest", track({ y: -36 }, [{ t: E.lina, to: { y: 0 } }]));

  // Bookings: the reminder goes; Maha takes 6:30 pm
  add("hf-bk-remind", arriveAt(E.remind));
  add("hf-bk-tick-v", voltAt(E.remind));
  add("hf-bk-630-v", voltAt(E.maha, 0.95));
  add("hf-bk-630-fill", track({ sx: 0 }, [{ t: E.maha, to: { sx: 1 }, d: P3 }]));
  add("hf-bk-630-ink", showAt(E.maha + 0.95, P4));
  add("hf-bk-maha", arriveAt(E.maha + 5 * STAG));

  // Credit accounts: Lina's order goes on her account; then a balance needs a look
  add("hf-ow-before", leaveAt(E.lina + 0.1, P3));
  add("hf-ow-after", showAt(E.lina + 0.1, P3));
  add("hf-ow-flag", arriveAt(E.flag));
  add("hf-ow-flag-v", voltAt(E.flag, 1.7));

  // the lanes, named in the two shots that show all three
  for (const shot of ["wide", "mid"] as const) {
    const on = shot === "wide" ? track({ o: 1 }, [{ t: 3.15, to: { o: 0 }, d: P3, lin: true }]) : track({ o: 0 }, [{ t: 19.4, to: { o: 1 }, d: P4, lin: true }, { t: 24.0, to: { o: 0 }, d: P3, lin: true }]);
    add(`hf-ln-${shot}`, on);
  }
  add("hf-tag-ready", during(E.ready + 0.1, E.done));
  add("hf-tag-done", during(E.done + 0.1, 23.75));
  add("hf-tag-maha", during(E.maha + 0.1, 23.75));
  add("hf-tag-flag", during(E.flag + 0.1, 23.75));

  // captions
  for (const c of CAPS) {
    add(`hf-cap-${c.key}`, track({ o: 0 }, [{ t: c.a - 0.05, to: { o: 1 }, d: 0.02, lin: true }, { t: c.b + P3 + 0.05, to: { o: 0 }, d: 0.02, lin: true }]));
    add(`hf-cap-${c.key}-line`, track({ sx: 0 }, [{ t: c.a, to: { sx: 1 } }, { t: c.b, to: { sx: 0 }, d: P3 }]));
    add(`hf-cap-${c.key}-tick`, track({ o: 0 }, [{ t: c.a + P4 * 0.6, to: { o: 1 }, d: P2, lin: true }, { t: c.b, to: { o: 0 }, d: P2, lin: true }]));
    add(`hf-cap-${c.key}-w`, during(c.a + 0.1, c.b - 0.08), "word");
  }

  // the clock in the bar
  MINUTES.forEach((m, i) => {
    const next = MINUTES[i + 1];
    const frames: Frame[] = [[0, { o: i === 0 ? 1 : 0 }]];
    if (i > 0) frames.push([m.at - 0.001, { o: 0 }], [m.at, { o: 1 }]);
    if (next) frames.push([next.at - 0.001, { o: 1 }], [next.at, { o: 0 }]);
    if (i === 0) frames.push([RESET - 0.001, { o: 0 }], [RESET, { o: 1 }], [L, { o: 1 }]);
    else if (!next) frames.push([RESET - 0.001, { o: 1 }], [RESET, { o: 0 }], [L, { o: 0 }]);
    else frames.push([L, { o: 0 }]);
    add(`hf-clk-${i}`, frames);
  });

  return out;
}

/** The film as CSS: every track, the camera and the cover for each layout, and the captions'
 * and lanes' places for each layout. Written into the page by film.ts after load, so the first
 * paint never waits for it. A part plays once film.ts gives it `hf-go`. */
export function filmCss(): string {
  const loop = `calc(${BEATS} * var(--play-4))`;
  const parts: string[] = [];
  const sels: string[] = [];
  for (const t of tracks()) {
    parts.push(keyframes(`hfk-${t.sel.slice(3)}`, t.frames));
    const delay = t.delay === "word" ? "calc(var(--hf-at) + var(--w, 0) * 2 * var(--play-stagger))" : "var(--hf-at)";
    sels.push(`.${t.sel}.hf-go{animation:hfk-${t.sel.slice(3)} ${loop} linear infinite;animation-delay:${delay}}`);
  }
  for (const layout of ["wide", "phone"] as const) {
    parts.push(keyframes(`hfk-cam-${layout}`, cameraTrack(layout)));
    parts.push(keyframes(`hfk-cover-${layout}`, coverTrack(layout)));
  }
  const geo = (layout: Layout) => {
    const rules: string[] = [];
    for (const c of CAPS) {
      const g = capGeometry(layout, c.key);
      rules.push(`.hf-cap-${c.key}{--cx:${g.x}px;--cy:${g.y}px;--cw:${g.w}px;--cs:${g.cs}}`);
    }
    for (const shot of ["wide", "mid"] as const) {
      for (const l of LANES) {
        const g = laneGeometry(layout, shot, l.key);
        rules.push(`.hf-ln-${shot} .hf-ln-${l.key}{--lx:${g.lx}px;--ly:${g.ly}px;--rx:${g.rx}px;--rw:${g.rw}px;--ry:${g.ry}px;--cs:${g.cs};visibility:${g.shown ? "visible" : "hidden"}}`);
      }
    }
    return rules.join("");
  };
  const world = (layout: Layout) =>
    `.hf-world.hf-go{animation:hfk-cam-${layout} ${loop} linear infinite;animation-delay:var(--hf-at)}` +
    `.hf-cover.hf-go{animation:hfk-cover-${layout} ${loop} linear infinite;animation-delay:var(--hf-at)}`;
  return [
    `.hf{--hf-at:calc(-${r4(STILL / L)} * ${loop})}`,
    ...parts,
    ...sels,
    geo("wide"),
    world("wide"),
    `@media (max-width:47.99rem){${geo("phone")}${world("phone")}}`,
  ].join("\n");
}

/** The still's camera and its one caption, for each layout (the HTML's, and the film's first
 * frame). */
export function still() {
  const out = {} as Record<Layout, { cam: string; cap: ReturnType<typeof capGeometry> }>;
  for (const layout of ["wide", "phone"] as const) out[layout] = { cam: camCss(camAt(layout, STILL)), cap: capGeometry(layout, "week") };
  return out;
}

/** Every class that carries a track, for film.ts to start them a few at a time. */
export const trackClasses = () => ["hf-world", "hf-cover", ...tracks().map((t) => t.sel)];

/** The film times at which the ALYR Agent home changes (FilmDash.tsx): it counts #1442 at
 * `E.dash`, and is put back to 16:19 under the closing fold. */
export const DASH = { after: E.dash, before: RESET, loop: L } as const;

// for the log and the checks: the camera's eases (expo out, from the tokens)
export const EASE = EASE_ARGS;
