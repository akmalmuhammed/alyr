import { Icon, Logo, Symbol } from "./brand";
import { ContactAddress, ContactButton, contactLink, ContactPending } from "./Contact";
import { copy, fill, type Locale } from "./copy";
import { DohaTime } from "./DohaTime";
import {
  CONTACT_EMAIL, CONTACT_STATE, OFFER_LIVE, PATHS, PRODUCTS, productPath, WHATSAPP_NUMBER, WORKSPACE_URL,
  type PageKey, type ProductKey,
} from "./site";
import { SiteMotion } from "./SiteMotion";
import { rich } from "./Text";
import { ThemeSwitch } from "./ThemeSwitch";

/** Where a plain "talk to us" link goes, without a filled-in message: WhatsApp first, as
 * the playbook asks; email if that is all there is; otherwise the contact section. */
export function contactHref(): string {
  if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}`;
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#contact";
}

/** The suite, as the Products menu lists it: every product in its fixed order, with its
 * one line and its state. Payroll has no page yet, so its row is not a link: it is drawn
 * on a dashed rule with the pending dot, and named for screen readers as coming. */
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
              const href = productPath(key, locale);
              const inner = (
                <>
                  <span className="pm-name"><bdi>{p.name}</bdi></span>
                  <span className="pm-line">{p.line}</span>
                  <span className="pm-state">
                    {!href && <span className="dot-pending" aria-hidden="true" />}
                    {p.state}
                  </span>
                </>
              );
              return (
                <li key={key} className={`pm-item${href ? "" : " pm-soon"}`}>
                  {href ? (
                    <a className="pm-link" href={href} aria-current={page === key ? "page" : undefined}>
                      {inner}
                      <Icon name="arrow-right" className="ico ico-flip pm-arrow" />
                    </a>
                  ) : (
                    <div className="pm-link">
                      <span className="pm-soon-in" aria-hidden="true">{inner}</span>
                      <span className="sr-only">{t.products.payrollSr}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </details>
  );
}

/** The header, the closing call to action and the footer that every public page shares.
 * `bar` adds the phone's sticky contact bar (the homepage). */
export function Shell({
  locale, page, cta, bar = false, children,
}: {
  locale: Locale;
  page: PageKey;
  cta: { title: string; body: string };
  bar?: boolean;
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
    ...(OFFER_LIVE ? [[at("#price"), t.nav.price] as const] : []),
  ] as const;
  const contact = contactLink(locale);
  const other = PATHS[page][otherLocale];
  const name = (key: ProductKey) => t.products.items[key].name;

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>

      <header className="top" data-header>
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
            <a className="btn btn-volt btn-sm btn-notch" href={contact}>{t.nav.cta[CONTACT_STATE]}</a>
            <details className="top-menu" data-menu>
              <summary aria-label={t.nav.menu}><Icon name="menu" className="ico" /></summary>
              <div className="top-menu-list">
                <p className="tm-k" aria-hidden="true">{t.nav.products}</p>
                <ul className="tm-products" aria-label={t.nav.productsMenu}>
                  {PRODUCTS.map((key) => {
                    const href = productPath(key, locale);
                    const p = t.products.items[key];
                    return (
                      <li key={key}>
                        {href ? (
                          <a href={href} aria-current={page === key ? "page" : undefined}>
                            <bdi>{p.name}</bdi>
                            <small>{p.state}</small>
                          </a>
                        ) : (
                          <span className="tm-soon">
                            <span aria-hidden="true"><bdi>{p.name}</bdi><small>{p.state}</small></span>
                            <span className="sr-only">{t.products.payrollSr}</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <span className="tm-rule" aria-hidden="true" />
                {sections.map(([href, label]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
                <a href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>{t.nav.other}</a>
                <ThemeSwitch locale={locale} place="menu" />
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main" data-page={page}>
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
              <h2 className="cta-title" id="contact-title">{rich(cta.title)}</h2>
              <p className="cta-body">{rich(cta.body)}</p>
              {CONTACT_STATE === "pending" ? (
                <ContactPending locale={locale} className="cta-pending" />
              ) : (
                <div className="cta-actions" data-final-cta>
                  <ContactButton locale={locale} lean />
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
            {PRODUCTS.map((key) => {
              const href = productPath(key, locale);
              return href ? (
                <a key={key} href={href} aria-current={page === key ? "page" : undefined}><bdi>{name(key)}</bdi></a>
              ) : (
                <span key={key} className="foot-soon">
                  <span aria-hidden="true"><bdi>{name(key)}</bdi> ({t.footer.coming})</span>
                  <span className="sr-only">{t.products.payrollSr}</span>
                </span>
              );
            })}
          </nav>
          <nav className="foot-nav foot-site" aria-label={t.footer.links}>
            <a href={at("#questions")}>{t.nav.questions}</a>
            <a href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>{t.nav.other}</a>
            {WORKSPACE_URL && <a href={WORKSPACE_URL}>{t.footer.workspace}</a>}
          </nav>
          <div className="foot-legal">
            <p>
              <span><span dir="ltr">© 2026</span> {rich(t.footer.rights)}</span>
              <DohaTime label={t.footer.doha} />
            </p>
            <p>{rich(t.footer.disclaimer)}</p>
          </div>
        </div>
      </footer>

      {bar && CONTACT_STATE !== "pending" && (
        <div className="bar" data-bar role="region" aria-label={t.contact.bar}>
          <ContactButton locale={locale} className="bar-btn" />
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
