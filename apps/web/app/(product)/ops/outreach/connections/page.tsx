"use client";

// Connections (specs/065, ALY-311): each outside service the engine uses, whether all its
// settings are present, its last test and a Test button. The API sends setting names and whether
// each is present, never a value; a test never sends an email or any personal data.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { RUNBOOK, SERVICE, SERVICE_ORDER, W } from "../copy";
import { useOverview } from "../Frame";
import { when } from "../outreachLogic";
import { Failed, Pill } from "../parts";
import type { Connection, Connections, ConnectionTest, ServiceKey } from "../types";

const C = W.connections;

export default function ConnectionsPage() {
  const [list, setList] = useState<Connection[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Connections>("/api/admin/outreach/connections");
    if (answer.ok) { setList(answer.data.connections); setError(""); } else setError(answer.error || W.loadError);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const byKey = new Map((list ?? []).map((c) => [c.key, c]));
  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">{C.eyebrow}</span>
        <h1>{C.title}</h1>
        <p>{C.lead}</p>
      </header>
      {error && !list && <Failed message={error} retry={load} />}
      {!list && !error && <p className="sh-note">{W.loading}</p>}
      {list && (
        <ul className="or-services">
          {SERVICE_ORDER.map((key) => (
            <Service key={key} k={key} c={byKey.get(key) ?? null} tested={(t) => setList((now) => (now ?? []).map((c) => (c.key === key ? { ...c, last_test: t } : c)))} />
          ))}
        </ul>
      )}
    </>
  );
}

function Service({ k, c, tested }: { k: ServiceKey; c: Connection | null; tested: (t: ConnectionTest) => void }) {
  const { refresh } = useOverview();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const words = SERVICE[k];
  const configured = c?.configured ?? false;

  async function test() {
    setBusy(true); setError("");
    const answer = await api<ConnectionTest>(`/api/admin/outreach/connections/${k}/test`, "POST");
    setBusy(false);
    if (!answer.ok) return setError(answer.error);
    tested(answer.data);
    refresh();
  }

  return (
    <li className="or-card or-service">
      <header className="or-card-head">
        <div>
          <h2>{words.name}{c?.provider && <span className="or-dim"> · {c.provider}</span>}</h2>
          <p className="or-card-sub">{words.does}</p>
        </div>
        <div className="or-pills">
          <Pill tone={configured ? "active" : "wait"}>{configured ? C.configured : C.notConfigured}</Pill>
        </div>
      </header>
      {c && c.settings.length > 0 && (
        <div>
          <h3 className="or-label">{C.settings}</h3>
          <ul className="or-settings">
            {c.settings.map((s) => (
              <li key={s.name} className={s.present ? "" : "missing"}>
                <code>{s.name}</code> <span>{s.present ? C.set : C.missing}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="or-test">
        <p>
          <span className="or-label">{C.lastTest}</span>{" "}
          {c?.last_test
            ? <><Pill tone={c.last_test.ok ? "active" : "bad"}>{c.last_test.ok ? C.ok : C.fail}</Pill> <span>{c.last_test.message}</span> <small className="or-dim">· {when(c.last_test.at)} · {c.last_test.by}</small></>
            : <span className="or-dim">{C.never}</span>}
        </p>
        <button type="button" className="btn" onClick={test} disabled={busy || !configured} aria-describedby={configured ? undefined : `need-${k}`}>
          {busy ? C.testing : C.test}
        </button>
        {!configured && <small id={`need-${k}`} className="or-dim">{C.needsConfig}</small>}
      </div>
      {error && <p className="ops-error" role="alert">{error}</p>}
      <details className="or-setup" open={!configured}>
        <summary>{C.setup}</summary>
        <ol>{words.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <p className="sh-note">{C.runbook} <code>{RUNBOOK}</code></p>
      </details>
    </li>
  );
}
