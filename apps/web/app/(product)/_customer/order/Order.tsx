"use client";

// The customer's order page, version 2 (ALY-112, D-039; specs/005-order-page-v2/spec.md).
//
// What a customer can do here: look at the shop's items with photos and prices in their own
// language, search in any common Arabic spelling, pick a category, open an item for its
// sizes and choices, add it, and review the whole order before paying. Someone with their
// own link (a signed token) orders; anyone else is only looking, and is sent to the shop's
// WhatsApp to get a link. The page asks the shop again every 20 to 30 seconds while it is
// in front (never when the tab is hidden), says what changed, and checks the order once more
// before payment, so a price or stock change is shown first and never after.
//
// The first page of items arrives with the HTML (the server asks the API), so a slow phone
// has the menu before any script runs; the rest loads a page at a time.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Done, Frame, Glyph, Who } from "../Frame";
import { formatPrice, type Lang } from "../price";
import { matches, searchWords } from "../fold";
import { ApiError, loadItem, loadLive, loadStore, orderAgain } from "./api";
import { count, keyOf, most, total as totalOf, unitPrice, type Line } from "./cart";
import { say, T } from "./copy";
import { ItemCard } from "./ItemCard";
import type { Chosen } from "./ItemSheet";
import type { Checked, Item, Live, LiveItem, Placed, Store } from "./types";
import { Price } from "./ui";
import { waParts, type WaLine, type WaPart } from "./wa";
import { Wholesale, rowsOf } from "./Wholesale";
import "./order.css";

const ItemSheet = dynamic(() => import("./ItemSheet").then((m) => m.ItemSheet), { ssr: false });
const ReviewSheet = dynamic(() => import("./ReviewSheet").then((m) => m.ReviewSheet), { ssr: false });
const ListSheet = dynamic(() => import("./ListSheet").then((m) => m.ListSheet), { ssr: false });

type Props = {
  slug: string;
  token: string | null;
  table: string;
  initial: Store;
  lang: Lang;
  focusItem: string | null;
  focusCategory: string | null;
};

const PAGE = 48;
const POLL_MIN = 20_000;
const POLL_SPREAD = 10_000;

// ── small pure helpers ────────────────────────────────────

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

/** The item as the refresh describes it now; the same object when nothing changed. */
function mergeLive(item: Item, l: LiveItem): Item {
  const variants = item.variants.map((v) => {
    const lv = l.variants.find((x) => x.id === v.id);
    return lv && (v.price !== lv.price || v.list_price !== lv.list_price || v.left !== lv.left || v.sold_out !== lv.sold_out) ? { ...v, ...lv } : v;
  });
  const unchanged =
    item.orderable === l.orderable && item.sold_out === l.sold_out && item.reason === l.reason && item.left === l.left &&
    item.price === l.price && item.price_min === l.price_min && item.price_max === l.price_max &&
    item.list_price === l.list_price && item.price_source === l.price_source && same(item.note, l.note) &&
    same(item.order_for_dates ?? null, l.order_for_dates) && variants.every((v, i) => v === item.variants[i]);
  if (unchanged) return item;
  return {
    ...item, orderable: l.orderable, sold_out: l.sold_out, reason: l.reason, note: l.note, left: l.left, price: l.price,
    price_min: l.price_min, price_max: l.price_max, list_price: l.list_price, price_source: l.price_source,
    order_for_dates: l.order_for_dates ?? undefined, variants,
  };
}

const simpleVariant = (item: Item) => (item.variants.length === 1 ? item.variants[0].id : null);

function groupBy(items: Item[]): { name: string; items: Item[] }[] {
  const groups: { name: string; items: Item[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.category) last.items.push(item);
    else groups.push({ name: item.category, items: [item] });
  }
  return groups;
}

function makeLine(item: Item, variantId: string | null, optionIds: string[], qty: number): Line {
  const variant = item.variants.find((v) => v.id === variantId);
  const extras = item.option_groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
  const photo = variant?.photo && variant.photo.state === "ready" ? variant.photo : item.cover;
  return {
    key: keyOf(item.id, variantId, optionIds), itemId: item.id, variantId, optionIds: [...optionIds], qty,
    unit: unitPrice(item, variantId, optionIds),
    name: item.name, name_ar: item.name_ar, variant: variant?.name ?? "", variant_ar: variant?.name_ar ?? "",
    extras: extras.map((o) => ({ name: o.name, name_ar: o.name_ar })), src: photo.state === "ready" ? photo.src : "",
    code: item.code,
  };
}

/** The cart's lines as the WhatsApp message needs them. A line saved before codes existed gets
 *  its code from the item if the page has it. */
function toWaLines(lines: Line[], lookup: (id: string) => Item | undefined): WaLine[] {
  return lines.map((l) => ({
    code: l.code ?? lookup(l.itemId)?.code ?? null, qty: l.qty, name: l.name, name_ar: l.name_ar,
    variant: l.variant, variant_ar: l.variant_ar, extras: l.extras, unit: l.unit,
  }));
}

// ── the page ──────────────────────────────────────────────

export default function Order({ slug, token, table, initial, lang: first, focusItem, focusCategory }: Props) {
  const [lang, setLang] = useState<Lang>(first);
  const store = initial;
  const [base, setBase] = useState<Item[]>(initial.items);
  const [baseTotal, setBaseTotal] = useState(initial.total);
  const [remote, setRemote] = useState<{ key: string; items: Item[]; total: number } | null>(null);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(
    focusCategory && initial.categories.some((c) => c.name === focusCategory) ? focusCategory : null,
  );
  const [moreBusy, setMoreBusy] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  const [restored, setRestored] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [review, setReview] = useState(false);
  const [forDate, setForDate] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [again, setAgain] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [said, setSaid] = useState("");
  const [offline, setOffline] = useState(false);
  const [gone, setGone] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  // Every item seen so far (newest version): the review needs the rules and the days of what
  // is in the order even when a search has moved it off the list.
  const seenRef = useRef(new Map<string, Item>());
  const last = useRef(0);
  const t = T[lang];

  const canOrder = Boolean(token && store.customer);
  const shopName = say(lang, store.shop.name, store.shop.name_ar);
  // Someone with no link of their own, at a shop that has given its WhatsApp number: they pick
  // items and send them as a message (ALY-136). The shop, or the chat, answers.
  const whatsapp = store.shop.whatsapp;
  const waList = !canOrder && Boolean(whatsapp);
  const canPick = canOrder || waList;

  const say_ = useCallback((text: string) => setSaid((old) => (old === text ? `${text} ` : text)), []);

  const baseRef = useRef(base);
  const remoteRef = useRef(remote);
  useEffect(() => {
    baseRef.current = base;
    remoteRef.current = remote;
    for (const item of [...base, ...(remote?.items ?? []), ...(open ? [open] : [])]) seenRef.current.set(item.id, item);
  }, [base, remote, open]);
  const lookup = useCallback((id: string) => seenRef.current.get(id), []);

  /** An order as WhatsApp messages: one, or a few when it is too long for one. */
  const known = useMemo(() => new Map([...base, ...(remote?.items ?? [])].map((i) => [i.id, i] as const)), [base, remote]);
  const partsOf = useCallback((ls: Line[]): WaPart[] => {
    if (!whatsapp || ls.length === 0) return [];
    return waParts(whatsapp, {
      shop: store.shop, lang, mode: store.settings.whatsapp_mode, lines: toWaLines(ls, (id) => known.get(id)),
      money: (dirhams) => formatPrice(dirhams, lang), customer: store.customer?.name, table: store.table,
    });
  }, [whatsapp, store, lang, known]);

  // ── what is shown: all of it filtered here when it is all loaded, else asked of the API ──
  const words = useMemo(() => searchWords(q), [q]);
  const complete = base.length >= baseTotal;
  const filtering = q !== "" || category !== null;
  const cats = useMemo(() => new Map(store.categories.map((c) => [c.name, c])), [store]);
  const remoteKey = `${q}\u0000${category ?? "\u0001"}`;
  const shown = useMemo(() => {
    if (!filtering) return base;
    if (complete) {
      return base.filter((i) =>
        (category === null || i.category === category) &&
        matches(words, i.name, i.name_ar, i.description, i.description_ar, i.sku, i.category, cats.get(i.category)?.name_ar,
          i.tags.join(" "), ...i.variants.flatMap((v) => [v.name, v.name_ar, v.sku])));
    }
    return remote && remote.key === remoteKey ? remote.items : [];
  }, [base, complete, filtering, category, words, cats, remote, remoteKey]);
  const shownTotal = !filtering ? baseTotal : complete ? shown.length : remote && remote.key === remoteKey ? remote.total : 0;
  const waiting = filtering && !complete && !(remote && remote.key === remoteKey);

  // The search waits for a pause in typing.
  useEffect(() => {
    const wait = setTimeout(() => setQ(typed.trim()), 220);
    return () => clearTimeout(wait);
  }, [typed]);

  // Not everything is loaded: ask the API for this search or category.
  useEffect(() => {
    if (!filtering || complete) return;
    let live = true;
    loadStore(slug, token, table, { q, category, limit: PAGE })
      .then((r) => { if (live) { setRemote({ key: remoteKey, items: r.items, total: r.total }); setOffline(false); } })
      .catch(() => { if (live) setOffline(true); });
    return () => { live = false; };
  }, [filtering, complete, q, category, remoteKey, slug, token, table]);

  async function showMore() {
    if (moreBusy) return;
    setMoreBusy(true);
    try {
      if (!filtering) {
        const r = await loadStore(slug, token, table, { offset: base.length, limit: PAGE });
        setBase((old) => [...old, ...r.items.filter((i) => !old.some((o) => o.id === i.id))]);
        setBaseTotal(r.total);
      } else if (remote) {
        const r = await loadStore(slug, token, table, { q, category, offset: remote.items.length, limit: PAGE });
        setRemote({ key: remoteKey, items: [...remote.items, ...r.items], total: r.total });
      }
    } catch { setOffline(true); }
    setMoreBusy(false);
  }

  // ── the cart: kept for this tab, so a reload does not lose it ──
  const storageKey = `alyr-order:${slug}`;
  useEffect(() => {
    const read = setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (Array.isArray(saved)) setCart(saved.filter((l) => l && typeof l.key === "string" && l.qty > 0).slice(0, 100));
      } catch { /* a browser that refuses storage starts with an empty order */ }
      setRestored(true);
    }, 0);
    return () => clearTimeout(read);
  }, [storageKey]);
  useEffect(() => {
    if (!restored) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* not kept */ }
  }, [cart, restored, storageKey]);

  // The customer's own link is kept for this tab, so the payment page's way back to the shop
  // can carry it (a link to a shop never makes one up: it only hands back what was opened).
  useEffect(() => {
    if (!token || !store.customer) return;
    try { sessionStorage.setItem(`alyr-link:${slug}`, token); } catch { /* not kept */ }
  }, [token, store.customer, slug]);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((old) => (qty <= 0 ? old.filter((l) => l.key !== key) : old.map((l) => (l.key === key ? { ...l, qty } : l))));
  }, []);
  const remove = useCallback((key: string) => setCart((old) => old.filter((l) => l.key !== key)), []);
  const accept = useCallback((key: string, unit: number) => {
    setCart((old) => old.map((l) => (l.key === key ? { ...l, unit } : l)));
    setFlagged((old) => { const n = new Set(old); n.delete(key); return n; });
  }, []);
  const setSimple = useCallback((item: Item, qty: number) => {
    const variantId = simpleVariant(item);
    const key = keyOf(item.id, variantId, []);
    setCart((old) => {
      if (qty <= 0) return old.filter((l) => l.key !== key);
      const have = old.find((l) => l.key === key);
      return have ? old.map((l) => (l.key === key ? { ...l, qty } : l)) : [...old, makeLine(item, variantId, [], qty)];
    });
  }, []);
  const setVariantQty = useCallback((item: Item, variantId: string | null, qty: number) => {
    const key = keyOf(item.id, variantId, []);
    setCart((old) => {
      if (qty <= 0) return old.filter((l) => l.key !== key);
      const have = old.find((l) => l.key === key);
      return have ? old.map((l) => (l.key === key ? { ...l, qty } : l)) : [...old, makeLine(item, variantId, [], qty)];
    });
  }, []);
  const addChosen = useCallback((item: Item, pick: Chosen) => {
    const key = keyOf(item.id, pick.variantId, pick.optionIds);
    setCart((old) => {
      const have = old.find((l) => l.key === key);
      const cap = most(item, pick.variantId);
      if (have) return old.map((l) => (l.key === key ? { ...l, qty: Math.min(cap, l.qty + pick.qty), unit: unitPrice(item, pick.variantId, pick.optionIds) } : l));
      return [...old, makeLine(item, pick.variantId, pick.optionIds, pick.qty)];
    });
    setOpen(null);
    say_(`${t.inOrder(pick.qty)}: ${say(lang, item.name, item.name_ar)}`);
  }, [lang, say_, t]);
  const swap = useCallback((key: string, alt: NonNullable<Checked["alternatives"]>[number]) => {
    setCart((old) => {
      const was = old.find((l) => l.key === key);
      const rest = old.filter((l) => l.key !== key);
      const newKey = keyOf(alt.item_id, alt.variant_id, []);
      if (!was || rest.some((l) => l.key === newKey)) return rest;
      return [...rest, {
        key: newKey, itemId: alt.item_id, variantId: alt.variant_id, optionIds: [], qty: was.qty, unit: alt.price,
        name: alt.name, name_ar: alt.name_ar, variant: "", variant_ar: "", extras: [], src: "",
      }];
    });
  }, []);
  const onLimit = useCallback((item: Item) => {
    const cap = most(item);
    say_(t.atMost(cap));
  }, [say_, t]);

  const inOrder = useCallback((id: string) => cart.reduce((n, l) => (l.itemId === id ? n + l.qty : n), 0), [cart]);
  const qtyOf = useCallback((id: string, variantId: string | null) => cart.find((l) => l.key === keyOf(id, variantId, []))?.qty ?? 0, [cart]);

  // ── the refresh ──
  const watch = useRef<string[]>([]);
  const cartRef = useRef<Line[]>([]);
  useEffect(() => {
    watch.current = [...new Set([...base.map((i) => i.id), ...(remote?.items ?? []).map((i) => i.id), ...cart.map((l) => l.itemId)])];
    cartRef.current = cart;
  });

  const apply = useCallback((live: Live) => {
    const byId = new Map(live.items.map((l) => [l.id, l]));
    let moved = 0;
    const update = (items: Item[]): Item[] => {
      let changed = false;
      const out = items.flatMap((item) => {
        if (live.gone.includes(item.id)) { changed = true; return []; }
        const l = byId.get(item.id);
        if (!l) return [item];
        const merged = mergeLive(item, l);
        if (merged !== item) { changed = true; if (merged.sold_out !== item.sold_out) moved += 1; }
        return [merged];
      });
      return changed ? out : items;
    };
    // Worked out here, from what is on screen now, so the change can be counted and said.
    const nextBase = update(baseRef.current);
    if (nextBase !== baseRef.current) setBase(nextBase);
    const shownRemote = remoteRef.current;
    if (shownRemote) {
      const nextRemote = update(shownRemote.items);
      if (nextRemote !== shownRemote.items) setRemote({ ...shownRemote, items: nextRemote });
    }
    setOpen((o) => (o && byId.get(o.id) ? mergeLive(o, byId.get(o.id) as LiveItem) : o));
    // What the customer has chosen: anything that changed is named, and the order is flagged
    // so the next tap is a review, not a payment.
    const flags = new Set<string>();
    const notes: string[] = [];
    for (const line of cartRef.current) {
      const item = seenRef.current.get(line.itemId);
      const l = byId.get(line.itemId);
      const name = item ? say(lang, item.name, item.name_ar) : say(lang, line.name, line.name_ar);
      if (live.gone.includes(line.itemId) || (l && (!l.orderable))) {
        flags.add(line.key);
        notes.push(T[lang].nowSoldOut(name));
      } else if (l && item) {
        const now = unitPrice(mergeLive(item, l), line.variantId, line.optionIds);
        if (now !== line.unit) { flags.add(line.key); notes.push(T[lang].nowPrice(name, formatPrice(now, lang))); }
      }
    }
    setFlagged((old) => (same([...old].sort(), [...flags].sort()) ? old : flags));
    if (notes.length) say_(`${notes.join(" ")} ${T[lang].cartChanged}`);
    else if (moved) say_(T[lang].updated);
  }, [lang, say_]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") { schedule(); return; }
      last.current = Date.now();
      try {
        const live = await loadLive(slug, watch.current.slice(0, 200), token);
        if (!stopped) { apply(live); setOffline(false); }
      } catch { if (!stopped) setOffline(true); }
      schedule();
    };
    const schedule = () => { timer = setTimeout(tick, POLL_MIN + Math.random() * POLL_SPREAD); };
    const wake = () => {
      // Back in front after a while: look now rather than wait out the timer.
      if (document.visibilityState === "visible" && Date.now() - last.current > POLL_MIN) { clearTimeout(timer); void tick(); }
    };
    last.current = Date.now();
    schedule();
    document.addEventListener("visibilitychange", wake);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, [slug, token, apply]);

  // ── a shared link opens where it points ──
  const firstFocus = useRef(focusItem);
  useEffect(() => {
    const wanted = firstFocus.current;
    if (!wanted) return;
    let live = true;
    const here = initial.items.find((i) => i.id === wanted);
    if (here) { const later = setTimeout(() => { if (live) setOpen(here); }, 0); return () => { live = false; clearTimeout(later); }; }
    loadItem(slug, wanted, token).then((item) => { if (live) setOpen(item); }).catch(() => { if (live) setGone(true); });
    return () => { live = false; };
  }, [initial, slug, token]);

  const fetchFull = useCallback((id: string) => loadItem(slug, id, token).catch(() => null), [slug, token]);

  async function reorder(payment: "link" | "account") {
    if (!token) return;
    setAgain({ busy: true, error: "" });
    try {
      const result = await orderAgain(slug, payment, token);
      setPlaced(result);
      setAgain({ busy: false, error: "" });
    } catch (error) {
      const refusal = error instanceof ApiError ? error.refusal : null;
      setAgain({ busy: false, error: refusal ? say(lang, refusal.message, refusal.message_ar) : t.failed });
    }
  }

  // ── what is on screen ──
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  const customer = store.customer;
  // The shop's type chooses how the items are laid out (ALY-107); a price group, or the shop's
  // own setting, always gets the compact table.
  const style = store.catalog?.layout.style ?? "menu";
  const layout = store.settings.wholesale_layout || !store.group.is_default || style === "table" ? "table" : "cards";
  const look = style === "grid" || style === "list" ? style : "menu";
  // What the page offers is the shop's choice (features, ALY-148). A shop without the Catalog
  // keeps the page it always had, which offers all four.
  const offers = store.catalog?.layout ?? { pickup_date: true, quick_quantity: true, same_as_last: true, show_sku: true };
  const section = store.catalog ? say(lang, store.catalog.section.name, store.catalog.section.name_ar) : "";
  // The shop's automatic discounts in words, only while its discounts are on (ALY-150).
  const offerList = store.pricing?.discounts?.offers ?? [];

  if (placed) {
    const link = placed.payment === "link" && placed.pay_url ? new URL(placed.pay_url).pathname : null;
    return (
      <Frame lang={lang} onLang={toggle} shop={shopName} context={t.context} short>
        <Done title={t.placed(placed.number)}>
          {placed.payment === "account" && <p><b className="num"><Price value={placed.total} lang={lang} /></b> · {t.onAccount}</p>}
          {placed.payment === "link" && <p><b className="num"><Price value={placed.total} lang={lang} /></b></p>}
          {placed.pricing && placed.pricing.discount_total > 0 && (
            <p className="ox-discount-line">{t.discountOnOrder(`−${formatPrice(placed.pricing.discount_total, lang)}`)}</p>
          )}
          <p>{placed.payment === "link" ? t.payToConfirm : t.backToChat}</p>
        </Done>
        {placed.left_out && placed.left_out.length > 0 && (
          <section className="cx-card ox-notice" aria-labelledby="ox-left-out">
            <h2 id="ox-left-out">{t.leftOut}</h2>
            <p>{t.leftOutHint}</p>
            <ul>
              {placed.left_out.map((x) => (
                <li key={x.name}><b dir="auto">{say(lang, x.name, x.name_ar)}</b> <span dir="auto">{say(lang, x.message, x.message_ar)}</span></li>
              ))}
            </ul>
          </section>
        )}
        {placed.price_changes && placed.price_changes.length > 0 && (
          <section className="cx-card ox-notice" aria-labelledby="ox-moved">
            <h2 id="ox-moved">{t.priceChanges}</h2>
            <ul>
              {placed.price_changes.map((x) => (
                <li key={x.name} dir="auto">{t.priceChange(x.name, formatPrice(x.was, lang), formatPrice(x.now, lang))}</li>
              ))}
            </ul>
          </section>
        )}
        {link && <a className="cx-btn" href={link}><Glyph name="card" />{t.payNow(formatPrice(placed.total, lang))}</a>}
        {placed.track_url && <a className="cx-btn ink" href={new URL(placed.track_url).pathname}>{t.track}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  const flaggedCount = cart.filter((l) => flagged.has(l.key)).length;
  const lines = cart;
  const sending = waList ? partsOf(lines) : [];
  const itemMessage = (item: Item, pick: Chosen) => partsOf([makeLine(item, pick.variantId, pick.optionIds, pick.qty)])[0]?.href ?? "";
  // The label the server cleaned (`store.table`), not the raw address: a printed code is the
  // shop's, but anyone can type an address.
  const prefill = store.table ? (lang === "ar" ? `طلب طاولة ${store.table}` : `Order table ${store.table}`) : t.prefillOrder;
  const wa = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(prefill)}` : "";
  const catList = store.categories;
  const grouped = !filtering && layout === "cards";
  const label = (name: string) => {
    if (!name) return t.other;
    const c = cats.get(name);
    return say(lang, name, c?.name_ar ?? "");
  };

  const renderCards = (items: Item[]) => (
    <ul className={`ox-list ${look}`}>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} lang={lang} look={look} canOrder={canPick} quick={offers.quick_quantity} inOrder={inOrder(item.id)}
          simpleQty={qtyOf(item.id, simpleVariant(item))} onOpen={setOpen} onSet={setSimple} onLimit={onLimit} />
      ))}
    </ul>
  );

  return (
    <Frame lang={lang} onLang={toggle} shop={shopName} context={t.context}>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{section || (canOrder ? t.eyebrow : t.eyebrowMenu)}</span>
        <h1>{t.title}</h1>
        <div className="ox-who">
          {customer && <Who label={t.hello(customer.first_name)} />}
          {store.table && <span className="ox-table"><Glyph name="table" />{t.table(store.table)}</span>}
        </div>
      </section>

      {offerList.length > 0 && (
        <ul className="ox-offers" aria-label={t.offers}>
          {offerList.map((o) => <li key={o.text}>{say(lang, o.text, o.text_ar)}</li>)}
        </ul>
      )}

      {store.link.state === "invalid" || store.link.state === "expired" ? (
        <p className="cx-warn" role="alert">{say(lang, store.link.message, store.link.message_ar)}</p>
      ) : null}
      {!canOrder && (
        <section className="cx-card ox-notice" style={{ "--i": 1 } as React.CSSProperties}>
          <h2>{wa ? t.waTitle : t.browseTitle}</h2>
          <p>{wa ? t.browseWhatsApp(shopName) : t.browseNoNumber(shopName)}</p>
        </section>
      )}
      {gone && <p className="cx-warn" role="status">{t.itemGone}</p>}
      {offline && <p className="cx-warn" role="status"><Glyph name="refresh" /> {t.offline}</p>}

      {canOrder && offers.same_as_last && customer?.has_last_order && cart.length === 0 && !filtering && (
        <section className="cx-card ox-again" aria-labelledby="ox-again-h" style={{ "--i": 1 } as React.CSSProperties}>
          <h2 id="ox-again-h">{t.again}</h2>
          <p>{t.againHint}</p>
          {again.error && <p className="ox-err" role="alert">{again.error}</p>}
          <div className="ox-again-act">
            <button type="button" className="cx-btn ghost" disabled={again.busy} onClick={() => void reorder("link")}>{t.againPay}</button>
            {customer.can_use_account && (
              <button type="button" className="cx-btn ghost" disabled={again.busy} onClick={() => void reorder("account")}>{t.againAccount}</button>
            )}
          </div>
        </section>
      )}

      <div className="ox-tools" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="ox-search">
          <Glyph name="search" className="ox-search-glyph" />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={section ? t.searchIn(section) : t.search}
            placeholder={section ? t.searchIn(section) : t.search} dir="auto" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false}
            className="cx-input" aria-describedby="ox-results" />
          {typed && (
            <button type="button" className="ox-clear" aria-label={t.clearSearch} onClick={() => { setTyped(""); setQ(""); }}>
              <Glyph name="close" />
            </button>
          )}
        </div>
      </div>
      {catList.length > 1 && (
        <nav className="ox-chips" aria-label={t.categories} style={{ "--i": 3 } as React.CSSProperties}>
          <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>{t.all}</button>
          {catList.map((c) => (
            <button key={c.name} type="button" aria-pressed={category === c.name} onClick={() => setCategory(category === c.name ? null : c.name)} dir="auto">
              {label(c.name)}
            </button>
          ))}
        </nav>
      )}
      <p id="ox-results" className="ox-sr" role="status" aria-live="polite">
        {filtering && !waiting ? (q ? (shownTotal === 0 ? t.noMatch(q) : t.resultsFor(shownTotal, q)) : t.items(shownTotal)) : ""}
      </p>

      {waiting && <p className="cx-note" role="status">{t.loadingMore}</p>}
      {!waiting && shown.length === 0 && filtering && (
        <div className="ox-none">
          <p>{q ? t.noMatch(q) : t.items(0)}</p>
          <button type="button" className="cx-btn ghost" onClick={() => { setTyped(""); setQ(""); setCategory(null); }}>{t.showAll}</button>
        </div>
      )}

      {layout === "table" && shown.length > 0 && (
        <Wholesale rows={rowsOf(shown)} lang={lang} label={section || t.priceList} canOrder={canPick} showSku={offers.show_sku} onOpen={setOpen} onSet={setVariantQty}
          onLimit={onLimit} qtyOf={(item, variant) => qtyOf(item.id, variant ? variant.id : simpleVariant(item))} />
      )}
      {layout === "cards" && (grouped
        ? groupBy(shown).map((g, i) => (
            <section key={g.name || "other"} className="ox-group" aria-labelledby={`ox-cat-${i}`}>
              <h2 id={`ox-cat-${i}`} dir="auto">{label(g.name)}</h2>
              {renderCards(g.items)}
            </section>
          ))
        : shown.length > 0 ? renderCards(shown) : null)}

      {shown.length < shownTotal && !waiting && (
        <button type="button" className="cx-btn ghost ox-more" disabled={moreBusy} onClick={() => void showMore()}>
          {moreBusy ? t.loadingMore : t.more(shownTotal - shown.length)}
        </button>
      )}

      {lines.length > 0 && canOrder ? (
        <div className="cx-bar">
          <div className="cx-bar-in">
            {flaggedCount > 0 && <div className="cx-error" role="status">{t.cartChanged}</div>}
            <div className="cx-sum">
              <span>{t.bar(count(lines))}</span>
              <b><Price value={totalOf(lines)} lang={lang} /></b>
            </div>
            <button type="button" className="cx-btn" onClick={() => setReview(true)}>
              <Glyph name="card" />{flaggedCount > 0 ? t.reviewChanged : t.review}
            </button>
          </div>
        </div>
      ) : waList && sending.length > 0 ? (
        <div className="cx-bar">
          <div className="cx-bar-in">
            <div className="cx-sum">
              <span>{t.bar(count(lines))}</span>
              <b><Price value={totalOf(lines)} lang={lang} /></b>
            </div>
            {sending.length > 1 && <p className="ox-quiet center">{t.partsHint(sending.length)}</p>}
            {sending.map((part, i) => (
              <a key={part.href} className={`cx-btn ${i > 0 ? "ghost" : ""}`} href={part.href} target="_blank" rel="noopener noreferrer">
                <Glyph name="wa" />{sending.length > 1 ? t.partOf(i + 1, sending.length) : t.startOrder}
              </a>
            ))}
            <button type="button" className="ox-link ox-seelist" onClick={() => setListOpen(true)}>{t.seeList}</button>
          </div>
        </div>
      ) : !canOrder && wa ? (
        <div className="cx-bar">
          <div className="cx-bar-in">
            <a className="cx-btn" href={wa} target="_blank" rel="noopener noreferrer"><Glyph name="wa" />{t.startOrder}</a>
          </div>
        </div>
      ) : null}

      <p className="ox-sr" role="status" aria-live="polite" aria-atomic="true">{said}</p>

      {open && (
        <ItemSheet key={open.id} item={open} lang={lang} canOrder={canPick} showSku={offers.show_sku} fetchFull={fetchFull} onAdd={addChosen}
          onClose={() => setOpen(null)} onLimit={onLimit} whatsapp={waList ? itemMessage : undefined} />
      )}
      {listOpen && waList && (
        <ListSheet lang={lang} lines={lines} lookup={lookup} parts={sending} setQty={setQty} remove={remove}
          onClose={() => setListOpen(false)} />
      )}
      {review && token && customer && (
        <ReviewSheet slug={slug} token={token} lang={lang} lines={lines} lookup={lookup} customer={customer} table={store.table} askDay={offers.pickup_date}
          forDate={forDate} onForDate={setForDate} setQty={setQty} remove={remove} accept={accept} swap={swap}
          whatsapp={partsOf(lines)} discounts={!!store.pricing?.discounts}
          choose={(id) => { const it = seenRef.current.get(id); setReview(false); if (it) setOpen(it); }}
          onPlaced={(p) => {
            setReview(false); setCart([]); setFlagged(new Set());
            try { sessionStorage.removeItem(storageKey); } catch { /* nothing kept */ }
            if (p.pay_url) window.location.href = new URL(p.pay_url).pathname;
            else setPlaced(p);
          }}
          onClose={() => setReview(false)} />
      )}
    </Frame>
  );
}
