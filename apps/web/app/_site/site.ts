// Facts about the public site that are not words on the page.

/** Where the site is served. Used for canonical links, the sitemap and social cards. */
export const SITE_URL = process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.qa";

/** Where "Request early access" writes to. Empty until the founder sets up an address;
 * the page then says so plainly instead of showing an address nobody reads. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_ALYR_CONTACT_EMAIL ?? "";

/** ALYR's own WhatsApp number, digits only with country code (for example 9745550000).
 * When set, every call to action opens a chat with it: the playbook's rule is that the
 * call to action is one tap, "Message us on WhatsApp". Empty until the number exists. */
export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_ALYR_WHATSAPP ?? "").replace(/\D/g, "");

/** Where staff sign in. Empty on the published site, which is the public pages only:
 * the workspace is not hosted there, so the footer shows no link to it. */
export const WORKSPACE_URL = process.env.NEXT_PUBLIC_ALYR_WORKSPACE_URL ?? "";

/** Every public page, and its address in each language. */
export const PATHS = {
  home: { en: "/", ar: "/ar" },
  chat: { en: "/chat", ar: "/ar/chat" },
} as const;

export type PageKey = keyof typeof PATHS;
