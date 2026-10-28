// Every check of the public site that needs no database, in one command: what CI's `site`
// job runs, and what to paste into a pull request while CI cannot run.
//
//   pnpm site:check                (from apps/web)
//   pnpm site:check --no-build     check the out-site that is already there
//
// 1. the real build: scripts/build-site.sh (the published files, stamped with the commit)
// 2. EN/AR copy parity            scripts/site/copy-parity.mjs
// 3. banned words and prices      scripts/site/banned-words.mjs (copy and built files)
// 4. internal links               scripts/site/link-check.mjs
// 5. the pace                     scripts/site/pace-check.mjs (timed pieces follow --pace)
// 6. :has() and the server's marks scripts/site/has-check.mjs (no :not() inside a :has();
//                                  the header's and <main>'s marks match each built page)
//
// All checks run even when one fails, so one run shows everything; the exit code is 1 if
// any failed.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { REPO } from "./lib/copy.mjs";

const build = !process.argv.includes("--no-build");
const here = import.meta.dirname;
const steps = [
  ...(build ? [["build (scripts/build-site.sh)", "bash", [join(REPO, "scripts/build-site.sh")]]] : []),
  ["EN/AR copy parity", "node", [join(here, "copy-parity.mjs")]],
  ["banned words and prices", "node", [join(here, "banned-words.mjs")]],
  ["internal links", "node", [join(here, "link-check.mjs")]],
  ["the pace", "node", [join(here, "pace-check.mjs")]],
  [":has() and the server's marks", "node", [join(here, "has-check.mjs")]],
];

const results = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n== site:check: ${name}`);
  const start = Date.now();
  const { status } = spawnSync(cmd, args, { cwd: REPO, stdio: "inherit" });
  results.push({ name, ok: status === 0, seconds: ((Date.now() - start) / 1000).toFixed(1) });
  // Without a build there is nothing for the later checks to read.
  if (name.startsWith("build") && status !== 0) break;
}

console.log("\n== site:check summary");
for (const r of results) console.log(`  ${r.ok ? "pass" : "FAIL"}  ${r.name} (${r.seconds} s)`);
const failed = results.filter((r) => !r.ok).length + (results.length < steps.length ? 1 : 0);
if (failed) {
  console.error(`site:check: ${failed} check(s) failed.`);
  process.exit(1);
}
console.log("site:check: all passed.");
