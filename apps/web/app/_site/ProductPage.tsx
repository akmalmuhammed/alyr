import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import { FlowDiagram } from "./FlowDiagram";
import { ProductDemo } from "./ProductDemo";
import { ProductBar, WorksBlock } from "./ProductKit";
import { contactHref, Shell } from "./Shell";
import { productPath } from "./site";
import { lines, rich } from "./Text";

/** The page for ALYR Chat: WhatsApp orders, order tracking and the team inbox. What it does,
 * shown as it is used, how it works behind the chat, everything in it today, why owners
 * choose it, who it suits, and how it works with the rest of ALYR. Bookings have their
 * own page now (/bookings), and credit accounts theirs (/accounts). */
export function ProductPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.product;
  const numbered = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <Shell locale={locale} page="chat" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <section className="product product-page" id="product">
        <div className="product-in">
          <div className="wrap">
            <div className="product-head">
              <p className="eyebrow eyebrow-dark">
                <span className="signal" aria-hidden="true" />
                {p.eyebrow}
              </p>
              <h1 className="display display-sm pk-title">{lines(p.title)}</h1>
              <p className="lead">{p.body}</p>
            </div>
            <ProductDemo product={p} locale={locale} />
            <ul className="product-facts">
              {p.facts.map((fact, index) => (
                <li key={fact.title} data-reveal style={{ "--n": index } as React.CSSProperties}>
                  <h2>{fact.title}</h2>
                  <p>{fact.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec how" id="how">
        <div className="wrap">
          <div className="how-head" data-reveal>
            <p className="eyebrow">{p.flow.eyebrow}</p>
            <h2 className="h1">{p.flow.title}</h2>
            <p className="lead">{p.flow.body}</p>
          </div>
          <div className="how-panel" data-reveal>
            <FlowDiagram flow={p.flow} />
          </div>
        </div>
      </section>

      <section className="sec inside" id="inside">
        <div className="wrap">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{p.inside.eyebrow}</p>
            <h2 className="h1">{p.inside.title}</h2>
          </div>
          <div className="inside-grid">
            {p.inside.groups.map((group, index) => (
              <div key={group.name} data-reveal style={{ "--n": index } as React.CSSProperties}>
                <h3 className="inside-name">
                  <span className="signal" aria-hidden="true" />
                  {group.name}
                </h3>
                <ul className="inside-list">
                  {group.items.map((item) => (
                    <li key={item.title}>
                      <h4>{item.title}</h4>
                      <p>{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="inside-note" data-reveal>{p.inside.note}</p>
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
                <p>
                  {rich(row.body)}
                  {row.link && productPath(row.link.key, locale) && (
                    <>
                      {" "}
                      <a className="link who-link" href={productPath(row.link.key, locale)!}>
                        <span>{rich(row.link.label)}</span>
                        <Icon name="arrow-right" className="ico ico-flip" />
                      </a>
                    </>
                  )}
                </p>
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

      <WorksBlock locale={locale} works={p.works} self="chat" />
    </Shell>
  );
}
