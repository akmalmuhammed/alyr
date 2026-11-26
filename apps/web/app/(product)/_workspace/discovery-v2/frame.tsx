"use client";

// The pieces the Checks, Answers, Proof and Set up screens share (workstream U2): the page frame
// (the `.d2` root and its column), the four tabs as a segmented control, a filter segmented
// control with counts, a status pill, an evidence chip that opens a hover card, and the still
// loading and error states. Styles in screens.css; tokens in tokens.css.

import { useId, type MouseEvent, type ReactNode } from "react";
import type { Evidence } from "../discoveryApi";
import { Mark } from "../shellParts";
import { T2 } from "./copy2";
import type { D2Lang } from "./copy";
import { Ic } from "./icons";
import { Ltr, day, dayTime } from "./parts";
import { bidiValue } from "./screens";
import "./tokens.css";
import "./discovery-v2.css";
import "./screens.css";

export type TabKey = "week" | "checks" | "answers" | "proof";
export const TAB_KEYS: readonly TabKey[] = ["week", "checks", "answers", "proof"];

/** The `.d2` root every screen draws in: language, direction and the page column. */
export function ScreenFrame({ lang, children, foot, wide = false, label }: { lang: D2Lang; children: ReactNode; foot?: ReactNode; wide?: boolean; label?: string }) {
  return (
    <div className="d2" data-lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} aria-label={label}>
      <div className={`d2-col${wide ? " d2s-col-wide" : ""}`}>{children}</div>
      {foot}
    </div>
  );
}

/** This week · Checks · Answers · Proof. Plain links (they open in a new tab too); a plain click
 * switches in place. The count on This week is the asks waiting. */
export function Tabs({ lang, current, waiting, hrefOf, onGo }: {
  lang: D2Lang;
  current: TabKey | null;
  waiting: number;
  hrefOf: (tab: TabKey) => string;
  onGo: (tab: TabKey) => void;
}) {
  const t = T2[lang];
  const click = (tab: TabKey) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onGo(tab);
  };
  return (
    <nav className="d2s-tabs" aria-label={t.tabsLabel}>
      {TAB_KEYS.map((tab) => (
        <a key={tab} href={hrefOf(tab)} aria-current={current === tab ? "page" : undefined} onClick={click(tab)}>
          {t.tabs[tab]}
          {tab === "week" && waiting > 0 ? <span className="d2s-n" data-tip={t.waitingTip(waiting)}>{waiting.toLocaleString("en")}</span> : null}
        </a>
      ))}
    </nav>
  );
}

/** A value the API sent (a chip's value, a before or after): Latin runs left to right, an Arabic
 * value in its own direction with its times and numbers held left to right. */
export function Val({ text }: { text: string }) {
  const v = bidiValue(text);
  return v.rtl ? <bdi>{v.text}</bdi> : <Ltr>{v.text}</Ltr>;
}

/** A segmented control of filters, each with its count; `aria-pressed` on the one shown. */
export function Filters<K extends string>({ label, items, value, onChange }: {
  label: string;
  items: readonly { key: K; label: string; count: number }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="d2s-filters" role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.key} type="button" aria-pressed={value === item.key} onClick={() => onChange(item.key)}>
          {item.label} <span className="d2s-n">{item.count.toLocaleString("en")}</span>
        </button>
      ))}
    </div>
  );
}

export type PillTone = "ok" | "warn" | "nm" | "plain";
/** A status in words with its dot: Matches, Differs, Not measured, Expired. */
export const StatePill = ({ tone, children }: { tone: PillTone; children: ReactNode }) => (
  <span className={`d2s-st d2s-st-${tone}`}>{children}</span>
);

/** The small mark of where a piece of evidence came from. TODO(A|B): the API sends `where` as
 * words only; with a `where_key` this would not read the words (api-gaps.md). */
export function SourceTile({ where }: { where: string }) {
  if (/ALYR/.test(where)) return <span className="d2s-src d2s-src-alyr" aria-hidden="true"><Mark /></span>;
  if (/Google/.test(where)) return <span className="d2s-src d2s-src-g" aria-hidden="true">G</span>;
  return <span className="d2s-src" aria-hidden="true"><Ic name="globe" size="xs" /></span>;
}

/** One piece of evidence: a chip that opens a hover card (on hover and on keyboard focus) saying
 * what it says, where it came from and when it was read. */
export function EvidenceChip({ ev, lang, open = false }: { ev: Evidence; lang: D2Lang; open?: boolean }) {
  const t = T2[lang];
  const id = useId();
  const when = ev.seen_at ? (ev.day_only ? t.evDay(day(ev.seen_at, lang)) : t.evRead(dayTime(ev.seen_at, lang))) : "";
  return (
    <span className={`d2s-hc-wrap${open ? " d2s-hc-open" : ""}`}>
      <button className="d2s-ev" type="button" aria-describedby={id}>
        <SourceTile where={ev.where} />
        <span className="d2s-ev-k">{ev.label}</span> <b><Val text={ev.value} /></b>
      </button>
      <span className="d2s-hc" role="tooltip" id={id}>
        <span className="d2s-hc-k"><SourceTile where={ev.where} />{ev.where}</span>
        <span className="d2s-hc-v"><Val text={ev.value} /></span>
        <span className="d2s-hc-d">{ev.label}</span>
        {when ? <span className="d2s-hc-s"><Ic name="clock" size="xs" />{when}</span> : null}
      </span>
    </span>
  );
}

/** A still skeleton (no shimmer loop): the brief and two groups of rows. */
export function LoadingScreen({ lang, tabs }: { lang: D2Lang; tabs?: ReactNode }) {
  return (
    <ScreenFrame lang={lang}>
      {tabs}
      <div className="d2-brief" role="status" aria-label={T2[lang].loading}>
        <h1 className="d2-sr">{T2[lang].loading}</h1>
        <span className="d2-skel d2-skel-title" />
        <span className="d2-skel d2-skel-line" />
      </div>
      <SkeletonGroups />
    </ScreenFrame>
  );
}

export function SkeletonGroups() {
  return (
    <div aria-hidden="true">
      {[4, 2].map((rows, g) => (
        <div className="d2s-group" key={g}>
          <div className="d2s-group-head"><span className="d2-skel d2s-skel-h" /><span className="d2-skel d2s-skel-m" /></div>
          <ul className="d2s-card d2s-list">
            {Array.from({ length: rows }, (_, i) => (
              <li className="d2s-skrow" key={i}><span className="d2-skel d2s-skel-c" /><span className="d2s-sklines"><span className="d2-skel d2s-skel-l" /><span className="d2-skel d2s-skel-s" /></span><span className="d2-skel d2s-skel-p" /></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ErrorScreen({ lang, message, onRetry, tabs }: { lang: D2Lang; message: string; onRetry: () => void; tabs?: ReactNode }) {
  const t = T2[lang];
  return (
    <ScreenFrame lang={lang}>
      {tabs}
      <section className="d2-brief" role="alert">
        <h1 className="d2-display">{t.errorTitle}</h1>
        <p className="d2-sub">{message || t.errorBody}</p>
        <div className="d2s-actions"><button className="d2-btn d2-btn-line" type="button" onClick={onRetry}>{t.retry}</button></div>
      </section>
    </ScreenFrame>
  );
}
