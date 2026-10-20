import type { CSSProperties, ReactNode } from "react";
import { AgentFigure } from "./AgentFigure";
import { Icon } from "./brand";
import { ContactButton, ContactNote } from "./Contact";
import { copy, type Locale } from "./copy";
import { AgeBarCrop, FigCaption, OrderBarCrop, reportWords, SummaryCrop, TimesCrop, TrackScreen } from "./Drawings";
import { ReportPhone } from "./ReportPhone";
import { Phone, TickPath } from "./Frames";
import { HomeMotion } from "./HomeMotion";
import { REPORTS, SAMPLE_ORDER, SAMPLES } from "./samples";
import { contactHref, Shell } from "./Shell";
import { CONTACT_STATE, OFFER_LIVE, PATHS, PRODUCTS, productPath, TRUST_RECORDS, type TrustRecord } from "./site";
import { lines, rich } from "./Text";
import "./kit.css";
import "./home.css";

/**
 * The ALYR homepage: the suite, led by ALYR Agent (docs/agent-dashboard/07-site-brief.md).
 * In the order of 06-messaging.md §2: the hero with the real dashboard and the agent's live
 * feed on the Carbon plate; the whole screen, explained; the products; by business; how it
 * works; trust; questions; the closing call. Every word from `copy.ts`; every screen is the
 * product's own, with fictional businesses, and captioned as a sample.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;
  const other: Locale = locale === "en" ? "ar" : "en";

  return (
    <Shell locale={locale} page="home" cta={h.final} bar>
      <Hero locale={locale} />
      <Spotlight locale={locale} />
      <Suite locale={locale} />
      <Business locale={locale} />
      <How locale={locale} />
      {OFFER_LIVE && <Price locale={locale} />}
      <Trust locale={locale} other={other} />
      <Questions locale={locale} />
      <HomeMotion />
    </Shell>
  );
}

const n = (index: number) => ({ "--i": index }) as CSSProperties;

/** A section rule with a cross at each end, where it meets the grid's edges. */
function Rule({ dashed = false }: { dashed?: boolean }) {
  return (
    <div className={`rule${dashed ? " rule-dashed" : ""}`} aria-hidden="true">
      <i />
      <i />
    </div>
  );
}

function Head({ eyebrow, title, id, dark = false, children }: {
  eyebrow: string; title: string; id: string; dark?: boolean; children?: ReactNode;
}) {
  return (
    <div className="head">
      <p className={`eyebrow${dark ? " eyebrow-dark" : ""}`}>{rich(eyebrow)}</p>
      <h2 className="h2" id={id} data-split>{lines(title)}</h2>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------------ hero
function Hero({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const hero = t.home.hero;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap">
        <div className="hero-grid">
          <p className="eyebrow hero-eyebrow">
            <span className="signal" aria-hidden="true" />
            <span>{rich(hero.eyebrow)}</span>
          </p>
          <h1 className="display hero-title" id="hero-title">
            <span className="hl"><span>{hero.title[0]}</span></span>{" "}
            <span className="hl"><span>{hero.title[1]}</span></span>
          </h1>
          <div className="hero-side">
            <p className="hero-body">{rich(hero.body)}</p>
            <div className="hero-actions" data-hero-cta>
              <ContactButton locale={locale} lean />
              <a className="link hero-more" href="#products">
                {hero.more}
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </div>
            <ContactNote locale={locale} className="hero-note" />
          </div>
        </div>
        <ul className="hero-facts">
          {(OFFER_LIVE ? hero.facts : hero.factsNoOffer).map((fact, index) => <li key={fact} style={n(index)}>{rich(fact)}</li>)}
        </ul>
        <AgentFigure
          variant="hero"
          views={{ bakery: SAMPLES[locale].bakery }}
          order={["bakery"]}
          text={t.agent}
          figLabel={t.fig.label}
          caption={hero.figure.caption}
          label={hero.figure.label}
          feed
          crop
          headingLevel={2}
        />
      </div>
    </section>
  );
}

// ------------------------------------------------- ALYR Agent, the whole screen
function Spotlight({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const s = t.home.spotlight;
  const callouts = (
    <ol className="callouts" aria-label={s.calloutsLabel}>
      {s.callouts.map((callout, index) => (
        <li key={callout}>
          <span className="co-n" aria-hidden="true"><bdi>{index + 1}</bdi></span>
          <span>{rich(callout)}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <section className="hs spot" id="agent" aria-labelledby="spot-title">
      <div className="wrap">
        <Rule />
        <div className="spot-head">
          <Head eyebrow={s.eyebrow} title={s.title} id="spot-title">
            <p className="lead">{rich(s.body)}</p>
          </Head>
          <a className="link spot-link" href={PATHS.agent[locale]}>
            <span>{rich(s.link)}</span>
            <Icon name="arrow-right" className="ico ico-flip" />
          </a>
        </div>
        <AgentFigure
          variant="spot"
          views={SAMPLES[locale]}
          order={SAMPLE_ORDER}
          start="salon"
          text={t.agent}
          figLabel={t.fig.label}
          caption={s.caption}
          label={s.label}
          switcher
          headingLevel={3}
          aside={callouts}
          under={s.under}
        />
      </div>
    </section>
  );
}

// --------------------------------------------------------------- the products
function Suite({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const s = t.home.suite;
  const bakery = SAMPLES[locale].bakery;
  const crop: Record<(typeof PRODUCTS)[number], ReactNode> = {
    chat: <OrderBarCrop crops={s.crops} />,
    bookings: <TimesCrop crops={s.crops} />,
    agent: <SummaryCrop view={bakery} />,
    accounts: <AgeBarCrop view={bakery} label={s.crops.owed} />,
    payroll: null,
  };
  return (
    <section className="band suite" id="products" aria-labelledby="products-title">
      <div className="band-fold" aria-hidden="true" data-m>
        <i />
        <i />
        <i />
      </div>
      <div className="band-in">
        <div className="wrap">
          <Head eyebrow={s.eyebrow} title={s.title} id="products-title" dark>
            <p className="band-body">{rich(s.body)}</p>
          </Head>
          <ul className="suite-rows">
            {PRODUCTS.map((key, index) => {
              const p = t.products.items[key];
              const href = productPath(key, locale);
              const row = key === "payroll" ? null : s.rows[key];
              return (
                <li key={key} className={`suite-row${href ? "" : " is-soon"}`} data-m style={n(index)}>
                  <div className="suite-name">
                    <h3><bdi>{p.name}</bdi></h3>
                    <span className="suite-desc">{p.descriptor}</span>
                    <span className="suite-state">
                      {!href && <span className="dot-pending" aria-hidden="true" />}
                      {p.state}
                    </span>
                  </div>
                  <div className="suite-say">
                    {row && <p>{rich(row.body)}</p>}
                    {row && href && (
                      <a className="link link-dark" href={href}>
                        <span>{rich(row.link)}</span>
                        <Icon name="arrow-right" className="ico ico-flip" />
                      </a>
                    )}
                    {!href && <span className="sr-only">{t.products.payrollSr}</span>}
                  </div>
                  <div className="suite-crop">{crop[key]}</div>
                </li>
              );
            })}
          </ul>
          <div className="suite-notes">
            {s.notes.map((note) => (
              <p key={note.title}><b>{rich(note.title)}</b> {rich(note.body)}</p>
            ))}
          </div>
          <FigCaption locale={locale} caption={s.caption} />
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- by business
function Business({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const b = t.home.business;
  return (
    <section className="hs biz" id="business" aria-labelledby="business-title">
      <div className="wrap">
        <Rule />
        <Head eyebrow={b.eyebrow} title={b.title} id="business-title" />
        <ul className="biz-rows">
          {b.rows.map((row, index) => (
            <li key={row.name} className="biz-row" data-m style={n(index)}>
              <h3>{rich(row.name)}</h3>
              <p className="biz-body">{rich(row.body)}</p>
              <p className="biz-uses">
                <span className="biz-k">{b.uses}</span>
                <span className="biz-tags">
                {/* in the suite's order; ALYR Agent comes with each, so it closes the row, lighter */}
                {[...row.products]
                  .sort((a, b) => (a === "agent" ? 1 : b === "agent" ? -1 : PRODUCTS.indexOf(a) - PRODUCTS.indexOf(b)))
                  .map((key) => {
                  const href = productPath(key, locale);
                  const name = t.products.items[key].name;
                  // the tag shows the product's own word ("Chat"); its name is the whole one
                  const short = name.replace(/^ALYR\s+/, "");
                  const agent = key === "agent";
                  return href ? (
                    <a key={key} className={`tag tag-link${agent ? " tag-plus" : ""}`} href={href} aria-label={name}>
                      {agent && <span aria-hidden="true">{"+ "}</span>}<bdi>{short}</bdi>
                    </a>
                  ) : (
                    <span key={key} className="tag"><bdi>{short}</bdi></span>
                  );
                })}
                </span>
              </p>
              {row.note && (
                <p className="biz-note status-line">
                  <span className="dot-pending" aria-hidden="true" />
                  <span>{rich(row.note)}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
        <a className="link biz-other" href={contactHref()}>
          {b.other}
          <Icon name="arrow-right" className="ico ico-flip" />
        </a>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how it works
function How({ locale }: { locale: Locale }) {
  const w = copy[locale].home.how;
  return (
    <section className="hs how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <Rule />
        <Head eyebrow={w.eyebrow} title={w.title} id="how-title" />
        <div className="how-rail" data-rail>
          <span className="how-line" aria-hidden="true"><span data-rail-fill /></span>
          <ol className="how-steps">
            {w.steps.map((step, index) => (
              <li key={step.title} className="how-step" data-rail-step>
                <span className="how-node" aria-hidden="true"><bdi>{index + 1}</bdi></span>
                <h3>{rich(step.title)}</h3>
                <p>{rich(step.body)}</p>
              </li>
            ))}
          </ol>
          {/* step 4 opens into its report; beside it, the early-access note and a second way in */}
          <div className="how-foot">
            <div className="how-next">
              <p className="how-note">{rich(w.note)}</p>
              <ContactButton locale={locale} variant="line" />
            </div>
            <figure className="how-report" data-m>
              <ReportPhone sample={REPORTS[locale].bakery} words={reportWords(locale).bakery} />
              <FigCaption locale={locale} caption={w.report.caption} />
            </figure>
          </div>
        </div>
        <div className="how-lists">
          {[w.start, w.month].map((list) => (
            <div key={list.title} className="inc-list">
              <h3 className="mono-k">{list.title}</h3>
              <ul className="checks">
                {list.items.map((item, index) => (
                  <li key={item} data-m style={n(index)}>
                    <TickPath />
                    <span>{rich(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
            <p className="sheet-incl">{rich(p.includes)}</p>
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

          <figure className="agreement-fig">
            <div className="agreement" data-m>
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
            <FigCaption locale={locale} caption={a.caption} />
          </figure>
        </div>
        <div className="price-cta">
          <ContactButton locale={locale} lean />
          <ContactNote locale={locale} />
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------ trust
function Trust({ locale, other }: { locale: Locale; other: Locale }) {
  const tr = copy[locale].home.trust;
  const records = (Object.keys(TRUST_RECORDS) as TrustRecord[]).filter((key) => TRUST_RECORDS[key]);
  return (
    <section className="hs trust" id="trust" aria-labelledby="trust-title">
      <div className="wrap">
        <Rule />
        <div className="trust-grid">
          <div className="trust-copy">
            <Head eyebrow={tr.eyebrow} title={tr.title} id="trust-title">
              <p className="lead">{rich(tr.body)}</p>
            </Head>
            <ul className="facts6">
              {tr.facts.map((fact, index) => (
                <li key={fact.title} data-m style={n(index % 3)}>
                  <span className="mono-k">{fact.label}</span>
                  <h3>{rich(fact.title)}</h3>
                  <p>{rich(fact.body)}</p>
                </li>
              ))}
            </ul>
            {records.length > 0 && (
              <dl className="records" aria-label={tr.records.label}>
                {records.map((key) => (
                  <div key={key}>
                    <dt>{tr.records.items[key]}</dt>
                    <dd dir="auto">{TRUST_RECORDS[key]}</dd>
                  </div>
                ))}
              </dl>
            )}
            {OFFER_LIVE && <p className="trust-closing">{rich(tr.closing)}</p>}
          </div>
          <figure className="trust-fig" data-m>
            {/* On phones the pair scrolls sideways, so it takes keyboard focus. */}
            <div className="pair" tabIndex={0} role="group" aria-label={tr.figure.label}>
              {[locale, other].map((lang) => (
                <div key={lang} className={`pair-item pair-${lang}`} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
                  <Phone className="pair-phone"><TrackScreen sample={copy[lang].home.sample} lang={lang} /></Phone>
                </div>
              ))}
            </div>
            <FigCaption locale={locale} caption={tr.figure.caption} />
          </figure>
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
      </div>
    </section>
  );
}
