"use client";

// Activations (ALY-213, D-100, spec 041): what happened when a client's payment turned their
// business into a working workspace. Every step with its result, the email to the owner and
// whether they have used the sign-in link in it. A failed one can be run again; a finished one
// can send the email a second time (the client lost it). Read from /api/admin/activations.

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Step = { key: string; state: "ok" | "failed" | "waiting"; note: string; at: string | null };
type Row = {
  id: string; client_id: string; client: string; business: string;
  trigger: "payment" | "card" | "waived" | "sweep"; status: "queued" | "done" | "failed";
  attempts: number; error: string; failed_step: string; steps: Step[];
  emailed_at: string | null; sent_to: string; link: "waiting" | "used" | "expired" | null;
  link_expires_at: string | null; recorded_by: string; created_at: string; finished_at: string | null;
};
type Answer = { activations: Row[]; failed: number };
type Show = "all" | "failed" | "queued" | "done";

const STEP: Record<string, string> = {
  plan: "Plan is active", modules: "Modules of the price switched on", setup: "Starting setup in place",
  steps: "Onboarding steps and their owners", email: "Email to the owner",
};
const STATE: Record<Step["state"], string> = { ok: "Done", failed: "Failed", waiting: "Not reached" };
const GLYPH: Record<Step["state"], string> = { ok: "✓", failed: "✗", waiting: "○" };
const TRIGGER: Record<Row["trigger"], string> = {
  payment: "Payment recorded", card: "Card payment", waived: "Payment waived", sweep: "Found by the worker",
};
const STATUS: Record<Row["status"], { pill: string; text: string }> = {
  done: { pill: "active", text: "Done" },
  queued: { pill: "wait", text: "Running or trying again" },
  failed: { pill: "bad", text: "Failed" },
};
const LINK: Record<NonNullable<Row["link"]>, string> = {
  waiting: "The owner has not used the sign-in link yet", used: "The owner signed in with the link",
  expired: "The link ran out unused; the owner can sign in with a code",
};

function when(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Qatar" }).format(new Date(iso));
}

export default function ActivationsPage() {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Answer>("/api/admin/activations");
    if (answer.ok) { setData(answer.data); setError(""); } else setError(answer.error);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 15_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  async function again(row: Row, resend: boolean) {
    if (resend && !window.confirm(`Send ${row.client} the email again? Its sign-in link is replaced, and the old one stops working.`)) return;
    setWorking(row.id);
    const answer = await api(`/api/admin/activations/${row.id}/retry`, "POST", { resend });
    setWorking("");
    if (!answer.ok) setError(answer.error); else setError("");
    load();
  }

  const all = data?.activations ?? [];
  const count = (status: Row["status"]) => all.filter((r) => r.status === status).length;
  const rows = all.filter((r) => show === "all" || r.status === show);
  const TABS: [Show, string, number][] = [
    ["all", "All", all.length], ["failed", "Failed", count("failed")],
    ["queued", "Running", count("queued")], ["done", "Done", count("done")],
  ];

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Payments · workspaces</span>
        <h1>Activations</h1>
        <p>When a client&rsquo;s payment is recorded or waived, ALYR turns their business into a working workspace and emails the owner a sign-in link that works once. Each step is shown with its result. Run a failed one again once the cause is fixed.</p>
      </header>
      <nav className="tm-seg ops-tabs" role="tablist" aria-label="Status">
        {TABS.map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={show === key} onClick={() => setShow(key)}>
            {label} <span className="num">{n}</span>
          </button>
        ))}
      </nav>
      {error && <p className="ops-error" role="alert">{error}</p>}
      {!data && !error && <p className="sh-note">Loading…</p>}
      {data && rows.length === 0 && (
        <p className="sh-note">{all.length === 0 ? "None yet. One appears here when a client’s payment is recorded or waived." : "Nothing here."}</p>
      )}
      {rows.length > 0 && (
        <div className="tablewrap ops-act"><table>
          <caption className="ops-sr">Activations, newest first</caption>
          <thead><tr>
            <th scope="col">Client</th><th scope="col">What started it</th><th scope="col">Steps</th>
            <th scope="col">Sign-in link</th><th scope="col">Result</th><th scope="col" />
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="norow">
                <td dir="auto" data-label="Client"><b>{r.client}</b><br /><small>{r.business}</small></td>
                <td data-label="What started it">
                  {TRIGGER[r.trigger]}<br /><small>{when(r.created_at)}{r.recorded_by ? ` · ${r.recorded_by}` : ""}</small>
                </td>
                <td data-label="Steps">
                  <ul className="ops-act-steps">
                    {r.steps.map((s) => (
                      <li key={s.key} className={s.state}>
                        <span aria-hidden="true">{GLYPH[s.state]}</span>{" "}
                        <b>{STEP[s.key] ?? s.key}</b>: {STATE[s.state]}
                        {s.note && s.note !== r.error && <small> · {s.note}</small>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td data-label="Sign-in link">
                  {r.emailed_at ? (
                    <>
                      Sent to <span dir="ltr">{r.sent_to}</span><br />
                      <small>{when(r.emailed_at)}{r.link ? ` · ${LINK[r.link]}` : ""}</small>
                    </>
                  ) : <small>No email sent</small>}
                </td>
                <td data-label="Result">
                  <span className={`sh-pill ${STATUS[r.status].pill}`}>{STATUS[r.status].text}</span>
                  {r.attempts > 1 && <small> · {r.attempts} tries</small>}
                  {r.error && <p className="ops-act-error" role={r.status === "failed" ? "alert" : undefined}>{r.error}</p>}
                </td>
                <td className="r">
                  {r.status === "failed" && (
                    <button className="btn small primary" type="button" disabled={working === r.id} onClick={() => again(r, false)}>Retry</button>
                  )}
                  {r.status === "done" && r.emailed_at && (
                    <button className="btn small ghost" type="button" disabled={working === r.id} onClick={() => again(r, true)}>Send the email again</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
