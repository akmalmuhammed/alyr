// Serve the built site (apps/web/out-site) on this machine, the way Cloudflare does, for
// screenshots, axe and Lighthouse:
// - clean addresses (/chat is chat.html, /ar is ar.html), 404.html for anything else;
// - the content types and headers of out-site/_headers;
// - brotli or gzip, because without compression Lighthouse read an LCP of 6.2 s for a page
//   that is 2.3 s behind Cloudflare (alyr-design/verify.md).
//
//   pnpm site:serve                  a free port from 3101 up (never 3100)
//   pnpm site:serve --port=3140
//
// Other scripts import serveSite() and get the address back.

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { WEB } from "./lib/copy.mjs";
import { assertAllowed, freePort } from "./lib/ports.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

/** out-site/_headers as [pattern, headers] pairs (Cloudflare's format: a path line, then
 * indented "Name: value" lines; `*` matches anything). */
function readHeaders(out) {
  const file = join(out, "_headers");
  if (!existsSync(file)) return [];
  const rules = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      rules.push([pattern, {}]);
    } else if (rules.length) {
      const at = line.indexOf(":");
      rules.at(-1)[1][line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return rules;
}

function resolveFile(out, pathname) {
  let path = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/\/$/, "");
  if (path === "") path = "index.html";
  for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
    const full = normalize(join(out, candidate));
    if (!full.startsWith(normalize(out))) return null;
    if (existsSync(full) && statSync(full).isFile()) return full;
  }
  return null;
}

/** Start the server; resolves to { url, port, close }. */
export async function serveSite({ port, out = join(WEB, "out-site"), quiet = false } = {}) {
  if (!existsSync(join(out, "index.html"))) throw new Error(`${out} is not built. Run pnpm site:build first.`);
  if (port) assertAllowed(port);
  const chosen = port ? Number(port) : await freePort(3101);
  const headers = readHeaders(out);
  const cache = new Map();

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = resolveFile(out, url.pathname);
    let status = 200;
    if (!file) {
      file = join(out, "404.html");
      status = 404;
    }
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    const extra = {};
    for (const [pattern, values] of headers) if (pattern.test(url.pathname)) Object.assign(extra, values);
    const accept = String(req.headers["accept-encoding"] ?? "");
    const encoding = COMPRESSIBLE.test(extra["Content-Type"] ?? type) ? (accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : "") : "";
    res.setHeader("Content-Type", type);
    for (const [name, value] of Object.entries(extra)) res.setHeader(name, value);
    if (!encoding) {
      res.writeHead(status);
      createReadStream(file).pipe(res);
      return;
    }
    const key = `${file}:${encoding}`;
    if (!cache.has(key)) {
      const body = readFileSync(file);
      cache.set(
        key,
        encoding === "br" ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(body, { level: 9 }),
      );
    }
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Vary", "Accept-Encoding");
    res.writeHead(status);
    res.end(cache.get(key));
  });
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(chosen, "127.0.0.1", done);
  });
  const url = `http://127.0.0.1:${chosen}`;
  if (!quiet) console.log(`site:serve: ${out} at ${url} (compressed, _headers applied). Ctrl+C to stop.`);
  return { url, port: chosen, close: () => new Promise((done) => server.close(done)) };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const portArg = process.argv.find((a) => a.startsWith("--port="))?.slice(7);
  serveSite({ port: portArg }).catch((error) => {
    console.error(`site:serve: ${error.message}`);
    process.exit(1);
  });
}
