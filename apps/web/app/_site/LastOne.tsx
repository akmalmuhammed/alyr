import type { CSSProperties } from "react";
import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import type { LastOne as Moment } from "./copyShelf";
import { FigCaption } from "./Drawings";
import { CxTop, Phone, TickPath } from "./Frames";
import { PhotoTile } from "./PageDrawings";
import { lines, rich } from "./Text";
import "./drawings.css";
import "./moment.css";

// ALYR Shelf's signature figure (03-visuals.md §2.1): the last pistachio kunafa cheesecake,
// two customers who put it on their accounts in the same second, one stock card between
// them. Aisha's order takes it, the count steps from 1 to 0 and the stock log gains a Sold
// row with one Volt tick; Mariam's page marks it Sold out. CSS only (moment.css), keyed on
// the `.is-in` that SiteMotion adds once: the HTML is the finished state, so without
// scripts or with reduced motion the figure is complete. It plays once, in under 2.5 s.

const at = (index: number) => ({ "--p": index }) as CSSProperties;

function Bar({ m }: { m: Moment }) {
  return (
    <span className="lo-bar">
      <span className="d-btn is-line lo-press">
        <span className="lo-t1">{m.bar.account}</span>
        <span className="lo-t2">{m.bar.placing}</span>
      </span>
    </span>
  );
}

function Row({ m, out }: { m: Moment; out?: boolean }) {
  return (
    <div className={`d-row d-item lo-row${out ? " lo-goes" : ""}`}>
      <PhotoTile className="lo-dim" />
      <span className="d-row-text lo-dim">
        <b>{m.item.name}</b>
        <span className="d-price">{rich(m.item.price)}</span>
        <span className="d-pill few lo-pill">{m.item.left}</span>
      </span>
      <span className="lo-end">
        <span className="d-stepper lo-step">
          <span className="d-step-b"><Icon name="minus" className="ico" /></span>
          <span className="roll">1</span>
          <span className="d-step-b"><Icon name="plus" className="ico" /></span>
        </span>
        {out && <span className="d-off lo-off">{m.b.soldOut}</span>}
      </span>
    </div>
  );
}

export function LastOneFigure({ locale }: { locale: Locale }) {
  const m = copy[locale].pages.shelf.moment;
  const s = m.stock;
  return (
    <section className="sec sig-sec" id="moment" aria-labelledby="moment-title">
      <div className="wrap">
        <div className="built-head" data-reveal>
          <p className="eyebrow">{m.eyebrow}</p>
          <h2 className="h1" id="moment-title">{lines(m.title)}</h2>
          <p className="lead">{rich(m.body)}</p>
        </div>
        <figure className="sig lo" data-sig>
          <p className="sr-only">{m.label}</p>
          <div className="sig-stage" inert aria-hidden="true">
            <span className="sig-rule"><i /><i /></span>

            <div className="sig-part lo-a" style={at(0)}>
              <span className="sig-k">{m.parts.a}</span>
              <Phone className="lo-phone">
                <div className="d-cx">
                  <CxTop shop={m.page.shop} monogram={m.page.monogram} context={m.page.context} />
                  <div className="lo-body">
                    <Row m={m} />
                    <div className="lo-low">
                      <Bar m={m} />
                      <span className="lo-res">
                        <span className="lo-res-tick"><TickPath /></span>
                        <b>{rich(m.a.placed)}</b>
                        <span>{m.a.onAccount}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Phone>
            </div>

            <div className="sig-part lo-card" style={at(2)}>
              <span className="sig-k">{m.parts.card}</span>
              <div className="aw lo-win">
                <div className="aw-bar">
                  <span className="aw-mono">{m.page.monogram}</span>
                  <b>{m.page.shop}</b>
                  <span className="aw-path">{s.path}</span>
                </div>
                <div className="lo-win-body">
                  <p className="lo-item">
                    <span className="lo-code"><bdi>{m.item.code}</bdi></span>
                    <b>{m.item.name}</b>
                    <small>{s.rule}</small>
                  </p>
                  <div className="lo-count">
                    <span className="lo-count-k">{s.leftToday}</span>
                    <span className="lo-num">
                      <span className="lo-digit">
                        <span className="lo-d1">1</span>
                        <span className="lo-d0">0</span>
                      </span>
                      <small>{s.of}</small>
                    </span>
                    <span className="lo-out">{s.soldOut}</span>
                  </div>
                  <p className="lo-log-k">{s.log}</p>
                  <ul className="lo-log">
                    {s.rows.map((row, index) => (
                      <li key={row.order} className={index === 0 ? "lo-new" : undefined}>
                        <span className="lo-tick">{index === 0 && <TickPath />}</span>
                        <b>{row.kind}</b>
                        <span className="lo-delta"><bdi>{row.delta}</bdi></span>
                        <span className="lo-ord">{rich(row.order)}</span>
                        <span className="lo-at" dir="ltr">{row.at}</span>
                        <span className="lo-bal">{row.balance}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="sig-part lo-b" style={at(1)}>
              <span className="sig-k">{m.parts.b}</span>
              <Phone className="lo-phone">
                <div className="d-cx">
                  <CxTop shop={m.page.shop} monogram={m.page.monogram} context={m.page.context} />
                  <div className="lo-body">
                    <Row m={m} out />
                    <div className="lo-low">
                      <Bar m={m} />
                      <span className="lo-notice">
                        <b>{m.b.notice}</b>
                        <span>{m.b.fix}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Phone>
            </div>
          </div>
          <FigCaption locale={locale} caption={m.caption} />
        </figure>
      </div>
    </section>
  );
}
