// BgPlan: Direction A of the hero background study, "Planometric: the shop as a system".
// docs/doodle-study/03-pro-brief.md. A 45° planometric drawing (the plan turned 45°, verticals
// true) in hairlines: Qirfa Bakery's counter with its order phone and cake case, Dafira Salon's
// chair and mirror, Zilal Cooling's van, and one ALYR slab. Customers' messages come in as dots;
// each becomes a record (a tile with the brand's cut corner) that travels a 45° track into the
// slab, where Qirfa's numbers tick; ALYR's replies run back. Several tracks run at once; one
// event at a time takes Volt.
// It ends calm on "Week so far: 50 orders, QAR 8,520" and starts again.
//
// One timeline, `frame(t)`, gives every moving value at time t. The loop writes it to the DOM
// on each animation frame; the canvas, reduced motion and the server render show frame(STILL).
// Colours come from the project's ALYR colour styles (CSS variables), so light and dark follow.

import { useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ---------------------------------------------------------------- colour (tokens only)
const T = {
    text: "var(--token-XYAPSNcOu, #15171a)",
    muted: "var(--token-tpGxkcLLH, #5f666d)",
    faint: "var(--token-MIJi7pupd, #8a918b)",
    canvas: "var(--token-S2oE56wbE, #f6f7f3)",
    surface: "var(--token-eKRrgV2Tq, #ffffff)",
    strong: "var(--token-SVZjCcT_M, #8a918b)",
    volt: "var(--token-wnKZyblTz, #b7f34a)",
    onVolt: "var(--token-BJ9wYGxIM, #151a0f)",
}
// Ink is the text colour mixed into the canvas: opaque, so crossing hairlines never darken,
// and theme-aware (Carbon on Paper, chalk on Carbon). The brief's range is 10–22% / 10–18%.
const ink = (p: number) => `color-mix(in srgb, ${T.text} ${p}%, ${T.canvas})`
const C = {
    grid: ink(4), // the plan grid, under 6%
    feed: ink(8), // tracks beyond the shops
    track: ink(13), // the tracks
    edge: ink(20), // edges of every volume
    faceL: ink(3), // the face toward the viewer's left
    faceR: ink(6), // the face toward the viewer's right
    glass: ink(10),
}
const MONO = '"IBM Plex Mono", ui-monospace, monospace'
const SANS = '"Instrument Sans", system-ui, sans-serif'

// ---------------------------------------------------------------- projection
// Plan units (a, b) and height h. One plan unit is 8√2 px on screen along a diagonal, one
// height unit 8 px: every corner lands on the 8 px grid. a runs down-right, b down-left.
const W = 1000
const H = 700
const OX = 520
const OY = 320
type Pt = [number, number]
type P3 = [number, number, number]
const P = (a: number, b: number, h = 0): Pt => [OX + 8 * (a - b), OY + 8 * (a + b) - 8 * h]
const R1 = 8 * Math.SQRT2 // one plan unit in px, for true circles
const f = (n: number) => Math.round(n * 100) / 100
const poly = (pts: Pt[]) => "M" + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "Z"
const line = (pts: Pt[]) => "M" + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L")

/** A box: the three faces a viewer sees, as polygons. */
function box(a0: number, b0: number, a1: number, b1: number, h0: number, h1: number) {
    return {
        top: poly([P(a0, b0, h1), P(a1, b0, h1), P(a1, b1, h1), P(a0, b1, h1)]),
        right: poly([P(a1, b0, h1), P(a1, b1, h1), P(a1, b1, h0), P(a1, b0, h0)]),
        left: poly([P(a0, b1, h1), P(a1, b1, h1), P(a1, b1, h0), P(a0, b1, h0)]),
    }
}
/** A cylinder standing on the plan: its body and its top, both true circles. */
function cyl(a: number, b: number, r: number, h0: number, h1: number) {
    const [x, yt] = P(a, b, h1)
    const yb = yt + 8 * (h1 - h0)
    const R = r * R1
    return {
        body: `M${f(x - R)} ${f(yt)}V${f(yb)}A${f(R)} ${f(R)} 0 0 0 ${f(x + R)} ${f(yb)}V${f(yt)}Z`,
        cx: f(x),
        cy: f(yt),
        r: f(R),
    }
}

// ---------------------------------------------------------------- the plan
// The ALYR slab: a ∈ [0, 18], b ∈ [−13, 0], 1.5 units thick. Qirfa's part is a ∈ [0, 13];
// Dafira's and Zilal's are the two parts beside it. Every business's records stay apart.
const SLAB = { a0: 0, b0: -13, a1: 18, b1: 0, h: 1.5 }
const QA = [1.75, 4.5, 7.25, 10] // Qirfa's four tracks: order, booking, owed, stock
const DOCK_B = -7.5
const START_B = 14.5 // behind the counter a record would be hidden: it comes up here
const COUNTER = { a0: 0, b0: 19, a1: 11.5, b1: 23, h: 4.5 }
const DA = 15.5 // Dafira's track (a constant a), into the slab's left face beside Qirfa's
const ZB = -9.75 // Zilal's track (a constant b), into the slab's right face
const SALON = { a: 15.5, b: 13 } // the chair's centre

/** Each track as a polyline in plan, from where its records start to their dock. */
const LANES: Record<string, P3[]> = {
    q0: [[QA[0], START_B, 0], [QA[0], 0, 0], [QA[0], 0, SLAB.h], [QA[0], DOCK_B, SLAB.h]],
    q1: [[QA[1], START_B, 0], [QA[1], 0, 0], [QA[1], 0, SLAB.h], [QA[1], DOCK_B, SLAB.h]],
    q2: [[QA[2], START_B, 0], [QA[2], 0, 0], [QA[2], 0, SLAB.h], [QA[2], DOCK_B, SLAB.h]],
    q3: [[QA[3], START_B, 0], [QA[3], 0, 0], [QA[3], 0, SLAB.h], [QA[3], DOCK_B, SLAB.h]],
    d: [[DA, 9.4, 0], [DA, 0, 0], [DA, 0, SLAB.h], [DA, -3.5, SLAB.h]],
    z: [[23, ZB, 0], [SLAB.a1, ZB, 0], [SLAB.a1, ZB, SLAB.h], [DA, ZB, SLAB.h]],
}
/** Where customers' messages come from: the tracks run on past each shop, out of the frame. */
const FEEDS: Record<string, P3[]> = {
    q0: [[QA[0], 33, 0], [QA[0], COUNTER.b1 + 0.6, 0]],
    q1: [[QA[1], 33, 0], [QA[1], COUNTER.b1 + 0.6, 0]],
    d: [[DA, 25, 0], [DA, 14.8, 0]],
    z: [[42, ZB, 0], [32.8, ZB, 0]],
}

type Path = { pts: Pt[]; acc: number[]; len: number }
function mkPath(p3: P3[]): Path {
    const pts = p3.map((p) => P(p[0], p[1], p[2]))
    const acc = [0]
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return { pts, acc, len: acc[acc.length - 1] }
}
function at(path: Path, s: number): Pt {
    const d = Math.max(0, Math.min(1, s)) * path.len
    let i = 1
    while (i < path.acc.length - 1 && path.acc[i] < d) i++
    const seg = path.acc[i] - path.acc[i - 1] || 1
    const k = (d - path.acc[i - 1]) / seg
    const p0 = path.pts[i - 1]
    const p1 = path.pts[i]
    return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k]
}

// ---------------------------------------------------------------- time
export const LOOP = 26
export const STILL = 20 // the calm: every row true, "Week so far" with its tick
const PACE = 1.3 // motion.pace.pace
const D2 = 0.24 * PACE // --dur-2
const D3 = 0.48 * PACE // --dur-3
const D4 = 0.72 * PACE // --dur-4
const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const seg = (t: number, t0: number, t1: number) => c01((t - t0) / (t1 - t0))
const sine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
function bezier(x1: number, y1: number, x2: number, y2: number) {
    return (x: number) => {
        let u = x
        for (let i = 0; i < 8; i++) {
            const cx = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3 - x
            const dx = 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u
            if (Math.abs(dx) < 1e-6) break
            u = c01(u - cx / dx)
        }
        return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3
    }
}
const ease = bezier(0.16, 1, 0.3, 1) // --ease (expo out)
/** On between t0 and t1, arriving over --dur-3 and leaving over --dur-2. */
const win = (t: number, t0: number, t1: number) => ease(seg(t, t0, t0 + D3)) * (1 - seg(t, t1 - D2, t1))

// The schedule. Qirfa's records carry words; the other two shops' run unlabelled beside them.
type Tile = { lane: string; show: number; go: number; land: number; out: number; volt?: [number, number] }
const TILES: Record<string, Tile> = {
    stock: { lane: "q3", show: 0.5, go: 0.9, land: 4.4, out: 23.2 },
    order: { lane: "q0", show: 2.1, go: 2.6, land: 6.4, out: 23.4, volt: [2.1, 7.0] },
    booking: { lane: "q1", show: 3.0, go: 5.6, land: 10.4, out: 23.6 },
    owed: { lane: "q2", show: 9.4, go: 11.0, land: 16.6, out: 23.8 },
    z1: { lane: "z", show: 1.4, go: 1.7, land: 4.6, out: 6.2 },
    d1: { lane: "d", show: 2.2, go: 2.5, land: 5.2, out: 6.8 },
    z2: { lane: "z", show: 7.8, go: 8.1, land: 11.0, out: 12.6 },
    d2: { lane: "d", show: 11.6, go: 11.9, land: 14.6, out: 16.2 },
    z3: { lane: "z", show: 13.4, go: 13.7, land: 16.6, out: 18.2 },
}
type Dot = { feed: string; t0: number; t1: number }
const DOTS: Dot[] = [
    { feed: "q0", t0: 0.0, t1: 1.1 },
    { feed: "q0", t0: 0.35, t1: 1.45 },
    { feed: "q0", t0: 0.7, t1: 1.8 },
    { feed: "q1", t0: 1.2, t1: 2.3 },
    { feed: "z", t0: 0.0, t1: 1.1 },
    { feed: "d", t0: 0.6, t1: 1.7 },
    { feed: "z", t0: 6.4, t1: 7.5 },
    { feed: "d", t0: 10.2, t1: 11.3 },
    { feed: "z", t0: 12.0, t1: 13.1 },
]
/** Messages at the shops: in as each dot arrives (they fold into the record), and ALYR's replies out. */
type Bubble = { at: "phone" | "van" | "salon"; i: number; t0: number; t1: number; out?: boolean }
const BUBBLES: Bubble[] = [
    { at: "phone", i: 0, t0: 1.1, t1: 2.2 },
    { at: "phone", i: 1, t0: 1.45, t1: 2.2 },
    { at: "phone", i: 2, t0: 1.8, t1: 2.2 },
    { at: "phone", i: 0, t0: 2.3, t1: 3.1 },
    { at: "van", i: 0, t0: 1.1, t1: 1.5 },
    { at: "salon", i: 0, t0: 1.7, t1: 2.3 },
    { at: "van", i: 0, t0: 7.5, t1: 7.9 },
    { at: "salon", i: 0, t0: 11.3, t1: 11.7 },
    { at: "van", i: 0, t0: 13.1, t1: 13.5 },
    { at: "phone", i: 0, t0: 10.0, t1: 12.4, out: true },
    { at: "phone", i: 0, t0: 14.8, t1: 17.2, out: true },
]
/** What ALYR sends back, along the same track: the order's receipt and the reminder. */
type Pip = { lane: string; t0: number; t1: number; volt: boolean }
const PIPS: Record<string, Pip> = {
    received: { lane: "q0", t0: 7.4, t1: 10.0, volt: false },
    reminder: { lane: "q1", t0: 12.2, t1: 14.8, volt: true },
    zsent: { lane: "z", t0: 5.0, t1: 6.9, volt: false },
    dsent: { lane: "d", t0: 15.0, t1: 16.9, volt: false },
}
const CAKES_OUT = [7.8, 8.14, 8.48, 8.82, 9.16, 9.5] // each sale takes its stock (≤3 a second)
const SOLD_OUT = CAKES_OUT[5] // the last sale: Sold out, never "0 left"
const CAKES_BACK = 23.4
const ROWS = {
    order: { on: 6.4, tick: [6.4, 7.9] as [number, number] },
    booking: { on: 10.4, sent: 14.8, tick: [14.8, 16.3] as [number, number] },
    owed: { on: 16.6 },
    stock: { on: 4.4 },
}
const CALM = { tick: [17.4, 22.8] as [number, number], again: [20.0, 24.0] as [number, number] }
const RESET = [22.8, 24.2] // the rows clear along 45°, then the next round starts
const ORDERS0 = 49
const SALES0 = 842200 // dirhams: QAR 8,422; #1442 adds QAR 98 to make QAR 8,520 (the hero's)
const SALES1 = 852000

// ---------------------------------------------------------------- words
const WORDS = {
    en: {
        shop: "QIRFA BAKERY",
        sample: "SAMPLE",
        week: (o: number, s: string) => [`Week so far: ${o} orders, `, `QAR ${s}`],
        rows: {
            order: ["ORDERS", "#1442 · 7 items", "QAR 98"],
            booking: ["BOOKINGS", "Cake tasting · 6:00 pm", "Booked", "Reminder sent"],
            owed: ["OWED", "QAR 3,400 · 30+ days", "Needs a look"],
            stock: ["STOCK", "Pistachio kunafa cheesecake", "left", "Sold out"],
        },
        tags: {
            order: "ORDER #1442",
            booking: "BOOKING · 6:00 PM",
            owed: "OWED · QAR 3,400",
            stock: "STOCK · 6 LEFT",
        },
        shops: { q: "QIRFA BAKERY", d: "DAFIRA SALON", z: "ZILAL COOLING" },
        slab: "ALYR",
        again: "Then we check again.",
        pause: "Pause",
        play: "Play",
        pauseName: "Pause the drawing",
        playName: "Play the drawing",
    },
}
const money = (d: number) => Math.round(d / 100).toLocaleString("en-US")

// ---------------------------------------------------------------- the frame
// Every animated node has a key; frame(t) returns its values at time t (seconds in the loop).
type V = { tr?: string; op?: number; txt?: string; fill?: string; dash?: number }
type Frame = Record<string, V>

function buildPaths() {
    const lanes: Record<string, Path> = {}
    for (const k in LANES) lanes[k] = mkPath(LANES[k])
    const feeds: Record<string, Path> = {}
    for (const k in FEEDS) feeds[k] = mkPath(FEEDS[k])
    return { lanes, feeds }
}
const PATHS = buildPaths()

/** When a record reaches the slab's face (its tag has said its piece by then). */
function faceTime(tile: string) {
    const s = TILES[tile]
    const p = PATHS.lanes[s.lane]
    const x = p.acc[1] / p.len
    return s.go + ((s.land - s.go) * Math.acos(1 - 2 * x)) / Math.PI - 0.15
}

function frame(t: number): Frame {
    const F: Frame = {}
    const tr = (p: Pt, dx = 0, dy = 0) => `translate(${f(p[0] + dx)} ${f(p[1] + dy)})`
    // records
    for (const k in TILES) {
        const s = TILES[k]
        const path = PATHS.lanes[s.lane]
        const prog = sine(seg(t, s.go, s.land))
        const settle = ease(seg(t, s.land, s.land + D3)) // the last 3 px of the dock, eased
        const p = at(path, prog)
        const rise = (1 - ease(seg(t, s.show, s.show + D3))) * 6 // it comes up out of the plan
        const sink = settle < 1 && t >= s.land ? (1 - settle) * -2 : 0
        const op = ease(seg(t, s.show, s.show + D3)) * (1 - seg(t, s.out, s.out + D3))
        F["t-" + k] = { tr: tr(p, 0, rise + sink), op: f(op) }
        if (s.volt) F["tv-" + k] = { op: t >= s.volt[0] && t < s.volt[1] ? 1 : 0 }
    }
    // messages coming in
    DOTS.forEach((d, i) => {
        const path = PATHS.feeds[d.feed]
        const p = at(path, sine(seg(t, d.t0, d.t1)))
        const op = seg(t, d.t0, d.t0 + D2) * (1 - seg(t, d.t1 - D2, d.t1))
        F["m-" + i] = { tr: tr(p), op: f(op) }
    })
    // what goes back
    for (const k in PIPS) {
        const s = PIPS[k]
        const path = PATHS.lanes[s.lane]
        const p = at(path, 1 - sine(seg(t, s.t0, s.t1)))
        const op = seg(t, s.t0, s.t0 + D2) * (1 - seg(t, s.t1, s.t1 + D2))
        F["p-" + k] = { tr: tr(p), op: f(op) }
    }
    // the active track: drawn ahead of the record, held while it travels
    const hl = (key: string, lane: string, t0: number, t1: number, off: number, back = false) => {
        const draw = ease(seg(t, t0, t1))
        F[key] = { dash: f(back ? -(1 - draw) : 1 - draw), op: f(seg(t, t0, t0 + 0.05) * (1 - seg(t, off, off + D3))) }
    }
    hl("hl-order", "q0", 2.2, 3.4, 6.8)
    hl("hl-reminder", "q1", 11.8, 12.8, 15.0, true)
    // tags beside the records
    const tagAt = (key: string, tile: string, t0: number, t1: number) => {
        const s = TILES[tile]
        t1 = Math.min(t1, faceTime(tile))
        const p = at(PATHS.lanes[s.lane], sine(seg(t, s.go, s.land)))
        F[key] = { tr: tr(p, 16, -6), op: f(win(t, t0, t1)) }
    }
    tagAt("g-stock", "stock", 0.6, 3.6)
    tagAt("g-order", "order", 2.2, 5.6)
    tagAt("g-booking", "booking", 3.1, 9.4)
    tagAt("g-owed", "owed", 9.5, 15.8)
    BUBBLES.forEach((b, i) => {
        const k = ease(seg(t, b.t0, b.t0 + D3))
        F["b-" + i] = { op: f(win(t, b.t0, b.t1)), tr: `translate(0 ${f(4 * (1 - k))})` }
    })
    // the cakes in the case
    CAKES_OUT.forEach((t0, i) => {
        const gone = seg(t, t0, t0 + D2)
        const back = ease(seg(t, CAKES_BACK + i * 0.12, CAKES_BACK + i * 0.12 + D3))
        F["c-" + i] = { op: f(t < CAKES_BACK ? 1 - gone : back) }
    })
    // the slab's readout
    const reset = seg(t, RESET[0], RESET[1])
    const rowOp = (on: number) => (t < RESET[0] ? ease(seg(t, on, on + D3)) : 1 - ease(reset))
    const rowTr = (on: number) => {
        const k = 1 - ease(seg(t, on, on + D3))
        return `translate(${f(-8 * k)} ${f(8 * k)})` // arrives along 45°
    }
    for (const r of ["order", "booking", "owed", "stock"] as const) {
        const on = ROWS[r].on
        F["r-" + r] = { op: f(rowOp(on)), tr: rowTr(on) }
    }
    const tick = (key: string, w: [number, number]) => (F[key] = { op: t >= w[0] && t < w[1] ? 1 : 0 })
    tick("k-order", ROWS.order.tick)
    tick("k-booking", ROWS.booking.tick)
    tick("k-calm", CALM.tick)
    // booking: Booked, then Reminder sent
    F["s-booking-a"] = { op: f(1 - seg(t, ROWS.booking.sent, ROWS.booking.sent + D2)) }
    F["s-booking-b"] = { op: f(ease(seg(t, ROWS.booking.sent, ROWS.booking.sent + D3))) }
    // stock: 6 left, counting down with each sale, then Sold out
    let left = 6
    CAKES_OUT.forEach((t0) => {
        if (t >= t0 && t < RESET[1]) left--
    })
    F["s-stock-n"] = { txt: `${left} ${WORDS.en.rows.stock[2]}`, op: f(t < SOLD_OUT || t >= RESET[1] ? 1 : 0) }
    F["s-stock-x"] = { op: f(t >= SOLD_OUT && t < RESET[1] ? 1 : 0) }
    // the week: 49 → 50 orders, QAR 8,422 → 8,520 as #1442 lands
    const roll = ease(seg(t, ROWS.order.on + 0.1, ROWS.order.on + 0.1 + D4))
    const counted = t >= ROWS.order.on + 0.1 && t < RESET[1]
    const sales = counted ? SALES0 + Math.round(((SALES1 - SALES0) / 100) * roll) * 100 : SALES0
    const wk = WORDS.en.week(counted ? ORDERS0 + 1 : ORDERS0, money(sales))
    F["w-a"] = { txt: wk[0] }
    F["w-b"] = { txt: wk[1] }
    F["w"] = { op: f(t >= RESET[0] && t < RESET[1] ? 1 - 0.6 * Math.sin(Math.PI * reset) : 1) }
    F["again"] = { op: f(win(t, CALM.again[0], CALM.again[1])) }
    return F
}

// ---------------------------------------------------------------- the drawing
function Box({ a0, b0, a1, b1, h0, h1, top = T.canvas, sw = 1 }: { a0: number; b0: number; a1: number; b1: number; h0: number; h1: number; top?: string; sw?: number }) {
    const b = box(a0, b0, a1, b1, h0, h1)
    const st = { stroke: C.edge, strokeWidth: sw, strokeLinejoin: "miter" as const }
    return (
        <g>
            <path d={b.left} fill={C.faceL} {...st} />
            <path d={b.right} fill={C.faceR} {...st} />
            <path d={b.top} fill={top} {...st} />
        </g>
    )
}
function Cyl({ a, b, r, h0, h1, top = T.canvas }: { a: number; b: number; r: number; h0: number; h1: number; top?: string }) {
    const c = cyl(a, b, r, h0, h1)
    return (
        <g>
            <path d={c.body} fill={C.faceR} stroke={C.edge} />
            <circle cx={c.cx} cy={c.cy} r={c.r} fill={top} stroke={C.edge} />
        </g>
    )
}
/** A record: a tile 3.2 units long on its track, 1.5 wide, 3 px thick, drawn at its centre. Its
 * leading side corner is cut at 45° on the plan, so on screen the cut stands upright: on the
 * right for a record going up and right, on the left for one going up and left. */
function tileShape(alongA: boolean) {
    const la = alongA ? 1.6 : 0.75 // half-size along a
    const lb = alongA ? 0.75 : 1.6 // half-size along b
    const c = 0.55
    const th = 0.375
    const O = P(0, 0, 0)
    const q = (a: number, b: number, h: number): Pt => {
        const p = P(a, b, h)
        return [p[0] - O[0], p[1] - O[1]]
    }
    const top = alongA
        ? [q(-la, -lb, th), q(la, -lb, th), q(la, lb, th), q(-la + c, lb, th), q(-la, lb - c, th)] // cut (−la, +lb)
        : [q(-la, -lb, th), q(la - c, -lb, th), q(la, -lb + c, th), q(la, lb, th), q(-la, lb, th)] // cut (+la, −lb)
    const left = alongA ? [q(-la + c, lb, th), q(la, lb, th), q(la, lb, 0), q(-la + c, lb, 0)] : [q(-la, lb, th), q(la, lb, th), q(la, lb, 0), q(-la, lb, 0)]
    const right = alongA ? [q(la, -lb, th), q(la, lb, th), q(la, lb, 0), q(la, -lb, 0)] : [q(la, -lb + c, th), q(la, lb, th), q(la, lb, 0), q(la, -lb + c, 0)]
    const cutFace = alongA ? [q(-la, lb - c, th), q(-la + c, lb, th), q(-la + c, lb, 0), q(-la, lb - c, 0)] : [q(la - c, -lb, th), q(la, -lb + c, th), q(la, -lb + c, 0), q(la - c, -lb, 0)]
    return { top: poly(top), left: poly(left) + poly(cutFace), right: poly(right) }
}
const TILE_B = tileShape(false) // travelling along −b: up and to the right
const TILE_A = tileShape(true) // travelling along −a: up and to the left
/** A reply going back along its track: a small square on the plan. */
const PIP = (() => {
    const O = P(0, 0, 0)
    const s = 0.42
    const pts = [P(-s, -s), P(s, -s), P(s, s), P(-s, s)].map((p) => [p[0] - O[0], p[1] - O[1]] as Pt)
    return poly(pts)
})()

/** Where messages show: above the order phone, the van's back and the salon's mirror. */
const BUBBLE_AT: Record<string, Pt> = (() => {
    const ph = P(1.8, 20.85, COUNTER.h + 3.25)
    const vn = P(23, ZB, 5.2)
    const sm = P(15.5, 9.65, 7.75)
    return { phone: [Math.round(ph[0] + 6), Math.round(ph[1] - 22)], van: [Math.round(vn[0] - 8), Math.round(vn[1] - 22)], salon: [Math.round(sm[0] + 6), Math.round(sm[1] - 22)] }
})()

/** The phone's crop of the drawing: the shops, the tracks and the slab, without the readout. */
const PHONE_VB = [372, 196, 600, 468]

type Props = {
    mode?: "auto" | "wide" | "phone"
    at?: number
    scale?: number
    inset?: number
    pauseWord?: string
    playWord?: string
    pauseName?: string
    playName?: string
    style?: React.CSSProperties
}

let counter = 0

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function BgPlan(props: Props) {
    const { mode = "auto", at: atProp = -1, scale = 1, inset = 48, style } = props
    const w0 = WORDS.en
    const pauseWord = props.pauseWord || w0.pause
    const playWord = props.playWord || w0.play
    const pauseName = props.pauseName || w0.pauseName
    const playName = props.playName || w0.playName

    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const ref = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const [uid] = useState(() => `bp${(counter++).toString(36)}`)
    const [boxW, setBoxW] = useState(0)
    const [reduce, setReduce] = useState(false)
    const [userPaused, setUserPaused] = useState(false)
    const [away, setAway] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const measure = () => setBoxW(el.clientWidth)
        measure()
        if (typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
        const on = () => setReduce(mq.matches)
        on()
        mq.addEventListener?.("change", on)
        return () => mq.removeEventListener?.("change", on)
    }, [])
    useEffect(() => {
        const el = ref.current
        if (!el || typeof IntersectionObserver === "undefined") return
        let off = false
        let hidden = typeof document !== "undefined" && document.hidden
        const io = new IntersectionObserver((entries) => {
            off = !entries[0].isIntersecting
            setAway(off || hidden)
        })
        io.observe(el)
        const vis = () => {
            hidden = document.hidden
            setAway(off || hidden)
        }
        document.addEventListener("visibilitychange", vis)
        return () => {
            io.disconnect()
            document.removeEventListener("visibilitychange", vis)
        }
    }, [])

    const phone = mode === "phone" || (mode === "auto" && boxW > 0 && boxW < 640)
    const staticFrame = isCanvas || reduce
    const frozen = atProp >= 0 && !staticFrame
    const stillT = frozen ? atProp % LOOP : STILL
    const paused = staticFrame || frozen || userPaused || away
    const F0 = useMemo(() => frame(stillT), [stillT])

    // The loop: a clock that only runs while playing, so Pause and off screen hold the frame. It
    // starts from the still the page was drawn with (the calm), so nothing jumps when it begins.
    const clock = useRef({ t: STILL, last: 0 })
    useEffect(() => {
        const root = ref.current
        if (!root) return
        const nodes = Array.from(root.querySelectorAll<SVGElement>("[data-k]"))
        const byKey = new Map<string, SVGElement[]>()
        nodes.forEach((n) => {
            const k = n.getAttribute("data-k") as string
            if (!byKey.has(k)) byKey.set(k, [])
            byKey.get(k)!.push(n)
        })
        const last = new Map<string, V>()
        const apply = (F: Frame) => {
            for (const k in F) {
                const v = F[k]
                const els = byKey.get(k)
                if (!els) continue
                const prev = last.get(k) || {}
                for (const el of els) {
                    if (v.tr !== undefined && v.tr !== prev.tr) el.setAttribute("transform", v.tr)
                    if (v.op !== undefined && v.op !== prev.op) el.style.opacity = String(v.op)
                    if (v.txt !== undefined && v.txt !== prev.txt) el.textContent = v.txt
                    if (v.dash !== undefined && v.dash !== prev.dash) el.setAttribute("stroke-dashoffset", String(v.dash))
                }
                last.set(k, v)
            }
        }
        if (paused) {
            if (staticFrame || frozen) apply(frame(stillT))
            return
        }
        let raf = 0
        clock.current.last = performance.now()
        const tick = (now: number) => {
            const c = clock.current
            c.t = (c.t + Math.min(0.1, (now - c.last) / 1000)) % LOOP
            c.last = now
            apply(frame(c.t))
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [paused, staticFrame, frozen, stillT, phone])

    // animated attributes, from the still frame
    const A = (k: string, base: Record<string, unknown> = {}) => {
        const v = F0[k] || {}
        const out: Record<string, unknown> = { "data-k": k, ...base }
        if (v.tr !== undefined) out.transform = v.tr
        if (v.op !== undefined) out.style = { ...(base.style as object), opacity: v.op }
        if (v.dash !== undefined) out.strokeDashoffset = v.dash
        return out
    }
    const txt = (k: string, fallback: string) => (F0[k]?.txt !== undefined ? (F0[k].txt as string) : fallback)

    // ------------------------------------------------ static pieces
    const scene = useMemo(() => {
        // the plan grid, only below the fold line (x + y > 720): the words keep clean paper
        const gridD: string[] = []
        for (let a = -8; a <= 44; a += 4) gridD.push(line([P(a, -16), P(a, 36)]))
        for (let b = -16; b <= 36; b += 4) gridD.push(line([P(-8, b), P(44, b)]))
        const laneD = [...QA.map((a) => line([P(a, COUNTER.b0), P(a, 0)])), ...["d", "z"].map((k) => line(PATHS.lanes[k].pts.slice(0, 2)))]
        // on the slab, each track stops at its dock's near edge
        const topD = [
            ...QA.map((a) => line([P(a, 0, SLAB.h), P(a, DOCK_B, SLAB.h)])),
            line([P(DA, 0, SLAB.h), P(DA, -3.5, SLAB.h)]),
            line([P(SLAB.a1, ZB, SLAB.h), P(DA, ZB, SLAB.h)]),
        ]
        const feedD = [
            ...QA.map((a) => line([P(a, 48), P(a, COUNTER.b1)])),
            line([P(DA, 44), P(DA, 14.4)]),
            line([P(48, ZB), P(32.2, ZB)]),
        ]
        return { gridD: gridD.join(""), laneD, topD, feedD }
    }, [])

    // the slab's three parts: Qirfa's, Dafira's and Zilal's
    const part1 = line([P(13, SLAB.b0, SLAB.h), P(13, SLAB.b1, SLAB.h)])
    const part2 = line([P(13, -6.5, SLAB.h), P(SLAB.a1, -6.5, SLAB.h)])
    const anchor = P(6.5, -11, SLAB.h)

    // readout geometry (drawing units)
    const RX = 690
    const RR = 996
    const RY = 40
    const rowY = [RY + 76, RY + 98, RY + 120, RY + 142]
    const rowsW = w0.rows
    // On the phone the drawing shows at about two thirds; its words grow back to about 10 px.
    const tk = phone ? 1.6 : Math.max(1, Math.round((0.88 / scale) * 100) / 100)
    const lbl = { fontFamily: MONO, fontSize: 10 * tk, letterSpacing: "0.08em", fill: T.faint }
    const val = { fontFamily: SANS, fontSize: 12.5, fill: T.text, fontVariantNumeric: "tabular-nums" as const }
    const stat = { ...val, fill: T.muted, textAnchor: "end" as const }
    const halo = { stroke: T.canvas, strokeWidth: 4, strokeLinejoin: "round" as const, paintOrder: "stroke" as const }
    const tag = { fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", fill: T.muted, ...halo }
    const VB = phone ? PHONE_VB : [0, 0, W, H]

    const pw = boxW > 0 ? boxW : 390
    const svgStyle: React.CSSProperties = phone
        ? { position: "absolute", left: 0, bottom: 0, width: pw, height: Math.round((pw * VB[3]) / VB[2]) }
        : { position: "absolute", right: inset, bottom: 0, width: W * scale, height: H * scale }

    const rowG = (k: "order" | "booking" | "owed" | "stock", i: number, kids: React.ReactNode) => (
        <>
            <text x={RX} y={rowY[i]} {...lbl}>{rowsW[k][0]}</text>
            <g {...A("r-" + k)}>
                <text x={RX + 70} y={rowY[i]} {...val}>{rowsW[k][1]}</text>
                {kids}
            </g>
        </>
    )
    const voltTick = (k: string, x: number, y: number) => (
        <g {...A(k)}>
            <rect x={x} y={y - 7.5} width={7} height={7} fill={T.volt} stroke={T.onVolt} strokeWidth={1} />
        </g>
    )

    return (
        <div ref={ref} data-bp={uid} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none", ...style }}>
            {phone ? (
                <div style={{ position: "absolute", top: 4, insetInlineStart: 16, insetInlineEnd: 96, fontFamily: SANS, color: T.text }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", color: T.faint }}>
                        <span>{w0.shop}</span>
                        <span style={{ border: `1px solid ${T.strong}`, padding: "0 4px", color: T.muted, lineHeight: "14px" }}>{w0.sample}</span>
                    </div>
                    <div style={{ position: "relative", marginTop: 6, fontSize: 15, lineHeight: "20px", fontVariantNumeric: "tabular-nums" }}>
                        <span {...(A("k-calm", { style: { position: "absolute", insetInlineStart: -13, top: 7, width: 7, height: 7, background: T.volt, boxShadow: `0 0 0 1px ${T.onVolt}` } }) as object)} />
                        <span>
                            <span {...(A("w-a") as object)}>{txt("w-a", "")}</span>
                            <span {...(A("w-b") as object)} style={{ fontWeight: 600 }}>{txt("w-b", "")}</span>
                        </span>
                    </div>
                </div>
            ) : null}
            <svg ref={svgRef} viewBox={VB.join(" ")} aria-hidden="true" focusable="false" style={{ ...svgStyle, overflow: "visible" }}>
                <defs>
                    <clipPath id={`${uid}-fold`}>
                        <path d={`M720 0H${W + 400}V${H + 400}H-400Z`} />
                    </clipPath>
                </defs>
                <g transform="translate(0.5 0.5)" fill="none" strokeWidth={1} style={{ vectorEffect: "non-scaling-stroke" } as React.CSSProperties}>
                    {/* the plan grid and the tracks beyond the shops */}
                    <g clipPath={`url(#${uid}-fold)`}>
                        <path d={scene.gridD} stroke={C.grid} />
                        {scene.feedD.map((d, i) => (
                            <path key={i} d={d} stroke={C.feed} />
                        ))}
                    </g>
                    {/* customers' messages, coming in */}
                    {DOTS.map((d, i) => (
                        <g key={i} {...A("m-" + i)}>
                            <circle r={3} fill={T.canvas} stroke={T.strong} />
                        </g>
                    ))}
                    {/* the tracks on the ground */}
                    {scene.laneD.map((d, i) => (
                        <path key={i} d={d} stroke={C.track} />
                    ))}
                    {/* the ALYR slab */}
                    <Box a0={SLAB.a0} b0={SLAB.b0} a1={SLAB.a1} b1={SLAB.b1} h0={0} h1={SLAB.h} top={T.surface} />
                    <path d={part1 + part2} stroke={C.track} />
                    {scene.topD.map((d, i) => (
                        <path key={i} d={d} stroke={C.track} />
                    ))}
                    {/* the active track, drawn ahead of its record */}
                    <path {...A("hl-order")} d={line(PATHS.lanes.q0.pts)} pathLength={1} strokeDasharray="1 1" stroke={T.strong} strokeWidth={1.5} />
                    <path {...A("hl-reminder")} d={line(PATHS.lanes.q1.pts)} pathLength={1} strokeDasharray="1 1" stroke={T.strong} strokeWidth={1.5} />
                    {/* replies going back */}
                    {Object.keys(PIPS).map((k) => (
                        <g key={k} {...A("p-" + k)}>
                            <path d={PIP} fill={PIPS[k].volt ? T.volt : T.strong} stroke={PIPS[k].volt ? T.onVolt : "none"} />
                        </g>
                    ))}
                    {/* records travelling */}
                    {Object.keys(TILES).map((k) => {
                        const sh = TILES[k].lane === "z" ? TILE_A : TILE_B
                        return (
                            <g key={k} {...A("t-" + k)}>
                                <path d={sh.left} fill={C.edge} />
                                <path d={sh.right} fill={C.edge} />
                                <path d={sh.top} fill={T.surface} stroke={TILES[k].lane.startsWith("q") ? T.strong : C.edge} />
                                {TILES[k].volt ? <path {...A("tv-" + k)} d={sh.top} fill={T.volt} stroke={T.onVolt} /> : null}
                            </g>
                        )
                    })}
                    {/* Qirfa Bakery: the counter, its order phone and its case of cakes */}
                    <Box a0={COUNTER.a0} b0={COUNTER.b0} a1={COUNTER.a1} b1={COUNTER.b1} h0={0} h1={COUNTER.h} />
                    <path d={line([P(COUNTER.a0, COUNTER.b1, 0.75), P(COUNTER.a1, COUNTER.b1, 0.75), P(COUNTER.a1, COUNTER.b0, 0.75)])} stroke={C.track} />
                    <Box a0={1.0} b0={20.7} a1={2.6} b1={20.95} h0={COUNTER.h} h1={COUNTER.h + 3.25} />
                    <path d={poly([P(1.2, 20.95, COUNTER.h + 2.95), P(2.4, 20.95, COUNTER.h + 2.95), P(2.4, 20.95, COUNTER.h + 0.45), P(1.2, 20.95, COUNTER.h + 0.45)])} stroke={C.track} />
                    <Box a0={1.3} b0={20.3} a1={2.3} b1={21.35} h0={COUNTER.h} h1={COUNTER.h + 0.25} />
                    {/* the cake case: glass, so its far edges show */}
                    <path d={line([P(5.4, 19.6, COUNTER.h), P(5.4, 19.6, COUNTER.h + 3), P(10.6, 19.6, COUNTER.h + 3)]) + line([P(5.4, 19.6, COUNTER.h + 3), P(5.4, 22.4, COUNTER.h + 3)])} stroke={C.glass} />
                    <path d={poly([P(5.4, 19.6, COUNTER.h), P(10.6, 19.6, COUNTER.h), P(10.6, 22.4, COUNTER.h), P(5.4, 22.4, COUNTER.h)])} stroke={C.glass} />
                    {[6.6, 8.0, 9.4].flatMap((a) => [20.45, 21.55].map((b) => [a, b])).map(([a, b], i) => (
                        <g key={i} {...A("c-" + i)}>
                            <Cyl a={a} b={b} r={0.5} h0={COUNTER.h} h1={COUNTER.h + 0.75} />
                        </g>
                    ))}
                    <path d={line([P(5.4, 22.4, COUNTER.h), P(10.6, 22.4, COUNTER.h), P(10.6, 19.6, COUNTER.h)]) + line([P(5.4, 22.4, COUNTER.h), P(5.4, 22.4, COUNTER.h + 3), P(10.6, 22.4, COUNTER.h + 3), P(10.6, 19.6, COUNTER.h + 3), P(10.6, 19.6, COUNTER.h)]) + line([P(10.6, 22.4, COUNTER.h), P(10.6, 22.4, COUNTER.h + 3)])} stroke={C.edge} />
                    {/* Dafira Salon: the chair facing its mirror */}
                    <Box a0={13.5} b0={9.4} a1={17.5} b1={10.6} h0={0} h1={3} />
                    <Box a0={13.9} b0={9.5} a1={17.1} b1={9.8} h0={3} h1={7.75} />
                    <path d={line([P(14.4, 9.8, 6.4), P(15.6, 9.8, 7.6)]) + line([P(14.4, 9.8, 5.0), P(16.6, 9.8, 7.2)])} stroke={C.track} />
                    <Cyl a={SALON.a} b={SALON.b} r={1.3} h0={0} h1={0.35} />
                    <Cyl a={SALON.a} b={SALON.b} r={0.26} h0={0.35} h1={2.2} />
                    <Box a0={SALON.a - 1.1} b0={SALON.b - 1.1} a1={SALON.a + 1.1} b1={SALON.b + 1.1} h0={2.2} h1={3} />
                    <Box a0={SALON.a - 1.1} b0={SALON.b + 0.7} a1={SALON.a + 1.1} b1={SALON.b + 1.1} h0={3} h1={5.9} />
                    {/* Zilal Cooling: the van, its back doors to the slab */}
                    <Box a0={24.3} b0={ZB + 1.1} a1={25.9} b1={ZB + 2.35} h0={0} h1={1.5} />
                    <Box a0={23} b0={ZB - 2} a1={29.6} b1={ZB + 2} h0={0.7} h1={5.2} />
                    <Box a0={29.6} b0={ZB - 2} a1={32.2} b1={ZB + 2} h0={0.7} h1={3.6} />
                    <path d={poly([P(32.2, ZB - 1.6, 3.3), P(32.2, ZB + 1.6, 3.3), P(32.2, ZB + 1.6, 2.2), P(32.2, ZB - 1.6, 2.2)])} stroke={C.track} />
                    <path d={poly([P(29.9, ZB + 2, 3.3), P(31.6, ZB + 2, 3.3), P(31.6, ZB + 2, 2.2), P(29.9, ZB + 2, 2.2)])} stroke={C.track} />
                    <Box a0={24.3} b0={ZB + 2} a1={25.9} b1={ZB + 2.35} h0={0} h1={1.5} />
                    <Box a0={29.9} b0={ZB + 2} a1={31.5} b1={ZB + 2.35} h0={0} h1={1.5} />
                    {/* the readout's leader, from Qirfa's part of the slab */}
                    {phone ? null : <path d={`M${f(anchor[0])} ${f(anchor[1])}V${RY + 156}`} stroke={C.track} />}
                    {phone ? null : <circle cx={f(anchor[0])} cy={f(anchor[1])} r={2} fill={T.surface} stroke={T.strong} />}
                </g>
                {/* words: tags beside the records, the shops' names, the readout */}
                <g style={{ fontFamily: MONO }}>
                    {(["stock", "order", "booking", "owed"] as const).map((k) => (
                        <g key={k} {...A("g-" + k)}>
                            <g transform={tk === 1 ? undefined : `scale(${tk})`}>
                                <path d="M0.5 -3.5H10" stroke={T.strong} fill="none" />
                                <text x={14} y={0} {...tag}>{w0.tags[k]}</text>
                            </g>
                        </g>
                    ))}
                    {BUBBLES.map((b, i) => {
                        const o = BUBBLE_AT[b.at]
                        const x = o[0]
                        const y = o[1] - 15 * b.i
                        // a message: a small sheet with its corner cut, on the side it came from
                        const d = b.out
                            ? `M${x} ${y}H${x + 13}L${x + 16} ${y + 3}V${y + 10}H${x}Z`
                            : `M${x + 3} ${y}H${x + 16}V${y + 10}H${x}V${y + 3}Z`
                        return (
                            <g key={i} {...A("b-" + i)}>
                                <path d={d} fill={b.out ? T.strong : T.canvas} stroke={T.strong} strokeLinejoin="miter" />
                            </g>
                        )
                    })}
                    {(() => {
                        const sl = P(SLAB.a0, SLAB.b1, 0)
                        const ql = P(COUNTER.a0, COUNTER.b1, 0)
                        const d = P(SALON.a + 1.3, SALON.b + 1.3, 0)
                        const z = P(32.2, ZB + 2, 0.7)
                        return (
                            <g {...lbl}>
                                <text x={f(sl[0] - 12)} y={f(sl[1] + 4)} {...lbl} textAnchor="end">{w0.slab}</text>
                                {phone ? null : <text x={f(ql[0] - 12)} y={f(ql[1] + 4)} {...lbl} textAnchor="end">{w0.shops.q}</text>}
                                <text x={f(d[0] + 12)} y={f(d[1] + 4)} {...lbl}>{w0.shops.d}</text>
                                {phone ? <text x={f(z[0] - 6)} y={f(z[1] + 34)} {...lbl} textAnchor="end">{w0.shops.z}</text> : <text x={f(z[0] + 12)} y={f(z[1] + 4)} {...lbl}>{w0.shops.z}</text>}
                            </g>
                        )
                    })()}
                    {/* Qirfa's readout: the one product fragment, with its one Sample mark */}
                    <g style={phone ? { display: "none" } : undefined}>
                        <text x={RX} y={RY} {...lbl}>{w0.shop}</text>
                        <rect x={RR - 52.5} y={RY - 10.5} width={52} height={14} fill="none" stroke={T.strong} />
                        <text x={RR - 26.5} y={RY} {...lbl} textAnchor="middle" fill={T.muted}>{w0.sample}</text>
                        <g {...A("w")}>
                            <text x={RX} y={RY + 32} style={{ fontFamily: SANS, fontSize: 17, fill: T.text, fontVariantNumeric: "tabular-nums" }}>
                                <tspan {...A("w-a")}>{txt("w-a", "")}</tspan>
                                <tspan {...A("w-b")} style={{ fontWeight: 600 }}>{txt("w-b", "")}</tspan>
                            </text>
                        </g>
                        {voltTick("k-calm", RX - 14, RY + 32)}
                        <path d={`M${RX} ${RY + 52.5}H${RR}`} stroke={C.edge} />
                        {rowG("order", 0, <text x={RR} y={rowY[0]} {...stat}>{rowsW.order[2]}</text>)}
                        {voltTick("k-order", RX - 14, rowY[0])}
                        {rowG(
                            "booking",
                            1,
                            <>
                                <text {...A("s-booking-a")} x={RR} y={rowY[1]} {...stat}>{rowsW.booking[2]}</text>
                                <text {...A("s-booking-b")} x={RR} y={rowY[1]} {...stat} fill={T.text}>{rowsW.booking[3]}</text>
                            </>
                        )}
                        {voltTick("k-booking", RX - 14, rowY[1])}
                        {rowG(
                            "owed",
                            2,
                            <>
                                <text x={RR} y={rowY[2]} {...stat} fill={T.text}>{rowsW.owed[2]}</text>
                                <rect x={RX - 13.5} y={rowY[2] - 7.5} width={6} height={6} fill="none" stroke={T.strong} />
                            </>
                        )}
                        {rowG(
                            "stock",
                            3,
                            <>
                                <text {...A("s-stock-n")} x={RR} y={rowY[3]} {...stat}>{txt("s-stock-n", "")}</text>
                                <text {...A("s-stock-x")} x={RR} y={rowY[3]} {...stat} fill={T.text}>{rowsW.stock[3]}</text>
                            </>
                        )}
                        <g {...A("again")}>
                            <text x={RX} y={RY + 178} style={{ fontFamily: SANS, fontSize: 12.5, fill: T.muted }}>{w0.again}</text>
                        </g>
                    </g>
                </g>
            </svg>
            <button
                type="button"
                aria-label={userPaused ? playName : pauseName}
                aria-pressed={userPaused}
                hidden={reduce || frozen}
                onClick={() => setUserPaused((v) => !v)}
                style={{
                    position: "absolute",
                    display: reduce || frozen ? "none" : "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 44,
                    padding: "0 12px",
                    border: 0,
                    background: "transparent",
                    color: T.muted,
                    font: "inherit",
                    fontFamily: SANS,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    pointerEvents: "auto",
                    ...(phone ? { insetInlineEnd: 4, top: 0 } : { insetInlineStart: inset - 12, bottom: 36 }),
                }}
            >
                <span
                    aria-hidden="true"
                    style={
                        userPaused
                            ? { width: 0, height: 0, borderTop: "5.4px solid transparent", borderBottom: "5.4px solid transparent", borderInlineStart: "9.3px solid currentColor" }
                            : { width: 10, height: 10, borderInlineStart: "3px solid currentColor", borderInlineEnd: "3px solid currentColor", boxSizing: "border-box" }
                    }
                />
                <span>{userPaused ? playWord : pauseWord}</span>
            </button>
        </div>
    )
}

addPropertyControls(BgPlan, {
    mode: { type: ControlType.Enum, title: "Layout", options: ["auto", "wide", "phone"], optionTitles: ["Auto", "Wide", "Phone"], defaultValue: "auto" },
    at: { type: ControlType.Number, title: "Still at (s)", min: -1, max: LOOP, step: 0.1, defaultValue: -1, description: "-1 plays the loop" },
    scale: { type: ControlType.Number, title: "Scale", min: 0.4, max: 1.4, step: 0.02, defaultValue: 1, hidden: (p: Props) => p.mode === "phone" },
    inset: { type: ControlType.Number, title: "Gutter", min: 0, max: 96, step: 1, defaultValue: 48 },
    pauseWord: { type: ControlType.String, title: "Pause", defaultValue: "" },
    playWord: { type: ControlType.String, title: "Play", defaultValue: "" },
    pauseName: { type: ControlType.String, title: "Pause name", defaultValue: "" },
    playName: { type: ControlType.String, title: "Play name", defaultValue: "" },
})
