"use client";

// Usage (D-039, ALY-109): what each business stores and uploads, against R2's free 10 GB.
// Items, photos, gigabytes stored and uploads for a month, the months before it for the
// trend, and the total with its 80% alert. Read only: it prices and bills nobody. Charging by
// usage, when the founder decides it, goes through the price list (D-032), not through here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";

type Shop = {
  tenant_id: string; business: string; photos: number; gb: number; bytes: number; peak_gb: number;
  uploads: number; duplicates: number; refused: number; active_items: number; photos_limit: number;
};
type Month = {
  month: string; current: boolean; shops: Shop[];
  totals: { shops: number; photos: number; gb: number; uploads: number; active_items: number };
};
type Usage = {
  storage: string;
  alert: { level: "ok" | "warn" | "over"; percent: number; used_gb: number; free_gb: number; at_percent: number };
  months: Month[];
};

const SORTS = {
  gb: "Stored", business: "Business", active_items: "Items", photos: "Photos", uploads: "Uploads",
} as const;
type SortKey = keyof typeof SORTS;

const LEVEL = {
  ok: { pill: "active", text: "Within the free tier" },
  warn: { pill: "wait", text: "Past the alert line" },
  over: { pill: "bad", text: "Over the free tier" },
} as const;

/** Gigabytes as a person reads them: a dozen photos are 0.001 GB, so three places. */
function gb(value: number) {
  if (value === 0) return "0 GB";
  if (value < 0.001) return "<0.001 GB";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 3 })} GB`;
}

function monthName(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, number - 1, 1)));
}

/** How a business's stored gigabytes moved since the month before (or "new"). */
function trend(now: number, before: number | undefined) {
  if (before === undefined) return "";
  if (before === 0) return now === 0 ? "none" : "new";
  const diff = Math.round((now - before) * 1000) / 1000;
  if (diff === 0) return "no change";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString("en-US", { maximumFractionDigits: 3 })} GB`;
}

export default function UsagePage() {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState("");
  const [sort, setSort] = useState<SortKey>("gb");
  const [down, setDown] = useState(true);

  const load = useCallback(async () => {
    const answer = await api<Usage>("/api/admin/media/usage/history?months=6");
    if (answer.ok) { setData(answer.data); setError(""); } else setError(answer.error);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const shown = data?.months.find((m) => m.month === month) ?? data?.months[0];
  const before = useMemo(() => {
    const at = data && shown ? data.months.findIndex((m) => m.month === shown.month) : -1;
    const older = at >= 0 ? data?.months[at + 1] : undefined;
    return older ? new Map(older.shops.map((s) => [s.tenant_id, s.gb])) : null;
  }, [data, shown]);

  const rows = useMemo(() => {
    const list = [...(shown?.shops ?? [])];
    const sign = down ? -1 : 1;
    list.sort((a, b) => {
      const result = sort === "business" ? a.business.localeCompare(b.business) : (a[sort] as number) - (b[sort] as number);
      return result * sign || a.business.localeCompare(b.business);
    });
    return list;
  }, [shown, sort, down]);

  const level = data ? LEVEL[data.alert.level] : null;
  const peak = Math.max(...(data?.months.map((m) => m.totals.gb) ?? [0]), 0.000001);

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Photos · storage{data ? ` · ${data.storage === "local" ? "this machine's disk" : "Cloudflare R2"}` : ""}</span>
        <h1>Usage</h1>
        <p>What each business keeps and uploads, month by month. For reading only: nothing here prices or bills anyone.</p>
      </header>
      {error && <p className="ops-error" role="alert">{error}</p>}
      {!data && !error && <p className="sh-note">Loading…</p>}

      {data && level && (
        <section className="sh-tile ops-meter" aria-label="Storage against the free 10 GB">
          <div className="ops-meter-top">
            <div>
              <span>Stored by all businesses</span>
              <b className="num">{gb(data.alert.used_gb)} <small>of {data.alert.free_gb.toLocaleString("en-US")} GB free</small></b>
            </div>
            <span className={`sh-pill ${level.pill}`}>{level.text}</span>
          </div>
          <div className="ops-gauge" role="img" aria-label={`${data.alert.percent}% of the free tier used; the alert line is at ${data.alert.at_percent}%`}>
            <span className={`ops-gauge-fill ${data.alert.level}`} style={{ width: `${Math.min(data.alert.percent, 100)}%` }} />
            <i className="ops-gauge-line" style={{ insetInlineStart: `${data.alert.at_percent}%` }} aria-hidden="true" />
          </div>
          <small>{data.alert.percent}% used · the alert is at {data.alert.at_percent}%</small>
        </section>
      )}

      {data && shown && (
        <section>
          <div className="ops-toolbar">
            <label className="ops-field"><span>Month</span>
              <select value={shown.month} onChange={(e) => setMonth(e.target.value)}>
                {data.months.map((m) => <option key={m.month} value={m.month}>{monthName(m.month)}{m.current ? " (so far)" : ""}</option>)}
              </select>
            </label>
            <label className="ops-field"><span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORTS) as SortKey[]).map((key) => <option key={key} value={key}>{SORTS[key]}</option>)}
              </select>
            </label>
            <button type="button" className="btn small" onClick={() => setDown(!down)} aria-label={down ? "Sorted high to low. Switch to low to high" : "Sorted low to high. Switch to high to low"}>
              {down ? "High to low" : "Low to high"}
            </button>
          </div>

          <div className="tablewrap ops-usage"><table>
            <caption className="ops-sr">Usage by business, {monthName(shown.month)}</caption>
            <thead><tr>
              <th scope="col">Business</th><th scope="col" className="r">Items</th><th scope="col" className="r">Photos</th>
              <th scope="col" className="r">Stored</th><th scope="col" className="r">Uploads</th>
              {before && <th scope="col" className="r">Since last month</th>}
            </tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.tenant_id} className="norow">
                  <td dir="auto" data-label="Business"><b>{s.business}</b></td>
                  <td className="r num" data-label="Items">{s.active_items.toLocaleString("en-US")}</td>
                  <td className="r num" data-label="Photos">{s.photos.toLocaleString("en-US")}{s.photos >= s.photos_limit && <small> · at the limit</small>}</td>
                  <td className="r num" data-label="Stored">{gb(s.gb)}</td>
                  <td className="r num" data-label="Uploads">{s.uploads.toLocaleString("en-US")}</td>
                  {before && <td className="r num" data-label="Since last month">{trend(s.gb, before.get(s.tenant_id)) || "—"}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="norow">
              <th scope="row">All {shown.totals.shops} businesses</th>
              <td className="r num" data-label="Items">{shown.totals.active_items.toLocaleString("en-US")}</td>
              <td className="r num" data-label="Photos">{shown.totals.photos.toLocaleString("en-US")}</td>
              <td className="r num" data-label="Stored">{gb(shown.totals.gb)}</td>
              <td className="r num" data-label="Uploads">{shown.totals.uploads.toLocaleString("en-US")}</td>
              {before && <td />}
            </tr></tfoot>
          </table></div>
          <p className="sh-note">Stored is what the business keeps now (this month) or at the last change of the month (earlier months). Uploads count the photos sent that month.</p>
        </section>
      )}

      {data && (
        <section>
          <h2>Month by month</h2>
          <div className="tablewrap ops-usage"><table>
            <caption className="ops-sr">All businesses together, newest month first</caption>
            <thead><tr>
              <th scope="col">Month</th><th scope="col" className="r">Items</th><th scope="col" className="r">Photos</th>
              <th scope="col" className="r">Stored</th><th scope="col" className="r">Uploads</th>
            </tr></thead>
            <tbody>
              {data.months.map((m) => (
                <tr key={m.month} className="norow">
                  <td data-label="Month"><span><b>{monthName(m.month)}</b>{m.current && <small> · so far</small>}</span></td>
                  <td className="r num" data-label="Items">{m.totals.active_items.toLocaleString("en-US")}</td>
                  <td className="r num" data-label="Photos">{m.totals.photos.toLocaleString("en-US")}</td>
                  <td className="r num ops-trend" data-label="Stored">
                    <span className="ops-trend-in">
                      <span>{gb(m.totals.gb)}</span>
                      <span className="ops-bar" aria-hidden="true"><span style={{ width: `${Math.max((m.totals.gb / peak) * 100, m.totals.gb ? 3 : 0)}%` }} /></span>
                    </span>
                  </td>
                  <td className="r num" data-label="Uploads">{m.totals.uploads.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
