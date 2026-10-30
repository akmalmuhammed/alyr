// Stamp the built site with the commit it was built from, so what is live can always be
// traced back to git (docs/site-audit/02-dx.md P0-1).
//
//   node scripts/site/stamp.mjs apps/web/out-site
//
// Writes out-site/version.txt and puts <meta name="alyr-build" content="<sha>"> in the
// <head> of every page, with a <link rel="alternate" type="text/markdown"> to the page's
// markdown copy when there is one (scripts/site/llms.mjs). The commit comes from ALYR_BUILD_SHA when set (CI passes the pull
// request's head commit, not GitHub's merge commit), else from `git rev-parse HEAD`. A
// build from a working tree with uncommitted changes is marked "-dirty": such a build must
// never be published (scripts/site/deploy.mjs refuses it).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "apps/web/out-site");
const repo = resolve(import.meta.dirname, "../..");

const git = (...args) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const sha = process.env.ALYR_BUILD_SHA || git("rev-parse", "HEAD") || "unknown";
const branch = process.env.ALYR_BUILD_BRANCH || git("rev-parse", "--abbrev-ref", "HEAD") || "unknown";
// Uncommitted or untracked changes in what the build reads mark it dirty. The output folder
// is ignored by git, so building never makes the tree dirty by itself.
const dirty = !process.env.ALYR_BUILD_SHA && git("status", "--porcelain", "--", "apps/web", "design", "scripts") !== "";
const commit = dirty ? `${sha}-dirty` : sha;
const built = new Date().toISOString();
const offer = process.env.NEXT_PUBLIC_ALYR_OFFER === "on" ? "on" : "off";
// The "Try it free" button (apps/web/app/_site/site.ts `TRY_FREE_LIVE`): which way this build went,
// so https://alyr.qa/version.txt says what is live and tryfree-check.mjs knows what to expect.
const tryFree = process.env.NEXT_PUBLIC_ALYR_TRY_FREE === "on" ? "on" : "off";

writeFileSync(
  join(out, "version.txt"),
  [`commit ${commit}`, `branch ${branch}`, `built ${built}`, `offer ${offer}`, `try-free ${tryFree}`, ""].join("\n"),
);

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "_next") return [];
    if (statSync(path).isDirectory()) return pages(path);
    return name.endsWith(".html") ? [path] : [];
  });
}

const tag = `<meta name="alyr-build" content="${commit}"/>`;
let count = 0;
for (const page of pages(out)) {
  const html = readFileSync(page, "utf8");
  if (html.includes('name="alyr-build"')) continue;
  if (!html.includes("<head>")) {
    console.error(`stamp: ${page} has no <head>; Next's markup changed, so the stamp cannot be placed.`);
    process.exit(1);
  }
  // The page's markdown copy, when scripts/site/llms.mjs wrote one (index.md for index.html).
  const twin = page.replace(/\.html$/, ".md");
  const rel = relative(out, twin).replaceAll("\\", "/");
  const alternate = existsSync(twin) ? `<link rel="alternate" type="text/markdown" href="/${rel}"/>` : "";
  writeFileSync(page, html.replace("<head>", `<head>${tag}${alternate}`));
  count += 1;
}
console.log(`stamp: ${count} pages and version.txt carry commit ${commit}`);
