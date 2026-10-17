import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./brand";
import { copy, fill, type FlowSet, type InsideSection, type Locale, type ProductBar as Bar, type Questions, type ScreenSection, type WhoSection, type WorksSection } from "./copy";
import { FigCaption } from "./Drawings";
import { FlowDiagram } from "./FlowDiagram";
import { contactHref } from "./Shell";
import { CONTACT_STATE, OFFER_LIVE, PRODUCTS, productPath, type ProductKey } from "./site";
import { rich } from "./Text";
import "./kit.css";

// The building blocks every product page shares (01-research.md D): the bar under the
// header, the opening on Carbon, how it works from both sides, the screen used every day,
// everything it does today and what is not built yet, who it is for, how it works with the
// rest of ALYR, questions. ALYR Chat's page uses the same pieces, so the four feel like one
// family. Every word comes from `copy.ts`.

const n = (index: number) => ({ "--n": index }) as CSSProperties;

/** The product's name and its sections, held under the header while the page is read. */
export function ProductBar({ bar }: { bar: Bar }) {
  return (
    <div className="pbar" data-pbar>
      <div className="wrap pbar-in">
        <a className="pbar-name" href="#product">
          <span className="signal" aria-hidden="true" />
          <bdi>{bar.label}</bdi>
        </a>
        <nav className="pbar-nav" aria-label={bar.label}>
          {bar.links.map((link) => (
            <a key={link.id} href={`#${link.id}`}>{link.label}</a>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** The opening: on the Carbon block, the name and state, a headline that names the result,
 * the lead, the demo, and three facts on one rule. */
export function ProductHero({ hero, children, id = "product" }: {
  hero: { eyebrow: string; title: [string, string]; lead: string; facts: string[]; factsOffer?: string[] };
  children: ReactNode;
  id?: string;
}) {
  const facts = OFFER_LIVE && hero.factsOffer ? [...hero.facts, ...hero.factsOffer] : hero.facts;
  return (
    <section className="product product-page" id={id} aria-labelledby={`${id}-title`}>
      <div className="product-in">
        <div className="wrap">
          <div className="product-head">
            <p className="eyebrow eyebrow-dark">
              <span className="signal" aria-hidden="true" />
              {rich(hero.eyebrow)}
            </p>
            <h1 className="display display-sm pk-title" id={`${id}-title`}>
              <span>{rich(hero.title[0])}</span> <span>{rich(hero.title[1])}</span>
            </h1>
            <p className="lead">{rich(hero.lead)}</p>
          </div>
          {children}
          <ul className={`product-facts pk-facts${facts.length > 3 ? " is-four" : ""}`}>
            {facts.map((fact, index) => (
              <li key={fact} data-reveal style={n(index)}>
                <p>{rich(fact)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** How it works, from both sides: one message followed through the customer's phone,
 * WhatsApp, ALYR and the team's screen. */
export function FlowSection({ flow }: { flow: FlowSet }) {
  return (
    <section className="sec how" id="how">
      <div className="wrap">
        <div className="how-head" data-reveal>
          <p className="eyebrow">{flow.eyebrow}</p>
          <h2 className="h1">{rich(flow.title)}</h2>
          <p className="lead">{rich(flow.body)}</p>
        </div>
        <div className="how-panel" data-reveal>
          <FlowDiagram flow={flow} />
        </div>
      </div>
    </section>
  );
}

/** The screen used every day, at true scale, with numbered callouts. */
export function ScreenBlock({ locale, screen, fictional, children, id = "screen", extra }: {
  locale: Locale;
  screen: ScreenSection;
  fictional?: string;
  children: ReactNode;
  id?: string;
  extra?: ReactNode;
}) {
  return (
    <section className="sec pk-screen" id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap">
        <div className="built-head" data-reveal>
          <p className="eyebrow">{screen.eyebrow}</p>
          <h2 className="h1" id={`${id}-title`}>{rich(screen.title)}</h2>
          {screen.body && <p className="lead">{rich(screen.body)}</p>}
        </div>
        <div className="pk-screen-grid">
          <figure className="pk-screen-fig" data-reveal>
            {children}
            <FigCaption locale={locale} caption={screen.caption} fictional={fictional} />
            {extra}
          </figure>
          <ol className="callouts" aria-label={screen.label} data-reveal>
            {screen.callouts.map((callout, index) => (
              <li key={callout}>
                <span className="co-n" aria-hidden="true"><bdi>{index + 1}</bdi></span>
                <span>{rich(callout)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Everything it does today, by audience; then, below a dashed rule, what is not built. */
export function InsideBlock({ inside }: { inside: InsideSection }) {
  return (
    <section className="sec inside" id="inside">
      <div className="wrap">
        <div className="built-head" data-reveal>
          <p className="eyebrow">{inside.eyebrow}</p>
          <h2 className="h1">{rich(inside.title)}</h2>
        </div>
        <div className="inside-grid">
          {inside.groups.map((group, index) => (
            <div key={group.name} data-reveal style={n(index)}>
              <h3 className="inside-name">
                <span className="signal" aria-hidden="true" />
                {rich(group.name)}
              </h3>
              <ul className="inside-list pk-list">
                {group.items.map((item) => (
                  <li key={item}><p>{rich(item)}</p></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="notyet" data-reveal>
          <span className="notyet-rule" aria-hidden="true" />
          <h3 className="inside-name notyet-k">
            <span className="dot-pending" aria-hidden="true" />
            {inside.notYet.title}
          </h3>
          <ul className="notyet-list">
            {inside.notYet.items.map((item) => (
              <li key={item}>{rich(item)}</li>
            ))}
          </ul>
        </div>
        {inside.note && <p className="inside-note" data-reveal>{rich(inside.note)}</p>}
      </div>
    </section>
  );
}

/** Who it's for: rows by kind of business, each with what it uses, and a way out. */
export function WhoBlock({ who }: { who: WhoSection }) {
  return (
    <section className="sec who" id="who">
      <div className="wrap who-in">
        <div className="who-head" data-reveal>
          <p className="eyebrow">{who.eyebrow}</p>
          <h2 className="h1">{rich(who.title)}</h2>
        </div>
        <ul className="who-rows pk-who">
          {who.rows.map((row, index) => (
            <li key={row.name} data-reveal style={n(index)}>
              <h3>{rich(row.name)}</h3>
              <span className="tags">
                {row.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </span>
            </li>
          ))}
          <li className="who-other" data-reveal>
            <a className="link" href={contactHref()}>
              {who.other}
              <Icon name="arrow-right" className="ico ico-flip" />
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

/** Works with the rest of ALYR: ruled rows in the suite's order, without the page's own
 * product, each saying what joining adds. Payroll is a dashed row with no link. */
export function WorksBlock({ locale, works, self }: { locale: Locale; works: WorksSection; self: ProductKey }) {
  const items = copy[locale].products.items;
  return (
    <section className="sec works" id="works" aria-labelledby="works-title">
      <div className="wrap">
        <div className="built-head" data-reveal>
          <p className="eyebrow">{works.eyebrow}</p>
          <h2 className="h1" id="works-title">{rich(works.title)}</h2>
        </div>
        <ul className="works-rows">
          {PRODUCTS.filter((key) => key !== self && works.rows[key]).map((key, index) => {
            const href = productPath(key, locale);
            const p = items[key];
            return (
              <li key={key} className={href ? undefined : "is-soon"} data-reveal style={n(index)}>
                <span className="works-name">
                  <b><bdi>{p.name}</bdi></b>
                  <small>{p.descriptor}</small>
                </span>
                <p className="works-say">{rich(works.rows[key]!)}</p>
                {href ? (
                  <a className="link works-link" href={href}>
                    <span>{rich(fill(works.link, { name: p.name }))}</span>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </a>
                ) : (
                  <span className="status-line works-link">
                    <span className="dot-pending" aria-hidden="true" />
                    <span>{p.state}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Questions, in native `<details>`: each with an address, the first one open. */
export function QuestionsBlock({ faq, id = "questions" }: { faq: Questions; id?: string }) {
  const items = faq.items.filter(
    (item) => (!item.state || item.state === CONTACT_STATE) && (item.offer === undefined || item.offer === OFFER_LIVE),
  );
  return (
    <section className="sec pk-faq" id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap faq-grid">
        <div className="faq-head">
          <div className="head">
            <p className="eyebrow">{faq.eyebrow}</p>
            <h2 className="h1" id={`${id}-title`}>{rich(faq.title)}</h2>
          </div>
        </div>
        <div className="faq-list">
          {items.map((item, index) => (
            <details key={item.id} id={`q-${item.id}`} className="qa" open={index === 0}>
              <summary>
                <span>{rich(item.q)}</span>
                <span className="qa-mark" aria-hidden="true" />
              </summary>
              <div className="qa-a">
                <p>{rich(item.a)}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
