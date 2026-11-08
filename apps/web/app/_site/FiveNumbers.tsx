import { copy, type Locale } from "./copy";
import { SampleMark } from "./Frames";
import { lines, rich } from "./Text";
// stages.css comes with home.css

// The five numbers of a check-up (ALY-330, D-156): Found, Chosen, Answered, Paid, Return, for
// the fictional Qirfa Bakery, as counts the owner can open (percentages only where both sides
// count 20 or more). This is the page's proof: what we measure, not what we claim. One figure,
// one "Sample" mark; no invented result and no score.

export function FiveNumbers({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const w = t.home.numbers;
  return (
    <section className="hs nums" id="numbers" aria-labelledby="nums-title">
      <div className="wrap">
        <div className="head">
          <h2 className="h2" id="nums-title" data-split>{lines(w.title)}</h2>
          <p className="lead">{w.body}</p>
        </div>
        <figure className="nm" aria-label={w.label}>
          <div className="nm-bar">
            <b>{rich(w.shop)}</b>
            <SampleMark label={t.fig.sample} />
          </div>
          <ul className="nm-row">
            {w.items.map((item) => (
              <li key={item.k} className="nm-item">
                <span className="nm-k">{item.k}</span>
                <b className="nm-v"><bdi>{item.value}</bdi></b>
                <span className="nm-u">{item.unit}</span>
                <span className="nm-note">{item.note}</span>
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </section>
  );
}
