// Accessibility and speed of the built site, with the tools pinned in apps/web's
// devDependencies (axe-core, lighthouse), not from another session's folder.
//
//   pnpm site:a11y                     axe on every page; Lighthouse mobile on / and /ar
//   pnpm site:a11y --pages=/chat,/ar/chat --runs=3
//   pnpm site:a11y --no-lighthouse     axe only
//   pnpm site:a11y --no-axe            Lighthouse only
//
// It serves apps/web/out-site compressed (build first: pnpm site:build) and drives headless
// Edge (or CHROME_PATH) through scripts/browser-kit.mjs.
//
// axe (alyr-design/verify.md):
// - axe-core, wcag2a, wcag2aa, wcag21aa and best practice;
// - every page at 1440 and 390, light and dark;
// - scrolled to the end and back, with content-visibility forced visible, so half-arrived
//   items do not report contrast;
// - fails on any serious or critical issue.
//
// Lighthouse 13, mobile, simulated throttling:
// - fails below the budget: Performance 90, Accessibility 100, CLS 0.05, LCP 2.5 s;
// - with --runs=n, it reports the lowest of n runs.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../browser-kit.mjs";
import { loadSite, WEB } from "./lib/copy.mjs";
import { freePort } from "./lib/ports.mjs";
import { serveSite } from "./serve.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const edge = option("edge", process.env.CHROME_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const short = (name) => (process.platform === "win32" ? `C:\\t\\${name}-${process.pid}` : join(WEB, `.${name}-${process.pid}`));
const require = createRequire(join(WEB, "package.json"));

/** Stop the Edge processes that use this run's profile folder (and no other Edge), then
 * delete the folder. Edge's launcher hands over and exits, so killing it is not enough. */
async function cleanUp(folder) {
  await new Promise((done) => setTimeout(done, 1000));
  if (process.platform === "win32") {
    const needle = folder.replace(/'/g, "''");
    const script =
      "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
      `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ` +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore", timeout: 20000 });
    } catch {
      /* nothing left to stop */
    }
  }
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    console.log(`(could not delete ${folder}; delete it by hand)`);
  }
}

const { site } = await loadSite();
const allPages = Object.values(site.PATHS).flatMap((p) => [p.en, p.ar]);
const axePages = option("pages", "") ? option("pages").split(",") : allPages;
const lhPages = option("lighthouse-pages", option("pages", "") || "/,/ar").split(",");
const runs = Number(option("runs", "1"));
const BUDGET = { performance: 0.9, accessibility: 1, cls: 0.05, lcp: 2500 };

const server = await serveSite({ quiet: true });
const failures = [];

// ------------------------------------------------------------------ axe

if (!args.includes("--no-axe")) {
  const axePath = require.resolve("axe-core/axe.min.js");
  const profile = short("site-axe");
  const browser = await launch({ edge, port: await freePort(9300), profile, width: 1440, height: 900, scheme: "light" });
  const FORCE = "document.head.insertAdjacentHTML('beforeend','<style>*,*::before,*::after{transition:none!important;animation-duration:0s!important}*{content-visibility:visible!important}</style>')";
  try {
    for (const page of axePages) {
      for (const [width, height, mobile] of [[1440, 900, false], [390, 844, true]]) {
        for (const scheme of ["light", "dark"]) {
          await browser.view(width, height, mobile, scheme);
          await browser.go(`${server.url}${page}`, 800);
          await browser.js(FORCE);
          await browser.js("(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); })()");
          const violations = (await browser.axe(axePath)) ?? [];
          const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          const label = `${page} ${width} ${scheme}`;
          console.log(`axe ${label}: ${violations.length ? violations.map((v) => `${v.id} (${v.impact}, ${v.n})`).join(", ") : "no issues"}`);
          for (const v of serious) {
            failures.push(`axe ${label}: ${v.id} (${v.impact}) on ${v.n} element(s), e.g. ${v.nodes[0]?.target}: ${v.nodes[0]?.why ?? ""}`);
          }
        }
      }
    }
  } finally {
    await browser.close();
    await cleanUp(profile);
  }
}

// ------------------------------------------------------------------ Lighthouse

if (!args.includes("--no-lighthouse")) {
  const lighthousePath = require.resolve("lighthouse");
  const { default: lighthouse } = await import(pathToFileURL(lighthousePath).href);
  const chromeLauncher = await import(pathToFileURL(createRequire(lighthousePath).resolve("chrome-launcher")).href);
  const userDataDir = short("site-lh");
  mkdirSync(userDataDir, { recursive: true });
  // A fixed free port: Edge's launcher exits at once, so chrome-launcher cannot wait for it.
  const chrome = await chromeLauncher.launch({ chromePath: edge, port: await freePort(9400), userDataDir, chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"] });
  try {
    for (const page of lhPages) {
      let worst = null;
      for (let run = 0; run < runs; run += 1) {
        const result = await lighthouse(`${server.url}${page}`, {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance", "accessibility"],
        });
        const { categories, audits } = result.lhr;
        const scores = {
          performance: categories.performance.score,
          accessibility: categories.accessibility.score,
          lcp: audits["largest-contentful-paint"].numericValue,
          cls: audits["cumulative-layout-shift"].numericValue,
        };
        if (!worst || scores.performance < worst.performance) worst = scores;
      }
      const line = `Performance ${Math.round(worst.performance * 100)}, Accessibility ${Math.round(worst.accessibility * 100)}, LCP ${(worst.lcp / 1000).toFixed(2)} s, CLS ${worst.cls.toFixed(3)}`;
      console.log(`lighthouse ${page} (mobile, lowest of ${runs}): ${line}`);
      if (worst.performance < BUDGET.performance || worst.accessibility < BUDGET.accessibility || worst.lcp >= BUDGET.lcp || worst.cls >= BUDGET.cls) {
        failures.push(`lighthouse ${page}: ${line}; the budget is Performance 90, Accessibility 100, LCP under 2.5 s, CLS under 0.05`);
      }
    }
  } finally {
    chrome.kill();
    await cleanUp(userDataDir);
  }
}

await server.close();
if (failures.length) {
  console.error(`site:a11y: ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("site:a11y: axe found no serious or critical issues" + (args.includes("--no-lighthouse") ? "." : "; Lighthouse within budget."));
