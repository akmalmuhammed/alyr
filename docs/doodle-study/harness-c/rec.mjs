// Record or time the harness in headless Edge over CDP. Usage:
//   node rec.mjs <url> <w> <h> <mode: record|timing|pause> <out> [--scheme=dark] [--secs=25] [--profile=C:/t/bgC]
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith("--"))
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=")
const [url, W, H, mode, out] = pos
const scheme = opt("scheme", "light")
const secs = Number(opt("secs", "25"))
const profile = opt("profile", "C:/t/bgC")
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
  await send("Page.startScreencast", { format: "jpeg", quality: 88, everyNthFrame: 1 })
  await sleep(secs * 1000)
  await send("Page.stopScreencast")
  frames.forEach((f, i) => writeFileSync(`${out}/f${String(i).padStart(5, "0")}.jpg`, Buffer.from(f.data, "base64")))
  let concat = ""
  frames.forEach((f, i) => { const d = i < frames.length - 1 ? frames[i + 1].t - f.t : 0.05; concat += `file 'f${String(i).padStart(5, "0")}.jpg'\nduration ${d.toFixed(4)}\n` })
  writeFileSync(`${out}/list.txt`, concat)
  console.log("frames", frames.length, "span", (frames.at(-1).t - frames[0].t).toFixed(2))
} else if (mode === "timing") {
  // Sample every frame, without screenshots: Volt marks on screen, blocks shown, the focal label, the week's line.
  const res = await ev(`new Promise((done) => {
    const root = document.querySelector('[data-sg]'); const t0 = performance.now(); const log = []; const seen = {};
    const vis = (el) => { let o = 1; for (let n = el; n && n !== root; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o };
    const volts = [...root.querySelectorAll('[data-volt]')];
    const blocks = [...root.querySelectorAll('[data-k="b"]')];
    const lab = root.querySelector('[data-k="fl"]'); const sum = root.querySelector('[data-k="sum"]');
    let maxVolt = 0, maxBlocks = 0, maxMovers = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      let on = 0; const names = [];
      volts.forEach((el) => { const k = el.getAttribute('data-volt'); let v = vis(el) > 0.3; if (k === 'ring') v = v && el.getAttribute('fill')?.includes('wnKZyblTz'); if (v) { on++; names.push(k) } });
      const nb = blocks.filter((b) => vis(b) > 0.5).length;
      const nm = [...root.querySelectorAll('[data-k="d"]')].filter((d) => vis(d) > 0.3).length;
      maxVolt = Math.max(maxVolt, on); maxBlocks = Math.max(maxBlocks, nb); maxMovers = Math.max(maxMovers, nm);
      const key = names.join('+') || 'none'; if (key !== seen.v) { seen.v = key; log.push([+t.toFixed(2), 'volt', key]) }
      const lt = vis(lab) > 0.3 ? lab.textContent : ''; if (lt !== seen.l) { seen.l = lt; log.push([+t.toFixed(2), 'label', lt || '-']) }
      const sv = vis(sum) > 0.5; if (sv !== !!seen.s) { seen.s = sv; log.push([+t.toFixed(2), 'sum', sv ? 'on' : 'off', 'blocks ' + nb]) }
      if (Math.floor(t) !== seen.sec) { seen.sec = Math.floor(t); log.push([+t.toFixed(2), 'blocks', nb, 'movers', nm]) }
      if (t < ${secs}) requestAnimationFrame(tick); else done({ maxVolt, maxBlocks, maxMovers, log });
    }; tick();
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log("max Volt at once:", res?.maxVolt, "max blocks:", res?.maxBlocks, "max movers:", res?.maxMovers)
} else if (mode === "count") {
  console.log(JSON.stringify(await ev(`({ svgNodes: document.querySelectorAll("[data-sg] svg *").length, fieldDots: [...document.querySelectorAll("[data-sg] svg > g:first-child path")].reduce((n, p) => n + (p.getAttribute("d").match(/M/g) || []).length, 0), blocks: document.querySelectorAll('[data-sg] [data-k="b"]').length, scrollW: document.documentElement.scrollWidth })`)))
} else if (mode === "pause") {
  // Press Pause at --at ms, read the clock's trace (the block count and the movers), wait 4 s, read again; Play; off screen.
  const res = await ev(`new Promise(async (done) => {
    const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const root = document.querySelector('[data-sg]');
    const snap = () => [...root.querySelectorAll('[data-k="d"],[data-k="b"],[data-k="fd"]')].map((n) => (n.getAttribute('transform') || '') + (n.getAttribute('opacity') || '')).join('|');
    await sl(${opt("at", "6000")}); const btn = root.querySelector('button'); btn.click(); await sl(100);
    const a = snap(); const label1 = btn.getAttribute('aria-label'); await sl(4000); const b = snap();
    btn.click(); await sl(2000); const c = snap();
    window.scrollTo(0, 3000); await sl(300); const d1 = snap(); await sl(3000); const d2 = snap(); window.scrollTo(0, 0); await sl(1500); const e = snap();
    done({ label1, label2: btn.getAttribute('aria-label'), pausedSame: a === b, playedMoved: b !== c, offscreenSame: d1 === d2, backMoved: d2 !== e });
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res))
}
ws.close(); try { br.kill() } catch {}
try { execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -and $_.CommandLine.Contains('${profile}') } | % { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }) } catch {}
process.exit(0)
