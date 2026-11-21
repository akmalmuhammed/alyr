"use client";

import { Panel, PanelHeader, Skeleton, SkeletonRows, SkeletonText } from "@/app/_ui";
import type { SettingsCopy } from "./copy";

/** The page while `GET /api/account` answers: skeletons at the loaded heights, so nothing shifts. */
export function SettingsLoading({ t }: { t: SettingsCopy }) {
  return (
    <div className="set-cols" aria-busy="true" role="status" aria-label={t.loadingLabel}>
      <div className="set-col">
        <Panel>
          <PanelHeader title={<Skeleton width="4rem" />} />
          <div className="set-skel"><SkeletonText lines={3} /></div>
        </Panel>
        <Panel>
          <PanelHeader title={<Skeleton width="6rem" />} />
          <div className="set-skel"><SkeletonText lines={2} /></div>
        </Panel>
        <Panel clip>
          <PanelHeader title={<Skeleton width="7rem" />} />
          <SkeletonRows rows={2} columns={3} label={t.loadingLabel} />
        </Panel>
      </div>
      <div className="set-col">
        <Panel clip>
          <PanelHeader title={<Skeleton width="5rem" />} />
          <SkeletonRows rows={2} columns={2} label={t.loadingLabel} />
        </Panel>
        <Panel>
          <PanelHeader title={<Skeleton width="6rem" />} />
          <div className="set-skel"><SkeletonText lines={2} /></div>
        </Panel>
      </div>
    </div>
  );
}
