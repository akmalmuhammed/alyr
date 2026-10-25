import { Icon } from "./brand";
import { copy, fill, type Locale } from "./copy";
import { TickPath } from "./Frames";
import { Crumbs } from "./SectorPage";
import { Shell } from "./Shell";
import { GUIDES, guidePage, PATHS, productPath, sectorPage, type GuideKey } from "./site";
import { rich } from "./Text";
import "./kit.css";
import "./pages.css";

// The owner guides (ALY-233): an index and one page per guide. A guide reads as an article:
// a breadcrumb, the title, who wrote it and when, "In short" (the answer, in the first 100
// words), the steps, and only then what ALYR does for it, with the pages for each kind of
// business it serves. Signed "ALYR team" (D-043). Every word from `copyGuides.ts`.

/** "Guide · ALYR team · 25 Oct 2026", the date in a <time> the machines can read. */
function Byline({ locale, published, date }: { locale: Locale; published: string; date: string }) {
  const g = copy[locale].guides;
  return (
    <p className="gd-by">
      <span>{g.kind}</span>
      <span className="gd-sep" aria-hidden="true">·</span>
      <span>{rich(g.by)}</span>
      <span className="gd-sep" aria-hidden="true">·</span>
      <span>
        <span className="sr-only">{g.published} </span>
        <time dateTime={published}><bdi>{date}</bdi></time>
      </span>
    </p>
  );
}

export function GuidePage({ locale, guide }: { locale: Locale; guide: GuideKey }) {
  const t = copy[locale];
  const g = t.guides;
  const d = g.items[guide];
  const home = PATHS.home[locale];
  return (
    <Shell locale={locale} page={guidePage(guide)} cta={d.cta}>
      <article className="gd" aria-labelledby="guide-title">
        <header className="gd-head">
          <div className="wrap gd-measure">
            <Crumbs label={t.sectors.crumbs.label} items={[[t.sectors.crumbs.home, home], [g.crumb, PATHS.guides[locale]], [d.title]]} />
            <h1 className="gd-title" id="guide-title">{rich(d.title)}</h1>
            <Byline locale={locale} published={d.published} date={d.date} />
          </div>
        </header>

        <div className="wrap gd-measure gd-body">
          <section className="gd-short" aria-labelledby="short-title">
            <h2 className="mono-k" id="short-title">{g.short}</h2>
            <p>{rich(d.short)}</p>
          </section>

          {d.sections.map((section) => (
            <section key={section.id} className="gd-sec" id={section.id} aria-labelledby={`${section.id}-title`}>
              <h2 className="gd-h2" id={`${section.id}-title`}>{rich(section.title)}</h2>
              {section.body && <p>{rich(section.body)}</p>}
              {section.steps && (
                <ol className="gd-steps">
                  {section.steps.map((step) => (
                    <li key={step.title}>
                      <h3>{rich(step.title)}</h3>
                      <p>{rich(step.body)}</p>
                    </li>
                  ))}
                </ol>
              )}
              {section.items && (
                <ul className="gd-list">
                  {section.items.map((item) => <li key={item}>{rich(item)}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section className="gd-alyr" id="with-alyr" aria-labelledby="with-alyr-title">
            <h2 className="gd-h2" id="with-alyr-title">{rich(d.alyr.title)}</h2>
            <p>{rich(d.alyr.body)}</p>
            <ul className="gd-ticks">
              {d.alyr.items.map((item) => (
                <li key={item}>
                  <span className="sp-tick" aria-hidden="true"><TickPath /></span>
                  <span>{rich(item)}</span>
                </li>
              ))}
            </ul>
            <ul className="gd-products">
              {d.alyr.products.map((key) => (
                <li key={key}>
                  <a className="link" href={productPath(key, locale)}>
                    <span>{rich(fill(g.see, { name: t.products.items[key].name }))}</span>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <nav className="gd-related" aria-labelledby="related-title">
            <h2 className="mono-k" id="related-title">{g.related}</h2>
            <ul>
              {d.sectors.map((key) => (
                <li key={key}>
                  <a className="link" href={PATHS[sectorPage(key)][locale]}>
                    <span>{rich(t.sectors.items[key].name)}</span>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </article>
    </Shell>
  );
}

/** The guides' index: each guide with its date and what it covers. */
export function GuidesIndex({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const g = t.guides;
  const home = PATHS.home[locale];
  return (
    <Shell locale={locale} page="guides" cta={g.cta}>
      <section className="sp-open gd-index" aria-labelledby="guides-title">
        <div className="wrap sp-open-in">
          <Crumbs label={t.sectors.crumbs.label} items={[[t.sectors.crumbs.home, home], [g.crumb]]} />
          <h1 className="sp-title" id="guides-title">{rich(g.title)}</h1>
          <p className="sp-answer">{rich(g.lead)}</p>
        </div>
      </section>
      <section className="sec gd-all" aria-label={g.crumb}>
        <div className="wrap">
          <ul className="gd-rows">
            {GUIDES.map((key) => {
              const d = g.items[key];
              return (
                <li key={key}>
                  <p className="gd-row-date mono-k"><time dateTime={d.published}><bdi>{d.date}</bdi></time></p>
                  <div className="gd-row-main">
                    <h2 className="gd-row-title">
                      <a href={PATHS[guidePage(key)][locale]}>{rich(d.title)}</a>
                    </h2>
                    <p>{rich(d.meta.description)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </Shell>
  );
}
