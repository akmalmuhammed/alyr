import type { MetadataRoute } from "next";
import { SITE_URL } from "./_site/site";

// Only the public pages (the homepage and the product pages) are for search engines.
// The workspace, sign-in and the private customer links are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/whatsapp", "/login", "/pay/", "/s/", "/api/", "/sim/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
