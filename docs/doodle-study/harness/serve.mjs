// Serve the harness: node docs/doodle-study/harness/serve.mjs 3107  (never 3100)
// Pages: /?lang=en|ar  &at=<seconds> for a still  &tall=1 to test pausing off screen.
import { createServer } from "node:http"
import { readFileSync, existsSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
const root = join(dirname(fileURLToPath(import.meta.url)), "site")
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" }
createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html"
  const f = join(root, p)
  if (!existsSync(f)) { res.writeHead(404); return res.end("not found") }
  res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream", "cache-control": "no-store" })
  res.end(readFileSync(f))
}).listen(Number(process.argv[2] || 3107), "127.0.0.1", () => console.log("up"))
