import type { MetadataRoute } from "next";
import { SITE_URL } from "./_site/site";

// Only the public pages (the homepage and the product pages) are for search engines.
// The workspace, sign-in and the private customer links are not.
//
// `/s/` (a shop's order page) is not listed on purpose (ALY-112): a shop shares its item and
// category links on WhatsApp and Instagram, and Meta's link-preview crawler honours this file,
// so a disallowed page would paste as a bare address with no photo, name or price. The order
// pages carry `noindex` (the product layout's metadata), which keeps them out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/whatsapp", "/login", "/pay/", "/api/", "/sim/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
