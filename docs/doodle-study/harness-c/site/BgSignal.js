// ALYR prototype 05C, "Signal field: a week, counted" (docs/doodle-study/03-pro-brief.md, C).
// A precise dot matrix on a 16 px grid (8 px based), fading toward the headline. Each event of
// Qirfa Bakery's week lights a dot; a short hairline carries it at 45° and 90° to the gathering
// line, where each order settles as one block in its day's bar beside last week's. 50 orders,
// 50 blocks: "Week so far: 50 orders, QAR 8,520" resolves on Thursday, then the field resets.
//
// Numbers are the homepage sample's (apps/web/app/_agent/samples/bakery.en.json, Thursday 16:20):
// sales by day this week and last week by this time; the 50 orders split by day in proportion
// to each day's sales (the sample gives no daily order count); order numbers #1392 to #1441,
// so the feed's #1441 (16:09) is the week's 50th.
//
// Volt only on the event in flight that is in focus, the record just made, and today's mark;
// never more than two at once. Loops, pauses off screen, in a hidden tab and with the Pause
// button (WCAG 2.2.2); one composed still with reduced motion and on Framer's canvas. Every x is
// mirrored for right to left; text is never mirrored. Colours are the project's ALYR/ styles.
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addPropertyControls, ControlType, RenderTarget } from "framer";
const C = {
    ink: "var(--token-XYAPSNcOu, #15171a)", // ALYR/text, used at the low opacities in INK
    muted: "var(--token-tpGxkcLLH, #5f666d)", // ALYR/text-muted
    faint: "var(--token-MIJi7pupd, #8a918b)", // ALYR/text-faint, labels only
    strong: "var(--token-SVZjCcT_M, #8a918b)", // ALYR/line-strong, the one active path
    volt: "var(--token-wnKZyblTz, #b7f34a)",
    canvas: "var(--token-S2oE56wbE, #f6f7f3)",
    focus: "var(--token-kaftmF1nD, #6a9320)",
};
const MONO = `"IBM Plex Mono", "Cascadia Mono", ui-monospace, monospace`;
const SANS = `"Instrument Sans", system-ui, sans-serif`;
// Ink in the art, as opacities of ALYR/text: Carbon on Paper, white on Carbon (brief: 10 to 22%).
const INK = { field: [0.06, 0.1, 0.14, 0.19], ghost: 0.1, block: 0.22, base: 0.24, tail: 0.3, msg: 0.36, lit: 0.55 };
// Motion: the site's play-* durations times --pace 1.3; --ease; --travel.
const PACE = 1.3;
const D2 = 0.144 * PACE;
const D3 = 0.288 * PACE;
const D4 = 0.432 * PACE;
const TRAVEL = 12;
const L = 30; // seconds, one week
const STILL = 24.6; // the composed frame: reduced motion and Framer's canvas
const P = 16; // the grid
// ---------- the sample week ----------
const WEEK = [
    { key: "SUN", value: 1710, last: 1803, orders: 10 },
    { key: "MON", value: 2400, last: 1922, orders: 14 },
    { key: "TUE", value: 2017, last: 917, orders: 12 },
    { key: "WED", value: 1291, last: 1188, orders: 8 },
    { key: "THU", value: 1102, last: 1299, orders: 6 }, // today to 16:20; last = last week by 16:20
    { key: "FRI", value: 0, last: 0, orders: 0 },
    { key: "SAT", value: 0, last: 0, orders: 0 },
];
const TODAY = 4;
const FIRST_ORDER = 1392;
const MAXV = 2400;
// When each day's orders land (s). Thursday slows into the last order, the week's 50th.
const WINDOWS = [
    [3.0, 6.0],
    [6.8, 10.6],
    [11.4, 14.6],
    [15.4, 17.6],
    [18.3, 20.7],
];
const LAST_LAND = 22.2;
const T = {
    book: 12.3, // a booking made on Tuesday for Thursday's cake tasting
    paid: 16.0, // Tuesday's last order paid on Wednesday
    remind: 18.6, // Thursday 16:00, two hours before 18:00
    sum: 22.7, // the week resolves
    reset: 27.3, // the field resets
};
const WORDS = {
    en: {
        order: (n) => `ORDER #${n}`,
        booked: "BOOKED · THU 6:00 PM",
        paid: "PAID · #1427",
        remind: "REMINDER SENT",
        sum: ["Week so far: 50 orders, ", "QAR 8,520"],
        fictional: "FICTIONAL BAKERY",
        block: "1 BLOCK = 1 ORDER",
        last: "LAST WEEK BY THIS TIME",
        pause: "Pause",
        play: "Play",
        pauseName: "Pause the background",
        playName: "Play the background",
    },
};
// ---------- maths ----------
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const sm = (v, a, b) => {
    const x = clamp01((v - a) / (b - a));
    return x * x * (3 - 2 * x);
};
function bezier(x1, y1, x2, y2) {
    const bx = (u) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const by = (u) => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    return (t) => {
        if (t <= 0)
            return 0;
        if (t >= 1)
            return 1;
        let lo = 0;
        let hi = 1;
        let u = t;
        for (let i = 0; i < 24; i++) {
            const x = bx(u);
            if (Math.abs(x - t) < 1e-5)
                break;
            if (x < t)
                lo = u;
            else
                hi = u;
            u = (lo + hi) / 2;
        }
        return by(u);
    };
}
const ease = bezier(0.16, 1, 0.3, 1); // --ease
const sine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const r1 = (n) => Math.round(n * 10) / 10;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const charW = (s) => s.length * 11 * (0.6 + 0.08); // Plex Mono at 11 px, tracked .08em
function layout(mode) {
    if (mode === "phone")
        return {
            mode, W: 390, H: 360, cols: [64, 112, 160, 208, 256, 304, 352], half: 6, maxH: 120, base: 248,
            labelY: 266, sumY: 294, legY: 318, capY: 340, xMin: 16, xMax: 374, yMin: 56, V: 150, tail: 40, sumSize: 14,
            field: (x, y) => (x < 140 && y < 56 ? 0 : 0.3 + 0.7 * sm(y, 40, 230)),
            ok: (x, y) => y >= 64 && !(x < 140 && y < 64),
        };
    if (mode === "mid")
        return {
            mode, W: 1024, H: 760, cols: [592, 656, 720, 784, 848, 912, 976], half: 7, maxH: 192, base: 632,
            labelY: 654, sumY: 692, legY: 718, capY: 0, xMin: 48, xMax: 976, yMin: 104, V: 220, tail: 52, sumSize: 15,
            field: (x, y) => {
                let v = Math.max(sm(x, 560, 960), sm(y, 500, 700) * sm(x, 100, 600));
                v *= 0.55 + 0.45 * sm(y, 104, 240);
                if ((x < 800 && y < 340) || (x < 570 && y < 530))
                    v = Math.min(v, 0.1);
                return v;
            },
            ok: (x, y) => y >= 120 && !((x < 800 && y < 344) || (x < 570 && y < 530)),
        };
    return {
        mode, W: 1440, H: 820, cols: [992, 1056, 1120, 1184, 1248, 1312, 1376], half: 7, maxH: 224, base: 680,
        labelY: 702, sumY: 742, legY: 770, capY: 0, xMin: 48, xMax: 1392, yMin: 104, V: 240, tail: 56, sumSize: 15,
        field: (x, y) => {
            let v = Math.max(sm(x, 780, 1240), sm(y, 576, 760) * sm(x, 200, 980));
            v *= 0.55 + 0.45 * sm(y, 104, 240);
            if (x < 880 && y < 590)
                v = Math.min(v, 0.1);
            return v;
        },
        ok: (x, y) => y >= 120 && !(x < 880 && y < 590),
    };
}
function routeOf(S, E) {
    const dx = S[0] - E[0];
    const K = [E[0], S[1] + dx];
    const diag = dx * Math.SQRT2;
    return { S, K, E, diag, len: diag + (E[1] - K[1]) };
}
function at(r, s) {
    if (s <= r.diag) {
        const u = r.diag ? s / r.diag : 0;
        return [r.S[0] + (r.K[0] - r.S[0]) * u, r.S[1] + (r.K[1] - r.S[1]) * u];
    }
    return [r.K[0], r.K[1] + Math.min(s, r.len) - r.diag];
}
// How far above its target a focal event may start, so its 1.5 px path stays short.
const FRISE = { wide: 260, mid: 200, phone: 96 };
function build(lay) {
    const R = rng(1442);
    const k = lay.maxH / MAXV;
    const { base, half, cols } = lay;
    // Blocks: one per order, its height its share of the day's sales, a 1 px gap between.
    const blocks = [];
    const ghosts = [];
    WEEK.forEach((d, di) => {
        const c = cols[di];
        if (d.last) {
            const h = Math.round(d.last * k);
            ghosts.push({ x: c - P - half, y: base - h, w: half * 2, h });
        }
        let prev = base;
        for (let j = 1; j <= d.orders; j++) {
            const top = base - Math.round(((d.value * j) / d.orders) * k);
            blocks.push({ x: c - half, y: top, w: half * 2, h: prev - top - (j === 1 ? 0 : 2), day: di, top });
            prev = top;
        }
    });
    // The field: a dot wherever the density beats its ordered-dither threshold.
    const levels = ["", "", "", ""];
    const x0 = cols[0] - P - half;
    const x1 = cols[6] + half;
    const isGhost = (x, y) => ghosts.some((g) => x >= g.x - 2 && x <= g.x + g.w + 2 && y >= g.y - 4);
    const startCol = Math.ceil(lay.xMin / P);
    let jy = 0;
    for (let y = 8 + P * Math.ceil((lay.yMin - 8) / P); y <= lay.H - 8; y += P, jy++) {
        for (let ix = startCol; ix * P <= lay.xMax; ix++) {
            const x = ix * P;
            if (y > base - 4 && (lay.mode === "phone" || (x >= x0 - 8 && x <= x1 + 8)))
                continue;
            if (isGhost(x, y))
                continue;
            let v = lay.field(x, y);
            if (x >= x0 - 8 && x <= x1 + 8 && y >= base - lay.maxH - 8)
                v *= 0.5;
            const thr = (BAYER[(jy % 4) * 4 + (ix % 4)] + 0.5) / 16;
            if (v <= thr)
                continue;
            const lv = Math.min(3, Math.floor(v * 4));
            levels[lv] += `M${x} ${y}h0`;
        }
    }
    // Routes: from a node up and toward the inline end, 45° down toward the start, then 90° down.
    const rows = [];
    for (let y = 8 + P * Math.ceil((lay.yMin - 8) / P); y < base; y += P)
        rows.push(y);
    const recent = [];
    const pick = (cx, ey, kMax, minV, spread = 1, rise = 9999) => {
        for (let tries = 0; tries < 60; tries++) {
            const kk = Math.min(kMax, Math.floor(R() * (kMax + 1) * spread));
            const xs = cx + kk * P;
            if (xs > lay.xMax)
                continue;
            const yLim = ey - minV - kk * P;
            const ok = rows.filter((y) => y <= yLim && y >= ey - rise - kk * P && lay.ok(xs, y));
            if (!ok.length)
                continue;
            const ys = ok[Math.floor(R() * ok.length)];
            if (recent.some((p) => Math.abs(p[0] - xs) < 40 && Math.abs(p[1] - ys) < 40))
                continue;
            recent.push([xs, ys]);
            if (recent.length > 4)
                recent.shift();
            return [xs, ys];
        }
        return [cx, Math.max(rows[0], ey - minV)];
    };
    const orders = [];
    let g = 0;
    WEEK.forEach((d, di) => {
        if (!d.orders)
            return;
        const [a, b] = WINDOWS[di];
        for (let j = 1; j <= d.orders; j++) {
            const blk = blocks[g];
            const last = di === TODAY && j === d.orders;
            let tLand = last ? LAST_LAND : di === TODAY ? a + ((b - a) * (j - 1)) / (d.orders - 2) : a + ((b - a) * (j - 1)) / (d.orders - 1);
            if (j > 1 && !last && !(di === TODAY && j === d.orders - 1))
                tLand += (R() - 0.5) * 0.12;
            const E = [cols[di] + 0.5, (blk.y + blk.y + blk.h) / 2];
            const focal = g === 0 || last;
            const S = pick(cols[di], E[1], 9, focal ? 120 : 56, focal ? 0.7 : 1, focal ? FRISE[lay.mode] : 9999);
            const route = routeOf([S[0] + 0.5, S[1]], E);
            const D = Math.min(1.9, Math.max(1.05, route.len / lay.V));
            const tGo = tLand - D;
            orders.push({ day: di, j, num: FIRST_ORDER + g, g, route, tLight: tGo - (focal ? 0.75 : D3), tGo, tLand, D, focal });
            g++;
        }
    });
    const ring = [cols[TODAY] + P + 0.5, base - 5]; // sits on the line, beside Thursday's bar
    const focals = [];
    const mk = (kind, label, E, tLight, block) => {
        const S = pick(Math.round(E[0] - 0.5), E[1], 7, 120, 0.8, FRISE[lay.mode]);
        const route = routeOf([S[0] + 0.5, S[1]], E);
        const D = Math.min(1.9, Math.max(1.05, route.len / lay.V));
        const tGo = tLight + 0.75;
        focals.push({ kind, label, route, tLight, tGo, tLand: tGo + D, D, block });
    };
    const o0 = orders[0];
    const oz = orders[orders.length - 1];
    focals.push({ kind: "order", label: WORDS.en.order(o0.num), route: o0.route, tLight: o0.tLight, tGo: o0.tGo, tLand: o0.tLand, D: o0.D, block: 0 });
    mk("book", WORDS.en.booked, ring, T.book, -1);
    const b1427 = blocks.findIndex((_, i) => orders[i].num === 1427);
    const bk = blocks[b1427];
    mk("paid", WORDS.en.paid, [cols[2] + 0.5, (bk.y + bk.y + bk.h) / 2], T.paid, b1427);
    focals.push({ kind: "order", label: WORDS.en.order(oz.num), route: oz.route, tLight: oz.tLight, tGo: oz.tGo, tLand: oz.tLand, D: oz.D, block: oz.g });
    // Messages: dots that light and fade where they are, busier in some moments than others.
    const amb = [];
    let t = 0.4;
    while (t < 21.6) {
        const xs = P * Math.round((lay.xMin + R() * (lay.xMax - lay.xMin)) / P);
        const ys = rows[Math.floor(R() * rows.length)];
        if (lay.field(xs, ys) > 0.45 && lay.ok(xs, ys) && ys < base - lay.maxH - 16) {
            amb.push({ x: xs, y: ys, t });
            t += 0.42 + R() * 0.5;
        }
    }
    const dayWin = WEEK.map((d, di) => {
        const os = orders.filter((o) => o.day === di);
        return os.length ? [os[0].tLand - 0.4, os[os.length - 1].tLand + 0.3] : null;
    });
    return { blocks, ghosts, levels, orders, focals, ring, amb, dayWin, x0, x1 };
}
const HIDE = { opacity: 0 };
const POOL = 10;
const AMB = 6;
function tailD(r, a, b, X) {
    if (b - a < 0.5)
        return "";
    const pts = [at(r, a)];
    if (a < r.diag && b > r.diag)
        pts.push(r.K);
    pts.push(at(r, b));
    return pts.map((p, i) => `${i ? "L" : "M"}${r1(X(p[0]))} ${r1(p[1])}`).join("");
}
function frame(lay, w, t, rtl) {
    const X = (x) => (rtl ? lay.W - x : x);
    const dir = rtl ? -1 : 1;
    const out = {
        blocks: [], under: [], overlay: HIDE, cap: HIDE, labels: [],
        ring: HIDE, remind: HIDE, tails: [], dots: [], amb: [],
        route: HIDE, fdot: HIDE, flabel: { opacity: 0, text: "" }, flead: HIDE, sum: HIDE,
    };
    // Blocks arrive as their order lands; the reset takes them back, last first.
    const under = [0, 0, 0, 0, 0];
    w.blocks.forEach((b, i) => {
        const o = w.orders[i];
        const r0 = T.reset + 0.3 + (w.blocks.length - 1 - i) * 0.024;
        if (t < o.tLand || t >= r0 + D3)
            return out.blocks.push(HIDE);
        under[b.day] = Math.max(under[b.day], lay.base - b.y);
        if (t >= r0) {
            const p = ease(seg(t, r0, r0 + D3));
            return out.blocks.push({ opacity: r1(1 - p), transform: `translate(0 ${r1(2 * p)})` });
        }
        const p = ease(seg(t, o.tLand, o.tLand + D3));
        out.blocks.push({ opacity: r1(p), transform: `translate(0 ${r1(-3 * (1 - p))})` });
    });
    for (let d = 0; d < 5; d++) {
        const h = under[d];
        const c = lay.cols[d];
        out.under.push(h ? { x: X(c - lay.half) - (rtl ? lay.half * 2 : 0), y: lay.base - h, width: lay.half * 2, height: h, opacity: 1 } : HIDE);
    }
    // Day labels: the day being counted is darker; today is ink at the end.
    w.dayWin.forEach((win, d) => {
        let fill = C.faint;
        if (win && t >= win[0] && t < win[1])
            fill = C.muted;
        if (d === TODAY && t >= LAST_LAND + 0.2 && t < T.reset)
            fill = C.ink;
        out.labels.push({ fill });
    });
    // Messages lighting in the field.
    for (let s = 0; s < AMB; s++) {
        let a = HIDE;
        for (let i = s; i < w.amb.length; i += AMB) {
            const m = w.amb[i];
            if (t >= m.t && t < m.t + D3 + 1.1) {
                const up = ease(seg(t, m.t, m.t + D3));
                const down = seg(t, m.t + D3, m.t + D3 + 1.1);
                a = { transform: `translate(${X(m.x)} ${m.y})`, r: r1(1 + 0.5 * up), opacity: r1(INK.msg * up * (1 - down * down)) };
            }
        }
        out.amb.push(a);
    }
    // Orders in flight: a lit dot with a short hairline behind it.
    for (let s = 0; s < POOL; s++) {
        let dot = HIDE;
        let tail = HIDE;
        for (let i = s; i < w.orders.length; i += POOL) {
            const o = w.orders[i];
            if (o.focal || t < o.tLight || t >= o.tLand + D3)
                continue;
            const r = o.route;
            if (t < o.tGo) {
                const p = ease(seg(t, o.tLight, o.tGo));
                dot = { transform: `translate(${r1(X(r.S[0]))} ${r.S[1]})`, r: r1(1 + 0.75 * p), opacity: r1(0.15 + (INK.lit - 0.15) * p) };
            }
            else if (t < o.tLand) {
                const sArc = sine(seg(t, o.tGo, o.tLand)) * r.len;
                const p = at(r, sArc);
                dot = { transform: `translate(${r1(X(p[0]))} ${r1(p[1])})`, r: 1.75, opacity: INK.lit };
                tail = { d: tailD(r, Math.max(0, sArc - lay.tail), sArc, X), opacity: INK.tail };
            }
            else {
                const p = ease(seg(t, o.tLand, o.tLand + D3));
                dot = { transform: `translate(${r1(X(r.E[0]))} ${r1(r.E[1])})`, r: r1(1.75 * (1 - p)), opacity: r1(INK.lit * (1 - p)) };
                tail = { d: tailD(r, r.len - lay.tail * (1 - p), r.len, X), opacity: r1(INK.tail * (1 - p)) };
            }
        }
        out.dots.push(dot);
        out.tails.push(tail);
    }
    // The focal event: its whole path at 1.5 px, a Volt dot, one mono label.
    for (const f of w.focals) {
        if (t < f.tLight || t >= f.tLand + 1.6)
            continue;
        const r = f.route;
        const draw = ease(seg(t, f.tLight, f.tLight + 0.56));
        const fade = 1 - seg(t, f.tLand, f.tLand + D4);
        if (t < f.tLand + D4)
            out.route = {
                d: tailD(r, 0, r.len, X), opacity: r1(fade), "stroke-dasharray": `${r1(r.len)} ${r1(r.len + 4)}`, "stroke-dashoffset": r1(r.len * (1 - draw)),
            };
        let p = r.S;
        let op = ease(seg(t, f.tLight, f.tLight + D3));
        if (t >= f.tGo)
            p = at(r, sine(seg(t, f.tGo, f.tLand)) * r.len);
        if (t >= f.tLand)
            op = 1 - seg(t, f.tLand, f.tLand + D2);
        if (op > 0)
            out.fdot = { transform: `translate(${r1(X(p[0]))} ${r1(p[1])})`, opacity: r1(op) };
        const lIn = ease(seg(t, f.tLight, f.tLight + D3));
        const lOut = seg(t, f.tGo + 0.55, f.tGo + 0.55 + D3);
        const lo = lIn * (1 - lOut);
        if (lo > 0) {
            const flip = r.S[0] + 22 + charW(f.label) > lay.W - 12;
            const sx = flip ? -1 : 1;
            out.flabel = { opacity: r1(lo), text: f.label, transform: `translate(${r1(X(r.S[0] + sx * 22))} ${r.S[1] + 4})`, "text-anchor": (sx === 1) !== rtl ? "start" : "end" };
            out.flead = { d: `M${r1(X(r.S[0] + sx * 6))} ${r.S[1] + 0.5}H${r1(X(r.S[0] + sx * 18))}`, opacity: r1(lo) };
        }
        if (f.block >= 0 && t >= f.tLand) {
            const b = w.blocks[f.block];
            const vo = 1 - sine(seg(t, f.tLand + 0.5, f.tLand + 1.3));
            if (vo > 0)
                out.overlay = { x: rtl ? lay.W - b.x - b.w : b.x, y: b.y, width: b.w, height: b.h, opacity: r1(vo) };
        }
    }
    // The booking waits on the line under Thursday; the reminder goes out from it.
    const book = w.focals[1];
    if (t >= book.tLand && t < T.remind + 1.9) {
        const inn = ease(seg(t, book.tLand, book.tLand + D3));
        const gone = seg(t, T.remind + 1.4, T.remind + 1.4 + D4);
        const volt = seg(t, T.remind, T.remind + D2) * (1 - gone);
        out.ring = { opacity: r1(inn * (1 - gone)), "fill-opacity": 1, "data-v": r1(volt), fill: volt > 0.5 ? C.volt : C.canvas };
        if (t >= T.remind) {
            const up = ease(seg(t, T.remind + 0.1, T.remind + 0.1 + D3));
            const rx = w.ring[0];
            const top = lay.base - 9 - 48 * up;
            out.remind = { d: `M${r1(X(rx))} ${lay.base - 9}V${r1(top)}`, opacity: r1(1 - gone) };
            const lo = up * (1 - seg(t, T.remind + 1.2, T.remind + 1.2 + D3));
            if (lo > 0) {
                const lab = WORDS.en.remind;
                const flip = rx + 22 + charW(lab) > lay.W - 12;
                const sx = flip ? -1 : 1;
                const ly = lay.base - 57;
                out.flabel = { opacity: r1(lo), text: lab, transform: `translate(${r1(X(rx + sx * 22))} ${ly + 4})`, "text-anchor": (sx === 1) !== rtl ? "start" : "end" };
                out.flead = { d: `M${r1(X(rx + sx * 4))} ${ly + 0.5}H${r1(X(rx + sx * 18))}`, opacity: r1(lo) };
            }
        }
    }
    // Today's mark and the week's line.
    const zl = w.focals[3].tLand;
    const capOn = ease(seg(t, zl + 0.3, zl + 0.3 + D3)) * (1 - seg(t, T.reset, T.reset + D3));
    if (capOn > 0)
        out.cap = { opacity: r1(capOn) };
    const sIn = ease(seg(t, T.sum, T.sum + D4));
    const sOut = seg(t, T.reset, T.reset + D4);
    if (sIn > 0 && sOut < 1)
        out.sum = { opacity: r1(sIn * (1 - sOut)), transform: `translate(${r1(dir * TRAVEL * (1 - sIn))} ${r1(-TRAVEL * (1 - sIn))})` };
    return out;
}
function put(el, a) {
    if (!el)
        return;
    const c = el.__c || (el.__c = {});
    for (const k in a) {
        const v = String(a[k]);
        if (c[k] === v)
            continue;
        c[k] = v;
        if (k === "text")
            el.textContent = v;
        else
            el.setAttribute(k, v);
    }
}
const toProps = (a) => {
    const p = {};
    for (const k in a) {
        if (k === "text")
            continue;
        p[k.startsWith("data-") ? k : k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = a[k];
    }
    return p;
};
let counter = 0;
/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function BgSignal(props) {
    const { mode = "auto", dir = "ltr", at: atProp = -1, inset = 48, style } = props;
    const rtl = dir === "rtl";
    const w0 = WORDS.en;
    const pauseWord = props.pauseWord || w0.pause;
    const playWord = props.playWord || w0.play;
    const pauseName = props.pauseName || w0.pauseName;
    const playName = props.playName || w0.playName;
    const isCanvas = RenderTarget.current() === RenderTarget.canvas;
    const ref = useRef(null);
    const svgRef = useRef(null);
    const [uid] = useState(() => `sg${(counter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`);
    const [boxW, setBoxW] = useState(0);
    const [reduce, setReduce] = useState(false);
    const [userPaused, setUserPaused] = useState(false);
    const [away, setAway] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        const measure = () => setBoxW(el.clientWidth);
        measure();
        if (typeof ResizeObserver === "undefined")
            return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia)
            return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const on = () => setReduce(mq.matches);
        on();
        mq.addEventListener?.("change", on);
        return () => mq.removeEventListener?.("change", on);
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined")
            return;
        let off = false;
        let hidden = typeof document !== "undefined" && document.hidden;
        const io = new IntersectionObserver((entries) => {
            off = !entries[0].isIntersecting;
            setAway(off || hidden);
        });
        io.observe(el);
        const vis = () => {
            hidden = document.hidden;
            setAway(off || hidden);
        };
        document.addEventListener("visibilitychange", vis);
        return () => {
            io.disconnect();
            document.removeEventListener("visibilitychange", vis);
        };
    }, []);
    const m = mode !== "auto" ? mode : boxW && boxW < 640 ? "phone" : boxW && boxW < 1300 ? "mid" : "wide";
    const lay = useMemo(() => layout(m), [m]);
    const world = useMemo(() => build(lay), [lay]);
    const staticFrame = isCanvas || reduce;
    const frozen = atProp >= 0 && !staticFrame;
    const paused = staticFrame || frozen || userPaused || away;
    const t0 = staticFrame ? STILL : frozen ? atProp : 0;
    const first = useMemo(() => frame(lay, world, t0, rtl), [lay, world, t0, rtl]);
    const clock = useRef(0);
    // The loop: one requestAnimationFrame, writing only what changed; time stands still while paused.
    useEffect(() => {
        if (paused)
            return;
        const svg = svgRef.current;
        if (!svg)
            return;
        const q = (s) => Array.from(svg.querySelectorAll(`[data-k="${s}"]`));
        const els = {
            blocks: q("b"), under: q("u"), labels: q("l"), tails: q("t"), dots: q("d"), amb: q("a"),
            overlay: q("ov")[0], cap: q("cap")[0], ring: q("ring")[0], remind: q("rm")[0], route: q("rt")[0], fdot: q("fd")[0], flabel: q("fl")[0], flead: q("fle")[0], sum: q("sum")[0],
        };
        let raf = 0;
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            clock.current = (clock.current + dt) % L;
            const F = frame(lay, world, clock.current, rtl);
            F.blocks.forEach((a, i) => put(els.blocks[i], a));
            F.under.forEach((a, i) => put(els.under[i], a));
            F.labels.forEach((a, i) => put(els.labels[i], a));
            F.tails.forEach((a, i) => put(els.tails[i], a));
            F.dots.forEach((a, i) => put(els.dots[i], a));
            F.amb.forEach((a, i) => put(els.amb[i], a));
            put(els.overlay, F.overlay);
            put(els.cap, F.cap);
            put(els.ring, F.ring);
            put(els.remind, F.remind);
            put(els.route, F.route);
            put(els.fdot, F.fdot);
            put(els.flabel, F.flabel);
            put(els.flead, F.flead);
            put(els.sum, F.sum);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [paused, lay, world, rtl]);
    const X = (x) => (rtl ? lay.W - x : x);
    const F = first;
    const capB = world.blocks[world.blocks.length - 1];
    const ta = (a) => (a === "middle" ? a : (a === "start") !== rtl ? "start" : "end");
    const label = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", fill: C.faint };
    const phone = m === "phone";
    const svgStyle = phone
        ? { position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 520, height: "100%", overflow: "visible" }
        : { position: "absolute", bottom: 0, [rtl ? "left" : "right"]: 0, width: lay.W, height: lay.H, overflow: "visible" };
    // The art computes every mirrored x and anchor itself, so its (Latin) labels stay left to right.
    svgStyle.direction = "ltr";
    const sheet = `.${uid} button:hover{color:${C.ink}!important}.${uid} button:focus-visible{outline:2px solid ${C.focus};outline-offset:2px}.${uid} [data-k="l"]{transition:fill .37s}`;
    const glyph = (on) => on
        ? { width: 0, height: 0, borderTop: "5.4px solid transparent", borderBottom: "5.4px solid transparent", borderInlineStart: "9.3px solid currentColor" }
        : { width: 10, height: 10, borderInlineStart: "3px solid currentColor", borderInlineEnd: "3px solid currentColor", boxSizing: "border-box" };
    const sumX = phone ? 20 : world.x0;
    const legX = phone ? 20 : world.x0;
    const capX = phone ? 20 : world.x1;
    return (React.createElement("div", { ref: ref, "data-sg": "", className: uid, dir: rtl ? "rtl" : "ltr", style: { width: "100%", height: "100%", ...style, position: "relative", overflow: "hidden" } },
        React.createElement("style", null, sheet),
        React.createElement("svg", { ref: svgRef, "aria-hidden": "true", focusable: "false", viewBox: `0 0 ${lay.W} ${lay.H}`, preserveAspectRatio: "xMidYMax meet", style: svgStyle },
            React.createElement("g", { fill: "none", stroke: C.ink, strokeWidth: 2, strokeLinecap: "round" }, world.levels.map((d, i) => (d ? React.createElement("path", { key: i, d: d, strokeOpacity: INK.field[i], transform: rtl ? `translate(${lay.W} 0) scale(-1 1)` : undefined }) : null))),
            React.createElement("g", { shapeRendering: "crispEdges" },
                world.ghosts.map((g, i) => (React.createElement("rect", { key: i, x: rtl ? lay.W - g.x - g.w : g.x, y: g.y, width: g.w, height: g.h, fill: C.ink, fillOpacity: INK.ghost }))),
                F.under.map((a, i) => (React.createElement("rect", { key: i, "data-k": "u", fill: C.canvas, ...toProps(a) }))),
                React.createElement("g", { fill: C.ink, fillOpacity: INK.block }, world.blocks.map((b, i) => (React.createElement("rect", { key: i, "data-k": "b", x: rtl ? lay.W - b.x - b.w : b.x, y: b.y, width: b.w, height: b.h, ...toProps(F.blocks[i]) })))),
                React.createElement("rect", { "data-k": "ov", "data-volt": "block", fill: C.volt, ...toProps(F.overlay) }),
                React.createElement("rect", { "data-k": "cap", "data-volt": "today", x: rtl ? lay.W - capB.x - capB.w : capB.x, y: capB.y, width: capB.w, height: 3, fill: C.volt, ...toProps(F.cap) }),
                React.createElement("path", { d: `M${X(world.x0)} ${lay.base + 0.5}H${X(world.x1)}`, stroke: C.ink, strokeOpacity: INK.base, strokeWidth: 1 })),
            React.createElement("g", { style: label, textAnchor: "middle" }, WEEK.map((d, i) => (React.createElement("text", { key: d.key, "data-k": "l", x: X(lay.cols[i] - P / 2), y: lay.labelY, ...toProps(F.labels[i]) }, d.key)))),
            React.createElement("path", { "data-k": "rm", fill: "none", stroke: C.strong, strokeWidth: 1, ...toProps(F.remind) }),
            React.createElement("circle", { "data-k": "ring", "data-volt": "ring", cx: X(world.ring[0]), cy: world.ring[1], r: 3.5, stroke: C.strong, strokeWidth: 1, ...toProps(F.ring) }),
            React.createElement("g", { fill: "none", stroke: C.ink, strokeWidth: 1 }, F.tails.map((a, i) => (React.createElement("path", { key: i, "data-k": "t", ...toProps(a) })))),
            React.createElement("g", { fill: C.ink },
                F.amb.map((a, i) => (React.createElement("circle", { key: i, "data-k": "a", cx: 0, cy: 0, r: 1, ...toProps(a) }))),
                F.dots.map((a, i) => (React.createElement("circle", { key: i, "data-k": "d", cx: 0, cy: 0, r: 1, ...toProps(a) })))),
            React.createElement("path", { "data-k": "rt", fill: "none", stroke: C.strong, strokeWidth: 1.5, strokeLinejoin: "miter", ...toProps(F.route) }),
            React.createElement("g", { "data-k": "fd", "data-volt": "dot", ...toProps(F.fdot) },
                React.createElement("circle", { r: 3.5, fill: C.volt, stroke: C.ink, strokeWidth: 1 })),
            React.createElement("path", { "data-k": "fle", fill: "none", stroke: C.strong, strokeWidth: 1, ...toProps(F.flead) }),
            React.createElement("text", { "data-k": "fl", style: { ...label, fill: C.muted, stroke: C.canvas, strokeWidth: 4, strokeLinejoin: "round", paintOrder: "stroke" }, ...toProps(F.flabel) }, String(F.flabel.text || "")),
            React.createElement("g", { "data-k": "sum", ...toProps(F.sum) },
                React.createElement("text", { x: X(sumX), y: lay.sumY, textAnchor: ta("start"), style: { fontFamily: SANS, fontSize: lay.sumSize, fill: C.ink, fontVariantNumeric: "tabular-nums" } },
                    React.createElement("tspan", null, w0.sum[0]),
                    React.createElement("tspan", { fontWeight: 600 }, w0.sum[1]))),
            React.createElement("g", { style: label },
                React.createElement("rect", { x: rtl ? lay.W - legX - 8 : legX, y: lay.legY - 8, width: 8, height: 8, fill: C.ink, fillOpacity: INK.block, shapeRendering: "crispEdges" }),
                React.createElement("text", { x: X(legX + 14), y: lay.legY, textAnchor: ta("start") }, w0.block),
                React.createElement("rect", { x: rtl ? lay.W - (legX + 32 + charW(w0.block)) - 8 : legX + 32 + charW(w0.block), y: lay.legY - 8, width: 8, height: 8, fill: C.ink, fillOpacity: INK.ghost, shapeRendering: "crispEdges" }),
                React.createElement("text", { x: X(legX + 46 + charW(w0.block)), y: lay.legY, textAnchor: ta("start") }, w0.last),
                React.createElement("text", { x: X(capX), y: phone ? lay.capY : lay.sumY, textAnchor: ta(phone ? "start" : "end") }, w0.fictional))),
        React.createElement("button", { type: "button", "aria-label": userPaused ? playName : pauseName, "aria-pressed": userPaused, hidden: staticFrame || frozen, onClick: () => setUserPaused((v) => !v), style: {
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
                ...(phone ? { insetInlineStart: 4, top: 0 } : { insetInlineStart: inset - 12, bottom: 36 }),
            } },
            React.createElement("span", { "aria-hidden": "true", style: glyph(userPaused) }),
            React.createElement("span", null, userPaused ? playWord : pauseWord))));
}
addPropertyControls(BgSignal, {
    mode: { type: ControlType.Enum, title: "Layout", options: ["auto", "wide", "mid", "phone"], optionTitles: ["Auto", "1440", "1024", "Phone"], defaultValue: "auto" },
    dir: { type: ControlType.Enum, title: "Direction", options: ["ltr", "rtl"], optionTitles: ["Left to right", "Right to left"], defaultValue: "ltr" },
    at: { type: ControlType.Number, title: "Still at (s)", min: -1, max: 30, step: 0.1, defaultValue: -1, description: "-1 plays the loop" },
    inset: { type: ControlType.Number, title: "Gutter", min: 0, max: 96, step: 1, defaultValue: 48 },
    pauseWord: { type: ControlType.String, title: "Pause", defaultValue: "" },
    playWord: { type: ControlType.String, title: "Play", defaultValue: "" },
    pauseName: { type: ControlType.String, title: "Pause name", defaultValue: "" },
    playName: { type: ControlType.String, title: "Play name", defaultValue: "" },
});
