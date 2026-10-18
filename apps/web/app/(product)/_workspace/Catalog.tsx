"use client";

// The Catalog in the workspace (D-039, ALY-104): the owner's items as photos or a compact
// list, with search, filters, a switch on every row, bulk actions and the Stock tab. The
// forms live in their own files. Phone first: everything here is built for 375 px, with big
// targets and no sideways scrolling, and it is the same screen on a laptop.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, nameOf, sayError, type Access, type BulkLast, type Category, type Item, type ListResult,
} from "./catalogApi";
import { COPY, type Copy, type Lang } from "./catalogCopy";
import { Announce, Icon, Layer, Switch, Tile, ToastLayer, useToasts } from "./CatalogUi";
import { CatalogEdit } from "./CatalogEdit";
import { AddSheet, WalkThrough } from "./CatalogAdd";
import { CatalogBulk } from "./CatalogBulk";
import { CatalogSettings } from "./CatalogSettings";
import { CatalogStock } from "./CatalogStock";

type Sheet =
  | null
  | { kind: "edit"; id: string | null }
  | { kind: "add" }
  | { kind: "walk"; ids: string[] }
  | { kind: "bulk" }
  | { kind: "settings" };

const PAGE = 60;
const FILTERS = ["all", "draft", "sold_out", "low_stock", "archived"] as const;
const SCHEDULE_REASONS = ["not_now", "closed", "after_cutoff", "not_that_day", "past"];
const VIEW_KEY = "alyr-catalog-view";

function categoryName(category: Category, lang: Lang) {
  return lang === "ar" && category.name_ar ? category.name_ar : category.name;
}

/** What to say about an item beside its name: why it cannot be ordered, or how many are left. */
function statusLine(item: Item, t: Copy, lowAt: number) {
  const pills: { text: string; tone: "" | "bad" | "wait" | "quiet" }[] = [];
  if (item.status !== "live") pills.push({ text: t.status[item.status], tone: "quiet" });
  else if (item.availability.reason === "off") pills.push({ text: t.soldOut, tone: "bad" });
  else if (item.availability.reason === "sold_out") pills.push({ text: t.noneLeft, tone: "bad" });
  else if (SCHEDULE_REASONS.includes(item.availability.reason)) pills.push({ text: t.notNow, tone: "quiet" });
  const left = item.availability.left;
  if (item.status === "live" && left !== null && left > 0 && item.availability.reason === "") {
    const low = item.stock_rule === "count" && item.variants.some((v) => v.active && v.on_hand > 0 && v.on_hand <= lowAt);
    const text = item.stock_rule === "daily_limit" ? t.leftToday(left) : t.left(left);
    pills.push({ text, tone: low ? "wait" : "quiet" });
  }
  return pills;
}

function priceLine(item: Item) {
  if (item.price <= 0) return null;
  return item.sale_active
    ? <><b className="num" dir="ltr">{item.current_price_text}</b> <s className="num" dir="ltr">{item.price_text}</s></>
    : <b className="num" dir="ltr">{item.price_text}</b>;
}

export function Catalog({ lang }: { lang: Lang }) {
  const t = COPY[lang];
  const { toasts, push, dismiss, clear } = useToasts();
  const [tab, setTab] = useState<"items" | "stock">("items");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<ListResult | null>(null);
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<BulkLast | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const asked = useRef(0);
  const sheetOpen = sheet !== null;
  // A message about the list should not sit over a form that has just opened.
  useEffect(() => { if (sheetOpen || selecting) clear(); }, [sheetOpen, selecting, clear]);

  // How the person likes to look at the list is remembered on this device only.
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved === "grid" || saved === "list") setView(saved);
      } catch {
        // A browser that refuses storage just starts with photos.
      }
    }, 0);
    return () => clearTimeout(read);
  }, []);
  function chooseView(next: "grid" | "list") {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* not remembered */ }
  }

  // The search waits for a pause in typing.
  useEffect(() => {
    const wait = setTimeout(() => { setQuery(typed.trim()); setLimit(PAGE); }, 250);
    return () => clearTimeout(wait);
  }, [typed]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (filter !== "all") p.set("filter", filter);
    if (category !== null) p.set("category", category);
    p.set("limit", String(limit));
    return p.toString();
  }, [query, filter, category, limit]);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const [list, again] = await Promise.all([
        api<ListResult>(`/api/items?${params}`),
        api<{ last: BulkLast | null }>("/api/items/bulk/last"),
      ]);
      if (mine !== asked.current) return; // a newer question is on its way
      setData(list);
      setLast(again.last);
      setOffline(false);
    } catch {
      if (mine === asked.current) setOffline(true);
    }
  }, [params]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  // A colleague's change shows up without anyone reloading: look again now and then, while
  // the person is not in the middle of a form.
  useEffect(() => {
    if (sheetOpen) return;
    const again = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(again, 20_000);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, [load, sheetOpen]);

  const access: Access = data?.access ?? { role: "agent", can_manage: false, can_edit: false, can_stock: true };
  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts;
  const lowAt = data?.low_stock_at ?? 5;
  const categories = useMemo(() => data?.categories ?? [], [data]);

  // Pruned when a picked item leaves the list.
  const shownIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const pickedNow = useMemo(() => Array.from(picked).filter((id) => shownIds.has(id)), [picked, shownIds]);

  async function flip(item: Item, next: boolean) {
    if (busy.has(item.id)) return;
    setBusy((b) => new Set(b).add(item.id));
    // Show the switch moving at once; put it back if the API says no.
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, available: next } : i)) });
    try {
      await api(`/api/items/${item.id}/switch`, "POST", { available: next });
      const name = nameOf(item, lang) || t.untitled;
      push(next ? t.toastBack(name) : t.toastSoldOut(name), {
        undo: () => { void flip({ ...item, available: next }, !next); },
      });
      await load();
    } catch (error) {
      setData((d) => d && { ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, available: item.available } : i)) });
      push(sayError(error, lang, t), { tone: "bad" });
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(item.id); return n; });
    }
  }

  async function undoBulk() {
    try {
      const done = await api<{ restored: number; left: unknown[] }>("/api/items/bulk/undo", "POST");
      push(done.left.length ? `${t.undone(done.restored)}. ${t.undoLeft(done.left.length)}` : t.undone(done.restored));
    } catch (error) {
      push(sayError(error, lang, t), { tone: "bad" });
    }
    await load();
  }

  function togglePick(id: string) {
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function stopSelecting() { setSelecting(false); setPicked(new Set()); }

  const filtered = filter !== "all" || query !== "" || category !== null;
  const empty = data !== null && counts !== undefined && counts.all === 0 && counts.archived === 0 && !filtered;
  const labels = { pending: t.photoSaving, failed: t.photoFailed, missing: t.addPhoto };
  const sizes = "(max-width: 56rem) 46vw, 240px";
  const draftsWaiting = counts?.draft ?? 0;

  function renderSwitch(item: Item) {
    const name = nameOf(item, lang) || t.untitled;
    if (item.status !== "live") return null;
    if (item.stock_rule === "always") return <span className="ct-state">{t.alwaysOn}</span>;
    return (
      <span className="ct-switchrow">
        <Switch on={item.available} label={t.switchLabel(name, item.available)} disabled={busy.has(item.id)} onChange={(next) => flip(item, next)} />
        <span className="ct-state" aria-hidden="true">{item.available ? t.available : t.soldOut}</span>
      </span>
    );
  }

  function openOrPick(item: Item) {
    if (selecting) togglePick(item.id);
    else setSheet({ kind: "edit", id: item.id });
  }

  function card(item: Item) {
    const name = nameOf(item, lang);
    const pills = statusLine(item, t, lowAt);
    const draftIncomplete = item.status === "draft" && (!item.name && !item.name_ar || item.price <= 0);
    const isPicked = picked.has(item.id);
    return (
      <li key={item.id} className={`ct-card ${isPicked ? "picked" : ""} ${item.status === "archived" ? "faded" : ""}`}>
        <button type="button" className="ct-open" onClick={() => openOrPick(item)} aria-pressed={selecting ? isPicked : undefined}>
          <span className="ct-photo">
            <Tile photo={item.cover} sizes={sizes} labels={labels} />
            {selecting && <span className={`ct-pick ${isPicked ? "on" : ""}`} aria-hidden="true">{isPicked && <Icon name="check" />}</span>}
          </span>
          <span className="ct-card-body">
            <span className="ct-name" dir="auto">{name || t.untitled}</span>
            <span className="ct-price">{priceLine(item) ?? (draftIncomplete ? <span className="ct-quiet">{t.needsDetails}</span> : null)}</span>
            {item.sku && <span className="ct-quiet ct-sku" dir="ltr">{item.sku}</span>}
            {pills.length > 0 && (
              <span className="ct-pills">
                {pills.map((p) => <span key={p.text} className={`sh-pill ct-pill ${p.tone}`}>{p.text}</span>)}
              </span>
            )}
          </span>
        </button>
        {!selecting && <div className="ct-card-foot">{renderSwitch(item)}</div>}
      </li>
    );
  }

  function categoryLabel(name: string) {
    const found = categories.find((c) => c.name === name);
    return found ? categoryName(found, lang) : name;
  }

  function row(item: Item) {
    const name = nameOf(item, lang);
    const pills = statusLine(item, t, lowAt);
    const draftIncomplete = item.status === "draft" && (!item.name && !item.name_ar || item.price <= 0);
    const isPicked = picked.has(item.id);
    return (
      <li key={item.id} className={`ct-row ${isPicked ? "picked" : ""} ${item.status === "archived" ? "faded" : ""}`}>
        <button type="button" className="ct-open" onClick={() => openOrPick(item)} aria-pressed={selecting ? isPicked : undefined}>
          <span className="ct-photo">
            <Tile photo={item.cover} sizes="64px" labels={labels} />
            {selecting && <span className={`ct-pick ${isPicked ? "on" : ""}`} aria-hidden="true">{isPicked && <Icon name="check" />}</span>}
          </span>
          <span className="ct-card-body">
            <span className="ct-name" dir="auto">{name || t.untitled}</span>
            <span className="ct-price">
              {priceLine(item) ?? (draftIncomplete ? <span className="ct-quiet">{t.needsDetails}</span> : null)}
              {item.category && (
                <>
                  {item.price > 0 && <span className="ct-sep" aria-hidden="true">·</span>}
                  <span className="ct-quiet" dir="auto">{categoryLabel(item.category)}</span>
                </>
              )}
              {item.sku && (
                <>
                  {(item.price > 0 || item.category) && <span className="ct-sep" aria-hidden="true">·</span>}
                  <span className="ct-quiet ct-sku" dir="ltr">{item.sku}</span>
                </>
              )}
            </span>
            {pills.length > 0 && (
              <span className="ct-pills">
                {pills.map((p) => <span key={p.text} className={`sh-pill ct-pill ${p.tone}`}>{p.text}</span>)}
              </span>
            )}
          </span>
        </button>
        {!selecting && <div className="ct-row-end">{renderSwitch(item)}</div>}
      </li>
    );
  }

  return (
    <div className={`ct ${selecting ? "selecting" : ""}`} lang={lang}>
      <header className="sh-head">
        <span className="sh-eyebrow">{data ? t.count(counts?.all ?? 0) : " "}</span>
        <h1>{t.title}</h1>
        <p>{t.sub}</p>
      </header>

      {offline && (
        <div className="ct-banner bad" role="status">
          <span>{data ? t.offline : t.offline}</span>
          <button type="button" className="btn small" onClick={() => void load()}>{t.retry}</button>
        </div>
      )}

      {((access.can_edit && !empty) || (last && (access.can_edit || last.action === "sold_out" || last.action === "back")) || access.can_manage) && <div className="ct-actions">
        {access.can_edit && !empty && (
          <button type="button" className="btn volt ct-btn" onClick={() => setSheet({ kind: "add" })}>
            <Icon name="plus" />{t.add}
          </button>
        )}
        {last && (access.can_edit || last.action === "sold_out" || last.action === "back") && (
          <button type="button" className="btn ct-btn" onClick={() => void undoBulk()}>
            <Icon name="undo" />{t.undoNamed(last.action, last.changed)}
          </button>
        )}
        <span className="ct-grow" />
        {access.can_manage && (
          <button type="button" className="btn ghost ct-btn" onClick={() => setSheet({ kind: "settings" })}>
            <Icon name="sliders" />{t.settings}
          </button>
        )}
      </div>}

      <div className="ct-tabs" role="tablist" aria-label={t.title}>
        {(["items", "stock"] as const).map((key) => (
          <button key={key} type="button" role="tab" id={`ct-tab-${key}`} aria-selected={tab === key} aria-controls={tab === key ? `ct-panel-${key}` : undefined}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => { setTab(key); if (key === "stock") stopSelecting(); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const other = key === "items" ? "stock" : "items";
                setTab(other);
                requestAnimationFrame(() => document.getElementById(`ct-tab-${other}`)?.focus());
              }
            }}>
            {t.tabs[key]}
            {key === "items" && counts && <span className="ct-tabcount num">{counts.all}</span>}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <div role="tabpanel" id="ct-panel-items" aria-labelledby="ct-tab-items" className="ct-panel">
          {draftsWaiting > 0 && access.can_edit && filter !== "draft" && (
            <div className="ct-banner">
              <span>{t.draftsWaiting(draftsWaiting)}</span>
              <button type="button" className="btn small" onClick={() => {
                void api<ListResult>("/api/items?filter=draft&limit=200").then((r) => setSheet({ kind: "walk", ids: r.items.map((i) => i.id) }));
              }}>{t.fillIn}<Icon name="arrow" className="sh-ico arrow" /></button>
            </div>
          )}

          {!empty && <div className="ct-tools">
            <label className="ct-search">
              <Icon name="search" />
              <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.search}
                aria-label={t.search} dir="auto" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false} />
            </label>
            <div className="ct-chips" role="group" aria-label={t.filterLabel}>
              {FILTERS.map((key) => {
                const n = key === "all" ? counts?.all : counts?.[key];
                // Only what has something in it is offered; a chip that is chosen stays, so it can be left.
                if (key !== "all" && !n && filter !== key) return null;
                return (
                  <button key={key} type="button" className="ct-chip" aria-pressed={filter === key}
                    onClick={() => { setFilter(key); setLimit(PAGE); stopSelecting(); }}>
                    {filter === key && <Icon name="check" className="sh-ico ct-chip-tick" />}
                    {t.filters[key]}{n !== undefined && <span className="ct-chip-n num">{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="ct-tools-row">
              <select className="ct-select" aria-label={t.category} value={category === null ? "__all" : category}
                onChange={(e) => { setCategory(e.target.value === "__all" ? null : e.target.value); setLimit(PAGE); }}>
                <option value="__all">{t.allCategories}</option>
                {categories.map((c) => <option key={c.name} value={c.name}>{categoryName(c, lang)}</option>)}
                <option value="">{t.noCategory}</option>
              </select>
              <span className="ct-grow" />
              <div className="ct-seg" role="group" aria-label={t.view}>
                <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")} aria-label={t.asPhotos} title={t.asPhotos}><Icon name="grid" /></button>
                <button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")} aria-label={t.asList} title={t.asList}><Icon name="list" /></button>
              </div>
              {(access.can_edit || access.can_stock) && items.length > 0 && (
                <button type="button" className={`btn ct-btn ${selecting ? "primary" : ""}`} aria-pressed={selecting}
                  onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
                  {selecting ? t.selectDone : t.select}
                </button>
              )}
            </div>
          </div>}
          <Announce text={data ? `${t.count(data.total)}` : ""} />

          {!data && !offline && <p className="ct-quiet ct-pad" role="status">{t.loading}</p>}

          {empty && (
            <section className="sh-tile raised folded ct-empty">
              <span className="sh-glyph"><Icon name="camera" /></span>
              <h2>{t.emptyTitle}</h2>
              <p>{t.emptyText}</p>
              {access.can_edit && <button type="button" className="btn volt ct-btn" onClick={() => setSheet({ kind: "add" })}><Icon name="plus" />{t.add}</button>}
            </section>
          )}

          {data && !empty && items.length === 0 && (
            <div className="empty-note ct-none">
              <p>{t.nothingFound}</p>
              <button type="button" className="btn small" onClick={() => { setTyped(""); setFilter("all"); setCategory(null); }}>{t.showEverything}</button>
            </div>
          )}

          {items.length > 0 && (view === "grid"
            ? <ul className="ct-grid">{items.map(card)}</ul>
            : <ul className="ct-list">{items.map(row)}</ul>)}

          {data && items.length < data.total && (
            <button type="button" className="btn ct-more" onClick={() => setLimit((l) => l + PAGE)}>{t.showMore}</button>
          )}
        </div>
      )}

      {tab === "stock" && (
        <div role="tabpanel" id="ct-panel-stock" aria-labelledby="ct-tab-stock" className="ct-panel">
          <CatalogStock lang={lang} onChanged={() => void load()} push={push} clear={clear} />
        </div>
      )}

      {selecting && (
        <Layer><div className="ct-bar" role="region" aria-label={t.chooseAction}>
          <b className="num">{t.selected(pickedNow.length)}</b>
          <button type="button" className="btn small ghost" onClick={() => setPicked(new Set(items.map((i) => i.id)))}>{t.selectAll}</button>
          {pickedNow.length > 0 && <button type="button" className="btn small ghost" onClick={() => setPicked(new Set())}>{t.selectNone}</button>}
          <span className="ct-grow" />
          <button type="button" className="btn primary ct-btn" disabled={pickedNow.length === 0} onClick={() => setSheet({ kind: "bulk" })}>{t.chooseAction}</button>
        </div></Layer>
      )}

      {sheet?.kind === "edit" && (
        <CatalogEdit lang={lang} itemId={sheet.id} initial={items.find((i) => i.id === sheet.id) ?? null}
          categories={categories} access={access} push={push}
          onClose={() => setSheet(null)} onChanged={() => void load()} />
      )}
      {sheet?.kind === "add" && (
        <AddSheet lang={lang} onClose={() => { setSheet(null); void load(); }}
          onTyped={() => setSheet({ kind: "edit", id: null })}
          onFill={(ids) => { void load(); setSheet({ kind: "walk", ids }); }} />
      )}
      {sheet?.kind === "walk" && (
        <WalkThrough lang={lang} ids={sheet.ids} categories={categories}
          onClose={() => { setSheet(null); void load(); }} />
      )}
      {sheet?.kind === "bulk" && (
        <CatalogBulk lang={lang} ids={pickedNow} canEdit={access.can_edit} categories={categories} push={push}
          onClose={() => setSheet(null)}
          onDone={() => { setSheet(null); stopSelecting(); void load(); }} />
      )}
      {sheet?.kind === "settings" && (
        <CatalogSettings lang={lang} push={push} onClose={() => { setSheet(null); void load(); }} />
      )}

      <ToastLayer toasts={toasts} dismiss={dismiss} lang={lang} undoWord={t.undo} dismissWord={t.dismiss} />
    </div>
  );
}
