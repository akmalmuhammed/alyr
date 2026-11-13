"use client";

// Credit accounts: who owes what, and for how long, with the entries of one account. Moved out
// of Screens.tsx unchanged when that file was split into one file per screen.

import { useCallback, useState } from "react";
import { usePolling } from "../poll";
import { shopNameShown } from "../shopLedger";
import { T } from "../screensCopy";
import {
  AssignSelect, DAY_MS, ScreenFrame, ShowFilter, activeFilter, getJson, giveRow, maybe, useShopFacts,
  type DocumentRef, type Summary, type ScreenProps,
} from "./shared";

type Entry = { kind: string; amount_text: string; note: string; created_at: string; document?: DocumentRef };

const BUCKET_KEYS = ["d0_30", "d31_60", "d61_90", "d90_plus"] as const;

const qar = (dirhams: number) =>
  "QAR " + (dirhams / 100).toLocaleString("en", { maximumFractionDigits: 2 });

function bucketIndex(days: number) {
  return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
}

export function CreditScreen({ lang, intro, show = null, onClearShow, modules, business }: ScreenProps) {
  const { members, canManage, summary, setSummary } = useShopFacts(modules);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  // Refreshed with the data, so the rules about "days since" never call the clock while rendering.
  const [now, setNow] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = T[lang];
  const filter = activeFilter(show, "ledger");
  const filterLine = <ShowFilter filter={filter} lang={lang} onClearShow={onClearShow} />;

  const refresh = useCallback(async () => {
    try {
      // Independent of one another, so asked together rather than one after another.
      await Promise.all([
        maybe<Summary | null>("/api/ledger/summary", null).then(setSummary),
        selected
          ? getJson<{ entries: Entry[] }>(`/api/ledger/customers/${selected}/entries`).then((e) => setEntries(e.entries))
          : null,
      ]);
      setNow(Date.now());
      setError("");
    } catch {
      setError(t.unreachable);
    }
  }, [selected, t, setSummary]);

  // Every 10 s while the screen is on show, and at once when what is asked for changes or the
  // person comes back to the tab.
  usePolling(refresh, 10_000);

  async function remind() {
    setBusy(true);
    try {
      const data = await getJson<{
        sent: number; skipped_promised: number; skipped_recent: number; skipped_opted_out: number;
      }>("/api/ledger/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_days: 30 }),
      });
      setNote(t.sent(data.sent, data.skipped_promised + data.skipped_recent + data.skipped_opted_out));
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function giveTo(path: string, userId: string | null) {
    await giveRow(path, userId);
    refresh();
  }

  const total = summary ? Math.max(summary.outstanding, 1) : 1;
  const shownCustomers = (summary?.customers ?? []).filter((c) => {
    if (filter === "overdue") {
      const reminded = c.last_reminded_at ? new Date(c.last_reminded_at).getTime() : 0;
      return c.balance > 0 && c.oldest_days >= 30 && !c.promised_until && now - reminded > 7 * DAY_MS;
    }
    if (filter === "promised") return Boolean(c.promised_until);
    if (filter === "promise_passed") return Boolean(c.promise_passed) && c.balance > 0;
    if (filter === "over_limit") return c.over_limit;
    return true;
  });
  const selectedCustomer = summary?.customers.find((c) => c.id === selected);

  return (
    <ScreenFrame lang={lang} error={error} title={t.tabLedger} shop={shopNameShown(lang, summary?.shop, business)} sub={t.sub} intro={intro}>
      {summary && (
        <>
          <div className="tiles">
          <div className="totals">
            <span className="label">{t.outstanding}</span>
            <span className="big num" dir="ltr">{summary.outstanding_text}</span>
            <span>{t.owing(summary.customers_owing)}</span>
            <div className="agebar" aria-hidden="true">
              {BUCKET_KEYS.map((k, i) => (
                <span key={k} className={`a${i}`} style={{ width: `${(summary.buckets[k] / total) * 100}%` }} />
              ))}
            </div>
            <div className="legend">
              {BUCKET_KEYS.map((k, i) => (
                <div key={k}>
                  <small><i className={`a${i}`} />{t.buckets[i]}</small>
                  <b className="num" dir="ltr">{qar(summary.buckets[k])}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="totals">
            <span className="label">{t.collected}</span>
            <span className="big num" dir="ltr">{summary.collected_by_link_text}</span>
            <span>{t.payments(summary.payments_by_link)}</span>
          </div>
          </div>

          <div className="actions">
            {canManage && (
              <>
                <button className="btn primary" onClick={remind} disabled={busy}>{t.remind}</button>
                <span style={{ color: "var(--muted)", fontSize: 13.5 }}>{t.remindHint}</span>
              </>
            )}
            {note && <span className="note">{note}</span>}
          </div>

          {filterLine}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{t.customer}</th>
                  <th className="r">{t.balance}</th>
                  <th>{t.age}</th>
                </tr>
              </thead>
              <tbody>
                {shownCustomers.map((c) => (
                  <tr key={c.id} className={c.id === selected ? "sel" : ""} onClick={() => setSelected(c.id)}>
                    <td>
                      {c.name}
                      {c.assigned && <span className="pill none gap">{c.assigned.name}</span>}
                      {c.over_limit && <span className="pill p3 gap">{t.overLimit}</span>}
                      {c.opted_out && <span className="pill none gap">{t.optedOut}</span>}
                    </td>
                    <td className="r num" dir="ltr">{c.balance_text}</td>
                    <td>
                      {c.balance > 0 ? (
                        <>
                          <span className={`pill p${bucketIndex(c.oldest_days)}`}>{t.days(c.oldest_days)}</span>
                          {c.promised_until && (
                            <span className="pill promise gap">
                              {t.promised(new Date(c.promised_until).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }))}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="pill none">{t.settled}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedCustomer && (
            <div className="entries">
              <div className="entries-head">
                <h2>{t.entries} · {selectedCustomer.name}</h2>
                <label className="assign">
                  {t.followsUp}
                  <AssignSelect value={selectedCustomer.assigned} members={members} label={t.followsUp} nobody={t.nobody}
                    onChange={(id) => giveTo(`/api/ledger/customers/${selectedCustomer.id}/assign`, id)} />
                </label>
              </div>
              <ul>
                {entries.map((e, i) => (
                  <li key={i}>
                    <span className="mono" dir="ltr">
                      {new Date(e.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                    <span>
                      {t.kinds[e.kind]}{e.note ? ` · ${e.note}` : ""}
                      {e.document && canManage && (
                        <> · <a className="doc-link" href={`/app/documents?d=${e.document.id}`}>{t.docLink(e.document.kind, e.document.number, e.document.status)}</a></>
                      )}
                    </span>
                    <b className={`num ${e.kind === "payment" || e.kind === "reversal" ? "minus" : "plus"}`} dir="ltr">
                      {e.kind === "payment" || e.kind === "reversal" ? "−" : "+"}{e.amount_text}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </ScreenFrame>
  );
}
