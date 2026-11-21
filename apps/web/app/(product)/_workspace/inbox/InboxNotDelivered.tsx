"use client";

import { useCallback, useMemo, useState } from "react";
import { Banner, Button, Empty, PageTitle, Panel, PanelFooter, PanelHeader, Search, Stat, Table, Tabs, useToast, type TableColumn } from "../../../_ui";
import { ApiError, say } from "../../../_ui/api";
import { formatDate, formatTime } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { useSoon } from "./useSoon";
import { fetchNotSent, retryNotSent, type Mode, type NotSentAnswer } from "./inboxApi";
import { daysBetween, dayKey, pickText } from "./logic";
import type { NotSentRow } from "./types";

export type NotDeliveredProps = {
  lang: Lang;
  now: number;
  mode: Mode;
  /** A template can be sent from the conversation (the sample can; the live API cannot yet). */
  canSendTemplates: boolean;
  onOpenConversation: (contactId: string) => void;
};

type Kind = "all" | "held" | "failed";

function When({ at, lang, now }: { at: string; lang: Lang; now: number }) {
  const t = copy(lang);
  const day = dayKey(at) === dayKey(now) ? t.today : formatDate(at, lang, { now });
  return (
    <span className="ibx-when u-mono">
      <bdi>{day}</bdi>
      <bdi className="ibx-when-time">{formatTime(at, lang)}</bdi>
    </span>
  );
}

function Who({ row, lang }: { row: NotSentRow; lang: Lang }) {
  const t = copy(lang).notDelivered;
  return (
    <span className="ibx-who2">
      <span className="ibx-who2-name">{row.customer ? <bdi>{row.customer}</bdi> : t.noNameYet}</span>
      <span className="ibx-who2-phone u-mono"><bdi>{row.phone}</bdi></span>
    </span>
  );
}

export function InboxNotDelivered({ lang, now, mode, canSendTemplates, onOpenConversation }: NotDeliveredProps) {
  const t = copy(lang).notDelivered;
  const toast = useToast();
  const [data, setData] = useState<NotSentAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchNotSent(mode));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [mode]);

  useSoon(load);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = query.trim().toLowerCase();
    return all.filter((r) => !q || r.customer.toLowerCase().includes(q) || r.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || pickText(r.body, lang).toLowerCase().includes(q));
  }, [data, query, lang]);

  const held = rows.filter((r) => r.status === "blocked");
  const failedRows = rows.filter((r) => r.status === "failed");
  const all = data?.rows ?? [];
  const allHeld = all.filter((r) => r.status === "blocked").length;
  const allFailed = all.length - allHeld;
  const fresh = all.filter((r) => daysBetween(r.createdAt, now) <= 1);
  const outside = fresh.filter((r) => r.reason === "window_closed").length;

  async function retry(row: NotSentRow) {
    setBusy(row.id);
    try {
      await retryNotSent(row.id, mode);
      toast.push({ text: mode.live ? t.sentAgain : copy(lang).previewNothingSent, tone: mode.live ? "ok" : undefined });
      if (mode.live) await load();
    } catch (error) {
      toast.push({ text: error instanceof ApiError ? say(error, lang) : t.retryFailed, tone: "bad" });
    } finally {
      setBusy(null);
    }
  }

  /** When it can go: the sentence for why it cannot go now. */
  const goes = (r: NotSentRow): string => {
    if (r.reason === "window_closed") return t.goes.window_closed(canSendTemplates);
    const text = t.goes[(r.whyNot ?? r.reason) as Exclude<keyof typeof t.goes, "window_closed">];
    return typeof text === "string" ? text : "";
  };

  const when: TableColumn<NotSentRow> = { key: "when", header: t.colWhen, width: "var(--ibx-col-s)", phone: "kicker", cell: (r) => <When at={r.createdAt} lang={lang} now={now} /> };
  const customer: TableColumn<NotSentRow> = { key: "customer", header: t.colCustomer, width: "var(--ibx-col-m)", phone: "title", cell: (r) => <Who row={r} lang={lang} /> };
  const message: TableColumn<NotSentRow> = { key: "message", header: t.colMessage, phone: "body", cell: (r) => <span className="ibx-clamp" dir="auto">{pickText(r.body, lang)}</span> };
  const why: TableColumn<NotSentRow> = { key: "why", header: t.colWhy, width: "var(--ibx-col-m)", phone: "tag", cell: (r) => <span className="ibx-why">{t.why[r.reason]}</span> };

  const heldColumns: TableColumn<NotSentRow>[] = [
    when, customer, message, why,
    {
      key: "goes", header: t.colWhenItCanGo, width: "var(--ibx-col-l)", phone: "foot",
      cell: (r) => <span className="ibx-goes">{goes(r)}</span>,
    },
    {
      key: "action", header: <span className="u-sr">{t.openConversation}</span>, label: t.openConversation, width: "var(--ibx-col-s)", align: "end", phone: "foot-end",
      cell: (r) => r.reason === "window_closed" ? (
        <Button kind="line" size="xs" onClick={() => onOpenConversation(r.contactId)}>{canSendTemplates ? t.sendTemplate : t.openConversation}</Button>
      ) : (
        <span className="ibx-cannot">{t.cannotGo}</span>
      ),
    },
  ];

  const failedColumns: TableColumn<NotSentRow>[] = [
    when, customer, message, why,
    {
      key: "said", header: t.colWhatsApp, width: "var(--ibx-col-l)", phone: "foot",
      cell: (r) => <span className="ibx-goes">{r.reason === "gave_up" ? t.gaveUpSaid : r.whatsappSaid ?? ""}</span>,
    },
    {
      key: "action", header: <span className="u-sr">{t.sendAgain}</span>, label: t.sendAgain, width: "var(--ibx-col-s)", align: "end", phone: "foot-end",
      cell: (r) => r.canRetry ? (
        <Button kind="line" size="xs" loading={busy === r.id} loadingLabel={t.retrying} onClick={() => retry(r)}>{t.sendAgain}</Button>
      ) : (
        <Button kind="quiet" size="xs" onClick={() => onOpenConversation(r.contactId)}>{t.openConversation}</Button>
      ),
    },
  ];

  const none = data !== null && all.length === 0;

  return (
    <div className="ibx-page">
      <PageTitle
        title={t.title}
        sub={t.sub(data?.days ?? 14)}
        right={
          <div className="ibx-title-tools">
            <Search label={t.title} placeholder={copy(lang).searchNotDelivered} clearLabel={copy(lang).clearSearch} value={query} onChange={setQuery} />
            <Tabs
              label={t.tabsLabel}
              items={[
                { id: "all", label: t.all, count: all.length },
                { id: "held", label: t.heldBack, count: allHeld },
                { id: "failed", label: t.failed, count: allFailed },
              ]}
              value={kind}
              onChange={(id) => setKind(id as Kind)}
            />
          </div>
        }
      />

      {failed ? (
        <Banner tone="bad" action={<Button kind="quiet" size="xs" onClick={() => void load()}>{copy(lang).states.tryNow}</Button>}>{copy(lang).states.loadError}</Banner>
      ) : null}

      {none ? (
        <Empty title={t.empty(data?.days ?? 14)} />
      ) : (
        <>
          <div className="ibx-stats4">
            <Stat label={t.statTotal(data?.days ?? 14)} value={data ? all.length : ""} sub={data?.sentTotal ? t.statTotalSub(data.sentTotal) : undefined} />
            <Stat label={t.statNew} value={data ? fresh.length : ""} sub={data ? t.statNewSub(outside) : undefined} />
            <Stat label={t.statHeld} value={data ? allHeld : ""} sub={t.statHeldSub} />
            <Stat label={t.statFailed} value={data ? allFailed : ""} sub={data ? t.statFailedSub(all.filter((r) => r.status === "failed" && r.canRetry).length) : undefined} />
          </div>

          {kind !== "failed" && (held.length > 0 || !data) ? (
            <Panel clip>
              <PanelHeader title={t.statHeld} sub={data ? held.length : undefined} right={<span className="ibx-sort">{t.newestFirst}</span>} />
              <Table caption={t.statHeld} columns={heldColumns} rows={held} rowKey={(r) => r.id} loading={!data} loadingLabel={copy(lang).states.loading} skeletonRows={4} />
              <PanelFooter>{t.heldFooter}</PanelFooter>
            </Panel>
          ) : null}

          {kind !== "held" && (failedRows.length > 0 || !data) ? (
            <Panel clip>
              <PanelHeader title={t.statFailed} sub={data ? failedRows.length : undefined} right={<span className="ibx-sort">{t.newestFirst}</span>} />
              <Table caption={t.statFailed} columns={failedColumns} rows={failedRows} rowKey={(r) => r.id} loading={!data} loadingLabel={copy(lang).states.loading} skeletonRows={3} />
              <PanelFooter>{t.failedFooter}</PanelFooter>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
