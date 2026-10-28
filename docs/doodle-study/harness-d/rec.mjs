// Record or time the harness in headless Edge over CDP. Usage:
//   node rec.mjs <url> <w> <h> <mode: record|timing|pause> <out> [--scheme=dark] [--secs=38] [--profile=C:/t/bgD]
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith("--"))
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=")
const [url, W, H, mode, out] = pos
const scheme = opt("scheme", "light")
const secs = Number(opt("secs", "25"))
const profile = opt("profile", "C:/t/bgD")
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)) }) })
const port = await freePort()
mkdirSync(profile, { recursive: true })
const br = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "about:blank"], { stdio: "ignore", windowsHide: true })
let list
for (let i = 0; i < 80; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break } catch { await sleep(250) } }
const page = list.find((t) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r))
let id = 0; const pend = new Map(); const lis = new Set()
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id) } else if (m.method) lis.forEach((l) => l(m)) })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Page.enable"); await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 768 })
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] })
await send("Page.navigate", { url })
await sleep(2500)
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value
if (mode === "record") {
  mkdirSync(out, { recursive: true })
  const frames = []
  lis.add((m) => { if (m.method === "Page.screencastFrame") { frames.push({ data: m.params.data, t: m.params.metadata.timestamp }); send("Page.screencastFrameAck", { sessionId: m.params.sessionId }) } })
  await ev(`window.__bgx && window.__bgx.seek(${Number(opt("from", "0"))})`)
  await send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 })
  await sleep(secs * 1000)
  await send("Page.stopScreencast")
  frames.forEach((f, i) => writeFileSync(`${out}/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64")))
  let concat = ""
  frames.forEach((f, i) => { const d = i < frames.length - 1 ? frames[i + 1].t - f.t : 0.05; concat += `file 'f${String(i).padStart(5, "0")}.jpg'\nduration ${d.toFixed(4)}\n` })
  writeFileSync(`${out}/list.txt`, concat)
  console.log("frames", frames.length, "span", (frames.at(-1).t - frames[0].t).toFixed(2))
} else if (mode === "timing") {
  // Sample every frame, with no screenshots: the film's clock, the Volt marks lit at once (opacity
  // through every ancestor, inside the viewport), when each caption shows, and the frame times.
  const res = await ev(`new Promise((done) => {
    const root = document.querySelector('[data-bgx]'); const t0 = performance.now(); const log = []; const seen = {};
    const volts = [...root.querySelectorAll('[data-volt]')]; const caps = [...root.querySelectorAll('[data-k^="cap:"]')].filter((e) => e.dataset.k.split(':').length === 2);
    const eff = (el) => { let o = 1; for (let n = el; n && n !== root; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o };
    const vw = innerWidth, vh = innerHeight; let max = 0, last = performance.now(); const dts = []; const over = [];
    const tick = () => {
      const now = performance.now(); dts.push(now - last); last = now;
      const t = (now - t0) / 1000; const ft = window.__bgx.time();
      let on = 0; const lit = [];
      volts.forEach((el) => { const r = el.getBoundingClientRect(); const vis = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh && r.width > 0; const o = vis ? eff(el) : 0; if (o > 0.15) { on++; lit.push(el.dataset.k) } const k = el.dataset.k; const v = o > 0.15; if (v !== !!seen[k]) { seen[k] = v; log.push([+ft.toFixed(2), k, v ? 'on' : 'off', +o.toFixed(2)]) } });
      if (on > max) max = on; if (on > 2) over.push([+ft.toFixed(2), lit.join(' ')]);
      caps.forEach((el) => { const k = el.dataset.k; const v = +getComputedStyle(el).opacity > 0.5; if (v !== !!seen[k]) { seen[k] = v; log.push([+ft.toFixed(2), k, v ? 'show' : 'hide']) } });
      if (t < ${secs}) requestAnimationFrame(tick); else { dts.sort((a, b) => a - b); done({ maxVoltAtOnce: max, overTwo: over.slice(0, 20), frameMs: { median: +dts[dts.length >> 1].toFixed(1), p95: +dts[Math.floor(dts.length * 0.95)].toFixed(1), max: +dts[dts.length - 1].toFixed(1) }, log }) }
    }; requestAnimationFrame(tick);
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log("max Volt marks at once:", res?.maxVoltAtOnce, "over two:", res?.overTwo?.length, "frames", JSON.stringify(res?.frameMs))
} else if (mode === "frames") {
  // Frame by frame: hold the film on each 1/fps second and capture it, so the loop is exact.
  mkdirSync(out, { recursive: true })
  const fps = Number(opt("fps", "30"))
  const n = Math.round(Number(opt("len", "36")) * fps)
  for (let k = 0; k < n; k++) {
    await ev(`new Promise((r) => { window.__bgx.frame(${k / fps}); requestAnimationFrame(() => requestAnimationFrame(r)) })`)
    const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 })
    writeFileSync(`${out}/f${String(k).padStart(5, "0")}.jpg`, Buffer.from(shot.data, "base64"))
  }
  console.log("frames", n)
} else if (mode === "hidden") {
  // A hidden tab, simulated: document.hidden flips and visibilitychange fires (headless Edge keeps the page visible).
  const res = await ev(`new Promise(async (done) => {
    const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const T = () => window.__bgx.time();
    const a = T(); await sl(1000); const b = T();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); await sl(300);
    const c = T(); await sl(2000); const d = T();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); await sl(1500); const e = T();
    done({ runs: b - a > 0.8, heldWhileHidden: Math.abs(d - c) < 0.02, movesAgain: e - d > 1, a, b, c, d, e });
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res))
} else if (mode === "pause") {
  // Press Pause at --at ms, check the clock holds for 3 s, press Play, check it moves; then scroll
  // away (needs &tall=1), check it holds off screen, scroll back, check it moves again.
  const res = await ev(`new Promise(async (done) => {
    const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const root = document.querySelector('[data-bgx]'); const T = () => window.__bgx.time();
    await sl(${opt("at", "6000")}); const btn = root.querySelector('button'); btn.click(); await sl(150);
    const a = T(); const label1 = btn.getAttribute('aria-label'); await sl(3000); const b = T();
    btn.click(); await sl(1500); const c = T(); const label2 = btn.getAttribute('aria-label');
    window.scrollTo(0, 3000); await sl(400); const d1 = T(); await sl(3000); const d2 = T(); window.scrollTo(0, 0); await sl(1500); const e = T();
    done({ label1, label2, pausedHeld: Math.abs(a - b) < 0.02, playedMoved: c - b > 1, offscreenHeld: Math.abs(d1 - d2) < 0.02, backMoved: e - d2 > 1, a, b, c, d1, d2, e });
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res))
}
ws.close(); try { br.kill() } catch {}
try { execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -and $_.CommandLine.Contains('${profile}') } | % { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }) } catch {}
process.exit(0)
