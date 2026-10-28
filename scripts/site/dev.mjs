// A Next dev server of your own for the site, beside any other running ones.
//
//   pnpm site:dev                 a free port from 3101 up (never 3100, the laptop's demo)
//   pnpm site:dev --port=3140
//
// - Its own output folder, .next-dev-<port>, so it never touches another server's .next and
//   build-site.sh's `rm -rf .next` never pulls the files from under it.
// - Next rewrites apps/web/tsconfig.json when the output folder is not .next (it adds the
//   folder's types to "include" and reformats the file). When the only difference from git is
//   that rewrite, the file is put back: when the server stops, and at the next start if a
//   server was killed before it could clean up.
// - It opens the site's pages; the workspace pages need the API (CLAUDE.md, "Running things").

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, WEB } from "./lib/copy.mjs";
import { assertAllowed, freePort } from "./lib/ports.mjs";

const portArg = process.argv.find((a) => a.startsWith("--port="))?.slice(7);
if (portArg) assertAllowed(portArg);
const port = portArg ? Number(portArg) : await freePort(3101);
const distDir = `.next-dev-${port}`;
const git = (...args) => execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).trim();
const TSCONFIG = join(WEB, "tsconfig.json");

/** True when tsconfig.json differs from git only by Next's dev-folder rewrite. */
function onlyNextRewrote() {
  const strip = (text) => {
    const config = JSON.parse(text);
    if (Array.isArray(config.include)) config.include = config.include.filter((entry) => !/^\.next-/.test(entry));
    return JSON.stringify(config);
  };
  try {
    return strip(readFileSync(TSCONFIG, "utf8")) === strip(git("show", "HEAD:apps/web/tsconfig.json"));
  } catch {
    return false;
  }
}
function restoreTsconfig(when) {
  if (git("status", "--porcelain", "--", "apps/web/tsconfig.json") !== "" && onlyNextRewrote()) {
    git("checkout", "--", "apps/web/tsconfig.json");
    console.log(`site:dev: put apps/web/tsconfig.json back ${when} (Next had rewritten it for the dev output folder).`);
  }
}
restoreTsconfig("from an earlier run");

console.log(`site:dev: http://localhost:${port} (output in apps/web/${distDir}; delete it when you are done)`);
const child = spawn("pnpm", ["exec", "next", "dev", "-p", String(port)], {
  cwd: WEB,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, ALYR_DIST_DIR: distDir },
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  restoreTsconfig("on stopping");
  process.exit(code ?? 0);
});
