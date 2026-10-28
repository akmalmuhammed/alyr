"use client";

// The steps of the order path (ALY-164, D-063, spec 027): what you sell, then how customers
// get it and pay. Each is a thin screen over an API the workspace already uses, so there is one
// source of truth and nothing is built twice: the Catalog's items, the delivery settings and
// the shop's payment ways. Each step is a hook (the logic, which the page's Continue button
// runs) and a view (the markup), because the page owns the buttons.

import { useCallback, useEffect, useState } from "react";
import { call } from "./api";
import type { Copy, Lang } from "./copy";

type Item = { id: string; name: string; name_ar: string; price: number; status: string; sample: boolean };
export type Row = Item & { keep: boolean; priceText: string };
type Fault = { detail?: { code?: string } | string };

const qar = (dirhams: number) => (dirhams ? String(dirhams / 100) : "");
// "12.5" or "12,5" or Arabic digits typed on a phone, as dirhams; null when it is not a price.
function dirhams(text: string): number | null {
  const plain = text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace("٫", ".").replace(",", ".").trim();
  if (!plain) return null;
  const value = Number(plain);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}
// An amount as the product prints it: "QAR 24" in English, «24 ر.ق» in Arabic, no trailing zeros.
export const moneyText = (dirhams: number, lang: Lang) => {
  const value = Number.isInteger(dirhams / 100) ? String(dirhams / 100) : (dirhams / 100).toFixed(2);
  return lang === "ar" ? `${value} ر.ق` : `QAR ${value}`;
};
const codeOf = (fault: Fault) => (typeof fault.detail === "object" ? fault.detail?.code : undefined);

// ── what you sell ───────────────────────────────────────────────────────────────

export type Products = {
  rows: Row[]; draft: { name: string; name_ar: string; price: string }; busy: boolean; error: string;
  canContinue: boolean; loaded: boolean;
  setKeep: (id: string, keep: boolean) => void;
  setPrice: (id: string, text: string) => void;
  setDraft: (draft: { name: string; name_ar: string; price: string }) => void;
  addOwn: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  save: () => Promise<boolean>;
};

export function useProducts(active: boolean, t: Copy): Products {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({ name: "", name_ar: "", price: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await call<{ items: Item[] }>("/api/items?limit=200");
    if (!answer.ok) return;
    setRows(answer.data.items.filter((i) => i.status !== "archived").map((i) => ({ ...i, keep: true, priceText: qar(i.price) })));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!active || loaded) return;
    const first = setTimeout(() => { load().catch(() => undefined); }, 0);
    return () => clearTimeout(first);
  }, [active, loaded, load]);

  const setKeep = (id: string, keep: boolean) => setRows((all) => all.map((r) => (r.id === id ? { ...r, keep } : r)));
  const setPrice = (id: string, priceText: string) => setRows((all) => all.map((r) => (r.id === id ? { ...r, priceText } : r)));

  // The items that will be on sale once the owner continues: the samples they kept and the
  // items already theirs, each with a price.
  const onSale = rows.filter((r) => (r.sample ? r.keep : r.status === "live") && (dirhams(r.priceText) ?? 0) > 0);

  async function work(job: () => Promise<boolean>): Promise<boolean> {
    setBusy(true); setError("");
    try { return await job(); } catch { setError(t.offline); return false; } finally { setBusy(false); }
  }

  const addOwn = async () => {
    const price = dirhams(draft.price);
    if (!draft.name.trim() || !price) return;
    await work(async () => {
      const answer = await call<Fault>("/api/items", "POST", { name: draft.name.trim(), name_ar: draft.name_ar.trim(), price, status: "live" });
      if (!answer.ok) {
        setError(codeOf(answer.data) === "arabic_needed" ? t.products.arabicNeeded : t.products.saveFailed);
        return false;
      }
      setDraft({ name: "", name_ar: "", price: "" });
      await load();
      return true;
    });
  };

  const remove = async (id: string) => {
    await work(async () => {
      await call(`/api/items/${id}`, "DELETE");
      await load();
      return true;
    });
  };

  // What Continue does: keep the samples that were ticked (they stop being samples and go on
  // sale at the price shown), delete the ones that were not, save a price changed on an item
  // that was already theirs. The API checks everything; a refusal stops here with a plain line.
  const save = () => work(async () => {
    for (const r of rows) {
      const price = dirhams(r.priceText);
      if (r.sample && !r.keep) {
        await call(`/api/items/${r.id}`, "DELETE");
      } else if (r.sample) {
        if (!price) { setError(t.products.saveFailed); return false; }
        const adopted = await call(`/api/items/${r.id}/adopt`, "POST");
        const live = adopted.ok ? await call<Fault>(`/api/items/${r.id}`, "PUT", { price, status: "live" }) : adopted;
        if (!live.ok) { setError(codeOf(live.data as Fault) === "arabic_needed" ? t.products.arabicNeeded : t.products.saveFailed); await load(); return false; }
      } else if (price && price !== r.price) {
        const saved = await call(`/api/items/${r.id}`, "PUT", { price });
        if (!saved.ok) { setError(t.products.saveFailed); return false; }
      }
    }
    await load();
    return true;
  });

  return { rows, draft, busy, error, canContinue: onSale.length > 0, loaded, setKeep, setPrice, setDraft, addOwn, remove, save };
}

export function ProductsView({ p, lang, t, section }: { p: Products; lang: Lang; t: Copy; section: string }) {
  const c = t.products;
  const label = (r: Row) => (lang === "ar" && r.name_ar ? r.name_ar : r.name);
  return (
    <>
      <div className="ob-table ob-items">
        {/* The column words are for the eye; each field names itself ("Price: Croissant"). */}
        <div className="ob-tr ob-th" aria-hidden="true"><span /><span>{c.name}</span><span>{c.price}</span><span /></div>
        {p.rows.map((r) => (
          <div className="ob-tr ob-item" key={r.id}>
            {r.sample
              ? <label className="ob-keep"><input type="checkbox" checked={r.keep} aria-label={`${c.sell}: ${label(r)}`} onChange={(e) => p.setKeep(r.id, e.target.checked)} /></label>
              : <span className="ob-onsale" role="img" aria-label={c.mine}>✓</span>}
            <span className="ob-item-name" dir="auto">{label(r)}{r.sample && <small>{c.example}</small>}</span>
            <input inputMode="decimal" dir="ltr" value={r.priceText} aria-label={`${c.price}: ${label(r)}`} disabled={r.sample && !r.keep} onChange={(e) => p.setPrice(r.id, e.target.value)} />
            {r.sample ? <span /> : <button type="button" className="ob-x" aria-label={`${c.remove}: ${label(r)}`} onClick={() => p.remove(r.id)}>×</button>}
          </div>
        ))}
      </div>
      <section className="ob-card ob-own">
        <h2>{c.addTitle}</h2>
        <form className="ob-own-form" onSubmit={(e) => { e.preventDefault(); p.addOwn(); }}>
          <label className="ob-field"><span>{c.newName}</span><input value={p.draft.name} dir="auto" onChange={(e) => p.setDraft({ ...p.draft, name: e.target.value })} /></label>
          <label className="ob-field"><span>{c.newNameAr}</span><input value={p.draft.name_ar} dir="rtl" lang="ar" onChange={(e) => p.setDraft({ ...p.draft, name_ar: e.target.value })} /></label>
          <label className="ob-field"><span>{c.newPrice}</span><input value={p.draft.price} inputMode="decimal" dir="ltr" onChange={(e) => p.setDraft({ ...p.draft, price: e.target.value })} /></label>
          <button type="submit" className="ob-btn small" disabled={p.busy || !p.draft.name.trim() || !dirhams(p.draft.price)}>{c.addIt}</button>
        </form>
      </section>
      {!p.canContinue && p.loaded && <p className="ob-note" role="status">{c.needOne}</p>}
      {p.error && <p className="ob-error" role="alert">{p.error}</p>}
      <p className="ob-note ob-more">{c.more(section)} <a className="ob-link" href="/app/catalog" target="_blank" rel="noopener">{c.open}</a></p>
    </>
  );
}

// ── pickup, delivery and how customers pay ──────────────────────────────────────

const WAYS = ["cash", "bank_transfer", "card_terminal"] as const;
type Way = (typeof WAYS)[number];
export type Handover = {
  pickup: boolean; delivery: boolean; fee: string; freeOver: string; ways: Way[];
  busy: boolean; error: string; canContinue: boolean;
  setPickup: (on: boolean) => void; setDelivery: (on: boolean) => void;
  setFee: (text: string) => void; setFreeOver: (text: string) => void;
  toggleWay: (way: Way) => void;
  save: () => Promise<boolean>;
};

export function useHandover(active: boolean, t: Copy): Handover {
  const [pickup, setPickup] = useState(true);
  const [delivery, setDelivery] = useState(false);
  const [fee, setFee] = useState("");
  const [freeOver, setFreeOver] = useState("");
  const [ways, setWays] = useState<Way[]>(["cash", "bank_transfer"]);
  const [featureOn, setFeatureOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active || loaded) return;
    let alive = true;
    const first = setTimeout(async () => {
      const [saved, shop] = await Promise.all([
        call<{ ways: Way[]; online: boolean }>("/api/orders-payment-ways").catch(() => null),
        // Delivery answers 422 while its feature is off: the shop is pickup only.
        call<{ pickup: boolean; delivery: boolean; flat_fee: number | null; flat_free_over: number | null }>("/api/delivery").catch(() => null),
      ]);
      if (!alive) return;
      if (saved?.ok && saved.data.ways?.length && !saved.data.online) setWays(saved.data.ways);
      if (shop?.ok) {
        setFeatureOn(true);
        setPickup(shop.data.pickup); setDelivery(shop.data.delivery);
        setFee(qar(shop.data.flat_fee ?? 0)); setFreeOver(qar(shop.data.flat_free_over ?? 0));
      }
      setLoaded(true);
    }, 0);
    return () => { alive = false; clearTimeout(first); };
  }, [active, loaded]);

  const toggleWay = (way: Way) => setWays((all) => (all.includes(way) ? all.filter((w) => w !== way) : [...all, way]));
  const canContinue = (pickup || delivery) && ways.length > 0;

  // What Continue does, in the order that leaves the owner's choice standing: switch delivery
  // on (or leave it off), save how it is charged, choose "cash and transfer" for the go-live
  // check (which sets the shop's defaults when the choice changes), then save exactly the
  // ways ticked.
  const save = async () => {
    if (!canContinue) return false;
    setBusy(true); setError("");
    try {
      if (delivery) {
        const on = await call("/api/features/delivery_fees", "PUT", { enabled: true });
        if (!on.ok) { setError(t.handover.saveFailed); return false; }
        const body: Record<string, unknown> = { pickup, delivery: true, flat_fee: dirhams(fee) ?? 0 };
        const over = dirhams(freeOver);
        if (over) body.flat_free_over = over;
        const shop = await call("/api/delivery", "PUT", body);
        if (!shop.ok) { setError(t.handover.saveFailed); return false; }
      } else if (featureOn) {
        await call("/api/delivery", "PUT", { pickup: true, delivery: false });
      }
      await call("/api/onboarding/steps/payments", "PATCH", { choice: "cash_transfer" });
      const paid = await call("/api/orders-payment-ways", "PUT", { online: false, ways });
      if (!paid.ok) { setError(t.handover.saveFailed); return false; }
      return true;
    } catch {
      setError(t.offline);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { pickup, delivery, fee, freeOver, ways, busy, error, canContinue, setPickup, setDelivery, setFee, setFreeOver, toggleWay, save };
}

export function HandoverView({ h, t }: { h: Handover; t: Copy }) {
  const c = t.handover;
  const wayLabel: Record<Way, string> = { cash: c.cash, bank_transfer: c.transfer, card_terminal: c.card };
  return (
    <>
      <section className="ob-card ob-handover">
        <h2>{c.getTitle}</h2>
        <div className="ob-chips">
          <button type="button" className={`ob-chip ${h.pickup ? "on" : ""}`} aria-pressed={h.pickup} onClick={() => h.setPickup(!h.pickup)}>{c.pickup}</button>
          <button type="button" className={`ob-chip ${h.delivery ? "on" : ""}`} aria-pressed={h.delivery} onClick={() => h.setDelivery(!h.delivery)}>{c.delivery}</button>
        </div>
        <p className="ob-muted">{h.delivery ? c.deliverySub : c.pickupSub}</p>
        {h.delivery && (
          <div className="ob-two">
            <label className="ob-field"><span>{c.fee}</span><input inputMode="decimal" dir="ltr" value={h.fee} onChange={(e) => h.setFee(e.target.value)} /></label>
            <label className="ob-field"><span>{c.freeOver}</span><input inputMode="decimal" dir="ltr" value={h.freeOver} onChange={(e) => h.setFreeOver(e.target.value)} /></label>
          </div>
        )}
        {!(h.pickup || h.delivery) && <p className="ob-error" role="alert">{c.needGet}</p>}
      </section>
      <section className="ob-card ob-handover">
        <h2>{c.payTitle}</h2>
        <div className="ob-chips">
          {WAYS.map((way) => (
            <button key={way} type="button" className={`ob-chip ${h.ways.includes(way) ? "on" : ""}`} aria-pressed={h.ways.includes(way)} onClick={() => h.toggleWay(way)}>{wayLabel[way]}</button>
          ))}
        </div>
        {h.ways.length === 0 && <p className="ob-error" role="alert">{c.needPay}</p>}
      </section>
      {h.error && <p className="ob-error" role="alert">{h.error}</p>}
    </>
  );
}
