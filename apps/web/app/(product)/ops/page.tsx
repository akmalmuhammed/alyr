"use client";

import { useCallback, useEffect, useState } from "react";
import "../_workspace/shell.css";
import "./ops.css";
import { api, type ClientSummary, type Pricing } from "./api";
import { Clients } from "./Clients";
import { PriceList, SignUpSettings } from "./PriceList";

// ALYR's back office, for ALYR staff only (the API refuses anyone else). English only:
// it is an internal tool. Clients and their price, the help shops asked for, the price
// list, and who may sign up on their own (D-027, D-032).

type Business = {
  id: string; name: string; slug: string; created_at: string; modules: string[]; products: string[];
  members: number; open_requests: number; whatsapp_connected: boolean;
};
type Request = {
  id: string; business: string; product_key: string; step_key: string; note: string;
  requested_by: string; status: string; created_at: string;
};
type Product = { key: string; name: { en: string }; status: string };
type Tab = "clients" | "asks" | "prices" | "signup";

const TABS: [Tab, string][] = [["clients", "Clients"], ["asks", "Asked for help"], ["prices", "Price list"], ["signup", "Sign-up"]];
const EMPTY = { name: "", name_ar: "", slug: "", owner_name: "", owner_email: "", products: ["chat"] as string[], client_id: "" };

export default function BackOffice() {
  const [tab, setTab] = useState<Tab>("clients");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState("");
  const [round, setRound] = useState(0);

  const loadPricing = useCallback(async () => {
    const answer = await api<Pricing>("/api/admin/pricing");
    if (answer.ok) setPricing(answer.data);
  }, []);

  const load = useCallback(async () => {
    const [b, r, w, c] = await Promise.all([
      fetch("/api/admin/businesses", { cache: "no-store" }),
      fetch("/api/admin/setup-requests", { cache: "no-store" }),
      fetch("/api/workspace", { cache: "no-store" }),
      fetch("/api/admin/clients", { cache: "no-store" }),
    ]);
    if (!b.ok) {
      setDenied(b.status === 403 ? "This page is for ALYR staff." : "Sign in as ALYR staff to use the back office.");
      return;
    }
    setDenied("");
    setBusinesses((await b.json()).businesses);
    setRequests((await r.json()).requests);
    if (w.ok) setProducts((await w.json()).products);
    if (c.ok) setClients((await c.json()).clients);
    await loadPricing();
  }, [loadPricing]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/businesses", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, client_id: form.client_id || null }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof data.detail === "string" ? data.detail : "That did not work. Check the fields.");
      return;
    }
    setMessage(`Created ${form.name}. ${form.owner_email} can now sign in.`);
    setForm(EMPTY);
    setRound((n) => n + 1);
    load();
  }

  async function done(id: string) {
    await fetch(`/api/admin/setup-requests/${id}/done`, { method: "POST" });
    load();
  }

  const field = (key: "name" | "name_ar" | "slug" | "owner_name" | "owner_email", label: string, extra = {}) => (
    <label className="ops-field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key !== "name_ar"} {...extra} />
    </label>
  );

  if (denied) return <div className="sh-empty"><p>{denied} <a href="/login">Sign in</a></p></div>;

  const waitingOnOwner = clients.filter((c) => c.quote?.status === "published").length;
  const toPrice = clients.filter((c) => c.businesses.length > 0 && (!c.quote || c.quote.status === "draft")).length;
  const stats: [string, number][] = [
    ["Clients", clients.length],
    ["Shops on ALYR", businesses.length],
    ["To price", toPrice],
    ["Price waiting for owner", waitingOnOwner],
    ["Asked for help", requests.length],
  ];

  return (
    <div className="sh ops">
      <div className="sh-sheet">
        <header className="sh-top">
          <div className="sh-crumbs">
            <svg className="sh-mark" viewBox="0 0 190 160" aria-hidden="true">
              <polygon fill="currentColor" points="50,0 180,0 130,62 0,62" />
              <polygon fill="currentColor" points="0,72 126,72 39,160" />
              <polygon fill="#B7F34A" points="134,72 190,72 142,160 46,160" />
            </svg>
            <b>ALYR</b><i>/</i><span>Back office</span>
          </div>
          <span className="spacer" />
          <span className="sh-live on"><span className="sh-dot" />Staff only</span>
        </header>
        <div className="sh-scroll">
    <main className="sh-main sh-enter ops-main">
      <header className="sh-head">
        <span className="sh-eyebrow">Internal · ALYR staff</span>
        <h1>Back office</h1>
        <p>Clients and their price, the help shops asked for, the price list, and who may sign up on their own.</p>
      </header>

      <section className="ops-stats" style={{ "--i": 1 } as React.CSSProperties}>
        {stats.map(([label, value]) => (
          <div key={label} className="sh-tile"><span>{label}</span><b className="num">{value}</b></div>
        ))}
      </section>

      <nav className="tm-seg ops-tabs" role="tablist" aria-label="Back office">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {label}{key === "asks" && requests.length > 0 && <span className="num"> {requests.length}</span>}
          </button>
        ))}
      </nav>

      {tab === "clients" && (
        <>
          <Clients key={round} pricing={pricing} onChange={load} />
          <section>
            <h2>Set up a new shop</h2>
            <form className="ops-form" onSubmit={create}>
              {field("name", "Shop name")}
              {field("name_ar", "Arabic name", { dir: "rtl" })}
              {field("slug", "Short name for links (a-z, 0-9, dashes)", { pattern: "[a-z0-9-]{2,40}", dir: "ltr" })}
              {field("owner_name", "Owner's name")}
              {field("owner_email", "Owner's email", { type: "email", dir: "ltr" })}
              <label className="ops-field">
                <span>Client (who pays)</span>
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">A new client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>Add to {c.name}</option>)}
                </select>
              </label>
              <fieldset className="ops-field">
                <span>Switch on</span>
                {products.filter((p) => p.status !== "coming").map((p) => (
                  <label key={p.key} className="ops-check">
                    <input type="checkbox" checked={form.products.includes(p.key)}
                      onChange={(e) => setForm({
                        ...form,
                        products: e.target.checked ? [...form.products, p.key] : form.products.filter((k) => k !== p.key),
                      })} />
                    {p.name.en}
                  </label>
                ))}
              </fieldset>
              <button className="btn primary" type="submit">Create shop</button>
              {message && <p className="ops-ok" role="status">{message}</p>}
            </form>
          </section>
        </>
      )}

      {tab === "asks" && (
        <section>
          <h2>Asked for help <span className="sh-count">{requests.length}</span></h2>
          {requests.length === 0 ? <p className="empty-note sh-note">Nothing waiting. Every ask is answered.</p> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Shop</th><th>Product · step</th><th>Note</th><th>Asked by</th><th /></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="norow">
                    <td><b>{r.business}</b><br /><small>{new Date(r.created_at).toLocaleString("en-GB")}</small></td>
                    <td>{r.product_key} · {r.step_key || "general"}</td>
                    <td dir="auto">{r.note}</td>
                    <td>{r.requested_by}</td>
                    <td className="r"><button className="btn small" onClick={() => done(r.id)}>Mark done</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      )}

      {tab === "prices" && pricing && <PriceList pricing={pricing} reload={loadPricing} />}
      {tab === "signup" && pricing && <SignUpSettings pricing={pricing} reload={loadPricing} />}
    </main>
        </div>
      </div>
    </div>
  );
}
