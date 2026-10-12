import type { NextConfig } from "next";

const api = process.env.ALYR_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // While the customer pages are served from the laptop through the tunnel, the dev
  // server must accept its own assets being requested from that address.
  allowedDevOrigins: ["app.alyr.online"],
  // The browser only ever talks to this app; it forwards API calls to FastAPI.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/sim/:path*", destination: `${api}/sim/:path*` },
    ];
  },
};

export default nextConfig;
