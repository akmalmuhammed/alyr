// Facts about the public site that are not words on the page.

/** Where the site is served. Used for canonical links, the sitemap and social cards. */
export const SITE_URL = process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.online";

/** Where "Request early access" writes to. Empty until the founder sets up an address;
 * the page then says so plainly instead of showing an address nobody reads. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_ALYR_CONTACT_EMAIL ?? "";

export const PATHS = { en: "/", ar: "/ar", workspace: "/login" } as const;
