"use client";

// Today (D-033): one queue of everything that needs ALYR, most urgent and oldest first.
// Anything can be set aside for a few days; it comes back on its own.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Item = {
  key: string; kind: string; title: string; detail: string; since: string | null;
  client_id: string | null; business_id: string | null; urgent: boolean; until?: string;
};
type Today = { items: Item[]; later: Item[]; counts: Record<string, number> };

const KIND: Record<string, string> = {
  price: "To price", answer: "Waiting for owner", request: "Asked for help",
  whatsapp: "Go-live", stuck: "Stuck", delivery: "Failing",
};

function age(since: string | null) {
  if (!since) return "";
  const hours = (Date.now() - new Date(since).getTime()) / 3_600_000;
  if (hours < 1) return "now";
  if (hours < 24) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function target(item: Item) {
  if (item.kind === "request" && !item.client_id) return "/ops/requests";
  return item.client_id ? `/ops/clients?client=${item.client_id}` : "/ops/clients";
}

export default function TodayPage() {
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Today>("/api/admin/today");
    if (answer.ok) setData(answer.data); else setError(answer.error);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  async function later(key: string, days: number) {
    const answer = await api("/api/admin/today/snooze", "POST", { key, days });
    if (!answer.ok) return setError(answer.error);
    load();
  }
  async function back(key: string) {
    await api("/api/admin/today/unsnooze", "POST", { key, days: 1 });
    load();
  }

  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const urgent = data?.items.filter((i) => i.urgent).length ?? 0;

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{date} · Doha</span>
        <h1>Today</h1>
        <p>{!data ? "Loading…" : data.items.length === 0 ? "Nothing needs you right now." : `${data.items.length} things need ALYR${urgent ? `, ${urgent} of them urgent` : ""}.`}</p>
      </header>
      {error && <p className="ops-error" role="alert">{error}</p>}

      {data && (
        <section className="ops-stats ops-kinds">
          {Object.entries(KIND).map(([kind, label]) => (
            <div key={kind} className={`sh-tile ${data.counts[kind] ? "" : "ops-quiet"}`}><span>{label}</span><b className="num">{data.counts[kind] ?? 0}</b></div>
          ))}
        </section>
      )}

      {data && data.items.length > 0 && (
        <section>
          <ul className="ops-queue">
            {data.items.map((item) => (
              <li key={item.key} className={item.urgent ? "urgent" : ""}>
                <span className={`sh-pill ${item.urgent ? "wait" : "coming"}`}>{KIND[item.kind] ?? item.kind}</span>
                <div className="ops-queue-text">
                  <b>{item.title}</b>
                  <small dir="auto">{item.detail}</small>
                </div>
                <span className="ops-age num" title={item.since ? new Date(item.since).toLocaleString("en-GB") : ""}>{age(item.since)}</span>
                <div className="ops-queue-actions">
                  <Link className="btn small" href={target(item)}>Open</Link>
                  <select aria-label={`Set aside ${item.title}`} value="" onChange={(e) => e.target.value && later(item.key, Number(e.target.value))}>
                    <option value="">Later…</option>
                    <option value="1">Tomorrow</option>
                    <option value="3">In 3 days</option>
                    <option value="7">Next week</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.later.length > 0 && (
        <section>
          <h2>Set aside <span className="sh-count">{data.later.length}</span></h2>
          <ul className="ops-queue quiet">
            {data.later.map((item) => (
              <li key={item.key}>
                <span className="sh-pill coming">{KIND[item.kind] ?? item.kind}</span>
                <div className="ops-queue-text"><b>{item.title}</b><small>Back on {new Date(item.until ?? "").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</small></div>
                <span />
                <div className="ops-queue-actions"><button className="btn small ghost" type="button" onClick={() => back(item.key)}>Bring back</button></div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
