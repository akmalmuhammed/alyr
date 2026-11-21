"use client";

import React from "react";
import { Banner, Button, DashedSlot, Empty, Panel, PanelBody, SkeletonText } from "../../../_ui";
import { copy, type Lang } from "./copy";
import { type OrderFilters, effectiveFilters, filterWords } from "./logic";
import type { TeamMember } from "./types";

/** A shop with no orders at all: a dashed slot, and the one thing a person can do about it. No Volt here. */
export function OrdersFirstRun({ lang, onCopyLink }: { lang: Lang; onCopyLink: () => void }) {
  const t = copy(lang);
  return (
    <DashedSlot title={t.emptyTitle} action={<Button kind="line" onClick={onCopyLink}>{t.copyOrderLink}</Button>}>
      {t.emptyBody}
    </DashedSlot>
  );
}

/** Filters that match nothing: what was asked, in words, and the way back. */
export function OrdersFilteredEmpty({ filters, open, team, lang, onClear }: {
  filters: OrderFilters;
  open: number;
  team: TeamMember[];
  lang: Lang;
  onClear: () => void;
}) {
  const t = copy(lang);
  const q = effectiveFilters(filters).q?.trim();
  return (
    <Empty title={t.filteredTitle} action={<Button kind="line" onClick={onClear}>{t.clearFilters}</Button>}>
      {q ? t.filteredSearch(q) : t.filteredBody(open, filterWords(filters, team))}
    </Empty>
  );
}

/** The last answer that worked stays on screen; this says since when, and offers the retry. */
export function OrdersErrorBanner({ lastUpdated, lang, onRetry }: { lastUpdated: string | null; lang: Lang; onRetry: () => void }) {
  const t = copy(lang);
  return (
    <Banner tone="bad" action={<Button kind="quiet" size="sm" onClick={onRetry}>{t.tryAgain}</Button>}>
      {lastUpdated ? t.errorLoaded(lastUpdated) : t.errorNever}
    </Banner>
  );
}

export function OrdersOfflineBanner({ lastUpdated, lang }: { lastUpdated: string; lang: Lang }) {
  return <Banner tone="warn">{copy(lang).offlineBanner(lastUpdated)}</Banner>;
}

/** The detail page while its order loads, and when it cannot be found. */
export function OrderDetailSkeleton({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="ord-detail" aria-busy="true" aria-label={t.loadingOrders}>
      <Panel>
        <PanelBody>
          <SkeletonText lines={4} />
        </PanelBody>
      </Panel>
    </div>
  );
}

export function OrderMissing({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const t = copy(lang);
  return (
    <Empty title={t.detailMissing} action={<Button kind="line" onClick={onBack}>{t.backToOrders}</Button>}>
      {t.detailMissingBody}
    </Empty>
  );
}
