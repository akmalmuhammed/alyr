// A small headless-Edge driver over the DevTools protocol, with no packages: Node 22's own
// WebSocket and fetch. It is what scripts/order-page-browser-check.mjs stands on (the
// Catalog's own check, scripts/catalog-browser-check.mjs, carries its own copy of the same
// ideas). Keep profile and output folders short: Edge fails quietly with long paths.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

export async function launch({ edge, port, profile, width = 375, height = 812, scheme = "light" }) {
  mkdirSync(profile, { recursive: true });
  // A debugging port that something already answers on is somebody else's browser (another
  // session's run): never drive it. Pick another port.
  const taken = await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false);
  if (taken) throw new Error(`port ${port} already has a browser on it; it is not ours, so use --port with a free one`);
  const proc = spawn(edge, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let page = null;
  for (let i = 0; i < 80 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === "page"); } catch { /* not up yet */ }
    if (!page) await sleep(250);
  }
  if (!page || proc.exitCode !== null) throw new Error("the browser did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let counter = 0;
  const waiting = new Map();
  const heard = new Map();
  const problems = [];
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    if (m.id && waiting.has(m.id)) {
      const { resolve, reject } = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
    } else if (m.method) {
      for (const fn of heard.get(m.method) ?? []) fn(m.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => heard.set(method, [...(heard.get(method) ?? []), fn]);
  on("Runtime.exceptionThrown", (p) => problems.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`));
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") problems.push(`console: ${p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)}`); });
  await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("Network.enable");

  const b = {
    send, on, problems, sleep, scheme,
    close: async () => { try { await send("Browser.close"); } catch { /* gone */ } ws.close(); proc.kill(); },
    async view(w, h, mobile = true, nextScheme = scheme) {
      b.scheme = nextScheme;
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
      await send("Emulation.setEmulatedMedia", { features: [
        { name: "prefers-color-scheme", value: nextScheme }, { name: "prefers-reduced-motion", value: "reduce" },
      ] });
    },
    async js(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async until(expression, what, timeout = 20000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try { if (await b.js(expression)) return; } catch { /* the page is changing */ }
        await sleep(100);
      }
      throw new Error(`timed out: ${what}`);
    },
    async go(url, wait = 600) {
      const loaded = new Promise((resolve) => on("Page.loadEventFired", resolve));
      await send("Page.navigate", { url });
      await Promise.race([loaded, sleep(30000)]);
      await sleep(wait);
      await b.js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
    },
    async shot(path) {
      await b.js("document.querySelectorAll('nextjs-portal').forEach(n => n.remove())");
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path, Buffer.from(r.data, "base64"));
    },
    /** Press the middle of an element like a thumb would, once it has stopped moving. */
    async click(find, wait = 250) {
      const probe = `(() => { const el = (${find}); if (!el) return null; const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const top = document.elementFromPoint(cx, cy); const v = visualViewport; return { hit: !!top && (el === top || el.contains(top) || top.contains(el)), x: (cx - v.offsetLeft) * v.scale, y: (cy - v.offsetTop) * v.scale, cover: top ? top.tagName + '.' + String(top.className).slice(0, 40) : null }; })()`;
      await b.js("(() => { const a = document.activeElement; if (a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur(); })()");
      let last = null;
      for (let i = 0; i < 14; i++) {
        const found = await b.js(`(() => { const el = (${find}); if (!el) return false; el.scrollIntoView({block:'center', inline:'nearest'}); return true; })()`);
        if (!found) throw new Error(`nothing to press: ${find}`);
        await sleep(90);
        const now = await b.js(probe);
        if (now && now.hit && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) { last = now; break; }
        last = now;
        if (i === 13) throw new Error(`could not get a clear press on: ${find} (on top: ${last && last.cover})`);
      }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: last.x, y: last.y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: last.x, y: last.y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last.x, y: last.y, button: "left", clickCount: 1 });
      await sleep(wait);
    },
    async key(key, code = key, windowsVirtualKeyCode = 0) {
      // Enter and the space bar carry their character, which is what presses a button.
      const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
      await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode, text });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    },
    async type(text) { await send("Input.insertText", { text }); },
    async clearFocused() {
      await b.js(`(() => { const el = document.activeElement; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    },
    async axe(axePath, scope = null, exclude = []) {
      if (!axePath || !existsSync(axePath)) return null;
      await b.js(readFileSync(axePath, "utf8"));
      const context = scope ? JSON.stringify(scope) : exclude.length ? JSON.stringify({ exclude: exclude.map((x) => [x]) }) : "document";
      return b.js(`axe.run(${context}, { runOnly: ['wcag2a','wcag2aa','wcag21aa','best-practice'], resultTypes: ['violations'] }).then(r => r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, nodes: v.nodes.slice(0, 6).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 160), why: (n.any[0] || n.all[0] || n.none[0] || {}).message })) })))`);
    },
  };
  await b.view(width, height, true, scheme);
  return b;
}
