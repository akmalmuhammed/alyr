import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import { ProductDemo } from "./ProductDemo";
import { contactHref, Shell } from "./Shell";

/** The page for ALYR Chat, the first product: what it does, shown as it is used, why
 * owners choose it, who it suits and what comes after it. */
export function ProductPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.product;
  const numbered = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <Shell locale={locale} page="chat" cta={p.cta}>
      <section className="product product-page" id="product">
        <div className="product-in">
          <div className="wrap">
            <div className="product-head">
              <p className="eyebrow eyebrow-dark">
                <span className="signal" aria-hidden="true" />
                {p.eyebrow}
              </p>
              <h1 className="display display-sm">{p.title}</h1>
              <p className="lead">{p.body}</p>
            </div>
            <ProductDemo product={p} locale={locale} />
            <ul className="product-facts">
              {p.facts.map((fact, index) => (
                <li key={fact.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                  <h3>{fact.title}</h3>
                  <p>{fact.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec approach" id="why">
        <div className="wrap approach-in">
          <div className="approach-say">
            <p className="eyebrow">{p.why.eyebrow}</p>
            <p className="statement" data-statement>
              {p.why.statement.split(" ").map((word, index) => (
                <span key={index} data-w>{word} </span>
              ))}
            </p>
          </div>
          <ol className="steps">
            {p.why.pillars.map((pillar, index) => (
              <li key={pillar.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                <span className="steps-n">{numbered(index)}</span>
                <div>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec who" id="who">
        <div className="wrap who-in">
          <div className="who-head" data-reveal>
            <p className="eyebrow">{p.who.eyebrow}</p>
            <h2 className="h1">{p.who.title}</h2>
          </div>
          <ul className="who-rows">
            {p.who.rows.map((row, index) => (
              <li key={row.name} data-reveal style={{ "--n": index } as React.CSSProperties}>
                <h3>{row.name}</h3>
                <p>{row.body}</p>
                <span className="tags">
                  {row.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </span>
              </li>
            ))}
            <li className="who-other" data-reveal>
              <a className="link" href={contactHref()}>
                {p.who.other}
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section className="sec company">
        <div className="wrap company-in" data-reveal>
          <p className="eyebrow">{p.next.eyebrow}</p>
          <p className="company-say">{p.next.body}</p>
          <svg className="company-path" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M0 164H520L700 36H1000L820 164H1180L1360 36H1600" />
            <path className="company-path-volt" pathLength="1" d="M1180 164L1360 36H1600" />
          </svg>
        </div>
      </section>
    </Shell>
  );
}
