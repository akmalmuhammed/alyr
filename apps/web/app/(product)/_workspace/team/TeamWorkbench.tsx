"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageTitle, useToast } from "@/app/_ui";
import { T } from "./copy";
import type { Lang } from "./copy";
import { explain, isOffline } from "./explain";
import { isEmptyReport, normalise, ownRow, removeImpact } from "./logic";
import type { Me, Member, Period, RawPerformance, Report, Role } from "./logic";
import type { Invite, TeamSource } from "./teamApi";
import { TeamAgent } from "./TeamAgent";
import { TeamInviteDialog } from "./TeamInviteDialog";
import { TeamPeople } from "./TeamPeople";
import { TeamPersonDrawer } from "./TeamPersonDrawer";
import { TeamRemoveDialog } from "./TeamRemoveDialog";
import { FailureBanner, OfflineBanner, TeamEmpty, WeekSkeleton } from "./TeamStates";
import { TeamWeek } from "./TeamWeek";
import "./team.css";

export type TeamInitial = {
  me: Me;
  members: Member[];
  reports: Partial<Record<Period, RawPerformance>>;
  signing: boolean;
  /** Doha time (ISO) the above was read. */
  loadedAt: string;
};

export type TeamWorkbenchProps = {
  lang: Lang;
  shop: string;
  source: TeamSource;
  /** What is already known (server-rendered or the preview's sample): no loading state is drawn. */
  initial?: TeamInitial;
  view?: "people" | "week";
  openId?: string | null;
  dialog?: "invite" | "remove" | null;
  removeId?: string | null;
  /** The preview's offline state: the sample is on screen and every read fails. */
  offline?: boolean;
  /** Where "Open the inbox" goes. */
  inboxHref?: string;
};

type Phase = "loading" | "ready" | "failed";

/**
 * The Team section: People and This week. It reads through a `TeamSource` and changes the team only
 * through it, so the same screens run on the API and on the preview's in-memory sample (which sends
 * nothing anywhere). An agent sees the roster read-only and only their own numbers.
 */
export function TeamWorkbench(props: TeamWorkbenchProps) {
  const { lang, shop, source, initial, inboxHref = "/app/inbox" } = props;
  const t = T[lang];
  const toast = useToast();

  const [me, setMe] = useState<Me | null>(initial?.me ?? null);
  const [members, setMembers] = useState<Member[] | null>(initial?.members ?? null);
  const [reports, setReports] = useState<Partial<Record<Period, RawPerformance>>>(initial?.reports ?? {});
  const [signing, setSigning] = useState<boolean | null>(initial?.signing ?? null);
  const [loadedAt, setLoadedAt] = useState(initial?.loadedAt ?? new Date().toISOString());
  const [phase, setPhase] = useState<Phase>(initial ? "ready" : "loading");
  const [offline, setOffline] = useState(Boolean(props.offline));
  const [failure, setFailure] = useState<string | null>(null);

  const [view, setView] = useState<"people" | "week">(props.view ?? "people");
  const [period, setPeriod] = useState<Period>(7);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(props.openId ?? null);
  const [dialog, setDialog] = useState<"invite" | "remove" | null>(props.dialog ?? null);
  const [removeId, setRemoveId] = useState<string | null>(props.removeId ?? null);
  const [saving, setSaving] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);

  const readOnly = offline;

  /** Read everything the screen needs. A failure keeps what is already on screen. */
  const load = useCallback(async (days: Period) => {
    try {
      const [who, list, raw, sign] = await Promise.all([source.me(), source.members(), source.report(days), source.signing()]);
      setMe(who);
      setMembers(list);
      setReports((prev) => ({ ...prev, [days]: raw }));
      setSigning(sign);
      setLoadedAt(new Date().toISOString());
      setOffline(false);
      setFailure(null);
      setPhase("ready");
    } catch (error) {
      if (isOffline(error)) setOffline(true);
      else setFailure(explain(error, lang));
      setPhase((p) => (p === "loading" ? "failed" : p));
    }
  }, [source, lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read starts here and sets state only after it answers
    if (!initial) void load(7);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once; later reads are the person's own actions

  /** The seven-day report is also what the drawer and the remove dialog read their person's numbers from. */
  useEffect(() => {
    if (!me || me.role === "agent" || reports[7] || offline) return;
    source.report(7).then((raw) => setReports((prev) => ({ ...prev, 7: raw }))).catch(() => undefined);
  }, [me, reports, offline, source]);

  const report: Report | null = useMemo(() => (reports[period] ? normalise(reports[period]!) : null), [reports, period]);
  const week: Report | null = useMemo(() => (reports[7] ? normalise(reports[7]!) : null), [reports]);

  async function changePeriod(next: Period) {
    setPeriod(next);
    if (reports[next]) return;
    setRefreshing(true);
    try {
      const raw = await source.report(next);
      setReports((prev) => ({ ...prev, [next]: raw }));
    } catch (error) {
      if (isOffline(error)) setOffline(true);
      else setFailure(explain(error, lang));
      setPeriod(period);
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshMembers() {
    const [list, raw] = await Promise.all([source.members(), source.report(7)]);
    setMembers(list);
    setReports((prev) => ({ ...prev, 7: raw }));
  }

  async function changeRole(id: string, role: Role, fromDrawer = false) {
    if (!members) return;
    const person = members.find((m) => m.id === id);
    if (!person || person.role === role) return;
    setSaving((s) => [...s, id]);
    setFailure(null);
    setLayerError(null);
    try {
      await source.changeRole(id, role);
      setMembers(await source.members());
      if (fromDrawer) setOpenId(null);
      toast.push({
        text: t.roleSaved(person.name, t.roles[role]),
        undo: () => void source.changeRole(id, person.role).then(() => source.members()).then(setMembers).catch((e) => setFailure(explain(e, lang))),
        undoLabel: t.undo,
      });
    } catch (error) {
      const text = explain(error, lang);
      if (isOffline(error)) setOffline(true);
      if (fromDrawer) setLayerError(text);
      else setFailure(text);
    } finally {
      setSaving((s) => s.filter((x) => x !== id));
    }
  }

  async function sendInvite(input: Invite) {
    setBusy(true);
    setLayerError(null);
    try {
      await source.invite(input);
      await refreshMembers();
      setDialog(null);
      toast.push({ text: t.invited(input.name), meta: input.email });
    } catch (error) {
      if (isOffline(error)) setOffline(true);
      setLayerError(explain(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    const person = members?.find((m) => m.id === removeId);
    if (!person) return;
    setBusy(true);
    setLayerError(null);
    try {
      await source.remove(person.id);
      await refreshMembers();
      setDialog(null);
      setRemoveId(null);
      toast.push({ text: t.removed(person.name) });
    } catch (error) {
      if (isOffline(error)) setOffline(true);
      setLayerError(explain(error, lang));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSigning(on: boolean) {
    const before = signing;
    setSigning(on);
    try {
      await source.setSigning(on);
      toast.push({ text: t.signingSaved(on), key: "signing" });
    } catch (error) {
      setSigning(before);
      if (isOffline(error)) setOffline(true);
      else setFailure(explain(error, lang));
    }
  }

  function retry() {
    setFailure(null);
    void load(period);
  }

  // ── what to draw ─────────────────────────────────────

  if (phase === "failed" || (phase === "loading" && failure)) {
    return (
      <div className="team-preview-wrap">
        <div className="team-page">
          <FailureBanner lang={lang} reason={`${t.failed} ${failure ?? ""}`.trim()} onRetry={retry} />
        </div>
      </div>
    );
  }

  const loading = phase === "loading" || !me || !members;
  const banner = offline
    ? <OfflineBanner lang={lang} loadedAt={loadedAt} onRetry={retry} />
    : failure
      ? <FailureBanner lang={lang} reason={failure} onDismiss={() => setFailure(null)} />
        : undefined;
  const covered = Boolean(openId) || dialog !== null;
  const person = members?.find((m) => m.id === openId) ?? null;
  const removing = members?.find((m) => m.id === removeId) ?? null;

  let screen;
  if (view === "week") {
    if (loading || !report) {
      screen = <WeekSkeleton lang={lang} />;
    } else if (me.role === "agent") {
      screen = (
        <TeamAgent lang={lang} report={report} row={ownRow(report, me)} updatedAt={loadedAt} period={period} onPeriod={changePeriod} inboxHref={inboxHref} banner={banner} />
      );
    } else if (isEmptyReport(report)) {
      screen = (
        <div className="team-page">
          <PageTitle title={t.weekTitle} />
          {banner}
          <TeamEmpty lang={lang} canInvite onInvite={() => setDialog("invite")} />
        </div>
      );
    } else {
      screen = (
        <TeamWeek lang={lang} report={report} updatedAt={loadedAt} period={period} onPeriod={changePeriod} inboxHref={inboxHref} covered={covered} banner={banner} refreshing={refreshing} />
      );
    }
  } else {
    screen = (
      <TeamPeople
        lang={lang}
        shop={shop}
        me={me ?? { id: "", role: "agent" }}
        members={members ?? []}
        loading={loading}
        openId={openId}
        covered={covered}
        banner={banner}
        signing={signing}
        saving={saving}
        readOnly={readOnly}
        onOpen={(id) => { setLayerError(null); setOpenId(id); }}
        onInvite={() => { setLayerError(null); setDialog("invite"); }}
        onChangeRole={(id, role) => void changeRole(id, role)}
        onRemove={(id) => { setRemoveId(id); setLayerError(null); setOpenId(null); setDialog("remove"); }}
        onSigning={(on) => void toggleSigning(on)}
      />
    );
  }

  return (
    <div className="team-preview-wrap">
      {screen}
      {me && members && person ? (
        <TeamPersonDrawer
          key={person.id}
          lang={lang}
          me={me}
          members={members}
          person={person}
          work={week?.rows.find((r) => r.id === person.id) ?? null}
          saving={saving.includes(person.id)}
          error={layerError}
          readOnly={readOnly}
          onClose={() => setOpenId(null)}
          onSave={(role) => (role === person.role ? setOpenId(null) : void changeRole(person.id, role, true))}
          onRemove={() => { setRemoveId(person.id); setLayerError(null); setOpenId(null); setDialog("remove"); }}
          onOpenWeek={() => { setOpenId(null); setView("week"); }}
        />
      ) : null}
      {me && members && dialog === "invite" ? (
        <TeamInviteDialog lang={lang} me={me} count={members.length} busy={busy} error={layerError} onClose={() => setDialog(null)} onSend={(input) => void sendInvite(input)} />
      ) : null}
      {members && removing && dialog === "remove" ? (
        <TeamRemoveDialog
          lang={lang}
          person={removing}
          impact={removeImpact(week, removing.id)}
          busy={busy}
          error={layerError}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  );
}
