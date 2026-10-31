import { Icon, Logo, Symbol } from "./brand";
import { ContactAddress, ContactButton, contactLink, ContactPending, TryFreeButton, TryFreeNote } from "./Contact";
import { copy, fill, type Locale } from "./copy";
import {
  CONTACT_EMAIL, CONTACT_STATE, INCLUDED, pageKind, PATHS, PRODUCTS, productPath, SECTORS, sectorPage, TRY_FREE_LIVE, TRY_FREE_URL, WHATSAPP_NUMBER, WORKSPACE_URL,
  type PageKey, type ProductKey,
} from "./site";
import { SiteMotion } from "./SiteMotion";
import { structuredDataJson } from "./structuredData";
import { rich } from "./Text";
import { ThemeSwitch } from "./ThemeSwitch";

/** Where a plain "talk to us" link goes, without a filled-in message: WhatsApp first, as
 * the playbook asks; email if that is all there is; otherwise the contact section. */
export function contactHref(): string {
  if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}`;
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#contact";
}

/** The suite, as the Products menu lists it: every product in its fixed order, with its
 * one line; the two that come with every product say so ("With every product"). */
function ProductsMenu({ locale, page }: { locale: Locale; page: PageKey }) {
  const t = copy[locale];
  return (
    <details className="pm" data-menu>
      <summary className="pm-btn">
        <span>{t.nav.products}</span>
        <Icon name="chevron-down" className="ico pm-chev" />
      </summary>
      <div className="pm-panel">
        <div className="wrap">
          <ul className="pm-grid" aria-label={t.nav.productsMenu}>
            {PRODUCTS.map((key) => {
              const p = t.products.items[key];
              return (
                <li key={key} className="pm-item">
                  <a className="pm-link" href={productPath(key, locale)} aria-current={page === key ? "page" : undefined}>
                    <span className="pm-name"><bdi>{p.name}</bdi></span>
                    <span className="pm-line">{p.line}</span>
                    {INCLUDED.includes(key) && <span className="pm-state">{p.state}</span>}
                    <Icon name="arrow-right" className="ico ico-flip pm-arrow" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}

/** The header, the closing call to action, the footer and the phone's sticky contact bar
 * that every public page shares. The bar comes up once the opening's own "Book a check-up"
 * has scrolled away and goes at the closing call (SiteMotion); the homepage and every
 * product page have that button (founder, 24 Oct 2026). */
export function Shell({
  locale, page, cta, children,
}: {
  locale: Locale;
  page: PageKey;
  /** The closing call. Its button, the header's and the phone bar's all say the one action,
   * "Book a check-up" (founder, 24 Oct 2026: one name on every page), from `home.final`
   * unless a page names its own; `short` is the header's on a phone. */
  cta: { title: string; body: string; action?: string; short?: string };
  children: React.ReactNode;
}) {
  const t = copy[locale];
  const otherLocale = locale === "en" ? "ar" : "en";
  const home = PATHS.home[locale];
  // On the homepage the section links stay on the page; elsewhere they go back to it.
  const at = (hash: string) => (page === "home" ? hash : `${home}${hash}`);
  const sections = [
    [at("#business"), t.nav.business],
    [at("#how"), t.nav.how],
    [at("#questions"), t.nav.questions],
    // The pricing page is its own page and always built (ALY-301); the homepage's price section
    // is behind the offer switch and has no link of its own.
    [PATHS.pricing[locale], t.nav.pricing],
  ] as const;
  const contact = contactLink(locale);
  const other = PATHS[page][otherLocale];
  const name = (key: ProductKey) => t.products.items[key].name;
  const action = cta.action ?? t.home.final.action;
  const short = cta.short ?? t.home.final.short;
  // A product page has the product bar under the header (`data-product` on <main>: its
  // sections land below both bars, kit.css). The homepage's hero, a sector page's opening and
  // a product page's have their own "Book a check-up" (`data-hero-cta`; on a product page
  // ProductKit's HeroAction, while ALYR can be reached): the header says so from the server
  // (`data-hero`), so its button is the outlined twin from the first paint and without
  // scripts (site.css). site:check holds the header's mark and the opening's button together
  // (scripts/site/has-check.mjs).
  const { kind } = pageKind(page);
  const product = kind === "product";
  const hero = kind === "home" || kind === "sector" || (product && CONTACT_STATE !== "pending");
  // While "Try it free" is on (site.ts), the pages that have an opening button lead with it and
  // keep "Book a check-up" as the outlined twin: their closing call says both. A guide, the
  // company page and the privacy page keep their own closing call, which is about writing to us;
  // the header's button says "Try it free" on every page.
  const both = TRY_FREE_LIVE && hero;
  const closing = both ? { title: t.tryFree.final.title, body: t.tryFree.final.body } : cta;
  // The phone's menu holds "Book a check-up" as a row of its own while the header's button says
  // "Try it free", so the check-up is one tap from every page on a phone.
  const menuLinks = TRY_FREE_LIVE ? [...sections, [contact, action] as const] : sections;

  return (
    <>
      {/* what the page is, for search and assistants, from the page's own words (structuredData.ts) */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson(locale, page) }} />
      <a className="skip" href="#main">{t.skip}</a>

      <header className="top" data-header data-hero={hero || undefined}>
        <div className="wrap top-in">
          <a className="top-logo" href={home} aria-label={t.nav.home}>
            <Logo label="ALYR" className="logo" />
            <Symbol className="logo-mark" />
          </a>
          <nav className="top-nav" aria-label={t.nav.sections}>
            <ProductsMenu locale={locale} page={page} />
            {sections.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="top-end">
            <a className="top-lang" href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>
              {t.nav.other}
            </a>
            <ThemeSwitch locale={locale} place="bar" />
            {TRY_FREE_LIVE ? (
              <a className="btn btn-volt btn-sm btn-notch" href={TRY_FREE_URL} data-cta="try-free-header">
                <span>{t.tryFree.action}</span>
              </a>
            ) : (
              <a className="btn btn-volt btn-sm btn-notch" href={contact}>
                <span className="top-cta-full">{action}</span>
                <span className="top-cta-short">{short}</span>
              </a>
            )}
            <details className="top-menu" data-menu>
              <summary aria-label={t.nav.menu}><Icon name="menu" className="ico" /></summary>
              <div className="top-menu-list">
                <p className="tm-k" aria-hidden="true">{t.nav.products}</p>
                <ul className="tm-products" aria-label={t.nav.productsMenu}>
                  {PRODUCTS.map((key) => {
                    const p = t.products.items[key];
                    return (
                      <li key={key}>
                        <a href={productPath(key, locale)} aria-current={page === key ? "page" : undefined}>
                          <bdi>{p.name}</bdi>
                          {INCLUDED.includes(key) && <small>{p.state}</small>}
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <span className="tm-rule" aria-hidden="true" />
                {menuLinks.map(([href, label]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
                <a href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>{t.nav.other}</a>
                <ThemeSwitch locale={locale} place="menu" />
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main" data-page={page} data-product={product || undefined}>
        {children}

        {/* The closing call opens with the fold, the page's signature: three Carbon planes
            with the symbol's gaps. */}
        <div className="band-fold cta-fold" aria-hidden="true" data-m>
          <i />
          <i />
          <i />
        </div>
        <section className="cta" id="contact" aria-labelledby="contact-title">
          <div className="wrap cta-in">
            <div className="cta-copy">
              <span className="cta-mark" data-m aria-hidden="true"><Symbol /></span>
              <h2 className="cta-title" id="contact-title">{rich(closing.title)}</h2>
              <p className="cta-body">{rich(closing.body)}</p>
              {CONTACT_STATE === "pending" ? (
                <ContactPending locale={locale} className="cta-pending" />
              ) : (
                <div className={both ? "cta-actions is-pair" : "cta-actions"} data-final-cta>
                  {both ? (
                    <>
                      <div className="cta-buttons">
                        <TryFreeButton locale={locale} lean />
                        <ContactButton locale={locale} variant="line" tone="band" label={action} />
                      </div>
                      <TryFreeNote locale={locale} tone="band" />
                    </>
                  ) : (
                    <ContactButton locale={locale} lean label={action} />
                  )}
                  {CONTACT_STATE === "whatsapp" ? (
                    <p className="cta-draft">
                      <span className="sr-only">{t.contact.draft}: </span>
                      <span dir="auto">{t.contact.prefill}</span>
                    </p>
                  ) : (
                    <p className="cta-write">
                      <ContactAddress locale={locale} className="cta-address" />
                    </p>
                  )}
                  <p className="cta-small">{t.contact.commits}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-sign">
            <Logo label="ALYR" className="logo" />
            <p className="foot-line">{t.footer.line}</p>
          </div>
          <nav className="foot-nav foot-products" aria-label={t.footer.products}>
            {PRODUCTS.map((key) => (
              <a key={key} href={productPath(key, locale)} aria-current={page === key ? "page" : undefined}><bdi>{name(key)}</bdi></a>
            ))}
          </nav>
          {/* the kinds of business with a page of their own, and the owner guides (ALY-232, ALY-233) */}
          <nav className="foot-nav foot-sectors" aria-labelledby="foot-sectors-k">
            <span className="foot-k mono-k" id="foot-sectors-k">{t.sectors.footer}</span>
            {SECTORS.map((key) => (
              <a key={key} href={PATHS[sectorPage(key)][locale]} aria-current={page === sectorPage(key) ? "page" : undefined}>{t.sectors.items[key].short}</a>
            ))}
          </nav>
          <nav className="foot-nav foot-site" aria-label={t.footer.links}>
            {/* what a card provider and a buyer look for first: pricing, terms, refunds, privacy (ALY-301) */}
            <a href={PATHS.pricing[locale]} aria-current={page === "pricing" ? "page" : undefined}>{t.nav.pricing}</a>
            <a href={PATHS.terms[locale]} aria-current={page === "terms" ? "page" : undefined}>{t.nav.terms}</a>
            <a href={PATHS.refund[locale]} aria-current={page === "refund" ? "page" : undefined}>{t.nav.refund}</a>
            <a href={PATHS.privacy[locale]} aria-current={page === "privacy" ? "page" : undefined}>{t.nav.privacy}</a>
            <a href={at("#questions")}>{t.nav.questions}</a>
            <a href={PATHS.guides[locale]} aria-current={page === "guides" ? "page" : undefined}>{t.guides.footer}</a>
            <a href={PATHS.company[locale]} aria-current={page === "company" ? "page" : undefined}>{t.nav.company}</a>
            <a href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>{t.nav.other}</a>
            {WORKSPACE_URL && <a href={WORKSPACE_URL}>{t.footer.workspace}</a>}
          </nav>
          <div className="foot-legal">
            <p>
              <span><span dir="ltr">© 2026</span> {rich(t.footer.rights)}</span>
            </p>
            <p>{t.footer.legal}</p>
            <p>{rich(t.footer.disclaimer)}</p>
          </div>
        </div>
      </footer>

      {CONTACT_STATE !== "pending" && (
        <div className="bar" data-bar role="region" aria-label={TRY_FREE_LIVE ? t.tryFree.bar : t.contact.bar}>
          {TRY_FREE_LIVE ? (
            <TryFreeButton locale={locale} className="bar-btn" cta="try-free-bar" />
          ) : (
            <ContactButton locale={locale} className="bar-btn" label={action} />
          )}
        </div>
      )}
      <SiteMotion />
    </>
  );
}

/** "See ALYR Bookings": a link to a product's page, in the page's words. */
export function seeProduct(locale: Locale, key: ProductKey): string {
  return fill(copy[locale].products.see, { name: copy[locale].products.items[key].name });
}
