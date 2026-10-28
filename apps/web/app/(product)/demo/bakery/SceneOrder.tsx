"use client";

// Scene 3, the order that would have been lost: the customer's phone beside the owner's
// workspace, moving on the same beats. The owner builds the cake on the phone with real
// buttons; the founder's Next fills in whatever was left. What the phone says is the
// product's own wording (orders/chat.py, core/templates.py, items/notes.py); the name on the
// cake travels in the chat, because the order page has no free-text line (02-truth.md).

import type { CSSProperties } from "react";
import type { SceneProps } from "./ctx";
import { CAKE, qar } from "./logic";
import { Bubble, Icon, Label, Labels, Line, M, Monogram, Phone, WaHead, Window } from "./parts";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** After a tap, the next choice comes into view inside the drawn phone, so the owner always
 * sees what is left to pick (the page scrolls, like the real one). */
function reveal(from: HTMLElement) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const group = from.closest(".dm-op-group");
  const target = (group?.nextElementSibling as HTMLElement | null) ?? from.closest(".dm-op")?.querySelector<HTMLElement>(".dm-op-foot");
  target?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
}

function Choices({ title, options, chosen, onPick, disabled, extra, wide }: {
  title: string; options: string[]; chosen: number | null; onPick: (k: number) => void;
  disabled?: (k: number) => boolean; extra?: (k: number) => string | null; wide?: boolean;
}) {
  return (
    <fieldset className={`dm-op-group ${wide ? "is-two" : ""}`}>
      <legend>{title}</legend>
      <div className="dm-op-chips">
        {options.map((o, k) => {
          const off = disabled?.(k) ?? false;
          return (
            <button key={o} type="button" className={`dm-op-chip ${chosen === k ? "is-on" : ""} ${off ? "is-off" : ""}`}
              aria-pressed={chosen === k} disabled={off} onClick={(e) => { onPick(k); reveal(e.currentTarget); }}>
              <span dir="auto">{o}</span>
              {extra?.(k) ? <small>{extra(k)}</small> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Order({ w, lang, beat, shop, visit, change, next }: SceneProps) {
  const o = w.order;
  const cake = visit.cake;
  const price = o.sizes[cake.size ?? 0][1];
  const amount = qar(price, lang);
  const count = beat >= 5 ? CAKE.limit : beat >= 4 ? CAKE.before + 1 : CAKE.before;
  const full = beat >= 6;
  const set = (patch: Partial<typeof cake>) => change({ cake: { ...cake, ...patch } });
  const ready = cake.size !== null && cake.flavour !== null && cake.message !== null && cake.day !== null;

  // ── the customer's phone ──
  let phone;
  if (beat <= 1 || beat === 4) {
    phone = (
      <>
        <WaHead name={shop} sub={o.account} />
        <div className="dm-wa-body">
          <Bubble me time={o.times[0]} tick>{o.ask}</Bubble>
          {beat >= 1 ? (
            <div className="dm-in">
              <Bubble time={o.times[1]}>
                {o.reply}{" "}
                {beat === 1
                  ? <button type="button" className="dm-wa-link" onClick={next}>{o.link}</button>
                  : <span className="dm-wa-link is-static">{o.link}</span>}
              </Bubble>
            </div>
          ) : null}
          {beat === 4 ? (
            <div className="dm-in" style={i(4)}>
              <Bubble time={o.times[4]}>{o.received(amount, 1043)}</Bubble>
            </div>
          ) : null}
        </div>
      </>
    );
  } else if (beat === 2 || beat === 6) {
    const khalid = beat === 6;
    phone = (
      <div className="dm-op">
        <div className="dm-op-bar">
          <Monogram name={shop} />
          <span><b dir="auto">{shop}</b><small>{o.page}</small></span>
        </div>
        <div className="dm-op-body">
          <div className="dm-op-item">
            <div className="dm-op-photo" aria-hidden="true"><Icon name="bakery" className="dm-ico" /></div>
            <div>
              <b>{o.item}</b>
              {khalid ? <small className="dm-op-note dm-in">{o.nextFree}</small> : null}
            </div>
          </div>
          {khalid ? (
            <Choices title={o.day} options={o.daysMorning} chosen={2} onPick={() => undefined}
              disabled={(k) => k < 2} extra={(k) => (k === 0 ? o.full : k === 1 ? o.closed : null)} />
          ) : (
            <>
              <Choices title={o.size} options={o.sizes.map(([s]) => s)} chosen={cake.size} onPick={(k) => set({ size: k })}
                extra={(k) => qar(o.sizes[k][1], lang)} />
              <Choices title={o.flavour} options={o.flavours} chosen={cake.flavour} onPick={(k) => set({ flavour: k })} wide />
              <Choices title={o.message} options={o.messages} chosen={cake.message} onPick={(k) => set({ message: k })} wide />
              <Choices title={o.day} options={o.days} chosen={cake.day} onPick={(k) => set({ day: k })} />
            </>
          )}
        </div>
        <div className="dm-op-foot">
          {khalid ? (
            <span className="dm-op-pay">{o.pay(qar(o.sizes[0][1], lang))}</span>
          ) : (
            <button type="button" className="dm-op-pay" disabled={!ready} onClick={next}>
              <span>{amount ? o.pay(amount) : null}</span>
            </button>
          )}
        </div>
      </div>
    );
  } else if (beat === 3) {
    phone = (
      <div className="dm-op">
        <div className="dm-op-bar">
          <Monogram name={shop} />
          <span><b dir="auto">{shop}</b><small>{o.payTitle}</small></span>
        </div>
        <div className="dm-pay">
          <p className="dm-pay-for">{o.payFor(1043)}</p>
          <p className="dm-pay-amount"><M>{amount}</M></p>
          <div className="dm-pay-card" aria-hidden="true"><span>{o.card}</span><i /></div>
          <div className="dm-paid dm-stamp" role="status">
            <span className="dm-paid-tick" aria-hidden="true"><Icon name="check" className="dm-ico" /></span>
            <b>{o.paid}</b>
            <small><M>{o.paidFor(amount, 1043)}</M></small>
          </div>
        </div>
      </div>
    );
  } else {
    phone = (
      <>
        <WaHead name={shop} sub={o.account} />
        <div className="dm-wa-body">
          <Bubble me time={o.times[5]} tick>{o.ask2}</Bubble>
          <Bubble time={o.times[5]}>{o.reply} <span className="dm-wa-link is-static">{o.link}</span></Bubble>
          <div className="dm-in" style={i(3)}>
            <Bubble time={o.times[5]}>{o.received(qar(o.sizes[0][1], lang), 1044)}</Bubble>
          </div>
        </div>
      </>
    );
  }

  const who = beat === 5 ? o.customer2 : beat === 6 ? o.customer3 : o.customer;
  const cakeLine = [o.sizes[cake.size ?? 0][0], o.flavours[cake.flavour ?? 0], o.messages[cake.message ?? 0]].join(" · ");

  return (
    <div className="dm-split">
      <div className="dm-split-head">
        <span className={`dm-clock ${beat === 0 || beat === 5 ? "is-quiet" : ""}`}><bdi>{o.times[beat]}</bdi></span>
        <Line key={beat} className="dm-in">{o.lines[beat]}</Line>
        <Labels><Label kind="sample">{w.labels.sample}</Label></Labels>
        {beat === 2 ? <p className="dm-lead dm-in" style={i(2)}>{o.yourTurn}</p> : null}
      </div>

      <div className="dm-split-phone">
        <Phone label={who}>{phone}</Phone>
        <Labels><Label kind="built">{w.labels.built}</Label></Labels>
      </div>

      <div className="dm-split-work">
        <Window title={o.window(shop)} name={shop} labels={<Label kind="built">{w.labels.built}</Label>}>
          <div className="dm-orders" role="table" aria-label={o.orders}>
            <div className="dm-orders-row is-head" role="row">
              {o.cols.map((c) => <span key={c} role="columnheader">{c}</span>)}
            </div>
            {beat >= 6 ? (
              <div className="dm-orders-row is-new dm-in" role="row">
                <span role="cell" className="dm-ref">#1045</span>
                <span role="cell"><b dir="auto">{o.customer3}</b><small>{o.item}</small></span>
                <span role="cell">{o.sat}</span>
                <span role="cell"><span className="dm-state">{o.newState}</span></span>
              </div>
            ) : null}
            {beat >= 5 ? (
              <div className={`dm-orders-row ${beat === 5 ? "is-new dm-in" : ""}`} role="row">
                <span role="cell" className="dm-ref">#1044</span>
                <span role="cell"><b dir="auto">{o.customer2}</b><small>{o.item}</small></span>
                <span role="cell">{o.rows[1].day}</span>
                <span role="cell"><span className="dm-state is-paid">{o.paidState}</span></span>
              </div>
            ) : null}
            {beat >= 4 ? (
              <div className={`dm-orders-row ${beat === 4 ? "is-new dm-in" : ""}`} role="row">
                <span role="cell" className="dm-ref">#1043</span>
                <span role="cell"><b dir="auto">{o.customer}</b><small>{o.item}</small></span>
                <span role="cell">{o.rows[1].day}</span>
                <span role="cell"><span className="dm-state is-paid">{o.paidState}</span></span>
              </div>
            ) : null}
            {o.rows.map((r) => (
              <div key={r.n} className="dm-orders-row" role="row">
                <span role="cell" className="dm-ref">#{r.n}</span>
                <span role="cell"><b dir="auto">{r.who}</b><small>{r.what}</small></span>
                <span role="cell">{r.day}</span>
                <span role="cell"><span className={`dm-state ${r.pay === o.paidState ? "is-paid" : ""}`}>{r.pay}</span></span>
              </div>
            ))}
          </div>
        </Window>

        <div className={`dm-limit ${full ? "is-full" : ""}`}>
            <div className="dm-limit-head">
              <span><b>{o.limitTitle}</b><small>{o.limitDay}</small></span>
              <span className="dm-limit-count" aria-live="polite"><M>{o.ofLimit(count, CAKE.limit)}</M></span>
            </div>
            <div className="dm-cells" aria-hidden="true">
              {Array.from({ length: CAKE.limit }, (_, k) => (
                <i key={k} className={`${k < count ? "is-on" : ""} ${k === count - 1 && beat >= 4 && beat <= 5 ? "is-new" : ""}`} />
              ))}
            </div>
            {full ? <p className="dm-limit-full dm-in">{o.fullLine}</p> : null}
            <Labels><Label kind="built">{w.labels.built}</Label></Labels>
          </div>

        <div className="dm-list">
          <div className="dm-list-head">
            <span><b>{o.list}</b><small>{o.listNote}</small></span>
            <Label kind="notBuilt">{w.labels.notBuilt}</Label>
          </div>
          <ul>
            <li className={beat >= 4 && beat <= 5 ? "is-new" : ""}>
              <span>{o.listCake}</span><b><M>{count}</M></b>
              {beat >= 4 ? <small className="dm-in">{cakeLine} · {o.fromChat}</small> : null}
            </li>
            {o.listRows.map(([what, n]) => (
              <li key={what}><span>{what}</span><b><M>{n}</M></b></li>
            ))}
          </ul>
        </div>
      </div>
      <p className="dm-built">{o.builtLine} {o.cardsLive}</p>
    </div>
  );
}
