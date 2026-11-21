"use client";

// Discovery's To do (ALY-322, spec 065 "Screens"; ALY-324, spec 066): every finding in three tabs
// (Open, Skipped, Done), grouped by who does it, with a filter for the place and, where a change is
// waiting for approval, a "Change ready" tag on the row and a chip that narrows the list to them. A
// row opens a side sheet with the change (if any), the evidence, the steps that found it and what a
// person can do with it. A link from a review (`?view=todo&finding=<id>`) opens that finding at once.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "./CatalogUi";
import { FindingFlow, type Change } from "./DiscoverySheet";
import { discovery, type Finding, type FindingsAnswer } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { groupByKind, placeName, sayError, viewHref, withChange } from "./discoveryLogic";
import { FindingRow, Loading, Problem, TabBar, announceChange, useLoad } from "./discoveryUi";

type Tab = "open" | "skipped" | "done";
const TABS: readonly Tab[] = ["open", "skipped", "done"];
type Push = (text: string, options?: { tone?: "ok" | "bad" | "warn"; undo?: () => void }) => number;

export function DiscoveryTodo({ lang, canManage, push }: { lang: Lang; canManage: boolean; push: Push }) {
  const t = T[lang];
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("open");
  const [place, setPlace] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(() => params.get("finding"));
  const [places] = useLoad(() => discovery.places().catch(() => []), "places");

  // "Done" is three statuses on the server (marked by the owner, confirmed by a later check-up,
  // no longer found), which `status=done` answers together.
  const [list, reload] = useLoad<FindingsAnswer>(
    () => discovery.findings(lang, { status: tab, location_id: place || undefined }), `${lang}|${tab}|${place}`,
  );

  const closeSheet = useCallback(() => {
    setOpenId(null);
    if (params.get("finding")) window.history.replaceState(null, "", viewHref("todo"));
  }, [params]);

  const changed = (change: Change) => {
    const status = change.finding.status;
    closeSheet();
    if (status === "owner_done" || status === "skipped") {
      push(status === "owner_done" ? t.toastDone : t.toastSkipped, {
        undo: () => void discovery.setStatus(lang, change.finding.id, "open").then(() => reload(true), (e) => push(sayError(e, lang), { tone: "bad" })),
      });
    } else {
      push(t.toastBack);
    }
    void reload(true);
  };

  const data = list.data;
  const everyItem = data?.items ?? [];
  const readyCount = withChange(everyItem).length;
  const items = onlyReady ? withChange(everyItem) : everyItem;
  const groups = groupByKind(items);
  const total = data ? data.counts.open + data.counts.skipped + data.counts.owner_done + data.counts.verified : 0;
  const everyPlace = places.data ?? [];

  return (
    <div className="dv-todo">
      <div className="dv-toolbar">
        <TabBar keys={TABS} words={t.tabs} value={tab} onChange={setTab} label={t.tabsLabel} />
        {(readyCount > 0 || onlyReady) && (
          <div className="ct-chips dv-readychip" role="group" aria-label={t.changeReady}>
            <button type="button" className="ct-chip" aria-pressed={onlyReady} onClick={() => setOnlyReady(!onlyReady)}>
              {onlyReady && <Icon name="check" className="sh-ico ct-chip-tick" />}{t.changeReady}
            </button>
          </div>
        )}
        {everyPlace.length > 1 && (
          <label className="ct-field dv-place">
            <span className="ct-label">{t.placeLabel}</span>
            <select className="ct-select" value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">{t.allPlaces}</option>
              {everyPlace.map((p) => <option key={p.id} value={p.id}>{placeName(p, lang)}</option>)}
            </select>
          </label>
        )}
      </div>

      <div role="tabpanel" id={`dv-panel-${tab}`} aria-labelledby={`dv-tab-${tab}`} className="dv-panel">
        {list.error && !data && <Problem lang={lang} error={list.error} onRetry={() => void reload()} />}
        {!data && !list.error && <Loading lang={lang} />}

        {data && (
          <>
            <p className="dv-count" role="status">{t.listCount(tab, items.length)}</p>

            {items.length === 0 && total === 0 && !place && (
              <section className="sh-tile raised ct-empty dv-empty">
                <span className="sh-glyph"><Icon name="list" /></span>
                <p>{t.todoNoRun}</p>
                <Link className="btn ct-btn" href={viewHref("home")}>{t.toHome}</Link>
              </section>
            )}
            {items.length === 0 && (total > 0 || place !== "" || onlyReady) && <p className="dv-empty-line">{t.todoEmpty[tab]}</p>}

            {groups.map((g) => (
              <section key={g.kind} className="dv-block" aria-labelledby={`dv-g-${g.kind}`}>
                <h2 id={`dv-g-${g.kind}`}>{t.groups[g.kind]}</h2>
                <ul className="dv-list">
                  {g.items.map((f: Finding) => <FindingRow key={f.id} f={f} lang={lang} status={tab === "done"} onOpen={setOpenId} />)}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      {openId && (
        <FindingFlow lang={lang} id={openId} initial={everyItem.find((f) => f.id === openId) ?? null} canMark={canManage}
          onClose={closeSheet} onChanged={changed} onProposalChanged={() => { announceChange(); void reload(true); }} />
      )}
    </div>
  );
}
