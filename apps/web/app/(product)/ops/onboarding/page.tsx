"use client";

// The onboarding board (ALY-165, D-049): every business by stage, as the readiness check last
// saw it. What is left, which steps ALYR took on for the client (assisted onboarding), what is
// holding a step up, and who has not moved in two days. "Check now" runs the check for one
// business as its owner would see it. Each business's WhatsApp setup (ALY-217) shows what
// its way needs, and staff say where ALYR is with connecting it.

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Stage = "setting_up" | "ready" | "live";
type Row = {
  id: string; name: string; slug: string; client_id: string | null; type: string; way: string;
  stage: Stage; created_at: string; ready_at: string | null; live_at: string | null;
  days_in_stage: number; checked: boolean; left: string[]; alyr_owes: string[];
  blockers: Record<string, string>; choices: Record<string, string>; stuck: boolean; helped: number;
  whatsapp: {
    way: string; status: WaStatus; phone: string; display_name: string; note: string;
    needs: { key: string; label: { en: string }; done: boolean }[];
  };
};
type WaStatus = "none" | "preparing" | "waiting_on_meta" | "queued" | "connecting" | "failed" | "connected";
type Board = { businesses: Row[]; counts: Record<Stage, number> };

const STAGES: Record<Stage, string> = { setting_up: "Setting up", ready: "Ready, waiting for WhatsApp", live: "Live" };
const STEPS: Record<string, string> = {
  content: "What they sell", hours: "Opening hours", test: "Test order or booking",
  price: "Plan accepted", payments: "How customers pay", whatsapp: "WhatsApp number",
};
const CHOICES: Record<string, string> = {
  alyr_number: "ALYR's number", new_number: "new number", move_number: "move their number",
  own_account: "their own account", cash_transfer: "cash and transfer", online: "online",
};

const WA: Record<WaStatus, string> = {
  none: "no way chosen", preparing: "getting ready", waiting_on_meta: "ready, waiting for Meta",
  queued: "ready for ALYR to connect", connecting: "ALYR connecting", failed: "failed", connected: "connected",
};
// The businesses ALYR can act on now: everything ready, or already started.
const TO_CONNECT: WaStatus[] = ["queued", "connecting", "failed"];

export default function OnboardingBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [show, setShow] = useState<Stage | "owed" | "whatsapp" | "all">("setting_up");
  const [note, setNote] = useState<Record<string, string>>({});
  const [open, setOpen] = useState("");
  const [blocker, setBlocker] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Board>("/api/admin/onboarding");
    if (answer.ok) setBoard(answer.data);
    else setError(answer.error);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function checkNow(id: string) {
    const answer = await api(`/api/admin/businesses/${id}/readiness`);
    if (!answer.ok) return setError(answer.error);
    load();
  }
  async function change(id: string, step: string, body: { owner?: "client" | "alyr"; blocker?: string }) {
    const answer = await api(`/api/admin/businesses/${id}/steps/${step}`, "PATCH", body);
    if (!answer.ok) return setError(answer.error);
    setError("");
    load();
  }

  async function connecting(id: string, state: "" | "connecting" | "failed", why = "") {
    const answer = await api(`/api/admin/businesses/${id}/whatsapp`, "PATCH", { state, note: why });
    if (!answer.ok) return setError(answer.error);
    setError("");
    load();
  }

  const all = board?.businesses ?? [];
  const toConnect = (b: Row) => TO_CONNECT.includes(b.whatsapp.status);
  const rows = all.filter((b) =>
    show === "all" ? true : show === "owed" ? b.alyr_owes.length > 0 : show === "whatsapp" ? toConnect(b) : b.stage === show);
  const owed = all.filter((b) => b.alyr_owes.length > 0).length;

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Onboarding</span>
        <h1>Every business on its way to live</h1>
        <p>Ready means everything but the WhatsApp number is done. Live starts the money-back clock.</p>
      </header>
      <nav className="tm-seg ops-tabs" role="tablist" aria-label="Stage">
        {(["setting_up", "ready", "live"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={show === s} onClick={() => setShow(s)}>
            {STAGES[s]} <span className="num">{board?.counts[s] ?? 0}</span>
          </button>
        ))}
        <button type="button" role="tab" aria-selected={show === "owed"} onClick={() => setShow("owed")}>ALYR owes <span className="num">{owed}</span></button>
        <button type="button" role="tab" aria-selected={show === "whatsapp"} onClick={() => setShow("whatsapp")}>WhatsApp to connect <span className="num">{all.filter(toConnect).length}</span></button>
        <button type="button" role="tab" aria-selected={show === "all"} onClick={() => setShow("all")}>All</button>
      </nav>
      {error && <p className="sh-note" role="alert">{error}</p>}
      {rows.length === 0 ? <p className="sh-note">Nobody here.</p> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Business</th><th>Stage</th><th>Left</th><th>ALYR owes</th><th /></tr></thead>
          <tbody>
            {rows.map((b) => (
              <Fragment key={b.id}>
                <tr className="norow">
                  <td>
                    <b>{b.name}</b><br />
                    <small>{b.type || "no type"} · {b.days_in_stage} {b.days_in_stage === 1 ? "day" : "days"} in this stage{b.helped ? ` · helped ${b.helped}×` : ""}</small>
                  </td>
                  <td>
                    <span className={`sh-pill ${b.stage === "live" ? "active" : b.stuck ? "bad" : ""}`}>{b.stuck ? "Stuck 2+ days" : STAGES[b.stage]}</span>
                  </td>
                  <td>
                    {!b.checked ? <small>Not checked yet</small> : b.left.length === 0 ? <small>Nothing</small> : b.left.map((k) => (
                      <div key={k}>
                        {STEPS[k] ?? k}
                        {b.choices[k] && <small> · chose {CHOICES[b.choices[k]] ?? b.choices[k]}</small>}
                        {k === "whatsapp" && b.whatsapp.status !== "none" && <small> · {WA[b.whatsapp.status]}</small>}
                        {b.blockers[k] && <><br /><small>Held up: {b.blockers[k]}</small></>}
                      </div>
                    ))}
                  </td>
                  <td>{b.alyr_owes.map((k) => STEPS[k] ?? k).join(", ")}</td>
                  <td className="r">
                    <button className="btn small ghost" type="button" onClick={() => checkNow(b.id)}>Check now</button>{" "}
                    <button className="btn small" type="button" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? "" : b.id)}>Steps</button>
                  </td>
                </tr>
                {open === b.id && (
                  <tr className="norow">
                    <td colSpan={5}>
                      {b.whatsapp.way && b.whatsapp.status !== "connected" && (() => {
                        const w = b.whatsapp;
                        const why = note[b.id] ?? (w.status === "failed" ? w.note : "");
                        return (
                          <div className="ops-wa">
                            <p>
                              <b>WhatsApp: {CHOICES[w.way] ?? w.way}</b> · {WA[w.status]}
                              {w.phone && <> · <span dir="ltr">{w.phone}</span></>}
                              {w.display_name && <> · shows as “{w.display_name}”</>}
                            </p>
                            {w.needs.length > 0 && (
                              <ul>
                                {w.needs.map((n) => <li key={n.key} className={n.done ? "done" : ""}>{n.done ? "✓" : "○"} {n.label.en}</li>)}
                              </ul>
                            )}
                            <div className="ops-step">
                              <button className="btn small" type="button" disabled={w.status === "connecting"} onClick={() => connecting(b.id, "connecting")}>Start connecting</button>
                              <input aria-label="Why it failed" placeholder="Why it failed (the owner reads this)" value={why} maxLength={500}
                                onChange={(e) => setNote({ ...note, [b.id]: e.target.value })} />
                              <button className="btn small ghost" type="button" disabled={!why.trim()} onClick={() => connecting(b.id, "failed", why)}>It failed</button>
                              {(w.status === "connecting" || w.status === "failed") && (
                                <button className="btn small ghost" type="button" onClick={() => connecting(b.id, "")}>Clear</button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      {b.left.length === 0 ? <small>Nothing left to do.</small> : b.left.map((k) => {
                        const ours = b.alyr_owes.includes(k);
                        const key = `${b.id}:${k}`;
                        return (
                          <div key={k} className="ops-step">
                            <b>{STEPS[k] ?? k}</b>
                            <button className="btn small ghost" type="button" onClick={() => change(b.id, k, { owner: ours ? "client" : "alyr" })}>
                              {ours ? "Hand back to the client" : "ALYR takes it on"}
                            </button>
                            <input aria-label={`What holds up ${STEPS[k] ?? k}`} placeholder="What is holding it up"
                              value={blocker[key] ?? b.blockers[k] ?? ""} maxLength={500}
                              onChange={(e) => setBlocker({ ...blocker, [key]: e.target.value })} />
                            <button className="btn small ghost" type="button" onClick={() => change(b.id, k, { blocker: blocker[key] ?? b.blockers[k] ?? "" })}>Save</button>
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
