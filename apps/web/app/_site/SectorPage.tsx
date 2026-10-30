import { Icon } from "./brand";
import { Actions, TryFreeNote } from "./Contact";
import { copy, fill, type Locale } from "./copy";
import { DaySplit } from "./DaySplit";
import { TickPath } from "./Frames";
import { QuestionsBlock } from "./ProductKit";
import { Shell } from "./Shell";
import { guidePage, INCLUDED, PATHS, PRODUCTS, productPath, sectorPage, TRY_FREE_LIVE, type ProductKey, type SectorKey } from "./site";
import { rich } from "./Text";
import "./kit.css";
import "./pages.css";

// A sector page (ALY-232, D-057): one kind of owner-run business, answered first. The
// owner's question as the H1 and its answer under it, the one Volt "Book a check-up" with a
// message for this trade; the day today in the owner's words; the same afternoon split by
// the fold (the homepage's drawing, marked "Sample"); what each product does for this trade,
// only what is built; the guide for it; questions; the closing call. Every word from
// `copySectors.ts`; the page is complete without scripts (the fold rests on "with ALYR").

/** The path from the homepage to this page, as a list of links; the last is this page. */
export function Crumbs({ label, items }: { label: string; items: [name: string, href?: string][] }) {
  return (
    <nav className="crumbs" aria-label={label}>
      <ol>
        {items.map(([name, href]) => (
          <li key={name}>
            {href ? <a href={href}><bdi>{name}</bdi></a> : <span aria-current="page">{rich(name)}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The products, in the suite's order, those that come with every product last and lighter. */
export function ProductTags({ locale, products }: { locale: Locale; products: ProductKey[] }) {
  const t = copy[locale];
  const sorted = [...products].sort(
    (a, b) => Number(INCLUDED.includes(a)) - Number(INCLUDED.includes(b)) || PRODUCTS.indexOf(a) - PRODUCTS.indexOf(b),
  );
  return (
    <span className="sp-tags">
      {sorted.map((key) => {
        const name = t.products.items[key].name;
        const plus = INCLUDED.includes(key);
        return (
          <a key={key} className={`tag tag-link${plus ? " tag-plus" : ""}`} href={productPath(key, locale)} aria-label={name}>
            <bdi dir="ltr">{plus ? "+ " : ""}{name.replace(/^ALYR\s+/, "")}</bdi>
          </a>
        );
      })}
    </span>
  );
}

export function SectorPage({ locale, sector }: { locale: Locale; sector: SectorKey }) {
  const t = copy[locale];
  const w = t.sectors;
  const s = w.items[sector];
  const day = s.row ? t.home.business.rows.find((row) => row.id === s.row) : s.day;
  const guide = t.guides.items[s.guide];
  const home = PATHS.home[locale];
  const keys = s.products.rows.map((row) => row.key);
  const actions = (
    <div className="pk-actions" data-hero-cta>
      <Actions locale={locale} lean label={t.home.hero.action} message={{ prefill: s.prefill, subject: s.subject }} />
    </div>
  );

  return (
    <Shell locale={locale} page={sectorPage(sector)} cta={s.cta}>
      <section className="sp-open" id="answer" aria-labelledby="answer-title">
        <div className="wrap sp-open-in">
          <Crumbs label={w.crumbs.label} items={[[w.crumbs.home, home], [w.crumbs.business, `${home}#business`], [s.name]]} />
          <h1 className="sp-title" id="answer-title">{rich(s.title)}</h1>
          <p className="sp-answer">{rich(s.answer)}</p>
          <div className="sp-act">
            {/* with "Try it free" on, the note goes under the buttons, so the pair is wrapped; off,
                the markup is what it was */}
            {TRY_FREE_LIVE ? (
              <div className="sp-main">
                {actions}
                <TryFreeNote locale={locale} />
              </div>
            ) : actions}
            <p className="sp-uses">
              <span className="mono-k">{w.uses}</span>
              <ProductTags locale={locale} products={keys} />
            </p>
          </div>
        </div>
      </section>

      {day && (
        <section className="sec sp-fig" id="afternoon" aria-labelledby="afternoon-title">
          <div className="wrap">
            <div className="sp-fig-head">
              <h2 className="h2" id="afternoon-title">{rich(w.figure.title)}</h2>
              <p className="lead">{rich(w.figure.body)}</p>
            </div>
            <figure className="sp-figure">
              <figcaption className="sr-only">{t.fig.note}</figcaption>
              <div data-nosnippet>
                <DaySplit row={day} words={t.home.business.split} sample={t.fig.sample} />
              </div>
            </figure>
          </div>
        </section>
      )}

      <section className="sec sp-today" id="today" aria-labelledby="today-title">
        <div className="wrap sp-split">
          <h2 className="h2" id="today-title">{rich(s.today.title)}</h2>
          <ul className="sp-day">
            {s.today.items.map((line) => (
              <li key={line}>
                <span className="sp-mark" aria-hidden="true" />
                <span>{rich(line)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec sp-products" id="products" aria-labelledby="products-title">
        <div className="wrap">
          <h2 className="h2 sp-products-title" id="products-title">{rich(s.products.title)}</h2>
          <ul className="works-rows sp-rows">
            {s.products.rows.map((row) => {
              const p = t.products.items[row.key];
              return (
                <li key={row.key}>
                  <span className="works-name">
                    <b><bdi>{p.name}</bdi></b>
                    <small>{p.descriptor}</small>
                  </span>
                  <p className="works-say sp-say">
                    <span className="sp-tick" aria-hidden="true"><TickPath /></span>
                    <span>{rich(row.body)}</span>
                  </p>
                  <a className="link works-link" href={productPath(row.key, locale)}>
                    <span>{rich(fill(w.see, { name: p.name }))}</span>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </a>
                </li>
              );
            })}
          </ul>
          {s.note && (
            <p className="sp-note status-line">
              <span className="dot-pending" aria-hidden="true" />
              <span>{rich(s.note)}</span>
            </p>
          )}
        </div>
      </section>

      <QuestionsBlock
        faq={s.faq}
        aside={
          <div className="sp-guide">
            <p className="mono-k">{w.guide.title}</p>
            <p className="sp-guide-title" id="guide-title">{rich(guide.title)}</p>
            <a className="link" href={PATHS[guidePage(s.guide)][locale]} aria-describedby="guide-title">
              <span>{w.guide.read}</span>
              <Icon name="arrow-right" className="ico ico-flip" />
            </a>
          </div>
        }
      />
    </Shell>
  );
}
