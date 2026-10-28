"use client";

// The hero film's canvas (D-062): every window but the last shot's, the lanes' names and the
// captions, drawn after load when the film is about to play (FilmScenes.tsx). The windows are
// the products frame's drawings (`sf-*`, suite.css) in the product's own words, placed on the
// canvas where filmScript.ts puts them; their moving parts carry the class of their track.
// They are drawn in one commit, unseen and not laid out; then FILM_READY tells film.ts to start.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Rich } from "../_agent/AgentDashboard";
import type { Rich as RichParts } from "../_agent/types";
import { filmAr, filmEn } from "./copyFilm";
import { FilmCaption } from "./FilmCaption";
import { TickPath } from "./Frames";
import { CAPS, CARDS, CHAT_VIEW, CONVS, INBOX_ROW, MINUTES, ROWS, STILL, THREADS, hhmm, inboxRank, rowTop, threadTops, type CardKey, type Msg } from "./filmScript";
import { FILM_READY } from "./FilmScenes";

/** The words the canvas shares with the rest of the page (the products frame's, the Shelf
 * page's, the dashboard sample's), gathered by HeroFilm.tsx; its own words are copyFilm.ts. */
export type FilmWords = {
  ar: boolean;
  chat: { action: string; event: string };
  book: { title: string; day: string; times: string[]; time: string; service: string; who: string; booked: string; reminder: string; before: string; sentAt: string };
  accounts: string;
  shelf: { path: string; leftToday: string; of: string; soldOut: string; log: string; limit: string; code: string; name: string; price: string; left: string };
  owed: { title: string; total: string; customers: string; segments: { key: string; label: string; amount: string; share: number }[] };
  flag: { label: string; title: RichParts; line: RichParts } | null;
};

const px = (n: number) => `${n}px`;
const at = (rect: { x: number; y: number; w: number; h: number }) =>
  ({ "--x": px(rect.x), "--y": px(rect.y), "--w": px(rect.w), "--h": px(rect.h) }) as CSSProperties;

function Card({ k, title, aside, children }: { k: CardKey; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={`hf-card hf-c-${k} sf-win`} style={at(CARDS[k])}>
      <div className="sf-win-head">
        <b>{title}</b>
        {aside && <span>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

/** Text whose earlier versions sit under it, each shown in its turn (the film's tracks). */
function Versions({ id, items, className }: { id: string; items: ReactNode[]; className?: string }) {
  if (items.length < 2) return <span className={className}>{items[0]}</span>;
  return (
    <span className={`hf-sw${className ? ` ${className}` : ""}`}>
      {items.map((item, j) => <span key={j} className={`${id}-${j}`}>{item}</span>)}
    </span>
  );
}

/** "0–30 days" with its range kept left to right. */
function ranges(text: string) {
  return text.split(/(\d+–\d+)/).map((piece, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{piece}</bdi> : piece));
}

function thread(id: keyof typeof THREADS, body: (m: Msg) => ReactNode) {
  const msgs = THREADS[id];
  const tops = threadTops(msgs);
  const end = Math.min(0, CHAT_VIEW - 14 - (tops[tops.length - 1] + msgs[msgs.length - 1].h));
  return (
    <div className="hf-chat">
      <div className={`hf-th hf-th-${id}`} style={{ "--y": px(end) } as CSSProperties}>
        {msgs.map((m, i) => (
          <div key={m.k} className={`hf-mr is-${m.kind}`} style={{ "--t": px(tops[i]), "--h": px(m.h) } as CSSProperties}>
            <span className={`${m.kind === "day" ? "hf-day" : m.kind === "event" ? "sf-event" : `sf-msg is-${m.kind}`}${m.t > -99 ? ` hf-m-${id}-${m.k}` : ""}`}>
              {body(m)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The canvas's parts, in the order they are drawn. */
function parts(w: FilmWords): ReactNode[] {
  const f = w.ar ? filmAr : filmEn;
  const o = f.orders;
  const day = (key: string) => (key in f.inbox.days ? f.inbox.days[key as keyof typeof f.inbox.days] : key);
  const who: Record<(typeof ROWS)[number]["n"], keyof typeof f.people> = { "1442": "sara", "1441": "lina", "1440": "omar", "1439": "rania", "1438": "mariam", "1437": "meera", "1436": "aisha" };

  const inbox = (
    <Card key="inbox" k="inbox" title={f.inbox.title} aside={f.inbox.aside}>
      <div className="hf-ib">
        {CONVS.map((c, i) => (
          <div key={c.key} className={`sf-row hf-ibr hf-ib-${c.key}`} style={{ "--r": inboxRank(i, STILL) * INBOX_ROW } as CSSProperties}>
            {c.key === "aisha" && <span className="sf-wash hf-ib-aisha-v" />}
            <span className="sf-row-top">
              <b>{f.people[c.key]}</b>
              <Versions id={`hf-ib-${c.key}`} items={c.ev.map((e) => <bdi key={e.at}>{day(e.at)}</bdi>)} />
            </span>
            <Versions id={`hf-ib-${c.key}`} className="sf-row-line" items={c.ev.map((e) => f.says[c.key][e.say])} />
          </div>
        ))}
      </div>
    </Card>
  );

  const sara = (
    <Card key="chat" k="chat" title={f.people.sara} aside={f.inbox.title}>
      {thread("chat", (m) => {
        const said = f.says.sara;
        if (m.k === "mon") return f.inbox.days.mon;
        if (m.k === "old") return f.chat.old;
        if (m.k === "today") return f.chat.today;
        if (m.k === "in") return said[1];
        if (m.k === "out") return <><span>{said[2]}</span><span className="sf-msg-act">{w.chat.action}</span><span className="hf-volt-edge hf-m-chat-v" /></>;
        if (m.k === "event") return w.chat.event;
        return said[3];
      })}
    </Card>
  );

  const orders = (
    <Card key="table" k="table" title={o.title} aside={o.aside}>
      <div className="hf-oh">{o.head.map((h) => <span key={h}>{h}</span>)}</div>
      <div className="hf-rows">
        {ROWS.map((r, i) => {
          const row = (
            <>
              {r.from > -99 && <span className={`sf-wash hf-r-${r.n}-v`} />}
              {r.n === "1441" && <span className="sf-wash hf-r-1441-conf-v" />}
              <span className="hf-o-n"><b><bdi>#{r.n}</bdi></b><small>{f.people[who[r.n]]}</small></span>
              <span className="hf-o-i"><span>{o.rows[r.n].items}</span><small><bdi>{o.rows[r.n].total}</bdi></small></span>
              <span className="hf-o-p">{o.pay[r.pay]}</span>
              <span className="hf-sw hf-o-s">
                {r.states.map((x, j) => (
                  <span key={x.s} className={`hf-o-state${r.states.length > 1 ? ` hf-r-${r.n}-${x.s}` : ""}`}>
                    <span className={`hf-chip${x.s === "new" ? " is-new" : ""}`}>{o.st[x.s]}</span>
                    {x.s !== "done" && (
                      <span className="hf-btn">
                        {j < r.states.length - 1 && <span className={`hf-press hf-r-${r.n}-${x.s}-press`} />}
                        <span>{o.next[x.s]}</span>
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </>
          );
          return (
            <div key={r.n} className={`hf-or hf-r-${r.n}`} style={{ "--y": px(rowTop(i)) } as CSSProperties}>
              <div className={`hf-or-in${r.from > -99 ? ` hf-r-${r.n}-in` : ""}`}>{row}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  const s = w.shelf;
  const logRow = (row: (typeof f.stock.rows)[number], first: boolean) => (
    <div key={row.order} className="hf-lg-row">
      {first && <span className="sf-wash hf-lg-v" />}
      <b>{f.stock.sold}</b>
      <bdi dir="ltr">{row.delta}</bdi>
      <span>{row.order}</span>
      <span><bdi>{row.at}</bdi></span>
      <span>{row.balance}</span>
    </div>
  );
  const [newest, ...older] = f.stock.rows;
  const stock = (
    <Card key="stock" k="stock" title={s.path}>
      <div className="sf-stock hf-stock">
        <span className="sf-count">
          <span className="sf-k">{s.leftToday}</span>
          <span className="sf-digit hf-digit"><span className="hf-st-1">1</span><span className="hf-st-0">0</span></span>
          <small>{s.of}</small>
        </span>
        <span className="sf-item">
          <span className="sf-code"><bdi>{s.code}</bdi></span>
          <b>{s.name}</b>
          <span className="sf-price"><bdi>{s.price}</bdi></span>
          <span className="sf-swap sf-left">
            <span className="sf-few hf-st-few">{s.left}</span>
            <span className="sf-out hf-st-out">{s.soldOut}</span>
          </span>
        </span>
      </div>
      <div className="hf-lg-head"><span>{s.log}</span><span>{s.limit}</span></div>
      <div className="hf-lg">
        <div className="hf-lg-0">{logRow(newest, true)}</div>
        <div className="hf-lg-rest">{older.map((row) => logRow(row, false))}</div>
      </div>
    </Card>
  );

  const b = w.book;
  const bookings = (
    <Card key="book" k="book" title={b.title} aside={b.day}>
      <div className="sf-pad">
        <div className="sf-slots">
          {b.times.map((time) => (
            <span key={time} className={`sf-slot${time === b.time ? " is-taken" : ""}`}>
              <span dir="auto">{time}</span>
              {time === f.book.time2 && (
                <>
                  <span className="hf-ink hf-bk-630-ink" dir="auto">{time}</span>
                  <span className="hf-volt hf-bk-630-v"><span className="sf-slot-fill hf-bk-630-fill" dir="auto">{time}</span></span>
                </>
              )}
            </span>
          ))}
        </div>
        <ul className="sf-lines">
          <li className="sf-line">
            <b dir="auto">{b.time}</b>
            <span><b>{b.service}</b><small>{b.who}</small></span>
            <small>{b.booked}</small>
          </li>
          <li className="sf-line hf-bk-remind">
            <span className="sf-tick hf-tick"><TickPath /><span className="hf-tick-v hf-bk-tick-v"><TickPath /></span></span>
            <span><b>{b.reminder}</b><small>{b.before}</small></span>
            <small dir="auto">{b.sentAt}</small>
          </li>
          <li className="sf-line hf-bk-maha">
            <b dir="auto">{f.book.time2}</b>
            <span><b>{b.service}</b><small>{f.book.who2}</small></span>
            <small>{b.booked}</small>
          </li>
        </ul>
      </div>
    </Card>
  );

  const noor = (
    <Card key="noor" k="noor" title={f.people.noor} aside={f.inbox.title}>
      {thread("noor", (m) => (m.k === "sun" ? f.inbox.days.sun : m.k === "booked" ? f.chat.noorBooked : m.k === "thanks" ? f.chat.thanks : m.k === "today" ? f.chat.today : f.says.noor[1]))}
    </Card>
  );

  const ow = w.owed;
  const credit = (
    <Card key="owed" k="owed" title={w.accounts}
      aside={<span className="hf-sw"><span className="hf-ow-before">{f.owed.before.customers}</span><span className="hf-ow-after">{ow.customers}</span></span>}>
      <div className="sf-pad sf-owed">
        <span className="sf-k">{ow.title}</span>
        <b className="sf-big hf-sw">
          <bdi className="hf-ow-before">{f.owed.before.total}</bdi>
          <bdi className="hf-ow-after">{ow.total}</bdi>
        </b>
        <span className="sf-age">
          {ow.segments.map((seg, i) => <span key={seg.key} style={{ flexGrow: seg.share }}><i className={`a${i}`} /></span>)}
        </span>
        <span className="sf-legend">
          {ow.segments.map((seg, i) => (
            <span key={seg.key}>
              <i className={`a${i}`} />
              <span>{ranges(seg.label)}</span>
              {i === 0 ? (
                <b className="hf-sw"><bdi className="hf-ow-before">{f.owed.before.first}</bdi><bdi className="hf-ow-after">{seg.amount}</bdi></b>
              ) : (
                <b><bdi>{seg.amount}</bdi></b>
              )}
            </span>
          ))}
        </span>
        {w.flag && (
          <div className="hf-flag hf-ow-flag">
            <span className="hf-flag-k">
              <span className="hf-ring"><span className="hf-ring-v hf-ow-flag-v" /></span>
              <span>{w.flag.label}</span>
            </span>
            <b><Rich parts={w.flag.title} /></b>
            <span><Rich parts={w.flag.line} /></span>
          </div>
        )}
      </div>
    </Card>
  );

  const lina = (
    <Card key="lina" k="lina" title={f.people.lina} aside={f.inbox.title}>
      {thread("lina", (m) =>
        m.k === "tue" ? f.inbox.days.tue : m.k === "thanks" ? f.chat.thanks : m.k === "today" ? f.chat.today
          : m.k === "received" ? <>{f.says.lina[1]}<br />{f.chat.account}</> : f.says.lina[2],
      )}
    </Card>
  );

  const lanes = (["wide", "mid"] as const).map((shot) => (
    <div key={shot} className={`hf-lanes hf-ln-${shot}`}>
      {(["orders", "bookings", "money"] as const).map((key) => (
        <div key={key} className={`hf-lane hf-ln-${key}`}>
          <span className="hf-lane-rule" />
          <span className="hf-lane-tick" />
          <span className="hf-lane-name">
            <span>{f.lanes[key]}</span>
            {shot === "mid" && key === "orders" && (
              <span className="hf-sw">
                <span className="hf-tag hf-tag-ready"><i>·</i><bdi>{f.tags.ready}</bdi></span>
                <span className="hf-tag hf-tag-done"><i>·</i><bdi>{f.tags.done}</bdi></span>
              </span>
            )}
            {shot === "mid" && key === "bookings" && <span className="hf-tag hf-tag-maha"><i>·</i><bdi>{f.tags.maha}</bdi></span>}
            {shot === "mid" && key === "money" && <span className="hf-tag hf-tag-flag"><i>·</i>{f.tags.flag}</span>}
          </span>
        </div>
      ))}
    </div>
  ));

  const captions = CAPS.filter((c) => c.key !== "week").map((c) => <FilmCaption key={c.key} k={c.key} words={f.cap[c.key]} ar={w.ar} />);
  return [inbox, orders, stock, sara, bookings, noor, credit, lina, <div key="lanes">{lanes}</div>, <div key="caps">{captions}</div>];
}

/** The clock's earlier minutes, drawn into the plate's bar before its 16:20 (the HTML's). */
function Minutes() {
  // drawn only in the browser, after load (FilmScenes), so the bar is there to find
  const [bar] = useState(() => document.querySelector("[data-film] .hf-clock"));
  if (!bar) return null;
  return createPortal(MINUTES.slice(0, -1).map((m, i) => <span key={m.m} className={`hf-clk-${i}`}>{hhmm(m.m)}</span>), bar);
}

export default function FilmCanvas({ words }: { words: FilmWords }) {
  // All in one commit: on this page every insertion re-styles the whole document (its
  // `:root:has(...)` rules), so one insertion costs least. The windows are not laid out until
  // film.ts starts them (film.css, `content-visibility`).
  useEffect(() => {
    window.dispatchEvent(new Event(FILM_READY));
  }, []);
  return <>{parts(words)}<Minutes /></>;
}
