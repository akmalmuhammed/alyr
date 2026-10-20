"use client";

// Templates (ALY-148, D-039; specs/012-feature-engine): how ALYR serves a new kind of client
// without a release. A template is a kind of business as a configuration of the Catalog: which
// features start on, what the section is called, how the order page lays out, how a new item
// runs out, the starter categories and the starter fields. ALYR's own (the types it ships) are
// read only; "Make a copy" starts one of your own from the closest, which is changed and saved.
// A template is then picked when a shop is created, or later from a client's businesses (a
// preview says what it will add; it never removes anything). Every change is on the audit log.

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

type Feature = {
  key: string; name: string; name_ar: string; hint: string; hint_ar: string; default: boolean;
  depends_on: string[]; kind: "switch" | "choice"; config: Record<string, string>; choices: Record<string, string[]>;
};
type Group = { key: string; name: string; name_ar: string; features: Feature[] };
type Seed = {
  key: string; label: string; label_ar: string; kind: string; applies_to: string;
  choices: { label: string; label_ar: string }[]; shown: boolean; searchable: boolean; required: boolean; unit: string;
};
type Template = {
  key: string; name: string; name_ar: string; note: string; note_ar: string; builtin: boolean; based_on: string;
  offered: boolean; archived: boolean; section: string; section_ar: string; sub: string; sub_ar: string;
  layout_style: string; rule: string; unit: string; low_stock_at: number; sold_out: string;
  lead_days: number | null; lead_cutoff: string; focus: string[];
  features: Record<string, { enabled: boolean; config: Record<string, string> }>;
  categories: { name: string; name_ar: string }[]; fields: Seed[]; shops: number;
};
type Listing = {
  builtin: Template[]; made: Template[]; types: { key: string; name: string }[];
  quick_start: { en: string; ar: string };
  registry: {
    groups: Group[]; rules: { key: string; feature: string }[]; styles: string[]; units: string[];
    field_kinds: string[]; field_places: string[]; limits: { categories: number; fields: number };
  };
};

const RULE_WORDS: Record<string, string> = { always: "Always available", switch: "On or off", count: "Counted in stock", daily_limit: "A number each day" };
const STYLE_WORDS: Record<string, string> = { menu: "Menu", grid: "Photo grid", list: "Compact list", table: "Table" };
const UNIT_WORDS: Record<string, string> = { piece: "Piece", kg: "Kilo", box: "Box", pack: "Pack", portion: "Portion", hour: "Hour" };
const KIND_WORDS: Record<string, string> = { text: "Text", number: "A number", choice: "One from a list", yes_no: "Yes or no", date: "A date" };

const onCount = (t: Template) => Object.values(t.features).filter((f) => f.enabled).length;

/** Switching a feature on switches on what it needs; switching one off switches off what needs it. */
function toggled(draft: Template, groups: Group[], key: string, on: boolean): Template["features"] {
  const all = groups.flatMap((g) => g.features);
  const next = { ...draft.features };
  const set = (k: string, v: boolean) => { next[k] = { enabled: v, config: next[k]?.config ?? {} }; };
  set(key, on);
  if (on) {
    const need = (k: string) => all.find((x) => x.key === k)?.depends_on.forEach((d) => { if (!next[d]?.enabled) { set(d, true); need(d); } });
    need(key);
  } else {
    const drop = (k: string) => all.filter((x) => x.depends_on.includes(k)).forEach((x) => { if (next[x.key]?.enabled) { set(x.key, false); drop(x.key); } });
    drop(key);
  }
  return next;
}

export function Templates() {
  const [data, setData] = useState<Listing | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [copyOf, setCopyOf] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const answer = await api<Listing>("/api/admin/templates");
    if (answer.ok) setData(answer.data);
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  function edit(t: Template, fresh = false, from = "") {
    setMessage(""); setError("");
    setDraft(JSON.parse(JSON.stringify(t)));
    setIsNew(fresh);
    setCopyOf(from);
    requestAnimationFrame(() => document.getElementById("tpl-editor")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  async function save() {
    if (!draft) return;
    setMessage(""); setError("");
    const body = { ...draft, categories: draft.categories.filter((c) => c.name.trim()) };
    const answer = isNew
      ? await api<{ template: Template }>("/api/admin/templates", "POST", { ...body, key: "", ...(copyOf ? { from_key: copyOf } : {}) })
      : await api<{ template: Template }>(`/api/admin/templates/${draft.key}`, "PUT", body);
    if (!answer.ok) return setError(answer.error);
    setMessage(`${answer.data.template.name} saved. Pick it when you create a shop, or on a client’s business.`);
    setDraft(null);
    await load();
  }

  async function archive(t: Template, restore: boolean) {
    setMessage(""); setError("");
    const answer = await api(`/api/admin/templates/${t.key}/${restore ? "restore" : "archive"}`, "POST");
    if (!answer.ok) return setError(answer.error);
    setMessage(`${t.name} ${restore ? "is offered again" : "is archived: no new shop can start from it, and the shops that use it keep working"}.`);
    await load();
  }

  if (!data) return <p className="sh-note">Loading…</p>;
  const groups = data.registry.groups;
  const set = (patch: Partial<Template>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const ruleOk = (rule: string) => {
    const feature = data.registry.rules.find((r) => r.key === rule)?.feature;
    return !feature || draft?.features[feature]?.enabled !== false;
  };

  return (
    <>
      <header className="sh-head">
        <span className="sh-eyebrow">Templates · {data.builtin.length + data.made.length}</span>
        <h1>Templates</h1>
        <p>A kind of business, as a setting of the Catalog. No release is needed to serve a new kind of client.</p>
      </header>

      <section className="ops-quick" aria-labelledby="tpl-quick">
        <h2 id="tpl-quick">Quick start</h2>
        <p><b>{data.quick_start.en}</b></p>
        <ol>
          <li>Find the closest template below and press <b>Make a copy</b>.</li>
          <li>Switch features on or off, name the section, choose how the order page looks.</li>
          <li>List the categories and the fields (such as Concentration or Volume) it starts with.</li>
          <li>Save. Pick it when you <a href="/ops/clients">set up a new shop</a>, or on a client’s business.</li>
        </ol>
      </section>

      {message && <p className="ops-ok" role="status">{message}</p>}
      {error && <p className="ops-error" role="alert">{error}</p>}

      <section aria-labelledby="tpl-made">
        <h2 id="tpl-made">Your templates</h2>
        {data.made.length === 0 ? <p className="sh-note">None yet. Make a copy of one below.</p> : (
          <div className="tablewrap ops-tpl-table"><table>
            <thead><tr><th>Template</th><th>Section · layout</th><th>Features on</th><th>Shops</th><th /></tr></thead>
            <tbody>
              {data.made.map((t) => (
                <tr key={t.key} className={`norow ${t.archived ? "ops-quiet" : ""}`}>
                  <td><b>{t.name}</b><br /><small>{t.key}{t.based_on ? ` · stands on ${t.based_on}` : ""}</small></td>
                  <td>{t.section}<br /><small>{STYLE_WORDS[t.layout_style]}</small></td>
                  <td className="num">{onCount(t)}{t.offered && <> <span className="sh-pill active">Owners may choose it</span></>}{t.archived && <> <span className="sh-pill idle">Archived</span></>}</td>
                  <td className="num">{t.shops}</td>
                  <td className="ops-row-actions">
                    <button type="button" className="btn small" onClick={() => edit(t)}>Edit</button>
                    <button type="button" className="btn small ghost" onClick={() => void archive(t, t.archived)}>{t.archived ? "Offer again" : "Archive"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section aria-labelledby="tpl-builtin">
        <h2 id="tpl-builtin">ALYR’s own templates</h2>
        <p className="sh-note">The kinds of business ALYR ships. They are read only, and the shops of these types behave exactly as they did before templates existed.</p>
        <div className="tablewrap ops-tpl-table"><table>
          <thead><tr><th>Template</th><th>Section · layout</th><th>New item</th><th>Features on</th><th /></tr></thead>
          <tbody>
            {data.builtin.map((t) => (
              <tr key={t.key} className="norow">
                <td><b>{t.name}</b><br /><small>{t.key}</small></td>
                <td>{t.section}<br /><small>{STYLE_WORDS[t.layout_style]}</small></td>
                <td>{RULE_WORDS[t.rule]}</td>
                <td className="num">{onCount(t)}</td>
                <td className="ops-row-actions"><button type="button" className="btn small" onClick={() => edit({ ...t, builtin: false, archived: false, offered: false, name: `${t.name} copy`, name_ar: "" }, true, t.key)}>Make a copy</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>

      {draft && (
        <section id="tpl-editor" className="ops-editor" aria-labelledby="tpl-edit-title">
          <h2 id="tpl-edit-title">{isNew ? "A new template" : `Edit ${draft.name}`}</h2>
          <form className="ops-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label className="ops-field"><span>Name</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={60} /></label>
            <label className="ops-field"><span>Arabic name</span><input value={draft.name_ar} dir="rtl" onChange={(e) => set({ name_ar: e.target.value })} maxLength={60} /></label>
            <label className="ops-field ops-wide"><span>A note for staff (what kind of client it is for)</span><input value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={300} /></label>
            <label className="ops-field">
              <span>Stands on (decides onboarding and prices)</span>
              <select value={draft.based_on} onChange={(e) => set({ based_on: e.target.value })}>
                <option value="">None, the plain Catalog</option>
                {data.types.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </label>
            <label className="ops-check ops-field"><input type="checkbox" checked={draft.offered} onChange={(e) => set({ offered: e.target.checked })} />Owners may switch to it themselves</label>

            <h3 className="ops-wide">Words and look</h3>
            <label className="ops-field"><span>Section name</span><input value={draft.section} onChange={(e) => set({ section: e.target.value })} required maxLength={40} /></label>
            <label className="ops-field"><span>Section name in Arabic</span><input value={draft.section_ar} dir="rtl" onChange={(e) => set({ section_ar: e.target.value })} maxLength={40} /></label>
            <label className="ops-field"><span>Line under the title</span><input value={draft.sub} onChange={(e) => set({ sub: e.target.value })} maxLength={200} /></label>
            <label className="ops-field"><span>The same in Arabic</span><input value={draft.sub_ar} dir="rtl" onChange={(e) => set({ sub_ar: e.target.value })} maxLength={200} /></label>
            <label className="ops-field">
              <span>Order page layout</span>
              <select value={draft.layout_style} onChange={(e) => set({ layout_style: e.target.value })}>
                {data.registry.styles.map((s) => <option key={s} value={s}>{STYLE_WORDS[s]}</option>)}
              </select>
            </label>
            <label className="ops-field">
              <span>A sold-out item is</span>
              <select value={draft.sold_out} onChange={(e) => set({ sold_out: e.target.value })}>
                <option value="grey">Greyed out</option><option value="hide">Left out</option>
              </select>
            </label>

            <h3 className="ops-wide">A new item</h3>
            <label className="ops-field">
              <span>Runs out</span>
              <select value={draft.rule} onChange={(e) => set({ rule: e.target.value })}>
                {data.registry.rules.map((r) => <option key={r.key} value={r.key} disabled={!ruleOk(r.key)}>{RULE_WORDS[r.key]}</option>)}
              </select>
            </label>
            <label className="ops-field">
              <span>Sold by</span>
              <select value={draft.unit} onChange={(e) => set({ unit: e.target.value })}>
                {data.registry.units.map((u) => <option key={u} value={u}>{UNIT_WORDS[u]}</option>)}
              </select>
            </label>
            <label className="ops-field"><span>Low-stock number</span><input value={draft.low_stock_at} inputMode="numeric" dir="ltr" onChange={(e) => set({ low_stock_at: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            <label className="ops-field"><span>Notice, in days (empty for none)</span><input value={draft.lead_days ?? ""} inputMode="numeric" dir="ltr" onChange={(e) => set({ lead_days: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} /></label>
            <label className="ops-field"><span>Order before (for example 18:00)</span><input value={draft.lead_cutoff} dir="ltr" placeholder="18:00" onChange={(e) => set({ lead_cutoff: e.target.value })} /></label>

            <h3 className="ops-wide">Features</h3>
            <div className="ops-wide ops-features">
              {groups.map((g) => (
                <fieldset key={g.key} className="ops-featgroup">
                  <legend>{g.name}</legend>
                  {g.features.map((f) => f.kind === "choice" ? null : (
                    <label key={f.key} className="ops-check">
                      <input type="checkbox" checked={draft.features[f.key]?.enabled ?? f.default}
                        onChange={(e) => set({ features: toggled(draft, groups, f.key, e.target.checked) })} />
                      <span><b>{f.name}</b> <small>{f.hint}{f.depends_on.length ? ` Needs ${f.depends_on.map((d) => groups.flatMap((x) => x.features).find((x) => x.key === d)?.name).join(", ")}.` : ""}</small></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>

            <h3 className="ops-wide">Starter categories</h3>
            <label className="ops-field ops-wide">
              <span>One a line: the name, then a bar and the Arabic name (for example Oud | عود). At most {data.registry.limits.categories}.</span>
              <textarea rows={5} value={draft.categories.map((c) => (c.name_ar ? `${c.name} | ${c.name_ar}` : c.name)).join("\n")}
                onChange={(e) => set({ categories: e.target.value.split("\n").map((line) => { const [name, ...rest] = line.split("|"); return { name: name.trim(), name_ar: rest.join("|").trim() }; }) })} />
            </label>

            <h3 className="ops-wide">Starter fields <small>(up to {data.registry.limits.fields}; the owner may edit or archive them)</small></h3>
            <div className="ops-wide ops-seeds">
              {draft.fields.map((s, i) => {
                const put = (patch: Partial<Seed>) => set({ fields: draft.fields.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="ops-seed">
                    <label className="ops-field"><span>Name</span><input value={s.label} onChange={(e) => put({ label: e.target.value })} /></label>
                    <label className="ops-field"><span>Arabic name</span><input value={s.label_ar} dir="rtl" onChange={(e) => put({ label_ar: e.target.value })} /></label>
                    <label className="ops-field"><span>Kind</span>
                      <select value={s.kind} onChange={(e) => put({ kind: e.target.value })}>{data.registry.field_kinds.map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}</select>
                    </label>
                    <label className="ops-field"><span>For</span>
                      <select value={s.applies_to} onChange={(e) => put({ applies_to: e.target.value })}><option value="item">The item</option><option value="variant">Each size or colour</option></select>
                    </label>
                    {s.kind === "number" && <label className="ops-field"><span>Unit</span><input value={s.unit} maxLength={12} onChange={(e) => put({ unit: e.target.value })} /></label>}
                    {s.kind === "choice" && (
                      <label className="ops-field ops-wide"><span>Choices, one a line (English | Arabic)</span>
                        <textarea rows={3} value={s.choices.map((c) => (c.label_ar ? `${c.label} | ${c.label_ar}` : c.label)).join("\n")}
                          onChange={(e) => put({ choices: e.target.value.split("\n").map((line) => { const [a, ...b] = line.split("|"); return { label: a.trim(), label_ar: b.join("|").trim() }; }).filter((c) => c.label || c.label_ar) })} />
                      </label>
                    )}
                    <label className="ops-check"><input type="checkbox" checked={s.shown} onChange={(e) => put({ shown: e.target.checked })} />Customers see it</label>
                    <label className="ops-check"><input type="checkbox" checked={s.searchable} onChange={(e) => put({ searchable: e.target.checked })} />Searched</label>
                    <label className="ops-check"><input type="checkbox" checked={s.required} onChange={(e) => put({ required: e.target.checked })} />Needed</label>
                    <button type="button" className="btn small ghost" onClick={() => set({ fields: draft.fields.filter((_, k) => k !== i) })}>Remove</button>
                  </div>
                );
              })}
              <button type="button" className="btn small" disabled={draft.fields.length >= data.registry.limits.fields}
                onClick={() => set({ fields: [...draft.fields, { key: "", label: "", label_ar: "", kind: "text", applies_to: "item", choices: [], shown: false, searchable: false, required: false, unit: "" }] })}>Add a field</button>
            </div>

            <div className="ops-actions ops-wide">
              <button className="btn primary" type="submit">{isNew ? "Make the template" : "Save"}</button>
              <button className="btn" type="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
            {error && <p className="ops-error ops-wide" role="alert">{error}</p>}
          </form>
        </section>
      )}
    </>
  );
}
