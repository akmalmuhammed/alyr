"use client";

// The preview route's scenes: the sample shop through an in-memory source, so nothing is sent anywhere.
// Each scene is one state of the drawings: the owner's day, an agent, a new shop, no connection, loading.

import { useMemo } from "react";
import type { Lang } from "./copy";
import { FIXTURE_AGENT, FIXTURE_MEMBERS, FIXTURE_OWNER, SAMPLE_NOW, SAMPLE_OFFLINE_FROM, SHOP_NAME, agentReport, emptyReport, fixtureReport } from "./fixtures";
import { fixtureSource } from "./fixtureSource";
import { TeamWorkbench } from "./TeamWorkbench";
import type { TeamInitial } from "./TeamWorkbench";

export type Scene = "default" | "agent" | "empty" | "offline" | "loading";

export type TeamPreviewProps = {
  lang: Lang;
  scene: Scene;
  view: "people" | "week";
  openId: string | null;
  dialog: "invite" | "remove" | null;
  removeId: string | null;
};

export function TeamPreview({ lang, scene, view, openId, dialog, removeId }: TeamPreviewProps) {
  const built = useMemo(() => {
    const me = scene === "agent" ? FIXTURE_AGENT : FIXTURE_OWNER;
    const { source } = fixtureSource({ me, empty: scene === "empty", hold: scene === "loading", offline: scene === "offline" });
    const initial: TeamInitial | undefined =
      scene === "loading"
        ? undefined
        : {
            me,
            members: scene === "empty" ? FIXTURE_MEMBERS.slice(0, 1) : FIXTURE_MEMBERS,
            reports: { 7: scene === "empty" ? emptyReport(7) : scene === "agent" ? agentReport(7, me) : fixtureReport(7) },
            signing: true,
            loadedAt: scene === "offline" ? SAMPLE_OFFLINE_FROM : SAMPLE_NOW,
          };
    return { source, initial };
  }, [scene]);

  return (
    <TeamWorkbench
      lang={lang}
      shop={SHOP_NAME}
      source={built.source}
      initial={built.initial}
      view={view}
      openId={openId}
      dialog={dialog}
      removeId={removeId}
      offline={scene === "offline"}
      inboxHref="#inbox"
    />
  );
}
