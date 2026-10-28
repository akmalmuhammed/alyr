import { Shell } from "./Shell";
import { copy, type Locale } from "./copy";

// The company's registration details, in the words of the commercial registration and the
// tax card (copy.ts, `company`). A plain page: a list of facts and one way to write to us.

export function CompanyPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const c = t.company;
  return (
    <Shell locale={locale} page="company" cta={t.home.final}>
      <section className="co" aria-labelledby="co-title">
        <div className="wrap">
          <p className="co-eyebrow">{c.eyebrow}</p>
          <h1 className="co-title" id="co-title">{c.title}</h1>
          <p className="co-lead">{c.lead}</p>
          <dl className="co-rows">
            {c.rows.map((row) => (
              <div className="co-row" key={row.name}>
                <dt>{row.name}</dt>
                <dd>
                  <bdi dir={locale === "ar" ? "rtl" : undefined}>{row.value}</bdi>
                  {row.note && <small>{row.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="co-source">{c.source}</p>
          <div className="co-contact">
            <h2 className="co-h2">{c.contact.title}</h2>
            <p>{c.contact.body}</p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
