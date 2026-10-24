// The manual way to publish alyr.qa, kept beside the GitHub Actions deploy as its fallback
// (docs/runbooks/site-deploy.md). Run it on the founder's laptop, signed in to Cloudflare
// (`pnpm exec wrangler login`), and only with the founder's yes for this one publish.
//
//   pnpm site:deploy            (from apps/web)
//   pnpm site:deploy --yes      skip the typed confirmation
//
// It refuses to publish a commit that is not pushed or a tree with uncommitted changes, so
// every live version can be found in git. It builds and checks the site (pnpm site:check),
// confirms the build is stamped with this commit, deploys with `wrangler deploy` tagged
// with the commit, and reads https://alyr.qa/version.txt back.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const repo = resolve(import.meta.dirname, "../..");
const web = join(repo, "apps/web");
const yes = process.argv.includes("--yes");
const shell = process.platform === "win32";

const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
const stop = (message) => {
  console.error(`site:deploy: ${message}`);
  process.exit(1);
};
const run = (cmd, args, cwd = web) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell });
  if (result.status !== 0) stop(`${cmd} ${args.join(" ")} failed (exit ${result.status}).`);
};

if (git("status", "--porcelain", "--", "apps/web", "design", "scripts") !== "") {
  stop("apps/web, design or scripts has uncommitted or untracked changes. Commit and push them first: a live version must be a commit in git.");
}
const sha = git("rev-parse", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
git("fetch", "--quiet", "origin");
if (git("branch", "-r", "--contains", sha) === "") {
  stop(`commit ${sha.slice(0, 7)} is not on any branch on origin. Push it first.`);
}

console.log(`site:deploy: building and checking ${branch} at ${sha.slice(0, 7)}`);
run("node", [join(repo, "scripts/site/check.mjs")], repo);

const stamp = readFileSync(join(web, "out-site/version.txt"), "utf8").split("\n")[0];
if (stamp !== `commit ${sha}`) stop(`out-site/version.txt says "${stamp}", not commit ${sha}.`);

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Publish commit ${sha.slice(0, 7)} (${branch}) to alyr.qa? Type yes: `);
  rl.close();
  if (answer.trim() !== "yes") stop("not published.");
}

// On Windows pnpm runs through the shell, so the message needs its own quotes there.
const message = `Manual deploy from ${branch}, commit ${sha}`;
run("pnpm", ["exec", "wrangler", "deploy", "--tag", sha.slice(0, 7), "--message", shell ? `"${message}"` : message]);

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const live = await fetch(`https://alyr.qa/version.txt?check=${Date.now()}`)
    .then((r) => r.text())
    .then((t) => t.split("\n")[0])
    .catch(() => "");
  if (live === `commit ${sha}`) {
    console.log(`site:deploy: alyr.qa serves ${sha.slice(0, 7)}. Write the version ID wrangler printed into docs/status.md.`);
    process.exit(0);
  }
  await new Promise((done) => setTimeout(done, 10_000));
}
stop("alyr.qa does not answer with this commit yet. Check https://alyr.qa/version.txt; to undo, see docs/runbooks/site-deploy.md (Roll back).");
