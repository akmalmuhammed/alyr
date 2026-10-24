import type { CSSProperties, ReactNode } from "react";
import { AgentFigure } from "./AgentFigure";
import { Icon, type IconName } from "./brand";
import { BusinessTabs } from "./BusinessTabs";
import { ContactButton, ContactNote } from "./Contact";
import { copy, type BusinessRow, type Locale, type Questions as QuestionSet } from "./copy";
import { AgeBarCrop, FigCaption, OrderBarCrop, ReceiptCrop, ShelfCrop, SummaryCrop, TimesCrop, TrackScreen } from "./Drawings";
import { Phone, SampleMark, TickPath } from "./Frames";
import { FlowDiagram } from "./FlowDiagram";
import { FoldSplit } from "./FoldSplit";
import { HomeMotion } from "./HomeMotion";
import { SAMPLE_ORDER, SAMPLES } from "./samples";
import { contactHref, Shell } from "./Shell";
import { CONTACT_STATE, INCLUDED, OFFER_LIVE, PATHS, PRODUCTS, productPath, TRUST_RECORDS, type TrustRecord } from "./site";
import { lines, rich } from "./Text";
import "./kit.css";
import "./home.css";
import "./room.css";

/**
 * The ALYR homepage: ALYR as the technology team an owner-run business never had (ALY-210,
 * D-048, after D-047, folded on 24 Oct 2026). The hero says so, with why in one line (a big
 * company has consultants and an IT team; you have us), beside the real dashboard and the
 * feed of what ALYR did; how we work, a loop of check, set up, see and improve; the
 * visitor's own business, as tabs, whose "Today" list is what a check-up finds; one order
 * followed from the first message to collection, as proof; ALYR Agent; the products; the
 * price (offer on); trust; questions; the closing call. Every word from `copy.ts`; every
 * screen is the product's own, with fictional businesses, each marked as a sample once.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;
  const other: Locale = locale === "en" ? "ar" : "en";

  return (
    <Shell locale={locale} page="home" cta={h.final} bar>
      <Hero locale={locale} />
      <How locale={locale} />
      <Business locale={locale} />
      <See locale={locale} />
      <Spotlight locale={locale} />
      <Suite locale={locale} />
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

/** A section's heading. The eyebrow is kept only where it says something the heading does
 * not (the trust question, the Agent spotlight's product, the price); site audit R1. */
function Head({ eyebrow, title, id, dark = false, children }: {
  eyebrow?: string; title: string; id: string; dark?: boolean; children?: ReactNode;
}) {
  return (
    <div className="head">
      {eyebrow && <p className={`eyebrow${dark ? " eyebrow-dark" : ""}`}>{rich(eyebrow)}</p>}
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
          <h1 className="display hero-title" id="hero-title">
            <span className="hl"><span>{hero.title[0]}</span></span>{" "}
            <span className="hl"><span>{hero.title[1]}</span></span>
          </h1>
          <div className="hero-side">
            <p className="hero-lead">{rich(hero.lead)}</p>
            <div className="hero-actions" data-hero-cta>
              <ContactButton locale={locale} lean label={hero.action} />
              <a className="link hero-more" href="#how">
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
          sample={t.fig.sample}
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
          start="bakery"
          text={t.agent}
          label={s.label}
          switcher
          headingLevel={3}
          aside={callouts}
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
    shelf: <ShelfCrop crops={s.crops} soldOut={s.crops.shelf.find((i) => i.out)?.note ?? ""} />,
    docs: <ReceiptCrop crops={s.crops} />,
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
          {/* Six plain rows (site audit L1): the name, what it is, one sentence and its link,
              and a corner of its real screen at true size, marked as a sample. The corners'
              numbers are the bakery's samples, so a machine reads that first. */}
          <p className="sr-only">{t.agent.samples.bakery.fictional}</p>
          <ul className="suite-rows">
            {PRODUCTS.map((key) => {
              const p = t.products.items[key];
              const row = s.rows[key];
              return (
                <li key={key} id={`p-${key}`} className="suite-row">
                  <div className="suite-name">
                    <h3><bdi>{p.name}</bdi></h3>
                    <span className="suite-desc">{p.descriptor}</span>
                    {INCLUDED.includes(key) && <span className="suite-state">{p.state}</span>}
                  </div>
                  <div className="suite-say">
                    <p>{rich(row.body)}</p>
                    <a className="link link-dark" href={productPath(key, locale)}>
                      <span>{rich(row.link)}</span>
                      <Icon name="arrow-right" className="ico ico-flip" />
                    </a>
                  </div>
                  <div className="suite-crop" data-nosnippet>
                    <SampleMark label={t.fig.sample} />
                    {crop[key]}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="suite-notes">
            {s.notes.map((note) => (
              <p key={note.title}><b>{rich(note.title)}</b> {rich(note.body)}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- by business
function Business({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const b = t.home.business;
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
        <Head eyebrow={b.eyebrow} title={b.title} id="business-title" />
        <BusinessTabs
          label={b.tabsLabel}
          tabs={[...b.rows, b.other].map((row) => ({ id: row.id, name: row.tab, icon: <Icon name={BUSINESS_ICON[row.id] ?? "plus"} /> }))}
        >
          {b.rows.map((row, index) => (
            <div key={row.id} id={row.id} className={`biz-panel${index === 0 ? " is-on" : ""}`} role="tabpanel" aria-labelledby={`biz-tab-${row.id}`}>
              <h3 className="biz-name">{rich(row.name)}</h3>
              <FoldSplit
                label={b.split.label}
                today={b.split.today}
                with={b.split.with}
                slider={b.split.slider}
                value={b.split.value}
                before={<DayChats row={row} words={b.split} />}
                after={<DayOrders row={row} words={b.split} sample={t.fig.sample} />}
              />
              <div className="biz-cols">
                <div className="biz-col biz-day">
                  <p className="mono-k">{b.day}</p>
                  <ul>
                    {row.day.map((line) => (
                      <li key={line}>
                        <span className="biz-mark" aria-hidden="true" />
                        <span>{rich(line)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="biz-col biz-with">
                  <p className="mono-k">{b.with}</p>
                  <ul>
                    {row.with.map((line) => (
                      <li key={line}>
                        <span className="biz-tick" aria-hidden="true"><TickPath /></span>
                        <span>{rich(line)}</span>
                      </li>
                    ))}
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
                <ContactButton locale={locale} variant="line" className="biz-ask" message={row} label={row.ask} />
              </div>
            </div>
          ))}
          <div id={b.other.id} className="biz-panel biz-else" role="tabpanel" aria-labelledby={`biz-tab-${b.other.id}`}>
            <h3 className="biz-name">{rich(b.other.title)}</h3>
            <p className="biz-else-body">{rich(b.other.body)}</p>
            <a className="link" href={contactHref()}>
              {b.other.link}
              <Icon name="arrow-right" className="ico ico-flip" />
            </a>
          </div>
        </BusinessTabs>
      </div>
    </section>
  );
}

const BUSINESS_ICON: Record<string, IconName> = {
  bakery: "bakery", wholesale: "crate", fashion: "hanger", restaurant: "cup", salon: "scissors", "home-services": "wrench",
};

type SplitWords = (typeof copy)["en"]["home"]["business"]["split"];

/** The owner's chats this afternoon, as WhatsApp lists them: voice notes, photos, "is it
 * ready??", each unread. The header counts them all; FoldSplit climbs to it once. */
function DayChats({ row, words }: { row: BusinessRow; words: SplitWords }) {
  const unread = row.chats.reduce((sum, chat) => sum + chat.n, 0);
  return (
    <div className="dc">
      <div className="dc-top">
        <b>{words.chats}</b>
        <span className="dc-unread"><bdi data-unread={unread}>{unread}</bdi> {words.unread}</span>
      </div>
      <ul>
        {row.chats.map((chat) => (
          <li key={chat.who} className="dc-row">
            <span className="dc-av">{chat.who.slice(0, 1)}</span>
            <span className="dc-main">
              <b>{chat.who}</b>
              <span className="dc-prev">
                {chat.kind !== "text" && <Icon name={chat.kind === "voice" ? "mic" : "camera"} />}
                <span dir="auto">{chat.text}</span>
              </span>
            </span>
            <span className="dc-side">
              <span className="dc-at">{chat.at}</span>
              <span className="dc-n">{chat.n}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The same customers, row for row, as ALYR keeps them: a reference, what it is, who on the
 * team has it, and where it stands. */
function DayOrders({ row, words, sample }: { row: BusinessRow; words: SplitWords; sample: string }) {
  return (
    <div className="do">
      <div className="do-top">
        <b>{words.orders}</b>
        <SampleMark label={sample} />
        <span className="do-count"><bdi>{row.orders.length}</bdi></span>
      </div>
      <ul>
        {row.orders.map((order) => (
          <li key={order.who + order.ref} className="do-row">
            <span className="do-ref"><bdi>{order.ref}</bdi></span>
            <span className="do-main">
              <b>{order.who}</b>
              <span>{order.what}</span>
            </span>
            <span className="do-by"><i>{order.by.slice(0, 1)}</i><span>{order.by}</span></span>
            <span className={`do-st is-${order.tone}`}>{order.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ one order, start to finish
function See({ locale }: { locale: Locale }) {
  const see = copy[locale].home.see;
  return (
    <section className="hs see" id="see" aria-labelledby="see-title">
      <div className="wrap">
        <Rule />
        <div className="see-head">
          <Head eyebrow={see.eyebrow} title={see.title} id="see-title">
            <p className="lead">{rich(see.body)}</p>
          </Head>
          <a className="link see-link" href={PATHS.chat[locale]}>
            <span>{rich(see.link)}</span>
            <Icon name="arrow-right" className="ico ico-flip" />
          </a>
        </div>
        <div className="how-panel see-panel">
          <FlowDiagram flow={see} sample={copy[locale].fig.sample} note={copy[locale].agent.samples.bakery.fictional} />
        </div>
        <div className="tally">
          <h3 className="mono-k" id="tally-title">{see.tally.label}</h3>
          <ul aria-labelledby="tally-title">
            {see.tally.items.map((item, index) => (
              <li key={item.text} data-m style={n(index)}>
                <b className="tally-n"><bdi>{item.n}</bdi></b>
                <span>{rich(item.text)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how we work
/**
 * Check, set up, see, improve: four steps on a rail that fills as the visitor scrolls, and
 * a dashed arc from the last step back to the first once it is full, because the work
 * starts again. Without motion the arc is simply drawn.
 */
function How({ locale }: { locale: Locale }) {
  const w = copy[locale].home.how;
  return (
    <section className="hs how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <Rule />
        <Head eyebrow={w.eyebrow} title={w.title} id="how-title">
          <p className="lead">{rich(w.lead)}</p>
        </Head>
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
          {/* the way back to step 1: an arc over the steps on wide screens, a row under them on phones */}
          <p className="how-loop">
            <span className="how-loop-k"><bdi>{w.again}</bdi></span>
            <span className="how-loop-head" aria-hidden="true" />
          </p>
          <p className="how-again">
            <Icon name="arrow-right" className="ico" />
            <span>{w.again}</span>
          </p>
        </div>
        <div className="how-foot">
          <div className="how-next">
            <ContactButton locale={locale} variant="line" label={copy[locale].home.final.action} />
          </div>
          <div className="how-lists">
            {[w.need].map((list) => (
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
            <ul className="checks sheet-incl">
              {p.includes.map((item, index) => (
                <li key={item} data-m style={n(index)}>
                  <TickPath />
                  <span>{rich(item)}</span>
                </li>
              ))}
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
          <ContactButton locale={locale} lean label={copy[locale].home.final.action} />
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
          <figure className="trust-fig fig-cap-end" data-m>
            <FigCaption locale={locale} caption={tr.figure.caption} />
            {/* On phones the pair scrolls sideways, so it takes keyboard focus. */}
            <div className="pair" tabIndex={0} role="group" aria-label={tr.figure.label} data-nosnippet>
              {[locale, other].map((lang) => (
                <div key={lang} className={`pair-item pair-${lang}`} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
                  <Phone className="pair-phone"><TrackScreen sample={copy[lang].home.sample} lang={lang} /></Phone>
                </div>
              ))}
            </div>
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
            {items.slice(0, q.shown).map((item, index) => (
              <Answer key={item.id} item={item} open={index === 0} />
            ))}
            {items.length > q.shown && (
              <details className="faq-more">
                <summary>
                  <span>{q.more}</span>
                  <span className="faq-more-n" aria-hidden="true"><bdi>{items.length - q.shown}</bdi></span>
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
