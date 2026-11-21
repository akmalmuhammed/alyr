"use client";

// What the apps did (ALY-292): the activity record with channel `mcp`, newest first, as the API
// returns it (`GET /api/mcp/activity`, the newest 100). Two lists, one at a time: the requests the
// apps made (the tool, what kind of request, how it ended, which app for which person, what it
// asked for) and the changes to the connection itself (turned on, paused, connected, ended). What an
// app asked for is JSON written by the app, shown as text in a fold; the answer ALYR gave is never on
// the record and never here. The list is read when the screen opens and when Refresh is pressed:
// nothing polls, so nothing moves while it is being read.

import { useState } from "react";
import { Icon } from "./CatalogUi";
import type { Grant, Row } from "./mcpApi";
import { T, type Lang } from "./mcpCopy";
import { argsText, callOf, eventText, eventWhy, splitRows, when } from "./mcpLogic";

// The API sends the newest hundred, and says nothing about whether there are more.
const PAGE = 100;

export function McpLog({ lang, rows, failed, grants, onRefresh }: {
  lang: Lang; rows: Row[] | null; failed: boolean; grants: Grant[]; onRefresh: () => void;
}) {
  const c = T[lang];
  const [tab, setTab] = useState<"calls" | "events">("calls");
  const { calls, events } = splitRows(rows ?? []);
  const shown = tab === "calls" ? calls : events;

  return (
    <section className="mc-card" aria-labelledby="mc-log-h">
      <div className="mc-section-head">
        <h2 id="mc-log-h">{c.logTitle}</h2>
        <button type="button" className="btn ct-btn" onClick={onRefresh}><Icon name="retry" />{c.refresh}</button>
      </div>
      <p className="mc-intro">{c.logIntro}</p>

      {rows === null ? (
        <p className="mc-quiet" role={failed ? "alert" : "status"}>{failed ? c.failed : c.loading}</p>
      ) : (
        <>
          <div className="mc-tabs" role="group" aria-label={c.logTitle}>
            <button type="button" aria-pressed={tab === "calls"} onClick={() => setTab("calls")}>{c.tabCalls(calls.length)}</button>
            <button type="button" aria-pressed={tab === "events"} onClick={() => setTab("events")}>{c.tabEvents(events.length)}</button>
          </div>
          {failed && <p className="ct-error" role="alert">{c.failed}</p>}
          {shown.length === 0 ? (
            <div className="mc-slot"><span>{tab === "calls" ? c.logEmpty : c.eventsEmpty}</span></div>
          ) : (
            <ul className="mc-rows mc-log">
              {tab === "calls" ? shown.map((r) => <Call key={r.id} row={r} lang={lang} />) : shown.map((r) => <Event key={r.id} row={r} lang={lang} grants={grants} />)}
            </ul>
          )}
          {rows.length >= PAGE && <p className="mc-hint">{c.logCap(PAGE)}</p>}
        </>
      )}
    </section>
  );
}

function Call({ row, lang }: { row: Row; lang: Lang }) {
  const c = T[lang];
  const call = callOf(row);
  const args = argsText(call.args);
  const result = call.result;
  const tone = result === "ok" ? "active" : result === "error" ? "idle" : "wait";
  return (
    <li className="mc-row mc-call">
      <div className="mc-row-main">
        <p className="mc-app">
          <code className="mc-tool" dir="ltr">{call.tool || "?"}</code>
          {call.phase && <span className="mc-phase">{c.phase[call.phase] ?? call.phase}</span>}
          {result && <span className={`sh-pill ${tone}`}>{c.result[result] ?? result}</span>}
        </p>
        <p className="mc-meta"><bdi dir="auto">{c.byApp(call.client || c.anApp, row.person || c.someone)}</bdi></p>
        <p className="mc-meta">
          {when(row.at, lang)}
          {call.ms !== null && <> · {c.millis(call.ms)}</>}
          {call.affects !== null && call.affects > 0 && <> · {c.records(call.affects)}</>}
        </p>
        {args && (
          <details className="mc-args">
            <summary>{c.askedFor}</summary>
            <pre dir="auto">{args}</pre>
          </details>
        )}
      </div>
    </li>
  );
}

function Event({ row, lang, grants }: { row: Row; lang: Lang; grants: Grant[] }) {
  const c = T[lang];
  const why = eventWhy(row, c);
  return (
    <li className="mc-row">
      <div className="mc-row-main">
        <p className="mc-app mc-event"><bdi dir="auto">{eventText(row, grants, c)}</bdi></p>
        {why && <p className="mc-meta">{why}</p>}
        <p className="mc-meta">{when(row.at, lang)}</p>
      </div>
    </li>
  );
}
