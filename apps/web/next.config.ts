import type { NextConfig } from "next";

const api = process.env.ALYR_API_URL ?? "http://127.0.0.1:8000";

const production = process.env.NODE_ENV === "production";

// What the browser may load and do on every page of the app (ALY-118). Scripts and styles
// stay 'unsafe-inline' because Next writes its own inline bootstrap and the pages use style
// attributes; a nonce would force every page to render per request, and the hosted portal
// serves some of them as static files. What this does stop: other sites framing the app
// (frame-ancestors), plugins (object-src), a <base> that redirects relative links (base-uri),
// forms posting elsewhere (form-action), and any script, connection or font from another
// host (script-src, connect-src, font-src). Images may come from any https address because
// shops' photos are served from the media host. The development server needs eval and a
// socket for hot reload, so the policy and HSTS are for production builds only.
const policy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No page of ours uses a sensor or the browser's payment sheet.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(production
    ? [
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "Content-Security-Policy", value: policy },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // A second dev server, or a build, can run beside a running one by giving it its own
  // output folder: ALYR_DIST_DIR=.next-preview next dev -p 3101
  distDir: process.env.ALYR_DIST_DIR ?? ".next",
  // Container images (apps/web/Dockerfile) set ALYR_STANDALONE=1 to get a small
  // self-contained server. The public-site build (scripts/build-site.sh) leaves it unset.
  output: process.env.ALYR_STANDALONE ? "standalone" : undefined,
  // While the customer pages are served from the laptop through the tunnel, the dev
  // server must accept its own assets being requested from that address.
  allowedDevOrigins: ["app.alyr.online"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The browser only ever talks to this app; it forwards API calls to FastAPI.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/sim/:path*", destination: `${api}/sim/:path*` },
      // Product analytics (D-070): the browser sends events to us and we forward them to
      // PostHog's EU region, so the security policy above stays "self only".
      { source: "/ingest/static/:path*", destination: "https://eu-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://eu.i.posthog.com/:path*" },
    ];
  },
  // PostHog's addresses end in a slash (/ingest/e/); redirecting them would drop the event.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
