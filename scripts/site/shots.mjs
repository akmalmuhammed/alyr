// Screenshots of the site's pages across the matrix, with headless Edge (scripts/site/shoot.mjs).
//
//   pnpm site:shots                       every page, 1440 and 390, light and dark, first screen
//   pnpm site:shots --full                whole pages
//   pnpm site:shots --pages=/,/ar --sizes=320x700 --schemes=light --reduced-motion
//   pnpm site:shots --url=https://alyr.qa  shoot another address instead of the local build
//
// Without --url it serves apps/web/out-site itself (compressed, like Cloudflare), so build
// first (pnpm site:build). Pictures go to apps/web/.shots/<commit>/ (ignored by git; never
// commit screenshots), or --out=<folder>. Edge gets its own short profile folder per run.
// Edge is Windows-only here; elsewhere pass --edge=<path> or set CHROME_PATH.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSite, WEB } from "./lib/copy.mjs";
import { serveSite } from "./serve.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const pass = args.filter((a) => /^--(full|reduced-motion|as-scrolled|wait=|scale=|edge=|at=|offset=|settle=)/.test(a));

const { site } = await loadSite();
const pages = option("pages", "")
  ? option("pages").split(",")
  : Object.values(site.PATHS).flatMap((p) => [p.en, p.ar]);
const sizes = option("sizes", "1440x900,390x844").split(",").map((s) => s.split("x").map(Number));
const schemes = option("schemes", "light,dark").split(",");

let commit = "url";
let server = null;
let base = option("url", "");
if (!base) {
  server = await serveSite({ quiet: true });
  base = server.url;
  commit = readFileSync(join(WEB, "out-site/version.txt"), "utf8").split("\n")[0].replace("commit ", "").slice(0, 7);
}
const out = option("out", join(WEB, ".shots", commit));
mkdirSync(out, { recursive: true });
const profile = option("profile", process.platform === "win32" ? `C:\\t\\siteshots-${process.pid}` : join(out, ".profile"));

let failed = 0;
for (const page of pages) {
  for (const [width, height] of sizes) {
    for (const scheme of schemes) {
      const name = `${page === "/" ? "home" : page.replace(/^\//, "").replaceAll("/", "-")}-${width}-${scheme}.png`;
      // Not spawnSync: the local server runs in this process and must keep answering.
      const status = await new Promise((done) =>
        spawn(
          process.execPath,
          [join(import.meta.dirname, "shoot.mjs"), `${base}${page}`, String(width), String(height), join(out, name), `--scheme=${scheme}`, `--profile=${profile}`, ...pass],
          { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
        ).on("exit", done),
      );
      if (status !== 0) failed += 1;
    }
  }
}
await server?.close();
console.log(`site:shots: ${pages.length * sizes.length * schemes.length - failed} pictures in ${out}${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
