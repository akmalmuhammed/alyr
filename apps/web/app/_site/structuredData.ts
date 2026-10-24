// Structured data (JSON-LD) for the public pages, built from the same words the page shows
// (site audit 03, A4). Every value is a line already on the page or in its meta description,
// in the page's language, so the markup never claims more than the page does.
//
// Honest by construction (alyr-design/honesty.md):
// - no `offers`, `price`, `aggregateRating` or `review`: prices are off (D-034) and there are
//   no customers to rate anything;
// - no `legalName`, `taxID`, `address`, `foundingDate` or `sameAs` before the CR and accounts
//   exist;
// - nothing says a product is available: a product is described by its page's own meta
//   description (ALYR Docs' never says "available");
// - the questions are the ones the page shows, in its contact state and offer state.
//
// Types: Organization and WebSite (homepage), SoftwareApplication and BreadcrumbList (each
// product page), FAQPage (every page with questions). Rich results are not expected: Google
// shows FAQ results only for government and health sites, and software results need a price
// and a rating, which ALYR will not invent.

import { copy, type Locale, type Question } from "./copy";
import { CONTACT_EMAIL, CONTACT_STATE, OFFER_LIVE, PATHS, SITE_URL, type PageKey, type ProductKey } from "./site";

type Json = Record<string, unknown>;

const url = (path: string) => `${SITE_URL}${path === "/" ? "/" : path}`;
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

/** The questions a page shows, as the page filters them. */
function shown(items: Question[]): Question[] {
  return items.filter(
    (item) => (!item.state || item.state === CONTACT_STATE) && (item.offer === undefined || item.offer === OFFER_LIVE),
  );
}

function organization(locale: Locale): Json {
  const meta = copy[locale].meta.home;
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "ALYR",
    url: url(PATHS.home.en),
    logo: `${SITE_URL}/icon.svg`,
    description: OFFER_LIVE ? meta.description : meta.descriptionNoOffer ?? meta.description,
    ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
    areaServed: { "@type": "Country", name: "Qatar" },
    knowsLanguage: ["ar", "en"],
  };
}

function faq(locale: Locale, page: PageKey, items: Question[]): Json | null {
  const questions = shown(items);
  if (questions.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${url(PATHS[page][locale])}#questions`,
    inLanguage: locale,
    mainEntity: questions.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

function questionsOf(locale: Locale, page: PageKey): Question[] {
  const t = copy[locale];
  if (page === "home") return t.home.faq.items;
  if (page === "chat") return [];
  return t.pages[page].faq.items;
}

/** The JSON-LD graph for one page, in its language. */
export function structuredData(locale: Locale, page: PageKey): Json {
  const t = copy[locale];
  const graph: (Json | null)[] = [organization(locale)];
  if (page === "home") {
    graph.push({
      "@type": "WebSite",
      "@id": SITE_ID,
      name: "ALYR",
      url: url(PATHS.home[locale]),
      inLanguage: locale,
      publisher: { "@id": ORG_ID },
    });
  } else {
    const key = page as ProductKey;
    const product = t.products.items[key];
    const meta = t.meta[key];
    graph.push(
      {
        "@type": "SoftwareApplication",
        "@id": `${url(PATHS[key][locale])}#product`,
        name: product.name,
        alternateName: product.descriptor,
        description: meta.description,
        url: url(PATHS[key][locale]),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: locale,
        countriesSupported: "QA",
        provider: { "@id": ORG_ID },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ALYR", item: url(PATHS.home[locale]) },
          { "@type": "ListItem", position: 2, name: product.name, item: url(PATHS[key][locale]) },
        ],
      },
    );
  }
  graph.push(faq(locale, page, questionsOf(locale, page)));
  return { "@context": "https://schema.org", "@graph": graph.filter(Boolean) };
}

/** The graph as the text of a `<script type="application/ld+json">`: "<" escaped, so no
 * line of copy can close the script. */
export function structuredDataJson(locale: Locale, page: PageKey): string {
  return JSON.stringify(structuredData(locale, page)).replace(/</g, "\\u003c");
}
