"use client";

// The preview of Checks, Answers, Proof and Set up (workstream U2): fixtures shaped like the API,
// through the same builders the workspace uses, with actions that answer like the API would and no
// server. Tabs switch through the address, like the workspace.

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Run } from "@/app/(product)/_workspace/discoveryApi";
import { AgentBar } from "@/app/(product)/_workspace/discovery-v2/AgentBar";
import { Answers } from "@/app/(product)/_workspace/discovery-v2/Answers";
import { Checks } from "@/app/(product)/_workspace/discovery-v2/Checks";
import type { D2Lang } from "@/app/(product)/_workspace/discovery-v2/copy";
import { T2 } from "@/app/(product)/_workspace/discovery-v2/copy2";
import { BLOCK, answersFixture, checksFixture, findingsFixture, packsFixture, proofFixture, setupFixture } from "@/app/(product)/_workspace/discovery-v2/fixtures2";
import { ErrorScreen, LoadingScreen, Tabs, type TabKey } from "@/app/(product)/_workspace/discovery-v2/frame";
import { Proof } from "@/app/(product)/_workspace/discovery-v2/Proof";
import { Setup, type Choice, type SetupStage } from "@/app/(product)/_workspace/discovery-v2/Setup";
import { approversOf } from "@/app/(product)/_workspace/discovery-v2/adapter";
import { buildAnswers, buildChecks, buildProof, knownFacts } from "@/app/(product)/_workspace/discovery-v2/screens";

export type ScreenTab = Exclude<TabKey, "week"> | "setup";

const href = (lang: D2Lang) => (tab: TabKey | "setup") => `/ui-preview/discovery?${new URLSearchParams({ ...(tab === "week" ? {} : { tab }), ...(lang === "ar" ? { lang } : {}) })}`;

export function PreviewTabs({ lang, current }: { lang: D2Lang; current: TabKey | null }) {
  const router = useRouter();
  const to = href(lang);
  return <Tabs lang={lang} current={current} waiting={3} hrefOf={to} onGo={(tab) => router.push(to(tab))} />;
}

export function ScreensPreview({ lang, tab, state }: { lang: D2Lang; tab: ScreenTab; state: string }) {
  const t2 = T2[lang];
  const router = useRouter();
  const tabs = <PreviewTabs lang={lang} current={tab === "setup" ? null : tab} />;
  const foot = (toast: ReactNode = null) => (
    <AgentBar lang={lang} asks={3} latest="" nextCheckAt={null} onSearch={() => {}} onAsks={() => router.push(href(lang)("week"))} toast={toast} />
  );
  const [choice, setChoice] = useState<Choice>(state === "new" ? { family: null, trade: null } : { family: "appointments", trade: "car_care" });
  const [stage, setStage] = useState<SetupStage>(state === "running" ? "running" : "idle");

  if (state === "loading") return <LoadingScreen lang={lang} tabs={tabs} />;
  if (state === "error") return <ErrorScreen lang={lang} tabs={tabs} message="" onRetry={() => window.location.reload()} />;

  if (tab === "checks") {
    const packs = packsFixture(lang);
    const empty = state === "empty";
    const view = buildChecks({
      checks: empty ? { run_id: null, finished_at: null, measured: false, rules: [], places: [], business: null } : checksFixture(lang),
      findings: findingsFixture(lang), packs, block: BLOCK, waiting: [], titles: { core: t2.groupCore, own: t2.groupOwn },
    });
    const run: Run | null = state === "checking" ? {
      id: "run-2", status: "running", trigger: "manual", score: null, score_parts: null, started_at: null, finished_at: null, error: null,
      steps: [{ seq: 1, tool: "connector.snapshot", summary: "", ok: true, started_at: null, ended_at: null }, { seq: 2, tool: "rules.evaluate", summary: "", ok: true, started_at: null, ended_at: null }],
    } : null;
    return (
      <Checks lang={lang} view={view} tabs={tabs} foot={foot()} run={run} busy={false} error="" nextCheckAt={null}
        hrefs={{ week: href(lang)("week"), setup: href(lang)("setup"), connections: "#connections", task: () => "#task" }}
        onCheckAgain={() => router.push(`${href(lang)("checks")}&state=checking`)}
        initialFilter={state === "differ" ? "differ" : "all"} openFirstCard={state === "hovercard"} />
    );
  }
  if (tab === "proof") {
    const f = proofFixture(lang);
    const view = buildProof(state === "empty" ? [] : f.proposals, state === "empty" ? [] : f.done);
    return <Proof lang={lang} view={view} tabs={tabs} foot={foot()} people={approversOf(f.team)} sourceKind="google" onUndo={() => {}} busyId={null} />;
  }
  if (tab === "answers") {
    const api = answersFixture(lang, state === "off" ? "off" : "default");
    return <Answers lang={lang} view={buildAnswers(api)} api={api} tabs={tabs} foot={foot()} />;
  }
  const s = setupFixture(lang);
  return (
    <Setup lang={lang} packs={packsFixture(lang)} choice={choice} onChoose={setChoice} canManage={state !== "readonly"} tabs={state === "new" ? null : tabs}
      known={knownFacts({ place: s.place, facts: s.facts, sourceKind: "google", lang })} stage={stage} error=""
      onCheckNow={() => { setStage("running"); setTimeout(() => setStage("done"), 1200); }} />
  );
}
