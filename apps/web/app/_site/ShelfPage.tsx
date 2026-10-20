import { copy, type Locale } from "./copy";
import { FigCaption } from "./Drawings";
import { LastOneFigure } from "./LastOne";
import { OrderPhone } from "./PageDrawings";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { CatalogScreen, StockLog } from "./Sheets";
import { Shell } from "./Shell";
import { lines, rich } from "./Text";

/** ALYR Shelf: everything a shop sells, and the stock that counts itself on every sale
 * (02-messaging.md §3). It comes with ALYR, with every product (D-039). The sample is Qirfa
 * Bakery on Saturday 17 Oct 2026, so the homepage, ALYR Agent, ALYR Accounts and this page
 * tell one story. No payment flow is drawn: the one pay-link line says the page is a test. */
export function ShelfPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.shelf;
  const bakery = t.agent.samples.bakery;
  const sheet = p.screen.sheet;
  const order = p.order;
  return (
    <Shell locale={locale} page="shelf" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero hero={p.hero}>
        <ProductDemo product={p.demo} locale={locale} />
      </ProductHero>
      <LastOneFigure locale={locale} />
      <FlowSection flow={p.flow} />
      <ScreenBlock
        locale={locale}
        screen={p.screen}
        fictional={bakery.fictional}
        extra={
          <div className="pk-also">
            <StockLog sheet={sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.logCaption} />
            <p className="pk-also-cap">{p.screen.logCaption}</p>
          </div>
        }
      >
        <CatalogScreen sheet={sheet} shop={bakery.shop} monogram={bakery.monogram} label={p.screen.label} />
      </ScreenBlock>
      <section className="sec pk-pages" id="order-page" aria-labelledby="order-page-title">
        <div className="wrap pk-pages-in">
          <div className="built-head" data-reveal>
            <p className="eyebrow">{order.eyebrow}</p>
            <h2 className="h1" id="order-page-title">{lines(order.title)}</h2>
            <p className="lead">{rich(order.body)}</p>
          </div>
          <figure className="pk-pages-fig" data-reveal>
            <p className="sr-only">{order.label}</p>
            <div className="pk-phones" inert aria-hidden="true">
              {order.phones.map((phone) => (
                <div key={phone.label} className="pk-phone">
                  <span className="sig-k">{phone.label}</span>
                  <OrderPhone page={phone.page} />
                </div>
              ))}
            </div>
            <FigCaption locale={locale} caption={order.caption} />
          </figure>
        </div>
      </section>
      <InsideBlock inside={p.inside} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="shelf" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
