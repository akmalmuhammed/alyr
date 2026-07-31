const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:; object-src 'none'; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

const WELL_KNOWN_CACHE = "public, max-age=300, must-revalidate";
const HTML_CACHE = "public, max-age=0, must-revalidate";
const ASSET_CACHE =
  "public, max-age=3600, stale-while-revalidate=86400";
const ACCOUNT_CONTINUATION_CACHE = "no-store, no-transform";
const ACCOUNT_CONTINUATION_SCRIPT =
  "/return-to-app.0398ea7561f4.js";
const ACCOUNT_CONTINUATION_PATHS = new Set([
  "/callback",
  "/callback/",
  "/auth/callback",
  "/auth/callback/",
  "/join",
  "/join/",
  "/reset-password",
  "/reset-password/"
]);

function withHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  if (ACCOUNT_CONTINUATION_PATHS.has(pathname)) {
    headers.set("Cache-Control", ACCOUNT_CONTINUATION_CACHE);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } else if (pathname.startsWith("/.well-known/")) {
    headers.set("Cache-Control", WELL_KNOWN_CACHE);
  } else if (pathname === ACCOUNT_CONTINUATION_SCRIPT) {
    headers.set("Cache-Control", "no-store");
  } else if (
    headers.get("content-type")?.includes("text/html") ||
    pathname.endsWith("/")
  ) {
    headers.set("Cache-Control", HTML_CACHE);
  } else if (response.ok) {
    headers.set("Cache-Control", ASSET_CACHE);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.protocol !== "https:" ||
      url.hostname === "www.heldat.app"
    ) {
      url.protocol = "https:";
      url.hostname = "heldat.app";
      return Response.redirect(url.toString(), 308);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withHeaders(
        new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }
        }),
        url.pathname
      );
    }

    const response = await env.ASSETS.fetch(request);
    return withHeaders(response, url.pathname);
  }
};
