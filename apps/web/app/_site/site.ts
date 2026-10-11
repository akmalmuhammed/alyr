// Facts about the public site that are not words on the page.

/** Where the site is served. Used for canonical links, the sitemap and social cards. */
export const SITE_URL = process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.online";

/** Where "Request early access" writes to. Empty until the founder sets up an address;
 * the page then says so plainly instead of showing an address nobody reads. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_ALYR_CONTACT_EMAIL ?? "";

/** Where staff sign in. Empty on the published site, which is the public pages only:
 * the workspace is not hosted there, so the footer shows no link to it. */
export const WORKSPACE_URL = process.env.NEXT_PUBLIC_ALYR_WORKSPACE_URL ?? "";

export const PATHS = { en: "/", ar: "/ar" } as const;
