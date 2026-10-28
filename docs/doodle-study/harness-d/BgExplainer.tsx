// ALYR prototype 05D: the explainer film behind the homepage hero (docs/doodle-study/03-pro-brief.md).
// One afternoon at the fictional Qirfa Bakery, Thursday 15:58 to 16:20, told in the product's own
// screens. A Carbon plate on the far side of the headline, cut by the Command Fold's 45° diagonal,
// holds one large canvas of real ALYR UI in three lanes (Orders, Bookings, Money). A camera moves
// across it (translate and scale only): wide, push in on the event, a beat to read it, then on to
// the next, and it ends on the ALYR Agent home screen: "Week so far: 50 orders, QAR 8,520".
//
// Every number agrees with the homepage's sample at 16:20 (copy.ts, the bakery's Agent sample) and
// with the others in every frame. Volt only on the event happening now, at most two at once. The
// words are the product's own (Screens.tsx, orders/service.py, bookings/service.py, the Docs
// delivery words). Loops (founder, 26 Oct), stops off screen, in a hidden tab and with Pause
// (WCAG 2.2.2); a still frame with reduced motion and on Framer's canvas. English only for now.
// Colours are the project's "ALYR/<token>" colour styles (design/tokens.json).
import * as React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// ---------------------------------------------------------------- tokens
const C = {
    canvas: "var(--token-S2oE56wbE, #f6f7f3)",
    text: "var(--token-XYAPSNcOu, #15171a)",
    muted: "var(--token-tpGxkcLLH, #5f666d)",
    faint: "var(--token-MIJi7pupd, #8a918b)",
    inverse: "var(--token-eKRrgV2Tq, #ffffff)", // --surface has --text-inverse's values in both themes
    lineStrong: "var(--token-SVZjCcT_M, #8a918b)",
    band: "var(--token-rKwiN6fBc, #15171a)",
    bandEdge: "var(--token-AFHbDXjyT, rgba(0, 0, 0, 0))",
    darkLine: "var(--token-Sv0r_MaXc, #32373c)",
    onBand: "var(--token-LdboGjTQl, #ffffff)",
    onBandSoft: "var(--token-yTPFwNu7_, #d5d9dd)",
    onBandQuiet: "var(--token-Kb5eQHA9C, #c4c9cf)",
    onBandFaint: "var(--token-IxtSZPdVK, #8a9199)",
    bandRule: "var(--token-gGWODDr3_, #555d65)",
    monoInk: "var(--token-JgX8tHy6E, #f3f5f0)",
    volt: "var(--token-wnKZyblTz, #b7f34a)",
    onVolt: "var(--token-BJ9wYGxIM, #151a0f)",
    voltInk: "var(--token-pmMK8vHcd, #3f6a0b)",
    focus: "var(--token-kaftmF1nD, #6a9320)",
    window: "var(--token-pfuJrvERC, #ffffff)",
    windowLine: "var(--token-fq0_VRGoD, rgba(21, 23, 26, 0.1))",
    card: "var(--token-zJYEixF9F, #ffffff)",
    raise: "var(--token-JG4vm8QSC, #f7f8f5)",
    hair: "var(--token-yYboM1HFw, rgba(21, 23, 26, 0.08))",
    hair2: "var(--token-cE5AGFc5n, rgba(21, 23, 26, 0.14))",
    chat: "var(--token-azjsiX4Xy, #eceee9)",
    out: "var(--token-fYRYQShoz, #e3e9dc)",
    link: "var(--token-hYW4dagHN, #1f63a3)",
    wash: "var(--token-spDF6dgHJ, rgba(183, 243, 74, 0.22))",
    paper: "var(--token-mP05IvJFF, #ffffff)",
    docInk: "var(--token-DVapQ_o9n, #15171a)",
    docInk2: "var(--token-L9C3j2MgA, #5f666d)",
    docRule: "var(--token-bUOu3WJnR, #d8dcd7)",
}
const SANS = '"Instrument Sans", "Instrument Sans Placeholder", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", "IBM Plex Mono Placeholder", ui-monospace, monospace'
const ARABIC = '"IBM Plex Sans Arabic", "IBM Plex Sans Arabic Placeholder", system-ui, sans-serif'
const FONTS =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Instrument+Sans:wdth,wght@75..100,400..700&display=swap"

// Motion tokens (design/tokens.json, --pace 1.3). The camera's moves and holds are longer than
// any token: they are written as multiples of --dur-3 (0.48 s) and listed in 04-d-log.md.
const PACE = 1.3
const PLAY2 = 0.144 * PACE
const PLAY3 = 0.288 * PACE
const PLAY4 = 0.432 * PACE
const STAG = 0.036 * PACE // --play-stagger
const TRAVEL = 12 // --travel, px along 45°
const L = 36 // one loop, seconds
const STILL = 31.6 // reduced motion and Framer's canvas: the one screen, settled
const CLOSE = 34.7 // the fold closes over the film
const RESET = 35.35 // ...the canvas is put back to the start under it
const VOLT_HOLD = 1.9 // how long an event keeps its Volt before it settles into ink

// ---------------------------------------------------------------- the words
const W = {
    shop: "Qirfa Bakery",
    mono: "QB",
    sample: "Sample",
    day: "Thursday",
    about:
        "Sample film of a fictional bakery, Qirfa Bakery, on a Thursday afternoon: orders, bookings and money tracked at once, ending on the ALYR Agent home screen. The names and numbers are made up.",
    lanes: { orders: "Orders", bookings: "Bookings", money: "Money" },
    // what each lane is doing in the wide shot of all three at once
    tags: {
        orders: [["#1440 · Ready", "ready"]],
        bookings: [["6:30 pm · Booked", "maha"]],
        money: [["Receipt sent", "receipt"], ["Needs a look", "flag"]],
    } as Record<"orders" | "bookings" | "money", [string, keyof typeof E][]>,
    inbox: { title: "Inbox", aside: "All conversations" },
    chat: {
        who: "Sara M.",
        inbox: "Inbox",
        today: "Today",
        inMsg: "Hi, I’d like to order for pickup",
        outMsg: "Here is our order page. Pick what you need.",
        action: "Open the order page",
        event: "Ordered 7 items, QAR 98",
        confirm: "Order #1442 received: 7 items, QAR 98.",
    },
    orders: {
        title: "Orders",
        aside: "Placed through the order link",
        head: ["Order", "Items", "Payment", "Status"],
        st: { new: "New", confirmed: "Confirmed", ready: "Ready", done: "Done" },
        next: { new: "Confirm", confirmed: "Mark ready", ready: "Mark done" },
        pay: { unpaid: "Not paid", paid: "Paid", account: "On account" },
    },
    stock: {
        path: "Menu › Stock",
        leftToday: "Left today",
        of: "of 6",
        code: "109",
        name: "Pistachio kunafa cheesecake",
        price: "QAR 185",
        left: "Only 1 left today",
        soldOut: "Sold out",
        rule: "A number each day · 6",
        log: "Recent changes",
        sold: "Sold",
    },
    book: {
        title: "Bookings",
        day: "Thu 15 Oct",
        times: ["4:00 pm", "4:30 pm", "5:00 pm", "5:30 pm", "6:00 pm", "6:30 pm"],
        time: "6:00 pm",
        time2: "6:30 pm",
        service: "Cake tasting",
        who: "Noor A.",
        who2: "Maha J.",
        booked: "Booked",
        reminder: "Reminder sent",
        before: "Two hours before",
        sentAt: "4:00 pm",
    },
    noor: {
        who: "Noor A.",
        confirmed: "Booking 112 confirmed at Qirfa Bakery: Cake tasting, Thu 15 Oct, 6:00 PM. To cancel, send “my booking”.",
        reminder: "Reminder: booking 112 at Qirfa Bakery, Thu 15 Oct, 6:00 PM.",
    },
    owed: {
        title: "Credit accounts",
        aside: "5 customers",
        k: "Owed to you",
        total: "QAR 12,975",
        segments: [
            { label: "0–30 days", amount: "QAR 6,678", share: 0.515 },
            { label: "31–60", amount: "QAR 3,407", share: 0.263 },
            { label: "61–90", amount: "QAR 1,640", share: 0.126 },
            { label: "Over 90 days", amount: "QAR 1,250", share: 0.096 },
        ],
        flag: "Needs a look",
        flagTitle: "QAR 3,400 owed 30+ days, not reminded in 7 days",
        flagWhy: "Why · owed 30+ days, no promise, no reminder in 7 days · 3 customers",
    },
    omar: {
        who: "Omar A.",
        confirmed: "Order #1440 is confirmed.",
        ready: "Order #1440 is ready for collection.",
        file: "RC-0039.pdf",
        fileSub: "Receipt · PDF",
        caption: "Receipt RC-0039 from Qirfa Bakery: QAR 64.00. Thank you.",
    },
    paper: {
        kindAr: "إيصال",
        kind: "Receipt",
        shopAr: "مخبز قرفة",
        shop: "Qirfa Bakery",
        addrAr: "السد، الدوحة، قطر",
        rows: [
            ["الرقم", "No.", "RC-0039"],
            ["التاريخ", "Date", "15 Oct 2026"],
            ["العميل", "Customer", "Omar Ali"],
            ["الدفع", "Payment", "Cash"],
        ],
        lines: [
            ["كيك الحليب بالزعفران، قطعة", "Saffron milk cake, slice", "2", "52.00"],
            ["كرواسون بالزبدة", "Butter croissant", "1", "12.00"],
        ],
        totalAr: "الإجمالي",
        total: "Total",
        amount: "64.00 ر.ق",
    },
    dash: {
        path: "Home",
        when: "Thursday · 16:20",
        summary: ["Week so far: ", "50", " orders, ", "QAR 8,520", "."],
        muted: "Orders up 11%, sales up 20% on the same days last week.",
        needs: "Needs you now",
        done: "Done for you this week",
        waiting: ["customers waiting for an answer", "longest 48 min"],
        confirm: ["orders need confirming", "the oldest for 33 min"],
        sent: "messages ALYR sent for you",
        reminders: "booking reminders",
        kpis: ["Sales this week", "Orders this week", "Owed to you"],
        caption: "Against Sunday to 16:20 last week",
    },
    // the captions, a few words each, tied to the event on screen
    cap: {
        lanes: ["Three lanes", "·", "at once"],
        booked: ["Booked", "·", "6:00 pm"],
        reminder: ["Reminder sent", "·", "2 h before"],
        stock: ["Stock 6", "→", "0", "·", "Sold out"],
        page: ["Order page sent", "·", "at once"],
        order: ["Order #1442", "·", "7 items, QAR 98"],
        week: ["Week so far"],
    },
}
const PAUSE = { pause: "Pause", play: "Play", pauseName: "Pause the film", playName: "Play the film" }

// ---------------------------------------------------------------- the story, in film seconds
// The clock in the plate's bar runs from 15:58 to 16:20 with these events.
const E = {
    booked: 4.7, // 15:59 Noor books the cake tasting at 6:00 pm
    remind: 6.9, // 16:00 its reminder goes, two hours before
    stock: 10.9, // 16:06 Lina's order #1441 takes the last cheesecake: 1 → 0, Sold out
    conf1441: 13.9, // 16:09 #1441 confirmed (passed on the way to the chat)
    sIn: 15.7, // 16:13 Sara writes
    sOut: 16.35, // 16:13 the order page goes back at once
    aisha: 0.9, // 15:58 Aisha asks if her order is ready: the message waits for the team
    ready: 19.8, // 16:15 #1440 ready, its message sent
    maha: 20.6, // 16:16 Maha books the 6:30 pm cake tasting
    receipt: 21.5, // 16:17 Omar collects and pays cash: Paid, Done, receipt RC-0039 in his chat
    flag: 22.6, // 16:18 Needs a look: QAR 3,400 owed 30+ days
    sOrder: 25.2, // 16:19 Sara orders 7 items, QAR 98
    row1442: 26.9, // 16:19 #1442 lands on the Orders screen, New
    dash: 30.0, // 16:20 the home screen's numbers move to the moment
}
const CLOCK: [number, number][] = [
    [0, 958], [E.booked, 959], [E.remind, 960], [E.stock, 966], [E.conf1441, 969], [E.sIn, 973],
    [E.ready, 975], [E.maha, 976], [E.receipt, 977], [E.flag, 978], [E.sOrder, 979], [E.dash - 0.4, 980],
]
type Cap = { key: keyof typeof W.cap; a: number; b: number; card?: CardKey; at?: number[] }
const CAPS: Cap[] = [
    { key: "lanes", a: 0.55, b: 3.0 },
    { key: "booked", a: E.booked + 0.2, b: E.remind - 0.35, card: "book" },
    { key: "reminder", a: E.remind + 0.25, b: 8.75, card: "book" },
    { key: "stock", a: E.stock + 0.3, b: 12.75, card: "stock" },
    { key: "page", a: E.sOut + 0.3, b: 18.4, card: "chat" },
    { key: "order", a: E.row1442 + 0.2, b: 28.5, card: "table" },
    { key: "week", a: E.dash + 0.45, b: CLOSE - 0.1, card: "dash" },
]

// ---------------------------------------------------------------- the canvas (world units = px at scale 1)
// Three lanes, one above the other. Each starts 440 further along than the one under it, so their
// starts sit on a 45° line that follows the fold.
type CardKey = "inbox" | "chat" | "table" | "stock" | "book" | "noor" | "owed" | "paper" | "omar" | "dash" | "pair"
type Rect = { x: number; y: number; w: number; h: number }
const CARDS: Record<CardKey, Rect> = {
    inbox: { x: 880, y: 44, w: 380, h: 316 },
    chat: { x: 1300, y: 44, w: 420, h: 316 },
    table: { x: 1760, y: 44, w: 540, h: 316 },
    stock: { x: 2340, y: 44, w: 400, h: 316 },
    book: { x: 440, y: 484, w: 440, h: 340 },
    noor: { x: 920, y: 484, w: 360, h: 316 },
    owed: { x: 0, y: 924, w: 440, h: 316 },
    paper: { x: 480, y: 924, w: 400, h: 316 },
    omar: { x: 920, y: 924, w: 360, h: 316 },
    dash: { x: 2820, y: 64, w: 500, h: 476 },
    pair: { x: 1300, y: 44, w: 1000, h: 316 }, // the chat and the Orders screen, side by side
}
const LANES = [
    { key: "orders" as const, x: 880, y: 0, end: 2740 },
    { key: "bookings" as const, x: 440, y: 440, end: 1280 },
    { key: "money" as const, x: 0, y: 880, end: 1280 },
]
const WORLD_BOTTOM = 1240

// ---------------------------------------------------------------- easing and time
function bezier(x1: number, y1: number, x2: number, y2: number) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
    const sx = (t: number) => ((ax * t + bx) * t + cx) * t
    const sy = (t: number) => ((ay * t + by) * t + cy) * t
    const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
    return (x: number) => {
        if (x <= 0) return 0
        if (x >= 1) return 1
        let t = x
        for (let i = 0; i < 6; i++) {
            const e = sx(t) - x
            const d = dx(t)
            if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break
            t -= e / d
        }
        return sy(Math.min(1, Math.max(0, t)))
    }
}
const EASE = bezier(0.16, 1, 0.3, 1) // --ease (expo out): arrivals
const sine = (p: number) => -(Math.cos(Math.PI * Math.min(1, Math.max(0, p))) - 1) / 2 // travel
const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ramp = (t: number, a: number, d: number) => cl((t - a) / d)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const r2 = (n: number) => Math.round(n * 100) / 100

type Sty = Record<string, string | number>
/** Arrives along 45° (from the inline-end top), settles. */
function arrive(t: number, a: number, d = PLAY4, dir = 1): Sty {
    const p = EASE(ramp(t, a, d))
    const off = (1 - p) * TRAVEL * 0.7071
    return { opacity: r2(cl((t - a) / (d * 0.55))), transform: `translate(${r2(dir * off)}px, ${r2(-off)}px)` }
}
/** In at a, out at b (fades, and leaves along 45° the same way). */
function during(t: number, a: number, b: number, dir = 1): Sty {
    if (t < b) return arrive(t, a, PLAY4, dir)
    const p = EASE(ramp(t, b, PLAY3))
    const off = p * TRAVEL * 0.5
    return { opacity: r2(1 - cl((t - b) / (PLAY3 * 0.8))), transform: `translate(${r2(-dir * off)}px, ${r2(off)}px)` }
}
const fadeIn = (t: number, a: number, d = PLAY3): Sty => ({ opacity: r2(cl((t - a) / d)) })
const fadeOut = (t: number, a: number, d = PLAY3): Sty => ({ opacity: r2(1 - cl((t - a) / d)) })
/** A Volt mark: on at a, held while the event is the news, then gone. */
const volt = (t: number, a: number, hold = VOLT_HOLD): number => r2(cl((t - a) / PLAY2) * (1 - cl((t - a - hold) / PLAY4)))

/** The clock in the bar, in minutes after midnight. */
function clockAt(t: number): number {
    if (t <= CLOCK[0][0]) return CLOCK[0][1]
    for (let i = 1; i < CLOCK.length; i++) {
        const [t1, m1] = CLOCK[i]
        const [t0, m0] = CLOCK[i - 1]
        if (t <= t1) return Math.floor(lerp(m0, m1, (t - t0) / (t1 - t0)) + 1e-6)
    }
    return CLOCK[CLOCK.length - 1][1]
}
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`

// ---------------------------------------------------------------- focus: the editor's light
// Each card's opacity through the film. The card the event is on is lit; the rest step back.
type Shot = [number, number, Partial<Record<CardKey | "_", number>>]
const SHOTS: Shot[] = [
    [-2, 3.0, { _: 0.92 }],
    [4.5, 8.8, { book: 1, noor: 0.2, _: 0.12 }],
    [10.4, 12.8, { stock: 1, table: 0.2, _: 0.12 }],
    [13.7, 14.2, { table: 0.9, stock: 0.2, chat: 0.2, _: 0.12 }],
    [15.4, 18.4, { chat: 1, inbox: 0.2, table: 0.2, _: 0.12 }],
    [19.7, 23.8, { inbox: 0.96, book: 0.96, omar: 0.96, paper: 0.96, owed: 0.96, noor: 0.6, chat: 0.6, _: 0.5 }],
    [24.9, 25.9, { chat: 1, table: 0.9, _: 0.12 }],
    [26.6, 28.4, { table: 1, chat: 0.16, stock: 0.16, _: 0.1 }],
    [29.7, 40, { dash: 1, _: 0 }],
]
function focusOf(card: CardKey, t: number): number {
    const v = (s: Shot) => s[2][card] ?? s[2]._ ?? 0.3
    if (t <= SHOTS[0][1]) return v(SHOTS[0])
    for (let i = 0; i < SHOTS.length; i++) {
        const s = SHOTS[i]
        if (t >= s[0] && t <= s[1]) return v(s)
        const n = SHOTS[i + 1]
        if (n && t > s[1] && t < n[0]) return r2(lerp(v(s), v(n), sine((t - s[1]) / (n[0] - s[1]))))
    }
    return v(SHOTS[SHOTS.length - 1])
}

/** The lanes' names and rules: only in the two shots that show all three lanes. */
const laneVis = (t: number) => r2(Math.max(1 - cl((t - 3.15) / PLAY3), Math.min(cl((t - 19.3) / PLAY4), 1 - cl((t - 24.0) / PLAY3))))

// ---------------------------------------------------------------- the camera
type Geo = {
    w: number
    h: number
    phone: boolean
    top: number // the plate's top edge
    bar: number // the bar's height, at the plate's foot
    fold: number // where the fold meets the bottom edge (wide layouts)
    inset: number
    zoom: number
}
type View = { s: number; tx: number; ty: number }
type Key = { t: number; v: "wide" | "mid" | [CardKey, number]; move?: boolean; dip?: number }
const KEYS: Key[] = [
    { t: 0, v: "wide" },
    { t: 3.1, v: "wide" },
    { t: 4.6, v: ["book", 1], move: true },
    { t: 8.9, v: ["book", 1.035] },
    { t: 10.5, v: ["stock", 1], move: true, dip: 0.5 },
    { t: 12.9, v: ["stock", 1.035] },
    { t: 15.5, v: ["chat", 1], move: true, dip: 0.16 },
    { t: 18.5, v: ["chat", 1.035] },
    { t: 19.85, v: "mid", move: true },
    { t: 23.9, v: "mid" },
    { t: 25.05, v: ["pair", 1], move: true },
    { t: 25.95, v: ["pair", 1.015] },
    { t: 26.85, v: ["table", 1], move: true },
    { t: 28.55, v: ["table", 1.035] },
    { t: 29.95, v: ["dash", 1], move: true, dip: 0.45 },
    { t: CLOSE + 0.6, v: ["dash", 1.045] },
]
/** x of the fold at height y (wide layouts): it runs from top inline-end to bottom inline-start. */
const foldX = (g: Geo, y: number) => g.fold + (g.h - y)

function focal(g: Geo, c: Rect, k: number): View {
    const avail = g.h - g.bar
    if (g.phone) {
        const fit = Math.min(1, (g.w - 28) / c.w, (avail - 62) / c.h)
        const s = fit * k
        return { s, tx: g.w / 2 - (c.x + c.w / 2) * s, ty: avail - 14 - (c.y + c.h) * s }
    }
    const fitK = c === CARDS.pair ? 0.56 : c === CARDS.dash ? 0.8 : c === CARDS.table ? 0.9 : 1
    const s = g.zoom * fitK * k
    return { s, tx: g.w - g.inset - (c.x + c.w) * s, ty: avail - 66 * g.zoom - (c.y + c.h) * s }
}
function wideView(g: Geo, mid: boolean): View {
    const avail = g.h - g.bar
    if (g.phone) {
        const s = mid ? 0.34 : 0.3
        // the Bookings and Money lanes' first cards, the Orders lane above them cut by the top
        return { s, tx: 14 - (mid ? 300 : 0) * s, ty: avail - 12 - WORLD_BOTTOM * s }
    }
    const s = g.zoom * (mid ? 0.49 : 0.43)
    const y0 = avail - 22 * g.zoom - (WORLD_BOTTOM - 880) * s // the Money lane's top, on screen
    const x0 = foldX(g, y0) + 20 * g.zoom - (mid ? 0 : 0)
    return { s, tx: x0, ty: y0 - 880 * s }
}
function viewOf(g: Geo, k: Key): View {
    if (k.v === "wide") return wideView(g, false)
    if (k.v === "mid") return wideView(g, true)
    return focal(g, CARDS[k.v[0]], k.v[1])
}
function camAt(g: Geo, t: number): View {
    if (t <= KEYS[0].t) return viewOf(g, KEYS[0])
    const R = g.phone ? { x: g.w / 2, y: (g.h - g.bar) / 2 } : { x: g.w - g.inset - 230 * g.zoom, y: (g.h - g.bar) / 2 + 40 }
    for (let i = 1; i < KEYS.length; i++) {
        const b = KEYS[i]
        if (t > b.t) continue
        const a = KEYS[i - 1]
        const A = viewOf(g, a)
        const B = viewOf(g, b)
        const p = (t - a.t) / (b.t - a.t)
        const u = b.move ? sine(p) : p // a hold drifts in at an even pace
        // the world point under R, carried across; the scale in log space, pulling back on long moves
        const wa = { x: (R.x - A.tx) / A.s, y: (R.y - A.ty) / A.s }
        const wb = { x: (R.x - B.tx) / B.s, y: (R.y - B.ty) / B.s }
        const ls = lerp(Math.log(A.s), Math.log(B.s), u) - (b.dip ?? 0) * Math.sin(Math.PI * u)
        const s = Math.exp(ls)
        const wx = lerp(wa.x, wb.x, u)
        const wy = lerp(wa.y, wb.y, u)
        return { s, tx: R.x - wx * s, ty: R.y - wy * s }
    }
    return viewOf(g, KEYS[KEYS.length - 1])
}

// ---------------------------------------------------------------- the plate and the wipe
type Pt = [number, number]
function plateOf(g: Geo): Pt[] {
    if (g.phone) {
        const c = 48 // --cut-plate-sm
        return [[c, 0], [g.w, 0], [g.w, g.h], [0, g.h], [0, c]]
    }
    return [[foldX(g, g.top), g.top], [g.w, g.top], [g.w, g.h], [g.fold, g.h]]
}
/** The plate above its bar, cut to the half-plane x + y ≤ k (the fold closing and opening). */
function clipOf(g: Geo, k: number): Pt[] {
    const yb = g.h - g.bar
    const quad: Pt[] = g.phone
        ? [[48, 0], [g.w, 0], [g.w, yb], [0, yb], [0, 48]]
        : [[foldX(g, g.top), g.top], [g.w, g.top], [g.w, yb], [foldX(g, yb), yb]]
    const out: Pt[] = []
    const inside = (p: Pt) => p[0] + p[1] <= k
    for (let i = 0; i < quad.length; i++) {
        const p = quad[i]
        const q = quad[(i + 1) % quad.length]
        const pi = inside(p)
        const qi = inside(q)
        if (pi) out.push(p)
        if (pi !== qi) {
            const s = (k - p[0] - p[1]) / (q[0] + q[1] - p[0] - p[1])
            out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s])
        }
    }
    return out
}
const poly = (pts: Pt[]) => (pts.length < 3 ? "polygon(0 0, 0 0, 0 0)" : `polygon(${pts.map((p) => `${r2(p[0])}px ${r2(p[1])}px`).join(", ")})`)
/** The wipe's edge: all of the plate shown (open), sliding back to the fold, then out again. */
function wipeK(g: Geo, t: number): number {
    const lo = g.phone ? 0 : g.fold + g.h - 2
    const hi = g.w + g.h + 2
    if (t < CLOSE) return hi
    if (t < RESET) return lerp(hi, lo, sine((t - CLOSE) / (RESET - CLOSE)))
    return lerp(lo, hi, EASE((t - RESET) / (L - RESET)))
}

// ---------------------------------------------------------------- the component
interface Props {
    mode: "auto" | "wide" | "phone"
    at: number
    stageW: number
    stageH: number
    fold: number
    top: number
    inset: number
    zoom: number
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function BgExplainer(props: Props) {
    const { mode = "auto", at = -1, stageW = 1440, stageH = 820, fold = 440, top = 96, inset = 48, zoom = 1, style } = props
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const ref = useRef<HTMLDivElement>(null)
    const [box, setBox] = useState({ w: 0, h: 0 })
    const [reduce, setReduce] = useState(false)
    const [userPaused, setUserPaused] = useState(false)
    const [away, setAway] = useState(false)

    useEffect(() => {
        if (typeof document === "undefined" || document.getElementById("alyr-proto-fonts")) return
        const link = document.createElement("link")
        link.id = "alyr-proto-fonts"
        link.rel = "stylesheet"
        link.href = FONTS
        document.head.appendChild(link)
    }, [])
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

    // The stage: its measured box, or the instance's own size where the canvas cannot measure.
    const measured = box.w > 0 && box.h > 0
    const gw = measured ? box.w : stageW
    const gh = measured ? box.h : stageH
    const phone = mode === "phone" || (mode === "auto" && gw < 640)
    const g: Geo = useMemo(
        () => ({ w: gw, h: gh, phone, top: phone ? 0 : top, bar: phone ? 40 : 44, fold, inset: phone ? 16 : inset, zoom: phone ? 1 : zoom }),
        [gw, gh, phone, top, fold, inset, zoom]
    )
    const staticFrame = isCanvas || reduce
    const frozen = at >= 0 && !staticFrame
    const paused = staticFrame || frozen || userPaused || away
    const t0 = staticFrame ? STILL : frozen ? at : 0

    // ------------------------------------------------ the clock that drives every frame
    const clock = useRef({ t: t0, last: 0 })
    if (staticFrame || frozen) clock.current.t = t0
    const els = useRef(new Map<string, HTMLElement>())
    const fns = new Map<string, (t: number) => Sty>()
    const applied = useRef(new Map<string, Sty>())
    let camCache: { t: number; v: View } = { t: NaN, v: { s: 1, tx: 0, ty: 0 } }
    const cam = (t: number) => {
        if (camCache.t !== t) camCache = { t, v: camAt(g, t) }
        return camCache.v
    }
    /** State time: the canvas goes back to its start under the closing fold. */
    const st = (t: number) => (t >= RESET ? t - L : t)
    /** An animated part: its ref, and its style at the current time. */
    const A = (key: string, fn: (ts: number, t: number) => Sty, base?: React.CSSProperties) => {
        const f = (t: number) => fn(st(t), t)
        fns.set(key, f)
        const now = f(clock.current.t)
        const { text, ...rest } = now
        return {
            ref: (el: HTMLElement | null) => {
                if (el) els.current.set(key, el)
                else els.current.delete(key)
            },
            style: { ...base, ...(rest as React.CSSProperties) },
            "data-k": key,
            children: text !== undefined ? String(text) : undefined,
        }
    }
    const fnsRef = useRef(fns)
    fnsRef.current = fns

    useLayoutEffect(() => {
        applied.current.clear()
    })
    /** Every animated part, as it is at time t. */
    const applyAt = (t: number) => {
        fnsRef.current.forEach((f, key) => {
            const el = els.current.get(key)
            if (!el) return
            const s = f(t)
            const prev = applied.current.get(key)
            for (const p in s) {
                const v = s[p]
                if (prev && prev[p] === v) continue
                if (p === "text") el.textContent = String(v)
                else (el.style as any)[p] = typeof v === "number" ? String(v) : v
            }
            applied.current.set(key, s)
        })
    }
    const held = useRef(false)
    useEffect(() => {
        if (paused) return
        let raf = 0
        clock.current.last = performance.now()
        const tick = (now: number) => {
            const dt = Math.min(0.1, (now - clock.current.last) / 1000)
            clock.current.last = now
            if (!held.current) clock.current.t = (clock.current.t + dt) % L
            applyAt(clock.current.t)
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [paused, g])
    useEffect(() => {
        if (typeof window === "undefined") return
        // for the local harness: read the film's clock, start it at a given second, or hold it on
        // one frame (frame by frame capture)
        ;(window as any).__bgx = {
            time: () => clock.current.t,
            seek: (t: number) => (clock.current.t = t % L),
            frame: (t: number) => {
                held.current = true
                clock.current.t = t % L
                applyAt(clock.current.t)
            },
            L,
        }
    }, [])

    // ------------------------------------------------ helpers for the canvas
    const card = (k: CardKey, extra?: React.CSSProperties) =>
        A(`card:${k}`, (ts) => ({ opacity: r2(focusOf(k, ts) * (k === "paper" ? cl((ts - E.receipt + 0.15) / PLAY2) : 1)) }), {
            position: "absolute",
            left: CARDS[k].x,
            top: CARDS[k].y,
            width: CARDS[k].w,
            height: CARDS[k].h,
            ...extra,
        })
    const notch = "polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px)"
    const win: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: C.window,
        color: C.text,
        boxShadow: `inset 0 0 0 1px ${C.windowLine}`,
        clipPath: notch,
        fontFamily: SANS,
        fontSize: 14,
        lineHeight: 1.35,
    }
    const head = (title: string, aside?: string) => (
        <div style={{ display: "flex", flex: "none", alignItems: "center", justifyContent: "space-between", gap: 16, height: 44, padding: "0 16px", borderBottom: `1px solid ${C.hair2}` }}>
            <b style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{title}</b>
            {aside ? <span style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{aside}</span> : null}
        </div>
    )
    const label: React.CSSProperties = { fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, lineHeight: 1.45 }
    const tickPath = "M3.5 8.5l3 3 6-7"
    const Tick = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
        <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
            <path d={tickPath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="square" />
        </svg>
    )
    const voltProps = (key: string, fn: (ts: number) => number, base: React.CSSProperties) => ({ ...A(key, (ts) => ({ opacity: fn(ts) }), base), "data-volt": "" })

    // ------------------------------------------------ 1. Sara's chat (Orders lane)
    const bubble = (out: boolean): React.CSSProperties => ({
        position: "absolute",
        [out ? "right" : "left"]: 14,
        maxWidth: "82%",
        padding: "7px 11px",
        borderRadius: 4,
        background: out ? C.out : C.card,
        color: C.text,
        boxShadow: `0 0 0 1px ${C.hair}`,
        fontSize: 13,
        lineHeight: 1.35,
    })
    // A chat as the team sees it: the newest message at the foot, each one arriving as it is sent
    // and the older ones scrolling up and out at the top. Each message keeps its drawn height.
    type Msg = { k: string; at: number; kind: "in" | "out" | "day" | "event"; h: number; body: React.ReactNode; flush?: boolean; w?: number }
    const VIEW = 272
    const Thread = ({ id, msgs }: { id: string; msgs: Msg[] }) => {
        const tops: number[] = []
        let y = 14
        msgs.forEach((m, i) => {
            tops[i] = y
            y += m.h + 10
        })
        const offOf = (i: number) => VIEW - 14 - (tops[i] + msgs[i].h)
        const scroll = (ts: number) => {
            let k = 0
            msgs.forEach((m, i) => {
                if (m.at <= ts) k = i
            })
            if (k === 0 || msgs[k].at <= -99) return offOf(k)
            let j = k - 1
            while (j > 0 && msgs[j].at >= msgs[k].at) j--
            return lerp(offOf(j), offOf(k), EASE(ramp(ts, msgs[k].at, PLAY4)))
        }
        const chip: React.CSSProperties = { position: "absolute", left: "50%", transform: "translateX(-50%)", background: C.raise, boxShadow: `0 0 0 1px ${C.hair2}`, color: C.muted, fontSize: 12, lineHeight: 1.35, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }
        return (
            <div style={{ position: "relative", flex: 1, background: C.chat, overflow: "hidden" }}>
                <div {...A(`${id}:scroll`, (ts) => ({ transform: `translateY(${r2(scroll(ts))}px)` }), { position: "absolute", inset: 0 })}>
                    {msgs.map((m, i) => {
                        const base: React.CSSProperties =
                            m.kind === "day" ? { ...chip, padding: "2px 10px" } : m.kind === "event" ? { ...chip, padding: "3px 10px" } : { ...bubble(m.kind === "out"), ...(m.flush ? { padding: 0, overflow: "hidden" } : null), ...(m.w ? { width: m.w } : null) }
                        const style = { ...base, top: tops[i], height: m.h, boxSizing: "border-box" as const }
                        if (m.at <= -99) return <span key={m.k} style={style}>{m.body}</span>
                        // a day's first chip comes with its first message; the rest arrive along 45°
                        return <span key={m.k} {...A(`${id}:${m.k}`, (ts) => (m.kind === "day" ? fadeIn(ts, m.at) : arrive(ts, m.at)), style)}>{m.body}</span>
                    })}
                </div>
            </div>
        )
    }
    const Chat = (
        <div {...card("chat", win)}>
            {head(W.chat.who, W.chat.inbox)}
            {Thread({
                id: "chat",
                msgs: [
                    { k: "mon", at: -99, kind: "day", h: 20, body: "Mon" },
                    { k: "old", at: -99, kind: "out", h: 32, body: "Order #1409 is complete. Thank you." },
                    { k: "today", at: E.sIn - 0.02, kind: "day", h: 20, body: W.chat.today },
                    { k: "in", at: E.sIn, kind: "in", h: 32, body: W.chat.inMsg },
                    {
                        k: "out", at: E.sOut, kind: "out", h: 63, flush: true,
                        body: (
                            <>
                                <span style={{ display: "block", padding: "7px 11px" }}>{W.chat.outMsg}</span>
                                <span style={{ display: "block", padding: "6px 11px", borderTop: `1px solid ${C.hair2}`, color: C.link, fontSize: 13, fontWeight: 600, textAlign: "center" }}>{W.chat.action}</span>
                                <span {...voltProps("chat:outV", (ts) => volt(ts, E.sOut, 1.6), { position: "absolute", top: 0, left: 0, right: 0, height: 3, background: C.volt })} />
                            </>
                        ),
                    },
                    { k: "event", at: E.sOrder, kind: "event", h: 22, body: W.chat.event },
                    { k: "confirm", at: E.sOrder + 0.55, kind: "out", h: 32, body: W.chat.confirm },
                ]})}
        </div>
    )

    // ------------------------------------------------ 0. the team's inbox (Orders lane): every chat, newest on top
    // Each conversation's last message, and when it came; a row moves to the top as it changes.
    const CONVS: { who: string; ev: [number, string, string][] }[] = [
        { who: "Sara M.", ev: [[-99, "Mon", "Order #1409 is complete. Thank you."], [E.sIn, "16:13", W.chat.inMsg], [E.sOut, "16:13", W.chat.outMsg], [E.sOrder + 0.55, "16:19", W.chat.confirm]] },
        { who: "Omar A.", ev: [[-99, "15:52", W.omar.confirmed], [E.ready + 0.1, "16:15", W.omar.ready], [E.receipt + 0.45, "16:17", W.omar.caption]] },
        { who: "Maha J.", ev: [[-99, "Mon", "Thank you!"], [E.maha + 0.2, "16:16", "Booking 113 confirmed at Qirfa Bakery: Cake tasting, Thu 15 Oct, 6:30 PM."]] },
        { who: "Lina F.", ev: [[-99, "Tue", "Thank you!"], [E.stock, "16:06", "Order #1441 received"], [E.conf1441, "16:09", "Order #1441 is confirmed."]] },
        { who: "Noor A.", ev: [[-99, "Sun", "Thank you!"], [E.booked + 0.3, "15:59", W.noor.confirmed], [E.remind + 0.1, "16:00", W.noor.reminder]] },
        { who: "Aisha I.", ev: [[-99, "13:20", "Order #1436 is ready for collection."], [E.aisha, "15:58", "Is my order ready?"]] },
        { who: "Mariam S.", ev: [[-99, "15:47", "Order #1438 received"]] },
        { who: "Tariq Z.", ev: [[-99, "15:32", "Can I order a birthday cake for Saturday?"]] },
    ]
    const lastEv = (c: (typeof CONVS)[number], ts: number) => {
        let k = 0
        for (let i = 0; i < c.ev.length; i++) if (c.ev[i][0] <= ts) k = i
        return k
    }
    const minutes = (hm: string) => (/^\d/.test(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : -1)
    const rankAt = (ts: number) => {
        const order = CONVS.map((c, i) => ({ i, m: minutes(c.ev[lastEv(c, ts)][1]), f: c.ev[lastEv(c, ts)][0] }))
        order.sort((a, b) => b.m - a.m || b.f - a.f || a.i - b.i)
        const rank: number[] = []
        order.forEach((o, r) => (rank[o.i] = r))
        return rank
    }
    const INBOX_T = Array.from(new Set(CONVS.flatMap((c) => c.ev.map((e) => e[0]).filter((t) => t > -99)))).sort((a, b) => a - b)
    const ROW_IN = 54
    const inboxY = (i: number, ts: number) => {
        let e = -99
        for (const t of INBOX_T) if (t <= ts) e = t
        const now = rankAt(ts)[i]
        if (e <= -99) return now * ROW_IN
        const before = rankAt(e - 1e-3)[i]
        return lerp(before, now, EASE(ramp(ts, e, PLAY4))) * ROW_IN
    }
    const Inbox = (
        <div {...card("inbox", win)}>
            {head(W.inbox.title, W.inbox.aside)}
            <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                {CONVS.map((c, i) => (
                    <div key={c.who} {...A(`inbox:${i}`, (ts) => ({ transform: `translateY(${r2(inboxY(i, ts))}px)` }), { position: "absolute", left: 0, right: 0, top: 0, height: ROW_IN, display: "grid", alignContent: "center", gap: 3, padding: "0 16px", borderBottom: `1px solid ${C.hair}` })}>
                        {c.who === "Aisha I." ? <span {...voltProps("inbox:aishaV", (ts) => volt(ts, E.aisha, 1.6), { position: "absolute", inset: 0, background: C.wash })} /> : null}
                        <span style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <b style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{c.who}</b>
                            <span {...A(`inbox:${i}:at`, (ts) => ({ text: c.ev[lastEv(c, ts)][1] }), { color: C.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" })} />
                        </span>
                        <span {...A(`inbox:${i}:say`, (ts) => ({ text: c.ev[lastEv(c, ts)][2] }), { position: "relative", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "clip", color: C.muted, fontSize: 13 })} />
                    </div>
                ))}
            </div>
        </div>
    )

    // ------------------------------------------------ 2. the Orders screen (Orders lane)
    type Row = { n: string; who: string; items: string; total: string; pay: (ts: number) => "unpaid" | "paid" | "account"; st: (ts: number) => "new" | "confirmed" | "ready" | "done"; from: number }
    const ROWS: Row[] = [
        { n: "#1442", who: "Sara M.", items: "7 items", total: "QAR 98", pay: () => "unpaid", st: () => "new", from: E.row1442 },
        { n: "#1441", who: "Lina F.", items: "2 items", total: "QAR 197", pay: () => "unpaid", st: (ts) => (ts >= E.conf1441 ? "confirmed" : "new"), from: E.stock },
        { n: "#1440", who: "Omar A.", items: "3 items", total: "QAR 64", pay: (ts) => (ts >= E.receipt ? "paid" : "unpaid"), st: (ts) => (ts >= E.receipt + 0.25 ? "done" : ts >= E.ready ? "ready" : "confirmed"), from: -99 },
        { n: "#1439", who: "Khalid A.", items: "3 items", total: "QAR 555", pay: () => "account", st: () => "confirmed", from: -99 },
        { n: "#1438", who: "Mariam S.", items: "4 items", total: "QAR 112", pay: () => "unpaid", st: () => "new", from: -99 },
        { n: "#1437", who: "Meera V.", items: "2 items", total: "QAR 370", pay: () => "account", st: () => "ready", from: -99 },
    ]
    const ROW_H = 50
    const rowY = (i: number, ts: number) => {
        // newer rows push this one down, one row at a time, as they land
        let y = 0
        for (let j = 0; j < i; j++) if (ROWS[j].from > -99) y += ROW_H * EASE(ramp(ts, ROWS[j].from, PLAY4))
            else y += ROW_H
        return y
    }
    const cols = "100px 104px 80px minmax(0, 1fr)"
    const STATES = ["new", "confirmed", "ready", "done"] as const
    const Orders = (
        <div {...card("table", win)}>
            {head(W.orders.title, W.orders.aside)}
            <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 12, height: 32, padding: "0 16px", borderBottom: `1px solid ${C.hair}`, ...label }}>
                {W.orders.head.map((h) => (
                    <span key={h}>{h}</span>
                ))}
            </div>
            <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                {ROWS.map((r, i) => (
                    <div
                        key={r.n}
                        {...A(`row:${r.n}`, (ts) => {
                            const y = rowY(i, ts)
                            if (r.from <= -99) return { transform: `translateY(${r2(y)}px)`, opacity: 1 }
                            const a = arrive(ts, r.from)
                            return { transform: `translateY(${r2(y)}px) ${a.transform}`, opacity: a.opacity }
                        }, { position: "absolute", left: 0, right: 0, top: 0, height: ROW_H, display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 12, padding: "0 16px", borderBottom: `1px solid ${C.hair}` })}
                    >
                        {r.from > -99 ? <span {...voltProps(`row:${r.n}:wash`, (ts) => volt(ts, r.from + 0.1), { position: "absolute", inset: 0, background: C.wash })} /> : null}
                        {r.n === "#1441" ? <span {...voltProps("row:#1441:wash2", (ts) => volt(ts, E.conf1441, 1.2), { position: "absolute", inset: 0, background: C.wash })} /> : null}
                        {r.n === "#1440" ? <span {...voltProps("row:#1440:wash", (ts) => volt(ts, E.ready, 1.0), { position: "absolute", inset: 0, background: C.wash })} /> : null}
                        <span style={{ position: "relative", display: "grid", gap: 1, minWidth: 0 }}>
                            <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{r.n}</b>
                            <span style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap" }}>{r.who}</span>
                        </span>
                        <span style={{ position: "relative", display: "grid", gap: 1 }}>
                            <span style={{ fontSize: 13 }}>{r.items}</span>
                            <span style={{ color: C.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{r.total}</span>
                        </span>
                        <span style={{ position: "relative", display: "grid", fontSize: 13 }}>
                            {(["unpaid", "paid", "account"] as const).map((p) => (
                                <span key={p} {...A(`row:${r.n}:pay:${p}`, (ts) => ({ opacity: r.pay(ts) === p ? 1 : 0 }), { gridArea: "1 / 1", whiteSpace: "nowrap", color: p === "paid" ? C.text : C.muted })}>{W.orders.pay[p]}</span>
                            ))}
                        </span>
                        <span style={{ position: "relative", display: "grid", alignItems: "center" }}>
                            {STATES.map((s) => (
                                <span key={s} {...A(`row:${r.n}:st:${s}`, (ts) => ({ opacity: r.st(ts) === s ? 1 : 0 }), { gridArea: "1 / 1", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 })}>
                                    <span style={{ padding: "1px 6px", boxShadow: `inset 0 0 0 1px ${s === "new" ? C.text : C.hair2}`, color: s === "done" ? C.muted : C.text, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{W.orders.st[s]}</span>
                                    {s !== "done" ? <span style={{ padding: "3px 9px", boxShadow: `inset 0 0 0 1px ${C.lineStrong}`, borderRadius: 4, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{W.orders.next[s]}</span> : null}
                                </span>
                            ))}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )

    // ------------------------------------------------ 3. the Stock card (Orders lane)
    const LOG = [
        { d: "−1", order: "Order #1441", at: "16:06", bal: "balance 0", from: E.stock },
        { d: "−3", order: "Order #1439", at: "13:40", bal: "balance 1", from: -99 },
        { d: "−2", order: "Order #1437", at: "10:12", bal: "balance 4", from: -99 },
    ]
    const Stock = (
        <div {...card("stock", win)}>
            {head(W.stock.path)}
            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", borderBottom: `1px solid ${C.hair2}` }}>
                <span style={{ display: "grid", justifyItems: "center", alignContent: "center", gap: 2, padding: "12px 6px", borderRight: `1px solid ${C.hair2}` }}>
                    <span style={{ color: C.muted, fontSize: 12 }}>{W.stock.leftToday}</span>
                    <span style={{ position: "relative", display: "grid", overflow: "hidden", height: 40, fontSize: 36, fontWeight: 600, lineHeight: "40px", fontVariantNumeric: "tabular-nums" }}>
                        <span {...A("stock:d1", (ts) => {
                            const p = EASE(ramp(ts, E.stock, PLAY3))
                            return { opacity: r2(1 - p), transform: `translate(${r2(p * 6)}px, ${r2(-p * 6)}px)` }
                        }, { gridArea: "1 / 1", textAlign: "center" })}>1</span>
                        <span {...A("stock:d0", (ts) => arrive(ts, E.stock, PLAY3, -1), { gridArea: "1 / 1", textAlign: "center" })}>0</span>
                    </span>
                    <span style={{ color: C.muted, fontSize: 12 }}>{W.stock.of}</span>
                </span>
                <span style={{ display: "grid", alignContent: "start", justifyItems: "start", gap: 3, padding: "12px 16px", minWidth: 0 }}>
                    <span style={{ padding: "0 6px", boxShadow: `inset 0 0 0 1px ${C.lineStrong}`, color: C.muted, fontFamily: MONO, fontSize: 11 }}>{W.stock.code}</span>
                    <b style={{ fontWeight: 600, lineHeight: 1.3 }}>{W.stock.name}</b>
                    <span style={{ color: C.muted, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{W.stock.price}</span>
                    <span style={{ display: "grid", marginTop: 2 }}>
                        <span {...A("stock:few", (ts) => fadeOut(ts, E.stock + 0.35, PLAY2), { gridArea: "1 / 1", color: C.muted, fontSize: 12 })}>{W.stock.left}</span>
                        <span {...A("stock:out", (ts) => arrive(ts, E.stock + 0.35, PLAY3), { gridArea: "1 / 1", justifySelf: "start", padding: "1px 8px", background: C.text, color: C.inverse, fontSize: 12, fontWeight: 600 })}>{W.stock.soldOut}</span>
                    </span>
                </span>
            </div>
            <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "space-between", ...label }}>
                <span>{W.stock.log}</span>
                <span style={{ letterSpacing: "0.02em", textTransform: "none" }}>{W.stock.rule}</span>
            </div>
            <div style={{ position: "relative", flex: 1, margin: "6px 0 0", overflow: "hidden" }}>
                {LOG.map((r, i) => (
                    <div
                        key={r.order}
                        {...A(`log:${i}`, (ts): Sty => {
                            const y = i === 0 ? 0 : 36 * (i - 1) + 36 * EASE(ramp(ts, E.stock, PLAY4))
                            if (r.from <= -99) return { transform: `translateY(${r2(y)}px)` }
                            const a = arrive(ts, r.from)
                            return { transform: `translateY(${r2(y)}px) ${a.transform}`, opacity: a.opacity }
                        }, { position: "absolute", left: 0, right: 0, top: 0, height: 36, display: "grid", gridTemplateColumns: "44px 32px minmax(0, 1fr) 48px auto", alignItems: "center", gap: 8, padding: "0 16px", borderTop: `1px solid ${C.hair}`, fontSize: 13, fontVariantNumeric: "tabular-nums" })}
                    >
                        {r.from > -99 ? <span {...voltProps("log:wash", (ts) => volt(ts, r.from + 0.1), { position: "absolute", inset: 0, background: C.wash })} /> : null}
                        <b style={{ position: "relative", fontWeight: 600 }}>{W.stock.sold}</b>
                        <span style={{ position: "relative" }}>{r.d}</span>
                        <span style={{ position: "relative", color: C.muted }}>{r.order}</span>
                        <span style={{ position: "relative", color: C.muted }}>{r.at}</span>
                        <span style={{ position: "relative", color: C.muted, whiteSpace: "nowrap" }}>{r.bal}</span>
                    </div>
                ))}
            </div>
        </div>
    )

    // ------------------------------------------------ 4. the Bookings day (Bookings lane)
    const Book = (
        <div {...card("book", win)}>
            {head(W.book.title, W.book.day)}
            <div style={{ display: "grid", gap: 16, padding: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    {W.book.times.map((time) => {
                        const on = time === W.book.time || time === W.book.time2
                        const at = time === W.book.time ? E.booked : E.maha
                        const until = time === W.book.time ? E.remind - E.booked - 0.05 : 1.0
                        return (
                            <span key={time} style={{ position: "relative", display: "grid", placeItems: "center", height: 36, overflow: "hidden", borderRadius: 8, background: C.card, boxShadow: `0 0 0 1px ${C.hair2}`, fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                                <span>{time}</span>
                                {on ? (
                                    <>
                                        {/* taken: ink once the news has passed */}
                                        <span {...A(`book:taken:${time}`, (ts) => ({ opacity: r2(cl((ts - at - until) / PLAY4)) }), { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: C.text, color: C.inverse, fontWeight: 600 })}>{time}</span>
                                        <span {...{ ...A(`book:fill:${time}`, (ts) => {
                                            const p = EASE(ramp(ts, at, PLAY3))
                                            return { clipPath: `inset(0 ${r2((1 - p) * 100)}% 0 0)`, opacity: volt(ts, at, until) }
                                        }, { position: "absolute", inset: 0, display: "grid", placeItems: "center", background: C.volt, color: C.onVolt, fontWeight: 600 }), "data-volt": "" }}>{time}</span>
                                    </>
                                ) : null}
                            </span>
                        )
                    })}
                </div>
                <div style={{ display: "grid" }}>
                    <div {...A("book:b1", (ts) => arrive(ts, E.booked + 5 * STAG), { display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) auto", alignItems: "center", gap: 16, padding: "10px 0", borderTop: `1px solid ${C.hair}` })}>
                        <b style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{W.book.time}</b>
                        <span style={{ display: "grid", gap: 2 }}>
                            <b style={{ fontWeight: 600 }}>{W.book.service}</b>
                            <small style={{ color: C.muted, fontSize: 12 }}>{W.book.who}</small>
                        </span>
                        <small style={{ color: C.muted, fontSize: 12 }}>{W.book.booked}</small>
                    </div>
                    <div {...A("book:b2", (ts) => arrive(ts, E.remind), { display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) auto", alignItems: "center", gap: 16, padding: "10px 0", borderTop: `1px solid ${C.hair}`, borderBottom: `1px solid ${C.hair}` })}>
                        <span style={{ position: "relative", width: 18, height: 18, color: C.voltInk }}>
                            <Tick size={18} />
                            <span {...voltProps("book:tickV", (ts) => volt(ts, E.remind), { position: "absolute", inset: -2, display: "grid", placeItems: "center", background: C.volt, color: C.onVolt })}>
                                <Tick size={18} />
                            </span>
                        </span>
                        <span style={{ display: "grid", gap: 2 }}>
                            <b style={{ fontWeight: 600 }}>{W.book.reminder}</b>
                            <small style={{ color: C.muted, fontSize: 12 }}>{W.book.before}</small>
                        </span>
                        <small style={{ color: C.muted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{W.book.sentAt}</small>
                    </div>
                    <div {...A("book:b3", (ts) => arrive(ts, E.maha + 5 * STAG), { display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) auto", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: `1px solid ${C.hair}` })}>
                        <b style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{W.book.time2}</b>
                        <span style={{ display: "grid", gap: 2 }}>
                            <b style={{ fontWeight: 600 }}>{W.book.service}</b>
                            <small style={{ color: C.muted, fontSize: 12 }}>{W.book.who2}</small>
                        </span>
                        <small style={{ color: C.muted, fontSize: 12 }}>{W.book.booked}</small>
                    </div>
                </div>
            </div>
        </div>
    )

    // ------------------------------------------------ 5 and 8. two customers' chats, as the team sees them
    const Noor = (
        <div {...card("noor", win)}>
            {head(W.noor.who, W.chat.inbox)}
            {Thread({
                id: "noor",
                msgs: [
                    { k: "sun", at: -99, kind: "day", h: 20, body: "Sun" },
                    { k: "thanks", at: -99, kind: "in", h: 32, body: "Thank you!" },
                    { k: "today", at: E.booked + 0.28, kind: "day", h: 20, body: W.chat.today },
                    { k: "c", at: E.booked + 0.3, kind: "out", h: 67, body: W.noor.confirmed },
                    { k: "r", at: E.remind + 0.1, kind: "out", h: 49, body: W.noor.reminder },
                ]})}
        </div>
    )
    const Omar = (
        <div {...card("omar", win)}>
            {head(W.omar.who, W.chat.inbox)}
            {Thread({
                id: "omar",
                msgs: [
                    { k: "today", at: -99, kind: "day", h: 20, body: W.chat.today },
                    { k: "c", at: -99, kind: "out", h: 32, body: W.omar.confirmed },
                    { k: "ready", at: E.ready + 0.1, kind: "out", h: 32, body: W.omar.ready },
                    {
                        k: "doc", at: E.receipt + 0.45, kind: "out", h: 104, flush: true, w: 268,
                        body: (
                            <>
                                <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: C.raise, borderBottom: `1px solid ${C.hair2}` }}>
                                    <span style={{ position: "relative", width: 26, height: 32, flex: "none", background: C.paper, boxShadow: `inset 0 0 0 1px ${C.docRule}`, clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }} />
                                    <span style={{ display: "grid", gap: 1 }}>
                                        <b style={{ fontWeight: 600, fontSize: 13 }}>{W.omar.file}</b>
                                        <small style={{ color: C.muted, fontSize: 12 }}>{W.omar.fileSub}</small>
                                    </span>
                                    <span {...voltProps("omar:docV", (ts) => volt(ts, E.receipt + 0.45, 1.5), { marginLeft: "auto", width: 18, height: 18, display: "grid", placeItems: "center", background: C.volt, color: C.onVolt })}>
                                        <Tick size={14} />
                                    </span>
                                </span>
                                <span style={{ display: "block", padding: "7px 11px" }}>{W.omar.caption}</span>
                            </>
                        ),
                    },
                ]})}
        </div>
    )

    // ------------------------------------------------ 6. what is owed (Money lane)
    const Owed = (
        <div {...card("owed", win)}>
            {head(W.owed.title, W.owed.aside)}
            <div style={{ display: "grid", gap: 4, padding: "14px 16px 0" }}>
                <span style={{ color: C.muted, fontSize: 12, fontWeight: 500 }}>{W.owed.k}</span>
                <b style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{W.owed.total}</b>
                <span style={{ display: "flex", gap: 2, height: 10, marginTop: 8 }}>
                    {W.owed.segments.map((s, i) => (
                        <span key={s.label} style={{ flexGrow: s.share, flexBasis: 0, minWidth: 4, background: C.text, opacity: 0.25 + i * 0.22 }} />
                    ))}
                </span>
                <span style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "5px 16px", marginTop: 8 }}>
                    {W.owed.segments.map((s, i) => (
                        <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 12, whiteSpace: "nowrap" }}>
                            <i style={{ width: 8, height: 8, flex: "none", background: C.text, opacity: 0.25 + i * 0.22 }} />
                            <span>{s.label}</span>
                            <b style={{ color: C.text, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>{s.amount}</b>
                        </span>
                    ))}
                </span>
            </div>
            <div {...A("owed:flag", (ts) => arrive(ts, E.flag), { display: "grid", gap: 4, margin: "14px 16px 0", paddingTop: 12, borderTop: `1px solid ${C.hair2}` })}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ position: "relative", width: 16, height: 16, borderRadius: "50%", boxShadow: `inset 0 0 0 1.5px ${C.text}`, display: "grid", placeItems: "center" }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.text }} />
                        <span {...voltProps("owed:flagV", (ts) => volt(ts, E.flag, 1.7), { position: "absolute", inset: -2, borderRadius: "50%", boxShadow: `inset 0 0 0 2px ${C.volt}`, background: C.window })} />
                    </span>
                    <span style={{ ...label, color: C.text }}>{W.owed.flag}</span>
                </span>
                <b style={{ fontWeight: 600, fontSize: 14 }}>{W.owed.flagTitle}</b>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.02em", color: C.muted }}>{W.owed.flagWhy}</span>
            </div>
        </div>
    )

    // ------------------------------------------------ 7. receipt RC-0039, Arabic first (Money lane)
    const pr = W.paper
    const ink2 = { color: C.docInk2, fontSize: 11 }
    const Paper = (
        <div {...card("paper", { overflow: "hidden", background: C.paper, color: C.docInk, boxShadow: `inset 0 0 0 1px ${C.docRule}`, clipPath: notch, fontFamily: SANS })}>
            <div {...A("paper:body", (ts) => {
                const p = EASE(ramp(ts, E.receipt, PLAY4 * 1.6))
                return { clipPath: `inset(0 0 ${r2((1 - p) * 100)}% 0)` }
            }, { position: "absolute", inset: 0, padding: "18px 20px" })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 12, borderBottom: `1px solid ${C.docRule}` }}>
                    <span style={{ display: "grid", gap: 2 }}>
                        <b lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 22, fontWeight: 600, lineHeight: 1.3 }}>{pr.kindAr}</b>
                        <span style={ink2}>{pr.kind}</span>
                    </span>
                    <span style={{ display: "grid", gap: 2, justifyItems: "end", textAlign: "right" }}>
                        <b lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{pr.shopAr}</b>
                        <span style={ink2}>{pr.shop}</span>
                        <span lang="ar" dir="rtl" style={{ ...ink2, fontFamily: ARABIC }}>{pr.addrAr}</span>
                    </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 16px", padding: "12px 0", borderBottom: `1px solid ${C.docRule}` }}>
                    {pr.rows.map(([ar, en, v]) => (
                        <span key={en} style={{ display: "grid", gap: 1 }}>
                            <span style={ink2}>
                                <span lang="ar" style={{ fontFamily: ARABIC }}>{ar}</span> · {en}
                            </span>
                            <b style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{v}</b>
                        </span>
                    ))}
                </div>
                <div style={{ display: "grid", gap: 6, padding: "10px 0", borderBottom: `1px solid ${C.docRule}` }}>
                    {pr.lines.map(([ar, en, q, v]) => (
                        <span key={en} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 20px 52px", gap: 8, alignItems: "baseline", fontSize: 12 }}>
                            <span style={{ display: "grid" }}>
                                <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, textAlign: "left" }}>{ar}</span>
                                <span style={{ color: C.docInk2, fontSize: 11 }}>{en}</span>
                            </span>
                            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{q}</span>
                            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}</span>
                        </span>
                    ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 10 }}>
                    <span style={ink2}>
                        <span lang="ar" style={{ fontFamily: ARABIC }}>{pr.totalAr}</span> · {pr.total}
                    </span>
                    <b dir="rtl" style={{ fontFamily: ARABIC, fontSize: 16, fontWeight: 600 }}>
                        <bdi dir="ltr">64.00</bdi> ر.ق
                    </b>
                </div>
            </div>
        </div>
    )

    // ------------------------------------------------ 9. ALYR Agent, the one screen
    const d = W.dash
    const roll = (key: string, from: string, to: string, a: number, extra?: React.CSSProperties) => (
        <span style={{ position: "relative", display: "inline-grid", overflow: "hidden", verticalAlign: "bottom", ...extra }}>
            <span {...A(`${key}:a`, (ts) => {
                const p = EASE(ramp(ts, a, PLAY3))
                return { opacity: r2(1 - p), transform: `translate(${r2(p * 5)}px, ${r2(-p * 5)}px)` }
            }, { gridArea: "1 / 1" })}>{from}</span>
            <span {...A(`${key}:b`, (ts) => arrive(ts, a, PLAY3, -1), { gridArea: "1 / 1" })}>{to}</span>
        </span>
    )
    const kpi = (name: string, value: React.ReactNode, change: string, first?: boolean) => (
        <span style={{ display: "grid", gap: 6, padding: "14px 0", paddingLeft: first ? 0 : 16, borderLeft: first ? "none" : `1px solid ${C.hair2}` }}>
            <span style={label}>{name}</span>
            <b style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</b>
            <span style={{ color: C.muted, fontSize: 12 }}>{change}</span>
        </span>
    )
    const Dash = (
        <div {...card("dash", win)}>
            <div style={{ display: "flex", flex: "none", alignItems: "center", gap: 10, height: 44, padding: "0 16px", borderBottom: `1px solid ${C.hair2}` }}>
                <span style={{ position: "relative", display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 4, background: C.band, boxShadow: `inset 0 0 0 1px ${C.bandRule}`, color: C.monoInk, fontSize: 10, fontWeight: 600, overflow: "hidden" }}>
                    {W.mono}
                    <span style={{ position: "absolute", top: 0, right: 0, width: 7, height: 7, background: C.volt, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
                </span>
                <b style={{ fontWeight: 600 }}>{W.shop}</b>
                <span style={{ ...label, color: C.faint }}>/ {d.path}</span>
            </div>
            <div style={{ display: "grid", alignContent: "start", gap: 0, padding: "18px 22px 0" }}>
                <span style={label}>{d.when}</span>
                <p style={{ margin: "10px 0 0", fontSize: 22, fontWeight: 500, lineHeight: 1.27, letterSpacing: "-0.015em" }}>
                    {d.summary[0]}
                    {roll("dash:o1", "49", d.summary[1], E.dash)}
                    {d.summary[2]}
                    {roll("dash:q1", "QAR 8,422", d.summary[3], E.dash + STAG * 2)}
                    {d.summary[4]} <span style={{ color: C.muted }}>{d.muted}</span>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", gap: 24, marginTop: 22 }}>
                    <div>
                        <span style={{ ...label, display: "block", paddingBottom: 8, borderBottom: `1px solid ${C.text}` }}>{d.needs}</span>
                        {[
                            ["2", d.waiting],
                            ["2", d.confirm],
                        ].map(([n, w], i) => (
                            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "10px 0", borderBottom: `1px solid ${C.hair2}` }}>
                                <b style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{n as string}</b>
                                <span style={{ display: "grid", gap: 2, fontWeight: 500, fontSize: 14 }}>
                                    <span>{(w as string[])[0]}</span>
                                    <small style={{ color: C.muted, fontSize: 12, fontWeight: 400 }}>{(w as string[])[1]}</small>
                                </span>
                            </div>
                        ))}
                    </div>
                    <div>
                        <span style={{ ...label, display: "block", paddingBottom: 8, borderBottom: `1px solid ${C.hair2}` }}>{d.done}</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.hair2}` }}>
                            <b style={{ position: "relative", fontSize: 20, fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                {roll("dash:s", "182", "183", E.dash + STAG * 4)}
                                <span {...voltProps("dash:sV", (ts) => volt(ts, E.dash + STAG * 4, 99), { position: "absolute", left: 0, right: 0, bottom: -5, height: 3, background: C.volt })} />
                            </b>
                            <span style={{ color: C.muted, fontSize: 13 }}>{d.sent}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.hair2}` }}>
                            <b style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>7</b>
                            <span style={{ color: C.muted, fontSize: 13 }}>{d.reminders}</span>
                        </div>
                    </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 16, borderTop: `1px solid ${C.text}` }}>
                    {kpi(d.kpis[0], roll("dash:q2", "QAR 8,422", "QAR 8,520", E.dash + STAG * 2), "▲ 20%", true)}
                    {kpi(d.kpis[1], roll("dash:o2", "49", "50", E.dash), "▲ 11%")}
                    {kpi(d.kpis[2], "QAR 12,975", "Last week QAR 11,029")}
                </div>
                <span style={{ color: C.muted, fontSize: 12 }}>{d.caption}</span>
            </div>
        </div>
    )

    // ------------------------------------------------ screen space: the lanes' rules and names, the captions
    const laneLabel = (l: (typeof LANES)[number]) =>
        A(`lane:${l.key}`, (ts, t) => {
            const v = cam(ts)
            const y = v.ty + (l.y + 30) * v.s
            const sx = v.tx + l.x * v.s
            const x = g.phone ? Math.max(sx, 14) : Math.max(sx, foldX(g, y - 16) + 14 * g.zoom)
            const show = y > g.top + 26 && y < g.h - g.bar - 6 ? 1 : 0
            return { transform: `translate(${r2(x)}px, ${r2(y - 19)}px)`, opacity: r2(show * laneVis(ts)) }
        }, { position: "absolute", left: 0, top: 0, display: "flex", gap: 7, fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onBandQuiet, whiteSpace: "nowrap" })
    const laneRule = (l: (typeof LANES)[number]) =>
        A(`rule:${l.key}`, (ts, t) => {
            const v = cam(ts)
            const y = Math.round(v.ty + (l.y + 30) * v.s) + 0.5
            const sx = v.tx + l.x * v.s
            const x0 = g.phone ? Math.max(sx, 0) : Math.max(sx, foldX(g, y))
            const x1 = v.tx + l.end * v.s
            const show = y > g.top + 8 && y < g.h - g.bar - 18 ? 1 : 0
            return { transform: `translate(${r2(x0)}px, ${r2(y)}px) scaleX(${r2(Math.max(0, x1 - x0))})`, opacity: r2(show * laneVis(ts)) }
        }, { position: "absolute", left: 0, top: 0, width: 1, height: 1, background: C.darkLine, transformOrigin: "0 0" })
    const laneTick = (l: (typeof LANES)[number]) =>
        A(`tick:${l.key}`, (ts, t) => {
            const v = cam(ts)
            const y = Math.round(v.ty + (l.y + 30) * v.s)
            const x1 = Math.round(v.tx + l.end * v.s)
            const show = y > g.top + 8 && y < g.h - g.bar - 18 ? 1 : 0
            return { transform: `translate(${x1}px, ${y - 4}px)`, opacity: r2(show * laneVis(ts)) }
        }, { position: "absolute", left: 0, top: 0, width: 1, height: 9, background: C.bandRule })

    const capWords = (c: Cap) => W.cap[c.key]
    const capPos = (c: Cap, ts: number) => {
        const v = cam(ts)
        if (c.card) {
            const r = CARDS[c.card]
            const x = v.tx + r.x * v.s
            const y = v.ty + r.y * v.s - 14
            // clear of the plate's edge: the cut corner on a phone, the fold elsewhere (at the words' top)
            const cutClear = g.phone ? Math.max(0, 56 - y) : Math.max(0, foldX(g, y - 24) + 12 * g.zoom - x)
            return { x: x + cutClear, y, w: r.w * v.s - cutClear }
        }
        // the lanes' captions sit over the Orders lane's name
        const l = LANES[0]
        const y = v.ty + (l.y + 30) * v.s - 34
        const x = g.phone ? 14 : Math.max(v.tx + l.x * v.s, foldX(g, y - 18) + 14 * g.zoom)
        return { x, y, w: Math.min(g.w - g.inset - x, 420) }
    }
    const caption = (c: Cap) => {
        const words = capWords(c)
        return (
            <div
                key={c.key}
                {...A(`cap:${c.key}`, (ts): Sty => {
                    const on = ts >= c.a - 0.05 && ts < c.b + PLAY3 + 0.05
                    if (!on) return { opacity: 0 }
                    const p = capPos(c, ts)
                    return { opacity: 1, transform: `translate(${r2(p.x)}px, ${r2(p.y)}px)`, width: `${r2(Math.max(120, p.w))}px` }
                }, { position: "absolute", left: 0, top: 0, height: 0 })}
            >
                {/* the hairline, drawn from the inline start, ending in a tick at the card */}
                <span {...A(`cap:${c.key}:line`, (ts) => {
                    const p = EASE(ramp(ts, c.a, PLAY4))
                    const q = EASE(ramp(ts, c.b, PLAY3))
                    return { transform: `scaleX(${r2(p * (1 - q))})` }
                }, { position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: C.bandRule, transformOrigin: "0 0" })} />
                <span {...A(`cap:${c.key}:tick`, (ts) => ({ opacity: r2(cl((ts - c.a - PLAY4 * 0.6) / PLAY2) * (1 - cl((ts - c.b) / PLAY2))) }), { position: "absolute", right: 0, bottom: -4, width: 1, height: 9, background: C.onBandFaint })} />
                <span style={{ position: "absolute", left: 0, bottom: 8, display: "flex", gap: 7, whiteSpace: "nowrap", fontFamily: MONO, fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.2 }}>
                    {words.map((w, i) => {
                        const a = c.at ? c.at[i] : c.a + i * STAG * 2
                        const sep = w === "·" || w === "→"
                        return (
                            <span key={i} {...A(`cap:${c.key}:${i}`, (ts) => during(ts, a + (c.at ? 0.12 : 0.1), c.b - 0.08 + (words.length - i) * 0.02), { display: "inline-block", color: sep ? C.onBandFaint : i === words.length - 1 || (c.at && !sep) ? C.onBand : C.onBandSoft })}>
                                {w === "→" ? (
                                    <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden="true" style={{ display: "block", marginTop: 0 }}>
                                        <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="square" strokeLinejoin="miter" />
                                    </svg>
                                ) : (
                                    w
                                )}
                            </span>
                        )
                    })}
                </span>
            </div>
        )
    }

    // ------------------------------------------------ the frame
    const plate = plateOf(g)
    const barY = g.h - g.bar
    const barX = g.phone ? 0 : foldX(g, barY)
    const glyph = (on: boolean): React.CSSProperties =>
        on
            ? { width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "8.6px solid currentColor" }
            : { width: 9, height: 10, borderLeft: "3px solid currentColor", borderRight: "3px solid currentColor", boxSizing: "border-box" }

    return (
        <div ref={ref} data-bgx="" dir="ltr" lang="en" style={{ width: "100%", height: "100%", ...style, position: "relative", overflow: "hidden" }}>
            <p style={{ position: "absolute", width: 1, height: 1, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{W.about}</p>
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {/* the Carbon plate, cut by the fold; in dark, the band's edge as a hairline */}
                <svg width={g.w} height={g.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} aria-hidden="true">
                    <polygon points={plate.map((p) => p.join(",")).join(" ")} fill={C.band} />
                    <polygon points={plate.map((p) => p.join(",")).join(" ")} fill="none" stroke={C.bandEdge} strokeWidth={1} />
                </svg>
                {/* the canvas, the lanes and the captions, inside the plate above its bar */}
                <div {...A("clip", (ts, t) => ({ clipPath: poly(clipOf(g, wipeK(g, t))) }), { position: "absolute", inset: 0, overflow: "hidden" })}>
                    <div
                        {...A("world", (ts, t) => {
                            const v = cam(ts)
                            return { transform: `translate(${r2(v.tx)}px, ${r2(v.ty)}px) scale(${Math.round(v.s * 10000) / 10000})` }
                        }, { position: "absolute", left: 0, top: 0, width: 1, height: 1, transformOrigin: "0 0" })}
                    >
                        {Inbox}
                        {Chat}
                        {Orders}
                        {Stock}
                        {Book}
                        {Noor}
                        {Owed}
                        {Paper}
                        {Omar}
                        {Dash}
                    </div>
                    {LANES.map((l) => (
                        <React.Fragment key={l.key}>
                            <span {...laneRule(l)} />
                            <span {...laneTick(l)} />
                            <span {...laneLabel(l)}>
                                <span>{W.lanes[l.key]}</span>
                                {W.tags[l.key].map(([tag, ev], i) => (
                                    <span key={tag} {...A(`tag:${l.key}:${i}`, (ts) => during(ts, E[ev] + 0.1, 23.75), { display: "inline-flex", gap: 7, color: C.onBand })}>
                                        <span style={{ color: C.onBandFaint }}>·</span>
                                        {tag}
                                    </span>
                                ))}
                            </span>
                        </React.Fragment>
                    ))}
                    {CAPS.map(caption)}
                </div>
                {/* the bar: the shop, the one Sample mark, the afternoon's clock */}
                <div style={{ position: "absolute", left: barX, right: 0, top: barY, height: g.bar, borderTop: `1px solid ${C.darkLine}`, display: "flex", alignItems: "center", gap: 10, paddingLeft: g.phone ? 16 : 26, paddingRight: g.inset + (g.phone ? 64 : 92), color: C.onBand, fontFamily: SANS, fontSize: 13 }}>
                    <span style={{ position: "relative", display: "grid", placeItems: "center", width: 24, height: 24, flex: "none", borderRadius: 4, background: C.band, boxShadow: `inset 0 0 0 1px ${C.bandRule}`, color: C.monoInk, fontSize: 10, fontWeight: 600, overflow: "hidden" }}>
                        {W.mono}
                        <span style={{ position: "absolute", top: 0, right: 0, width: 7, height: 7, background: C.volt, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
                    </span>
                    <b style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{W.shop}</b>
                    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 4px", border: `1px solid ${C.bandRule}`, borderRadius: 4, fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C.onBandQuiet, whiteSpace: "nowrap" }}>{W.sample}</span>
                    <span style={{ marginLeft: "auto", color: C.onBandQuiet, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {g.phone ? null : `${W.day} · `}
                        <span {...A("clock", (ts) => ({ text: hhmm(clockAt(ts)) }))} />
                    </span>
                </div>
            </div>
            <button
                type="button"
                aria-label={userPaused ? PAUSE.playName : PAUSE.pauseName}
                aria-pressed={userPaused}
                hidden={reduce || frozen || isCanvas}
                onClick={() => setUserPaused((v) => !v)}
                style={{
                    position: "absolute",
                    right: g.inset - 12,
                    top: barY,
                    height: g.bar,
                    minWidth: 44,
                    display: reduce || frozen || isCanvas ? "none" : "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px",
                    border: 0,
                    background: "transparent",
                    color: C.onBandQuiet,
                    font: "inherit",
                    fontFamily: SANS,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    outlineColor: C.volt,
                }}
            >
                <span aria-hidden="true" style={glyph(userPaused)} />
                <span>{userPaused ? PAUSE.play : PAUSE.pause}</span>
            </button>
        </div>
    )
}

addPropertyControls(BgExplainer, {
    mode: { type: ControlType.Enum, title: "Layout", options: ["auto", "wide", "phone"], optionTitles: ["Auto", "Wide", "Phone"], defaultValue: "auto" },
    at: { type: ControlType.Number, title: "Still at (s)", min: -1, max: 36, step: 0.1, defaultValue: -1, description: "-1 plays the loop" },
    stageW: { type: ControlType.Number, title: "Width", min: 320, max: 1920, step: 1, defaultValue: 1440, description: "Used where the canvas cannot measure" },
    stageH: { type: ControlType.Number, title: "Height", min: 200, max: 1200, step: 1, defaultValue: 820 },
    fold: { type: ControlType.Number, title: "Fold at foot", min: 0, max: 1200, step: 1, defaultValue: 440, hidden: (p: Props) => p.mode === "phone" },
    top: { type: ControlType.Number, title: "Plate top", min: 0, max: 400, step: 1, defaultValue: 96, hidden: (p: Props) => p.mode === "phone" },
    inset: { type: ControlType.Number, title: "Gutter", min: 0, max: 96, step: 1, defaultValue: 48 },
    zoom: { type: ControlType.Number, title: "Zoom", min: 0.4, max: 1.4, step: 0.01, defaultValue: 1, hidden: (p: Props) => p.mode === "phone" },
})
