"use client";

// Documents in the workspace (ALY-146, spec 014): receipts, invoices and the rest. The list is
// newest first with search, filters, a total line and a cursor, so a shop with thousands of
// documents opens it as fast as a shop with ten. One document opens beside it, a draft is
// written by hand, and the settings (owners and admins) sit one tap away. Phone first: built
// for 375 px, with 44 px targets and no sideways scrolling, and it is the same screen on a
// laptop. The shell calls this for `/app/documents`; a card on the home screen opens it with
// `?show=unpaid_invoices` or `?show=not_delivered`, which fill the filters exactly as the
// card counted.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, sayRefusal, type Branch, type ListAnswer, type Meta, type Row, type Totals,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import {
  NO_FILTERS, activeFilterCount, dateText, deliveryPill, filtersToQuery, moneyState, orderedDates,
  presetFilters, written, type Filters,
} from "./documentsLogic";
import { Announce, Fold, Icon, ToastLayer, useToasts } from "./CatalogUi";
import { DocumentEdit } from "./DocumentEdit";
import { DocumentSettings } from "./DocumentSettings";
import { DocumentView } from "./DocumentView";
import "./documents.css";

type Route =
  | { view: "list" }
  | { view: "doc"; id: string }
  | { view: "edit"; id: string | null; kind: string }
  | { view: "settings"; focus: string };

function readRoute(search: string): Route {
  const p = new URLSearchParams(search);
  const d = p.get("d");
  if (d) return { view: "doc", id: d };
  const edit = p.get("edit");
  if (edit) return { view: "edit", id: edit === "new" ? null : edit, kind: p.get("kind") ?? "invoice" };
  if (p.get("view") === "settings") return { view: "settings", focus: p.get("focus") ?? "" };
  return { view: "list" };
}

function routeQuery(route: Route, keep: URLSearchParams): string {
  const p = new URLSearchParams();
  const show = keep.get("show");
  if (route.view === "list" && show) p.set("show", show);
  if (route.view === "doc") p.set("d", route.id);
  if (route.view === "edit") { p.set("edit", route.id ?? "new"); if (route.kind) p.set("kind", route.kind); }
  if (route.view === "settings") { p.set("view", "settings"); if (route.focus) p.set("focus", route.focus); }
  const text = p.toString();
  return text ? `?${text}` : "";
}

const PAGE = 40;
const PAYMENTS = ["paid", "part", "unpaid"] as const;
const STATUSES = ["draft", "issued", "cancelled"] as const;
const DELIVERIES = ["none", "queued", "sent", "delivered", "not_delivered"] as const;
const KIND_ORDER = ["receipt", "invoice", "quote", "delivery_note", "proforma", "deposit_receipt", "statement", "credit_note"];

export function Documents({ lang, title, show = null }: { lang: Lang; title: string; show?: string | null }) {
  const t = COPY[lang];
  const { toasts, push, dismiss, clear } = useToasts();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [route, setRoute] = useState<Route>(() => (typeof window === "undefined" ? { view: "list" } : readRoute(window.location.search)));
  const fallback = useMemo(() => ({ failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone }), [t]);

  // The address carries the screen (`?d=<id>`, `?edit=new`, `?view=settings`), so Back works
  // and a link opens the right place.
  const go = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const keep = new URLSearchParams(window.location.search);
    const url = `${window.location.pathname}${routeQuery(next, keep)}`;
    if (options.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setRoute(next);
    clear();
    window.scrollTo?.({ top: 0 });
    document.querySelector(".sh-scroll")?.scrollTo?.({ top: 0 });
  }, [clear]);
  useEffect(() => {
    const onPop = () => setRoute(readRoute(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const found = await api<Meta>("/api/documents/meta");
      setMeta(found);
      setMetaError("");
    } catch (error) {
      setMetaError(sayRefusal(error, lang, fallback));
    }
    api<{ branches: Branch[] }>("/api/documents/branches").then((b) => setBranches(b.branches)).catch(() => undefined);
  }, [lang, fallback]);
  useEffect(() => {
    const first = setTimeout(() => void loadMeta(), 0);
    return () => clearTimeout(first);
  }, [loadMeta]);

  const [refresh, setRefresh] = useState(0);
  const changed = useCallback(() => setRefresh((n) => n + 1), []);

  if (metaError) return <div className="ct dc" lang={lang}><p className="ct-alert" role="alert"><Icon name="warn" />{metaError}</p></div>;
  if (!meta) return <div className="ct dc" lang={lang}><p className="ct-quiet ct-pad" role="status">{t.loading}</p></div>;

  const openDoc = (id: string) => go({ view: "doc", id });
  const toList = () => go({ view: "list" });
  let body: React.ReactNode;
  if (route.view === "doc") {
    body = <DocumentView key={route.id} lang={lang} meta={meta} id={route.id} push={push} onBack={() => (window.history.length > 1 ? window.history.back() : toList())}
      onOpen={openDoc} onEdit={(id) => go({ view: "edit", id, kind: "" })} onSettings={(field) => go({ view: "settings", focus: field })} onChanged={changed} />;
  } else if (route.view === "edit") {
    body = <DocumentEdit key={route.id ?? "new"} lang={lang} meta={meta} branches={branches} id={route.id} startKind={route.kind} push={push}
      onBack={() => (window.history.length > 1 ? window.history.back() : toList())}
      onSaved={(id) => { changed(); go({ view: "doc", id }, { replace: true }); }} onSettings={(field) => go({ view: "settings", focus: field })} />;
  } else if (route.view === "settings" && meta.access.can_manage) {
    body = <DocumentSettings lang={lang} meta={meta} branches={branches} push={push} focus={route.focus}
      onBack={() => (window.history.length > 1 ? window.history.back() : toList())} onBranches={() => void loadMeta()} />;
  } else {
    body = <List lang={lang} meta={meta} branches={branches} title={title} show={show} refresh={refresh} push={push}
      onOpen={openDoc} onNew={() => go({ view: "edit", id: null, kind: "invoice" })} onSettings={() => go({ view: "settings", focus: "" })} />;
  }
  return (
    <>
      {body}
      <ToastLayer toasts={toasts} dismiss={dismiss} lang={lang} undoWord={t.undo} dismissWord={t.dismiss} />
    </>
  );
}

// ── the list ────────────────────────────────────────────

function List({ lang, meta, branches, title, show, refresh, push, onOpen, onNew, onSettings }: {
  lang: Lang; meta: Meta; branches: Branch[]; title: string; show: string | null; refresh: number;
  push: (text: string, options?: { tone?: "ok" | "bad" }) => number; onOpen: (id: string) => void; onNew: () => void; onSettings: () => void;
}) {
  const t = COPY[lang];
  const initial = useMemo(() => presetFilters(show ?? (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("show"))), [show]);
  const [filters, setFilters] = useState<Filters>(initial ?? NO_FILTERS);
  const [preset, setPreset] = useState<string | null>(initial ? (show ?? new URLSearchParams(window.location.search).get("show")) : null);
  const [typed, setTyped] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const asked = useRef(0);
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };

  // The search waits for a pause in typing.
  useEffect(() => {
    const wait = setTimeout(() => setFilters((f) => (f.q === typed.trim() ? f : { ...f, q: typed.trim() })), 250);
    return () => clearTimeout(wait);
  }, [typed]);

  const query = useMemo(() => filtersToQuery(filters).toString(), [filters]);
  const load = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const answer = await api<ListAnswer>(`/api/documents?${query}${query ? "&" : ""}limit=${PAGE}`);
      if (mine !== asked.current) return;
      setRows(answer.documents);
      setCursor(answer.next_cursor);
      setTotals(answer.totals ?? null);
      setLoaded(true);
      setOffline(false);
    } catch (error) {
      if (mine !== asked.current) return;
      if (sayRefusal(error, lang, fallback) === t.offline) setOffline(true);
      else push(sayRefusal(error, lang, fallback), { tone: "bad" });
    }
    // `fallback` and `push` do not change what a load asks for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lang, t]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load, refresh]);

  // A colleague's document (or a delivery that arrived) shows up without reloading: look again
  // now and then, but only while one page is showing, so nothing the person loaded moves.
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible" && !cursor) void load(); };
    const timer = setInterval(again, 20_000);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, [load, cursor]);

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const answer = await api<ListAnswer>(`/api/documents?${query}${query ? "&" : ""}limit=${PAGE}&cursor=${encodeURIComponent(cursor)}`);
      setRows((cur) => [...cur, ...answer.documents.filter((d) => !cur.some((c) => c.id === d.id))]);
      setCursor(answer.next_cursor);
    } catch (error) {
      push(sayRefusal(error, lang, fallback), { tone: "bad" });
    } finally {
      setMore(false);
    }
  }

  function change(patch: Partial<Filters>) {
    setPreset(null);
    setFilters((cur) => ({ ...cur, ...patch }));
  }
  function clearAll() {
    setTyped("");
    setPreset(null);
    setFilters(NO_FILTERS);
    // The card's `?show=` goes from the address too, so a reload shows everything.
    const url = new URL(window.location.href);
    if (url.searchParams.has("show")) { url.searchParams.delete("show"); window.history.replaceState(null, "", url.toString()); }
  }

  const filterCount = activeFilterCount(filters);
  const filtered = filterCount > 0 || filters.q !== "";
  const empty = loaded && rows.length === 0 && !filtered;
  const dates = orderedDates(filters.from, filters.to);
  const kindsOffered = KIND_ORDER.filter((k) => meta.kinds.some((x) => x.key === k) || k === "credit_note");
  const activeBranches = branches.filter((b) => b.active);
  const singleKind = ["receipt", "invoice", "deposit_receipt"].includes(filters.kind);
  const money = totals?.money[0];
  const fmt = (minor: number, code: string, exponent: number) => written(minor, code, exponent, meta.currencies[code]?.symbol_ar ?? code, lang);

  return (
    <div className="ct dc" lang={lang}>
      <header className="sh-head">
        <span className="sh-eyebrow">{totals ? t.count(totals.count) : " "}</span>
        <h1>{title}</h1>
        <p>{t.sub}</p>
      </header>

      {offline && (
        <div className="ct-banner bad" role="status">
          <span>{t.offline}</span>
          <button type="button" className="btn small" onClick={() => void load()}>{t.retry}</button>
        </div>
      )}

      <div className="ct-actions">
        <button type="button" className="btn volt ct-btn" onClick={onNew}><Icon name="plus" />{t.newDocument}</button>
        <span className="ct-grow" />
        {meta.access.can_manage && (
          <button type="button" className="btn ghost ct-btn" onClick={onSettings}><Icon name="sliders" />{t.settings}</button>
        )}
      </div>

      {preset && (
        <div className="ct-banner" role="note">
          <span><b>{preset === "unpaid_invoices" ? t.presetUnpaid : t.presetNotDelivered}</b> {t.presetHint}</span>
          <button type="button" className="btn small" onClick={clearAll}>{t.clearFilters}</button>
        </div>
      )}

      {!empty && (
        <div className="ct-tools">
          <label className="ct-search">
            <Icon name="search" />
            <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.search} aria-label={t.search}
              dir="auto" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
          <Fold title={t.filters} summary={filterCount ? t.filtersOn(filterCount) : undefined} open={filterCount > 0 ? true : undefined}>
            <div className="dc-filters">
              <label className="ct-field">
                <span className="ct-label">{t.kind}</span>
                <select className="ct-select" value={filters.kind} onChange={(e) => change({ kind: e.target.value })}>
                  <option value="">{t.allKinds}</option>
                  {kindsOffered.map((k) => <option key={k} value={k}>{kindLabel(lang, k)}</option>)}
                </select>
              </label>
              <label className="ct-field">
                <span className="ct-label">{t.status}</span>
                <select className="ct-select" value={filters.status} onChange={(e) => change({ status: e.target.value })}>
                  <option value="">{t.allStatuses}</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{t.statuses[s]}</option>)}
                </select>
              </label>
              <fieldset className="ct-field dc-chipset">
                <legend className="ct-label">{t.paymentLabel}</legend>
                <div className="ct-chips" role="group">
                  {PAYMENTS.map((p) => {
                    const on = filters.payment.includes(p);
                    return (
                      <button key={p} type="button" className="ct-chip" aria-pressed={on}
                        onClick={() => change({ payment: on ? filters.payment.filter((x) => x !== p) : [...filters.payment, p] })}>
                        {on && <Icon name="check" className="sh-ico ct-chip-tick" />}{t.money[p]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="ct-field">
                <span className="ct-label">{t.deliveryLabel}</span>
                <select className="ct-select" value={filters.delivery} onChange={(e) => change({ delivery: e.target.value })}>
                  <option value="">{t.anyDelivery}</option>
                  {DELIVERIES.map((d) => <option key={d} value={d}>{t.delivery[d]}</option>)}
                </select>
              </label>
              {activeBranches.length > 1 && (
                <label className="ct-field">
                  <span className="ct-label">{t.branchLabel}</span>
                  <select className="ct-select" value={filters.branch} onChange={(e) => change({ branch: e.target.value })}>
                    <option value="">{t.allBranches}</option>
                    {branches.map((b) => <option key={b.branch_key} value={b.branch_key}>{b.branch_key === "main" ? t.branchMain : (lang === "ar" && b.name_ar ? b.name_ar : b.name) || b.branch_key}</option>)}
                  </select>
                </label>
              )}
              <label className="ct-field">
                <span className="ct-label">{t.dateFrom}</span>
                <input className="ct-select" type="date" dir="ltr" value={dates.from} onChange={(e) => change({ from: e.target.value })} />
              </label>
              <label className="ct-field">
                <span className="ct-label">{t.dateTo}</span>
                <input className="ct-select" type="date" dir="ltr" value={dates.to} onChange={(e) => change({ to: e.target.value })} />
              </label>
            </div>
            {filterCount > 0 && <button type="button" className="btn small" onClick={clearAll}>{t.clearFilters}</button>}
          </Fold>
        </div>
      )}

      {totals && !empty && (
        <p className="dc-totalsline num" role="status">
          <b>{t.totalsLine(totals.count)}</b>
          {money && singleKind && money.total_minor > 0 && <> · {t.totalOf} <bdi>{fmt(money.total_minor, money.currency, money.exponent)}</bdi></>}
          {money && money.owing_minor > 0 && <> · {t.owingOf} <bdi>{fmt(money.owing_minor, money.currency, money.exponent)}</bdi></>}
          {money && filters.kind === "credit_note" && money.credited_minor > 0 && <> · {t.creditedOf} <bdi>{fmt(money.credited_minor, money.currency, money.exponent)}</bdi></>}
        </p>
      )}
      <Announce text={loaded ? t.announce(rows.length) : ""} />

      {!loaded && !offline && <p className="ct-quiet ct-pad" role="status">{t.loading}</p>}

      {empty && (
        <section className="sh-tile raised folded ct-empty">
          <span className="sh-glyph"><Icon name="doc" /></span>
          <h2>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <button type="button" className="btn volt ct-btn" onClick={onNew}><Icon name="plus" />{t.newDocument}</button>
        </section>
      )}

      {loaded && !empty && rows.length === 0 && (
        <div className="empty-note ct-none">
          <p>{t.nothingFound}</p>
          <button type="button" className="btn small" onClick={clearAll}>{t.clearFilters}</button>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="dc-list">
          {rows.map((r) => <RowItem key={r.id} r={r} lang={lang} meta={meta} onOpen={onOpen} />)}
        </ul>
      )}

      {cursor && (
        <button type="button" className="btn ct-more" disabled={more} onClick={() => void loadMore()}>{more ? t.loadingMore : t.showMore}</button>
      )}
    </div>
  );
}

function RowItem({ r, lang, meta, onOpen }: { r: Row; lang: Lang; meta: Meta; onOpen: (id: string) => void }) {
  const t = COPY[lang];
  const kind = kindLabel(lang, r.kind);
  const who = (lang === "ar" ? r.customer_name_ar || r.customer_name : r.customer_name || r.customer_name_ar) || "";
  const state = moneyState({ kind: r.kind, status: r.status, total_minor: r.total_minor, paid_minor: r.paid_minor, balance_minor: r.balance_minor });
  const delivery = deliveryPill(r.status, r.delivery.state);
  const amount = written(r.total_minor, r.currency, r.currency_exponent, meta.currencies[r.currency]?.symbol_ar ?? r.currency, lang);
  const owed = r.balance_minor > 0 && state && state !== "paid";
  return (
    <li className="dc-item">
      <button type="button" className="dc-row" onClick={() => onOpen(r.id)}>
        <span className="dc-row-main">
          <span className="dc-row-top">
            {r.number
              ? <><b className="dc-row-number" dir="ltr"><bdi>{r.number}</bdi></b><span className="ct-quiet">{kind}</span></>
              : <b className="dc-row-kind">{kind}</b>}
          </span>
          <span className="dc-row-who" dir="auto">{who || (r.kind === "credit_note" && r.related_number ? t.creditFor(r.related_number) : t.noName)}</span>
          <span className="ct-quiet dc-row-date">
            {r.issue_date ? <bdi>{dateText(r.issue_date, lang)}</bdi> : <bdi>{dateText(r.created_at, lang)}</bdi>}
            {who && r.kind === "credit_note" && r.related_number ? <> · <bdi dir="auto">{t.creditFor(r.related_number)}</bdi></> : null}
          </span>
        </span>
        <span className="dc-row-end">
          <b className="num dc-row-amount"><bdi>{amount}</bdi></b>
          {owed && <span className="num dc-row-owed">{t.balance} <bdi>{written(r.balance_minor, r.currency, r.currency_exponent, meta.currencies[r.currency]?.symbol_ar ?? r.currency, lang)}</bdi></span>}
          <span className="dc-pills">
            {r.status !== "issued" && <span className={`sh-pill dc-pill ${r.status === "void" ? "bad" : "wait"}`}>{t.statuses[r.status]}</span>}
            {state && <span className={`sh-pill dc-pill ${state === "paid" ? "active" : state === "part" ? "wait" : "bad"}`}>{t.money[state]}</span>}
            {delivery && <span className={`sh-pill dc-pill ${delivery === "not_delivered" ? "bad" : delivery === "delivered" ? "active" : "quiet"}`}>{t.delivery[delivery]}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
