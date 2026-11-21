"use client";

import { Banner, Button, DashedSlot, PageTitle, Panel, Skeleton, SkeletonRows } from "@/app/_ui";
import { formatTime } from "@/app/_ui/format";
import { T } from "./copy";
import type { Lang } from "./copy";

/** The report while its numbers are being counted: the real title, tiles and rows' places, nothing that will shift. */
export function WeekSkeleton({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <div className="team-page" aria-busy="true">
      <PageTitle title={t.weekTitle} />
      <div className="team-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="u-stat">
            <Skeleton width={55} />
            <Skeleton width={40} height="var(--ui-space-28)" />
            <Skeleton width={80} />
          </div>
        ))}
      </div>
      <Panel clip>
        <SkeletonRows rows={9} columns={6} label={t.loadingNumbers} />
      </Panel>
    </div>
  );
}

/** A new business: nobody has replied, closed or sold anything yet. The one action that makes it true is inviting a person. */
export function TeamEmpty({ lang, canInvite, onInvite }: { lang: Lang; canInvite: boolean; onInvite: () => void }) {
  const t = T[lang];
  return (
    <DashedSlot title={t.emptyTitle} action={canInvite ? <Button kind="volt" onClick={onInvite}>{t.invite}</Button> : undefined}>
      {t.emptyText}
    </DashedSlot>
  );
}

/** No connection: what is on screen was loaded at a time, and changes cannot be saved until it is back. */
export function OfflineBanner({ lang, loadedAt, onRetry }: { lang: Lang; loadedAt: string; onRetry: () => void }) {
  const t = T[lang];
  return (
    <Banner tone="warn" action={<Button kind="quiet" size="sm" onClick={onRetry}>{t.tryAgain}</Button>}>
      {t.offline(formatTime(loadedAt, lang))}
    </Banner>
  );
}

/** A load or an action that failed, with the reason in the shop's words. */
export function FailureBanner({ lang, reason, onRetry, onDismiss }: { lang: Lang; reason: string; onRetry?: () => void; onDismiss?: () => void }) {
  const t = T[lang];
  return (
    <Banner
      tone="bad"
      action={onRetry ? <Button kind="quiet" size="sm" onClick={onRetry}>{t.tryAgain}</Button> : onDismiss ? <Button kind="quiet" size="sm" onClick={onDismiss}>{t.close}</Button> : undefined}
    >
      {reason}
    </Banner>
  );
}
