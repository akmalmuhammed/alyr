import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./brand";
import { ContactButton, ContactNote } from "./Contact";
import { copy, type Locale } from "./copy";
import {
  AskFigure, BookingScreen, ChatScreen, FigCaption, InboxSheet, ReportBubble, ShopStrip, TrackScreen,
} from "./Drawings";
import { Phone, TickPath } from "./Frames";
import { HomeMotion } from "./HomeMotion";
import { OrderFigure } from "./OrderFigure";
import { Shell } from "./Shell";
import { PATHS, TRUST_RECORDS, type TrustRecord } from "./site";
import { rich } from "./Text";
import "./home.css";

/**
 * The ALYR homepage: a working drawing of an owner's business (04-brief.md). Ten
 * sections, in the order of 02-messaging.md §3; every word from `copy.ts`; every product
 * screen drawn from the real one for one fictional bakery and captioned as a sample.
 * Layout uses logical properties, so Arabic mirrors itself; home.css mirrors the rest.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;
  const other: Locale = locale === "en" ? "ar" : "en";

  return (
    <Shell locale={locale} page="home" cta={h.final} bar>
      <Hero locale={locale} other={other} />
      <Problem locale={locale} />
      <Does locale={locale} />
      <How locale={locale} />
      <Included locale={locale} />
      <Price locale={locale} />
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
      <h2 className="h2" id={id} data-split>{rich(title)}</h2>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- 3.1 hero
function Hero({ locale, other }: { locale: Locale; other: Locale }) {
  const hero = copy[locale].home.hero;
  const record = hero.figure.record;
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">
            <span className="signal" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 className="display hero-title" id="hero-title">
            <span className="hl"><span>{hero.title[0]}</span></span>{" "}
            <span className="hl"><span>{hero.title[1]}</span></span>
          </h1>
          <p className="hero-body">{rich(hero.body)}</p>
          <div className="hero-actions" data-hero-cta>
            <ContactButton locale={locale} lean />
            <a className="link hero-how" href="#how">
              {hero.how}
              <Icon name="arrow-right" className="ico ico-flip" />
            </a>
          </div>
          <ContactNote locale={locale} className="hero-note" />
          <ul className="hero-facts">
            {hero.facts.map((fact, index) => <li key={fact} style={n(index)}>{rich(fact)}</li>)}
          </ul>
        </div>

        <figure className="hero-fig" aria-label={hero.figure.label}>
          <div className="hero-stage">
            <OrderFigure order={hero.figure.order} other={other} />
            <div className="hero-record" aria-hidden="true">
              <span className="rec-path">{hero.figure.order.shop} <span>/</span> {record.screen}</span>
              <span className="rec-head">
                <b>{rich(record.title)}</b>
                <span className="rec-chip"><span className="rec-dot" />{record.status}</span>
              </span>
              <span className="rec-name">{record.customer}</span>
              <span className="rec-by"><span className="d-avatar-sm">{record.initial}</span>{record.by}</span>
            </div>
          </div>
          <FigCaption locale={locale} caption={hero.figure.caption} />
          <p className="hero-hint">{hero.figure.hint}</p>
        </figure>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- 3.2 problem
function Problem({ locale }: { locale: Locale }) {
  const p = copy[locale].home.problem;
  return (
    <section className="hs problem" id="problem" aria-labelledby="problem-title">
      <div className="wrap">
        <Rule />
        <div className="problem-grid">
          <Head eyebrow={p.eyebrow} title={p.title} id="problem-title" />
          <ul className="prows">
            {p.rows.map((row, index) => (
              <li key={row.text} className="prow" data-m style={n(index)}>
                <span className="prow-text">{rich(row.text)}</span>
                {row.when && <span className="prow-when">{row.when}</span>}
              </li>
            ))}
          </ul>
        </div>
        <p className="turn" data-m>
          <strong>{rich(p.strong)}</strong> <span>{rich(p.muted)}</span>
        </p>
        <div className="for" data-m>
          <span className="for-label">{p.who.label}</span>
          <span className="for-group">
            <span className="for-k">{p.who.first}</span>
            {p.who.firstTags.map((tag) => <span key={tag} className="tag tag-first">{tag}</span>)}
          </span>
          <span className="for-group">
            <span className="for-k">{p.who.also}</span>
            {p.who.alsoTags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
          </span>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------- 3.3 what ALYR does (Carbon)
function Does({ locale }: { locale: Locale }) {
  const h = copy[locale].home;
  const d = h.does;
  const s = h.sample;
  const initial = h.hero.figure.record.initial;
  const chat = s.chat;

  const drawing: Record<(typeof d.modules)[number]["id"], ReactNode> = {
    orders: (
      <>
        <Phone className="sf-phone"><ChatScreen sample={s} bubbles={[chat.ask, chat.link, chat.placed]} /></Phone>
        <ShopStrip shop={s.shop} row={s.rows.order} initial={initial} signal className="sf-strip" />
      </>
    ),
    pay: (
      <>
        <Phone className="sf-phone"><ChatScreen sample={s} bubbles={[chat.placed, chat.receipt]} signalLast /></Phone>
        <ShopStrip shop={s.shop} row={s.rows.paid} initial={initial} signal className="sf-strip" />
      </>
    ),
    track: (
      <>
        <Phone className="sf-phone"><TrackScreen sample={s} lang={locale} /></Phone>
        <ShopStrip shop={s.shop} row={s.rows.ready} initial={initial} className="sf-strip" />
      </>
    ),
    inbox: <InboxSheet sample={s} />,
    book: (
      <>
        <Phone className="sf-phone"><BookingScreen sample={s} /></Phone>
        <ShopStrip shop={s.shop} row={s.rows.booking} initial={initial} className="sf-strip" />
      </>
    ),
  };

  return (
    <section className="band" id="what" aria-labelledby="what-title">
      <div className="band-fold" aria-hidden="true" data-m data-start="top 92%">
        <i />
        <i />
        <i />
      </div>
      <div className="band-in">
        <div className="wrap">
          <Head eyebrow={d.eyebrow} title={d.title} id="what-title" dark>
            <p className="band-body">{rich(d.body)}</p>
          </Head>

          <p className="product-line">
            <span className="signal" aria-hidden="true" />
            <b>{rich(d.product.name)}</b>
            <span>{rich(d.product.line)}</span>
            <span className="product-state">{d.product.state}</span>
          </p>

          <div className="story" data-story aria-label={d.storyLabel} role="group">
            <span className="story-rail" aria-hidden="true"><span data-fill /></span>
            {d.modules.map((module, index) => (
              <div key={module.id} className="story-step" style={n(index)}>
                <div className="story-text" data-text={index}>
                  <h3>{rich(module.title)}</h3>
                  <p>{rich(module.body)}</p>
                </div>
                <figure className={`story-fig sf-${module.id}`} data-fig={index}>
                  <div className="story-stage">{drawing[module.id]}</div>
                  <FigCaption locale={locale} caption={module.caption} />
                </figure>
              </div>
            ))}
          </div>

          <div className="also">
            <h3 className="mono-k mono-dark">{d.also.title}</h3>
            <ul className="also-cols">
              {d.also.items.map((item, index) => (
                <li key={item.title} data-m style={n(index)}>
                  <h4>{rich(item.title)}</h4>
                  <p>{rich(item.body)}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rail" role="group" aria-label={d.rail.label}>
            <div className="rail-item rail-now">
              <span className="rail-k">{d.rail.state}</span>
              <b>{rich(d.product.name)}</b>
              <span className="rail-say">{rich(d.product.line)}</span>
              <a className="link link-dark" href={PATHS.chat[locale]}>
                <span>{rich(d.rail.link)}</span>
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </div>
            {d.rail.slots.map((slot) => (
              <div key={slot} className="rail-item rail-slot">
                <span className="rail-k">{slot}</span>
              </div>
            ))}
            <p className="rail-line">{rich(d.rail.line)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ 3.4 how it works
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
          <figure className="how-report" data-m>
            <ReportBubble report={w.report} />
            <FigCaption locale={locale} caption={w.report.caption} />
          </figure>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------- 3.5 what is included
function Included({ locale }: { locale: Locale }) {
  const i = copy[locale].home.included;
  return (
    <section className="hs included" id="included" aria-labelledby="included-title">
      <div className="wrap">
        <Rule />
        <div className="inc-grid">
          <Head eyebrow={i.eyebrow} title={i.title} id="included-title">
            <p className="lead">{rich(i.body)}</p>
          </Head>
          {[i.start, i.month].map((list, column) => (
            <div key={list.title} className={`inc-list inc-list-${column + 1}`}>
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
          <figure className="inc-fig" data-m>
            <AskFigure fig={i.figure} />
            <FigCaption locale={locale} caption={i.figure.caption} />
          </figure>
        </div>
        <div className="inc-more">
          <Rule dashed />
          <h3>{rich(i.more.title)}</h3>
          <p>{rich(i.more.body)}</p>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------- 3.6 price and the first month
function Price({ locale }: { locale: Locale }) {
  const p = copy[locale].home.price;
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
                <bdi className="sheet-digits">
                  {p.amount.split("").map((digit, index) => (
                    <span key={index} className="digit" style={n(index)}><span>{digit}</span></span>
                  ))}
                </bdi>
                <span className="sheet-unit">
                  <span>{p.currency}</span>
                  <span>{p.period}</span>
                </span>
              </span>
            </p>
            <p className="sheet-setup">{rich(p.setup)}</p>
            <p className="sheet-incl">{rich(p.includes)}</p>
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
              <span className="ag-top">
                <span className="ag-kicker">{a.kicker}</span>
                <span className="ag-parties">{rich(a.parties)}</span>
              </span>
              <h3 className="ag-title">
                {a.titleLead}{" "}
                <span className="ag-mark">
                  {a.titleMark}
                  <span className="ag-tick" aria-hidden="true"><TickPath /></span>
                </span>
              </h3>
              <p className="ag-body">{rich(a.body)}</p>
              <dl className="ag-fields">
                {a.fields.map((field) => (
                  <div key={field.label} className={field.blank ? "is-blank" : undefined}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.blank ? (
                        <span className="ag-blank"><span className="ag-line" aria-hidden="true" /><span>{field.value}</span></span>
                      ) : (
                        rich(field.value)
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="ag-print">{a.print}</p>
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

// ------------------------------------------------------------------- 3.7 trust
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
            <p className="trust-closing">{rich(tr.closing)}</p>
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

// --------------------------------------------------------------- 3.8 questions
function Questions({ locale }: { locale: Locale }) {
  const q = copy[locale].home.faq;
  return (
    <section className="hs faq" id="questions" aria-labelledby="questions-title">
      <div className="wrap">
        <Rule />
        <div className="faq-grid">
          <div className="faq-head">
            <Head eyebrow={q.eyebrow} title={q.title} id="questions-title" />
          </div>
          <div className="faq-list">
            {q.items.map((item, index) => (
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
