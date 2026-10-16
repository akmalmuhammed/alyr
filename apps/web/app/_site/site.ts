// Facts about the public site that are not words on the page.

/** Where the site is served. Used for canonical links, the sitemap and social cards. */
export const SITE_URL = process.env.NEXT_PUBLIC_ALYR_SITE_URL ?? "https://alyr.qa";

/** Where people write to us. hello@alyr.qa forwards to the founder through Cloudflare
 * Email Routing (D-029). Set the variable to an empty value and the page falls back to
 * saying the line opens soon, rather than showing an address nobody reads. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_ALYR_CONTACT_EMAIL ?? "hello@alyr.qa";

/** ALYR's own WhatsApp number, digits only with country code (for example 9745550000).
 * When set, every call to action opens a chat with it: the playbook's rule is that the
 * call to action is one tap, "Message us on WhatsApp". Empty until the number exists. */
export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_ALYR_WHATSAPP ?? "").replace(/\D/g, "");

/** How a visitor reaches us, decided at build time: WhatsApp when the number is set, else
 * email, else neither (the page then says the line opens soon). */
export type ContactState = "whatsapp" | "email" | "pending";
export const CONTACT_STATE: ContactState = WHATSAPP_NUMBER ? "whatsapp" : CONTACT_EMAIL ? "email" : "pending";

/** Where staff sign in. Empty on the published site, which is the public pages only:
 * the workspace is not hosted there, so the footer shows no link to it. */
export const WORKSPACE_URL = process.env.NEXT_PUBLIC_ALYR_WORKSPACE_URL ?? "";

/** Facts that make ALYR checkable, shown in the trust section only once each is true.
 * Until then nothing is rendered: no empty slot, no "coming soon". The labels are in
 * `copy.ts` (`home.trust.records`). */
export const TRUST_RECORDS = {
  /** Commercial registration number, once the company is registered (ALY-59). */
  cr: process.env.NEXT_PUBLIC_ALYR_CR ?? "",
  /** The licensed payment provider's name, once one is signed and connected (ALY-17). */
  provider: process.env.NEXT_PUBLIC_ALYR_PAYMENT_PROVIDER ?? "",
  /** Meta's approval of ALYR as a Tech Provider, once granted (ALY-39). */
  meta: process.env.NEXT_PUBLIC_ALYR_META_STATUS ?? "",
} as const;
export type TrustRecord = keyof typeof TRUST_RECORDS;

/** Every public page, and its address in each language. */
export const PATHS = {
  home: { en: "/", ar: "/ar" },
  chat: { en: "/chat", ar: "/ar/chat" },
} as const;

export type PageKey = keyof typeof PATHS;
