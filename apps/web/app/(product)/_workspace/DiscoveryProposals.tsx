"use client";

// Discovery's Proposals (ALY-324, spec 066 "The Proposals area"): every change ALYR has prepared, in
// three tabs: Waiting (waiting for a tap, or approved and being applied), Done (applied, undone) and
// Closed (declined, expired, not applied). A filter for the place (a branch manager's places are
// the only ones that exist for them). Each change is one card on a phone: what changes, where, now
// and proposed, its status in words and when. A card opens the approval sheet, and so does
// `?view=proposals&p=<id>`: the link WhatsApp sends. The line at the top is the guarantee.

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ApprovalSheet } from "./DiscoveryApproval";
import { discovery, type ProposalsAnswer } from "./discoveryApi";
import { T, type Lang } from "./discoveryCopy";
import { PROPOSAL_TABS, placeName, tabCount, viewHref, type ProposalTab } from "./discoveryLogic";
import { Loading, Problem, ProposalRow, TabBar, announceChange, useLoad } from "./discoveryUi";

export function DiscoveryProposals({ lang, canManage }: { lang: Lang; canManage: boolean }) {
  const t = T[lang];
  const params = useSearchParams();
  const [tab, setTab] = useState<ProposalTab>("live");
  const [place, setPlace] = useState("");
  const [openId, setOpenId] = useState<string | null>(() => params.get("p"));
  const [places] = useLoad(() => discovery.places().catch(() => []), "places");
  const [list, reload] = useLoad<ProposalsAnswer>(
    () => discovery.proposals(lang, { status: tab, location_id: place || undefined }), `${lang}|${tab}|${place}`,
  );

  const closeSheet = useCallback(() => {
    setOpenId(null);
    if (params.get("p")) window.history.replaceState(null, "", viewHref("proposals"));
  }, [params]);

  const data = list.data;
  const items = data?.items ?? [];
  const everyPlace = places.data ?? [];

  return (
    <div className="dv-todo dv-proposals">
      <p className="dv-guarantee dv-guarantee-top">{t.guarantee}</p>
      {!canManage && <p className="ct-quiet dv-owner-note">{t.approversNote}</p>}

      <div className="dv-toolbar">
        <TabBar keys={PROPOSAL_TABS} words={t.proposalTabs} value={tab} onChange={setTab} label={t.proposalTabsLabel} idPrefix="dvp" />
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

      <div role="tabpanel" id={`dvp-panel-${tab}`} aria-labelledby={`dvp-tab-${tab}`} className="dv-panel">
        {list.error && !data && <Problem lang={lang} error={list.error} onRetry={() => void reload()} />}
        {!data && !list.error && <Loading lang={lang} />}

        {data && (
          <>
            <p className="dv-count" role="status">{t.proposalCount(tab, tabCount(data.counts, tab))}</p>
            {items.length === 0 ? (
              <p className="dv-slot dv-slot-wide"><span className="dv-pending" aria-hidden="true" />{t.proposalsEmpty[tab]}</p>
            ) : (
              <ul className="dv-list">{items.map((p) => <ProposalRow key={p.id} p={p} lang={lang} onOpen={setOpenId} />)}</ul>
            )}
          </>
        )}
      </div>

      {openId && (
        <ApprovalSheet lang={lang} id={openId} initial={items.find((p) => p.id === openId) ?? null} onClose={closeSheet}
          onChanged={() => { announceChange(); void reload(true); }} />
      )}
    </div>
  );
}
