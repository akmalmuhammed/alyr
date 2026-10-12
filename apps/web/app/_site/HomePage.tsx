import { Icon, Logo, Symbol } from "./brand";
import { copy, type Locale } from "./copy";
import { ProductDemo } from "./ProductDemo";
import { CONTACT_EMAIL, PATHS, WHATSAPP_NUMBER, WORKSPACE_URL } from "./site";
import { SiteMotion } from "./SiteMotion";

/** The ALYR company homepage. One component for both languages; all words come from
 * `copy.ts`, and the layout uses logical CSS properties so Arabic mirrors itself. */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const other = locale === "en" ? PATHS.ar : PATHS.en;
  // WhatsApp first, as the playbook asks; email if that is all there is; otherwise the
  // contact section, which says plainly that the line is being set up.
  const chat = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : "";
  const contact = chat || (CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "#contact");
  const links = [
    ["#product", t.nav.product],
    ["#approach", t.nav.approach],
    ["#who", t.nav.who],
  ] as const;

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>

      <header className="top" data-header>
        <div className="wrap top-in">
          <a className="top-logo" href={PATHS[locale]} aria-label={t.nav.home}>
            <Logo label="ALYR" className="logo" />
          </a>
          <nav className="top-nav" aria-label={t.nav.sections}>
            {links.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="top-end">
            <a className="top-lang" href={other} lang={locale === "en" ? "ar" : "en"} hrefLang={locale === "en" ? "ar" : "en"}>
              {t.nav.other}
            </a>
            <a className="btn btn-volt btn-sm" href={contact}>{t.nav.cta}</a>
            <details className="top-menu">
              <summary aria-label={t.nav.menu}><Icon name="menu" className="ico" /></summary>
              <div className="top-menu-list">
                {links.map(([href, label]) => (
                  <a key={href} href={href}>{label}</a>
                ))}
                <a href={other} lang={locale === "en" ? "ar" : "en"}>{t.nav.other}</a>
                <a href={contact}>{t.nav.cta}</a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ---------------------------------------------------------------- hero */}
        <section className="hero">
          <div className="wrap hero-in">
            <div className="hero-title">
              <p className="eyebrow hero-eyebrow">
                <span className="signal" aria-hidden="true" />
                {t.hero.eyebrow}
              </p>
              <h1 className="display">
                {t.hero.title.map((line, index) => (
                  <span className="display-line" key={line} style={{ "--n": index } as React.CSSProperties}>
                    <span>{line}</span>
                  </span>
                ))}
              </h1>
            </div>
            <div className="hero-copy">
              <p className="lead hero-body">{t.hero.body}</p>
              <div className="hero-actions">
                <a className="btn btn-volt" href="#product">
                  {t.hero.primary}
                  <Icon name="arrow-right" className="ico ico-flip" />
                </a>
                <a className="link" href="#approach">
                  {t.hero.secondary}
                  <Icon name="arrow-right" className="ico ico-flip" />
                </a>
              </div>
            </div>

            {/* One conversation on the customer's phone, and the three records it becomes in
                the business's workspace. This is the hero sentence, drawn. */}
            <figure className="flow" aria-label={t.hero.visual.label}>
              <span className="tick tick-a" aria-hidden="true" />
              <span className="tick tick-b" aria-hidden="true" />
              <span className="tick tick-c" aria-hidden="true" />
              <span className="tick tick-d" aria-hidden="true" />

              <div className="wa wa-mini">
                <div className="wa-top">
                  <span className="wa-avatar" aria-hidden="true">{t.hero.visual.business.slice(0, 1)}</span>
                  <span className="wa-who"><b>{t.hero.visual.business}</b></span>
                </div>
                <ol className="wa-thread">
                  {t.hero.visual.chat.map((line, index) => (
                    <li
                      key={line.text}
                      className={`wa-msg wa-tail ${line.from === "customer" ? "wa-out" : "wa-in"}`}
                      style={{ "--n": index } as React.CSSProperties}
                    >
                      <div className="wa-bubble">
                        <span className="wa-text" dir="auto">{line.text}</span>
                        <span className="wa-meta">
                          <span dir="ltr">{line.time}</span>
                          {line.from === "customer" && (
                            <svg className="wa-ticks" viewBox="0 0 18 12" aria-hidden="true">
                              <path d="M1 6.5 4.2 9.7 10.6 2.3" />
                              <path d="M7.2 9.7 13.6 2.3" transform="translate(3.4 0)" />
                            </svg>
                          )}
                        </span>
                      </div>
                      {line.action && (
                        <div className="wa-cta">
                          <svg viewBox="0 0 24 24" aria-hidden="true" className="ico-flip"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                          {line.action}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flow-via">
                <span className="flow-line" aria-hidden="true" />
                <span className="flow-mark" aria-hidden="true"><Symbol className="flow-symbol" /></span>
                <span className="eyebrow">{t.hero.visual.via}</span>
                <span className="flow-line" aria-hidden="true" />
              </div>

              <ul className="flow-rows">
                {t.hero.visual.rows.map((row, index) => (
                  <li key={row.title} className={row.done ? "is-done" : undefined} style={{ "--n": index } as React.CSSProperties}>
                    <Icon name={row.icon} className="flow-ico" />
                    <span className="flow-what">
                      <b>{row.title}</b>
                      <small dir="auto">{row.detail}</small>
                    </span>
                    <span className="flow-status">{row.status}</span>
                  </li>
                ))}
              </ul>
              <figcaption>{t.hero.visual.note}</figcaption>
            </figure>
          </div>

          <div className="wrap">
            <ul className="facts">
              {t.hero.facts.map((fact, index) => (
                <li key={fact}>
                  <span className="facts-n">{String(index + 1).padStart(2, "0")}</span>
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ approach */}
        <section className="sec approach" id="approach">
          <div className="wrap approach-in">
            <div className="approach-say">
              <p className="eyebrow">{t.approach.eyebrow}</p>
              <p className="statement" data-statement>
                {t.approach.statement.split(" ").map((word, index) => (
                  <span key={index} data-w>{word} </span>
                ))}
              </p>
            </div>
            <ol className="steps">
              {t.approach.steps.map((step, index) => (
                <li key={step.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                  <span className="steps-n">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------- product */}
        <section className="product" id="product">
          <div className="product-in">
            <div className="wrap">
              <div className="product-head" data-reveal>
                <p className="eyebrow eyebrow-dark">
                  <span className="signal" aria-hidden="true" />
                  {t.product.eyebrow}
                </p>
                <h2 className="h1">{t.product.title}</h2>
                <p className="lead">{t.product.body}</p>
              </div>
              <ProductDemo product={t.product} locale={locale} />
              <ul className="product-facts">
                {t.product.facts.map((fact, index) => (
                  <li key={fact.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                    <h3>{fact.title}</h3>
                    <p>{fact.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- who */}
        <section className="sec who" id="who">
          <div className="wrap who-in">
            <div className="who-head" data-reveal>
              <p className="eyebrow">{t.who.eyebrow}</p>
              <h2 className="h1">{t.who.title}</h2>
            </div>
            <ul className="who-rows">
              {t.who.rows.map((row, index) => (
                <li key={row.name} data-reveal style={{ "--n": index } as React.CSSProperties}>
                  <h3>{row.name}</h3>
                  <p>{row.body}</p>
                  <span className="tags">
                    {row.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </span>
                </li>
              ))}
              <li className="who-other" data-reveal>
                <a className="link" href={contact}>
                  {t.who.other}
                  <Icon name="arrow-right" className="ico ico-flip" />
                </a>
              </li>
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------------- built */}
        <section className="sec built">
          <div className="wrap">
            <div className="built-head" data-reveal>
              <p className="eyebrow">{t.built.eyebrow}</p>
              <h2 className="h1">{t.built.title}</h2>
            </div>
            <ul className="built-grid">
              {t.built.items.map((item, index) => (
                <li key={item.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                  <Icon name={item.icon} className="built-ico" />
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- company */}
        <section className="sec company">
          <div className="wrap company-in" data-reveal>
            <p className="eyebrow">{t.company.eyebrow}</p>
            <p className="company-say">{t.company.body}</p>
            <svg className="company-path" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
              <path pathLength="1" d="M0 164H520L700 36H1000L820 164H1180L1360 36H1600" />
              <path className="company-path-volt" pathLength="1" d="M1180 164L1360 36H1600" />
            </svg>
          </div>
        </section>

        {/* ----------------------------------------------------------------- cta */}
        <section className="cta" id="contact">
          <div className="wrap cta-in" data-reveal>
            <Symbol className="cta-mark" />
            <h2 className="display display-sm">{t.cta.title}</h2>
            <p className="lead">{t.cta.body}</p>
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
            <a href={other} lang={locale === "en" ? "ar" : "en"}>{t.nav.other}</a>
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
