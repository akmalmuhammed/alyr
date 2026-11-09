"use client";

// The connected-apps screen (ALY-292, specs/067-mcp-connector, D-170): where an owner turns their
// own AI app's connection to ALYR on, sees every app connected and when it last asked, ends one or
// all, pauses everything at once (the kill switch) and reads what the apps did. It sits under
// Connections at `/app/connect-ai`.
//
// Who may do what, as the API decides it (routes/mcp_manage.py): an owner turns it on (an admin sees
// the state and is told why they cannot); an owner or an admin pauses, resumes and ends connections;
// anyone else may not even read it, so they are told so and nothing is asked. A 404 from the API
// means the connector is switched off for the whole server: that is a state with nothing to press.
//
// Volt marks the one main action of the moment: Turn on while it is off, Resume while it is paused,
// and nothing while it runs (the kill switch is an outlined button, not the screen's main action).
// What an app may be given, and where it goes, is said in plain words on the screen, and the owner's
// confirmation is a box they tick in a sheet, not a button they press by habit. Every word is in
// `mcpCopy.ts`; everything an app or a person wrote is drawn as text (see `mcpApi.ts`).

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Sheet, ToastLayer, useToasts } from "./CatalogUi";
import { McpConnections } from "./McpConnections";
import { McpLog } from "./McpLog";
import { mcp } from "./mcpCalls";
import type { Overview, Row } from "./mcpApi";
import { T, type Lang } from "./mcpCopy";
import { canOptIn, capIsRecent, isManager, modeOf, newerOnly, sayError, screenFor, usableAddress, when, type Screen } from "./mcpLogic";
import "./mcp.css";

type Sheeted = null | { is: "on" } | { is: "end"; id: string; app: string } | { is: "all"; n: number };

export function Mcp({ lang, role }: { lang: Lang; role: string }) {
  const c = T[lang];
  const manager = isManager(role);
  const { toasts, push, dismiss } = useToasts();
  const [screen, setScreen] = useState<Screen>(manager ? "loading" : "forbidden");
  const [view, setView] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowsFailed, setRowsFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheeted>(null);
  const [busy, setBusy] = useState(false);
  const asked = useRef(newerOnly());
  const lead = useRef<HTMLParagraphElement>(null);
  const known = useRef(false);

  const load = useCallback(async () => {
    const mine = asked.current.next();
    const [overview, record] = await Promise.allSettled([mcp.overview(), mcp.rows()]);
    if (!asked.current.current(mine)) return;
    if (overview.status === "rejected") {
      const next = screenFor(overview.reason);
      // A hiccup on a later look keeps what was on screen and says so; the first look has nothing to keep.
      if (next === "error" && known.current) push(sayError(overview.reason, c), { tone: "bad" });
      else setScreen(next);
      return;
    }
    known.current = true;
    setView(overview.value);
    setScreen("ready");
    if (record.status === "fulfilled") { setRows(record.value); setRowsFailed(false); } else setRowsFailed(true);
  }, [c, push]);

  useEffect(() => {
    if (!manager) return;
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, manager]);

  const header = (
    <header className="sh-head mc-head">
      <span className="sh-eyebrow">{c.eyebrow}</span>
      <h1>{c.title}</h1>
      <p>{c.sub}</p>
    </header>
  );
  const frame = (body: React.ReactNode) => <div className="ct mc" lang={lang}>{header}{body}</div>;

  if (screen === "loading") return frame(<p className="mc-quiet" role="status">{c.loading}</p>);
  if (screen === "forbidden") {
    return frame(<section className="mc-card mc-plain" aria-labelledby="mc-forbidden"><h2 id="mc-forbidden">{c.forbiddenTitle}</h2><p>{c.forbidden}</p></section>);
  }
  if (screen === "unavailable") {
    return frame(<section className="mc-card mc-plain" aria-labelledby="mc-unavailable"><h2 id="mc-unavailable">{c.unavailableTitle}</h2><p>{c.unavailable}</p></section>);
  }
  if (screen === "error" || !view) {
    return frame(
      <div className="mc-problem">
        <p className="ct-alert" role="alert"><Icon name="warn" />{c.offline}</p>
        <button type="button" className="btn ct-btn" onClick={() => { setScreen("loading"); void load(); }}><Icon name="retry" />{c.retry}</button>
      </div>,
    );
  }

  const settings = view.settings;
  const mode = modeOf(settings);
  const owner = canOptIn(role);
  const live = view.grants.filter((g) => g.live);
  const showConnections = settings.enabled || view.grants.length > 0;
  const showLog = settings.enabled || (rows?.length ?? 0) > 0;
  const address = usableAddress(view.address);
  const who = settings.pausedBy || c.someone;

  // After a change of state the status sentence takes the focus, so a screen reader hears what is now true.
  const settle = () => setTimeout(() => lead.current?.focus({ preventScroll: true }), 60);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      await load();
      settle();
    } catch (error) {
      push(sayError(error, c), { tone: "bad" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const stateWord = mode === "on" ? c.stateOn : mode === "paused" ? c.statePaused : c.stateOff;
  const text = mode === "off" ? (owner ? c.offOwner : c.offOther) : mode === "on" ? c.on : c.paused(who, when(settings.pausedAt, lang));

  return frame(
    <>
      <section className={`mc-card mc-status ${mode}`} aria-labelledby="mc-status-h">
        <div className="mc-status-head">
          <h2 id="mc-status-h">{c.statusTitle}</h2>
          <span className={`sh-pill ${mode === "on" ? "active" : mode === "paused" ? "wait" : "idle"}`}>{stateWord}</span>
        </div>
        <p className="mc-lead" ref={lead} tabIndex={-1}>{text}</p>
        {mode === "off" && settings.paused && <p className="mc-note">{c.pausedWhileOff(who, when(settings.pausedAt, lang))}</p>}
        {settings.enabled && capIsRecent(settings.capHitAt) && <p className="mc-note mc-warn">{c.capHit(when(settings.capHitAt, lang))}</p>}
        {settings.enabled && view.changesPerDay !== null && view.sendsPerDay !== null && <p className="mc-note">{c.caps(view.changesPerDay, view.sendsPerDay)}</p>}
        <div className="mc-actions">
          {mode === "off" && owner && (
            <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => setSheet({ is: "on" })}>{c.turnOn}</button>
          )}
          {mode === "paused" && (
            <button type="button" className="btn volt ct-btn" disabled={busy}
              onClick={() => act(async () => { await mcp.resume(); push(c.resumedToast); })}>{c.resume}</button>
          )}
          {mode === "on" && (
            <>
              <button type="button" className="btn ct-btn danger-line" disabled={busy}
                onClick={() => act(async () => { await mcp.pause(); push(c.pausedToast); })}>{c.pause}</button>
              <span className="mc-hint">{c.pauseHint}</span>
            </>
          )}
        </div>
      </section>

      <section className="mc-card" aria-labelledby="mc-shared-h">
        <h2 id="mc-shared-h">{c.sharedTitle}</h2>
        <ul className="mc-points">{c.shared.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>

      {showConnections && (
        <McpConnections lang={lang} grants={view.grants} address={settings.enabled ? address : ""} busy={busy}
          onEnd={(g) => setSheet({ is: "end", id: g.id, app: g.client || c.anApp })}
          onEndAll={() => setSheet({ is: "all", n: live.length })} />
      )}

      {showLog && <McpLog lang={lang} rows={rows} failed={rowsFailed} grants={view.grants} onRefresh={() => void load()} />}

      {sheet?.is === "on" && (
        <TurnOnSheet lang={lang} onClose={() => setSheet(null)}
          onConfirm={async () => {
            await mcp.turnOn();
            setSheet(null);
            push(c.turnedOnToast);
            await load();
            settle();
          }} />
      )}
      {sheet?.is === "end" && (
        <Ask lang={lang} title={c.endTitle(sheet.app)} body={c.endBody} action={c.endAction}
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            try {
              await mcp.endOne(sheet.id);
              push(c.endedToast(sheet.app));
            } catch (error) {
              // Already ended (a second tab, the app itself): say so and show the truth.
              if (screenFor(error) !== "unavailable") throw error;
              push(c.alreadyEnded);
            }
            setSheet(null);
            await load();
          }} />
      )}
      {sheet?.is === "all" && (
        <Ask lang={lang} title={c.endAllTitle} body={c.endAllBody(sheet.n)} action={c.endAllAction}
          onClose={() => setSheet(null)}
          onConfirm={async () => {
            const n = await mcp.endAll();
            setSheet(null);
            push(c.endedAllToast(n));
            await load();
          }} />
      )}
      <ToastLayer toasts={toasts} dismiss={dismiss} lang={lang} undoWord={c.undo} dismissWord={c.dismiss} />
    </>,
  );
}

// ── the owner's confirmation ────────────────────────────────────────────────────────────────

/** Turning it on is a choice with a cost, so it is a box the owner ticks, beside the words they agree to. */
function TurnOnSheet({ lang, onClose, onConfirm }: { lang: Lang; onClose: () => void; onConfirm: () => Promise<void> }) {
  const c = T[lang];
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Sheet title={c.turnOnTitle} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className="btn ct-btn primary" disabled={!ticked || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try { await onConfirm(); } catch (e) { setError(sayError(e, c)); setBusy(false); }
            }}>{c.turnOn}</button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <p className="mc-sheet-text">{c.turnOnIntro}</p>
      <ul className="mc-points">{c.shared.map((line) => <li key={line}>{line}</li>)}</ul>
      <label className="ct-check mc-tick">
        <input type="checkbox" data-autofocus checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
        <span>{c.confirm}</span>
      </label>
      {!ticked && <p className="mc-hint">{c.tickHint}</p>}
      {error && <p className="ct-error" role="alert">{error}</p>}
    </Sheet>
  );
}

/** A question with two answers; the dangerous one is outlined, never Volt. */
function Ask({ lang, title, body, action, onClose, onConfirm }: {
  lang: Lang; title: string; body: string; action: string; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  const c = T[lang];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Sheet title={title} onClose={onClose} closeLabel={c.close}
      footer={
        <>
          <button type="button" className="btn ct-btn danger-line" disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try { await onConfirm(); } catch (e) { setError(sayError(e, c)); setBusy(false); }
            }}>{action}</button>
          <button type="button" className="btn ct-btn" onClick={onClose}>{c.cancel}</button>
        </>
      }>
      <p className="mc-sheet-text">{body}</p>
      {error && <p className="ct-error" role="alert">{error}</p>}
    </Sheet>
  );
}
