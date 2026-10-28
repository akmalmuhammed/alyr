import type { BookingsSheet, CreditSheet } from "./copy";
import type { DocsSheet } from "./copyDocs";
import type { StockSheet } from "./copyShelf";
import { SampleMark } from "./Frames";
import { rich } from "./Text";
import "./drawings.css";

// The workspace's working screens, drawn at true scale in the product's own labels
// (apps/web/app/(product)/_workspace/Screens.tsx), for a fictional business. Pictures,
// not working screens: nothing inside is focusable. The numbered marks match the callouts
// beside each figure. On a phone the screen is wider than the page, as it is in the
// workspace, so it scrolls sideways inside its frame (which then takes keyboard focus).

function Mark({ n }: { n: number }) {
  return <span className="ws-mark" aria-hidden="true"><bdi>{n}</bdi></span>;
}

function Frame({ shop, monogram, path, label, sample, children }: {
  shop: string; monogram: string; path: string; label: string; sample: string; children: React.ReactNode;
}) {
  return (
    <div className="aw ws">
      <div className="aw-bar" aria-hidden="true">
        <span className="aw-mono">{monogram}</span>
        <b>{shop}</b>
        <SampleMark label={sample} />
        <span className="aw-path">{path}</span>
      </div>
      <div className="ws-scroll" tabIndex={0} role="group" aria-label={label}>
        <div className="ws-body" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

/** Bookings: today and the next seven days, with who looks after each visit and the
 * buttons a visit gets once it is over. */
export function BookingsScreen({ sheet, shop, monogram, path, label, sample }: {
  sheet: BookingsSheet; shop: string; monogram: string; path: string; label: string; sample: string;
}) {
  const h = sheet.heads;
  return (
    <Frame shop={shop} monogram={monogram} path={path} label={label} sample={sample}>
      <p className="ws-sub">{sheet.sub}<Mark n={1} /></p>
      <div className="ws-table ws-bookings">
        <div className="ws-tr ws-th">
          <span>{h.when}</span>
          <span>{h.service}</span>
          <span>{h.customer}</span>
          <span>{h.by}<Mark n={2} /></span>
          <span>{h.status}</span>
        </div>
        {sheet.rows.map((row, index) => (
          <div key={row.ref} className={`ws-tr${row.ended ? " is-ended" : ""}`}>
            <span className="ws-when"><b dir="ltr">{row.when}</b><small><bdi>{row.ref}</bdi></small></span>
            <span>{row.service}</span>
            <span><bdi>{row.customer}</bdi></span>
            <span><span className="ws-select">{row.by}<i /></span></span>
            <span className="ws-status">
              <span className="ws-pill">{row.status}</span>
              <span className="ws-acts">
                {row.ended && <span className="ws-btn">{sheet.acts.came}</span>}
                {row.ended && <span className="ws-btn">{sheet.acts.noShow}</span>}
                <span className="ws-btn">{sheet.acts.cancel}</span>
                {index === 0 && <Mark n={3} />}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The same screen, opened from ALYR Agent's card: only the visit the rule counted. */
export function BookingsFiltered({ sheet, shop, monogram, path, label, sample }: {
  sheet: BookingsSheet; shop: string; monogram: string; path: string; label: string; sample: string;
}) {
  const row = sheet.rows.find((r) => r.ended) ?? sheet.rows[0];
  return (
    <Frame shop={shop} monogram={monogram} path={path} label={label} sample={sample}>
      <p className="ws-filter">
        <span>{sheet.filtered.label}</span>
        <span className="ws-btn">{sheet.filtered.show}</span>
        <Mark n={4} />
      </p>
      <div className="ws-table ws-bookings">
        <div className="ws-tr">
          <span className="ws-when"><b dir="ltr">{row.when}</b><small><bdi>{row.ref}</bdi></small></span>
          <span>{row.service}</span>
          <span><bdi>{row.customer}</bdi></span>
          <span><span className="ws-select">{row.by}<i /></span></span>
          <span className="ws-status">
            <span className="ws-pill">{row.status}</span>
            <span className="ws-acts">
              <span className="ws-btn">{sheet.acts.came}</span>
              <span className="ws-btn">{sheet.acts.noShow}</span>
              <span className="ws-btn">{sheet.acts.cancel}</span>
            </span>
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** Credit accounts: what is owed by age, the one button that reminds, every customer's
 * balance and oldest debt, and one customer's entries. */
export function CreditScreen({ sheet, shop, monogram, path, label, sample }: {
  sheet: CreditSheet; shop: string; monogram: string; path: string; label: string; sample: string;
}) {
  const h = sheet.heads;
  return (
    <Frame shop={shop} monogram={monogram} path={path} label={label} sample={sample}>
      <p className="ws-sub">{sheet.sub}</p>
      <div className="ws-totals">
        <span className="ws-label">{sheet.outstanding}<Mark n={1} /></span>
        <b className="ws-big">{rich(sheet.total)}</b>
        <span className="ws-owing">{sheet.owing}</span>
        <span className="ws-agebar">
          {sheet.buckets.map((b, i) => <span key={b.label} className={`a${i}`} style={{ flexGrow: b.share }} />)}
          <Mark n={2} />
        </span>
        <span className="ws-legend">
          {sheet.buckets.map((b, i) => (
            <span key={b.label}>
              <small><i className={`a${i}`} /><span>{ranges(b.label)}</span></small>
              <b>{rich(b.amount)}</b>
            </span>
          ))}
        </span>
      </div>
      <p className="ws-actions">
        <span className="ws-btn is-primary">{sheet.remind}</span>
        <span className="ws-hint">{sheet.remindHint}</span>
        <Mark n={3} />
      </p>
      <div className="ws-table ws-credit">
        <div className="ws-tr ws-th">
          <span>{h.customer}</span>
          <span className="ws-r">{h.balance}</span>
          <span>{h.age}</span>
        </div>
        {sheet.rows.map((row) => (
          <div key={row.name} className={`ws-tr${row.on ? " is-on" : ""}`}>
            <span><bdi>{row.name}</bdi></span>
            <span className="ws-r ws-num">{rich(row.balance)}</span>
            <span className="ws-ages">
              <span className={`ws-pill ${row.settled ? "is-none" : `p${row.age}`}`}>{row.days}</span>
              {row.promised && <span className="ws-pill is-promise">{row.promised}</span>}
              {row.promised && <Mark n={4} />}
            </span>
          </div>
        ))}
      </div>
      <div className="ws-entries">
        <p className="ws-entries-head">
          <b>{sheet.entries.title} · <bdi>{sheet.entries.who}</bdi></b>
          <span>{sheet.entries.by}</span>
          <Mark n={5} />
        </p>
        <ul>
          {sheet.entries.rows.map((row) => (
            <li key={row.at + row.what}>
              <span className="ws-date">{row.at}</span>
              <span>{rich(row.what)}</span>
              <b className={row.payment ? "is-minus" : "is-plus"}>{rich(row.amount)}</b>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

/** ALYR Shelf: the Stock tab of the shop's Menu (`/app/catalog`, `catalogCopy.ts`): the
 * toolbar, the tabs, what is in the system for every item counted, the two filters and the
 * three ways to change a count. */
export function CatalogScreen({ sheet, shop, monogram, label, sample }: {
  sheet: StockSheet; shop: string; monogram: string; label: string; sample: string;
}) {
  return (
    <Frame shop={shop} monogram={monogram} path={sheet.path} label={label} sample={sample}>
      <div className="ws-cat-top">
        <span className="ws-tabs">
          {sheet.tabs.map((tab, index) => <span key={tab} className={index === 1 ? "on" : undefined}>{tab}</span>)}
        </span>
        <span className="ws-tools">
          {sheet.toolbar.map((tool) => <span key={tool} className="ws-tool">{tool}</span>)}
        </span>
      </div>
      <p className="ws-sub">{sheet.sub}</p>
      <p className="ws-chips">
        {sheet.filters.map((filter) => <span key={filter} className="ws-chip">{filter}</span>)}
        <Mark n={2} />
      </p>
      <div className="ws-table ws-stock">
        <div className="ws-tr ws-th">
          <span>{sheet.heads.item}</span>
          <span>{sheet.heads.now}<Mark n={1} /></span>
          <span />
        </div>
        {sheet.rows.map((row, index) => (
          <div key={row.name} className={`ws-tr${row.on ? " is-on" : ""}`}>
            <span className="ws-stock-name">
              <b>{row.name}</b>
              {row.state && <span className={`ws-pill ${row.tone === "out" ? "is-out" : "is-low"}`}>{row.state}</span>}
            </span>
            <span className="ws-stock-now">
              <b className="ws-num">{row.now}</b>
              {row.of && <small>{row.of}</small>}
            </span>
            <span className="ws-acts">
              <span className="ws-btn">{sheet.acts.received}</span>
              <span className="ws-btn">{sheet.acts.wasted}</span>
              <span className="ws-btn">{sheet.acts.count}</span>
              {index === 0 && <Mark n={3} />}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** ALYR Shelf: one item's recent changes on the Stock tab, newest first. The log only ever
 * adds rows; the actor of an order's row is left out (the product can print "Assistant"). */
export function StockLog({ sheet, shop, monogram, label, sample }: {
  sheet: StockSheet; shop: string; monogram: string; label: string; sample: string;
}) {
  const log = sheet.log;
  return (
    <Frame shop={shop} monogram={monogram} path={sheet.path} label={label} sample={sample}>
      <div className="ws-entries ws-log">
        <p className="ws-entries-head">
          <b>{log.title} · <bdi>{log.who}</bdi></b>
          <Mark n={4} />
        </p>
        <ul>
          {log.rows.map((row) => (
            <li key={row.kind + row.what}>
              <b className="ws-kind">{row.kind}</b>
              <span>{rich(row.what)}</span>
              <b className="ws-delta"><bdi>{row.amount}</bdi></b>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

/** ALYR Docs: the Documents section (`/app/documents`, `documentsCopy.ts`): the search, the
 * filters, every document newest first by its number with its payment and delivery, a
 * branch's own series, and the actions of the one that is open. */
export function DocumentsScreen({ sheet, shop, monogram, label, sample }: {
  sheet: DocsSheet; shop: string; monogram: string; label: string; sample: string;
}) {
  const h = sheet.heads;
  return (
    <Frame shop={shop} monogram={monogram} path={sheet.path} label={label} sample={sample}>
      <p className="ws-sub">{sheet.sub}</p>
      <div className="ws-doc-tools">
        <span className="ws-search">{sheet.search}</span>
        <span className="ws-chips">
          {sheet.filters.map((filter) => <span key={filter} className="ws-chip">{filter}<i /></span>)}
        </span>
        <span className="ws-sorted">{sheet.sorted}</span>
      </div>
      <div className="ws-table ws-docs">
        <div className="ws-tr ws-th">
          <span>{h.number}<Mark n={1} /></span>
          <span>{h.kind}</span>
          <span>{h.customer}</span>
          <span className="ws-r">{h.amount}</span>
          <span>{h.payment}<Mark n={2} /></span>
          <span>{h.delivery}<Mark n={3} /></span>
        </div>
        {sheet.rows.map((row) => (
          <div key={row.number} className={`ws-tr${row.on ? " is-on" : ""}${row.cancelled ? " is-void" : ""}`}>
            <span className="ws-docno">
              <b><bdi dir="ltr">{row.number}</bdi></b>
              {row.branch && <span className="ws-pill is-none">{row.branch}{row.number.startsWith("INVLUS") && <Mark n={4} />}</span>}
            </span>
            <span>{row.kind}</span>
            <span><bdi>{row.customer}</bdi></span>
            <span className="ws-r ws-num">{rich(row.amount)}</span>
            <span>
              {row.payment && <span className={`ws-pill${row.payment === sheet.rows[0].payment ? "" : " is-none"}`}>{row.payment}</span>}
              {row.note && <span className="ws-note">{rich(row.note)}</span>}
            </span>
            <span className="ws-deliv">{row.delivery}</span>
          </div>
        ))}
      </div>
      <p className="ws-actions ws-doc-acts">
        <b className="ws-open"><bdi dir="ltr">{sheet.rows[0].number}</bdi></b>
        {sheet.actions.map((action, index) => (
          <span key={action} className={`ws-btn${index === 0 ? " is-primary" : ""}`}>{action}</span>
        ))}
        <Mark n={5} />
      </p>
    </Frame>
  );
}

/** "0–30 days" with its range kept left to right, so Arabic does not read it "30–0". */
function ranges(text: string) {
  return text.split(/(\d+–\d+)/).map((piece, i) => (i % 2 === 1 ? <bdi key={i} dir="ltr">{piece}</bdi> : piece));
}
