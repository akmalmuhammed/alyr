"use client";

// Clients: each client, their businesses and their price (D-032), and setting up a new
// shop for a new or existing client. `?client=<id>` opens one client straight away.

import { useCallback, useEffect, useState } from "react";
import { api, type ClientSummary, type Pricing } from "../api";
import { Clients } from "../Clients";

type Product = { key: string; name: { en: string }; status: string };
const EMPTY = { name: "", name_ar: "", slug: "", owner_name: "", owner_email: "", products: ["chat"] as string[], client_id: "" };

export default function ClientsPage() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [initial, setInitial] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    const [p, c, w] = await Promise.all([
      api<Pricing>("/api/admin/pricing"),
      api<{ clients: ClientSummary[] }>("/api/admin/clients"),
      api<{ products: Product[] }>("/api/workspace"),
    ]);
    if (p.ok) setPricing(p.data);
    if (c.ok) setClients(c.data.clients);
    if (w.ok) setProducts(w.data.products);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      setInitial(new URLSearchParams(window.location.search).get("client") ?? "");
      load();
    }, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const answer = await api("/api/admin/businesses", "POST", { ...form, client_id: form.client_id || null });
    if (!answer.ok) return setMessage(answer.error);
    setMessage(`Created ${form.name}. ${form.owner_email} can now sign in.`);
    setForm(EMPTY);
    setRound((n) => n + 1);
    load();
  }

  const field = (key: "name" | "name_ar" | "slug" | "owner_name" | "owner_email", label: string, extra = {}) => (
    <label className="ops-field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key !== "name_ar"} {...extra} />
    </label>
  );

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Clients · {clients.length}</span>
        <h1>Clients</h1>
        <p>Who pays, their businesses, where each one is in onboarding, and their price.</p>
      </header>
      {initial !== null && <Clients key={round} pricing={pricing} onChange={load} initialClient={initial || undefined} />}
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
            {/* ALYR Agent is included for every business, so it has no box. */}
            {products.filter((p) => p.status !== "included").map((p) => (
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
  );
}
