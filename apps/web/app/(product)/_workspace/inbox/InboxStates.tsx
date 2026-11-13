"use client";

import React from "react";
import { Banner, Button, DashedSlot, Empty, SkeletonRows } from "../../../_ui";
import { copy, type Lang } from "./copy";

export function InboxSkeleton({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="ibx-workbench" aria-busy="true" aria-label={t.loadingTitle}>
      <div style={{ padding: "var(--space-4)", width: "100%" }}>
        <div style={{ marginBottom: "var(--space-4)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--font-size-md)", fontWeight: 600 }}>{t.title}</h1>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{t.loadingTitle}</span>
        </div>
        <SkeletonRows rows={8} columns={4} label={t.loadingTitle} />
      </div>
    </div>
  );
}

export function InboxEmptyFirstRun({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div style={{ padding: "var(--space-8)", maxWidth: "40rem", margin: "0 auto" }}>
      <DashedSlot title={t.emptyFirstRunTitle}>
        {t.emptyFirstRunSub}
      </DashedSlot>
    </div>
  );
}

export function InboxFilteredEmpty({
  lang,
  onClear,
}: {
  lang: Lang;
  onClear: () => void;
}) {
  const t = copy(lang);
  return (
    <Empty
      title={t.emptyFilteredTitle}
      action={
        <Button kind="line" size="sm" onClick={onClear}>
          {t.btnClearFilters}
        </Button>
      }
    />
  );
}

export function InboxOfflineBanner({ lang, time }: { lang: Lang; time: string }) {
  const t = copy(lang);
  return (
    <Banner tone="warn">
      {t.offlineBanner(time)}
    </Banner>
  );
}
