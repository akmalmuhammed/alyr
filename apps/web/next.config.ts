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

// The one page that opens Paddle's checkout, for an owner paying ALYR by card (ALY-180,
// D-074): Paddle.js from Paddle's CDN, its checkout frame from Paddle's checkout address
// (sandbox or live), and the browser's payment sheet inside that frame for Apple Pay and
// Google Pay. Everything else stays as above.
const paddleHosts = "https://*.paddle.com";
const billingPolicy = policy
  .replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' https://cdn.paddle.com")
  .replace("connect-src 'self'", `connect-src 'self' ${paddleHosts}`)
  .replace("form-action 'self'", `form-action 'self' ${paddleHosts}`)
  .concat(`; frame-src https://buy.paddle.com https://sandbox-buy.paddle.com`);

// The one page that opens Meta's Embedded Signup pop-up (ALY-39, spec 063): the Facebook SDK from
// connect.facebook.net, Meta's pages in the pop-up and its frames, and calls to Graph. Only in a
// build made for it (ALYR_EMBEDDED_SIGNUP=on at build time), so a build without the feature keeps
// the policy above on every page.
const embeddedSignup = process.env.ALYR_EMBEDDED_SIGNUP === "on";
const facebookHosts = "https://www.facebook.com https://web.facebook.com https://graph.facebook.com";
const signupPolicy = policy
  .replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' https://connect.facebook.net")
  .replace("connect-src 'self'", `connect-src 'self' ${facebookHosts}`)
  .concat(`; frame-src https://www.facebook.com https://web.facebook.com`);

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
    // A later entry overrides the same header of an earlier one, so /app/billing gets its own.
    return [
      { source: "/:path*", headers: securityHeaders },
      ...(embeddedSignup && production
        ? [{ source: "/start", headers: [{ key: "Content-Security-Policy", value: signupPolicy }] }]
        : []),
      {
        source: "/app/billing",
        headers: [
          { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com")' },
          ...(production ? [{ key: "Content-Security-Policy", value: billingPolicy }] : []),
        ],
      },
    ];
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
