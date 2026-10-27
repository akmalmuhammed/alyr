// ALYR prototype: a doodle background for the homepage hero (docs/doodle-study/01-concept.md).
// One street of small shops, drawn like an architect's sketch: a single-weight pen line, ruled
// by hand, corners that cross. Morning: shutters roll up and a phone fills with tangled
// messages. One continuous line, the ALYR thread, comes along the street and puts things in
// order (a job card, the messages as tickets, the notebook, a receipt, the salon's week, the
// two weeks side by side), then runs back to where it started. Evening: the shutters close.
//
// Volt only on the thread's tip and on the one thing just fixed. Loops (D-059), pauses off
// screen, in a hidden tab and with the Pause button (WCAG 2.2.2); a still frame with reduced
// motion and on Framer's canvas. Mirrored in Arabic. No words in the drawing but "#1001".
// Colours are the project's "ALYR/<token>" colour styles from design/tokens.json.
import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

const C = {
    ink: "var(--token-cE5AGFc5n, rgba(21, 23, 26, 0.14))", // --hair-strong: the street
    fixed: "var(--token-cE5AGFc5n, rgba(21, 23, 26, 0.14))", // what the thread put right joins the drawing
    trail: "var(--token-SVZjCcT_M, #8a918b)", // --line-strong: the thread's last stretch, behind its tip
    volt: "var(--token-wnKZyblTz, #b7f34a)",
    text: "var(--token-XYAPSNcOu, #15171a)",
    muted: "var(--token-tpGxkcLLH, #5f666d)",
    canvas: "var(--token-S2oE56wbE, #f6f7f3)",
    focus: "var(--token-kaftmF1nD, #6a9320)",
}
const EASE = "cubic-bezier(.16,1,.3,1)" // --ease
const L = 24 // seconds, one day
const STILL = 19.2 // the frame shown with reduced motion and on the canvas
const PEN = 1.4 // px on screen, whatever the drawing's scale
const SW = 900 // the stage, in drawing units
const SH = 572
const GROUND = 540
const PHONE_CROP = 280 // a phone shows the bakery and the salon

type Pt = [number, number]
type Stroke =
    | { l: number[] } // ruled line x1 y1 x2 y2
    | { p: number[]; z?: boolean } // ruled polyline, each segment its own stroke
    | { c: number[] } // freehand curve through points
    | { e: number[] } // hand circle cx cy rx ry

// ---------- the hand ----------
function rng(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const f = (n: number) => Math.round(n * 10) / 10
function smooth(pts: Pt[]): string {
    if (pts.length < 2) return ""
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[i + 2] || p2
        d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`
    }
    return d
}
// A line ruled by hand: it overshoots both ends a little, bows by less than a pixel and
// wavers by less than half of one. `take` is the boil frame: the same line, drawn again.
function ruled(x1: number, y1: number, x2: number, y2: number, seed: number, take: number, os = 2.2): string {
    const base = rng(seed * 7919 + 17)
    const r = rng(seed * 7919 + take * 104729 + 3)
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux
    const o1 = os * (0.4 + base())
    const o2 = os * (0.4 + base())
    const ax = x1 - ux * o1
    const ay = y1 - uy * o1
    const bx = x2 + ux * o2
    const by = y2 + uy * o2
    const n = Math.max(2, Math.round(len / 26))
    const bow = (base() - 0.5) * Math.min(1.8, len / 70)
    const pts: Pt[] = []
    for (let i = 0; i <= n; i++) {
        const t = i / n
        const w = bow * Math.sin(Math.PI * t) + (base() - 0.5) * 0.45 + (r() - 0.5) * 0.6
        pts.push([ax + (bx - ax) * t + nx * w, ay + (by - ay) * t + ny * w])
    }
    return smooth(pts)
}
function stroke(s: Stroke, seed: number, take: number): string {
    if ("l" in s) return ruled(s.l[0], s.l[1], s.l[2], s.l[3], seed, take)
    if ("p" in s) {
        const a = s.p
        let d = ""
        const n = a.length / 2
        const last = s.z ? n : n - 1
        for (let i = 0; i < last; i++) {
            const j = (i + 1) % n
            d += ruled(a[i * 2], a[i * 2 + 1], a[j * 2], a[j * 2 + 1], seed * 31 + i, take, 1.8)
        }
        return d
    }
    if ("c" in s) {
        const base = rng(seed * 6007 + 5)
        const r = rng(seed * 6007 + take * 7331 + 9)
        const pts: Pt[] = []
        for (let i = 0; i < s.c.length; i += 2)
            pts.push([s.c[i] + (base() - 0.5) * 0.7 + (r() - 0.5) * 0.6, s.c[i + 1] + (base() - 0.5) * 0.7 + (r() - 0.5) * 0.6])
        return smooth(pts)
    }
    // A hand circle starts anywhere and closes past its start, as a pen does.
    const [cx, cy, rx, ry] = s.e
    const base = rng(seed * 4513 + 11)
    const r = rng(seed * 4513 + take * 911 + 1)
    const a0 = base() * Math.PI * 2
    const steps = Math.max(8, Math.round((rx + ry) / 2.2))
    const span = Math.PI * 2 + 0.32
    const pts: Pt[] = []
    for (let i = 0; i <= steps; i++) {
        const a = a0 + (span * i) / steps
        const k = 1 + (base() - 0.5) * 0.05 + (r() - 0.5) * 0.04 + (i / steps) * 0.03
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
    }
    return smooth(pts)
}
const rect = (x: number, y: number, w: number, h: number): Stroke[] => [
    { l: [x, y, x + w, y] },
    { l: [x + w, y, x + w, y + h] },
    { l: [x + w, y + h, x, y + h] },
    { l: [x, y + h, x, y] },
]
// A ticket, the receipt and the job card: square, with the brand's one 45° cut.
const cutRect = (x: number, y: number, w: number, h: number, c: number): Stroke[] => [
    { p: [x, y, x + w - c, y, x + w, y + c, x + w, y + h, x, y + h], z: true },
]
function draw(strokes: Stroke[], seed: number, take: number): string {
    let d = ""
    strokes.forEach((s, i) => (d += stroke(s, seed * 97 + i, take)))
    return d
}

// ---------- the street (drawing units; the ground is y 540) ----------
const VAN: Stroke[] = [
    ...rect(34, 462, 156, 64),
    { p: [190, 474, 226, 474, 248, 500, 248, 526, 190, 526] },
    { p: [197, 481, 223, 481, 238, 499, 197, 499], z: true },
    { e: [74, 528, 12, 12] },
    { e: [74, 528, 4, 4] },
    { e: [214, 528, 12, 12] },
    { e: [214, 528, 4, 4] },
    { l: [50, 450, 172, 450] },
    { l: [50, 456, 172, 456] },
    ...[60, 74, 88, 102, 116, 130, 144, 158].map((x) => ({ l: [x, 450, x, 456] })),
    { l: [62, 456, 62, 462] },
    { l: [160, 456, 160, 462] },
    { l: [198, 508, 206, 508] },
    { l: [243, 512, 248, 512] },
    ...cutRect(110, 476, 38, 32, 7),
    { l: [116, 488, 130, 488] },
    { l: [116, 496, 128, 496] },
]
const BAKERY: Stroke[] = [
    { l: [290, 540, 290, 316] },
    { l: [550, 540, 550, 316] },
    { l: [284, 316, 556, 316] },
    { l: [288, 324, 552, 324] },
    ...rect(384, 332, 72, 22),
    // the croissant on the sign
    { c: [404, 349, 408, 341, 420, 337, 432, 341, 436, 349] },
    { c: [404, 349, 412, 346, 420, 345, 428, 346, 436, 349] },
    { l: [414, 339, 416, 346] },
    { l: [420, 337, 420, 345] },
    { l: [426, 339, 424, 346] },
    // the awning, in stripes
    { l: [296, 362, 544, 362] },
    { l: [286, 386, 554, 386] },
    { l: [296, 362, 286, 386] },
    { l: [544, 362, 554, 386] },
    ...[312, 328, 344, 360, 376, 392, 408, 424, 440, 456, 472, 488, 504, 520, 536].map((x) => ({
        l: [x, 362, 286 + (x - 296) * (268 / 248), 386],
    })),
    ...rect(300, 386, 240, 7),
    // inside: the ticket rail, the counter and what is on it
    { l: [312, 400, 484, 400] },
    ...[328, 362, 396, 430, 464].map((x) => ({ l: [x, 398, x, 404] })),
    { l: [302, 476, 538, 476] },
    { l: [302, 481, 538, 481] },
    { l: [380, 481, 380, 540] },
    { l: [460, 481, 460, 540] },
    ...rect(316, 444, 20, 31),
    ...rect(318.5, 448, 15, 22),
    // the notebook of who owes what, propped up and a mess
    { p: [347, 445, 399, 441, 402, 474, 350, 476], z: true },
    ...[352, 359, 366, 373, 380, 387, 394].map((x, i) => ({ e: [x, 443 - i * 0.6, 2, 2.4] })),
    { c: [354, 452, 358, 450, 363, 453, 369, 450, 374, 452, 379, 450] },
    { c: [355, 460, 360, 458, 366, 461, 371, 458, 377, 460] },
    { c: [355, 468, 361, 466, 367, 469, 372, 466, 381, 468] },
    { c: [356, 455, 362, 463, 368, 455, 374, 463] },
    // a tray of croissants
    { l: [410, 474, 462, 474] },
    { c: [413, 474, 416, 467, 422, 465, 428, 467, 431, 474] },
    { l: [419, 466, 420, 473] },
    { l: [425, 466, 424, 473] },
    { c: [439, 474, 442, 467, 448, 465, 454, 467, 457, 474] },
    { l: [445, 466, 446, 473] },
    { l: [451, 466, 450, 473] },
    // the karak glass on its saucer
    { p: [482, 452, 496, 452, 494, 474, 484, 474], z: true },
    { l: [483, 458, 495, 458] },
    { l: [477, 476, 501, 476] },
    // the receipt printer
    ...rect(506, 459, 30, 17),
    { l: [512, 463, 530, 463] },
    { e: [531, 470, 1.5, 1.5] },
]
const SALON: Stroke[] = [
    { l: [588, 540, 588, 296] },
    { l: [872, 540, 872, 296] },
    { l: [582, 296, 878, 296] },
    { l: [586, 304, 874, 304] },
    ...rect(690, 312, 80, 24),
    // scissors on the sign
    { e: [716, 319.5, 3.4, 3] },
    { e: [716, 328.5, 3.4, 3] },
    { l: [719.5, 321, 746, 328.5] },
    { l: [719.5, 327, 746, 319.5] },
    // a flat canopy
    { l: [588, 346, 872, 346] },
    { l: [584, 354, 876, 354] },
    { l: [600, 346, 596, 354] },
    { l: [860, 346, 864, 354] },
    ...rect(600, 354, 260, 7),
    // inside: the mirror, its shelf, the chair
    { e: [652, 416, 22, 30] },
    { e: [652, 416, 18.5, 26.5] },
    { l: [642, 402, 650, 394] },
    { l: [644, 410, 658, 396] },
    { l: [626, 459, 680, 459] },
    ...rect(662, 449, 5, 10),
    ...rect(670, 445, 5, 14),
    { c: [638, 466, 646, 462, 660, 462, 668, 466] },
    { l: [639, 466, 639, 492] },
    { l: [667, 466, 667, 492] },
    { l: [632, 492, 674, 492] },
    { l: [632, 498, 674, 498] },
    { l: [632, 492, 632, 498] },
    { l: [674, 492, 674, 498] },
    { l: [653, 498, 653, 528] },
    { e: [653, 532, 16, 3] },
    { l: [644, 516, 662, 516] },
    // the week on the wall: five days, three rows
    ...rect(742, 382, 106, 64),
    { l: [742, 394, 848, 394] },
    ...[1, 2, 3, 4].map((k) => ({ l: [742 + k * 21.2, 394, 742 + k * 21.2, 446] })),
    ...[1, 2].map((k) => ({ l: [742, 394 + k * 17.33, 848, 394 + k * 17.33] })),
    { e: [762, 383, 2.4, 4.5] },
    { e: [828, 383, 2.4, 4.5] },
]
const joints = (x0: number) => {
    const out: Stroke[] = []
    for (let x = Math.ceil(x0 / 64) * 64 + 20; x < SW; x += 64) out.push({ l: [x, 540, x - 4, 547] })
    return out
}

// The loose messages: bubbles, a voice note and two question marks, where they hang tangled.
type Loose = { kind: "b" | "v" | "q"; x: number; y: number; w: number; h: number; rot: number }
const LOOSE: Loose[] = [
    { kind: "b", x: 420, y: 250, w: 46, h: 24, rot: -6 },
    { kind: "q", x: 384, y: 192, w: 12, h: 18, rot: -12 },
    { kind: "b", x: 500, y: 206, w: 54, h: 26, rot: 5 },
    { kind: "b", x: 454, y: 150, w: 40, h: 22, rot: 9 },
    { kind: "v", x: 594, y: 246, w: 50, h: 22, rot: -4 },
    { kind: "q", x: 634, y: 190, w: 12, h: 18, rot: 13 },
    { kind: "b", x: 568, y: 148, w: 50, h: 26, rot: -7 },
]
function bubble(w: number, h: number, voice: boolean): Stroke[] {
    const x = -w / 2
    const y = -h / 2
    const r = h * 0.42
    const k = 0.45
    const out: Stroke[] = [
        {
            c: [
                x + r, y, x + w * 0.5, y - 0.8, x + w - r, y,
                x + w - r * k, y + r * k, x + w, y + h / 2, x + w - r * k, y + h - r * k,
                x + w - r, y + h, x + w * 0.42, y + h + 0.6, x + 9, y + h,
                x + 2, y + h + 6, x + 3, y + h - 3,
                x + r * k * 0.4, y + h - r, x, y + h / 2, x + r * k, y + r * k, x + r + 1.5, y - 0.4,
            ],
        },
    ]
    if (voice) {
        out.push({ p: [x + 8, y + h / 2 - 5, x + 15, y + h / 2, x + 8, y + h / 2 + 5], z: true })
        out.push({ c: [x + 19, y + h / 2, x + 22, y + h / 2 - 5, x + 25, y + h / 2 + 4, x + 28, y + h / 2 - 6, x + 31, y + h / 2 + 5, x + 34, y + h / 2 - 3, x + 37, y + h / 2 + 2, x + w - 7, y + h / 2] })
    } else {
        out.push({ c: [x + 8, y + h * 0.38, x + 14, y + h * 0.3, x + 20, y + h * 0.42, x + 27, y + h * 0.3, x + w - 9, y + h * 0.38] })
        out.push({ c: [x + 8, y + h * 0.66, x + 13, y + h * 0.6, x + 18, y + h * 0.7, x + w * 0.55, y + h * 0.62] })
    }
    return out
}
const question: Stroke[] = [{ c: [-5, -4, -4, -8, 0, -9.5, 4.5, -7.5, 4.5, -3, 0, 0, 0, 3.5] }, { e: [0, 8, 0.9, 0.9] }]

// The tickets the messages become, on the rail; the first one carries #1001.
const TICKET_X = [314, 348, 382, 416, 450]
const TICKET: Stroke[] = [...cutRect(0, 0, 28, 36, 7), { l: [5, 22, 21, 22] }, { l: [5, 28, 17, 28] }]
function digits(text: string, x0: number, y0: number): Stroke[] {
    const out: Stroke[] = []
    let x = x0
    for (const ch of text) {
        if (ch === "#") {
            out.push({ l: [x + 1.3, y0, x + 0.7, y0 + 6] }, { l: [x + 3.1, y0, x + 2.5, y0 + 6] })
            out.push({ l: [x, y0 + 2, x + 3.8, y0 + 2] }, { l: [x - 0.2, y0 + 4, x + 3.6, y0 + 4] })
        } else if (ch === "1") out.push({ p: [x + 0.9, y0 + 1.3, x + 2.2, y0, x + 2.2, y0 + 6] })
        else out.push({ e: [x + 1.9, y0 + 3, 1.6, 3] })
        x += 4.9
    }
    return out
}

// ---------- the thread ----------
// Its route, in runs: straight runs turn at 45°; one freehand run lassoes the tangle.
function threadRoute(x0: number) {
    const runs: { k: "l" | "c"; pts: Pt[]; marks?: string[] }[] = []
    const entry: Pt[] = [[x0, 551]]
    const marks: string[] = ["start"]
    if (x0 < 150) {
        entry.push([150, 551])
        marks.push("van")
    }
    if (x0 < 250) {
        entry.push([250, 551])
        marks.push("")
    }
    runs.push({ k: "l", pts: entry, marks })
    // One freehand run, like a continuous-line drawing: to the phone, round the tangle, along
    // the rail, down the notebook, to the printer, across to the salon's week, up to the weeks.
    const C1: [number, number, string?][] = [
        [entry[entry.length - 1][0], 551],
        [Math.max(x0 + 40, 296), 536], [328, 500], [341, 462], [340, 442, "phone"],
        [344, 400], [354, 330], [374, 250], [418, 178], [486, 138], [566, 128], [632, 150], [662, 200],
        [646, 256], [590, 286, "loop"], [512, 294], [440, 290], [380, 304], [336, 334], [310, 366], [310, 390],
        [326, 400, "rail0"], [370, 400.5], [420, 399.5], [470, 400], [486, 403, "rail1"],
        [474, 420], [440, 434], [410, 445, "nb0"], [404, 458], [406, 474, "nb1"], [420, 486], [460, 489], [500, 484], [518, 465, "printer"],
        [529, 480], [540, 510], [556, 538], [590, 550], [660, 551], [760, 551], [830, 546], [856, 520], [858, 486], [846, 460, "cal0"],
        [822, 453], [790, 452], [760, 452], [736, 450, "cal1"], [718, 436], [711, 404], [707, 360], [703, 312], [699, 266],
        [700, 236], [708, 219], [720, 216, "base0"], [766, 216], [812, 216, "base1"], [842, 218], [866, 238], [882, 280], [888, 340],
        [889, 420], [886, 500], [874, 540], [850, 557], [810, 561],
    ]
    runs.push({ k: "c", pts: C1.map((p) => [p[0], p[1]] as Pt), marks: C1.map((p) => p[2] || "") })
    runs.push({ k: "l", pts: [[810, 561], [x0, 561]], marks: ["", "end"] })
    // Sample it densely, so the drawing, the tip and the events share one measure.
    const pts: Pt[] = []
    const cum: number[] = []
    const at: Record<string, number> = {}
    const push = (p: Pt) => {
        const prev = pts[pts.length - 1]
        const d = prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1]) : 0
        if (prev && d < 0.01) return
        cum.push((cum[cum.length - 1] || 0) + d)
        pts.push(p)
    }
    const mark = (name: string | undefined) => {
        if (name) at[name] = cum[cum.length - 1] || 0
    }
    for (const run of runs) {
        if (run.k === "l") {
            for (let i = 0; i < run.pts.length; i++) {
                const p = run.pts[i]
                if (i > 0) {
                    const q = run.pts[i - 1]
                    const n = Math.max(1, Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 3))
                    for (let j = 1; j <= n; j++) push([q[0] + ((p[0] - q[0]) * j) / n, q[1] + ((p[1] - q[1]) * j) / n])
                } else push(p)
                mark(run.marks?.[i])
            }
        } else {
            const P = run.pts
            for (let i = 0; i < P.length - 1; i++) {
                const p0 = P[i - 1] || P[i]
                const p1 = P[i]
                const p2 = P[i + 1]
                const p3 = P[i + 2] || p2
                const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
                const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
                if (i === 0) mark(run.marks?.[0])
                const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3))
                for (let j = 1; j <= n; j++) {
                    const t = j / n
                    const u = 1 - t
                    push([
                        u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
                        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1],
                    ])
                }
                mark(run.marks?.[i + 1])
            }
        }
    }
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
    for (let i = 1; i < pts.length; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`
    return { d, pts, cum, at, len: cum[cum.length - 1] }
}

// ---------- the day ----------
const T_START = 4.8
// The thread's moves: from one mark to the next, eased in and out, then it rests there.
const MOVES: [string, string, number, number][] = [
    ["start", "phone", T_START, 1.9],
    ["phone", "rail0", 6.85, 2.1],
    ["rail0", "rail1", 8.95, 1.5],
    ["rail1", "nb0", 10.45, 0.6],
    ["nb0", "nb1", 11.05, 0.9],
    ["nb1", "printer", 12.0, 0.6],
    ["printer", "cal0", 13.1, 1.3],
    ["cal0", "cal1", 14.45, 1.8],
    ["cal1", "base1", 16.3, 1.5],
    ["base1", "end", 20.4, 2.2],
]
const T_FADE = 22.9
const inOut = (u: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, u))) / 2

// The still frame without CSS animation (Framer's canvas does not run it): each animated
// value at time t, read from the same stops as the keyframes, with the same easing.
function bezier(x1: number, y1: number, x2: number, y2: number, u: number) {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2
        const x = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m
        if (x < u) lo = m
        else hi = m
    }
    const m = (lo + hi) / 2
    return 3 * (1 - m) * (1 - m) * m * y1 + 3 * (1 - m) * m * m * y2 + m * m * m
}
function ease(e: string | undefined, u: number) {
    if (!e) return u
    const named: Record<string, number[]> = { "ease-in-out": [0.42, 0, 0.58, 1], "ease-out": [0, 0, 0.58, 1], "ease-in": [0.42, 0, 1, 1] }
    const c = named[e] || (e.match(/-?[\d.]+/g) || []).map(Number)
    return c.length === 4 ? bezier(c[0], c[1], c[2], c[3], u) : u
}
const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g
function mix(a: string, b: string, u: number) {
    if (a === b) return a
    const na = a.match(NUM) || []
    const nb = b.match(NUM) || []
    if (na.length !== nb.length || a.replace(NUM, "#") !== b.replace(NUM, "#")) return u < 1 ? a : b
    let i = 0
    return a.replace(NUM, () => {
        const v = Number(na[i]) + (Number(nb[i]) - Number(na[i])) * u
        i++
        return String(Math.round(v * 1000) / 1000)
    })
}
function stateAt(stops: [number, string, string?][] | undefined, t: number): React.CSSProperties {
    if (!stops || !stops.length) return {}
    let i = 0
    while (i < stops.length - 1 && stops[i + 1][0] <= t) i++
    const a = stops[i]
    const b = stops[Math.min(i + 1, stops.length - 1)]
    const u = b[0] > a[0] ? ease(a[2], Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])))) : 1
    const pa: Record<string, string> = {}
    const pb: Record<string, string> = {}
    a[1].split(";").forEach((kv) => { const j = kv.indexOf(":"); if (j > 0) pa[kv.slice(0, j)] = kv.slice(j + 1) })
    b[1].split(";").forEach((kv) => { const j = kv.indexOf(":"); if (j > 0) pb[kv.slice(0, j)] = kv.slice(j + 1) })
    const out: any = {}
    for (const k of Object.keys(pa)) {
        const v = mix(pa[k], pb[k] ?? pa[k], u)
        out[k === "stroke-dashoffset" ? "strokeDashoffset" : k] = k === "opacity" ? Number(v) : v
    }
    return out
}

function buildDay(x0: number, uid: string, phone: boolean) {
    const th = threadRoute(x0)
    const moves = MOVES.map(([a, b, t, dur]) => ({ d0: th.at[a], d1: th.at[b], t, dur }))
    const dist = (t: number) => {
        let d = 0
        for (const m of moves) {
            if (t >= m.t + m.dur) d = m.d1
            else if (t >= m.t) return m.d0 + (m.d1 - m.d0) * inOut((t - m.t) / m.dur)
            else break
        }
        return d
    }
    const timeAt = (dd: number) => {
        for (const m of moves) {
            if (dd > m.d1 + 0.01) continue
            let lo = 0
            let hi = 1
            for (let i = 0; i < 30; i++) {
                const mid = (lo + hi) / 2
                if (m.d0 + (m.d1 - m.d0) * inOut(mid) < dd) lo = mid
                else hi = mid
            }
            return m.t + lo * m.dur
        }
        return T_FADE
    }
    // When does the tip pass a point between two marks?
    const pass = (a: string, b: string, test: (p: Pt) => boolean) => {
        for (let i = 0; i < th.pts.length; i++) {
            if (th.cum[i] < th.at[a] || th.cum[i] > th.at[b]) continue
            if (test(th.pts[i])) return timeAt(th.cum[i])
        }
        return timeAt(th.at[b])
    }
    const pointAt = (dd: number): Pt => {
        let lo = 0
        let hi = th.cum.length - 1
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1
            if (th.cum[mid] < dd) lo = mid
            else hi = mid
        }
        const span = th.cum[hi] - th.cum[lo] || 1
        const u = (dd - th.cum[lo]) / span
        return [th.pts[lo][0] + (th.pts[hi][0] - th.pts[lo][0]) * u, th.pts[lo][1] + (th.pts[hi][1] - th.pts[lo][1]) * u]
    }

    const ev = {
        van: phone ? -1 : pass("start", "phone", (p) => p[0] >= 128),
        tickets: TICKET_X.map((x) => pass("rail0", "rail1", (p) => p[0] >= x + 14)),
        ticks: [451, 459, 467].map((y) => pass("nb0", "nb1", (p) => p[1] >= y + 2)),
        receipt: timeAt(th.at.printer) + 0.05,
        slots: [[1, 4], [0, 3], [2, 3], [1, 2], [0, 1], [2, 1], [1, 0]].map(([r, c]) => ({ r, c, t: pass("cal0", "cal1", (p) => p[0] <= 742 + c * 21.2 + 10.6) })),
        bars: [739, 781].map((x) => pass("base0", "base1", (p) => p[0] >= x)),
    }
    // One thing at a time: no two fixes closer than a quarter of a second.
    const spread = (ts: number[]) => ts.forEach((t, i) => (ts[i] = i ? Math.max(t, ts[i - 1] + 0.24) : t))
    const st = ev.slots.map((x) => x.t)
    spread(st)
    ev.slots.forEach((x, i) => (x.t = st[i]))
    spread(ev.ticks)
    // Volt passes from fix to fix: one at a time.
    const fixes: { key: string; t: number }[] = []
    if (ev.van >= 0) fixes.push({ key: "van", t: ev.van })
    ev.tickets.forEach((t, i) => fixes.push({ key: `tk${i}`, t }))
    ev.ticks.forEach((t, i) => fixes.push({ key: `nb${i}`, t }))
    fixes.push({ key: "rc", t: ev.receipt + 0.5 })
    ev.slots.forEach((s, i) => fixes.push({ key: `sl${i}`, t: s.t }))
    fixes.push({ key: "bar", t: ev.bars[1] + 0.3 })
    const voltWindow: Record<string, [number, number]> = {}
    fixes.forEach((fx, i) => (voltWindow[fx.key] = [fx.t, i < fixes.length - 1 ? fixes[i + 1].t : T_FADE]))

    // ---- keyframes ----
    const css: string[] = []
    const stopsOf: Record<string, [number, string, string?][]> = {}
    const pct = (t: number) => `${f(Math.min(100, Math.max(0, (t / L) * 100)) * 10) / 10}%`
    const K = (name: string, stops: [number, string, string?][]) => {
        const sorted = stops.slice().sort((a, b) => a[0] - b[0])
        stopsOf[`${uid}${name}`] = sorted
        css.push(`@keyframes ${uid}${name}{${sorted.map(([t, p, e]) => `${pct(t)}{${p}${e ? `;animation-timing-function:${e}` : ""}}`).join("")}}`)
        css.push(`.${uid}${name}{animation:${uid}${name} ${L}s linear infinite;animation-delay:calc(var(--dk-t,0)*-1s)}`)
        return `${uid}${name}`
    }
    const O = (v: number) => `opacity:${v}`
    // appear at t over dur, stay, fade at T_FADE (or `out`)
    const show = (name: string, t: number, dur = 0.3, out = T_FADE, outDur = 0.5) =>
        K(name, [[0, O(0)], [t, O(0), EASE], [t + dur, O(1)], [out, O(1)], [out + outDur, O(0)], [L, O(0)]])
    const drawIn = (name: string, t: number, dur = 0.3, out = T_FADE) =>
        K(name, [[0, "stroke-dashoffset:1;opacity:1"], [t, "stroke-dashoffset:1;opacity:1", EASE], [t + dur, "stroke-dashoffset:0;opacity:1"], [out, "stroke-dashoffset:0;opacity:1"], [out + 0.5, "stroke-dashoffset:0;opacity:0"], [L - 0.01, "stroke-dashoffset:1;opacity:0"], [L, "stroke-dashoffset:1;opacity:0"]])
    const voltK = (key: string) => {
        const w = voltWindow[key]
        if (!w) return ""
        const end = w[1] === T_FADE ? T_FADE : w[1] - 0.12
        return K(`v${key}`, [[0, O(0)], [w[0], O(0), EASE], [w[0] + 0.15, O(1)], [end, O(1)], [end + 0.1, O(0)], [L, O(0)]])
    }

    // shutters: down at midnight, up in the morning, down again in the evening
    const shut = (name: string, up: number, down: number, h: number) =>
        K(name, [[0, "transform:translateY(0px)"], [up, "transform:translateY(0px)", EASE], [up + 1.1, `transform:translateY(${-h}px)`], [down, `transform:translateY(${-h}px)`, "cubic-bezier(.5,0,.75,0)"], [down + 0.8, "transform:translateY(0px)"], [L, "transform:translateY(0px)"]])
    const shutA = shut("sa", 0.15, 23.0, 150)
    const shutB = shut("sb", 0.45, 23.08, 182)

    // the thread draws and its tip leads
    const tipStops: [number, string][] = []
    const dashStops: [number, string][] = []
    const step = 0.05
    for (const m of moves) {
        for (let t = m.t; t <= m.t + m.dur + 1e-6; t += step) {
            const dd = dist(t)
            const p = pointAt(dd)
            tipStops.push([t, `transform:translate(${f(p[0])}px,${f(p[1])}px)`])
            dashStops.push([t, `stroke-dashoffset:${f(th.len - dd)}`])
        }
        const pe = pointAt(m.d1)
        tipStops.push([m.t + m.dur, `transform:translate(${f(pe[0])}px,${f(pe[1])}px)`])
        dashStops.push([m.t + m.dur, `stroke-dashoffset:${f(th.len - m.d1)}`])
    }
    const p0 = pointAt(0)
    const pEnd = pointAt(th.len)
    const threadName = K("th", [
        [0, `stroke-dashoffset:${f(th.len)};opacity:1`],
        ...dashStops.map(([t, s]) => [t, `${s};opacity:1`] as [number, string]),
        [T_FADE, "stroke-dashoffset:0;opacity:1"],
        [T_FADE + 0.6, "stroke-dashoffset:0;opacity:0"],
        [L - 0.01, `stroke-dashoffset:${f(th.len)};opacity:0`],
        [L, `stroke-dashoffset:${f(th.len)};opacity:0`],
    ])
    const TR = 150
    const trailName = K("tr", [
        [0, `stroke-dashoffset:${TR};opacity:1`],
        ...dashStops.map(([t, s2]) => [t, `stroke-dashoffset:${f(TR - (th.len - Number(s2.split(":")[1])))};opacity:1`] as [number, string]),
        [T_FADE, `stroke-dashoffset:${f(TR - th.len)};opacity:1`],
        [T_FADE + 0.4, `stroke-dashoffset:${f(TR - th.len)};opacity:0`],
        [L - 0.01, `stroke-dashoffset:${TR};opacity:0`],
        [L, `stroke-dashoffset:${TR};opacity:0`],
    ])
    const tipMove = K("tp", [[0, `transform:translate(${f(p0[0])}px,${f(p0[1])}px)`], ...tipStops, [L, `transform:translate(${f(pEnd[0])}px,${f(pEnd[1])}px)`]])
    const tipShow = K("to", [[0, O(0)], [T_START, O(0)], [T_START + 0.2, O(1)], [T_FADE, O(1)], [T_FADE + 0.4, O(0)], [L, O(0)]])

    // the loose messages: out of the phone, tangled, then caught and made into tickets
    const ticketOf = [0, -1, 2, 1, 4, -1, 3] // which ticket each loose item becomes (-1: answered)
    const looseK = LOOSE.map((it, i) => {
        if (phone && i === 5) return null
        const born = 1.6 + i * 0.36
        const src: Pt = [326, 446]
        const sway = (k: number) => `transform:translate(${f(it.x + (k % 2 ? 1.2 : -1.2))}px,${f(it.y + (k % 2 ? -1.4 : 1))}px) rotate(${it.rot + (k % 2 ? 2.5 : -2.5)}deg)`
        const home = `transform:translate(${it.x}px,${it.y}px) rotate(${it.rot}deg)`
        const stops: [number, string, string?][] = [
            [0, `transform:translate(${src[0]}px,${src[1]}px) rotate(0deg) scale(.2)`],
            [born, `transform:translate(${src[0]}px,${src[1]}px) rotate(0deg) scale(.2)`, EASE],
            [born + 0.9, home],
        ]
        const tk = ticketOf[i]
        const leave = tk >= 0 ? ev.tickets[tk] - 0.75 : ev.tickets[0] - 0.6
        let k = 0
        for (let t = born + 1.6; t < leave - 0.5; t += 1.05) stops.push([t, sway(k++), "ease-in-out"])
        stops.push([leave - 0.05, home, EASE])
        if (tk >= 0) {
            const tx = TICKET_X[tk]
            stops.push([leave + 0.75, `transform:translate(${tx + 14}px,422px) rotate(0deg)`])
            stops.push([L, `transform:translate(${tx + 14}px,422px) rotate(0deg)`])
        } else stops.push([L, home])
        const move = K(`lm${i}`, stops)
        const bubbleOp = tk >= 0
            ? K(`lb${i}`, [[0, O(0)], [born, O(0)], [born + 0.25, O(1)], [leave + 0.35, O(1)], [leave + 0.7, O(0)], [L, O(0)]])
            : K(`lb${i}`, [[0, O(0)], [born, O(0)], [born + 0.25, O(1)], [leave, O(1)], [leave + 0.4, O(0)], [L, O(0)]])
        const ticketOp = tk >= 0 ? K(`lt${i}`, [[0, O(0)], [leave + 0.45, O(0)], [leave + 0.75, O(1)], [23.9, O(1)], [23.95, O(0)], [L, O(0)]]) : ""
        return { move, bubbleOp, ticketOp, tk }
    })
    const tangle = K("tg", [[0, "stroke-dashoffset:1;opacity:1"], [2.0, "stroke-dashoffset:1;opacity:1", "ease-in-out"], [4.6, "stroke-dashoffset:0;opacity:1"], [ev.tickets[0] - 0.9, "stroke-dashoffset:0;opacity:1"], [ev.tickets[0] - 0.3, "stroke-dashoffset:0;opacity:0"], [L - 0.01, "stroke-dashoffset:1;opacity:0"], [L, "stroke-dashoffset:1;opacity:0"]])
    const screenBusy = K("sc", [[0, O(0)], [1.5, O(0)], [1.7, O(1)], [ev.tickets[4], O(1)], [ev.tickets[4] + 0.3, O(0)], [L, O(0)]])
    const screenCalm = show("sk", ev.bars[1] + 0.6, 0.4, 23.9, 0.05)

    const vanTick = ev.van >= 0 ? drawIn("vk", ev.van, 0.3) : ""
    const ticks = ev.ticks.map((t, i) => drawIn(`nk${i}`, t, 0.25, 23.9))
    const receiptK = K("rc", [[0, `transform:translateY(40px)`], [ev.receipt, "transform:translateY(40px)", EASE], [ev.receipt + 0.7, "transform:translateY(0px)"], [23.9, "transform:translateY(0px)"], [23.95, "transform:translateY(40px)"], [L, "transform:translateY(40px)"]])
    const slots = ev.slots.map((s, i) => drawIn(`sl${i}`, s.t, 0.3, 23.9))
    const bars = ev.bars.map((t, i) => K(`br${i}`, [[0, "transform:scaleY(0);opacity:1"], [t, "transform:scaleY(0);opacity:1", EASE], [t + 0.72, "transform:scaleY(1);opacity:1"], [T_FADE, "transform:scaleY(1);opacity:1"], [T_FADE + 0.5, "transform:scaleY(1);opacity:0"], [L - 0.01, "transform:scaleY(0);opacity:0"], [L, "transform:scaleY(0);opacity:0"]]))
    const cardK = show("cd", ev.bars[0] - 0.75, 0.48)
    const steam = [0, 1, 2].map((i) => {
        const s = ev.bars[1] + 0.9 + i * 1.15
        return K(`st${i}`, [[0, "stroke-dashoffset:1;opacity:0;transform:translateY(0px)"], [s, "stroke-dashoffset:1;opacity:1;transform:translateY(0px)", "ease-out"], [s + 0.8, "stroke-dashoffset:0;opacity:1;transform:translateY(-3px)", "ease-in"], [s + 1.6, "stroke-dashoffset:0;opacity:0;transform:translateY(-8px)"], [L, "stroke-dashoffset:1;opacity:0;transform:translateY(0px)"]])
    })
    const volts: Record<string, string> = {}
    Object.keys(voltWindow).forEach((k) => (volts[k] = voltK(k)))

    return { css: css.join(""), th, ev, stopsOf, names: { shutA, shutB, threadName, trailName, TR, cardK, tipMove, tipShow, looseK, tangle, screenBusy, screenCalm, vanTick, ticks, receiptK, slots, bars, steam, volts } }
}

// ---------- the component ----------
interface Props {
    lang: "en" | "ar"
    mode: "auto" | "wide" | "phone"
    at: number
    scale: number
    inset: number
    pauseWord: string
    playWord: string
    pauseName: string
    playName: string
    style?: React.CSSProperties
}
const WORDS = {
    en: { pause: "Pause", play: "Play", pauseName: "Pause the drawing", playName: "Play the drawing" },
    ar: { pause: "إيقاف", play: "تشغيل", pauseName: "إيقاف حركة الرسم", playName: "تشغيل حركة الرسم" },
}

let counter = 0

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function AlyrDoodle(props: Props) {
    const { lang = "en", mode = "auto", at = -1, scale = 1, inset = 48, style } = props
    const rtl = lang === "ar"
    const w0 = WORDS[rtl ? "ar" : "en"]
    const pauseWord = props.pauseWord || w0.pause
    const playWord = props.playWord || w0.play
    const pauseName = props.pauseName || w0.pauseName
    const playName = props.playName || w0.playName

    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const ref = useRef<HTMLDivElement>(null)
    const [uid] = useState(() => `dk${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`)
    const [box, setBox] = useState({ w: 0, h: 0 })
    const [reduce, setReduce] = useState(false)
    const [userPaused, setUserPaused] = useState(false)
    const [away, setAway] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
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

    // Layout comes from CSS, so the drawing sits right before anything is measured (and on
    // Framer's canvas, which may never measure). Measuring only tells the thread where the
    // box's inline-start edge is, so it can enter from there.
    const measured = box.w > 0
    const phone = mode === "phone" || (mode === "auto" && measured && box.w < 640)
    const EXT = 1800 // the street runs on past the inline-start edge; the box clips it
    const margin = Math.round(inset * 0.25)
    const s = phone ? (measured ? box.w : 390) / (SW - PHONE_CROP + 6) : scale
    const x0 = Math.round(phone ? PHONE_CROP : measured ? Math.max(-EXT, -(box.w - SW * s - margin) / s) : -EXT)
    const day = useMemo(() => buildDay(x0, uid, phone), [x0, uid, phone])
    const N = day.names
    const staticFrame = isCanvas || reduce
    const frozen = at >= 0 && !staticFrame
    const paused = staticFrame || frozen || userPaused || away
    const pen = PEN / s
    const fine = (PEN * 0.65) / s
    const takes = staticFrame ? [0] : [0, 1, 2]

    // An animated part: its class (moving) or its state at the still time (static).
    const A = (name: string | undefined, extra?: string, more?: React.CSSProperties) => {
        if (!name) return { className: extra, style: more }
        if (staticFrame) return { className: extra, style: { ...stateAt(day.stopsOf[name], STILL), ...more } }
        return { className: extra ? `${extra} ${name}` : name, style: more }
    }
    const Boil = ({ d }: { d: string[] }) => (
        <>
            {takes.map((k) => (
                <path key={k} d={d[k]} className={staticFrame ? undefined : `${uid}b ${uid}b${k}`} />
            ))}
        </>
    )
    const world = useMemo(() => {
        const all = [...joints(x0), ...(phone ? [] : VAN), ...BAKERY, ...SALON]
        const ground: Stroke = { l: [x0 - 4, GROUND, SW + 10, GROUND] }
        return [0, 1, 2].map((k) => draw([ground, ...all], 1, k))
    }, [x0, phone])
    const memo = useMemo(() => {
        const q = [0, 1, 2]
        return {
            shutterA: q.map((k) => draw([...Array.from({ length: 18 }, (_, i) => ({ l: [302, 400 + i * 8.2, 538, 400 + i * 8.2] }) as Stroke)], 3, k)),
            shutterB: q.map((k) => draw([...Array.from({ length: 22 }, (_, i) => ({ l: [602, 368 + i * 8.0, 858, 368 + i * 8.0] }) as Stroke)], 4, k)),
            loose: LOOSE.map((it, i) => q.map((k) => draw(it.kind === "q" ? question : bubble(it.w, it.h, it.kind === "v"), 40 + i, k))),
            ticket: q.map((k) => draw(TICKET, 60, k)),
            num: q.map((k) => draw(digits("#1001", 2.2, 5), 61, k)),
            tangle: draw([{ c: [400, 270, 440, 230, 410, 180, 470, 170, 530, 240, 480, 268, 560, 200, 610, 170, 600, 230, 520, 180, 470, 130, 540, 120, 640, 150, 610, 260, 540, 262] }], 62, 0),
            busy: q.map((k) => draw([{ c: [320.5, 452, 323, 451, 326, 453, 330, 451] }, { c: [320.5, 457, 324, 456, 327, 458, 331, 456] }, { c: [320.5, 462, 323, 461, 326, 463] }, { e: [333, 449, 2.2, 2.2] }], 63, k)),
            calm: q.map((k) => draw([{ p: [321, 459, 323.5, 462, 328.5, 455] }, { l: [321, 466, 331, 466] }], 64, k)),
            receipt: q.map((k) => draw([{ p: [513, 462, 513, 426, 516, 423, 519, 426, 522, 423, 525, 426, 528, 423, 531, 426, 531, 462] }, { l: [516, 432, 528, 432] }, { l: [516, 438, 526, 438] }, { l: [516, 444, 528, 444] }, { l: [522, 452, 528, 452] }], 65, k)),
            card: q.map((k) => draw([...cutRect(690, 118, 142, 116, 12), { l: [704, 132, 734, 132] }, { l: [704, 138, 724, 138] }], 68, k)),
            bars: [q.map((k) => draw(rect(728, 166, 22, 50), 66, k)), q.map((k) => draw([...rect(770, 146, 22, 70), { l: [773, 152, 789, 152] }], 67, k))],
        }
    }, [])
    const tick = (x: number, y: number, seed: number) => stroke({ p: [x, y, x + 3.2, y + 3.4, x + 10, y - 5] }, seed, 0)
    const slotHatch = (r: number, c: number) => {
        const x = 742 + c * 21.2
        const y = 394 + r * 17.33
        return [0, 1, 2].map((i) => `M${f(x + 3 + i * 5.5)} ${f(y + 14)}L${f(x + 3 + i * 5.5 + 9)} ${f(y + 3)}`).join("")
    }
    const flipText = (cx: number) => (rtl ? `translate(${cx} 0) scale(-1 1) translate(${-cx} 0)` : undefined)
    const V = (key: string) => A(N.volts[key])
    const dash = { strokeDasharray: "1 1" } as React.CSSProperties
    const bar = { transformBox: "fill-box", transformOrigin: "50% 100%" } as React.CSSProperties

    const sheet = `
@keyframes ${uid}boil{0%{opacity:1}33.333%{opacity:0}100%{opacity:0}}
.${uid}b{animation:${uid}boil .375s step-end infinite}
.${uid}b1{animation-delay:-.125s}.${uid}b2{animation-delay:-.25s}
.${uid}.p *{animation-play-state:paused!important}
.${uid}.p .${uid}b0{animation:none;opacity:1}.${uid}.p .${uid}b1,.${uid}.p .${uid}b2{animation:none;opacity:0}
.${uid} button:hover{color:${C.text}!important}
.${uid} button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}
`
    // The stage's box: wide, anchored at the bottom inline-end at its scale; on a phone, the
    // bakery and the salon fill the width.
    const svgStyle: React.CSSProperties = phone
        ? { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "100%", overflow: "visible", transform: rtl ? "scaleX(-1)" : undefined }
        : { position: "absolute", bottom: 0, [rtl ? "left" : "right"]: margin, width: (SW + EXT) * s, height: SH * s, overflow: "visible", transform: rtl ? "scaleX(-1)" : undefined }
    const viewBox = phone ? `${PHONE_CROP} 0 ${SW - PHONE_CROP + 6} ${SH}` : `${-EXT} 0 ${SW + EXT} ${SH}`
    const tipR = 4.2 / s
    const glyph = (on: boolean): React.CSSProperties =>
        on
            ? { width: 0, height: 0, borderTop: "5.4px solid transparent", borderBottom: "5.4px solid transparent", borderInlineStart: "9.3px solid currentColor" }
            : { width: 10, height: 10, borderInlineStart: "3px solid currentColor", borderInlineEnd: "3px solid currentColor", boxSizing: "border-box" }

    return (
        <div
            ref={ref}
            data-dk=""
            className={`${uid}${paused ? " p" : ""}`}
            dir={rtl ? "rtl" : "ltr"}
            lang={rtl ? "ar" : "en"}
            style={{ width: "100%", height: "100%", ...style, position: "relative", overflow: "hidden", ["--dk-t" as any]: frozen ? at : undefined } as React.CSSProperties}
        >
            {staticFrame ? null : <style>{sheet + day.css}</style>}
            <svg aria-hidden="true" focusable="false" viewBox={viewBox} preserveAspectRatio={phone ? "xMidYMax meet" : "xMaxYMax meet"} style={svgStyle}>
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                    {/* the street, faint */}
                    <g stroke={C.ink} strokeWidth={pen}>
                        <Boil d={world} />
                    </g>
                    {/* inside the bakery, behind its shutter */}
                    <g stroke={C.ink} strokeWidth={pen}>
                        <g {...A(N.screenBusy)}><Boil d={memo.busy} /></g>
                        <g {...A(N.screenCalm)} stroke={C.fixed}><Boil d={memo.calm} /></g>
                    </g>
                    <clipPath id={`${uid}slot`}><rect x={505} y={400} width={34} height={63} /></clipPath>
                    <g clipPath={`url(#${uid}slot)`}>
                        <g {...A(N.receiptK)}>
                            <g stroke={C.fixed} strokeWidth={pen}><Boil d={memo.receipt} /></g>
                            <path d="M516 432L528 432" {...V("rc")} stroke={C.volt} strokeWidth={5 / s} strokeLinecap="butt" />
                        </g>
                    </g>
                    {[0, 1, 2].map((i) => {
                        const y = 451 + i * 8
                        return (
                            <g key={i}>
                                <path d={tick(384, y, 70 + i)} {...V(`nb${i}`)} stroke={C.volt} strokeWidth={5 / s} />
                                <path d={tick(384, y, 70 + i)} pathLength={1} {...A(N.ticks[i], undefined, dash)} stroke={C.fixed} strokeWidth={pen} />
                            </g>
                        )
                    })}
                    {/* the salon's week */}
                    {N.slots.map((name, i) => {
                        const sl = day.ev.slots[i]
                        const x = 742 + sl.c * 21.2
                        const y = 394 + sl.r * 17.33
                        return (
                            <g key={i}>
                                <path d={`M${f(x + 3)} ${f(y + 14)}L${f(x + 18.2)} ${f(y + 3.3)}`} {...V(`sl${i}`)} stroke={C.volt} strokeWidth={6 / s} strokeLinecap="butt" />
                                <path d={slotHatch(sl.r, sl.c)} pathLength={1} {...A(name, undefined, dash)} stroke={C.fixed} strokeWidth={fine} />
                            </g>
                        )
                    })}
                    {/* the tickets, where the messages land */}
                    {N.looseK.map((lk, i) => {
                        if (!lk || lk.tk < 0) return null
                        return (
                            <g key={`t${i}`} {...A(lk.move)}>
                                <g {...A(lk.ticketOp)}>
                                    <g transform="translate(-14 -18)">
                                        <path d="M0 0H21L28 7V36H0Z" fill={C.canvas} stroke="none" />
                                        <path d="M1 0.5H20.5" {...V(`tk${lk.tk}`)} stroke={C.volt} strokeWidth={4 / s} strokeLinecap="butt" />
                                        <g stroke={C.fixed} strokeWidth={pen}><Boil d={memo.ticket} /></g>
                                        {lk.tk === 0 ? (
                                            <g transform={flipText(14)} stroke={C.fixed} strokeWidth={fine}>
                                                <Boil d={memo.num} />
                                            </g>
                                        ) : null}
                                    </g>
                                </g>
                            </g>
                        )
                    })}
                    {/* the shutters */}
                    <clipPath id={`${uid}ca`}><rect x={300} y={393} width={240} height={147} /></clipPath>
                    <clipPath id={`${uid}cb`}><rect x={600} y={361} width={260} height={179} /></clipPath>
                    <g clipPath={`url(#${uid}ca)`}>
                        <g {...A(N.shutA)}>
                            <rect x={300} y={393} width={240} height={147} fill={C.canvas} />
                            <g stroke={C.ink} strokeWidth={pen}><Boil d={memo.shutterA} /></g>
                        </g>
                    </g>
                    <g clipPath={`url(#${uid}cb)`}>
                        <g {...A(N.shutB)}>
                            <rect x={600} y={361} width={260} height={179} fill={C.canvas} />
                            <g stroke={C.ink} strokeWidth={pen}><Boil d={memo.shutterB} /></g>
                        </g>
                    </g>
                    {/* the van's job card */}
                    {!phone ? (
                        <g>
                            <path d={tick(133, 491, 80)} {...V("van")} stroke={C.volt} strokeWidth={5 / s} />
                            <path d={tick(133, 491, 80)} pathLength={1} {...A(N.vanTick, undefined, dash)} stroke={C.fixed} strokeWidth={pen} />
                        </g>
                    ) : null}
                    {/* the steam */}
                    {N.steam.map((name, i) => (
                        <path key={i} d={stroke({ c: [489 + (i - 1) * 2.5, 449, 487 + (i - 1) * 2.5, 443, 491 + (i - 1) * 2.5, 437, 488 + (i - 1) * 2.5, 430, 490 + (i - 1) * 2.5, 424] }, 90 + i, 0)} pathLength={1} {...A(name, undefined, dash)} stroke={C.ink} strokeWidth={pen} />
                    ))}
                    {/* the tangle, and the loose messages in it */}
                    <path d={memo.tangle} pathLength={1} {...A(N.tangle, undefined, dash)} stroke={C.ink} strokeWidth={fine} />
                    {N.looseK.map((lk, i) => {
                        if (!lk) return null
                        return (
                            <g key={`l${i}`} {...A(lk.move)}>
                                <g {...A(lk.bubbleOp)} stroke={C.ink} strokeWidth={pen}>
                                    <Boil d={memo.loose[i]} />
                                </g>
                            </g>
                        )
                    })}
                    {/* the two weeks, side by side */}
                    <g stroke={C.fixed} strokeWidth={pen}>
                        <g {...A(N.cardK)}><Boil d={memo.card} /></g>
                        <g {...A(N.bars[0], undefined, bar)}><Boil d={memo.bars[0]} /></g>
                        <g {...A(N.bars[1], undefined, bar)}>
                            <path d="M771 146.5H791" {...V("bar")} stroke={C.volt} strokeWidth={5 / s} strokeLinecap="butt" />
                            <Boil d={memo.bars[1]} />
                        </g>
                    </g>
                    {/* the thread, steady while the world boils: its record, its last stretch, its tip */}
                    <path d={day.th.d} pathLength={day.th.len} {...A(N.threadName)} stroke={C.ink} strokeWidth={pen} strokeDasharray={`${f(day.th.len)} ${f(day.th.len + 10)}`} />
                    <path d={day.th.d} pathLength={day.th.len} {...A(N.trailName)} stroke={C.trail} strokeWidth={pen} strokeDasharray={`${N.TR} ${f(day.th.len + N.TR + 10)}`} />
                    <g {...A(N.tipShow)}>
                        <g {...A(N.tipMove)}>
                            <circle r={tipR} fill={C.volt} stroke={C.text} strokeWidth={1.2 / s} />
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
                    color: C.muted,
                    font: "inherit",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    ...(phone ? { insetInlineStart: 4, top: 0 } : { insetInlineStart: inset - 12, bottom: 36 }),
                }}
            >
                <span aria-hidden="true" style={glyph(userPaused)} />
                <span>{userPaused ? playWord : pauseWord}</span>
            </button>
        </div>
    )
}

addPropertyControls(AlyrDoodle, {
    lang: { type: ControlType.Enum, title: "Language", options: ["en", "ar"], optionTitles: ["English", "Arabic"], defaultValue: "en" },
    mode: { type: ControlType.Enum, title: "Layout", options: ["auto", "wide", "phone"], optionTitles: ["Auto", "Wide", "Phone"], defaultValue: "auto" },
    at: { type: ControlType.Number, title: "Still at (s)", min: -1, max: 24, step: 0.1, defaultValue: -1, description: "-1 plays the loop" },
    scale: { type: ControlType.Number, title: "Scale", min: 0.4, max: 1.4, step: 0.02, defaultValue: 1, hidden: (p: Props) => p.mode === "phone" },
    inset: { type: ControlType.Number, title: "Gutter", min: 0, max: 96, step: 1, defaultValue: 48 },
    pauseWord: { type: ControlType.String, title: "Pause", defaultValue: "" },
    playWord: { type: ControlType.String, title: "Play", defaultValue: "" },
    pauseName: { type: ControlType.String, title: "Pause name", defaultValue: "" },
    playName: { type: ControlType.String, title: "Play name", defaultValue: "" },
})
