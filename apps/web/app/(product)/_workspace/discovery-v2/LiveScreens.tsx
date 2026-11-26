"use client";

// Checks, Proof, Answers and Set up on the shop's real Discovery API (workstream U2). Each reads
// what it draws, builds its view with the pure builders in screens.ts and passes the real
// endpoints as actions. Nothing here invents a value: what the API does not send is absent.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { discovery, type Fact, type Finding, type Place, type Proposal, type Run, type TeamMember } from "../discoveryApi";
import { sayError } from "../discoveryLogic";
import { approversOf } from "./adapter";
import { discovery2, type AnswersAnswer, type Pack } from "./api2";
import { T } from "./copy";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { Answers } from "./Answers";
import { Checks, type ChecksHrefs } from "./Checks";
import { ErrorScreen, LoadingScreen } from "./frame";
import { GoogleMapsLink } from "./GoogleMapsLink";
import { Proof } from "./Proof";
import { Setup, type Choice, type SetupStage } from "./Setup";
import { buildAnswers, buildChecks, buildProof, knownFacts, type ChecksView, type ChangeReceipt, type ProofView } from "./screens";
import { Toast, type ToastData } from "./Toast";
import { whereOf, beforeAfter } from "./logic";

/** The foot of a page: ALYR's bar, with a toast in its lane when there is one. */
export type Foot = (toast: ReactNode) => ReactNode;
type Load<V> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: V };

const POLL_MS = 2000;
const MAX_POLLS = 90;

/** Read a check-up until it is done or failed (at most three minutes). */
async function untilFinished(lang: D2Lang, run: Run, onStep: (run: Run) => void, stopped: () => boolean): Promise<Run> {
  let current = run;
  for (let i = 0; i < MAX_POLLS && (current.status === "queued" || current.status === "running"); i++) {
    await new Promise((done) => setTimeout(done, POLL_MS));
    if (stopped()) return current;
    try { current = await discovery.run(lang, run.id); onStep(current); } catch { /* the next read tries again */ }
  }
  return current;
}

function useToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((title: string, body: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), title, body, undo: false });
    timer.current = setTimeout(() => setToast(null), 8000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show, hide: () => setToast(null) };
}

// ── Checks ─────────────────────────────────────────────

export function LiveChecks({ lang, tabs, foot, hrefs }: { lang: D2Lang; tabs: ReactNode; foot: Foot; hrefs: ChecksHrefs }) {
  const t2 = T2[lang];
  const [load, setLoad] = useState<Load<ChecksView>>({ kind: "loading" });
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const { toast, show, hide } = useToast();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const read = useCallback(async (): Promise<ChecksView | null> => {
    try {
      const [plus, checks, findings, packs, waiting] = await Promise.all([
        discovery2.overview(lang),
        discovery.checks(lang).catch(() => null),
        discovery.findings(lang, { status: "open" }).catch(() => ({ items: [] })),
        discovery2.packs(lang).catch((): Pack[] => []),
        discovery.proposals(lang, { status: "proposed" }).catch(() => ({ items: [] as Proposal[] })),
      ]);
      const view = buildChecks({ checks, findings: findings.items, packs, block: plus.checks, waiting: waiting.items, titles: { core: t2.groupCore, own: t2.groupOwn } });
      if (alive.current) setLoad({ kind: "ready", value: view });
      return view;
    } catch (e) {
      if (alive.current) setLoad({ kind: "error", message: sayError(e, lang) });
      return null;
    }
  }, [lang, t2]);

  useEffect(() => {
    const start = setTimeout(() => { void read(); }, 0);
    return () => clearTimeout(start);
  }, [read]);

  const checkAgain = useCallback(async () => {
    setError("");
    try {
      const started = await discovery.startRun(lang);
      setRun(started);
      const done = await untilFinished(lang, started, (r) => { if (alive.current) setRun(r); }, () => !alive.current);
      if (!alive.current) return;
      setRun(null);
      const view = await read();
      if (done.status === "done" && view?.tally) show(t2.checkingDone, t2.checkingDoneBody(view.tally.matched, view.tally.measured));
      else if (done.status === "failed") setError(t2.checkingFailed);
    } catch (e) {
      setRun(null);
      setError(sayError(e, lang));
    }
  }, [lang, read, show, t2]);

  if (load.kind === "loading") return <LoadingScreen lang={lang} tabs={tabs} />;
  if (load.kind === "error") return <ErrorScreen lang={lang} tabs={tabs} message={load.message} onRetry={() => { setLoad({ kind: "loading" }); void read(); }} />;
  return (
    <Checks lang={lang} view={load.value} tabs={tabs} hrefs={hrefs} nextCheckAt={null} run={run} onCheckAgain={() => void checkAgain()} busy={!!run} error={error}
      foot={foot(toast ? <Toast toast={toast} lang={lang} onUndo={() => {}} onDismiss={hide} /> : null)} />
  );
}

// ── Proof ──────────────────────────────────────────────

type ProofData = { proposals: Proposal[]; done: Finding[]; team: TeamMember[] | null; sourceKind: string };

export function LiveProof({ lang, tabs, foot }: { lang: D2Lang; tabs: ReactNode; foot: Foot }) {
  const [load, setLoad] = useState<Load<ProofData>>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, show, hide } = useToast();

  const read = useCallback(async () => {
    try {
      const [plus, all, done, team] = await Promise.all([
        discovery2.overview(lang),
        discovery.proposals(lang, { status: "all" }),
        discovery.findings(lang, { status: "done" }).catch(() => ({ items: [] })),
        discovery.team().catch(() => null),
      ]);
      setLoad({ kind: "ready", value: { proposals: all.items, done: done.items, team, sourceKind: plus.overview.source?.kind ?? "" } });
    } catch (e) {
      setLoad({ kind: "error", message: sayError(e, lang) });
    }
  }, [lang]);

  useEffect(() => {
    const start = setTimeout(() => { void read(); }, 0);
    return () => clearTimeout(start);
  }, [read]);

  if (load.kind === "loading") return <LoadingScreen lang={lang} tabs={tabs} />;
  if (load.kind === "error") return <ErrorScreen lang={lang} tabs={tabs} message={load.message} onRetry={() => { setLoad({ kind: "loading" }); void read(); }} />;
  const data = load.value;
  const view: ProofView = buildProof(data.proposals, data.done);
  const undo = async (r: ChangeReceipt) => {
    if (busy) return;
    setBusy(r.id);
    try {
      const next = await discovery.undo(lang, r.p.id);
      setLoad({ kind: "ready", value: { ...data, proposals: data.proposals.map((p) => (p.id === next.id ? next : p)) } });
      show(T[lang].toastUndone, T[lang].toastUndoneBody(beforeAfter(r.p, lang).before, whereOf(r.p.target, data.sourceKind)));
    } catch (e) {
      show(T[lang].toastUndone, sayError(e, lang));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Proof lang={lang} view={view} tabs={tabs} people={approversOf(data.team)} sourceKind={data.sourceKind} onUndo={(r) => void undo(r)} busyId={busy}
      foot={foot(toast ? <Toast toast={toast} lang={lang} onUndo={() => {}} onDismiss={hide} /> : null)} />
  );
}

// ── Answers ────────────────────────────────────────────

export function LiveAnswers({ lang, tabs, foot }: { lang: D2Lang; tabs: ReactNode; foot: Foot }) {
  const [load, setLoad] = useState<Load<AnswersAnswer>>({ kind: "loading" });
  const read = useCallback(async () => {
    try { setLoad({ kind: "ready", value: await discovery2.answers(lang) }); }
    catch (e) { setLoad({ kind: "error", message: sayError(e, lang) }); }
  }, [lang]);
  useEffect(() => {
    const start = setTimeout(() => { void read(); }, 0);
    return () => clearTimeout(start);
  }, [read]);
  if (load.kind === "loading") return <LoadingScreen lang={lang} tabs={tabs} />;
  if (load.kind === "error") return <ErrorScreen lang={lang} tabs={tabs} message={load.message} onRetry={() => { setLoad({ kind: "loading" }); void read(); }} />;
  return <Answers lang={lang} view={buildAnswers(load.value)} api={load.value} tabs={tabs} foot={foot(null)} />;
}

// ── Set up ─────────────────────────────────────────────

type SetupData = { packs: Pack[]; saved: Choice; chosen: boolean; place: Place | null; facts: Fact[]; sourceKind: string };

export function LiveSetup({ lang, canManage, onDone, tabs }: { lang: D2Lang; canManage: boolean; onDone: () => void; tabs?: ReactNode }) {
  const t2 = T2[lang];
  const [load, setLoad] = useState<Load<SetupData>>({ kind: "loading" });
  const [choice, setChoice] = useState<Choice>({ family: null, trade: null });
  const [stage, setStage] = useState<SetupStage>("idle");
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const read = useCallback(async () => {
    try {
      const [packs, plus, places] = await Promise.all([discovery2.packs(lang), discovery2.overview(lang), discovery.places().catch((): Place[] => [])]);
      // The agent role may not read the business's pack (403): it sees the pack of the last check.
      const mine = canManage ? await discovery2.pack(lang).catch(() => null) : null;
      const saved: Choice = mine ? { family: mine.family, trade: mine.trade } : { family: plus.checks?.family ?? null, trade: plus.checks?.trade ?? null };
      const place = places[0] ?? null;
      const facts = place ? await discovery.facts(lang, place.id).catch((): Fact[] => []) : [];
      setChoice(saved);
      setLoad({ kind: "ready", value: { packs, saved, chosen: !!mine?.chosen, place, facts, sourceKind: plus.overview.source?.kind ?? "" } });
    } catch (e) {
      setLoad({ kind: "error", message: sayError(e, lang) });
    }
  }, [lang, canManage]);

  useEffect(() => {
    const start = setTimeout(() => { void read(); }, 0);
    return () => clearTimeout(start);
  }, [read]);

  const checkNow = useCallback(async () => {
    if (load.kind !== "ready" || !choice.family || (stage !== "idle" && stage !== "done")) return;
    setError("");
    setStage("saving");
    try {
      const data = load.value;
      if (!data.chosen || data.saved.family !== choice.family || data.saved.trade !== choice.trade) await discovery2.setPack(lang, choice.family, choice.trade);
      const started = await discovery.startRun(lang);
      setStage(started.status === "queued" ? "queued" : "running");
      const done = await untilFinished(lang, started, (r) => { if (alive.current) setStage(r.status === "queued" ? "queued" : "running"); }, () => !alive.current);
      if (!alive.current) return;
      if (done.status === "done") { setStage("done"); onDone(); }
      else { setStage("idle"); setError(t2.runFailed); }
    } catch (e) {
      setStage("idle");
      setError(sayError(e, lang) || t2.saveFailed);
    }
  }, [load, choice, stage, lang, onDone, t2]);

  if (load.kind === "loading") return <LoadingScreen lang={lang} tabs={tabs} />;
  if (load.kind === "error") return <ErrorScreen lang={lang} tabs={tabs} message={load.message} onRetry={() => { setLoad({ kind: "loading" }); void read(); }} />;
  const data = load.value;
  return (
    <Setup lang={lang} packs={data.packs} choice={choice} onChoose={setChoice} canManage={canManage} tabs={tabs}
      google={<GoogleMapsLink lang={lang} canManage={canManage} />}
      known={knownFacts({ place: data.place, facts: data.facts, sourceKind: data.sourceKind, lang })}
      stage={stage} error={error} onCheckNow={() => void checkNow()} />
  );
}
