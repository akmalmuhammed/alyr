"use client";

import React from "react";
import { Banner, Button, DashedSlot, Empty, SkeletonRows } from "../../../_ui";
import { copy, type Lang } from "./copy";

export function OrdersSkeleton({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="ord-view" aria-busy="true" aria-label={t.loadingOrders}>
      <div className="ord-header">
        <div className="ord-header-start">
          <h1 className="ord-title">{t.title}</h1>
          <span className="ord-subtitle">{t.loadingOrders}</span>
        </div>
      </div>
      <SkeletonRows rows={6} columns={6} label={t.loadingOrders} />
    </div>
  );
}

export function OrdersEmptyFirstRun({
  lang,
  onCopyLink,
}: {
  slug?: string;
  lang: Lang;
  onCopyLink: () => void;
}) {
  const t = copy(lang);
  return (
    <DashedSlot
      title={t.emptyFirstRunTitle}
      action={
        <Button kind="line" onClick={onCopyLink}>
          {t.copyOrderLink}
        </Button>
      }
    >
      {t.emptyFirstRunSub}
    </DashedSlot>
  );
}

export function OrdersFilteredEmpty({
  query,
  activeFiltersDesc,
  lang,
  onClear,
}: {
  query?: string;
  activeFiltersDesc?: string;
  lang: Lang;
  onClear: () => void;
}) {
  const t = copy(lang);
  const sentence = query
    ? (lang === "ar" ? `لا توجد طلبات تطابق "${query}"` : `No orders match "${query}"`)
    : activeFiltersDesc || t.showAllOpenOrders;

  return (
    <Empty
      title={t.emptyFilteredTitle}
      action={
        <Button kind="line" onClick={onClear}>
          {t.clearFilters}
        </Button>
      }
    >
      {sentence}
    </Empty>
  );
}

export function OrdersErrorBanner({
  lastUpdated,
  lang,
  onRetry,
}: {
  lastUpdated?: string;
  lang: Lang;
  onRetry: () => void;
}) {
  const t = copy(lang);
  return (
    <Banner
      tone="bad"
      action={
        <Button kind="line" size="sm" onClick={onRetry}>
          {t.tryAgain}
        </Button>
      }
    >
      {lastUpdated ? t.errorSub(lastUpdated) : t.errorTitle}
    </Banner>
  );
}

export function OrdersOfflineBanner({
  lastUpdated,
  lang,
}: {
  lastUpdated: string;
  lang: Lang;
}) {
  const t = copy(lang);
  return <Banner tone="warn">{t.offlineBanner(lastUpdated)}</Banner>;
}
