import { copy, type Locale } from "./copy";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { BookingsFiltered, BookingsScreen } from "./Sheets";
import { Shell } from "./Shell";

/** ALYR Bookings: appointments from the chat, a reminder before each, and the team marking
 * who came (06-messaging.md §3.1). One booking at a time per business: the page never draws
 * parallel chairs or per-stylist calendars (01-research.md D). */
export function BookingsPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.bookings;
  const salon = t.agent.samples.salon;
  const sheet = p.screen.sheet;
  return (
    <Shell locale={locale} page="bookings" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero locale={locale} hero={p.hero}>
        <ProductDemo product={p.demo} locale={locale} sample={t.fig.sample} note={salon.fictional} />
      </ProductHero>
      <FlowSection flow={p.flow} locale={locale} />
      <ScreenBlock
        locale={locale}
        screen={p.screen}
        fictional={salon.fictional}
        extra={
          <div className="pk-also">
            <BookingsFiltered sheet={sheet} shop={salon.shop} monogram={salon.monogram} path={sheet.path} label={sheet.filtered.caption} sample={t.fig.sample} />
          </div>
        }
      >
        <BookingsScreen sheet={sheet} shop={salon.shop} monogram={salon.monogram} path={sheet.path} label={p.screen.label} sample={t.fig.sample} />
      </ScreenBlock>
      <InsideBlock inside={p.inside} locale={locale} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="bookings" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
