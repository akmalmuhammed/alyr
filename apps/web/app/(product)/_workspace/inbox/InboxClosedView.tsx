"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Band, BandItem, Banner, Button, Chip, Empty, KV, KVList, Meter, PageTitle, Panel, PanelFooter, PanelHeader, Search, SkeletonRows, Spark,
  Status, Table, Tabs, useToast, type TableColumn,
} from "../../../_ui";
import { formatDate, formatTime, money } from "../../../_ui/format";
import { copy, type Lang } from "./copy";
import { useSoon } from "./useSoon";
import { fetchClosed, type Mode } from "./inboxApi";
import { dayKey, pickText } from "./logic";
import type { ClosedData, ClosedRow, Role } from "./types";

export type ClosedViewProps = {
  lang: Lang;
  now: number;
  mode: Mode;
  role: Role;
  openCount: number;
  /** Back to the conversations (the "Open" tab). */
  onOpenTab: () => void;
  /** Nothing to count in this mode: the screen falls back to the closed list. */
  onUnavailable: () => void;
};

const TONE = { sold: "ok", booked: "ok", answered: "n", lost: "bad" } as const;
type Series = "total" | "sold" | "booked" | "answered" | "lost";

export function InboxClosedView({ lang, now, mode, role, openCount, onOpenTab, onUnavailable }: ClosedViewProps) {
  const t = copy(lang);
  const c = t.closed;
  const toast = useToast();
  const [data, setData] = useState<ClosedData | null>(null);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<"all" | ClosedRow["outcome"]>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const answer = await fetchClosed(mode, role);
      if (answer === null) onUnavailable();
      else setData(answer);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [mode, role, onUnavailable]);

  useSoon(load);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) => (outcome === "all" || r.outcome === outcome) && (!q || (r.customer ?? "").toLowerCase().includes(q) || r.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))),
    );
  }, [data, outcome, query]);

  const selected = (data?.rows ?? []).find((r) => r.id === picked) ?? (data?.rows ?? []).find((r) => r.outcome === "lost") ?? data?.rows[0] ?? null;

  const refText = (r: ClosedRow): string => {
    if (r.booking) return c.bookingNo(r.booking);
    if (r.order) return `#${r.order.number} · ${money(r.order.total, lang)}`;
    if (r.reason) return t.reasons[r.reason];
    return r.note ? pickText(r.note, lang) : "";
  };

  const columns: TableColumn<ClosedRow>[] = [
    {
      key: "customer", header: c.colCustomer, phone: "title",
      cell: (r) => (
        <span className="ibx-who2">
          <span className="ibx-who2-name">{r.customer ? <bdi>{r.customer}</bdi> : c.noNameYet}</span>
          <span className="ibx-who2-phone u-mono"><bdi>{r.phone}</bdi></span>
        </span>
      ),
    },
    { key: "how", header: c.colHow, width: "var(--ibx-col-xs)", phone: "tag", cell: (r) => <Status tone={TONE[r.outcome]}>{t.outcomes[r.outcome].label}</Status> },
    {
      key: "ref", header: c.colRef, width: "var(--ibx-col-m)", phone: "body",
      cell: (r) => <span className={r.booking || r.order ? "u-mono" : "ibx-muted"} dir="auto"><bdi>{refText(r)}</bdi></span>,
    },
    { key: "by", header: c.colBy, width: "var(--ibx-col-xs)", phone: "foot", cell: (r) => r.by },
    {
      key: "at", header: c.colAt, width: "var(--ibx-col-s)", align: "end", mono: true, phone: "foot-end",
      cell: (r) => <bdi>{dayKey(r.at) === dayKey(now) ? t.today : formatDate(r.at, lang, { now }).split(" ")[0]} {formatTime(r.at, lang)}</bdi>,
    },
  ];

  const week = data?.week.total ?? 0;
  const share = (n: number) => (week > 0 ? `${Math.round((n / week) * 100)}%` : "");
  const totals = (key: Series) => (data ? data.trend[key].reduce((a, b) => a + b, 0) : 0);
  const topReason = data ? [...data.whyLost].sort((a, b) => b.count - a.count)[0] : null;
  const lostTotal = data ? data.whyLost.reduce((a, b) => a + b.count, 0) : 0;
  const maxLost = data ? Math.max(1, ...data.whyLost.map((w) => w.count)) : 1;
  const label: Record<Series, string> = {
    total: c.thisWeek, sold: t.outcomes.sold.label, booked: t.outcomes.booked.label, answered: t.outcomes.answered.label, lost: t.outcomes.lost.label,
  };
  const spark = (key: Series) => (
    <Spark onBand width="100%" values={data?.trend[key] ?? []} summary={c.trend(label[key], (data?.trend[key] ?? []).join(", "))} />
  );

  return (
    <div className="ibx-page">
      <PageTitle
        title={c.title}
        sub={c.sub}
        right={
          <Tabs
            label={c.viewLabel}
            items={[{ id: "open", label: t.tabOpen, count: openCount }, { id: "closed", label: t.tabClosed }]}
            value="closed"
            onChange={(id) => { if (id === "open") onOpenTab(); }}
          />
        }
      />

      {failed ? <Banner tone="bad" action={<Button kind="quiet" size="xs" onClick={() => void load()}>{t.states.tryNow}</Button>}>{t.states.loadError}</Banner> : null}

      {!data ? (
        <SkeletonRows rows={6} columns={4} label={t.states.loading} />
      ) : (
        <>
          <Band className="ibx-band" aria-label={c.thisWeek}>
            <BandItem
              label={c.thisWeek} value={data.week.total.toLocaleString("en")} unit={c.soFar}
              sub={c.byLastWeek(data.week.lastWeekToDate, formatDate(now, lang).split(" ")[0])}
            >{spark("total")}</BandItem>
            <BandItem
              label={t.outcomes.sold.label} value={totals("sold")} unit={share(totals("sold"))}
              sub={data.soldValue !== undefined ? c.soldSub(money(data.soldValue, lang)) : undefined}
            >{spark("sold")}</BandItem>
            <BandItem label={t.outcomes.booked.label} value={totals("booked")} unit={share(totals("booked"))} sub={c.bookedSub}>{spark("booked")}</BandItem>
            <BandItem label={t.outcomes.answered.label} value={totals("answered")} unit={share(totals("answered"))} sub={c.answeredSub}>{spark("answered")}</BandItem>
            <BandItem
              label={t.outcomes.lost.label} value={totals("lost")} unit={share(totals("lost"))}
              sub={topReason && topReason.count > 0 ? c.lostSub(t.reasons[topReason.reason]) : undefined}
            >{spark("lost")}</BandItem>
          </Band>

          <div className="ibx-closed-grid">
            <Panel clip>
              <div className="ibx-filterbar">
                <div className="ibx-chips" role="group" aria-label={c.filterLabel}>
                  <Chip on={outcome === "all"} count={week} onClick={() => setOutcome("all")}>{c.all}</Chip>
                  {(["sold", "booked", "answered", "lost"] as const).map((o) => (
                    <Chip key={o} on={outcome === o} count={totals(o)} onClick={() => setOutcome(outcome === o ? "all" : o)}>{t.outcomes[o].label}</Chip>
                  ))}
                </div>
                <Search label={t.searchClosed} placeholder={t.searchClosed} clearLabel={t.clearSearch} value={query} onChange={setQuery} />
              </div>
              <Table
                caption={c.tableLabel}
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                activeKey={selected?.id ?? null}
                onRowOpen={(r) => setPicked(r.id)}
                empty={<Empty title={c.empty} />}
              />
              <PanelFooter>{c.showing(data.rows.length, week)}</PanelFooter>
            </Panel>

            <div className="ibx-closed-side">
              {selected ? (
                <Panel clip>
                  <PanelHeader
                                        title={<bdi>{selected.customer ?? selected.phone}</bdi>}
                    right={
                      <Button
                        kind="quiet" size="xs"
                        onClick={() => toast.push({ text: mode.live ? c.reopenFailed : t.previewNothingSent, tone: mode.live ? "bad" : undefined })}
                      >{c.reopen}</Button>
                    }
                  />
                  <div className="ibx-closed-card">
                    {selected.teamNote ? <p dir="auto">{selected.teamNote}</p> : null}
                    <p className="ibx-closed-line">
                      <Status tone={TONE[selected.outcome]}>{t.outcomes[selected.outcome].label}</Status>
                      {selected.reason ? <span className="ibx-muted">{t.reasons[selected.reason]}</span> : null}
                      {selected.messages ? <span className="ibx-closed-aside u-mono">{c.messagesAndMinutes(selected.messages, selected.minutes ?? 0)}</span> : null}
                    </p>
                  </div>
                </Panel>
              ) : null}

              <Panel clip>
                <PanelHeader title={c.whyLostTitle(lostTotal)} sub={c.whyLostPeriod} />
                <ul className="ibx-whylost">
                  {data.whyLost.map((w) => (
                    <li key={w.reason}>
                      <span>{t.reasons[w.reason]}</span>
                      <Meter value={w.count} max={maxLost} label={c.meterLabel(t.reasons[w.reason], w.count)} />
                      <span className="u-mono">{w.count}</span>
                    </li>
                  ))}
                </ul>
                <PanelFooter>{c.whyLostFooter}</PanelFooter>
              </Panel>

              <Panel clip>
                <PanelHeader title={c.firstAnswer} />
                <KVList className="ibx-kv">
                  <KV k={c.today} mono>{c.minutes(data.firstAnswer.today)}</KV>
                  <KV k={c.median} mono>{c.minutes(data.firstAnswer.median)}</KV>
                  <KV k={c.waitedOver15}>{c.conversations(data.firstAnswer.waitedOver15)}</KV>
                </KVList>
                <PanelFooter>{c.firstAnswerFooter}</PanelFooter>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
