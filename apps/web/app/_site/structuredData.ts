// Structured data (JSON-LD) for the public pages, built from the same words the page shows
// (site audit 03, A4). Every value is a line already on the page or in its meta description,
// in the page's language, so the markup never claims more than the page does.
//
// Honest by construction (alyr-design/honesty.md):
// - no `offers`, `price`, `aggregateRating` or `review`: prices are off (D-034) and there are
//   no customers to rate anything;
// - `legalName`, `taxID`, `identifier`, `foundingDate` and the city come from the commercial
//   registration and the tax card (26 Oct 2026), nothing else, and `sameAs`
//   only lists profiles named in NEXT_PUBLIC_ALYR_SAME_AS, once each exists (D-056);
// - the contact point is the contact the page itself offers: WhatsApp once the number is set,
//   and the email address;
// - nothing says a product is available: a product is described by its page's own meta
//   description (ALYR Docs' never says "available");
// - the questions are the ones the page shows, in its contact state and offer state.
//
// Types: Organization and WebSite (homepage), SoftwareApplication and BreadcrumbList (each
// product page), WebPage and BreadcrumbList (each sector page, ALY-232), Article and
// BreadcrumbList (each guide, ALY-233; the author is "ALYR team", an organisation, never a
// person, D-043), CollectionPage (the guides' index), FAQPage (every page with questions). Rich results are not expected: Google
// shows FAQ results only for government and health sites, and software results need a price
// and a rating, which ALYR will not invent.

// the sector pages and guides (ALY-232, ALY-233), on a line of their own
import { GUIDES, guidePage, pageKind, sectorPage, type GuideKey, type SectorKey } from "./site";
import { copy, type Locale, type Question } from "./copy";
import { CONTACT_EMAIL, CONTACT_STATE, OFFER_LIVE, PATHS, SAME_AS, SITE_URL, WHATSAPP_NUMBER, type PageKey, type ProductKey } from "./site";

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
    // The company behind the name, as printed on its commercial registration and tax card.
    legalName: "alyr software W.L.L.",
    alternateName: "الير للبرمجيات",
    taxID: "5009341769",
    identifier: { "@type": "PropertyValue", name: "Commercial registration number, Qatar", value: "255539" },
    foundingDate: "2026-10-26",
    address: { "@type": "PostalAddress", addressLocality: "Doha", addressCountry: "QA" },
    areaServed: { "@type": "Country", name: "Qatar" },
    knowsLanguage: ["ar", "en"],
    ...(CONTACT_EMAIL || WHATSAPP_NUMBER
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            areaServed: "QA",
            availableLanguage: ["Arabic", "English"],
            ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
            ...(WHATSAPP_NUMBER ? { telephone: `+${WHATSAPP_NUMBER}`, url: `https://wa.me/${WHATSAPP_NUMBER}` } : {}),
          },
        }
      : {}),
    ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
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
  const kind = pageKind(page);
  if (kind.kind === "home") return t.home.faq.items;
  if (kind.kind === "sector") return t.sectors.items[kind.key].faq.items;
  if (kind.kind !== "product" || kind.key === "chat") return [];
  return t.pages[kind.key].faq.items;
}

type Crumb = [name: string, path: string];

function breadcrumbs(crumbs: Crumb[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: url(path) })),
  };
}

/** A sector page: a web page about one kind of business, from its own title and description,
 * naming the products the page says it would set up. */
function sectorGraph(locale: Locale, key: SectorKey): Json[] {
  const t = copy[locale];
  const s = t.sectors.items[key];
  const path = PATHS[sectorPage(key)][locale];
  return [
    {
      "@type": "WebPage",
      "@id": `${url(path)}#page`,
      name: s.title,
      description: s.meta.description,
      url: url(path),
      inLanguage: locale,
      isPartOf: { "@id": SITE_ID },
      publisher: { "@id": ORG_ID },
      about: { "@type": "Thing", name: s.name },
      mentions: s.products.rows.map((row) => ({ "@type": "SoftwareApplication", name: t.products.items[row.key].name, url: url(PATHS[row.key][locale]) })),
    },
    breadcrumbs([
      [t.sectors.crumbs.home, PATHS.home[locale]],
      [t.sectors.crumbs.business, `${PATHS.home[locale]}#business`],
      [s.name, path],
    ]),
  ];
}

/** A guide: an article by the ALYR team, dated as the page prints it. */
function guideArticle(locale: Locale, key: GuideKey): Json {
  const g = copy[locale].guides;
  const guide = g.items[key];
  const path = PATHS[guidePage(key)][locale];
  return {
    "@type": "Article",
    "@id": `${url(path)}#article`,
    headline: guide.title,
    description: guide.meta.description,
    url: url(path),
    mainEntityOfPage: url(path),
    inLanguage: locale,
    datePublished: guide.published,
    dateModified: guide.modified,
    author: { "@type": "Organization", name: g.by, url: url(PATHS.guides[locale]) },
    publisher: { "@id": ORG_ID },
  };
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
  }
  const kind = pageKind(page);
  if (kind.kind === "plain") {
    const page = kind.key;
    graph.push(
      {
        "@type": "WebPage",
        "@id": `${url(PATHS[page][locale])}#page`,
        name: t.meta[page].title,
        url: url(PATHS[page][locale]),
        inLanguage: locale,
        about: { "@id": ORG_ID },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ALYR", item: url(PATHS.home[locale]) },
          { "@type": "ListItem", position: 2, name: t.nav[page], item: url(PATHS[page][locale]) },
        ],
      },
    );
  }
  if (kind.kind === "sector") graph.push(...sectorGraph(locale, kind.key));
  if (kind.kind === "guide") {
    graph.push(
      guideArticle(locale, kind.key),
      breadcrumbs([
        [t.sectors.crumbs.home, PATHS.home[locale]],
        [t.guides.crumb, PATHS.guides[locale]],
        [t.guides.items[kind.key].title, PATHS[page][locale]],
      ]),
    );
  }
  if (kind.kind === "guides") {
    graph.push(
      {
        "@type": "CollectionPage",
        "@id": `${url(PATHS.guides[locale])}#page`,
        name: t.guides.title,
        description: t.guides.meta.description,
        url: url(PATHS.guides[locale]),
        inLanguage: locale,
        isPartOf: { "@id": SITE_ID },
        publisher: { "@id": ORG_ID },
        hasPart: GUIDES.map((key) => guideArticle(locale, key)),
      },
      breadcrumbs([
        [t.sectors.crumbs.home, PATHS.home[locale]],
        [t.guides.crumb, PATHS.guides[locale]],
      ]),
    );
  }
  if (kind.kind === "product") {
    const key: ProductKey = kind.key;
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
