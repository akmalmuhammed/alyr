import { Icon, Logo, Symbol } from "./brand";
import { ContactAddress, ContactButton, contactLink, ContactPending } from "./Contact";
import { copy, type Locale } from "./copy";
import { DohaTime } from "./DohaTime";
import { CONTACT_EMAIL, CONTACT_STATE, PATHS, WHATSAPP_NUMBER, WORKSPACE_URL, type PageKey } from "./site";
import { SiteMotion } from "./SiteMotion";
import { rich } from "./Text";

/** Where a plain "talk to us" link goes, without a filled-in message: WhatsApp first, as
 * the playbook asks; email if that is all there is; otherwise the contact section. */
export function contactHref(): string {
  if (WHATSAPP_NUMBER) return `https://wa.me/${WHATSAPP_NUMBER}`;
  return CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#contact";
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
  const links = [
    [at("#what"), t.nav.what],
    [PATHS.chat[locale], t.nav.product],
    [at("#how"), t.nav.how],
    [at("#price"), t.nav.price],
  ] as const;
  const contact = contactLink(locale);
  const other = PATHS[page][otherLocale];

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
            {links.map(([href, label]) => (
              <a key={href} href={href} aria-current={href === PATHS[page][locale] ? "page" : undefined}>{label}</a>
            ))}
          </nav>
          <div className="top-end">
            <a className="top-lang" href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>
              {t.nav.other}
            </a>
            <a className="btn btn-volt btn-sm btn-notch" href={contact}>{t.nav.cta[CONTACT_STATE]}</a>
            <details className="top-menu">
              <summary aria-label={t.nav.menu}><Icon name="menu" className="ico" /></summary>
              <div className="top-menu-list">
                {links.map(([href, label]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
                <a href={other} lang={otherLocale} hrefLang={otherLocale} data-lang>{t.nav.other}</a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main" data-page={page}>
        {children}

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
                      <span>{rich(t.contact.replyShort)}</span>
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
          <nav className="foot-nav" aria-label={t.footer.links}>
            {links.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
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
