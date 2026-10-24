import { copy, type Locale } from "./copy";
import { LastOneFigure } from "./LastOne";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { CatalogScreen, StockLog } from "./Sheets";
import { Shell } from "./Shell";

/** ALYR Shelf: everything a shop sells, and the stock that counts itself on every sale
 * (02-messaging.md §3). It comes with ALYR, with every product (D-039). The sample is Qirfa
 * Bakery on Saturday 17 Oct 2026, so the homepage, ALYR Agent, ALYR Accounts and this page
 * tell one story. No payment flow is drawn: the one pay-link line says the page is a test. */
export function ShelfPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.shelf;
  const bakery = t.agent.samples.bakery;
  const sheet = p.screen.sheet;
  return (
    <Shell locale={locale} page="shelf" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero hero={p.hero} wide>
        <ProductDemo product={p.demo} locale={locale} sample={t.fig.sample} note={bakery.fictional} />
      </ProductHero>
      <LastOneFigure locale={locale} />
      <FlowSection flow={p.flow} locale={locale} />
      <ScreenBlock
        locale={locale}
        screen={p.screen}
        extra={
          <div className="pk-also">
            <StockLog sheet={sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.logCaption} sample={t.fig.sample} />
          </div>
        }
      >
        <CatalogScreen sheet={sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.label} sample={t.fig.sample} />
      </ScreenBlock>
      <InsideBlock inside={p.inside} locale={locale} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="shelf" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
