// The public pages other than the homepage, as build-site.sh copies them: one path a line,
// without the leading slash and without the language (chat, for/bakeries, guides, ...).
// Read from PATHS in apps/web/app/_site/site.ts, so a page added there is published in both
// languages, with its social card, without editing the build script (ALY-232).
//
//   node scripts/site/pages.mjs

import { loadSite } from "./lib/copy.mjs";

const { site } = await loadSite();
const pages = Object.entries(site.PATHS)
  .filter(([key]) => key !== "home")
  .map(([, paths]) => paths.en.replace(/^\//, ""));
process.stdout.write(`${pages.join("\n")}\n`);
