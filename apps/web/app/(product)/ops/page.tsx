"use client";

import { useCallback, useEffect, useState } from "react";
import "../_workspace/shell.css";

// ALYR's back office, for ALYR staff only (the API refuses anyone else). English only:
// it is an internal tool.

type Business = {
  id: string; name: string; slug: string; created_at: string; modules: string[]; products: string[];
  members: number; open_requests: number; whatsapp_connected: boolean;
};
type Request = {
  id: string; business: string; product_key: string; step_key: string; note: string;
  requested_by: string; status: string; created_at: string;
};
type Product = { key: string; name: { en: string }; status: string };

const EMPTY = { name: "", name_ar: "", slug: "", owner_name: "", owner_email: "", products: ["chat"] as string[] };

export default function BackOffice() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [message, setMessage] = useState("");
  const [denied, setDenied] = useState("");

  const load = useCallback(async () => {
    const [b, r, w] = await Promise.all([
      fetch("/api/admin/businesses", { cache: "no-store" }),
      fetch("/api/admin/setup-requests", { cache: "no-store" }),
      fetch("/api/workspace", { cache: "no-store" }),
    ]);
    if (!b.ok) {
      setDenied(b.status === 403 ? "This page is for ALYR staff." : "Sign in as ALYR staff to use the back office.");
      return;
    }
    setDenied("");
    setBusinesses((await b.json()).businesses);
    setRequests((await r.json()).requests);
    if (w.ok) setProducts((await w.json()).products);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/admin/businesses", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(typeof data.detail === "string" ? data.detail : "That did not work. Check the fields.");
      return;
    }
    setMessage(`Created ${form.name}. ${form.owner_email} can now sign in.`);
    setForm(EMPTY);
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

  return (
    <div className="ops">
      <header className="sh-head">
        <h1>ALYR back office</h1>
        <p>Shops on ALYR, the help they asked for, and setting up a new one.</p>
      </header>

      <section>
        <h2>Asked for help ({requests.length})</h2>
        {requests.length === 0 ? <p className="sh-note">Nothing waiting.</p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Shop</th><th>Product · step</th><th>Note</th><th>Asked by</th><th /></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="norow">
                  <td><b>{r.business}</b><br /><span className="mono">{new Date(r.created_at).toLocaleString("en-GB")}</span></td>
                  <td>{r.product_key} · {r.step_key || "general"}</td>
                  <td dir="auto">{r.note}</td>
                  <td>{r.requested_by}</td>
                  <td><button className="btn small" onClick={() => done(r.id)}>Mark done</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section>
        <h2>Shops ({businesses.length})</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Shop</th><th>Products</th><th>WhatsApp</th><th>Team</th><th>Open asks</th></tr></thead>
          <tbody>
            {businesses.map((b) => (
              <tr key={b.id} className="norow">
                <td><b>{b.name}</b><br /><span className="mono">{b.slug}</span></td>
                <td>{b.products.join(", ") || "none"}</td>
                <td>{b.whatsapp_connected ? "Connected" : "Not yet"}</td>
                <td className="num">{b.members}</td>
                <td className="num">{b.open_requests}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      <section>
        <h2>Set up a new shop</h2>
        <form className="ops-form" onSubmit={create}>
          {field("name", "Shop name")}
          {field("name_ar", "Arabic name", { dir: "rtl" })}
          {field("slug", "Short name for links (a-z, 0-9, dashes)", { pattern: "[a-z0-9-]{2,40}", dir: "ltr" })}
          {field("owner_name", "Owner's name")}
          {field("owner_email", "Owner's email", { type: "email", dir: "ltr" })}
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
          {message && <p className="sh-note" role="status">{message}</p>}
        </form>
      </section>
    </div>
  );
}
