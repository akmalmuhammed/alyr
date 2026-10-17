"use client";

// ALYR staff who may use the console. Back-office sign-ins last 12 hours (D-033).

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

type Member = { email: string; name: string; added_by: string; created_at: string; last_sign_in: string | null };

export default function StaffPage() {
  const [staff, setStaff] = useState<Member[]>([]);
  const [me, setMe] = useState("");
  const [form, setForm] = useState({ email: "", name: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<{ staff: Member[]; me: string }>("/api/admin/staff");
    if (answer.ok) { setStaff(answer.data.staff); setMe(answer.data.me); }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(""); setError("");
    const answer = await api<{ staff: Member[] }>("/api/admin/staff", "POST", form);
    if (!answer.ok) return setError(answer.error);
    setStaff(answer.data.staff);
    setMessage(`${form.email} can now sign in to the console.`);
    setForm({ email: "", name: "" });
  }

  async function remove(email: string) {
    setMessage(""); setError("");
    const answer = await api<{ staff: Member[] }>(`/api/admin/staff/${encodeURIComponent(email)}`, "DELETE");
    if (!answer.ok) return setError(answer.error);
    setStaff(answer.data.staff);
    setMessage(`${email} can no longer use the console.`);
  }

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Settings · staff</span>
        <h1>Staff</h1>
        <p>Who can use this console. A console sign-in lasts 12 hours; every change anyone makes is in the audit log.</p>
      </header>
      {message && <p className="ops-ok" role="status">{message}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}
      <div className="tablewrap"><table>
        <thead><tr><th>Person</th><th>Added</th><th>Last sign-in</th><th /></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.email} className="norow">
              <td><b>{s.name || s.email.split("@")[0]}</b><br /><small>{s.email}</small></td>
              <td>{new Date(s.created_at).toLocaleDateString("en-GB")}<br /><small>{s.added_by ? `by ${s.added_by}` : "first staff"}</small></td>
              <td>{s.last_sign_in ? new Date(s.last_sign_in).toLocaleString("en-GB") : "never"}</td>
              <td className="r">{s.email !== me && <button className="btn small ghost" type="button" onClick={() => remove(s.email)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <section>
        <h2>Add someone</h2>
        <form className="ops-form" onSubmit={add}>
          <label className="ops-field"><span>Work email</span><input type="email" required dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="ops-field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <button className="btn primary" type="submit">Add to staff</button>
        </form>
        <p className="sh-note">Roles (sales, support, finance) and two-step sign-in come in level 2. Until then everyone on this list can do everything.</p>
      </section>
    </>
  );
}
