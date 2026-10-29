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

/** The kinds of business with a page of their own (ALY-232, D-057): an audience, not a
 * product, so they live under `/for/`. In the order of the homepage's business tabs, with
 * groceries after bakeries. Clinics are not here and must not be (health data, D-043). */
export const SECTORS = ["bakeries", "salons", "groceries", "restaurants", "home-services", "fashion"] as const;
export type SectorKey = (typeof SECTORS)[number];

/** The owner guides (ALY-233), newest last. Each is useful with or without ALYR. */
export const GUIDES = ["stop-losing-whatsapp-orders", "cut-no-shows-with-reminders", "keep-track-of-who-owes-you"] as const;
export type GuideKey = (typeof GUIDES)[number];

type Pair = { readonly en: string; readonly ar: string };
const sectorPaths = Object.fromEntries(
  SECTORS.map((key) => [`for-${key}`, { en: `/for/${key}`, ar: `/ar/for/${key}` }]),
) as Record<`for-${SectorKey}`, Pair>;
const guidePaths = Object.fromEntries(
  GUIDES.map((key) => [`guide-${key}`, { en: `/guides/${key}`, ar: `/ar/guides/${key}` }]),
) as Record<`guide-${GuideKey}`, Pair>;

/** Every public page, and its address in each language. The product pages are in the
 * suite's fixed order: Chat, Bookings, Agent, Accounts, Shelf, Docs. A product that is not
 * built has no page and is not listed (D-039; Payroll left the site on 20 Oct 2026). Then
 * the sector pages, the guides' index and the guides (ALY-232, ALY-233). The list feeds the
 * canonical links, hreflang, the language link, the sitemap, the machine copies and the
 * site's checks. */
export const PATHS = {
  home: { en: "/", ar: "/ar" },
  chat: { en: "/chat", ar: "/ar/chat" },
  bookings: { en: "/bookings", ar: "/ar/bookings" },
  agent: { en: "/agent", ar: "/ar/agent" },
  accounts: { en: "/accounts", ar: "/ar/accounts" },
  shelf: { en: "/shelf", ar: "/ar/shelf" },
  docs: { en: "/docs", ar: "/ar/docs" },
  // Not a product: the company's registration details (the footer links to it).
  company: { en: "/company", ar: "/ar/company" },
  // Not a product: the privacy policy (ALY-68); Meta's app settings point here.
  privacy: { en: "/privacy", ar: "/ar/privacy" },
  ...sectorPaths,
  guides: { en: "/guides", ar: "/ar/guides" },
  ...guidePaths,
} as const;

export type PageKey = keyof typeof PATHS;

/** A sector's page key, and a guide's. */
export const sectorPage = (key: SectorKey) => `for-${key}` as const;
export const guidePage = (key: GuideKey) => `guide-${key}` as const;

/** What kind of page a key is, for the structured data and the machine copies. */
export function pageKind(page: PageKey):
  | { kind: "home" } | { kind: "product"; key: ProductKey } | { kind: "sector"; key: SectorKey }
  | { kind: "guides" } | { kind: "guide"; key: GuideKey } | { kind: "plain"; key: "company" | "privacy" } {
  if (page === "home") return { kind: "home" };
  if (page === "company" || page === "privacy") return { kind: "plain", key: page };
  if (page === "guides") return { kind: "guides" };
  if (page.startsWith("for-")) return { kind: "sector", key: page.slice(4) as SectorKey };
  if (page.startsWith("guide-")) return { kind: "guide", key: page.slice(6) as GuideKey };
  return { kind: "product", key: page as ProductKey };
}

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
