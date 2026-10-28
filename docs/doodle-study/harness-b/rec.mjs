// Record or time the harness in headless Edge over CDP. Usage:
//   node rec.mjs <url> <w> <h> <mode: record|timing|pause> <out> [--scheme=dark] [--secs=25] [--profile=C:/t/dkrec]
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { createServer } from "node:net"
const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith("--"))
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=")
const [url, W, H, mode, out] = pos
const scheme = opt("scheme", "light")
const secs = Number(opt("secs", "25"))
const profile = opt("profile", "C:/t/dkrec")
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
  // Sample, without screenshots, when each Volt mark lights, when the tip shows and moves, and the shutters.
  const res = await ev(`new Promise((done) => {
    const root = document.querySelector('[data-dk]'); const t0 = performance.now(); const log = []; const seen = {};
    const volts = [...root.querySelectorAll('path[stroke*="wnKZyblTz"], circle')];
    const tip = root.querySelector('circle').parentNode.parentNode;
    const shut = root.querySelector('g[clip-path] > g');
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      let on = 0;
      volts.forEach((el, i) => { const o = +getComputedStyle(el.closest('g[class]') && el.tagName==='circle' ? tip : el).opacity; const vis = o > 0.5; if (el.tagName !== 'circle' && vis) on++; const k = 'v' + i; if (vis !== !!seen[k]) { seen[k] = vis; log.push([+t.toFixed(2), k, vis ? 'on' : 'off']) } });
      const sy = new DOMMatrix(getComputedStyle(shut).transform).f; const up = sy < -100; if (up !== !!seen.sh) { seen.sh = up; log.push([+t.toFixed(2), 'shutter', up ? 'up' : 'down']) }
      if (on > (seen.max || 0)) seen.max = on;
      if (t < ${secs}) requestAnimationFrame(tick); else done({ log, maxVoltAtOnce: seen.max });
    }; tick();
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log("max Volt marks at once:", res?.maxVoltAtOnce, "events", res?.log?.length)
} else if (mode === "count") {
  console.log(JSON.stringify(await ev(`({ paths: document.querySelectorAll("[data-dk] path").length, boil: document.querySelectorAll("[data-dk] path[class*=b0],[data-dk] path[class*=b1],[data-dk] path[class*=b2]").length })`)))
} else if (mode === "pause") {
  // Press Pause at 8 s, read the tip's position, wait 4 s, read again, press Play, wait 2 s, read again.
  const res = await ev(`new Promise(async (done) => {
    const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const root = document.querySelector('[data-dk]');
    const tipPos = () => getComputedStyle(root.querySelector('circle').parentNode).transform;
    await sl(${opt("at", "6000")}); const btn = root.querySelector('button'); btn.click(); await sl(100);
    const a = tipPos(); const label1 = btn.getAttribute('aria-label'); await sl(4000); const b = tipPos();
    btn.click(); await sl(2000); const c = tipPos();
    window.scrollTo(0, 3000); await sl(300); const d1 = tipPos(); await sl(3000); const d2 = tipPos(); window.scrollTo(0, 0); await sl(1500); const e = tipPos();
    done({ label1, label2: btn.getAttribute('aria-label'), pausedSame: a === b, playedMoved: b !== c, offscreenSame: d1 === d2, backMoved: d2 !== e, a, b, c, d1, d2, e });
  })`)
  writeFileSync(out, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res))
}
ws.close(); try { br.kill() } catch {}
try { execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -and $_.CommandLine.Contains('${profile}') } | % { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }) } catch {}
process.exit(0)
