// Measure the timed pieces of a built page: every animation and transition each one starts
// (delay, duration, end) and, for a flow or a demo, each step's dwell, with no screenshot
// used for the timing (screenshots stall CSS animations). Plain Node 22; runs
// scripts/site/shoot.mjs with lib/pace-probe.js as --eval.
//
//   pnpm site:serve --port=3140        (another terminal; never 3100)
//   node scripts/site/pace-probe.mjs http://127.0.0.1:3140/chat demo flow
//   node scripts/site/pace-probe.mjs http://127.0.0.1:3140/ flow tiles fold biz --width=390
//   node scripts/site/pace-probe.mjs http://127.0.0.1:3140/shelf sig --reduced-motion
//
// Pieces: flow, demo, sig (the signature figure), tiles (the products frame), fold (the
// business day's fold), biz (a business tab chosen), facts (a product page's facts arriving),
// xray (/chat's X-ray, both layers). A flow or demo plays its first steps in real time ("wall")
// and then finishes each step's progress bar to read the rest quickly. Prints the JSON.
// alyr-design/motion.md, "The pace"; the before and after of 25 Oct 2026 are in
// docs/framer-review/07-pace-log.md.

import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && /^https?:/.test(a));
const pieces = args.filter((a) => !a.startsWith("--") && a !== url);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (!url || !pieces.length) {
  console.error("usage: node scripts/site/pace-probe.mjs <url> <piece…> [--width=1440] [--height=900] [--scheme=light] [--reduced-motion]");
  process.exit(2);
}

const SPEC = {
  flow: { kind: "flow", name: "flow", sel: ".fx", live: 3 },
  demo: { kind: "demo", name: "demo", sel: ".demo", live: 2 },
  sig: { kind: "sig", name: "sig", sel: "[data-sig]" },
  tiles: { kind: "tile", name: "tiles" },
  fold: { kind: "split", name: "fold", sel: ".split" },
  biz: { kind: "click", name: "biz", sel: ".biz", click: ".biz-tab", n: 1, wait: 200 },
  facts: { kind: "reveal", name: "facts", sel: ".product-facts [data-reveal]" },
  xray: [
    { kind: "click", name: "xrayTeam", sel: ".xr", click: ".xr-group[data-layer=team] .xr-show", n: 0, wait: 200 },
    { kind: "click", name: "xrayLayer", sel: ".xr", click: ".xr-group[data-layer=xray] .xr-show", n: 0, wait: 200 },
  ],
};
const spec = pieces.flatMap((p) => {
  if (!SPEC[p]) {
    console.error(`unknown piece "${p}": ${Object.keys(SPEC).join(", ")}`);
    process.exit(2);
  }
  return SPEC[p];
});

const probe = readFileSync(join(import.meta.dirname, "lib", "pace-probe.js"), "utf8").replace("__SPEC__", JSON.stringify(spec));
const out = mkdtempSync(join(tmpdir(), "pace-"));
const text = execFileSync(
  process.execPath,
  [
    join(import.meta.dirname, "shoot.mjs"), url, option("width", "1440"), option("height", "900"), join(out, "unused.png"),
    "--wait=1200", `--scheme=${option("scheme", "light")}`, `--profile=${option("profile", "C:\\t\\paceprof")}`,
    ...(args.includes("--reduced-motion") ? ["--reduced-motion"] : []),
    `--eval=${probe}`,
  ],
  { encoding: "utf8", maxBuffer: 64 << 20 },
);
const line = text.split("\n").find((l) => l.startsWith("{"));
console.log(line ? JSON.stringify(JSON.parse(line), null, 1) : text);
