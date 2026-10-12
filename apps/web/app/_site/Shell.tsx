import { Icon, Logo, Symbol } from "./brand";
import { copy, type Locale } from "./copy";
import { CONTACT_EMAIL, PATHS, WHATSAPP_NUMBER, WORKSPACE_URL, type PageKey } from "./site";
import { SiteMotion } from "./SiteMotion";

/** How a visitor reaches us: WhatsApp first, as the playbook asks; email if that is all
 * there is; otherwise the contact section, which says the line is being set up. */
export function contactHref(): string {
  if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}`;
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#contact";
}

/** The header, the closing call to action and the footer that every public page shares. */
export function Shell({
  locale, page, cta, children,
}: {
  locale: Locale;
  page: PageKey;
  cta: { title: string; body: string };
  children: React.ReactNode;
}) {
  const t = copy[locale];
  const otherLocale = locale === "en" ? "ar" : "en";
  const home = PATHS.home[locale];
  // On the homepage the section links stay on the page; elsewhere they go back to it.
  const at = (hash: string) => (page === "home" ? hash : `${home}${hash}`);
  const links = [
    [at("#services"), t.nav.services],
    [PATHS.chat[locale], t.nav.product],
    [at("#approach"), t.nav.approach],
  ] as const;
  const contact = contactHref();
  const chat = WHATSAPP_NUMBER !== "";

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>

      <header className="top" data-header>
        <div className="wrap top-in">
          <a className="top-logo" href={home} aria-label={t.nav.home}>
            <Logo label="ALYR" className="logo" />
          </a>
          <nav className="top-nav" aria-label={t.nav.sections}>
            {links.map(([href, label]) => (
              <a key={href} href={href} aria-current={href === PATHS[page][locale] ? "page" : undefined}>{label}</a>
            ))}
          </nav>
          <div className="top-end">
            <a className="top-lang" href={PATHS[page][otherLocale]} lang={otherLocale} hrefLang={otherLocale}>
              {t.nav.other}
            </a>
            <a className="btn btn-volt btn-sm" href={contact}>{t.nav.cta}</a>
            <details className="top-menu">
              <summary aria-label={t.nav.menu}><Icon name="menu" className="ico" /></summary>
              <div className="top-menu-list">
                {links.map(([href, label]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
                <a href={PATHS[page][otherLocale]} lang={otherLocale}>{t.nav.other}</a>
                <a href={contact}>{t.nav.cta}</a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {children}

        <section className="cta" id="contact">
          <div className="wrap cta-in" data-reveal>
            <Symbol className="cta-mark" />
            <h2 className="display display-sm">{cta.title}</h2>
            <p className="lead">{cta.body}</p>
            {chat || CONTACT_EMAIL ? (
              <div className="cta-actions">
                <a className="btn btn-volt" href={contact}>
                  {chat ? t.cta.whatsapp : t.cta.email}
                  <Icon name="arrow-right" className="ico ico-flip" />
                </a>
                {CONTACT_EMAIL && (
                  <p className="cta-write">
                    {t.cta.write} <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr">{CONTACT_EMAIL}</a>
                  </p>
                )}
              </div>
            ) : (
              <p className="cta-pending">{t.cta.pending}</p>
            )}
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <div>
            <Logo label="ALYR" className="logo" />
            <p className="foot-line">{t.footer.line}</p>
          </div>
          <nav className="foot-nav" aria-label={t.nav.menu}>
            {links.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
            <a href={PATHS[page][otherLocale]} lang={otherLocale}>{t.nav.other}</a>
            {WORKSPACE_URL && <a href={WORKSPACE_URL}>{t.footer.workspace}</a>}
          </nav>
          <p className="foot-rights">
            <span><span dir="ltr">© 2026</span> {t.footer.rights}</span>
            <span>{t.footer.disclaimer}</span>
          </p>
        </div>
      </footer>
      <SiteMotion />
    </>
  );
}
