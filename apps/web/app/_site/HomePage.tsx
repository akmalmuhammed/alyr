import { Icon } from "./brand";
import { ChatFigure } from "./ChatFigure";
import { copy, type Locale } from "./copy";
import { contactHref, Shell } from "./Shell";
import { PATHS } from "./site";

/** The ALYR company homepage: who ALYR is and everything it does for a business. The
 * first product, ALYR Chat, is one section here and has its own page. All words come
 * from `copy.ts`, and the layout uses logical CSS properties so Arabic mirrors itself. */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const numbered = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <Shell locale={locale} page="home" cta={t.cta}>
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
              <a className="btn btn-volt" href="#services">
                {t.hero.primary}
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
              <a className="link" href={PATHS.chat[locale]}>
                {t.hero.secondary}
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </div>
          </div>

          {/* What a business gets from ALYR, as a list: services, then the product. */}
          <figure className="flow board" aria-label={t.hero.board.label}>
            <span className="tick tick-a" aria-hidden="true" />
            <span className="tick tick-b" aria-hidden="true" />
            <span className="tick tick-c" aria-hidden="true" />
            <span className="tick tick-d" aria-hidden="true" />
            <p className="eyebrow board-head">{t.hero.board.heading}</p>
            <ul className="flow-rows">
              {t.hero.board.rows.map((row, index) => (
                <li key={row.title} className={row.featured ? "is-done" : undefined} style={{ "--n": index } as React.CSSProperties}>
                  <Icon name={row.icon} className="flow-ico" />
                  <span className="flow-what">
                    <b>{row.title}</b>
                    <small>{row.detail}</small>
                  </span>
                  <span className="flow-status">{row.tag}</span>
                </li>
              ))}
            </ul>
          </figure>
        </div>

        <div className="wrap">
          <ul className="facts">
            {t.hero.facts.map((fact, index) => (
              <li key={fact}>
                <span className="facts-n">{numbered(index)}</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ----------------------------------------------------------------- why */}
      <section className="sec why">
        <div className="wrap why-in">
          <p className="eyebrow">{t.why.eyebrow}</p>
          <p className="statement" data-statement>
            {t.why.statement.split(" ").map((word, index) => (
              <span key={index} data-w>{word} </span>
            ))}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------ services */}
      <section className="sec services" id="services">
        <div className="wrap">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{t.services.eyebrow}</p>
            <h2 className="h1">{t.services.title}</h2>
          </div>
          <ul className="built-grid services-grid">
            {t.services.items.map((item, index) => (
              <li key={item.title} data-reveal style={{ "--n": index % 3 } as React.CSSProperties}>
                <Icon name={item.icon} className="built-ico" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------- the product, briefly */}
      <section className="product" id="product">
        <div className="product-in">
          <div className="wrap teaser">
            <div className="teaser-copy" data-reveal>
              <p className="eyebrow eyebrow-dark">
                <span className="signal" aria-hidden="true" />
                {t.teaser.eyebrow}
              </p>
              <h2 className="h1">{t.teaser.title}</h2>
              <p className="lead">{t.teaser.body}</p>
              <a className="btn btn-volt" href={PATHS.chat[locale]}>
                {t.teaser.cta}
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </div>
            <div data-reveal>
              <ChatFigure figure={t.teaser.figure} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ approach */}
      <section className="sec approach" id="approach">
        <div className="wrap approach-in">
          <div className="approach-say" data-reveal>
            <p className="eyebrow">{t.approach.eyebrow}</p>
            <h2 className="h1">{t.approach.title}</h2>
          </div>
          <ol className="steps">
            {t.approach.steps.map((step, index) => (
              <li key={step.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                <span className="steps-n">{numbered(index)}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------------- who */}
      <section className="sec who" id="who">
        <div className="wrap who-in">
          <div className="who-head" data-reveal>
            <p className="eyebrow">{t.who.eyebrow}</p>
            <h2 className="h1">{t.who.title}</h2>
          </div>
          <ul className="who-rows who-plain">
            {t.who.rows.map((row, index) => (
              <li key={row.name} data-reveal style={{ "--n": index } as React.CSSProperties}>
                <h3>{row.name}</h3>
                <p>{row.body}</p>
              </li>
            ))}
            <li className="who-other" data-reveal>
              <a className="link" href={contactHref()}>
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
    </Shell>
  );
}
