"use client";

// Discovery's To do (ALY-322, spec 065 "Screens"): every finding in three tabs (Open, Skipped,
// Done), grouped by who does it, with a filter for the place. A row opens a side sheet with the
// evidence, the steps that found it and the two things an owner can do with it. A link from a
// review (`?view=todo&finding=<id>`) opens that finding at once.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "./CatalogUi";
import { FindingSheet, type Change } from "./DiscoverySheet";
import { discovery, type Finding, type FindingsAnswer } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { groupByKind, placeName, sayError, viewHref } from "./discoveryLogic";
import { FindingRow, Loading, Problem, useLoad } from "./discoveryUi";

type Tab = "open" | "skipped" | "done";
const TABS: readonly Tab[] = ["open", "skipped", "done"];
type Push = (text: string, options?: { tone?: "ok" | "bad" | "warn"; undo?: () => void }) => number;

export function DiscoveryTodo({ lang, canManage, push }: { lang: Lang; canManage: boolean; push: Push }) {
  const t = T[lang];
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("open");
  const [place, setPlace] = useState("");
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
  const items = data?.items ?? [];
  const groups = groupByKind(items);
  const total = data ? data.counts.open + data.counts.skipped + data.counts.owner_done + data.counts.verified : 0;
  const everyPlace = places.data ?? [];

  return (
    <div className="dv-todo">
      <div className="dv-toolbar">
        <div className="ct-tabs" role="tablist" aria-label={t.tabsLabel}>
          {TABS.map((key) => (
            <button key={key} type="button" role="tab" id={`dv-tab-${key}`} aria-selected={tab === key} aria-controls={`dv-panel-${key}`}
              tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                // The arrows follow the reading direction: the tab bar is mirrored with the page.
                const dir = (e.currentTarget.closest("[dir]") as HTMLElement | null)?.dir === "rtl" ? -step : step;
                const next = TABS[(TABS.indexOf(key) + dir + TABS.length) % TABS.length];
                setTab(next);
                requestAnimationFrame(() => document.getElementById(`dv-tab-${next}`)?.focus());
              }}>
              {t.tabs[key]}
            </button>
          ))}
        </div>
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
            {items.length === 0 && (total > 0 || place !== "") && <p className="dv-empty-line">{t.todoEmpty[tab]}</p>}

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
        <FindingSheet lang={lang} id={openId} initial={items.find((f) => f.id === openId) ?? null} canMark={canManage}
          onClose={closeSheet} onChanged={changed} />
      )}
    </div>
  );
}
