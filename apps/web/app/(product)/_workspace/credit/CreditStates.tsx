"use client";

import { Banner, Button, DashedSlot, PageTitle, Skeleton, SkeletonRows } from "../../../_ui";
import { copy, type Lang } from "./copy";

/** While the summary loads: the page's own title and the shapes of what will come, no spinner. */
export function CreditLoading({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="crd-page" aria-busy="true">
      <PageTitle title={t.title} sub={t.loading} />
      <div className="crd-skel-band" role="status" aria-label={t.loading}>
        <Skeleton height="var(--ui-space-32)" width="30%" />
        <Skeleton height="var(--ui-space-14)" width="100%" />
        <Skeleton height="var(--ui-space-14)" width="70%" />
      </div>
      <SkeletonRows rows={7} columns={7} label={t.loading} />
    </div>
  );
}

/** A shop with no credit customers yet: a dashed slot for what will appear, and what makes it appear. */
export function CreditFirstRun({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="crd-page">
      <PageTitle title={t.title} sub={t.firstRunSub} />
      <DashedSlot level={2} title={t.firstRunTitle} action={<Button kind="line" href="/app/orders">{t.openOrders}</Button>}>
        {t.firstRunHelp}
      </DashedSlot>
    </div>
  );
}

/** The summary did not load: a banner that names it and offers the retry. */
export function CreditError({ lang, onRetry }: { lang: Lang; onRetry: () => void }) {
  const t = copy(lang);
  return (
    <div className="crd-page">
      <PageTitle title={t.title} />
      <Banner tone="bad" action={<Button kind="line" size="sm" onClick={onRetry}>{t.retry}</Button>}>{t.loadFailed}</Banner>
    </div>
  );
}

/** An agent has no credit screen: the balances are an owner's and an admin's. */
export function CreditNoPermission({ lang }: { lang: Lang }) {
  const t = copy(lang);
  return (
    <div className="crd-page">
      <PageTitle title={t.title} />
      <div className="crd-noaccess" role="status">
        <h2 className="crd-noaccess-title">{t.noPermissionTitle}</h2>
        <p className="crd-quiet">{t.noPermissionHelp}</p>
      </div>
    </div>
  );
}
