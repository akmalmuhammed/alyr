"use client";

// The small parts the Discovery screens share (ALY-322): the loader, a refusal, a finding's row,
// a rating, a time. They take the workspace's own parts (`Icon`, the sheet and the toasts of
// `CatalogUi.tsx`) and hold no words: every sentence comes from `discoveryCopy.ts`.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./CatalogUi";
import { T, type Lang } from "./discoveryCopy";
import type { DiscoveryError, Finding } from "./discoveryApi";
import { formatDay, formatWhen, sayError } from "./discoveryLogic";

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
  return (
    <li className="dv-item">
      <button type="button" className="dv-row" onClick={() => onOpen(f.id)}>
        <span className="dv-row-main">
          <span className="dv-row-title"><bdi dir="auto">{f.title}</bdi></span>
          <FindingMeta f={f} lang={lang} />
        </span>
        <span className="dv-row-end">
          {status && <span className={`sh-pill dv-pill ${f.status === "verified" || f.status === "gone" ? "active" : f.status === "owner_done" ? "wait" : "quiet"}`}>{t.statusWord[f.status]}</span>}
          <Icon name="end" className="sh-ico ct-flip dv-chev" />
        </span>
      </button>
    </li>
  );
}
