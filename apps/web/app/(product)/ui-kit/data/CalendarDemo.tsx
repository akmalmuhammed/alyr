"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarGrid, HourHeat, HEAT_CLOSED, useToast } from "../../../_ui";
import type { CalendarBlock, CalendarResource, CalendarState, HeatColumn } from "../../../_ui";
import type { Words } from "./copy";
import { Block, Cell } from "./shared";
import type { Lang } from "./shared";

type Raw = { id: string; resource: string; start: string; end: string; who: [string, string]; service: keyof Words["services"]; state: CalendarState; lines?: (keyof Words["extra"])[] };

const RAW: Raw[] = [
  { id: "a1", resource: "bay1", start: "07:20", end: "08:00", who: ["Khalid Nasser", "خالد ناصر"], service: "full", state: "came" },
  { id: "a2", resource: "bay1", start: "08:20", end: "08:40", who: ["Omar Ali", "عمر علي"], service: "express", state: "came" },
  { id: "a3", resource: "bay1", start: "09:00", end: "09:20", who: ["Sara Haddad", "سارة حداد"], service: "express", state: "unmarked" },
  { id: "a4", resource: "bay1", start: "10:00", end: "10:40", who: ["Mariam Saleh", "مريم صالح"], service: "full", state: "booked" },
  { id: "a5", resource: "bay1", start: "11:30", end: "12:00", who: ["Gulf Courier W.L.L.", "Gulf Courier W.L.L."], service: "engine", state: "booked" },
  { id: "a6", resource: "bay1", start: "17:00", end: "17:40", who: ["Layla Farouk", "ليلى فاروق"], service: "full", state: "booked" },
  { id: "b1", resource: "bay2", start: "07:20", end: "07:40", who: ["Gulf Courier W.L.L.", "Gulf Courier W.L.L."], service: "express", state: "came" },
  { id: "b2", resource: "bay2", start: "07:50", end: "08:30", who: ["Noor Abdullah", "نور عبدالله"], service: "full", state: "noshow" },
  { id: "b3", resource: "bay2", start: "08:30", end: "09:10", who: ["Dana Home Services", "Dana Home Services"], service: "full", state: "unmarked" },
  { id: "b4", resource: "bay2", start: "09:20", end: "10:00", who: ["Bayview School", "Bayview School"], service: "full", state: "now" },
  { id: "b5", resource: "bay2", start: "16:30", end: "17:10", who: ["Bluefin Events", "Bluefin Events"], service: "full", state: "booked" },
  { id: "c1", resource: "yusuf", start: "10:15", end: "11:15", who: ["Fatima Darwish", "فاطمة درويش"], service: "topup", state: "booked", lines: ["b118"] },
  { id: "c2", resource: "yusuf", start: "11:30", end: "13:00", who: ["Aisha Hamad", "عائشة حمد"], service: "interior", state: "booked", lines: ["b118", "quote"] },
  { id: "c3", resource: "yusuf", start: "14:00", end: "15:30", who: ["Palm Court Offices", "Palm Court Offices"], service: "interior", state: "booked", lines: ["b121"] },
  { id: "d1", resource: "bilal", start: "08:00", end: "12:00", who: ["Yousef Hassan", "يوسف حسن"], service: "ceramic", state: "now", lines: ["b118", "deposit", "quote"] },
  { id: "d2", resource: "bilal", start: "13:00", end: "17:00", who: ["Khalid Nasser", "خالد ناصر"], service: "ceramic", state: "held", lines: ["held", "heldNote"] },
];

/** The hours in <bdi> so a range keeps its order inside Arabic, then what is booked. */
function detail(t: Words, hours: string, booked: string) {
  return <><bdi>{hours}</bdi> · {t.resDetail("", booked).replace(/^ · /, "")}</>;
}

export function CalendarDemo({ t, lang }: { t: Words; lang: Lang }) {
  const toast = useToast();
  const i = lang === "ar" ? 1 : 0;
  const [picked, setPicked] = useState<string | null>(null);

  const blocksFor = (rows: Raw[]): CalendarBlock[] =>
    rows.map((r) => ({
      id: r.id,
      resource: r.resource,
      start: r.start,
      end: r.end,
      title: r.who[i],
      service: t.services[r.service],
      state: r.state,
      lines: r.lines?.map((k) => t.extra[k]),
      label: t.blockLabel(r.who[i], t.services[r.service], r.start, r.end, t.stateWords[r.state]),
      onOpen: () => setPicked(r.id),
    }));

  const resources: CalendarResource[] = useMemo(() => [
    { id: "bay1", name: t.resources[0], count: "6", detail: detail(t, "07:00–22:00", lang === "ar" ? "3 س 30 د" : "3 h 30"), meter: { value: 0.23, label: t.meterLabel(t.resources[0], 23) } },
    { id: "bay2", name: t.resources[1], count: "5", detail: detail(t, "07:00–22:00", lang === "ar" ? "3 س" : "3 h"), meter: { value: 0.2, label: t.meterLabel(t.resources[1], 20) } },
    {
      id: "yusuf", name: t.resources[2], count: "3", detail: detail(t, "09:00–18:00", lang === "ar" ? "4 س" : "4 h"), meter: { value: 0.5, label: t.meterLabel(t.resources[2], 50) },
      off: [{ from: "07:00", to: "09:00", label: t.offWords.starts("09:00") }, { from: "13:00", to: "14:00", label: t.offWords.break }, { from: "18:00", to: "22:00", label: t.offWords.finished("18:00") }],
    },
    {
      id: "bilal", name: t.resources[3], count: "2", detail: detail(t, "08:00–20:00", lang === "ar" ? "8 س" : "8 h"), meter: { value: 0.67, label: t.meterLabel(t.resources[3], 67) },
      off: [{ from: "07:00", to: "08:00", label: t.offWords.starts("08:00") }, { from: "20:00", to: "22:00", label: t.offWords.finished("20:00") }],
    },
  ], [t, lang]);

  const wide: CalendarResource[] = useMemo(() => [
    ...resources,
    { id: "bay3", name: "Bay 3", count: "2", detail: detail(t, "07:00–22:00", lang === "ar" ? "1 س" : "1 h") },
    { id: "reem", name: lang === "ar" ? "Detailing · ريم" : "Detailing · Reem", count: "2", detail: detail(t, "09:00–18:00", lang === "ar" ? "2 س" : "2 h") },
  ], [resources, t, lang]);

  const doubled: Raw[] = [
    ...RAW,
    { id: "e1", resource: "bay3", start: "10:00", end: "11:00", who: ["Mariam Saleh", "مريم صالح"], service: "full", state: "booked" },
    { id: "e2", resource: "bay3", start: "10:20", end: "10:50", who: ["Omar Ali", "عمر علي"], service: "express", state: "booked" },
    { id: "e3", resource: "bay3", start: "10:30", end: "12:00", who: ["Layla Farouk", "ليلى فاروق"], service: "interior", state: "booked" },
    { id: "f1", resource: "reem", start: "09:00", end: "10:00", who: ["Sara Haddad", "سارة حداد"], service: "full", state: "came" },
    { id: "f2", resource: "reem", start: "13:30", end: "14:20", who: ["Noor Abdullah", "نور عبدالله"], service: "full", state: "booked" },
  ];

  const free = {
    minLength: 60,
    label: (g: { start: string; end: string }) => t.free(g.start, g.end),
    onPick: (g: { resource: string; start: string; end: string }) => toast.push({ text: t.free(g.start, g.end), meta: g.resource }),
  };

  const common = {
    day: { start: "07:00", end: "22:00" },
    now: "09:40",
    cornerLabel: t.corner,
    stateLabels: t.stateWords,
    caption: t.calendarCaption,
    legendNote: t.legendNote,
    freeSlots: free,
  };

  return (
    <Block title={t.calendar} note={t.calendarNote} id="calendar">
      <CalendarGrid {...common} resources={resources} blocks={blocksFor(RAW)} />
      <p className="u-kg-note" aria-live="polite">{picked ? `${t.actionOpen}: ${picked}` : ""}</p>
      <Cell cap={t.wideCalendar} wide>
        <div className="u-kd-narrow-wide">
          <CalendarGrid {...common} resources={wide} blocks={blocksFor(doubled)} maxHeight="var(--u-kd-cal-h)" showLegend={false} />
        </div>
      </Cell>
    </Block>
  );
}

export function HeatDemo({ t, lang }: { t: Words; lang: Lang }) {
  void lang;
  const counts: number[][] = [
    [2, 2, 1, 1, 1, 0, 0, 1, 0, 1, 2, 2, 1, 0, 0],
    [1, 2, 1, 1, 0, 1, 0, 0, 1, 1, 2, 1, 1, 0, 0],
    [2, 2, 2, 1, 1, 0, 0, 1, 0, 1, 2, 2, 1, 0, 0],
    [2, 1, 1, 2, 0, 1, 0, 0, 1, 1, 2, 1, 1, 0, 0],
    [3, 3, 2, 2, 2, 0, 1, 1, 0, 1, 1, 1, 0, 0, 0],
    [-1, -1, -1, -1, -1, -1, 1, 1, 2, 3, 3, 3, 2, 1, 0].map((n) => (n < 0 ? HEAT_CLOSED : n)),
    [2, 2, 2, 2, 1, 1, 1, 1, 1, 2, 3, 2, 1, 0, 0],
  ];
  const totals = ["14", "12", "15", "13", "17", "16", "21"];
  const columns: HeatColumn[] = t.heatDays.map((d, c) => ({
    id: d,
    today: c === 4,
    closedNote: c === 5 ? t.heatClosed : undefined,
    head: (
      <span className="u-kd-heathead">
        <span><span className="u-kd-muted">{d}</span> <strong>{t.heatDates[c]}</strong> {c === 4 ? <span className="u-kd-today">{t.heatToday}</span> : null}</span>
        <span className="u-kd-muted u-mono"><bdi>{totals[c]}</bdi></span>
      </span>
    ),
  }));
  const hour = (h: number): ReactNode => `${String(h).padStart(2, "0")}:00`;
  return (
    <Block title={t.heat} note={t.heatNote} id="heat">
      <HourHeat
        columns={columns}
        firstHour={7}
        counts={counts}
        hourLabel={(h) => String(hour(h))}
        cornerLabel={t.heatCorner}
        caption={t.heatCaption}
        summary={t.heatSummary}
        now={{ column: t.heatDays[4], minutes: 9 * 60 + 40 }}
        countLabel={t.heatCount}
      />
      <p className="u-kg-note">{t.heatRule}</p>
    </Block>
  );
}
