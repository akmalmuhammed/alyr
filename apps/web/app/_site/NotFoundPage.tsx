import { Shell } from "./Shell";
import { copy, type Locale } from "./copy";
import { PATHS, PRODUCTS, productPath } from "./site";
import "./notfound.css";

// The page for an address with nothing behind it (design QA of the live site, F-02): the site's
// header and footer, one plain line, the way back to the homepage and a link to each product.
// It is published as `404.html` and `ar/404.html` (scripts/build-site.sh; Cloudflare serves the
// nearest one up the path), so it is static and holds nothing about the visitor. Words in
// copyNotFound.ts. The one Volt button is the header's (the page has no opening of its own).

export function NotFoundPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const n = t.notFound;
  return (
    <Shell locale={locale} page="not-found" cta={t.home.final}>
      <section className="nf" aria-labelledby="nf-title">
        <div className="wrap">
          <p className="nf-eyebrow"><bdi>{n.eyebrow}</bdi></p>
          <h1 className="nf-title" id="nf-title">{n.heading}</h1>
          <p className="nf-lead">{n.lead}</p>
          <p className="nf-actions">
            <a className="btn btn-line" href={PATHS.home[locale]}><span>{n.home}</span></a>
          </p>
          <nav className="nf-products" aria-labelledby="nf-products-k">
            <h2 className="nf-k" id="nf-products-k">{n.productsTitle}</h2>
            <ul className="nf-grid">
              {PRODUCTS.map((key) => {
                const p = t.products.items[key];
                return (
                  <li key={key}>
                    <a className="nf-link" href={productPath(key, locale)}>
                      <span className="nf-name"><bdi>{p.name}</bdi></span>
                      <span className="nf-line">{p.line}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </section>
    </Shell>
  );
}
