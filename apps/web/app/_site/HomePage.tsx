import type { CSSProperties, ReactNode } from "react";
import { BizStages } from "./BizStages";
import { Actions, ContactNote, TryFreeNote } from "./Contact";
import { copy, type FlipWords, type Locale, type Questions as QuestionSet } from "./copy";
import { FigCaption } from "./Drawings";
import { TickPath } from "./Frames";
import { FiveNumbers } from "./FiveNumbers";
import { FunnelFigure } from "./FunnelFigure";
import { HomeMotion } from "./HomeMotion";
import { HowCards } from "./HowCards";
import { LoopToggle } from "./LoopToggle";
import { Stages } from "./Stages";
import { SuiteFrame } from "./SuiteFrame";
import { Shell } from "./Shell";
import { CONTACT_STATE, OFFER_LIVE, TRY_FREE_LIVE } from "./site";
import { lines, rich } from "./Text";
import "./kit.css";
import "./home.css";

/**
 * The ALYR homepage, rebuilt around the four stages of a business's funnel (ALY-330, D-156,
 * after the founder's plan of 8 Nov 2026): Discover, Convert, Manage, Scale. In order: the
 * headline and the line under it (D-153, D-154) with one drawn figure of an enquiry moving
 * through the four stages; the five numbers a check-up records; one panel for each stage, with
 * a chapter index; the visitor's own business, as tabs; the products on one record; how we
 * work, ending on "then we check again"; the price (offer on); questions; the closing call.
 * Every word from `copy.ts`; every screen is the product's own, with fictional businesses,
 * each marked as a sample once. Where our software is not built yet, the page says our team
 * does the step.
 */
export function HomePage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const h = t.home;

  return (
    <Shell locale={locale} page="home" cta={h.final}>
      <Hero locale={locale} />
      <FiveNumbers locale={locale} />
      <Stages locale={locale} />
      <BizStages locale={locale} />
      <Suite locale={locale} />
      <How locale={locale} />
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

/** A line with one word taking turns (ALY-314). Screen readers get the whole sentence; the drawn
 * line is hidden from them. The words stack in one grid cell, so the line keeps the widest
 * word's width and nothing beside it moves. */
function FlipLine({ className, lead, flip, player = false }: { className: string; lead: string; flip: FlipWords; player?: boolean }) {
  return (
    <p className={className} data-loop-play={player ? "" : undefined} data-flip={player ? "" : undefined}>
      <span className="sr-only">{lead}</span>
      <span aria-hidden="true">
        {flip.before}{" "}
        <span className="flip" data-n={flip.words.length}>
          {flip.words.map((word, index) => (
            <span key={word} className="flip-word" data-rest={index === flip.rest ? "" : undefined} style={n(index)}>
              {word}
            </span>
          ))}
        </span>
        {flip.after}
      </span>
    </p>
  );
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
/* The headline, the line under it and the check-up, on their own (the founder took the film
   out on 7 Nov 2026). The line's changing word has its own Pause (WCAG 2.2.2), as the Office
   line has. */
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
          <div className="of hero-flip" data-loop>
            <FlipLine className="hero-lead" lead={hero.lead} flip={hero.flip} player />
            <LoopToggle words={t.loop} name={t.loop.names.line} className="of-toggle" />
          </div>
          <div className={TRY_FREE_LIVE ? "hero-actions is-pair" : "hero-actions"} data-hero-cta>
            <Actions locale={locale} lean label={hero.action} />
            <a className="link hero-more" href="#how">{hero.more}</a>
          </div>
          {TRY_FREE_LIVE ? <TryFreeNote locale={locale} className="hero-note" /> : <ContactNote locale={locale} className="hero-note" address={false} />}
        </div>
        <FunnelFigure locale={locale} />
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

// ---------------------------------------------------------------- how we work
/**
 * Check, set up, see, improve: four cards, each a still canvas with one moving scene from
 * the product (HowCards.tsx, ALY-226); the last card's words say that we check again. Without
 * motion every scene is finished. The heading stands alone (the founder, 7 Nov 2026).
 */
function How({ locale }: { locale: Locale }) {
  const w = copy[locale].home.how;
  return (
    <section className="hs how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <Rule />
        <div className="open-full">
          <Head eyebrow={w.eyebrow} title={w.title} id="how-title" />
        </div>
        <HowCards locale={locale} />
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
