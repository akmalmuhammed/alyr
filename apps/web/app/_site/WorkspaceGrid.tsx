import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import type { WorkspaceCardKey, WorkspaceGridCopy } from "./copyWorkspaceGrid";
import { SampleMark } from "./Frames";
import { OrderRow } from "./PageDrawings";
import { productPath, type ProductKey } from "./site";
import { Accounts, Agent, Bookings, Chat, Docs, Shelf } from "./SuiteFrame";
import { lines, rich } from "./Text";
import "./suite.css";
import "./workspacegrid.css";

// "One workspace for every kind of business" (ALY-330, founder's brief of 8 Nov 2026, item 5):
// a mosaic of soft cards, one for every solution ALYR has today. The six products draw their
// real screen fragments (SuiteFrame.tsx) in their finished state; the other three are the work
// our team does and the pages a business gets. Each card: a small label, one sentence, at most
// one line, a link where a page exists, and its drawing. A card plays once, arriving along the
// diagonal as it comes into view (SiteMotion adds `is-in` to `data-m`); without scripts or with
// reduced motion every card is simply there. The grid is one figure set: one "Sample" mark.

const at = (index: number) => ({ "--i": index }) as CSSProperties;

const PRODUCT_CARDS: readonly ProductKey[] = ["chat", "bookings", "agent", "accounts", "shelf", "docs"];
const ORDER: readonly WorkspaceCardKey[] = [
  "chat", "bookings", "agent", "accounts", "shelf", "docs", "checkup", "pages", "monthly",
];
/** The cards on Carbon, for rhythm (three at most). */
const CARBON: readonly WorkspaceCardKey[] = ["chat", "checkup", "monthly"];

const isProduct = (key: WorkspaceCardKey): key is ProductKey => (PRODUCT_CARDS as readonly string[]).includes(key);

/** "See {name}" with the product's name kept whole (and left to right) in either language. */
function seeLink(template: string, name: string): ReactNode {
  const [before, after = ""] = template.split("{name}");
  return <>{before}<bdi>{name}</bdi>{after}</>;
}

function Fragment({ card, locale }: { card: ProductKey; locale: Locale }) {
  switch (card) {
    case "chat": return <Chat locale={locale} />;
    case "bookings": return <Bookings locale={locale} />;
    case "agent": return <Agent locale={locale} />;
    case "accounts": return <Accounts locale={locale} />;
    case "shelf": return <Shelf locale={locale} />;
    default: return <Docs />;
  }
}

/** The check-up's five numbers, as the homepage's five-numbers section counts them. */
function Numbers({ locale }: { locale: Locale }) {
  return (
    <ul className="wg-nums">
      {copy[locale].home.numbers.items.map((item) => (
        <li key={item.k}>
          <span className="wg-nk">{item.k}</span>
          <b><bdi>{item.value}</bdi></b>
        </li>
      ))}
    </ul>
  );
}

/** The customer's order page: two rows, one nearly gone and one sold out. */
function Order({ words }: { words: WorkspaceGridCopy }) {
  return (
    <div className="wg-order">
      <div className="d-cx">
        <div className="d-card">
          {words.pages.items.map((item) => (
            <OrderRow key={item.name} item={item} soldOut={words.pages.soldOut} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Actions({ words }: { words: WorkspaceGridCopy }) {
  return (
    <ol className="wg-acts">
      {words.monthly.actions.map((action, index) => (
        <li key={action}>
          <span className="wg-an"><bdi>{`0${index + 1}`}</bdi></span>
          <span>{rich(action)}</span>
        </li>
      ))}
    </ol>
  );
}

export function WorkspaceGrid({ locale, words }: { locale: Locale; words: WorkspaceGridCopy }) {
  const t = copy[locale];
  const sample = t.agent.samples.bakery;
  return (
    <section className="hs wg" id="workspace" aria-labelledby="workspace-title">
      <div className="wrap">
        <div className="wg-head">
          <h2 className="h2" id="workspace-title">{lines(words.title)}</h2>
          <p className="lead">{words.lead}</p>
          <p className="wg-sample" aria-hidden="true">
            <b>{words.shop}</b>
            <SampleMark label={words.sample} />
          </p>
          <p className="sr-only">{sample.fictional}</p>
        </div>
        <ul className="wg-grid" aria-label={words.label}>
          {ORDER.map((key, index) => {
            const card = words.cards[key];
            const product = isProduct(key) ? t.products.items[key] : null;
            const dark = CARBON.includes(key);
            return (
              <li key={key} className={`wg-card wg-c-${key}${dark ? " is-dark" : ""}`} style={at(index)} data-m>
                <div className="wg-text">
                  <span className="wg-chip">{card.chip}</span>
                  <h3 className="wg-h">{rich(card.title)}</h3>
                  <p className="wg-line">{card.line}</p>
                  {product ? (
                    <p className="wg-foot">
                      <a className="wg-link" href={productPath(key as ProductKey, locale)}>
                        {seeLink(t.products.see, product.name)}
                        <Icon name="arrow-right" className="ico ico-flip" />
                      </a>
                      <span className="wg-state">{product.state}</span>
                    </p>
                  ) : (
                    (key === "checkup" || key === "monthly") && <p className="wg-foot"><span className="wg-state is-team">{words.team}</span></p>
                  )}
                </div>
                <div className="wg-vis" inert aria-hidden="true" data-nosnippet>
                  {isProduct(key) ? <Fragment card={key} locale={locale} />
                    : key === "checkup" ? <Numbers locale={locale} />
                    : key === "pages" ? <Order words={words} />
                    : <Actions words={words} />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
