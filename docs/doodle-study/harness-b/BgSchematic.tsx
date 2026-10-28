// ALYR prototype 05B: the homepage hero's background as a wiring diagram
// (docs/doodle-study/03-pro-brief.md, direction B: "the wiring we do for you").
//
// Four input ports on the far edge (MESSAGE, CALL, WALK-IN, LINK) are routed at 90° and 45°
// into one block drawn as the Command Fold (the symbol's three planes, from _site/brand.tsx,
// scaled whole). Six terminals leave its Volt plane along one bus: ORDERS, BOOKINGS, OWED,
// STOCK, RECEIPTS, REPORT. The whole run follows the fold's own diagonal: in at the top
// inline-end, out along the bottom towards the inline-start.
//
// One afternoon at Qirfa Bakery (fictional), 28 s: four things arrive at once; the block holds
// each at its pin and hands them on one at a time; each terminal's reading steps as its
// signal lands; then it moves things on by itself (the reminder, Sold out, the receipt) and
// the report resolves to the hero dashboard's own line, "Week so far: 50 orders, QAR 8,520."
// Every number agrees with the engine's sample (apps/web/app/_agent/samples/bakery.en.json).
//
// Volt only on what just became true: the terminal pad that just landed (a fan-out lights
// two), and the fold's Volt plane once the report lands. Signals are ink. Loops (D-059);
// stops off screen, in a hidden tab and with the Pause button (WCAG 2.2.2); a finished still
// with reduced motion and on Framer's canvas. Mirrors for Arabic (the shapes flip, the words
// do not). Colours are the project's "ALYR/<token>" colour styles from design/tokens.json.
import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

const C = {
    hair: "var(--token-cE5AGFc5n, rgba(21, 23, 26, 0.14))", // ALYR/d-hair-2: every trace and outline
    strong: "var(--token-SVZjCcT_M, #8a918b)", // ALYR/line-strong: a signal's trail, a port as it fires
    surface: "var(--token-eKRrgV2Tq, #ffffff)", // ALYR/surface: the fold's planes
    canvas: "var(--token-S2oE56wbE, #f6f7f3)",
    text: "var(--token-XYAPSNcOu, #15171a)",
    muted: "var(--token-tpGxkcLLH, #5f666d)",
    faint: "var(--token-MIJi7pupd, #8a918b)",
    volt: "var(--token-wnKZyblTz, #b7f34a)",
    focus: "var(--token-kaftmF1nD, #6a9320)",
}
const MONO = '"IBM Plex Mono", ui-monospace, monospace'
const SANS = '"Instrument Sans", system-ui, sans-serif'
const EASE = "cubic-bezier(.16,1,.3,1)" // --ease (expo out): arrivals
const SINE = "cubic-bezier(.37,0,.63,1)" // sine in-out: travel and fades
const PACE = 1.3 // motion.pace.pace
const PLAY3 = 0.288 * PACE // --play-3: a line arriving
const PLAY4 = 0.432 * PACE // --play-4: the longest single move
const L = 28 // seconds, one afternoon
const STILL = 22 // the frame shown with reduced motion and on the canvas
const RESET = 25.4 // the readings go back to the morning's
const ROOT2 = Math.SQRT2
const NEST = 16 * (2 - ROOT2) // extra cut per track, so a bus's 45° runs keep the 16-unit pitch

type Pt = [number, number]
type InK = "message" | "call" | "walkin" | "link"
type OutK = "orders" | "bookings" | "owed" | "stock" | "receipts" | "report"
const INS: InK[] = ["message", "call", "walkin", "link"]
const OUTS: OutK[] = ["orders", "bookings", "owed", "stock", "receipts", "report"]

// ---------- the afternoon ----------
// Inputs fire (from the outside world, several customers at once)...
const FIRE: { input: InK; t: number; id: string }[] = [
    { input: "message", t: 0.8, id: "m1" }, // an order, #1440
    { input: "call", t: 1.3, id: "c1" }, // a cake tasting at 6:00 pm, booked by the team
    { input: "link", t: 1.8, id: "k1" }, // an order from the order page, #1441
    { input: "walkin", t: 2.3, id: "w1" }, // QAR 3,400 on account
    { input: "message", t: 9.2, id: "m2" }, // the week's 50th order, #1442, the last cheesecakes
]
// ...and the block hands each on, one at a time. `state` is the reading it sets.
const SEND: { out: OutK; t: number; state: number; from?: string }[] = [
    { out: "orders", t: 2.75, state: 1, from: "m1" },
    { out: "stock", t: 2.9, state: 1, from: "m1" },
    { out: "bookings", t: 4.4, state: 1, from: "c1" },
    { out: "orders", t: 5.9, state: 2, from: "k1" },
    { out: "stock", t: 6.05, state: 2, from: "k1" },
    { out: "owed", t: 7.7, state: 1, from: "w1" },
    { out: "orders", t: 11.2, state: 3, from: "m2" },
    { out: "stock", t: 11.35, state: 3, from: "m2" },
    { out: "bookings", t: 13.6, state: 2 }, // by itself: the reminder, 2 h before
    { out: "receipts", t: 15.3, state: 1 }, // by itself: #1442's receipt
    { out: "report", t: 17.6, state: 1 }, // by itself: the week so far
]

type Reading = { v: string; s?: string; s2?: string }
type Words = {
    ports: Record<InK, string>
    terms: Record<OutK, string>
    states: Record<OutK, Reading[]>
    caption: string
    pause: string
    play: string
    pauseName: string
    playName: string
}
// The product's own words (Orders, New, Bookings, Owed to you, Stock, Sold out, Reminder sent,
// Receipt sent, "Week so far: 50 orders, QAR 8,520."). An order lands as "New": the team
// confirms it, ALYR does not (orders/service.py). `compact` is for narrow layouts.
const WORDS = (compact: boolean, phone = false): Words => ({
    ports: { message: "MESSAGE", call: "CALL", walkin: "WALK-IN", link: "LINK" },
    terms: { orders: "ORDERS", bookings: "BOOKINGS", owed: "OWED", stock: "STOCK", receipts: "RECEIPTS", report: "REPORT" },
    states: {
        orders: [
            { v: "47", s: "#1439 · New" },
            { v: "48", s: "#1440 · New" },
            { v: "49", s: "#1441 · New" },
            { v: "50", s: "#1442 · New" },
        ],
        bookings: phone
            ? [{ v: "—" }, { v: "6:00 pm", s: "Cake tasting" }, { v: "6:00 pm", s: "Reminder sent" }]
            : [
                  { v: "—" },
                  { v: "6:00 pm", s: "Cake tasting", s2: "Booked" },
                  { v: "6:00 pm", s: "Cake tasting", s2: compact ? "Reminder sent" : "Reminder sent · 2 h before" },
              ],
        owed: [
            { v: "QAR 9,575", s: "Owed to you" },
            { v: "QAR 12,975", s: compact ? "+ QAR 3,400" : "+ QAR 3,400 on account" },
        ],
        stock: compact
            ? [
                  { v: "6 left", s: "Pistachio kunafa", s2: "cheesecake" },
                  { v: "5 left", s: "Pistachio kunafa", s2: "cheesecake" },
                  { v: "3 left", s: "Pistachio kunafa", s2: "cheesecake" },
                  { v: "Sold out", s: "Pistachio kunafa", s2: "cheesecake" },
              ]
            : [
                  { v: "6 left", s: "Pistachio kunafa cheesecake" },
                  { v: "5 left", s: "Pistachio kunafa cheesecake" },
                  { v: "3 left", s: "Pistachio kunafa cheesecake" },
                  { v: "Sold out", s: "Pistachio kunafa cheesecake" },
              ],
        receipts: [{ v: "—" }, { v: "Receipt sent", s: "#1442" }],
        report: compact ? [{ v: "—" }, { v: "QAR 8,520", s: "Week so far: 50 orders" }] : [{ v: "—" }, { v: "Week so far: 50 orders, QAR 8,520." }],
    },
    caption: "SAMPLE · QIRFA BAKERY",
    pause: "Pause",
    play: "Play",
    pauseName: "Pause the diagram",
    playName: "Play the diagram",
})

// ---------- geometry ----------
const f = (n: number) => Math.round(n * 100) / 100
// Orthogonal and 45° waypoints; cuts[i] chamfers the corner at point i along 45°.
function route(pts: Pt[], cuts: Record<number, number> = {}): Pt[] {
    const out: Pt[] = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++) {
        const c = cuts[i] || 0
        if (!c) {
            out.push(pts[i])
            continue
        }
        const [ax, ay] = pts[i - 1]
        const [bx, by] = pts[i]
        const [dx, dy] = pts[i + 1]
        const la = Math.hypot(bx - ax, by - ay)
        const ld = Math.hypot(dx - bx, dy - by)
        out.push([bx - ((bx - ax) / la) * c, by - ((by - ay) / la) * c])
        out.push([bx + ((dx - bx) / ld) * c, by + ((dy - by) / ld) * c])
    }
    out.push(pts[pts.length - 1])
    return out
}
const dOf = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("")
const lenOf = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0)
// The Command Fold's three planes (brand.tsx FoldPlanes), at scale k from (x, y).
const FOLD = {
    top: [[50, 0], [180, 0], [130, 62], [0, 62]] as Pt[],
    tri: [[0, 72], [126, 72], [39, 160]] as Pt[],
    volt: [[134, 72], [190, 72], [142, 160], [46, 160]] as Pt[],
}
const plane = (p: Pt[], x: number, y: number, k: number) => p.map(([a, b]) => `${f(x + a * k)},${f(y + b * k)}`).join(" ")

type Read = { x: number; y: number; anchor: "start" | "end" }
type Geo = {
    W: number
    H: number
    k: number
    X0: number
    Y0: number
    flags: { cx: number; cy: number; poly: Pt[] }[]
    ins: Pt[][]
    outs: Record<OutK, Pt[]>
    read: Record<OutK, Read>
    caption: { x: number; y: number; anchor: "start" | "end"; split?: boolean }
    fs: { lab: number; val: number; sub: number; oL: number; oV: number; oS: number; oS2: number } // sizes, and baselines below the pad
    pad: number
    pin: number
}

// Wide (1440 × 820 units; the first screen, header included). s is the on-screen scale.
function wideGeo(s: number): Geo {
    const k = 1 // the symbol at its own size, 190 × 160
    const X0 = 994
    const Y0 = 376
    const Y1 = Y0 + 160 * k // the Volt plane's bottom edge, 536
    const yF = [168, 216, 264, 312] // the ports, 48 apart
    const T = [216, 232, 248, 264] // the input bus, 16 apart
    const E = [1096, 1112, 1128, 1144] // where it lands on the fold's top edge
    const flags = yF.map((cy) => ({ cx: 1356, cy, poly: [[1308, cy], [1320, cy - 12], [1392, cy - 12], [1392, cy + 12], [1320, cy + 12]] as Pt[] }))
    const ins = yF.map((y, i) => route([[1308, y], [1288, y], [1288 - Math.abs(T[i] - y), T[i]], [E[i], T[i]], [E[i], Y0]], { 3: 16 + (3 - i) * NEST }))
    const PADY = 704
    // the bus: exits on the Volt plane's bottom edge, 16 apart; the outermost peels off first.
    // Terminals sit 176 apart; ORDERS drops straight down.
    const bus: { out: OutK; x: number; y: number; P: number; n: number }[] = [
        { out: "bookings", x: 1104, y: 632, P: 944, n: 3 },
        { out: "owed", x: 1088, y: 616, P: 768, n: 2 },
        { out: "stock", x: 1072, y: 600, P: 592, n: 1 },
        { out: "receipts", x: 1056, y: 584, P: 416, n: 0 },
    ]
    const outs = {} as Record<OutK, Pt[]>
    const read = {} as Record<OutK, Read>
    outs.orders = [[1120, Y1], [1120, PADY]]
    read.orders = { x: 1116, y: PADY, anchor: "start" }
    for (const b of bus) {
        outs[b.out] = route([[b.x, Y1], [b.x, b.y], [b.P, b.y], [b.P, PADY]], { 1: 16 + b.n * NEST, 2: 8 })
        read[b.out] = { x: b.P - 4, y: PADY, anchor: "start" }
    }
    // the report leaves from the fold's apex, along its diagonal, on the bus's top track
    const ax = X0 + 39 * k
    outs.report = route([[ax, Y1], [ax - 32, Y1 + 32], [52, Y1 + 32], [52, PADY]], { 2: 8 })
    read.report = { x: 48, y: PADY, anchor: "start" }
    const small = s < 0.9
    const lab = (small ? 10 : 11) / s
    const val = (small ? 15 : 18) / s
    const sub = (small ? 11 : 12) / s
    return {
        W: 1440,
        H: 820,
        k,
        X0,
        Y0,
        flags,
        ins,
        outs,
        read,
        caption: { x: 1392, y: 136, anchor: "end" },
        fs: { lab, val, sub, oL: lab * 2, oV: lab * 2 + val * 1.25, oS: lab * 2 + val * 1.25 + sub * 1.5, oS2: lab * 2 + val * 1.25 + sub * 2.85 },
        pad: 8,
        pin: 6,
    }
}

// Phone (390 × 360 units, under the hero): ports in a row, the fold, a spine of six tracks that
// peel off to two columns of terminals.
function phoneGeo(): Geo {
    const k = 0.5
    const X0 = 148
    const Y0 = 92
    const Y1 = Y0 + 160 * k // 172
    const cx = [56, 148, 242, 334]
    const flags = cx.map((x) => ({ cx: x, cy: 17, poly: [[x - 40, 6], [x + 40, 6], [x + 40, 28], [x, 39], [x - 40, 28]] as Pt[] }))
    const E = [191, 199, 207, 215]
    const inner = 6
    const outer = 6 + 8 * (2 - ROOT2)
    const ins = [
        route([[cx[0], 39], [cx[0], 68], [E[0], 68], [E[0], Y0]], { 1: 6, 2: inner }),
        route([[cx[1], 39], [cx[1], 60], [E[1], 60], [E[1], Y0]], { 1: 6, 2: outer }),
        route([[cx[2], 39], [cx[2], 60], [E[2], 60], [E[2], Y0]], { 1: 6, 2: outer }),
        route([[cx[3], 39], [cx[3], 68], [E[3], 68], [E[3], Y0]], { 1: 6, 2: inner }),
    ]
    const rows = [196, 250, 304]
    // STOCK takes the bottom row on its side: its item name needs two lines there
    const spine: { out: OutK; x: number; row: number; side: -1 | 1 }[] = [
        { out: "orders", x: 175, row: 0, side: -1 },
        { out: "bookings", x: 183, row: 1, side: -1 },
        { out: "stock", x: 191, row: 2, side: -1 },
        { out: "report", x: 199, row: 2, side: 1 },
        { out: "receipts", x: 207, row: 1, side: 1 },
        { out: "owed", x: 215, row: 0, side: 1 },
    ]
    const outs = {} as Record<OutK, Pt[]>
    const read = {} as Record<OutK, Read>
    for (const sp of spine) {
        const y = rows[sp.row]
        const px = sp.side < 0 ? 162 : 228
        outs[sp.out] = route([[sp.x, Y1], [sp.x, y], [px, y]], { 1: 6 })
        read[sp.out] = { x: sp.side < 0 ? 152 : 238, y, anchor: sp.side < 0 ? "end" : "start" }
    }
    const lab = 10
    const val = 15
    const sub = 11
    return {
        W: 390,
        H: 360,
        k,
        X0,
        Y0,
        flags,
        ins,
        outs,
        read,
        caption: { x: 16, y: 112, anchor: "start", split: true },
        fs: { lab, val, sub, oL: 3.6, oV: 21, oS: 35, oS2: 48 },
        pad: 7,
        pin: 4,
    }
}

// ---------- timing ----------
function bezier(x1: number, y1: number, x2: number, y2: number, u: number) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 26; i++) {
        const m = (lo + hi) / 2
        const x = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m
        if (x < u) lo = m
        else hi = m
    }
    const m = (lo + hi) / 2
    return 3 * (1 - m) * (1 - m) * m * y1 + 3 * (1 - m) * m * m * y2 + m * m * m
}
const curve = (e: string) => (e.match(/-?[\d.]+/g) || []).map(Number)
function ease(e: string | undefined, u: number) {
    if (!e) return u
    const c = curve(e)
    return c.length === 4 ? bezier(c[0], c[1], c[2], c[3], u) : u
}
// the time fraction at which an eased run has covered `p` of its way
function timeFor(e: string, p: number) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2
        if (ease(e, m) < p) lo = m
        else hi = m
    }
    return (lo + hi) / 2
}

type V = { o?: number; x?: number; y?: number; d?: number }
type Stop = [number, V, string?]
const cssOf = (v: V) => {
    const p: string[] = []
    if (v.o !== undefined) p.push(`opacity:${f(v.o)}`)
    if (v.x !== undefined) p.push(`transform:translate(${f(v.x)}px,${f(v.y || 0)}px)`)
    if (v.d !== undefined) p.push(`stroke-dashoffset:${f(v.d)}`)
    return p.join(";")
}
function stateAt(stops: Stop[] | undefined, t: number): React.CSSProperties {
    if (!stops || !stops.length) return {}
    let i = 0
    while (i < stops.length - 1 && stops[i + 1][0] <= t) i++
    const a = stops[i]
    const b = stops[Math.min(i + 1, stops.length - 1)]
    const u = b[0] > a[0] ? ease(a[2], Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 1
    const mix = (k: keyof V) => (a[1][k] === undefined ? undefined : (a[1][k] as number) + (((b[1][k] ?? a[1][k]) as number) - (a[1][k] as number)) * u)
    const out: React.CSSProperties = {}
    const o = mix("o")
    const x = mix("x")
    const y = mix("y")
    const d = mix("d")
    if (o !== undefined) out.opacity = f(o)
    if (x !== undefined) out.transform = `translate(${f(x)}px,${f(y || 0)}px)`
    if (d !== undefined) out.strokeDashoffset = f(d)
    return out
}

const HEAD = 24 // a signal's ink head, in units
const TAIL = 64 // its trail
type Run = { route: Pt[]; len: number; t0: number; dur: number; arrive: number }
function run(pts: Pt[], t0: number, s: number): Run {
    const len = lenOf(pts)
    const S = len + HEAD + TAIL
    const dur = 0.55 + (S * s) / 470
    return { route: pts, len, t0, dur, arrive: t0 + dur * timeFor(SINE, len / (len + HEAD + TAIL)) }
}

function buildAfternoon(geo: Geo, uid: string, words: Words, s: number, dir: 1 | -1) {
    const css: string[] = []
    const stopsOf: Record<string, Stop[]> = {}
    const pct = (t: number) => `${Math.round(Math.min(100, Math.max(0, (t / L) * 100)) * 1000) / 1000}%`
    let n = 0
    const K = (stops: Stop[]) => {
        const name = `${uid}a${(n++).toString(36)}`
        const sorted = stops.slice().sort((p, q) => p[0] - q[0])
        const seen = new Set<string>()
        const uniq = sorted.filter(([t]) => {
            const k = pct(t)
            if (seen.has(k)) return false
            seen.add(k)
            return true
        })
        stopsOf[name] = uniq
        css.push(`@keyframes ${name}{${uniq.map(([t, v, e]) => `${pct(t)}{${cssOf(v)}${e ? `;animation-timing-function:${e}` : ""}}`).join("")}}`)
        css.push(`.${name}{animation:${name} ${L}s linear infinite;animation-delay:calc(var(--bs-t,0)*-1s)}`)
        return name
    }
    // shown inside windows [a, b); a window that starts at 0 or ends at L joins the loop's seam
    const TR = 5 / s
    const windows = (wins: [number, number][], opt: { inDur?: number; outDur?: number; travel?: boolean } = {}) => {
        const inDur = opt.inDur ?? PLAY3
        const outDur = opt.outDur ?? PLAY3
        const tr = opt.travel ? TR : 0
        const at = (o: number, ph: -1 | 0 | 1): V => (opt.travel ? { o, x: ph === -1 ? -tr * dir : ph === 1 ? tr * dir : 0, y: ph === -1 ? tr : ph === 1 ? -tr : 0 } : { o })
        const st: Stop[] = []
        const sorted = wins.slice().sort((p, q) => p[0] - q[0])
        if (!sorted.length || sorted[0][0] > 0) st.push([0, at(0, -1)])
        sorted.forEach(([a, b]) => {
            if (a <= 0) st.push([0, at(1, 0)])
            else {
                st.push([a, at(0, -1), EASE])
                st.push([a + inDur, at(1, 0)])
            }
            if (b >= L) st.push([L, at(1, 0)])
            else {
                st.push([b, at(1, 0), SINE])
                st.push([b + outDur, at(0, 1)])
            }
        })
        if (sorted.length && sorted[sorted.length - 1][1] < L) st.push([L, at(0, -1)])
        return K(st)
    }
    const packet = (r: Run) => {
        const S = r.len + HEAD + TAIL
        const head = K([[0, { d: HEAD }], [r.t0, { d: HEAD }, SINE], [r.t0 + r.dur, { d: HEAD - S }], [L, { d: HEAD - S }]])
        const tail = K([[0, { d: HEAD + TAIL }], [r.t0, { d: HEAD + TAIL }, SINE], [r.t0 + r.dur, { d: HEAD + TAIL - S }], [L, { d: HEAD + TAIL - S }]])
        return { d: dOf(r.route), len: r.len, gap: S + HEAD + TAIL + 10, head, tail }
    }

    // the active path: drawn on behind the signal's head (sampled from its own curve), held
    // while its reading is the newest, then let go
    const active = (r: Run, until: number) => {
        const S = r.len + HEAD + TAIL
        const st: Stop[] = [[0, { o: 1, d: r.len }], [r.t0, { o: 1, d: r.len }]]
        const N = 10
        for (let i = 1; i <= N; i++) {
            const t = r.t0 + ((r.arrive - r.t0) * i) / N
            const sNow = ease(SINE, (t - r.t0) / r.dur) * S
            st.push([t, { o: 1, d: Math.max(0, r.len - sNow) }])
        }
        st.push([until, { o: 1, d: 0 }, SINE])
        st.push([until + PLAY4, { o: 0, d: 0 }])
        st.push([Math.min(L, until + PLAY4 + 0.1), { o: 0, d: r.len }])
        st.push([L, { o: 0, d: r.len }])
        return K(st)
    }

    // inputs: travel to the fold, wait at their pin
    const fired = FIRE.map((fi) => {
        const r = run(geo.ins[INS.indexOf(fi.input)], fi.t, s)
        return { ...fi, r }
    })
    const firstOut: Record<string, number> = {}
    // outputs: leave the fold one at a time (never before their input has landed)
    const sent = SEND.map((se) => {
        const from = fired.find((x) => x.id === se.from)
        const t0 = from ? Math.max(se.t, from.r.arrive + 0.25) : se.t
        if (se.from) firstOut[se.from] = Math.min(firstOut[se.from] ?? 99, t0)
        const r = run(geo.outs[se.out], t0, s)
        return { ...se, r }
    })
    // Volt: the pad just landed (a fan-out's pads together) until the next landing
    const groups: { t: number; items: typeof sent; key: string }[] = []
    sent.forEach((se, i) => {
        const key = se.from || `self${i}`
        const g = groups.find((x) => x.key === key)
        if (g) g.items.push(se)
        else groups.push({ t: se.r.arrive, items: [se], key })
    })
    groups.sort((a, b) => a.t - b.t)
    const padWins: Record<OutK, [number, number][]> = { orders: [], bookings: [], owed: [], stock: [], receipts: [], report: [] }
    groups.forEach((g, gi) => {
        // off before the next lands, so the Volt never doubles up during a fade
        const end = (gi < groups.length - 1 ? groups[gi + 1].t : RESET) - PLAY3 - 0.05
        g.items.forEach((x) => padWins[x.out].push([x.r.arrive, end]))
    })
    const reportLand = sent.find((x) => x.out === "report")!.r.arrive

    // readings: one element per distinct text on each line, shown while it is current
    type Line = "v" | "s" | "s2"
    const readings = {} as Record<OutK, { line: Line; text: string; cls: string }[]>
    OUTS.forEach((o) => {
        const states = words.states[o]
        const changes: [number, number][] = [[0, 0]]
        sent.filter((x) => x.out === o).forEach((x) => changes.push([x.r.arrive, x.state]))
        changes.push([RESET, 0])
        readings[o] = []
        ;(["v", "s", "s2"] as Line[]).forEach((line) => {
            const seq: [number, string][] = []
            changes.forEach(([t, st]) => {
                const txt = states[st][line] || ""
                if (!seq.length || seq[seq.length - 1][1] !== txt) seq.push([t, txt])
            })
            const byText: Record<string, [number, number][]> = {}
            seq.forEach(([t, txt], i) => {
                const end = i < seq.length - 1 ? seq[i + 1][0] : L
                if (!txt) return
                ;(byText[txt] = byText[txt] || []).push([t, end])
            })
            Object.entries(byText).forEach(([text, wins]) => {
                const always = wins.length === 1 && wins[0][0] <= 0 && wins[0][1] >= L
                readings[o].push({ line, text, cls: always ? "" : windows(wins, { inDur: PLAY4, outDur: PLAY3, travel: true }) })
            })
        })
    })

    const inputs = fired.map((x) => ({ id: x.id, input: x.input, p: packet(x.r), port: windows([[x.t, x.t + 0.9]], { inDur: 0.12, outDur: 0.5 }), pin: windows([[x.r.arrive, firstOut[x.id] ?? x.r.arrive + 0.4]], { inDur: 0.08, outDur: 0.16 }) }))
    const untilOf = (x: (typeof sent)[number]) => {
        const g = groups.findIndex((gg) => gg.items.includes(x))
        return g < groups.length - 1 ? groups[g + 1].t : RESET
    }
    const outputs = sent.map((x) => ({ out: x.out, p: packet(x.r), live: active(x.r, untilOf(x)), pin: windows([[x.r.t0, x.r.t0 + 0.42]], { inDur: 0.06, outDur: 0.24 }) }))
    const pads = Object.fromEntries(OUTS.map((o) => [o, windows(padWins[o], { inDur: 0.1, outDur: PLAY3 })])) as Record<OutK, string>
    const fold = windows([[reportLand, RESET]], { inDur: PLAY4, outDur: PLAY4 })
    // the sheet is joined last, after every part has added its keyframes
    return {
        inputs,
        outputs,
        pads,
        fold,
        readings,
        css: css.join(""),
        stopsOf,
        times: { fired: fired.map((x) => [x.id, x.t, f(x.r.arrive)]), sent: sent.map((x) => [x.out, x.state, f(x.r.t0), f(x.r.arrive)]) },
    }
}

type Props = {
    mode?: "auto" | "wide" | "phone"
    at?: number
    scale?: number
    inset?: number
    mirror?: boolean
    foldVolt?: boolean
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
export default function BgSchematic(props: Props) {
    const { mode = "auto", at = -1, scale = 1, inset = 48, mirror = false, foldVolt = true, style } = props
    const rtl = mirror
    const dir: 1 | -1 = rtl ? -1 : 1
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const ref = useRef<HTMLDivElement>(null)
    const [uid] = useState(() => `bs${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`)
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
    const s = phone ? (boxW > 0 ? boxW : 390) / 390 : scale
    const compact = phone || s < 0.9
    const words = useMemo(() => {
        const w = WORDS(compact, phone)
        return { ...w, pause: props.pauseWord || w.pause, play: props.playWord || w.play, pauseName: props.pauseName || w.pauseName, playName: props.playName || w.playName }
    }, [compact, phone, props.pauseWord, props.playWord, props.pauseName, props.playName])
    const geo = useMemo(() => (phone ? phoneGeo() : wideGeo(s)), [phone, s])
    const day = useMemo(() => buildAfternoon(geo, uid, words, phone ? 1 : s, dir), [geo, uid, words, s, dir, phone])
    const staticFrame = isCanvas || reduce
    const frozen = at >= 0 && !staticFrame
    const paused = staticFrame || frozen || userPaused || away
    const u = phone ? 1 : 1 / s // one screen pixel, in units

    const A = (name: string | undefined, more?: React.CSSProperties) => {
        if (!name) return { style: more }
        if (staticFrame) return { style: { ...stateAt(day.stopsOf[name], STILL), ...more } }
        return { className: name, style: more }
    }
    const W = geo.W
    const mx = (x: number) => (rtl ? W - x : x)
    const flipAnchor = (a: "start" | "end" | "middle") => (rtl ? (a === "start" ? "end" : a === "end" ? "start" : a) : a)
    const k = geo.k
    const { X0, Y0 } = geo
    const pinAt = (x: number, y: number, size: number) => ({ x: f(x - size / 2), y: f(y - size / 2), width: size, height: size })

    // entry and exit pins
    const entries = geo.ins.map((r) => r[r.length - 1])
    const exitOf = (o: OutK) => geo.outs[o][0]

    const sheet = `
.${uid}.p *{animation-play-state:paused!important}
.${uid} button:hover{color:${C.text}!important}
.${uid} button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}
`
    const svgStyle: React.CSSProperties = phone
        ? { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "100%", overflow: "visible" }
        : { position: "absolute", bottom: 0, [rtl ? "right" : "left"]: Math.round(inset - 48 * s), width: 1440 * s, height: 820 * s, overflow: "visible" }
    const glyph = (on: boolean): React.CSSProperties =>
        on
            ? { width: 0, height: 0, borderTop: "5.4px solid transparent", borderBottom: "5.4px solid transparent", borderInlineStart: "9.3px solid currentColor" }
            : { width: 10, height: 10, borderInlineStart: "3px solid currentColor", borderInlineEnd: "3px solid currentColor", boxSizing: "border-box" }
    const fs = geo.fs
    const crisp = phone ? 0 : 0.5

    return (
        <div
            ref={ref}
            data-bs=""
            className={`${uid}${paused ? " p" : ""}`}
            dir={rtl ? "rtl" : "ltr"}
            style={{ width: "100%", height: "100%", ...style, position: "relative", overflow: "hidden", ["--bs-t" as any]: frozen ? at : undefined } as React.CSSProperties}
        >
            {staticFrame ? null : <style>{sheet + day.css}</style>}
            <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${geo.W} ${geo.H}`} preserveAspectRatio={phone ? "xMidYMax meet" : "xMinYMax meet"} style={svgStyle}>
                <g transform={rtl ? `matrix(-1 0 0 1 ${W} 0)` : undefined}>
                    <g transform={`translate(${crisp} ${crisp})`} fill="none" strokeLinecap="butt" strokeLinejoin="miter">
                        {/* the traces */}
                        <g stroke={C.hair} strokeWidth={u}>
                            {geo.ins.map((r, i) => (
                                <path key={`i${i}`} d={dOf(r)} />
                            ))}
                            {OUTS.map((o) => (
                                <path key={`o${o}`} d={dOf(geo.outs[o])} />
                            ))}
                        </g>
                        {/* the fold: three planes, the symbol's own geometry */}
                        <g stroke={C.hair} strokeWidth={u} fill={C.surface}>
                            <polygon points={plane(FOLD.top, X0, Y0, k)} />
                            <polygon points={plane(FOLD.tri, X0, Y0, k)} />
                            <polygon points={plane(FOLD.volt, X0, Y0, k)} />
                        </g>
                        {foldVolt ? <polygon points={plane(FOLD.volt, X0, Y0, k)} fill={C.volt} stroke="none" {...A(day.fold)} /> : null}
                        {/* the ports */}
                        <g strokeWidth={u}>
                            {geo.flags.map((fl, i) => (
                                <polygon key={i} points={fl.poly.map(([x, y]) => `${x},${y}`).join(" ")} stroke={C.hair} fill={C.canvas} />
                            ))}
                            {day.inputs.map((x, i) => {
                                const fl = geo.flags[INS.indexOf(x.input)]
                                return <polygon key={`f${i}`} points={fl.poly.map(([a, b]) => `${a},${b}`).join(" ")} stroke={C.strong} fill="none" {...A(x.port)} />
                            })}
                        </g>
                        {/* the pins on the fold, and the terminals' pads */}
                        <g strokeWidth={u}>
                            {entries.map((p, i) => (
                                <rect key={`e${i}`} {...pinAt(p[0], p[1], geo.pin)} fill={C.surface} stroke={C.strong} />
                            ))}
                            {day.inputs.map((x, i) => {
                                const p = entries[INS.indexOf(x.input)]
                                return <rect key={`ef${i}`} {...pinAt(p[0], p[1], geo.pin)} fill={C.text} stroke="none" {...A(x.pin)} />
                            })}
                            {OUTS.map((o) => {
                                const p = exitOf(o)
                                return o === "report" && !phone ? (
                                    <circle key={`x${o}`} cx={f(p[0])} cy={f(p[1])} r={geo.pin / 2} fill={C.surface} stroke={C.strong} />
                                ) : (
                                    <rect key={`x${o}`} {...pinAt(p[0], p[1], geo.pin)} fill={C.surface} stroke={C.strong} />
                                )
                            })}
                            {day.outputs.map((x, i) => {
                                const p = exitOf(x.out)
                                return x.out === "report" && !phone ? (
                                    <circle key={`xf${i}`} cx={f(p[0])} cy={f(p[1])} r={geo.pin / 2} fill={C.text} {...A(x.pin)} />
                                ) : (
                                    <rect key={`xf${i}`} {...pinAt(p[0], p[1], geo.pin)} fill={C.text} {...A(x.pin)} />
                                )
                            })}
                            {OUTS.map((o) => {
                                const r = geo.outs[o]
                                const p = r[r.length - 1]
                                return (
                                    <g key={`p${o}`}>
                                        <rect {...pinAt(p[0], p[1], geo.pad)} fill={C.canvas} stroke={C.strong} />
                                        <rect {...pinAt(p[0], p[1], geo.pad)} fill={C.volt} stroke={C.text} {...A(day.pads[o])} />
                                    </g>
                                )
                            })}
                        </g>
                        {/* the active path: the newest reading's route, at the one heavier weight */}
                        <g stroke={C.strong} strokeWidth={1.5 * u}>
                            {day.outputs.map((x, i) => (
                                <path key={`a${i}`} d={x.p.d} strokeDasharray={`${f(x.p.len)} ${f(x.p.len + 10)}`} {...A(x.live, staticFrame ? undefined : { strokeDashoffset: x.p.len })} />
                            ))}
                        </g>
                        {/* the signals: a trail, then an ink head */}
                        <g>
                            {[...day.inputs.map((x) => x.p), ...day.outputs.map((x) => x.p)].map((p, i) => (
                                <g key={`s${i}`}>
                                    <path d={p.d} stroke={C.strong} strokeWidth={u} strokeDasharray={`${TAIL} ${f(p.gap)}`} {...A(p.tail, staticFrame ? undefined : { strokeDashoffset: HEAD + TAIL })} />
                                    <path d={p.d} stroke={C.text} strokeWidth={1.5 * u} strokeDasharray={`${HEAD} ${f(p.gap)}`} {...A(p.head, staticFrame ? undefined : { strokeDashoffset: HEAD })} />
                                </g>
                            ))}
                        </g>
                    </g>
                </g>
                {/* words, never mirrored; anchors are physical (the English words are shaped left to right) */}
                <g style={{ fontFamily: MONO, letterSpacing: "0.08em", direction: "ltr" }} fontSize={fs.lab} fill={C.faint}>
                    {geo.flags.map((fl, i) => (
                        <text key={i} x={f(mx(fl.cx))} y={f(fl.cy + fs.lab * 0.36)} textAnchor="middle" fill={C.muted}>
                            {words.ports[INS[i]]}
                        </text>
                    ))}
                    {OUTS.map((o) => {
                        const r = geo.read[o]
                        return (
                            <text key={o} x={f(mx(r.x))} y={f(r.y + fs.oL)} textAnchor={flipAnchor(r.anchor)}>
                                {words.terms[o]}
                            </text>
                        )
                    })}
                    {(geo.caption.split ? words.caption.split(" · ") : [words.caption]).map((line, i) => (
                        <text key={`c${i}`} x={f(mx(geo.caption.x))} y={f(geo.caption.y + i * fs.lab * 1.5)} textAnchor={flipAnchor(geo.caption.anchor)}>
                            {line}
                        </text>
                    ))}
                </g>
                <g style={{ fontFamily: SANS, fontVariantNumeric: "tabular-nums", direction: "ltr" }}>
                    {OUTS.map((o) => {
                        const r = geo.read[o]
                        return (
                            <g key={o}>
                                {day.readings[o].map((rd, i) => {
                                    const y = r.y + (rd.line === "v" ? fs.oV : rd.line === "s" ? fs.oS : fs.oS2)
                                    const isDash = rd.text === "—"
                                    return (
                                        <text
                                            key={i}
                                            x={f(mx(r.x))}
                                            y={f(y)}
                                            textAnchor={flipAnchor(r.anchor)}
                                            fontSize={rd.line === "v" ? fs.val : fs.sub}
                                            fontWeight={rd.line === "v" ? 500 : 400}
                                            fill={isDash ? C.faint : rd.line === "v" ? C.text : C.muted}
                                            {...A(rd.cls || undefined)}
                                        >
                                            {rd.text}
                                        </text>
                                    )
                                })}
                            </g>
                        )
                    })}
                </g>
            </svg>
            <button
                type="button"
                aria-label={userPaused ? words.playName : words.pauseName}
                aria-pressed={userPaused}
                hidden={staticFrame || frozen}
                onClick={() => setUserPaused((v) => !v)}
                style={{
                    position: "absolute",
                    display: staticFrame || frozen ? "none" : "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 44,
                    padding: "0 12px",
                    border: 0,
                    background: "transparent",
                    color: C.muted,
                    font: "inherit",
                    fontFamily: SANS,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    ...(phone ? { insetInlineEnd: 4, top: 100 } : { insetInlineEnd: inset - 12, bottom: 16 }),
                }}
            >
                <span aria-hidden="true" style={glyph(userPaused)} />
                <span>{userPaused ? words.play : words.pause}</span>
            </button>
        </div>
    )
}

addPropertyControls(BgSchematic, {
    mode: { type: ControlType.Enum, title: "Layout", options: ["auto", "wide", "phone"], optionTitles: ["Auto", "Wide", "Phone"], defaultValue: "auto" },
    at: { type: ControlType.Number, title: "Still at (s)", min: -1, max: 28, step: 0.1, defaultValue: -1, description: "-1 plays the loop" },
    scale: { type: ControlType.Number, title: "Scale", min: 0.4, max: 1.4, step: 0.01, defaultValue: 1, hidden: (p: Props) => p.mode === "phone" },
    inset: { type: ControlType.Number, title: "Gutter", min: 0, max: 96, step: 1, defaultValue: 48 },
    mirror: { type: ControlType.Boolean, title: "Mirror (RTL)", defaultValue: false },
    foldVolt: { type: ControlType.Boolean, title: "Fold lights", defaultValue: true },
    pauseWord: { type: ControlType.String, title: "Pause", defaultValue: "" },
    playWord: { type: ControlType.String, title: "Play", defaultValue: "" },
    pauseName: { type: ControlType.String, title: "Pause name", defaultValue: "" },
    playName: { type: ControlType.String, title: "Play name", defaultValue: "" },
})
