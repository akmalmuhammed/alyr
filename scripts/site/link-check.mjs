// Every internal link of the built site lands on something: a page, a file, and, for a link
// with #section, an element with that id on the target page.
//
//   node scripts/site/link-check.mjs          checks apps/web/out-site (build it first)
//
// It reads every href, src and srcset in the pages, the social-card and canonical addresses
// in their <meta>/<link> tags, the url()s in the stylesheets, the sitemap's <loc>s, robots.txt's
// Sitemap line, and the links in the markdown copies and llms.txt. Addresses on the site's
// own domain (https://alyr.qa/...) count as internal. They are resolved the way the Worker
// serves the folder (wrangler.jsonc: html_handling auto-trailing-slash): /chat is chat.html,
// /ar is ar.html, / is index.html.
//
// Links to other sites (mail, WhatsApp, Meta) are not fetched: this check never goes online.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { WEB } from "./lib/copy.mjs";

const out = join(WEB, "out-site");
const SITE = (process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.qa").replace(/\/$/, "");
const SITE_HOSTS = new Set([new URL(SITE).host, "www.alyr.qa", "alyr.online", "www.alyr.online"]);

if (!existsSync(join(out, "index.html"))) {
  console.error("link-check: apps/web/out-site is not built. Run pnpm site:build first.");
  process.exit(1);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const all = files(out);
const rel = (path) => relative(out, path).replaceAll("\\", "/");

/** The file the Worker serves for a path, or null. */
function target(pathname) {
  let path = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (path === "" || path === "index.html") return "index.html";
  if (path.endsWith("/")) path = path.slice(0, -1);
  for (const candidate of [path, `${path}.html`, `${path}/index.html`]) {
    const full = join(out, candidate);
    if (existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return null;
}

const idsCache = new Map();
function ids(file) {
  if (!idsCache.has(file)) {
    const html = readFileSync(join(out, file), "utf8");
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idsCache.get(file);
}

const problems = [];
let checked = 0;

function check(from, raw, base) {
  const href = raw.trim().replace(/&amp;/g, "&");
  if (!href || /^(mailto:|tel:|data:|javascript:|blob:)/i.test(href)) return;
  let url;
  try {
    url = new URL(href, `${SITE}/${base}`);
  } catch {
    problems.push(`${from}: "${href}" is not a valid address`);
    return;
  }
  if (!SITE_HOSTS.has(url.host)) return; // another site: not checked offline
  checked += 1;
  const file = target(url.pathname);
  if (!file) {
    problems.push(`${from}: ${href} → no file in out-site serves ${url.pathname}`);
    return;
  }
  const hash = decodeURIComponent(url.hash.slice(1));
  if (hash && file.endsWith(".html") && !ids(file).has(hash)) {
    problems.push(`${from}: ${href} → ${file} has no element with id="${hash}"`);
  }
}

for (const file of all) {
  const name = rel(file);
  if (name.startsWith("_next/") && !name.endsWith(".css")) continue;
  const text = readFileSync(file, "utf8");
  // A page's relative links resolve against its own address (/ar/chat for ar/chat.html).
  const base = name.replace(/(index)?\.html$/, "").replace(/\.md$/, "");
  if (name.endsWith(".html")) {
    // Attributes only, not the copies of the same markup inside Next's inline page data.
    const markup = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => tag.slice(0, tag.indexOf(">") + 1));
    for (const m of markup.matchAll(/\s(?:href|src)="([^"]*)"/g)) check(name, m[1], base);
    for (const m of markup.matchAll(/\ssrcset="([^"]*)"/gi)) {
      for (const part of m[1].split(",")) check(name, part.trim().split(/\s+/)[0], base);
    }
    for (const m of markup.matchAll(/<meta\b[^>]*\b(?:property|name)="(?:og:image|og:url|twitter:image)"[^>]*>/gi)) {
      const content = m[0].match(/\scontent="([^"]*)"/);
      if (content) check(name, content[1], base);
    }
  } else if (name.endsWith(".css")) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (!m[1].startsWith("data:") && !m[1].startsWith("#")) check(name, m[1], name.slice(0, name.lastIndexOf("/") + 1));
    }
  } else if (name === "sitemap.xml") {
    for (const m of text.matchAll(/<loc>([^<]+)<\/loc>/g)) check(name, m[1], "");
  } else if (name === "robots.txt") {
    for (const m of text.matchAll(/^Sitemap:\s*(\S+)/gim)) check(name, m[1], "");
  } else if (name.endsWith(".md") || name.endsWith(".txt")) {
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) check(name, m[1], base);
  }
}

if (problems.length) {
  console.error(`link-check: ${problems.length} broken internal link(s) in apps/web/out-site:`);
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  console.error("A page missing from out-site is usually a page missing from build-site.sh's pages= list (alyr-site-page, 'Adding a product page').");
  process.exit(1);
}
console.log(`link-check: ${checked} internal links in ${all.filter((f) => !rel(f).startsWith("_next/")).length} files all resolve.`);
