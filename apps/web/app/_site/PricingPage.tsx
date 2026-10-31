import { Shell } from "./Shell";
import { copy, type Locale } from "./copy";
import type { PriceCell } from "./copyPricing";
import { Icon } from "./brand";
import { linked } from "./Linked";
import { PATHS } from "./site";
import { rich } from "./Text";
import "./legal.css";

// The pricing page (ALY-301): what ALYR costs, in riyals by bank transfer and in US dollars by
// card, with the terms, the refund policy and the privacy policy linked. Every word and every
// figure is in copyPricing.ts, which says where each figure comes from. The page does not
// depend on the homepage's offer switch (site.ts OFFER_LIVE): it is built and published
// whatever that says, because the founder decided to publish the prices (31 Oct 2026).

function Price({ cell }: { cell: PriceCell }) {
  return (
    <>
      <span className="pr-amt">{rich(cell.amount)}</span>
      {cell.per && <span className="pr-per">{cell.per}</span>}
    </>
  );
}

export function PricingPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const v = t.pricing;
  return (
    <Shell locale={locale} page="pricing" cta={t.home.final}>
      <article className="co pv pr" aria-labelledby="pr-title">
        <div className="wrap">
          <p className="co-eyebrow">{v.eyebrow}</p>
          <h1 className="co-title" id="pr-title">{v.title}</h1>
          <p className="pv-updated">{v.updated}</p>
          <p className="co-lead">{v.lead}</p>

          <section className="pv-section pr-section" id="plan" aria-labelledby="pr-plan">
            <h2 className="co-h2" id="pr-plan">{v.plan.title}</h2>
            <table className="pr-table">
              <caption className="sr-only">{v.plan.caption}</caption>
              <thead>
                <tr>
                  <th scope="col">{v.plan.what}</th>
                  <th scope="col"><span className="pr-ch">{v.plan.transfer.name}</span><span className="pr-cc">{v.plan.transfer.currency}</span></th>
                  <th scope="col"><span className="pr-ch">{v.plan.card.name}</span><span className="pr-cc">{v.plan.card.currency}</span></th>
                </tr>
              </thead>
              <tbody>
                {v.plan.rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row"><span className="pr-rn">{rich(row.name)}</span><span className="pr-rd">{rich(row.note)}</span></th>
                    <td><Price cell={row.transfer} /></td>
                    <td><Price cell={row.card} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pr-confirm">{v.plan.confirm}</p>

            <h3 className="pr-h3">{v.examples.title}</h3>
            <table className="pr-table pr-examples">
              <caption className="sr-only">{v.examples.caption}</caption>
              <tbody>
                {v.examples.rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row"><span className="pr-rn">{rich(row.name)}</span></th>
                    <td><Price cell={row.transfer} /></td>
                    <td><Price cell={row.card} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="pv-section pr-section" id="details" aria-labelledby="pr-details">
            <h2 className="co-h2" id="pr-details">{v.terms.title}</h2>
            <dl className="co-rows pr-facts">
              {v.terms.rows.map((row) => (
                <div className="co-row" key={row.name}>
                  <dt>{row.name}</dt>
                  <dd>{rich(row.value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="pv-section pr-section" id="includes" aria-labelledby="pr-includes">
            <h2 className="co-h2" id="pr-includes">{v.includes.title}</h2>
            <ul>{v.includes.items.map((item) => <li key={item}>{rich(item)}</li>)}</ul>
            <p>{v.includes.note}</p>
          </section>

          <section className="pv-section pr-section" id="refund" aria-labelledby="pr-refund">
            <h2 className="co-h2" id="pr-refund">{v.refund.title}</h2>
            <p>{v.refund.body}</p>
            <p>
              <a className="link pr-link" href={PATHS.refund[locale]}>
                <span>{v.refund.link}</span>
                <Icon name="arrow-right" className="ico ico-flip" />
              </a>
            </p>
          </section>

          <section className="pv-section pr-section" id="pay" aria-labelledby="pr-pay">
            <h2 className="co-h2" id="pr-pay">{v.pay.title}</h2>
            <dl className="co-rows pr-facts">
              {v.pay.items.map((item) => (
                <div className="co-row" key={item.name}>
                  <dt>{item.name}</dt>
                  <dd>{linked(item.body)}</dd>
                </div>
              ))}
            </dl>
            <p>{v.pay.note}</p>
          </section>

          <section className="pv-section pr-section" id="seller" aria-labelledby="pr-seller">
            <h2 className="co-h2" id="pr-seller">{v.seller.title}</h2>
            <p>{linked(v.seller.body)}</p>
          </section>
        </div>
      </article>
    </Shell>
  );
}
