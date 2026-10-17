// Screenshot a page with headless Microsoft Edge over the DevTools protocol.
// Node 22 or later (built-in fetch and WebSocket); no packages to install.
//
//   node shoot.mjs <url> <width> <height> <out.png> [--full] [options]
//
//   node shoot.mjs https://alyr.qa 1440 900 home-en-1440-full.png --full
//   node shoot.mjs http://localhost:3101/ar 390 844 home-ar-390.png
//
// Options
//   --full              the whole page, not just the first screen
//   --wait=4000         milliseconds to wait after loading, for the hero animation to finish
//   --scale=1           device pixel ratio (lowered automatically if a full page would be too tall)
//   --mobile            phone emulation (viewport meta, touch). On by default below 768 px wide
//   --scheme=dark       prefers-color-scheme: light or dark
//   --reduced-motion    prefers-reduced-motion: reduce (to check the still version of the page)
//   --as-scrolled       on a full page, leave scroll-driven text as it is at the top of the page.
//                       By default a full page shows every section as it looks once read: the
//                       site's [data-reveal] sections arrived and its [data-statement] words lit
//   --profile=C:\t\shotsprof   Edge profile folder. Keep it short: Edge misbehaves with long paths
//   --edge=<path>       msedge.exe, if it is not in the usual place
//
// How it works: Edge starts with its own throwaway profile and a free debugging port. The
// script sets the viewport, opens the page and waits. For a full page it first scrolls to the
// bottom in steps, so every section that animates in when read has arrived, then returns to
// the top and captures beyond the viewport. Node writes the PNG itself, so the output path can
// be anywhere. Afterwards it stops only the Edge processes started with this profile folder,
// never any other Edge window.

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

if (positional.length < 4) {
  console.error("usage: node shoot.mjs <url> <width> <height> <out.png> [--full] [--wait=ms] [--scale=n] [--mobile] [--scheme=light|dark] [--reduced-motion]");
  process.exit(2);
}

const [url, widthArg, heightArg, outArg] = positional;
const width = Number(widthArg);
const height = Number(heightArg);
const out = resolve(outArg);
const full = flag("full");
const wait = Number(option("wait", "4000"));
let scale = Number(option("scale", "1"));
const mobile = flag("mobile") || width < 768;
const scheme = option("scheme", "");
const reducedMotion = flag("reduced-motion");
const profile = option("profile", "C:\\t\\shotsprof");
const edge = option("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

// Chrome-based browsers cannot paint a single capture taller than about 16,384 device pixels.
const MAX_DEVICE_PX = 16000;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.unref();
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** Stop only the Edge processes whose command line names our profile folder. */
function stopOurEdge() {
  if (process.platform !== "win32") return;
  const needle = profile.replace(/'/g, "''");
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ` +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  try {
    // Bounded, so a slow or stuck WMI service can never hang the script.
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
      timeout: 20000,
    });
  } catch {
    // Nothing left to stop, or WMI did not answer in time. Edge was already asked to close
    // through the protocol and its own process was killed; check by hand if in doubt:
    // Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | ? CommandLine -like '*shotsprof*'
  }
}

async function json(port, path, method = "GET") {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

/** A tiny DevTools client: send a command and wait for its answer, or wait for an event. */
function connect(wsUrl) {
  return new Promise((done, fail) => {
    const socket = new WebSocket(wsUrl);
    let next = 0;
    const pending = new Map();
    const listeners = new Set();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
      if (message.id && pending.has(message.id)) {
        const { resolve: ok, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else ok(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    });
    socket.addEventListener("error", () => fail(new Error("cannot connect to Edge's debugging socket")));
    socket.addEventListener("open", () =>
      done({
        send(method, params = {}) {
          const id = ++next;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((ok, reject) => pending.set(id, { resolve: ok, reject }));
        },
        once(method, timeout = 30000) {
          return new Promise((ok, reject) => {
            const timer = setTimeout(() => {
              listeners.delete(listener);
              reject(new Error(`timed out waiting for ${method}`));
            }, timeout);
            const listener = (message) => {
              if (message.method !== method) return;
              clearTimeout(timer);
              listeners.delete(listener);
              ok(message.params);
            };
            listeners.add(listener);
          });
        },
        close() {
          socket.close();
        },
      }),
    );
  });
}

async function main() {
  mkdirSync(profile, { recursive: true });
  mkdirSync(dirname(out), { recursive: true });
  const port = await freePort();

  const browser = spawn(
    edge,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-sync",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  browser.on("error", (error) => {
    console.error(`Edge did not start: ${error.message}`);
    process.exit(1);
  });

  let client;
  try {
    // Wait for the debugging port to answer.
    for (let tries = 0; ; tries++) {
      try {
        await json(port, "/json/version");
        break;
      } catch {
        if (tries > 60) throw new Error("Edge's debugging port never answered");
        await sleep(250);
      }
    }
    const targets = await json(port, "/json/list");
    let page = targets.find((t) => t.type === "page");
    if (!page) page = await json(port, "/json/new?about:blank", "PUT");
    client = await connect(page.webSocketDebuggerUrl);
    const { send, once } = client;

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
    if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const features = [];
    if (scheme) features.push({ name: "prefers-color-scheme", value: scheme });
    if (reducedMotion) features.push({ name: "prefers-reduced-motion", value: "reduce" });
    if (features.length) await send("Emulation.setEmulatedMedia", { features });

    const loaded = once("Page.loadEventFired", 45000);
    const navigation = await send("Page.navigate", { url });
    if (navigation.errorText) throw new Error(`could not open ${url}: ${navigation.errorText}`);
    await loaded;
    await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    await sleep(wait);

    const evaluate = async (expression) =>
      (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

    let clip;
    if (full) {
      // Scroll down a screen at a time so every "arrives when read" section has arrived,
      // then go back to the top for the capture.
      const total = await evaluate("document.documentElement.scrollHeight");
      for (let y = 0; y < total; y += Math.round(height * 0.6)) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(220);
      }
      await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
      await sleep(900);
      await evaluate("window.scrollTo(0, 0)");
      await sleep(400);
      if (!flag("as-scrolled")) {
        // The statement lights word by word with the scroll position, so at the top of the
        // page it is dim. Show it, and every section, the way a reader sees them.
        await evaluate(
          "document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in'));" +
            "document.querySelectorAll('[data-statement] [data-w]').forEach((w) => w.setAttribute('data-on', ''));" +
            // A capture beyond the viewport restarted some CSS animations (the homepage
            // headline's width settle) and painted them from an early frame. So the capture
            // shows the composed end state instead: the homepage's `motion` class goes (its
            // start states and entrances live under it), the two scroll-filled rules show
            // full, and every other finite animation is finished, kept and removed.
            "document.documentElement.classList.remove('motion');" +
            "document.querySelectorAll('[data-fill],[data-rail-fill]').forEach((n) => { n.style.transform = '' });" +
            "document.querySelectorAll('[data-rail-step]').forEach((n) => n.classList.add('is-on'));" +
            "document.getAnimations().forEach((a) => { try { if (a.effect.getComputedTiming().endTime === Infinity) return; a.finish(); a.commitStyles(); a.cancel(); } catch (e) {} });" +
            // Sections laid out only near the screen (content-visibility) are laid out for the capture.
            "document.head.insertAdjacentHTML('beforeend', '<style>*,*::before,*::after{transition:none!important}*{content-visibility:visible!important}</style>')",
        );
      }
      await sleep(1100);
      const metrics = await send("Page.getLayoutMetrics");
      const size = metrics.cssContentSize ?? metrics.contentSize;
      const fullHeight = Math.ceil(size.height);
      if (fullHeight * scale > MAX_DEVICE_PX) {
        const lowered = Math.max(0.5, Math.floor((MAX_DEVICE_PX / fullHeight) * 100) / 100);
        console.warn(`page is ${fullHeight} px tall; scale lowered from ${scale} to ${lowered}`);
        scale = lowered;
      }
      clip = { x: 0, y: 0, width, height: fullHeight, scale: 1 };
      if (scale !== Number(option("scale", "1"))) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
        await sleep(600);
      }
    }

    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: full,
      ...(clip ? { clip } : {}),
    });
    writeFileSync(out, Buffer.from(shot.data, "base64"));
    console.log(`${out}  ${width}x${clip ? clip.height : height} css px at ${scale}x`);

    await send("Browser.close").catch(() => undefined);
  } finally {
    client?.close();
    await sleep(500);
    if (browser.exitCode === null) browser.kill();
    stopOurEdge();
  }
}

main().catch((error) => {
  console.error(`shoot: ${error.message}`);
  stopOurEdge();
  process.exit(1);
});
