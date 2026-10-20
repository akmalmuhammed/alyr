"use client";

// Clients and their price (D-032). A client is who pays; they own one or more
// businesses. Each client has one open quote at a time: ALYR edits it here, publishes
// it, and the owner sees it live on the last step of onboarding and accepts it.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api, appliesLabel, fromDirhams, qar, STATUS_LABEL, STEP_NAME, toDirhams, totals,
  type ClientDetail, type ClientSummary, type Kind, type Line, type Pricing, type Quote,
} from "./api";
import { BusinessTemplate } from "./BusinessTemplate";

type DraftLine = Line & { priceText: string };
type Draft = { period_months: number; discount_pct: number; show_promise: boolean; note: string; lines: DraftLine[] };

function draftOf(quote: Quote): Draft {
  return {
    period_months: quote.period_months, discount_pct: quote.discount_pct,
    show_promise: quote.show_promise, note: quote.note,
    lines: quote.lines.map((l) => ({ ...l, priceText: fromDirhams(l.unit_price) })),
  };
}

function progress(b: ClientSummary["businesses"][number]) {
  if (b.onboarded) return <span className="sh-pill active">Set up</span>;
  const at = b.steps.indexOf(b.onboarding_step);
  return (
    <span className="sh-pill wait">
      {STEP_NAME[b.onboarding_step] ?? "Not started"}{at >= 0 && ` · ${at + 1}/${b.steps.length}`}
    </span>
  );
}

export function Clients({ pricing, onChange, initialClient }: { pricing: Pricing | null; onChange: () => void; initialClient?: string }) {
  const [list, setList] = useState<ClientSummary[]>([]);
  const [openId, setOpenId] = useState("");
  const [templateFor, setTemplateFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [profile, setProfile] = useState<Pick<ClientDetail, "name" | "contact_name" | "contact_email" | "contact_phone" | "note" | "price_mode"> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState({ item: "", business: "" });

  const loadList = useCallback(async () => {
    const answer = await api<{ clients: ClientSummary[] }>("/api/admin/clients");
    if (answer.ok) setList(answer.data.clients);
  }, []);

  const show = useCallback((data: ClientDetail) => {
    setDetail(data);
    const open = data.quotes.find((q) => q.status === "draft" || q.status === "published");
    setDraft(open ? draftOf(open) : null);
    setDirty(false);
    setProfile({
      name: data.name, contact_name: data.contact_name, contact_email: data.contact_email,
      contact_phone: data.contact_phone, note: data.note, price_mode: data.price_mode,
    });
  }, []);

  const openClient = useCallback(async (id: string) => {
    setOpenId(id); setMessage(""); setError("");
    const answer = await api<ClientDetail>(`/api/admin/clients/${id}`);
    if (answer.ok) show(answer.data);
  }, [show]);

  useEffect(() => {
    const first = setTimeout(() => {
      loadList();
      if (initialClient) openClient(initialClient);
    }, 0);
    return () => clearTimeout(first);
  }, [loadList, openClient, initialClient]);

  async function run(work: () => Promise<{ ok: boolean; data: ClientDetail; error: string }>, done: string) {
    setBusy(true); setMessage(""); setError("");
    try {
      const answer = await work();
      if (!answer.ok) return setError(answer.error);
      show(answer.data);
      setMessage(done);
      loadList();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const open = detail?.quotes.find((q) => q.status === "draft" || q.status === "published");
  const latest = detail?.quotes.find((q) => q.status !== "withdrawn");
  const businessName = useMemo(
    () => Object.fromEntries((detail?.businesses ?? []).map((b) => [b.id, b.name])),
    [detail],
  );

  function edit(change: Partial<Draft>) {
    if (!draft) return;
    setDraft({ ...draft, ...change });
    setDirty(true);
  }
  function editLine(i: number, change: Partial<DraftLine>) {
    if (!draft) return;
    edit({ lines: draft.lines.map((l, k) => (k === i ? { ...l, ...change } : l)) });
  }
  function addFromList() {
    const item = pricing?.items.find((x) => x.key === pick.item);
    if (!draft || !item) return;
    const perClient = item.applies === "each_client";
    const business = perClient ? null : pick.business || detail?.businesses[0]?.id || null;
    edit({ lines: [...draft.lines, { business_id: business, item_key: item.key, name: item.name, name_ar: item.name_ar, kind: item.kind, quantity: 1, unit_price: item.price, priceText: fromDirhams(item.price) }] });
  }
  function addCustom(kind: Kind, discount = false) {
    if (!draft) return;
    edit({ lines: [...draft.lines, { business_id: null, item_key: null, name: discount ? "Discount" : "", name_ar: discount ? "خصم" : "", kind, quantity: 1, unit_price: discount ? -1000 : 0, priceText: discount ? "-10" : "0" }] });
  }

  const saveQuote = () => open && draft && run(
    () => api<ClientDetail>(`/api/admin/quotes/${open.id}`, "PUT", {
      ...draft,
      lines: draft.lines.map(({ business_id, item_key, name, name_ar, kind, quantity, unit_price }) => ({ business_id, item_key, name, name_ar, kind, quantity, unit_price })),
    }),
    open.status === "published" ? "Saved. The owner sees the new price within a few seconds." : "Draft saved.",
  );
  const act = (action: "publish" | "unpublish" | "withdraw") => open && run(
    () => api<ClientDetail>(`/api/admin/quotes/${open.id}/${action}`, "POST"),
    { publish: "Published. The owner sees it now.", unpublish: "Back to a draft. The owner sees “being prepared”.", withdraw: "Withdrawn." }[action],
  );
  const newQuote = (start_from: "price_list" | "copy") => detail && run(
    () => api<ClientDetail>(`/api/admin/clients/${detail.id}/quotes`, "POST", { start_from }),
    "New draft made.",
  );
  const saveProfile = () => detail && profile && run(
    () => api<ClientDetail>(`/api/admin/clients/${detail.id}`, "PATCH", profile),
    "Client saved.",
  );

  const sums = draft ? totals(draft.lines, draft.period_months, draft.discount_pct) : null;
  const badLine = draft?.lines.some((l) => !l.name.trim() || Number.isNaN(l.unit_price) || l.quantity < 1);

  return (
    <div className="ops-split">
      {!detail && <section className="ops-list">
        <h2>Clients <span className="sh-count">{list.length}</span></h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Client</th><th>Businesses · onboarding</th><th>Price</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className={`ops-row ${openId === c.id ? "on" : ""}`} onClick={() => openClient(c.id)}
                tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openClient(c.id); }}>
                <td><b>{c.name}</b><br /><small>{c.contact_email || "no contact yet"}</small></td>
                <td>
                  {c.businesses.length === 0 && <small>none</small>}
                  {c.businesses.map((b) => (
                    <div key={b.id} className="ops-biz"><span>{b.name}<small> · {b.type_name || "set up by ALYR"}</small></span>{progress(b)}</div>
                  ))}
                </td>
                <td>
                  {c.quote ? (
                    <>
                      <b className="num">{c.quote.totals.monthly_total_text}</b><small> /mo</small><br />
                      <span className={`sh-pill ${c.quote.status === "accepted" ? "active" : c.quote.status === "published" ? "wait" : "idle"}`}>
                        {c.quote.status === "draft" ? "Draft" : c.quote.status === "published" ? "Waiting for owner" : "Accepted"}
                      </span>
                    </>
                  ) : <small>no price yet</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="sh-note">Choose a client to see their businesses and set their price.</p>
      </section>}

      {detail && <section className="ops-detail" aria-live="polite">
          <>
            <button className="btn ghost small ops-back" type="button" onClick={() => { setDetail(null); setOpenId(""); loadList(); }}>← All clients</button>
            <header className="ops-detail-head">
              <div>
                <span className="sh-eyebrow">Client since {new Date(detail.created_at).toLocaleDateString("en-GB")}</span>
                <h2 className="ops-title">{detail.name}</h2>
              </div>
              <span className="ops-head-actions">
                <span className={`sh-pill ${detail.effective_price_mode === "automatic" ? "active" : "idle"}`}>
                  Price {detail.effective_price_mode === "automatic" ? "shown automatically" : "prepared by ALYR"}
                </span>
                <a className="btn small ghost" href={`/ops/audit?client=${detail.id}`}>History</a>
              </span>
            </header>
            {message && <p className="ops-ok" role="status">{message}</p>}
            {error && <p className="ops-error" role="alert">{error}</p>}

            <h3>Businesses</h3>
            <div className="tablewrap"><table>
              <thead><tr><th>Business</th><th>Type · area</th><th>Products</th><th>Onboarding</th><th>WhatsApp</th><th>Catalog</th></tr></thead>
              <tbody>
                {detail.businesses.map((b) => (
                  <tr key={b.id} className="norow">
                    <td><b>{b.name}</b><br /><small>{b.slug}</small></td>
                    <td>{b.type_name || "—"}<br /><small>{b.area || "—"}{b.way === "assisted" ? " · with ALYR" : ""}</small></td>
                    <td>{b.products.join(", ") || "none"}</td>
                    <td>{progress(b)}</td>
                    <td><span className={`sh-pill ${b.whatsapp_connected ? "active" : "idle"}`}>{b.whatsapp_connected ? "Connected" : "Not connected"}</span></td>
                    <td><button type="button" className="btn small ghost" aria-expanded={templateFor === b.id} onClick={() => setTemplateFor(templateFor === b.id ? null : b.id)}>Template</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {templateFor && detail.businesses.some((b) => b.id === templateFor) && (
              <BusinessTemplate key={templateFor} businessId={templateFor} businessName={businessName[templateFor]} onDone={onChange} onClose={() => setTemplateFor(null)} />
            )}

            <h3>Price</h3>
            {open && draft && sums ? (
              <div className="ops-quote">
                <div className="ops-quote-top">
                  <span className={`sh-pill ${open.status === "published" ? "wait" : "idle"}`}>Quote {open.number} · {STATUS_LABEL[open.status]}</span>
                  <small>Last change {new Date(open.updated_at).toLocaleString("en-GB")} by {open.updated_by || "—"}</small>
                </div>
                <div className="tablewrap"><table className="ops-lines">
                  <thead><tr><th>For</th><th>Line (English · Arabic)</th><th>Charged</th><th>Qty</th><th>Price each (QAR)</th><th className="r">Amount</th><th /></tr></thead>
                  <tbody>
                    {draft.lines.map((l, i) => (
                      <tr key={i} className="norow">
                        <td>
                          <select value={l.business_id ?? ""} onChange={(e) => editLine(i, { business_id: e.target.value || null })} aria-label="For">
                            <option value="">Whole client</option>
                            {detail.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </td>
                        <td className="ops-names">
                          <input value={l.name} onChange={(e) => editLine(i, { name: e.target.value })} aria-label="Line name" placeholder="Name" />
                          <input value={l.name_ar} onChange={(e) => editLine(i, { name_ar: e.target.value })} aria-label="Arabic name" placeholder="الاسم" dir="rtl" />
                        </td>
                        <td>
                          <select value={l.kind} onChange={(e) => editLine(i, { kind: e.target.value as Kind })} aria-label="Charged">
                            <option value="monthly">Monthly</option><option value="one_time">Once</option>
                          </select>
                        </td>
                        <td><input className="ops-qty" type="number" min={1} max={1000} value={l.quantity} onChange={(e) => editLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} aria-label="Quantity" /></td>
                        <td><input className="ops-money" inputMode="decimal" value={l.priceText}
                          onChange={(e) => editLine(i, { priceText: e.target.value, unit_price: toDirhams(e.target.value) })} aria-label="Price each" /></td>
                        <td className="r num">{Number.isNaN(l.unit_price) ? "—" : qar(l.quantity * l.unit_price)}</td>
                        <td><button className="btn ghost small" type="button" onClick={() => edit({ lines: draft.lines.filter((_, k) => k !== i) })} aria-label={`Remove ${l.name}`}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <div className="ops-add">
                  <select value={pick.item} onChange={(e) => setPick({ ...pick, item: e.target.value })} aria-label="Price list item">
                    <option value="">Add from the price list…</option>
                    {pricing?.items.filter((x) => x.active).map((x) => <option key={x.key} value={x.key}>{x.name} · {x.price_text}{x.kind === "monthly" ? "/mo" : " once"}</option>)}
                  </select>
                  {detail.businesses.length > 1 && (
                    <select value={pick.business} onChange={(e) => setPick({ ...pick, business: e.target.value })} aria-label="For business">
                      {detail.businesses.map((b) => <option key={b.id} value={b.id}>for {b.name}</option>)}
                    </select>
                  )}
                  <button className="btn small" type="button" disabled={!pick.item} onClick={addFromList}>Add</button>
                  <span className="spacer" />
                  <button className="btn ghost small" type="button" onClick={() => addCustom("monthly")}>+ Custom line</button>
                  <button className="btn ghost small" type="button" onClick={() => addCustom("monthly", true)}>+ Discount line</button>
                </div>

                <div className="ops-terms">
                  <label className="ops-field"><span>Client pays every</span>
                    <select value={draft.period_months} onChange={(e) => edit({ period_months: Number(e.target.value) })}>
                      {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? "month" : `${m} months`}</option>)}
                    </select>
                  </label>
                  <label className="ops-field"><span>Discount on monthly items (%)</span>
                    <input type="number" min={0} max={100} value={draft.discount_pct} onChange={(e) => edit({ discount_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                  </label>
                  <label className="ops-check"><input type="checkbox" checked={draft.show_promise} onChange={(e) => edit({ show_promise: e.target.checked })} />Show the promise</label>
                  <label className="ops-field ops-wide"><span>Note the owner sees (optional)</span>
                    <input value={draft.note} onChange={(e) => edit({ note: e.target.value })} dir="auto" placeholder="For example: as agreed at the shop, first month free" />
                  </label>
                </div>

                <dl className="ops-sum">
                  <div><dt>Monthly</dt><dd className="num">{qar(sums.monthly)}</dd></div>
                  {sums.discount > 0 && <div><dt>Discount {draft.discount_pct}%</dt><dd className="num">−{qar(sums.discount)}</dd></div>}
                  <div className="big"><dt>Client pays a month</dt><dd className="num">{qar(sums.monthlyTotal)}</dd></div>
                  {draft.period_months > 1 && <div><dt>Every {draft.period_months} months</dt><dd className="num">{qar(sums.periodTotal)}</dd></div>}
                  <div><dt>Once</dt><dd className="num">{qar(sums.once)}</dd></div>
                </dl>

                <div className="ops-actions">
                  <button className="btn primary" type="button" disabled={!dirty || busy || badLine} onClick={saveQuote}>
                    {open.status === "published" ? "Save · owner sees it live" : "Save draft"}
                  </button>
                  {open.status === "draft"
                    ? <button className="btn volt" type="button" disabled={busy || dirty || draft.lines.length === 0} onClick={() => act("publish")} title={dirty ? "Save first" : ""}>Publish to the owner</button>
                    : <button className="btn" type="button" disabled={busy} onClick={() => act("unpublish")}>Take back to draft</button>}
                  <span className="spacer" />
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => act("withdraw")}>Withdraw</button>
                </div>
                {badLine && <p className="ops-error">Every line needs a name and a price.</p>}
              </div>
            ) : (
              <div className="ops-quote none">
                <p className="sh-note">
                  {latest?.status === "accepted"
                    ? `Quote ${latest.number} was accepted by ${latest.accepted_by || "the owner"} on ${new Date(latest.accepted_at ?? "").toLocaleDateString("en-GB")}: ${latest.totals.monthly_total_text} a month. To change the price, make a new quote; the owner accepts it again.`
                    : "No open quote. The owner sees “ALYR is preparing your price”."}
                </p>
                <div className="ops-actions">
                  <button className="btn primary" type="button" disabled={busy} onClick={() => newQuote("price_list")}>New quote from the price list</button>
                  {latest && <button className="btn" type="button" disabled={busy} onClick={() => newQuote("copy")}>Copy quote {latest.number}</button>}
                </div>
                {detail.draft_preview.length > 0 && (
                  <p className="sh-note">From today’s price list it would start with: {detail.draft_preview.map((l) => `${l.name}${l.business && detail.businesses.length > 1 ? ` (${l.business})` : ""} ${qar(l.unit_price)}`).join(", ")}.</p>
                )}
              </div>
            )}

            {detail.quotes.filter((q) => q.id !== open?.id).length > 0 && (
              <>
                <h3>Earlier quotes</h3>
                <ul className="ops-history">
                  {detail.quotes.filter((q) => q.id !== open?.id).map((q) => (
                    <li key={q.id}>
                      <b>Quote {q.number}</b> · {STATUS_LABEL[q.status]} · <span className="num">{q.totals.monthly_total_text}</span>/mo
                      {q.accepted_at && <small> · accepted {new Date(q.accepted_at).toLocaleDateString("en-GB")} by {q.accepted_by}</small>}
                      <small> · {q.lines.map((l) => `${l.name}${l.business_id && businessName[l.business_id] && detail.businesses.length > 1 ? ` (${businessName[l.business_id]})` : ""}`).join(", ")}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3>Client details</h3>
            {profile && (
              <form className="ops-form" onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
                <label className="ops-field"><span>Client name (company)</span><input value={profile.name} required onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
                <label className="ops-field"><span>Contact person</span><input value={profile.contact_name} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} /></label>
                <label className="ops-field"><span>Contact email</span><input type="email" dir="ltr" value={profile.contact_email} onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })} /></label>
                <label className="ops-field"><span>Contact phone</span><input dir="ltr" value={profile.contact_phone} onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })} /></label>
                <label className="ops-field"><span>When the owner sees a price</span>
                  <select value={profile.price_mode ?? ""} onChange={(e) => setProfile({ ...profile, price_mode: (e.target.value || null) as ClientDetail["price_mode"] })}>
                    <option value="">As their business type says</option>
                    <option value="prepared">Prepared by ALYR first</option>
                    <option value="automatic">Straight away, from the price list</option>
                  </select>
                </label>
                <label className="ops-field ops-wide"><span>Internal note (only ALYR sees it)</span><input value={profile.note} onChange={(e) => setProfile({ ...profile, note: e.target.value })} /></label>
                <button className="btn primary" type="submit" disabled={busy}>Save client</button>
              </form>
            )}
            <p className="sh-note">Price list rules for reference: {pricing?.items.filter((x) => x.active).map((x) => `${x.name} (${appliesLabel(x.applies, pricing)})`).join(" · ")}</p>
          </>
      </section>}
    </div>
  );
}
