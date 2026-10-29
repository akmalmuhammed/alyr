"use client";

// The price list and the sign-up switches (D-032). A change to the price list applies to
// quotes made after it; quotes already made keep their own prices. Each item can also have a
// dollar price, which a card payment through Paddle charges (D-074); left empty, the riyal price
// is converted at the peg (QAR 3.64 to USD 1).

import { useState } from "react";
import { api, appliesLabel, fromDirhams, toDirhams, type Item, type Pricing, type TypeRow } from "./api";

type Row = Omit<Item, "price_text" | "updated_at" | "updated_by"> & { priceText: string; usdText: string; isNew?: boolean };

function rowOf(item: Item): Row {
  // Cents and dirhams are both hundredths, so the same conversion serves the dollar price.
  return { ...item, priceText: fromDirhams(item.price), usdText: item.price_usd === null ? "" : fromDirhams(item.price_usd) };
}

const BLANK: Row = { key: "", name: "", name_ar: "", kind: "monthly", price: 0, priceText: "", price_usd: null, usdText: "", applies: "manual", active: true, sort: 50, isNew: true };

function AppliesSelect({ value, pricing, onChange }: { value: string; pricing: Pricing; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Included when">
      <option value="each_business">Every business</option>
      <option value="each_client">Once per client</option>
      {pricing.products.map((p) => <option key={p.key} value={`product:${p.key}`}>Businesses using {p.name}</option>)}
      {pricing.modules.map((m) => <option key={m.key} value={`module:${m.key}`}>Businesses with {m.name} on</option>)}
      <option value="extra_product">Each product a business adds beyond its first</option>
      <option value="manual">Added by hand</option>
    </select>
  );
}

export function PriceList({ pricing, reload }: { pricing: Pricing; reload: () => Promise<void> }) {
  const [rows, setRows] = useState<Row[]>(() => pricing.items.map(rowOf));
  const [fresh, setFresh] = useState<Row>(BLANK);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const change = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save(row: Row) {
    setMessage(""); setError("");
    const price = toDirhams(row.priceText);
    if (Number.isNaN(price) || price < 0) return setError("Give a price in QAR, 0 or more.");
    const usd = row.usdText.trim() === "" ? null : toDirhams(row.usdText);
    if (usd !== null && (Number.isNaN(usd) || usd < 0)) return setError("Give a price in USD, 0 or more, or leave it empty for the peg.");
    const answer = await api<Item>(`/api/admin/pricing/items/${row.key.trim()}`, "PUT", {
      name: row.name, name_ar: row.name_ar, kind: row.kind, price, price_usd: usd, applies: row.applies, active: row.active, sort: row.sort,
    });
    if (!answer.ok) return setError(answer.error);
    setMessage(`${answer.data.name} saved. New quotes use ${answer.data.price_text}; quotes already made keep their price.`);
    if (row.isNew) setFresh(BLANK);
    await reload();
    setRows((all) => (row.isNew ? [...all, rowOf(answer.data)] : all.map((r) => (r.key === row.key ? rowOf(answer.data) : r))));
  }

  const cells = (row: Row, set: (patch: Partial<Row>) => void) => (
    <>
      <td className="ops-names">
        <input value={row.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name" placeholder="Name" />
        <input value={row.name_ar} onChange={(e) => set({ name_ar: e.target.value })} aria-label="Arabic name" placeholder="الاسم" dir="rtl" />
      </td>
      <td>
        <select value={row.kind} onChange={(e) => set({ kind: e.target.value as Row["kind"] })} aria-label="Charged">
          <option value="monthly">Monthly</option><option value="one_time">Once</option>
        </select>
      </td>
      <td><input className="ops-money" inputMode="decimal" value={row.priceText} onChange={(e) => set({ priceText: e.target.value })} aria-label="Price in QAR" /></td>
      <td><input className="ops-money" inputMode="decimal" value={row.usdText} placeholder="at the peg" onChange={(e) => set({ usdText: e.target.value })} aria-label="Price in USD, for card payments" /></td>
      <td><AppliesSelect value={row.applies} pricing={pricing} onChange={(v) => set({ applies: v })} /></td>
      <td><input className="ops-qty" type="number" min={0} max={10000} value={row.sort} onChange={(e) => set({ sort: Number(e.target.value) || 0 })} aria-label="Order" /></td>
      <td><input type="checkbox" className="ops-tick" checked={row.active} onChange={(e) => set({ active: e.target.checked })} aria-label="In use" /></td>
    </>
  );

  return (
    <section>
      <h2>Price list <span className="sh-count">{rows.length}</span></h2>
      <p className="sh-note ops-lead">
        What ALYR charges and when a new quote includes it. A quote is drafted from this list and then
        priced per client in Clients. Changing a price here never changes a quote already made. A card
        payment through Paddle charges the dollar price of a line still at its list price; any other
        line, or an empty dollar price, is the riyal price at the peg.
      </p>
      {message && <p className="ops-ok" role="status">{message}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}
      <div className="tablewrap"><table className="ops-lines">
        <thead><tr><th>Key</th><th>Name (English · Arabic)</th><th>Charged</th><th>Price (QAR)</th><th>By card (USD)</th><th>Included when</th><th>Order</th><th>In use</th><th /></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="norow">
              <td><code>{row.key}</code></td>
              {cells(row, (patch) => change(row.key, patch))}
              <td><button className="btn small" type="button" onClick={() => save(row)}>Save</button></td>
            </tr>
          ))}
          <tr className="norow ops-new">
            <td><input value={fresh.key} onChange={(e) => setFresh({ ...fresh, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="new_key" aria-label="Key" dir="ltr" /></td>
            {cells(fresh, (patch) => setFresh({ ...fresh, ...patch }))}
            <td><button className="btn small primary" type="button" disabled={!fresh.key || !fresh.name} onClick={() => save(fresh)}>Add</button></td>
          </tr>
        </tbody>
      </table></div>
      <p className="sh-note">Rules: {pricing.items.filter((i) => i.active).map((i) => `${i.name}: ${appliesLabel(i.applies, pricing)}`).join(" · ")}</p>
    </section>
  );
}

export function SignUpSettings({ pricing, reload }: { pricing: Pricing; reload: () => Promise<void> }) {
  const [promise, setPromise] = useState(pricing.promise);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveType(row: TypeRow, patch: Partial<TypeRow>) {
    setMessage(""); setError("");
    const next = { ...row, ...patch };
    const answer = await api(`/api/admin/pricing/types/${row.key}`, "PUT", { availability: next.availability, price_mode: next.price_mode });
    if (!answer.ok) return setError(answer.error);
    setMessage(`${row.name} saved. It applies to owners who sign up from now on.`);
    await reload();
  }

  async function savePromise() {
    setMessage(""); setError("");
    const answer = await api("/api/admin/pricing/promise", "PUT", promise);
    if (!answer.ok) return setError(answer.error);
    setMessage("Promise saved. Quotes that show the promise use it at once.");
    await reload();
  }

  return (
    <section>
      <h2>Who can sign up, and when they see a price</h2>
      <p className="sh-note ops-lead">
        Self-serve owners go through every step at /start. “Set up with ALYR” creates the business and sends
        you a request; types whose screens are not built yet can only be set up with ALYR. A business keeps the
        path it started on if you change this later.
      </p>
      {message && <p className="ops-ok" role="status">{message}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Type of business</th><th>Sign-up</th><th>Price shown</th></tr></thead>
        <tbody>
          {pricing.types.map((row) => (
            <tr key={row.key} className="norow">
              <td><b>{row.name}</b><br /><small dir="rtl">{row.name_ar}</small></td>
              <td>
                <select value={row.availability} onChange={(e) => saveType(row, { availability: e.target.value as TypeRow["availability"] })} aria-label={`${row.name} sign-up`}>
                  <option value="self_serve" disabled={!row.can_self_serve}>Self-serve, every step{row.can_self_serve ? "" : " (no screens yet)"}</option>
                  <option value="with_alyr">Set up with ALYR</option>
                  <option value="hidden">Not offered</option>
                </select>
              </td>
              <td>
                <select value={row.price_mode} onChange={(e) => saveType(row, { price_mode: e.target.value as TypeRow["price_mode"] })} aria-label={`${row.name} price shown`}>
                  <option value="prepared">After ALYR prepares it</option>
                  <option value="automatic">Straight away, from the price list</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <h2 className="ops-gap">The promise under the price</h2>
      <p className="sh-note ops-lead">Shown on every quote that has “Show the promise” ticked. Leave both empty to show none.</p>
      <form className="ops-form" onSubmit={(e) => { e.preventDefault(); savePromise(); }}>
        <label className="ops-field ops-wide"><span>English</span><input value={promise.en} onChange={(e) => setPromise({ ...promise, en: e.target.value })} /></label>
        <label className="ops-field ops-wide"><span>Arabic</span><input dir="rtl" value={promise.ar} onChange={(e) => setPromise({ ...promise, ar: e.target.value })} /></label>
        <button className="btn primary" type="submit">Save promise</button>
      </form>
    </section>
  );
}
