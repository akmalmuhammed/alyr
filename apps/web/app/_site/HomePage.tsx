import type { CSSProperties, ReactNode } from "react";
import { AgentFigure } from "./AgentFigure";
import { BusinessTabs } from "./BusinessTabs";
import { Actions, ContactButton, ContactNote, TryFreeNote } from "./Contact";
import { copy, type Locale, type Questions as QuestionSet } from "./copy";
import { FigCaption } from "./Drawings";
import { TickPath } from "./Frames";
import { FlowDiagram } from "./FlowDiagram";
import { DaySplit } from "./DaySplit";
import { HomeMotion } from "./HomeMotion";
import { HeroFilm } from "./HeroFilm";
import { HowCards } from "./HowCards";
import { SAMPLE_ORDER, SAMPLES } from "./samples";
import { SuiteFrame } from "./SuiteFrame";
import { contactHref, Shell } from "./Shell";
import { CONTACT_STATE, INCLUDED, OFFER_LIVE, PATHS, PRODUCTS, productPath, SECTORS, sectorPage, TRY_FREE_LIVE } from "./site";
import { lines, rich } from "./Text";
import "./kit.css";
import "./home.css";

/**
 * The ALYR homepage: ALYR as the technology team an owner-run business never had (ALY-210,
 * D-048, after D-047, folded on 24 Oct 2026). The hero says so in two plain sentences, beside a
 * film of one afternoon at a fictional bakery in the product's own screens (D-062); how we
 * work: check, set up, see and improve, then check again; the
 * visitor's own business, as tabs, whose "Today" list is what a check-up finds; one order
 * followed from the first message to collection, as proof; ALYR Agent; the products; the
 * price (offer on); questions; the closing call. Every word from `copy.ts`; every
 * screen is the product's own, with fictional businesses, each marked as a sample once.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;

  return (
    <Shell locale={locale} page="home" cta={h.final}>
      <Hero locale={locale} />
      <How locale={locale} />
      <Business locale={locale} />
      <See locale={locale} />
      <Spotlight locale={locale} />
      <Suite locale={locale} />
      {OFFER_LIVE && <Price locale={locale} />}
      <Questions locale={locale} />
      <HomeMotion />
    </Shell>
  );
}

const n = (index: number) => ({ "--i": index }) as CSSProperties;

/** A section rule: one plain hairline. */
function Rule() {
  return <div className="rule" aria-hidden="true" />;
}

/** A section's heading. The eyebrow is kept only where it says something the heading does
 * not (the Agent spotlight's product, the price); site audit R1. */
function Head({ eyebrow, title, id, dark = false, children }: {
  eyebrow?: string; title: string; id: string; dark?: boolean; children?: ReactNode;
}) {
  return (
    <div className="head">
      {eyebrow && <p className={`eyebrow${dark ? " eyebrow-dark" : ""}`}><span>{rich(eyebrow)}</span></p>}
      <h2 className="h2" id={id} data-split>{lines(title)}</h2>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------------ hero
/* The headline, the lead and the check-up on the start side; on the far side the
   film of one afternoon at Qirfa Bakery in the product (HeroFilm.tsx, D-062), on a Carbon plate
   cut by the fold and clear of the headline, which stays the page's largest paint. On a phone
   the plate comes under the text. */
function Hero({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const hero = t.home.hero;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-text">
          <h1 className="display hero-title" id="hero-title">
            <span className="hl"><span>{hero.title[0]}</span></span>{" "}
            <span className="hl"><span>{hero.title[1]}</span></span>
          </h1>
          <p className="hero-lead">{rich(hero.lead)}</p>
          <div className={TRY_FREE_LIVE ? "hero-actions is-pair" : "hero-actions"} data-hero-cta>
            <Actions locale={locale} lean label={hero.action} />
            <a className="link hero-more" href="#how">{hero.more}</a>
          </div>
          {TRY_FREE_LIVE ? <TryFreeNote locale={locale} className="hero-note" /> : <ContactNote locale={locale} className="hero-note" address={false} />}
        </div>
      </div>
      <HeroFilm locale={locale} />
    </section>
  );
}

// ------------------------------------------------- ALYR Agent, the whole screen
function Spotlight({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const s = t.home.spotlight;
  const callouts = (
    <ul className="callouts" aria-label={s.calloutsLabel}>
      {s.callouts.map((callout) => (
        <li key={callout}>{rich(callout)}</li>
      ))}
    </ul>
  );
  return (
    <section className="hs spot" id="agent" aria-labelledby="spot-title">
      <div className="wrap">
        <Rule />
        <div className="open-split">
          <Head eyebrow={s.eyebrow} title={s.title} id="spot-title" />
          <div className="open-end">
            <p className="lead">{rich(s.body)}</p>
            <a className="link" href={PATHS.agent[locale]}><span>{rich(s.link)}</span></a>
          </div>
        </div>
        <AgentFigure
          variant="spot"
          views={SAMPLES[locale]}
          order={SAMPLE_ORDER}
          start="bakery"
          text={t.agent}
          label={s.label}
          switcher
          headingLevel={3}
          aside={callouts}
          more={s.more}
        />
      </div>
    </section>
  );
}

// --------------------------------------------------------------- the products
/* One shop, six products (framer-review P1): the suite as one fictional bakery's workspace on
   a Carbon plate, a tile per product, each one link to its page (SuiteFrame.tsx); then what
   holds for every product. It opens full (the heading across the grid, the lead under it), so
   it never repeats the split opening of ALYR Agent just before it. */
function Suite({ locale }: { locale: Locale }) {
  const s = copy[locale].home.suite;
  return (
    <section className="hs suite" id="products" aria-labelledby="products-title">
      <div className="wrap">
        <Rule />
        <div className="open-full">
          <Head eyebrow={s.eyebrow} title={s.title} id="products-title">
            <p className="lead">{rich(s.body)}</p>
          </Head>
        </div>
        <SuiteFrame locale={locale} />
        <div className="suite-notes">
          {s.notes.map((note) => (
            <p key={note.title}><b>{rich(note.title)}</b> {rich(note.body)}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- by business
function Business({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const b = t.home.business;
  // the sector page that draws this business's afternoon (ALY-232), if it has one
  const pageOf = (id: string) => SECTORS.find((key) => t.sectors.items[key].row === id);
  const tags = (products: (typeof PRODUCTS)[number][]) =>
    // in the suite's order; ALYR Agent and ALYR Shelf come with each, so they close the row, lighter
    [...products]
      .sort((a, c) => Number(INCLUDED.includes(a)) - Number(INCLUDED.includes(c)) || PRODUCTS.indexOf(a) - PRODUCTS.indexOf(c))
      .map((key) => {
        const name = t.products.items[key].name;
        // the tag shows the product's own word ("Chat"); its name is the whole one
        const short = name.replace(/^ALYR\s+/, "");
        const plus = INCLUDED.includes(key);
        return (
          <a key={key} className={`tag tag-link${plus ? " tag-plus" : ""}`} href={productPath(key, locale)} aria-label={name}>
            {plus && <span aria-hidden="true">{"+ "}</span>}<bdi>{short}</bdi>
          </a>
        );
      });
  return (
    <section className="hs bizs" id="business" aria-labelledby="business-title">
      <div className="wrap">
        <Rule />
        <div className="open-full">
          <Head eyebrow={b.eyebrow} title={b.title} id="business-title" />
        </div>
        <BusinessTabs
          label={b.tabsLabel}
          tabs={[...b.rows, b.other].map((row) => ({ id: row.id, name: row.tab }))}
        >
          {b.rows.map((row, index) => (
            <div key={row.id} id={row.id} className={`biz-panel${index === 0 ? " is-on" : ""}`} role="tabpanel" aria-labelledby={`biz-tab-${row.id}`}>
              <h3 className="biz-name">{rich(row.name)}</h3>
              <DaySplit row={row} words={b.split} sample={t.fig.sample} />
              <div className="biz-cols">
                <div className="biz-col biz-day">
                  <p className="mono-k">{b.day}</p>
                  <ul>
                    {row.day.map((line) => <li key={line}>{rich(line)}</li>)}
                  </ul>
                </div>
                <div className="biz-col biz-with">
                  <p className="mono-k">{b.with}</p>
                  <ul>
                    {row.with.map((line) => <li key={line}>{rich(line)}</li>)}
                  </ul>
                </div>
              </div>
              {row.note && (
                <p className="biz-note status-line">
                  <span className="dot-pending" aria-hidden="true" />
                  <span>{rich(row.note)}</span>
                </p>
              )}
              <div className="biz-foot">
                <p className="biz-uses">
                  <span className="biz-k">{b.uses}</span>
                  <span className="biz-tags">{tags(row.products)}</span>
                </p>
                <span className="biz-acts">
                  {pageOf(row.id) && (
                    <a className="link biz-more" href={PATHS[sectorPage(pageOf(row.id)!)][locale]}>{t.sectors.items[pageOf(row.id)!].more}</a>
                  )}
                  <ContactButton locale={locale} variant="line" className="biz-ask" message={row} label={row.ask} />
                </span>
              </div>
            </div>
          ))}
          <div id={b.other.id} className="biz-panel biz-else" role="tabpanel" aria-labelledby={`biz-tab-${b.other.id}`}>
            <h3 className="biz-name">{rich(b.other.title)}</h3>
            <p className="biz-else-body">{rich(b.other.body)}</p>
            <a className="link" href={contactHref()}>{b.other.link}</a>
          </div>
        </BusinessTabs>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ one order, start to finish
function See({ locale }: { locale: Locale }) {
  const see = copy[locale].home.see;
  return (
    <section className="hs see" id="see" aria-labelledby="see-title">
      <div className="wrap">
        <div className="how-panel see-panel">
          <div className="open-split open-plate">
            <Head eyebrow={see.eyebrow} title={see.title} id="see-title" dark />
            <div className="open-end">
              <p className="lead">{rich(see.body)}</p>
              <a className="link link-dark" href={PATHS.chat[locale]}><span>{rich(see.link)}</span></a>
            </div>
          </div>
          <FlowDiagram flow={see} sample={copy[locale].fig.sample} note={copy[locale].agent.samples.bakery.fictional} />
        </div>
        <p className="lead see-tally">{rich(see.tally)}</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how we work
/**
 * Check, set up, see, improve: four cards, each a still canvas with one moving scene from
 * the product (HowCards.tsx, ALY-226); the last card's words say that we check again. Without
 * motion every scene is finished. Under them, what we need from you, with its button beside
 * the words it belongs to (ALY-303).
 */
function How({ locale }: { locale: Locale }) {
  const w = copy[locale].home.how;
  return (
    <section className="hs how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <Rule />
        <div className="open-split">
          <Head eyebrow={w.eyebrow} title={w.title} id="how-title" />
          <div className="open-end">
            <p className="lead">{rich(w.lead)}</p>
          </div>
        </div>
        <HowCards locale={locale} />
        <div className="how-foot">
          <h3 className="how-need-k">{w.need.title}</h3>
          <div className="how-need">
            <p>{rich(w.need.body)}</p>
            <ContactButton locale={locale} variant="line" label={copy[locale].home.final.action} />
          </div>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------- price and the first month (offer on)
function Price({ locale }: { locale: Locale }) {
  const p = copy[locale].home.price;
  const early = copy[locale].home.how.note;
  const a = p.agreement;
  return (
    <section className="hs price" id="price" aria-labelledby="price-title">
      <div className="wrap">
        <Rule />
        <Head eyebrow={p.eyebrow} title={p.title} id="price-title" />
        <div className="price-grid">
          <div className="sheet" data-m>
            <p className="sheet-price">
              <span className="sheet-from">{p.from}</span>
              <span className="sheet-figure">
                {p.currencyFirst && <span className="sheet-cur">{p.currency}</span>}
                <bdi className="sheet-digits">
                  {p.amount.split("").map((digit, index) => (
                    <span key={index} className="digit" style={n(index)}><span>{digit}</span></span>
                  ))}
                </bdi>
                <span className="sheet-unit">
                  {!p.currencyFirst && <span>{p.currency}</span>}
                  <span>{p.period}</span>
                </span>
              </span>
            </p>
            <p className="sheet-first">{rich(p.first)}</p>
            <h3 className="mono-k">{p.combosLabel}</h3>
            <dl className="ledger combos">
              {p.combos.map((row) => (
                <div key={row.label}>
                  <dt>{rich(row.label)}</dt>
                  <dd>{rich(row.value)}</dd>
                </div>
              ))}
            </dl>
            <p className="sheet-setup">{rich(p.setup)}</p>
            <p className="sheet-first-month">{rich(p.firstMonth)}</p>
            <h3 className="mono-k">{p.includesLabel}</h3>
            <ul className="sheet-incl">
              {p.includes.map((item) => <li key={item}>{rich(item)}</li>)}
            </ul>
            <p className="sheet-confirm">{rich(p.confirm)}</p>
            <p className="status-line sheet-early">
              <span className="dot-pending" aria-hidden="true" />
              <span>{rich(early)}</span>
            </p>
            <h3 className="mono-k">{p.ledgerLabel}</h3>
            <dl className="ledger">
              {p.ledger.map((row) => (
                <div key={row.label} className={row.strong ? "is-strong" : undefined}>
                  <dt>{row.label}</dt>
                  <dd>{rich(row.value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <figure className="agreement-fig fig-cap-end">
            <FigCaption locale={locale} caption={a.caption} />
            <div className="agreement" data-m data-nosnippet>
              <span className="agr-top">
                <span className="agr-kicker">{a.kicker}</span>
                <span className="agr-parties">{rich(a.parties)}</span>
              </span>
              <h3 className="agr-title">
                {a.titleLead}{" "}
                <span className="agr-mark">
                  {a.titleMark}
                  <span className="agr-tick" aria-hidden="true"><TickPath /></span>
                </span>
              </h3>
              <p className="agr-body">{rich(a.body)}</p>
              <dl className="agr-fields">
                {a.fields.map((field) => (
                  <div key={field.label} className={field.blank ? "is-blank" : undefined}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.blank ? (
                        <span className="agr-blank"><span className="agr-line" aria-hidden="true" /><span>{field.value}</span></span>
                      ) : (
                        rich(field.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="agr-print">{a.print}</p>
            </div>
          </figure>
        </div>
        <div className="price-cta">
          <Actions locale={locale} lean label={copy[locale].home.final.action} />
          {TRY_FREE_LIVE ? <TryFreeNote locale={locale} /> : <ContactNote locale={locale} />}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------- questions
function Questions({ locale }: { locale: Locale }) {
  const q = copy[locale].home.faq;
  const items = q.items.filter(
    (item) => (!item.state || item.state === CONTACT_STATE) && (item.offer === undefined || item.offer === OFFER_LIVE),
  );
  return (
    <section className="hs faq" id="questions" aria-labelledby="questions-title">
      <div className="wrap">
        <Rule />
        <div className="faq-grid">
          <div className="faq-head">
            <Head eyebrow={q.eyebrow} title={q.title} id="questions-title" />
          </div>
          <div className="faq-list">
            {items.slice(0, q.shown).map((item, index) => (
              <Answer key={item.id} item={item} open={index === 0} />
            ))}
            {items.length > q.shown && (
              <details className="faq-more">
                <summary>
                  <span>{q.more}</span>
                  <span className="qa-mark" aria-hidden="true" />
                </summary>
                {items.slice(q.shown).map((item) => (
                  <Answer key={item.id} item={item} />
                ))}
              </details>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Answer({ item, open = false }: { item: QuestionSet["items"][number]; open?: boolean }) {
  return (
    <details id={`q-${item.id}`} className="qa" open={open}>
      <summary>
        <span>{rich(item.q)}</span>
        <span className="qa-mark" aria-hidden="true" />
      </summary>
      <div className="qa-a">
        <p>{rich(item.a)}</p>
      </div>
    </details>
  );
}
