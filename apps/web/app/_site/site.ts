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

/** ALYR's own public profiles (LinkedIn, Instagram, X, YouTube, Crunchbase and so on), as a
 * comma-separated list of https addresses, for the structured data's `sameAs` (D-056). Empty
 * until each account exists and carries the same name and description as the site: a link
 * to a profile that does not exist, or says something else, tells search engines the wrong
 * thing about who ALYR is. */
export const SAME_AS: readonly string[] = (process.env.NEXT_PUBLIC_ALYR_SAME_AS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https:\/\/[^\s]+$/.test(value));

/** Ownership checks for Google Search Console and Bing Webmaster Tools, for when they are
 * done with an HTML tag rather than a DNS record (D-056). Empty: no tag. */
export const SITE_VERIFICATION = {
  google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "",
  bing: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ?? "",
} as const;

/** Whether the page shows prices and the first-month offer: the price section, the price in
 * the hero facts, the money-back lines, the price question and the Price link. Off until
 * ALYR holds its commercial registration (ALY-59): research for the customer agreement
 * (PR #47) found that offering a priced service before the CR may count as trading. Set
 * `NEXT_PUBLIC_ALYR_OFFER=on` and rebuild the day the CR is issued. */
export const OFFER_LIVE = process.env.NEXT_PUBLIC_ALYR_OFFER === "on";

/** Where staff sign in. Empty on the published site, which is the public pages only:
 * the workspace is not hosted there, so the footer shows no link to it. */
export const WORKSPACE_URL = process.env.NEXT_PUBLIC_ALYR_WORKSPACE_URL ?? "";

/** Every public page, and its address in each language. The product pages are in the
 * suite's fixed order: Chat, Bookings, Agent, Accounts, Shelf, Docs. A product that is not
 * built has no page and is not listed (D-039; Payroll left the site on 20 Oct 2026). */
export const PATHS = {
  home: { en: "/", ar: "/ar" },
  chat: { en: "/chat", ar: "/ar/chat" },
  bookings: { en: "/bookings", ar: "/ar/bookings" },
  agent: { en: "/agent", ar: "/ar/agent" },
  accounts: { en: "/accounts", ar: "/ar/accounts" },
  shelf: { en: "/shelf", ar: "/ar/shelf" },
  docs: { en: "/docs", ar: "/ar/docs" },
} as const;

export type PageKey = keyof typeof PATHS;

/** The suite, in its fixed order: the four products, then ALYR Shelf and ALYR Docs in
 * `catalog.py`'s module order (catalog before documents). Every product listed has a page. */
export const PRODUCTS = ["chat", "bookings", "agent", "accounts", "shelf", "docs"] as const;
export type ProductKey = (typeof PRODUCTS)[number];

/** The products that come with every other one, not chosen on their own (D-039: ALYR Shelf
 * is included with ALYR; ALYR Agent comes with each product). */
export const INCLUDED: readonly ProductKey[] = ["agent", "shelf"];

/** A product's page. */
export function productPath(key: ProductKey, locale: "en" | "ar"): string {
  return PATHS[key][locale];
}
