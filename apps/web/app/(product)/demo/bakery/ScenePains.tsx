"use client";

// Scene 4, your pains, solved: only the cards the owner tapped in scene 2, in their order,
// each in two beats: their words, then the fold cuts them away to the same moment with
// ALYR. Pains whose answer is another scene (3, 6, 7) say so and offer the jump; the
// invoice closes the scene whatever was tapped. Every message is the product's own wording.

import type { CSSProperties, ReactNode } from "react";
import type { SceneProps } from "./ctx";
import { POINTS_TO, painOrder, qar, type Pain } from "./logic";
import { Bubble, Icon, Label, Labels, Line, M, Monogram, Phone, WaHead } from "./parts";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Where the jump from a pain lands: the beat that shows its answer. */
const LANDS: Partial<Record<Pain, number>> = { midnight: 4, twenty: 2, eid: 6, best: 0, google: 0 };

export function Pains(props: SceneProps) {
  const { w, beat, visit, go } = props;
  const order = painOrder(visit.tapped);
  const k = Math.floor(beat / 2);
  const after = beat % 2 === 1;
  const pain: Pain | "invoice" = k < order.length ? order[k] : "invoice";
  const p = w.pains;
  const quote = pain === "invoice" ? p.cards.invoice.quote ?? "" : w.money.pains[pain];
  const total = order.length + 1;

  return (
    <div className={`dm-pains ${after ? "is-after" : "is-before"}`}>
      <div className="dm-pains-rail" aria-hidden="true">
        {Array.from({ length: total }, (_, n) => <i key={n} className={n < k ? "is-done" : n === k ? "is-on" : ""} />)}
      </div>
      {!after ? (
        <div className="dm-before" key={`b-${k}`}>
          <p className="dm-eyebrow dm-in">{p.before}</p>
          <blockquote className="dm-quote dm-rise">{quote}</blockquote>
        </div>
      ) : (
        <div className="dm-after dm-cut" key={`a-${k}`}>
          <div className="dm-after-copy">
            <p className="dm-eyebrow">{p.after}</p>
            <p className="dm-after-was">{quote}</p>
            <Line className="dm-in">{p.cards[pain].head}</Line>
            {pain !== "invoice" && POINTS_TO[pain] ? (
              <button type="button" className="dm-btn is-line dm-in" style={i(3)}
                onClick={() => go({ scene: POINTS_TO[pain as Pain] as number, beat: LANDS[pain as Pain] ?? 0 }, { scene: 4, beat })}>
                <span>{p.jump(POINTS_TO[pain] as number)}</span><Icon name="arrow-right" className="dm-ico dm-ico-fwd" />
              </button>
            ) : null}
          </div>
          <div className="dm-after-fig">{figure(pain, props)}</div>
        </div>
      )}
    </div>
  );
}

function figure(pain: Pain | "invoice", { w, lang, shop }: SceneProps): ReactNode {
  const p = w.pains;
  const o = w.order;
  const built = <Label kind="built">{w.labels.built}</Label>;
  const sample = <Label kind="sample">{w.labels.sample}</Label>;
  switch (pain) {
    case "ready":
      return (
        <div className="dm-fig-pair">
          <Phone label={o.customer}>
            <WaHead name={shop} sub={o.account} />
            <div className="dm-wa-body">
              <div className="dm-in" style={i(2)}><Bubble time={p.ready.time}>{p.ready.message}</Bubble></div>
            </div>
          </Phone>
          <div className="dm-track dm-in" style={i(4)}>
            <div className="dm-op-bar"><Monogram name={shop} /><span><b dir="auto">{shop}</b><small>{p.ready.page}</small></span></div>
            <ol>
              {p.ready.track.map((t, n) => (
                <li key={t} className={n < 2 ? "is-done" : n === 2 ? "is-on" : ""}><span className="dm-track-dot" aria-hidden="true" />{t}</li>
              ))}
            </ol>
          </div>
          <Labels>{built}{sample}</Labels>
        </div>
      );
    case "pistachio":
      return (
        <div className="dm-fig-col">
          <div className="dm-strip">
            <div className="dm-card dm-in" style={i(1)}>
              <div className="dm-op-photo" aria-hidden="true"><Icon name="crate" className="dm-ico" /></div>
              <b>{p.pistachio.item}</b>
              <span className="dm-sold">{p.pistachio.sold}</span>
            </div>
            <div className="dm-card dm-in" style={i(4)}>
              <span className="dm-fake-btn is-pressed">{p.pistachio.tell}</span>
              <small>{p.pistachio.told}</small>
            </div>
            <div className="dm-card is-wide dm-in" style={i(7)}>
              <span className="dm-eyebrow">{p.pistachio.morning}</span>
              <p className="dm-msg" dir="auto">{p.pistachio.back(shop)} <span className="dm-wa-link is-static" dir="ltr">{p.orderUrl}</span></p>
            </div>
          </div>
          <Labels note={p.condition}>{built}{sample}</Labels>
        </div>
      );
    case "cafe":
      return (
        <div className="dm-fig-col">
          <div className="dm-strip">
            <div className="dm-card is-wide dm-in" style={i(1)}>
              <div className="dm-acct">
                <b>{p.cafe.name}</b>
                <span className="dm-acct-amt"><small>{p.cafe.owed}</small><M>{qar(1840, lang)}</M></span>
              </div>
              <div className="dm-age" aria-hidden="true"><i style={{ flexGrow: 620 }} /><i style={{ flexGrow: 760 }} /><i className="is-old" style={{ flexGrow: 460 }} /></div>
              <small>{p.cafe.oldest}</small>
              <span className="dm-fake-btn is-pressed">{p.cafe.sent}</span>
            </div>
            <div className="dm-card is-wide dm-in" style={i(4)}>
              <p className="dm-msg" dir="auto">{p.cafe.reminder(shop)} <span className="dm-wa-link is-static" dir="ltr">{p.payUrl}</span></p>
            </div>
          </div>
          <div className="dm-group dm-in" style={i(7)}>
            <p className="dm-group-head">{p.cafe.head2}</p>
            <div className="dm-group-row">
              <span>{p.cafe.maamoul}</span>
              <span><small>{p.cafe.theirs}</small><M>{qar(38, lang)}</M></span>
              <span><small>{p.cafe.yours}</small><M>{qar(45, lang)}</M></span>
            </div>
            <small className="dm-eyebrow">{p.cafe.group}</small>
          </div>
          <Labels>{built}{sample}</Labels>
        </div>
      );
    case "delivery":
      return (
        <div className="dm-fig-col">
          <div className="dm-receipts">
            <div className="dm-receipt dm-in" style={i(1)}>
              <span className="dm-eyebrow">{p.delivery.app}</span>
              <span className="dm-receipt-row"><span>{p.delivery.order}</span><M>{qar(180, lang)}</M></span>
              <span className="dm-receipt-row is-cut"><span>{p.delivery.fee}</span><M>{`− ${qar(45, lang)}`}</M></span>
            </div>
            <div className="dm-receipt is-own dm-in" style={i(4)}>
              <span className="dm-eyebrow">{p.delivery.own}</span>
              <span className="dm-receipt-row"><span>{p.delivery.order}</span><M>{qar(180, lang)}</M></span>
              <span className="dm-receipt-row is-kept"><span>{p.delivery.kept}</span><M>{qar(45, lang)}</M></span>
            </div>
          </div>
          <Labels><Label kind="estimate">{w.labels.estimate}</Label></Labels>
        </div>
      );
    case "invoice":
      return (
        <div className="dm-fig-col">
          <div className="dm-paper dm-in" style={i(2)} dir="ltr">
            <div className="dm-paper-head">
              <span className="dm-paper-shop"><Monogram name={shop} /><b dir="auto">{shop}</b></span>
              <span className="dm-paper-title"><b>{p.invoice.title}</b><span className="dm-ref">{p.invoice.number}</span></span>
            </div>
            <p className="dm-paper-to" dir="auto">{p.invoice.to}</p>
            {p.invoice.lines.map(([a, b, n]) => (
              <div key={a} className="dm-paper-line">
                <span><span dir="auto">{a}</span><small dir="auto">{b}</small></span>
                <span>× {n}</span>
                <M>{qar(n * 45, "en")}</M>
              </div>
            ))}
            <div className="dm-paper-total"><span>{p.invoice.total}</span><M>{qar(40 * 45, "en")}</M></div>
          </div>
          <Labels>{built}{sample}</Labels>
        </div>
      );
    default: {
      const recap: Record<Exclude<Pain, "ready" | "pistachio" | "cafe" | "delivery">, ReactNode> = {
        twenty: <p className="dm-recap-line">{p.twenty}</p>,
        midnight: <p className="dm-recap-line">{p.midnight}</p>,
        eid: (
          <>
            <div className="dm-cells is-recap" aria-hidden="true">{Array.from({ length: 12 }, (_, n) => <i key={n} className="is-on" />)}</div>
            <p className="dm-recap-line">{p.eid}</p>
          </>
        ),
        transfer: (
          <div className="dm-paid is-inline">
            <span className="dm-paid-tick" aria-hidden="true"><Icon name="check" className="dm-ico" /></span>
            <b>{o.paid}</b><small><M>{o.paidFor(qar(160, lang), 1043)}</M></small>
          </div>
        ),
        best: (
          <>
            <span className="dm-eyebrow">{p.best}</span>
            <p className="dm-recap-big">{p.bestFact}</p>
          </>
        ),
        google: <p className="dm-recap-line">{p.google}</p>,
      };
      const labels: Record<string, ReactNode> = {
        transfer: <Labels note={o.cardsLive}>{built}</Labels>,
        best: <Labels><Label kind="week">{w.labels.week}</Label></Labels>,
        google: <Labels><Label kind="setup">{w.labels.setup}</Label></Labels>,
      };
      return (
        <div className="dm-fig-col">
          <div className="dm-recap dm-in" style={i(2)}>
            {recap[pain]}
            {POINTS_TO[pain] ? <small className="dm-recap-where">{p.shown(POINTS_TO[pain] as number)}</small> : null}
          </div>
          {labels[pain] ?? <Labels>{built}</Labels>}
        </div>
      );
    }
  }
}
