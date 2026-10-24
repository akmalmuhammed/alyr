import { copy, type Locale } from "./copy";
import { FigCaption } from "./Drawings";
import { PaperNote } from "./Paper";
import { NOCR } from "./paperData";
import { PaymentPaperFigure } from "./PaymentPaper";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { DocumentsScreen } from "./Sheets";
import { Shell } from "./Shell";
import { rich } from "./Text";

/** ALYR Docs: the sales and payments already in ALYR, turned into paper (02-messaging.md §4).
 * Built, and off for every shop until it is set up with you (00-founder-decisions.md): the
 * page describes what it does, never that it is available. Qirfa Bakery on Monday 19 Oct
 * 2026: receipt RC-0042, invoice INV-0017 and its credit note CN-0003. Each part tells one
 * thing (08-rulings.md): the demo what the customer gets, the signature figure how a
 * payment becomes paper, the flow what happens behind it, the screen the team's, and "What's
 * in it" everything, with the CR rule beside the paper that carries it (its caption is the
 * one this page keeps: the foot means nothing without its words). */
export function DocsPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.docs;
  const bakery = t.agent.samples.bakery;
  return (
    <Shell locale={locale} page="docs" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero locale={locale} hero={p.hero} wide>
        <ProductDemo product={p.demo} locale={locale} sample={t.fig.sample} note={bakery.fictional} />
      </ProductHero>
      <PaymentPaperFigure locale={locale} />
      <FlowSection flow={p.flow} locale={locale} />
      <ScreenBlock locale={locale} screen={p.screen}>
        <DocumentsScreen sheet={p.screen.sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.label} sample={t.fig.sample} />
      </ScreenBlock>
      <InsideBlock inside={p.inside} locale={locale}>
        <div className="pk-cr" id="cr">
          <div className="pk-cr-head" data-reveal>
            <h3 className="pk-cr-title">{rich(p.cr.title)}</h3>
            <p className="pk-cr-body">{rich(p.cr.body)}</p>
          </div>
          <figure className="pk-cr-fig fig-cap-end" data-reveal>
            <FigCaption locale={locale} caption={p.cr.caption} />
            <p className="sr-only">{p.cr.label}</p>
            <div className="pk-plate pk-cr-plate" inert aria-hidden="true" data-nosnippet>
              <PaperNote doc={NOCR} />
            </div>
          </figure>
        </div>
      </InsideBlock>
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="docs" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
