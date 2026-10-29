// The bakery sales demo's service worker (ALY-263): the demo runs in a shop, where the signal
// can be weak, so once the page has loaded it keeps working with the network off. Its scope
// is `/demo/bakery` only (registered by `demo/bakery/offline.ts`), so no other page of the
// app is ever controlled by it. It does not change what a request returns while online: every
// request goes to the network first, and only a failed one is answered from the cache. The
// page asks it to keep every file it loaded (scripts, styles, fonts), and nothing from
// /api or the analytics path is ever kept.

const WORKER = `
const CACHE = "alyr-demo-bakery-v1";
const PAGE = "/demo/bakery";
const SKIP = ["/api/", "/sim/", "/ingest"];
const ours = (url) => url.origin === self.location.origin && !SKIP.some((p) => url.pathname.startsWith(p));

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(PAGE)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("alyr-demo-bakery-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "keep" ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) => {
    try { if (!ours(new URL(u, self.location.origin))) return null; } catch (e) { return null; }
    return cache.add(u).catch(() => null);
  }))));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!ours(url)) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  }).catch(async () => {
    const navigate = request.mode === "navigate";
    const kept = await caches.match(request, { ignoreSearch: navigate });
    if (kept) return kept;
    if (navigate) { const page = await caches.match(PAGE); if (page) return page; }
    return Response.error();
  }));
});
`;

export function GET() {
  return new Response(WORKER, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
