import { Shell } from "./Shell";
import { copy, type Locale } from "./copy";

// The privacy policy (ALY-68): every word in copyPrivacy.ts. A plain page of sections, each
// with an anchor; Meta's app settings link to `#delete` for the data deletion instructions.

export function PrivacyPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const v = t.privacy;
  return (
    <Shell locale={locale} page="privacy" cta={t.home.final}>
      <article className="co pv" aria-labelledby="pv-title">
        <div className="wrap">
          <p className="co-eyebrow">{v.eyebrow}</p>
          <h1 className="co-title" id="pv-title">{v.title}</h1>
          <p className="pv-updated">{v.updated}</p>
          <p className="co-lead">{v.lead}</p>
          {v.sections.map((s) => (
            <section className="pv-section" id={s.id} key={s.id} aria-labelledby={`pv-${s.id}`}>
              <h2 className="co-h2" id={`pv-${s.id}`}>{s.title}</h2>
              {s.paras.map((para) => <p key={para}>{para}</p>)}
              {s.list && <ul>{s.list.map((item) => <li key={item}>{item}</li>)}</ul>}
              {(s.after ?? []).map((para) => <p key={para}>{para}</p>)}
            </section>
          ))}
        </div>
      </article>
    </Shell>
  );
}
