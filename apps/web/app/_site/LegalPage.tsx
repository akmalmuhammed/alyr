import { Shell } from "./Shell";
import { copy, type Locale } from "./copy";
import { linked } from "./Linked";
import "./legal.css";

// The terms of service and the refund policy (ALY-301): long text, so a plain page of sections
// each with an anchor, in the privacy policy's type (`.co`, `.pv-*` in site.css). Every word is
// in copyLegal.ts. The terms number their headings and list them first; the refund policy,
// which is short, does not.

export function LegalPage({ locale, page }: { locale: Locale; page: "terms" | "refund" }) {
  const t = copy[locale];
  const v = t[page];
  const num = (index: number) => (v.numbered ? <span className="lg-n"><bdi>{index + 1}.</bdi> </span> : null);
  return (
    <Shell locale={locale} page={page} cta={t.home.final}>
      <article className="co pv lg" aria-labelledby="lg-title">
        <div className="wrap">
          <p className="co-eyebrow">{v.eyebrow}</p>
          <h1 className="co-title" id="lg-title">{v.title}</h1>
          <p className="pv-updated">{v.updated}</p>
          <p className="co-lead">{v.lead}</p>
          {v.contents && (
            <nav className="lg-toc" aria-labelledby="lg-toc-k">
              <p className="lg-toc-k" id="lg-toc-k">{v.contents}</p>
              <ol>
                {v.sections.map((s, index) => (
                  <li key={s.id}><a href={`#${s.id}`}>{num(index)}{s.title}</a></li>
                ))}
              </ol>
            </nav>
          )}
          {v.sections.map((s, index) => (
            <section className="pv-section lg-section" id={s.id} key={s.id} aria-labelledby={`lg-${s.id}`}>
              <h2 className="co-h2" id={`lg-${s.id}`}>{num(index)}{s.title}</h2>
              {s.paras.map((para) =>
                typeof para === "string" ? (
                  <p key={para}>{linked(para)}</p>
                ) : (
                  <p className="lg-clause" key={para.n}>
                    <span className="lg-c"><bdi>{para.n}</bdi></span>
                    <span>{linked(para.text)}</span>
                  </p>
                ),
              )}
              {s.list && <ul>{s.list.map((item) => <li key={item}>{linked(item)}</li>)}</ul>}
              {(s.after ?? []).map((para) => <p key={para}>{linked(para)}</p>)}
            </section>
          ))}
        </div>
      </article>
    </Shell>
  );
}
