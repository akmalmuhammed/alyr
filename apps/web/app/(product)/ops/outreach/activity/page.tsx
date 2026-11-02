"use client";

// Activity (specs/065, ALY-311): what the send gateway sent and refused, and what came back (
// replies, opt-outs, bounces), newest first; a refusal names the check that stopped it. Above it,
// today's sends against the global cap and the mailbox's ramp cap.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { ACTIVITY, ACTIVITY_ONE, GATEWAY_CHECK, W } from "../copy";
import { leftToday, when, type Tone } from "../outreachLogic";
import { Empty, Failed, Pill } from "../parts";
import type { Activity, ActivityKind } from "../types";

const A = W.activity;
const KINDS: (ActivityKind | "all")[] = ["all", "send", "reply", "refusal", "opt_out", "bounce"];
const TONE: Record<ActivityKind, Tone> = { send: "active", reply: "active", refusal: "wait", opt_out: "idle", bounce: "bad" };

function Gauge({ label, used, cap }: { label: string; used: number; cap: number }) {
  const share = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
  return (
    <div className="or-gauge">
      <div className="or-gauge-top"><span>{label}</span><b className="num">{used}<small>&nbsp;/&nbsp;{cap}</small></b></div>
      <div className="ops-gauge" role="img" aria-label={`${label}: ${used} of ${cap}`}>
        <span className={`ops-gauge-fill ${used >= cap ? "over" : share >= 80 ? "warn" : ""}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Activity>(`/api/admin/outreach/activity${kind === "all" ? "" : `?kind=${kind}`}`);
    if (answer.ok) { setData(answer.data); setError(""); } else setError(answer.error || W.loadError);
  }, [kind]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  const t = data?.today;
  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{A.eyebrow}</span>
        <h1>{A.title}</h1>
        <p>{A.lead}</p>
      </header>
      {error && !data && <Failed message={error} retry={load} />}
      {!data && !error && <p className="sh-note">{W.loading}</p>}
      {t && (
        <section className="sh-tile or-today" aria-label={A.todayTitle}>
          <h2>{A.todayTitle}</h2>
          <div className="or-gauges">
            <Gauge label={A.globalCap} used={t.sent} cap={t.global_cap} />
            <Gauge label={A.mailboxCap(t.ramp_week)} used={t.sent} cap={t.mailbox_cap} />
          </div>
          <p className="sh-note">{A.left(leftToday(t))}{t.queued > 0 && ` ${A.queued(t.queued)}.`}</p>
        </section>
      )}
      {data && (
        <section>
          <nav className="tm-seg ops-tabs or-kinds" role="tablist" aria-label={A.title}>
            {KINDS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
                {ACTIVITY[k]}{k !== "all" && <span className="num"> {data.counts[k] ?? 0}</span>}
              </button>
            ))}
          </nav>
          {data.items.length === 0 ? (kind === "all"
            ? <Empty title={A.emptyTitle} text={A.emptyText} slots={3} />
            : <p className="sh-note">{A.noneOfKind}</p>) : (
            <div className="tablewrap ops-list or-activity"><table>
              <caption className="ops-sr">{A.title}</caption>
              <thead><tr><th scope="col">{A.columns.when}</th><th scope="col">{A.columns.what}</th><th scope="col">{A.columns.company}</th><th scope="col">{A.columns.detail}</th></tr></thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className="norow">
                    <td><small>{when(i.at)}</small></td>
                    <td>
                      <Pill tone={TONE[i.kind]}>{ACTIVITY_ONE[i.kind]}{i.step ? ` · ${A.step(i.step)}` : ""}</Pill>
                    </td>
                    <td>{i.prospect_id ? <Link href={`/ops/outreach/prospects?id=${i.prospect_id}`}>{i.company}</Link> : i.company}</td>
                    <td className="ops-detail-cell">
                      {i.check !== null && <b>{A.check(i.check)} · {GATEWAY_CHECK[i.check] ?? ""}{i.outcome && ` · ${i.outcome}`}</b>}
                      {i.check !== null && i.detail && <br />}
                      {i.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      )}
    </>
  );
}
