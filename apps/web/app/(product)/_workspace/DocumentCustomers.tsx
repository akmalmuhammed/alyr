"use client";

// The shop's customers, for documents (ALY-141, spec 016): the people and companies it invoices,
// found by name or phone number, added here or while a document is written, with what each owes
// and their documents (owners and admins). A shop that only invoices has no inbox or credit
// accounts to learn them from, so this is where they live; a shop that has them sees the same
// people. Phone first: 44 px targets, one column, the form in a sheet.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api, refusalOf, sayRefusal, type CustomerRow, type Meta,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import { dateText, written } from "./documentsLogic";
import { Announce, Field, Fold, Icon, Sheet, Switch } from "./CatalogUi";
import type { Push } from "./DocumentSheets";
import { STANDALONE } from "./standaloneCopy";
import "./standalone.css";

const PAGE = 40;
const FIELDS = ["name", "name_ar", "company", "phone", "email", "registration_number", "tax_id", "address", "address_ar"] as const;
type Form = Record<(typeof FIELDS)[number], string> & { whatsapp_ok: boolean };
const BLANK: Form = { name: "", name_ar: "", company: "", phone: "", email: "", registration_number: "", tax_id: "", address: "", address_ar: "", whatsapp_ok: false };

const nameOf = (c: CustomerRow, lang: Lang) =>
  (lang === "ar" ? c.name_ar || c.name : c.name || c.name_ar) || c.company;

export function Customers({ lang, meta, push, nav, openId, onOpen, onClose, onNewInvoice, onOpenDocument }: {
  lang: Lang; meta: Meta; push: Push; nav: React.ReactNode; openId: string | null;
  onOpen: (id: string) => void; onClose: () => void;
  onNewInvoice: (contactId: string) => void; onOpenDocument: (id: string) => void;
}) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const manager = meta.access.can_manage;
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [owing, setOwing] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState<null | { id: string | null; form: Form }>(null);
  const [round, setRound] = useState(0);
  const asked = useRef(0);

  useEffect(() => {
    const wait = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(wait);
  }, [typed]);

  const load = useCallback(async () => {
    const mine = ++asked.current;
    try {
      const p = new URLSearchParams({ limit: String(PAGE) });
      if (q) p.set("q", q);
      if (owing) p.set("owing", "true");
      const r = await api<{ customers: CustomerRow[]; total: number; has_more: boolean }>(`/api/documents/customers/all?${p.toString()}`);
      if (mine !== asked.current) return;
      setRows(r.customers);
      setTotal(r.total);
      setMore(r.has_more);
      setLoaded(true);
      setOffline(false);
    } catch (error) {
      if (mine !== asked.current) return;
      if (sayRefusal(error, lang, fallback) === t.offline) setOffline(true);
      else push(sayRefusal(error, lang, fallback), { tone: "bad" });
    }
    // `fallback` and `push` do not change what a load asks for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, owing, lang, t]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load, round]);

  async function loadMore() {
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(rows.length) });
      if (q) p.set("q", q);
      if (owing) p.set("owing", "true");
      const r = await api<{ customers: CustomerRow[]; total: number; has_more: boolean }>(`/api/documents/customers/all?${p.toString()}`);
      setRows((cur) => [...cur, ...r.customers.filter((c) => !cur.some((x) => x.id === c.id))]);
      setMore(r.has_more);
    } catch (error) {
      push(sayRefusal(error, lang, fallback), { tone: "bad" });
    }
  }

  const changed = () => setRound((n) => n + 1);
  const fmt = (minor: number) => written(minor, meta.defaults.currency, meta.currencies[meta.defaults.currency]?.exponent ?? 2, meta.currencies[meta.defaults.currency]?.symbol_ar ?? "", lang);

  const sheet = editing && (
    <CustomerForm lang={lang} manager={manager} id={editing.id} start={editing.form} push={push}
      onClose={() => setEditing(null)}
      onSaved={(c) => { setEditing(null); changed(); push(s.customerSaved2); if (openId) onOpen(c.id); }} />
  );

  if (openId) {
    return (
      <>
        <CustomerPage lang={lang} meta={meta} id={openId} round={round} push={push} onBack={onClose}
          onEdit={(c) => setEditing({ id: c.id, form: { ...BLANK, ...Object.fromEntries(FIELDS.map((f) => [f, c[f] ?? ""])) } })}
          onNewInvoice={onNewInvoice} onOpenDocument={onOpenDocument} fmt={fmt} />
        {sheet}
      </>
    );
  }

  const filtered = Boolean(q) || owing;
  const empty = loaded && rows.length === 0 && !filtered;
  return (
    <div className="ct dc" lang={lang}>
      {nav}
      <header className="sh-head">
        <span className="sh-eyebrow">{loaded ? s.customersCount(total) : " "}</span>
        <h1>{s.customersTitle}</h1>
        <p>{s.customersSub}</p>
      </header>

      {offline && (
        <div className="ct-banner bad" role="status">
          <span>{t.offline}</span>
          <button type="button" className="btn small" onClick={() => void load()}>{t.retry}</button>
        </div>
      )}

      <div className="ct-actions">
        <button type="button" className="btn volt ct-btn" onClick={() => setEditing({ id: null, form: BLANK })}>
          <Icon name="plus" />{s.customerAdd}
        </button>
      </div>

      {!empty && (
        <div className="sa-tools">
          <label className="ct-search">
            <Icon name="search" />
            <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={s.customerSearch}
              aria-label={s.customerSearch} dir="auto" enterKeyHint="search" autoComplete="off" spellCheck={false} />
          </label>
          {manager && (
            <div className="ct-chips" role="group" aria-label={s.customerOwing}>
              <button type="button" className="ct-chip" aria-pressed={owing} onClick={() => setOwing((v) => !v)}>
                {owing && <Icon name="check" className="sh-ico ct-chip-tick" />}{s.customerOwing}
              </button>
            </div>
          )}
        </div>
      )}
      <Announce text={loaded ? s.customersCount(total) : ""} />

      {!loaded && !offline && <p className="ct-quiet ct-pad" role="status">{t.loading}</p>}

      {empty && (
        <section className="sh-tile raised folded ct-empty">
          <span className="sh-glyph"><Icon name="users" /></span>
          <h2>{s.customerNoneTitle}</h2>
          <p>{s.customerNoneText}</p>
          <button type="button" className="btn volt ct-btn" onClick={() => setEditing({ id: null, form: BLANK })}>
            <Icon name="plus" />{s.customerAdd}
          </button>
        </section>
      )}
      {loaded && !empty && rows.length === 0 && <div className="empty-note ct-none"><p>{s.customerNoMatch}</p></div>}

      {rows.length > 0 && (
        <ul className="sa-list">
          {rows.map((c) => {
            const sub = [c.name && c.company ? c.company : "", c.phone].filter(Boolean).join(" · ");
            return (
              <li key={c.id}>
                <button type="button" className="sa-row" onClick={() => onOpen(c.id)}>
                  <span className="sa-row-main">
                    <b dir="auto">{nameOf(c, lang) || s.customerNoName}</b>
                    {sub && <small dir="auto">{sub}</small>}
                  </span>
                  {manager && (
                    <span className="sa-row-end num">
                      {(c.owing_minor ?? 0) > 0 && <span className="sa-owes"><bdi>{s.customerOwes(fmt(c.owing_minor ?? 0))}</bdi></span>}
                      <small>{s.customerDocuments(c.documents ?? 0)}</small>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {more && <button type="button" className="btn ct-more" onClick={() => void loadMore()}>{t.showMore}</button>}
      {sheet}
    </div>
  );
}

// ── one customer ────────────────────────────────────────

function CustomerPage({ lang, meta, id, round, push, onBack, onEdit, onNewInvoice, onOpenDocument, fmt }: {
  lang: Lang; meta: Meta; id: string; round: number; push: Push; onBack: () => void;
  onEdit: (c: CustomerRow) => void; onNewInvoice: (contactId: string) => void;
  onOpenDocument: (id: string) => void; fmt: (minor: number) => string;
}) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const [c, setC] = useState<CustomerRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<{ customer: CustomerRow }>(`/api/documents/customers/${id}`)
      .then((r) => { if (live) setC(r.customer); })
      .catch((e) => { if (live) setError(sayRefusal(e, lang, { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone })); });
    return () => { live = false; };
    // the labels follow the language only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, round]);
  void push;

  if (error) {
    return (
      <div className="ct dc" lang={lang}>
        <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{s.customerBack}</button>
        <p className="ct-alert" role="alert"><Icon name="warn" />{error}</p>
      </div>
    );
  }
  if (!c) return <div className="ct dc" lang={lang}><p className="ct-quiet ct-pad" role="status">{t.loading}</p></div>;
  const manager = meta.access.can_manage;
  const facts: [string, string, string?][] = [
    [t.phoneField, c.phone, "ltr"], [t.emailField, c.email, "ltr"], [t.company, c.company],
    [t.registration, c.registration_number, "ltr"], [t.taxId, c.tax_id, "ltr"],
    [t.address, c.address], [t.addressAr, c.address_ar],
  ];
  return (
    <div className="ct dc" lang={lang}>
      <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{s.customerBack}</button>
      <header className="sh-head sa-detail-head">
        <span className="sh-eyebrow">{s.customersTitle}</span>
        <h1 dir="auto">{nameOf(c, lang) || s.customerNoName}</h1>
      </header>
      <div className="ct-actions">
        <button type="button" className="btn volt ct-btn" onClick={() => onNewInvoice(c.id)}><Icon name="plus" />{s.customerNewInvoice}</button>
        <button type="button" className="btn ct-btn" onClick={() => onEdit(c)}><Icon name="edit" />{s.customerEdit}</button>
      </div>

      {manager && (
        <section className="dc-sec" aria-labelledby="sa-bal">
          <h2 id="sa-bal">{s.customerBalance}</h2>
          {(c.owing_minor ?? 0) > 0
            ? <><p className="sa-balance num"><bdi>{fmt(c.owing_minor ?? 0)}</bdi></p><p className="ct-hint">{s.customerBalanceOwes(fmt(c.owing_minor ?? 0))}</p></>
            : <p className="ct-hint">{s.customerBalanceNone}</p>}
        </section>
      )}

      <section className="dc-sec" aria-labelledby="sa-contact">
        <h2 id="sa-contact">{s.customerContact}</h2>
        <dl className="sa-facts">
          {facts.filter(([, v]) => v).map(([label, v, dir]) => (
            <div key={label}><dt>{label}</dt><dd dir={dir ?? "auto"}>{v}</dd></div>
          ))}
        </dl>
      </section>

      {manager && (
        <section className="dc-sec" aria-labelledby="sa-hist">
          <h2 id="sa-hist">{s.customerHistory}</h2>
          {(c.recent ?? []).length === 0 && <p className="ct-hint">{s.customerNoHistory}</p>}
          {(c.recent ?? []).length > 0 && (
            <ul className="dc-related">
              {(c.recent ?? []).map((d) => (
                <li key={d.id}>
                  <button type="button" className="ct-linkbtn" onClick={() => onOpenDocument(d.id)}>
                    <b dir="ltr"><bdi>{d.number ?? ""}</bdi></b> <span className="ct-quiet">{kindLabel(lang, d.kind)}</span>
                  </button>
                  <span className="num"><bdi>{written(d.total_minor, d.currency, d.currency_exponent, meta.currencies[d.currency]?.symbol_ar ?? d.currency, lang)}</bdi></span>
                  {d.issue_date && <span className="ct-quiet"><bdi>{dateText(d.issue_date, lang)}</bdi></span>}
                  {d.status === "void" && <span className="sh-pill dc-pill bad">{t.statuses.void}</span>}
                  {d.owing_minor > 0 && <span className="sh-pill dc-pill wait">{s.customerOwes(fmt(d.owing_minor))}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// ── add and change ──────────────────────────────────────

function CustomerForm({ lang, manager, id, start, push, onClose, onSaved }: {
  lang: Lang; manager: boolean; id: string | null; start: Form; push: Push; onClose: () => void;
  onSaved: (c: CustomerRow) => void;
}) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const [f, setF] = useState<Form>(start);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const set = (k: keyof Form, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setFail("");
    if (!f.name.trim() && !f.name_ar.trim() && !f.company.trim()) { setFail(s.customerErrorName); return; }
    if (!f.phone.trim()) { setFail(s.customerErrorPhone); return; }
    setBusy(true);
    try {
      const body = { ...Object.fromEntries(FIELDS.map((k) => [k, f[k].trim()])), whatsapp_ok: manager && f.whatsapp_ok };
      const r = id
        ? await api<{ customer: CustomerRow }>(`/api/documents/customers/${id}`, "PUT", body)
        : await api<{ customer: CustomerRow }>("/api/documents/customers", "POST", body);
      onSaved(r.customer);
    } catch (error) {
      const r = refusalOf(error);
      setFail(sayRefusal(error, lang, { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone }) || r?.en || t.failed);
      setBusy(false);
    }
    void push;
  }

  return (
    <Sheet title={id ? s.customerFormTitleEdit : s.customerFormTitleNew} onClose={onClose} closeLabel={t.close}
      footer={(
        <div className="dc-foot">
          <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void save()}>{busy ? t.saving : t.save}</button>
          <button type="button" className="btn ghost ct-btn" onClick={onClose}>{t.cancel}</button>
        </div>
      )}>
      {fail && <p className="ct-alert" role="alert"><Icon name="warn" />{fail}</p>}
      <form className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="ct-grid2 names">
          <Field label={s.customerName}><input value={f.name} dir="auto" maxLength={120} autoComplete="off" data-autofocus onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label={s.customerNameAr}><input value={f.name_ar} dir="rtl" maxLength={120} autoComplete="off" onChange={(e) => set("name_ar", e.target.value)} /></Field>
        </div>
        <Field label={s.customerPhone} hint={s.customerPhoneHint}>
          <input type="tel" inputMode="tel" dir="ltr" value={f.phone} maxLength={40} autoComplete="off" onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label={s.customerEmail}><input type="email" inputMode="email" dir="ltr" value={f.email} maxLength={120} autoComplete="off" onChange={(e) => set("email", e.target.value)} /></Field>
        <Fold title={s.customerMore} summary={f.company}>
          <Field label={s.customerCompany}><input value={f.company} dir="auto" maxLength={120} onChange={(e) => set("company", e.target.value)} /></Field>
          <div className="ct-grid2">
            <Field label={s.customerRegistration}><input dir="ltr" value={f.registration_number} maxLength={40} onChange={(e) => set("registration_number", e.target.value)} /></Field>
            <Field label={s.customerTaxId}><input dir="ltr" value={f.tax_id} maxLength={40} onChange={(e) => set("tax_id", e.target.value)} /></Field>
          </div>
          <Field label={s.customerAddress}><input value={f.address} dir="auto" maxLength={300} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label={s.customerAddressAr}><input value={f.address_ar} dir="rtl" maxLength={300} onChange={(e) => set("address_ar", e.target.value)} /></Field>
        </Fold>
        {manager && (
          <label className="ct-toggle">
            <span className="ct-toggle-text"><b>{s.customerWhatsapp}</b><small>{s.customerWhatsappHint}</small></span>
            <Switch on={f.whatsapp_ok} label={s.customerWhatsapp} onChange={(v) => set("whatsapp_ok", v)} />
          </label>
        )}
      </form>
    </Sheet>
  );
}
