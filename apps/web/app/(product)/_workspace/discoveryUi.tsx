"use client";

// The small parts the Discovery screens share (ALY-322, ALY-324): the loader, a refusal, a finding's
// row, a proposal's row, the evidence, a change drawn as its exact before and after, a rating, a
// time. They take the workspace's own parts (`Icon`, the sheet and the toasts of `CatalogUi.tsx`)
// and hold no words: every sentence comes from `discoveryCopy.ts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./CatalogUi";
import { T, type Lang } from "./discoveryCopy";
import type { DiscoveryError, Evidence, Finding, Proposal } from "./discoveryApi";
import { appliedNoteKey, formatDay, formatWhen, isNumeric, proposalPillClass, proposalWhen, sayError, waitingProposals } from "./discoveryLogic";

// ── loading ─────────────────────────────────────────────

export type Loaded<T> = { data: T | null; error: DiscoveryError | Error | null; loading: boolean };

/**
 * Asks once when `key` changes (a language, a filter) and again on `reload()`. A newer question
 * is the only one answered: a slow answer to an older one is dropped. A reload that fails keeps
 * what was on screen and reports the failure, so a hiccup never empties a list.
 */
export function useLoad<A>(fetcher: () => Promise<A>, key: string): [Loaded<A>, (quiet?: boolean) => Promise<A | null>] {
  const [state, setState] = useState<Loaded<A>>({ data: null, error: null, loading: true });
  const latest = useRef(fetcher);
  useEffect(() => { latest.current = fetcher; });
  const asked = useRef(0);
  const reload = useCallback(async (quiet = false): Promise<A | null> => {
    const mine = ++asked.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await latest.current();
      if (mine === asked.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (mine === asked.current) setState((s) => ({ data: s.data, error: error as Error, loading: false }));
      return null;
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    return () => { clearTimeout(first); asked.current += 1; };
  }, [key, reload]);
  return [state, reload];
}

// ── a refusal, in words ─────────────────────────────────

export function Problem({ lang, error, onRetry }: { lang: Lang; error: unknown; onRetry?: () => void }) {
  const t = T[lang];
  return (
    <div className="dv-problem">
      <p className="ct-alert" role="alert"><Icon name="warn" />{sayError(error, lang)}</p>
      {onRetry && <button type="button" className="btn ct-btn" onClick={onRetry}><Icon name="retry" />{t.retry}</button>}
    </div>
  );
}

export function Loading({ lang }: { lang: Lang }) {
  return <p className="ct-quiet ct-pad" role="status">{T[lang].loading}</p>;
}

// ── a time, a place, a rating ───────────────────────────

/** A time in the shop's clock, with Western digits; its own direction so Arabic does not reorder it. */
export function When({ iso, lang, day = false }: { iso: string | null; lang: Lang; day?: boolean }) {
  const text = day ? formatDay(iso, lang) : formatWhen(iso, lang);
  if (!text) return null;
  return <bdi>{text}</bdi>;
}

const STAR = "M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5L12 16.3 7 19l1.1-5.5L4 9.7 9.6 9z";

/** Five stars, `rating` of them filled, with the number said for a screen reader. */
export function Stars({ rating, lang }: { rating: number; lang: Lang }) {
  return (
    <span className="dv-stars" role="img" aria-label={T[lang].ratingSr(rating)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={n <= rating ? "on" : ""} aria-hidden="true"><path d={STAR} /></svg>
      ))}
    </span>
  );
}

// ── a finding as a row ──────────────────────────────────

/** The place and the priority of a finding, in the quiet line under its title. */
export function FindingMeta({ f, lang }: { f: Finding; lang: Lang }) {
  const t = T[lang];
  return (
    <span className="dv-meta-line">
      <span>{f.location?.name ?? t.wholeBusiness}</span>
      <span className={`dv-sev ${f.severity}`}>{t.severityLabel}: {t.severity[f.severity]}</span>
    </span>
  );
}

export function FindingRow({ f, lang, onOpen, status = false }: { f: Finding; lang: Lang; onOpen: (id: string) => void; status?: boolean }) {
  const t = T[lang];
  // A change ready to approve says so in words; an applied one says whether a check-up has confirmed it.
  const ready = f.proposals_waiting > 0 || waitingProposals(f).length > 0;
  const applied = appliedNoteKey(f);
  return (
    <li className="dv-item">
      <button type="button" className="dv-row" onClick={() => onOpen(f.id)}>
        <span className="dv-row-main">
          <span className="dv-row-title"><bdi dir="auto">{f.title}</bdi></span>
          <FindingMeta f={f} lang={lang} />
          {ready && <span className="dv-tag">{t.changeReady}</span>}
          {applied && <span className="dv-applied-note">{t.appliedNote[applied]}</span>}
        </span>
        <span className="dv-row-end">
          {status && <span className={`sh-pill dv-pill ${f.status === "verified" || f.status === "gone" ? "active" : f.status === "owner_done" ? "wait" : "quiet"}`}>{t.statusWord[f.status]}</span>}
          <Icon name="end" className="sh-ico ct-flip dv-chev" />
        </span>
      </button>
    </li>
  );
}

// ── the evidence a finding or a change stands on ────────

/** What was seen, where and when. Text only: it comes from the business's own public pages. */
export function EvidenceList({ items, lang }: { items: Evidence[]; lang: Lang }) {
  return (
    <ul className="dv-evidence">
      {items.map((e, i) => (
        <li key={i}>
          <span className="dv-ev-label">{e.label}</span>
          <span className="dv-ev-value"><bdi dir={isNumeric(e.value) ? "ltr" : "auto"}>{e.value}</bdi></span>
          <span className="dv-ev-where">{e.where}{e.seen_at && <> · <When iso={e.seen_at} lang={lang} /></>}</span>
        </li>
      ))}
    </ul>
  );
}

// ── a change, drawn as the exact before and after ───────

/**
 * What is there now, and what would be there. The words are the API's own `text` and `lines`, the
 * same ones WhatsApp sends, so the two cannot disagree. Hours are seven rows in two columns; every
 * other change is one line each. Each value is isolated (`bdi`) so a number or a name keeps its direction.
 */
export function BeforeAfter({ p, lang }: { p: Pick<Proposal, "before" | "after" | "field_label">; lang: Lang }) {
  const t = T[lang];
  if (p.after.lines.length === 0) {
    return (
      <dl className="dv-ba">
        <div className="dv-ba-now"><dt>{t.nowLabel}</dt><dd><bdi dir="auto">{p.before.text}</bdi></dd></div>
        <div className="dv-ba-new"><dt>{t.proposedLabel}</dt><dd><bdi dir="auto">{p.after.text}</bdi></dd></div>
      </dl>
    );
  }
  const before = new Map(p.before.lines.map((l) => [l.day, l.text]));
  const oneBlock = p.before.lines.length === 0;
  return (
    <table className="dv-hours">
      <caption className="ct-sr">{p.field_label}</caption>
      <thead>
        <tr><th scope="col">{t.dayHeader}</th><th scope="col">{t.nowLabel}</th><th scope="col">{t.proposedLabel}</th></tr>
      </thead>
      <tbody>
        {p.after.lines.map((line, i) => (
          <tr key={line.day}>
            <th scope="row">{t.daysLong[line.day]}</th>
            {oneBlock ? (i === 0 && <td rowSpan={p.after.lines.length} className="dv-hours-none"><bdi dir="auto">{p.before.text}</bdi></td>)
              : <td><bdi dir="auto">{before.get(line.day) ?? t.noneText}</bdi></td>}
            <td className="dv-hours-new"><bdi dir="auto">{line.text}</bdi></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The change as one line: now, an arrow that turns with the language, then what is proposed. */
export function ChangeLine({ p, lang }: { p: Pick<Proposal, "before" | "after">; lang: Lang }) {
  const t = T[lang];
  return (
    <span className="dv-change-line">
      <span className="ct-sr">{t.nowLabel}: </span>
      <bdi dir="auto" className="dv-was">{p.before.text}</bdi>
      <Icon name="end" className="sh-ico ct-flip dv-to" />
      <span className="ct-sr">{t.proposedLabel}: </span>
      <bdi dir="auto" className="dv-will">{p.after.text}</bdi>
    </span>
  );
}

// ── a proposal as a row ─────────────────────────────────

export function ProposalRow({ p, lang, onOpen }: { p: Proposal; lang: Lang; onOpen: (id: string) => void }) {
  const t = T[lang];
  const date = proposalWhen(p, lang);
  return (
    <li className="dv-item">
      <button type="button" className="dv-row dv-prow" onClick={() => onOpen(p.id)}>
        <span className="dv-row-main">
          <span className="dv-row-title"><bdi dir="auto">{p.field_label}</bdi></span>
          <span className="dv-meta-line">
            <span>{p.location?.name ?? t.wholeBusiness}</span>
            <span className={`sh-pill dv-pill ${proposalPillClass(p.status)}`}>{t.proposalStatus[p.status]}</span>
          </span>
          <ChangeLine p={p} lang={lang} />
          {date && <span className="dv-when ct-quiet">{t.rowWhen(p.status, date)}</span>}
        </span>
        <span className="dv-row-end"><Icon name="end" className="sh-ico ct-flip dv-chev" /></span>
      </button>
    </li>
  );
}

// ── telling the menu that a change moved ────────────────

/** A change was approved, declined, undone or prepared: whoever shows a waiting count asks again. */
export const CHANGED_EVENT = "alyr-discovery-changed";
export function announceChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

// ── tabs, moved by the arrow keys the way the page reads ─

export function TabBar<K extends string>({ keys, words, value, onChange, label, idPrefix = "dv" }: {
  keys: readonly K[]; words: Record<K, string>; value: K; onChange: (key: K) => void; label: string; idPrefix?: string;
}) {
  return (
    <div className="ct-tabs" role="tablist" aria-label={label}>
      {keys.map((key) => (
        <button key={key} type="button" role="tab" id={`${idPrefix}-tab-${key}`} aria-selected={value === key} aria-controls={`${idPrefix}-panel-${key}`}
          tabIndex={value === key ? 0 : -1} onClick={() => onChange(key)}
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            // The arrows follow the reading direction: the tab bar is mirrored with the page.
            const dir = (e.currentTarget.closest("[dir]") as HTMLElement | null)?.dir === "rtl" ? -step : step;
            const next = keys[(keys.indexOf(key) + dir + keys.length) % keys.length];
            onChange(next);
            requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next}`)?.focus());
          }}>
          {words[key]}
        </button>
      ))}
    </div>
  );
}
