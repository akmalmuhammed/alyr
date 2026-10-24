import { copy, type Locale } from "./copy";
import { ProductDemo } from "./ProductDemo";
import { FlowSection, InsideBlock, ProductBar, ProductHero, QuestionsBlock, ScreenBlock, WhoBlock, WorksBlock } from "./ProductKit";
import { CreditScreen } from "./Sheets";
import { Shell } from "./Shell";

/** ALYR Accounts: credit accounts in the chat, who owes you, and reminders whose tone follows
 * the age of the debt (06-messaging.md §3.3). The sample is Qirfa Bakery and its office and
 * event accounts, so the homepage, ALYR Agent and this page tell one story. Payments run on
 * the stand-in page only, and the page says so. */
export function AccountsPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const p = t.pages.accounts;
  const bakery = t.agent.samples.bakery;
  const sheet = p.screen.sheet;
  return (
    <Shell locale={locale} page="accounts" cta={p.cta}>
      <ProductBar bar={p.bar} />
      <ProductHero hero={p.hero}>
        <ProductDemo product={p.demo} locale={locale} sample={t.fig.sample} note={bakery.fictional} />
      </ProductHero>
      <FlowSection flow={p.flow} locale={locale} />
      <ScreenBlock locale={locale} screen={p.screen} fictional={bakery.fictional}>
        <CreditScreen sheet={sheet} shop={bakery.shop} monogram={bakery.monogram} path={sheet.path} label={p.screen.label} sample={t.fig.sample} />
      </ScreenBlock>
      <InsideBlock inside={p.inside} />
      <WhoBlock who={p.who} />
      <WorksBlock locale={locale} works={p.works} self="accounts" />
      <QuestionsBlock faq={p.faq} />
    </Shell>
  );
}
