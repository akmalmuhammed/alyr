// Evaluate one expression in the harness page (headless Edge, CDP). No screenshots.
//   node eval.mjs <url> <w> <h> "<expression>" [--wait=2500] [--scheme=light] [--profile=C:/t/bgB]
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { createServer } from "node:net"
const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith("--"))
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=").slice(1).join("=")
const [url, W, H, expr] = pos
const profile = opt("profile", "C:/t/bgB")
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const port = await new Promise((r) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)) }) })
mkdirSync(profile, { recursive: true })
const extra = opt("reduced", "") ? [] : []
const br = spawn(edge, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-extensions", "--hide-scrollbars", "about:blank"], { stdio: "ignore", windowsHide: true })
let list
for (let i = 0; i < 80; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break } catch { await sleep(250) } }
const page = list.find((t) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r))
let id = 0; const pend = new Map()
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error); pend.delete(m.id) } })
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Page.enable"); await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 768 })
const feats = [{ name: "prefers-color-scheme", value: opt("scheme", "light") }]
if (opt("reduced", "")) feats.push({ name: "prefers-reduced-motion", value: "reduce" })
await send("Emulation.setEmulatedMedia", { features: feats })
await send("Page.navigate", { url })
await sleep(Number(opt("wait", "2500")))
const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
console.log(JSON.stringify(r.result?.value ?? r, null, 1))
ws.close(); try { br.kill() } catch {}
try { execFileSync("powershell.exe", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? { $_.CommandLine -and $_.CommandLine.Contains('${profile}') } | % { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }`], { stdio: "ignore", timeout: 20000 }) } catch {}
process.exit(0)
