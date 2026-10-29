// Offline for the demo only (ALY-263): register the service worker at `/demo/bakery-sw.js`
// with the scope `/demo/bakery`, so it controls this page and no other. Once the page has
// loaded, every font face is fetched (the Arabic face too, though English is shown first)
// and the worker is asked to keep every file the page loaded.

export function register() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/demo/bakery-sw.js", { scope: "/demo/bakery" })
    .then(async (registration) => {
      if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
      try { await Promise.all([...document.fonts].map((face) => face.load().catch(() => null))); } catch { /* no fonts API */ }
      const worker = (await navigator.serviceWorker.ready).active ?? registration.active;
      const urls = performance.getEntriesByType("resource").map((e) => e.name)
        .filter((u) => u.startsWith(location.origin));
      worker?.postMessage({ type: "keep", urls: [location.pathname, ...urls] });
    })
    .catch(() => { /* offline is a convenience; the demo runs without it */ });
}
