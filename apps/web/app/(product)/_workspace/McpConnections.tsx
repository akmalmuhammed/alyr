"use client";

// The connections of the connected-apps screen (ALY-292): each app a person signed in, with who,
// since when, what it was allowed and when it last asked; End for one, End all for every one; the
// address an owner adds in their own app; and the ended ones, kept for reading. App and person names
// are written outside ALYR, so they are drawn as text and wrapped so a name in another script cannot
// reorder the line around it.

import { useState } from "react";
import { Fold, Icon } from "./CatalogUi";
import { copyText } from "./connectApi";
import type { Grant } from "./mcpApi";
import { T, type Lang } from "./mcpCopy";
import { day, endedLine, when } from "./mcpLogic";

export function McpConnections({ lang, grants, address, busy, onEnd, onEndAll }: {
  lang: Lang; grants: Grant[]; address: string; busy: boolean; onEnd: (g: Grant) => void; onEndAll: () => void;
}) {
  const c = T[lang];
  const live = grants.filter((g) => g.live);
  const ended = grants.filter((g) => !g.live);
  const [copied, setCopied] = useState(false);

  return (
    <section className="mc-card" aria-labelledby="mc-conn-h">
      <div className="mc-section-head">
        <h2 id="mc-conn-h">{c.connTitle}</h2>
        {live.length > 0 && <span className="mc-count">{c.connCount(live.length)}</span>}
      </div>
      <p className="mc-intro">{c.connIntro}</p>

      {live.length === 0 ? (
        <div className="mc-slot">
          <b>{c.connEmptyTitle}</b>
          <span>{c.connEmpty}</span>
        </div>
      ) : (
        <ul className="mc-rows">
          {live.map((g) => {
            const app = g.client || c.anApp;
            return (
              <li key={g.id} className="mc-row">
                <div className="mc-row-main">
                  <p className="mc-app"><bdi dir="auto">{app}</bdi> <span className="sh-pill active">{c.connectedPill}</span></p>
                  <p className="mc-meta">
                    {c.connectedBy(g.person || c.someone)}
                    {g.createdAt && <> · {c.since(day(g.createdAt, lang))}</>}
                    {g.expiresAt && <> · {c.endsOn(day(g.expiresAt, lang))}</>}
                  </p>
                  {g.scopes.length > 0 && (
                    <ul className="mc-tags" aria-label={c.allowed}>
                      {g.scopes.map((s) => <li key={s} className="mc-tag" dir="auto">{c.scopeNames[s] ?? s}</li>)}
                    </ul>
                  )}
                  <p className="mc-meta">{g.lastUsedAt ? c.lastUsed(when(g.lastUsedAt, lang)) : c.neverUsed}</p>
                </div>
                <button type="button" className="btn ct-btn danger-line" disabled={busy} aria-label={c.endAria(app)} onClick={() => onEnd(g)}>{c.end}</button>
              </li>
            );
          })}
        </ul>
      )}

      {live.length > 1 && (
        <div className="mc-actions">
          <button type="button" className="btn ct-btn danger-line" disabled={busy} onClick={onEndAll}>{c.endAll}</button>
        </div>
      )}

      {address && (
        <div className="mc-address">
          <p className="mc-label" id="mc-address-l">{c.addressLabel}</p>
          <div className="mc-address-row">
            <code className="mc-code" dir="ltr" aria-labelledby="mc-address-l">{address}</code>
            <button type="button" className="btn ct-btn" onClick={async () => setCopied(await copyText(address))}>
              <Icon name={copied ? "check" : "copy"} />{copied ? c.copied : c.copy}
            </button>
          </div>
          <p className="mc-hint">{c.how}</p>
          <p className="ct-sr" role="status" aria-live="polite">{copied ? c.copied : ""}</p>
        </div>
      )}

      {ended.length > 0 && (
        <Fold title={c.endedTitle(ended.length)}>
          <ul className="mc-rows mc-ended">
            {ended.map((g) => (
              <li key={g.id} className="mc-row">
                <div className="mc-row-main">
                  <p className="mc-app"><bdi dir="auto">{g.client || c.anApp}</bdi></p>
                  <p className="mc-meta">{c.connectedBy(g.person || c.someone)}</p>
                  <p className="mc-meta">{endedLine(g, lang, c)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </section>
  );
}
