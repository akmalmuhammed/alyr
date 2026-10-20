import { copy, type Locale } from "./copy";
import { FigCaption } from "./Drawings";
import { DocLinkPhone } from "./PageDrawings";
import { Dimension, PaperA4, PaperNote, PaperRoll } from "./Paper";
import { RC0042 } from "./paperData";
import { PaymentPaperFigure } from "./PaymentPaper";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { DocumentsScreen } from "./Sheets";
import { Shell } from "./Shell";
import { lines, rich } from "./Text";

/** ALYR Docs: the sales and payments already in ALYR, turned into paper (02-messaging.md §4).
 * Built, and off for every shop until it is set up with you (00-founder-decisions.md): the
 * page describes what it does, never that it is available. Qirfa Bakery on Monday 19 Oct
 * 2026: receipt RC-0042, invoice INV-0017 and its credit note CN-0003. */
export function DocsPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.docs;
  const bakery = t.agent.samples.bakery;
  const paper = p.paper;
  return (
    <Shell locale={locale} page="docs" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero hero={p.hero}>
        <ProductDemo product={p.demo} locale={locale} />
      </ProductHero>
      <PaymentPaperFigure locale={locale} />
      <FlowSection flow={p.flow} />
      <ScreenBlock locale={locale} screen={p.screen} fictional={bakery.fictional}>
        <DocumentsScreen sheet={p.screen.sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.label} />
      </ScreenBlock>

      <section className="sec pk-paper" id="paper" aria-labelledby="paper-title">
        <div className="wrap">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{paper.eyebrow}</p>
            <h2 className="h1" id="paper-title">{lines(paper.title)}</h2>
            <p className="lead">{rich(paper.body)}</p>
          </div>
          <figure data-reveal>
            <p className="sr-only">{paper.label}</p>
            <div className="pp-plate" inert aria-hidden="true">
              <Dimension label={paper.a4}>
                <PaperA4 doc={RC0042} />
                <p className="pp-series">
                  <span className="pp-series-k">{paper.seriesLabel}</span>
                  {RC0042.series.before.map((n) => <bdi key={n}>{n}</bdi>)}
                  <bdi className="is-now">{RC0042.number}</bdi>
                  <span className="is-next"><span className="dot-pending" /><bdi>{RC0042.series.next}</bdi> · {paper.next}</span>
                </p>
              </Dimension>
              <Dimension label={paper.roll}>
                <PaperRoll doc={RC0042} />
              </Dimension>
            </div>
            <FigCaption locale={locale} caption={paper.caption} />
          </figure>
        </div>
      </section>

      <section className="sec pk-pages" id="issued" aria-labelledby="issued-title">
        <div className="wrap pk-pages-in">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{p.issued.eyebrow}</p>
            <h2 className="h1" id="issued-title">{lines(p.issued.title)}</h2>
            <p className="lead">{rich(p.issued.body)}</p>
          </div>
          <figure className="pk-pages-fig" data-reveal>
            <p className="sr-only">{p.issued.label}</p>
            <div className="pk-phones" inert aria-hidden="true">
              {p.issued.phones.map((phone) => (
                <div key={phone.label} className="pk-phone">
                  <span className="sig-k"><bdi>{phone.label}</bdi></span>
                  <DocLinkPhone page={phone.page} />
                </div>
              ))}
            </div>
            <FigCaption locale={locale} caption={p.issued.caption} />
          </figure>
        </div>
      </section>

      <section className="sec pk-cr" id="cr" aria-labelledby="cr-title">
        <div className="wrap pk-cr-in">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{p.cr.eyebrow}</p>
            <h2 className="h1" id="cr-title">{lines(p.cr.title)}</h2>
            <p className="lead">{rich(p.cr.body)}</p>
          </div>
          <figure className="pk-cr-fig" data-reveal>
            <p className="sr-only">{p.cr.label}</p>
            <div className="pk-cr-plate" inert aria-hidden="true">
              <PaperNote doc={RC0042} />
            </div>
            <FigCaption locale={locale} caption={p.cr.caption} />
          </figure>
        </div>
      </section>

      <InsideBlock inside={p.inside} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="docs" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
