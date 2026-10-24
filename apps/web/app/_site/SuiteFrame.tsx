import type { CSSProperties, ReactNode } from "react";
import { Rich } from "../_agent/AgentDashboard";
import { AGENT_LABELS } from "../_agent/labels";
import { Icon } from "./brand";
import { copy, type Locale } from "./copy";
import { SampleMark, TickPath } from "./Frames";
import { PaperTop } from "./Paper";
import { RC0042 } from "./paperData";
import { SAMPLES } from "./samples";
import { INCLUDED, PRODUCTS, productPath, type ProductKey } from "./site";
import { rich } from "./Text";
import "./suite.css";

// "One shop, six products" (framer-review P1, approved by the founder on the Framer prototype,
// 25 Oct 2026): the suite as one Carbon plate, the workspace of one fictional bakery at 16:20
// on a Thursday, with one fragment of each product's real screen in its own words. Each tile is
// one link to its product's page, and plays its own moment once (suite.css): on hover or focus
// with a fine pointer, as it scrolls into view on a phone (SiteMotion adds `is-in`). The HTML
// is every moment's end state, so without scripts or with reduced motion every tile is finished.
// The frame is one figure set, so it carries one "Sample" mark, in the plate's bar.

const at = (index: number) => ({ "--i": index }) as CSSProperties;

/** A drawn window of the workspace, cut at its top inline-start corner. */
function Win({ title, aside, className, children }: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`sf-win${className ? ` ${className}` : ""}`}>
      <div className="sf-win-head">
        <b>{title}</b>
        {aside && <span>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** "0–30 days" with its range kept left to right, so Arabic does not read it "30–0". */
function ranges(text: string) {
  return text.split(/(\d+–\d+)/).map((piece, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{piece}</bdi> : piece));
}

function Chat({ locale }: { locale: Locale }) {
  const c = copy[locale].home.suite.frame.chat;
  const [sara, ...rest] = c.rows;
  return (
    <Win title={c.inbox} className="sf-chat-win">
      <div className="sf-inbox">
        <ul className="sf-list">
          <li className="sf-row is-new">
            <span className="sf-wash" />
            <span className="sf-row-top">
              <b>{sara.who}</b>
              <span className="sf-swap"><span className="sf-old">{sara.at}</span><span className="sf-new">{c.newAt}</span></span>
            </span>
            <span className="sf-swap sf-row-line">
              <span className="sf-old">{rich(sara.text)}</span>
              <span className="sf-new"><span className="sf-tag">{rich(c.tag)}</span>{rich(c.newText)}</span>
            </span>
          </li>
          {rest.map((row) => (
            <li key={row.who} className="sf-row">
              <span className="sf-row-top"><b>{row.who}</b><span>{row.at}</span></span>
              <span className="sf-row-line">{rich(row.text)}</span>
            </li>
          ))}
        </ul>
        <div className="sf-convo">
          <span className="sf-convo-head">{sara.who}</span>
          <div className="sf-thread">
            <span className="sf-msg is-in">{c.inMsg}</span>
            <span className="sf-msg is-out">
              <span>{c.outMsg}</span>
              <span className="sf-msg-act">{c.action}</span>
            </span>
            <span className="sf-event">{rich(c.event)}</span>
            <span className="sf-msg is-out sf-confirm">{rich(c.confirm)}</span>
          </div>
        </div>
      </div>
    </Win>
  );
}

function Bookings({ locale }: { locale: Locale }) {
  const b = copy[locale].home.suite.frame.bookings;
  return (
    <Win title={b.title} aside={b.day}>
      <div className="sf-pad">
        <div className="sf-slots">
          {b.times.map((time) => (
            <span key={time} className={`sf-slot${time === b.time ? " is-on" : ""}`}>
              <span dir="auto">{time}</span>
              {time === b.time && <span className="sf-slot-fill" dir="auto">{time}</span>}
            </span>
          ))}
        </div>
        <ul className="sf-lines">
          <li className="sf-line sf-b1">
            <b dir="auto">{b.time}</b>
            <span><b>{b.service}</b><small>{b.who}</small></span>
            <small>{b.booked}</small>
          </li>
          <li className="sf-line sf-b2">
            <span className="sf-tick"><TickPath /></span>
            <span><b>{b.reminder}</b><small>{b.before}</small></span>
            <small dir="auto">{b.sentAt}</small>
          </li>
        </ul>
      </div>
    </Win>
  );
}

function Agent({ locale }: { locale: Locale }) {
  const view = SAMPLES[locale].bakery;
  const labels = AGENT_LABELS[view.lang];
  const card = view.suggestions.find((s) => s.key === "ready") ?? view.suggestions[0];
  return (
    <Win title={labels.needs} aside={view.header.when}>
      <ul className="sf-needs">
        {view.needs.items.filter((item) => item.key !== "setup").map((item) => (
          <li key={item.key}>
            <b><bdi>{item.count}</bdi></b>
            <span><span><Rich parts={item.words} /></span>{item.detail && <small><Rich parts={item.detail} /></small>}</span>
          </li>
        ))}
      </ul>
      <div className="sf-sugg">
        <span className="sf-k">{labels.suggestions}</span>
        <div className="sf-card">
          <b><Rich parts={card.title} /></b>
          <span><Rich parts={card.line} /></span>
          <span className="sf-rule">{card.rule}</span>
          {card.action && <span className="sf-act"><span>{card.action.label}</span></span>}
        </div>
      </div>
    </Win>
  );
}

function Accounts({ locale }: { locale: Locale }) {
  const a = copy[locale].home.suite.frame.accounts;
  const owed = SAMPLES[locale].bakery.owed;
  if (!owed) return null;
  return (
    <Win title={a.title} aside={owed.customers}>
      <div className="sf-pad sf-owed">
        <span className="sf-k">{owed.title}</span>
        <b className="sf-big"><bdi>{owed.total_text}</bdi></b>
        <span className="sf-age">
          {owed.segments.map((s, i) => (
            <span key={s.key} style={{ flexGrow: s.share }}><i className={`a${i}`} style={at(i)} /></span>
          ))}
        </span>
        <span className="sf-legend">
          {owed.segments.map((s, i) => (
            <span key={s.key}><i className={`a${i}`} /><span>{ranges(s.label)}</span><b><bdi>{s.amount_text}</bdi></b></span>
          ))}
        </span>
        <div className="sf-acct">
          <span className="sf-acct-top"><b><bdi>{a.who}</bdi></b><b><bdi>{a.balance}</bdi></b></span>
          <small>{a.sub}</small>
          <span className="sf-promise">{a.promise}</span>
        </div>
      </div>
    </Win>
  );
}

function Shelf({ locale }: { locale: Locale }) {
  const m = copy[locale].pages.shelf.moment;
  return (
    <Win title={m.stock.path} className="sf-shelf-win">
      <div className="sf-stock">
        <span className="sf-count">
          <span className="sf-k">{m.stock.leftToday}</span>
          <span className="sf-digit"><span className="sf-d1">1</span><span className="sf-d0">0</span></span>
          <small>{m.stock.of}</small>
        </span>
        <span className="sf-item">
          <span className="sf-code"><bdi>{m.item.code}</bdi></span>
          <b>{m.item.name}</b>
          <span className="sf-price">{rich(m.item.price)}</span>
          <span className="sf-swap sf-left">
            <span className="sf-old sf-few">{m.item.left}</span>
            <span className="sf-new sf-out">{m.stock.soldOut}</span>
          </span>
        </span>
      </div>
    </Win>
  );
}

function Docs() {
  return (
    <div className="sf-paper">
      <PaperTop doc={RC0042} />
    </div>
  );
}

const FRAGMENT: Record<ProductKey, (props: { locale: Locale }) => ReactNode> = {
  chat: Chat,
  bookings: Bookings,
  agent: Agent,
  accounts: Accounts,
  shelf: Shelf,
  docs: Docs,
};

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

export function SuiteFrame({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const f = t.home.suite.frame;
  const sample = t.agent.samples.bakery;
  const view = SAMPLES[locale].bakery;
  return (
    <figure className="sf">
      <p className="sr-only">{sample.fictional}</p>
      <div className="sf-bar" aria-hidden="true">
        <span className="sf-mono">{sample.monogram}</span>
        <b>{sample.shop}</b>
        <SampleMark label={t.fig.sample} />
        <span className="sf-when">{view.header.when}</span>
      </div>
      <ul className="sf-grid">
        {PRODUCTS.map((key) => {
          const p = t.products.items[key];
          const state = INCLUDED.includes(key) ? p.state : "";
          const Fragment = FRAGMENT[key];
          return (
            <li key={key} className={`sf-cell sf-${key}`}>
              <a
                className="sf-tile"
                href={productPath(key, locale)}
                aria-label={fill(state ? f.tileState : f.tile, { name: p.name, descriptor: p.descriptor, state })}
                data-tile
              >
                <div className="sf-frag" inert aria-hidden="true" data-nosnippet>
                  <Fragment locale={locale} />
                </div>
                <div className="sf-label">
                  <span className="sf-name">
                    <bdi>{p.name}</bdi>
                    <Icon name="arrow-right" className="ico ico-flip" />
                  </span>
                  <span className="sf-desc">
                    {p.descriptor}
                    {state && <span className="sf-state"><span aria-hidden="true"> · </span>{state}</span>}
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
