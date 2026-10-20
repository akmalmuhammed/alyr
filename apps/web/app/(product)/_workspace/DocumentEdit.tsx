"use client";

// Writing a document by hand (ALY-146, spec 015): the form for a draft. The customer is found
// among the shop's own or typed; the lines come from the Catalog (priced for the customer's
// group) or are written free; the totals are worked out as the engine works them, live; saving
// keeps a draft with no number; issuing gives it its number and locks it. The engine checks
// everything again: this form's job is to say what is missing before, in words.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api, refusalOf, sayRefusal, type Branch, type CatalogLine, type CustomerHit, type Detail,
  type DraftBody, type Meta,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import {
  draftTotals, inputMoney, lineAmounts, missingForIssue, parseMoney, parseQuantity, quantityText,
  written, type LineInput,
} from "./documentsLogic";
import { IssueFailure, IssueSheet, type Push } from "./DocumentSheets";
import { Field, Fold, Icon, Layer } from "./CatalogUi";

const KINDS = ["invoice", "quote", "receipt", "delivery_note", "proforma"] as const;
const PAY_METHODS = ["cash", "card", "bank_transfer", "cheque", "other"] as const;

type LineState = {
  key: string; description: string; description_ar: string; sku: string; quantity: string; unit: string;
  price: string; discount: string; tax: string;
};
let counter = 0;
const nextKey = () => `l${++counter}`;
const blankLine = (): LineState => ({ key: nextKey(), description: "", description_ar: "", sku: "", quantity: "1", unit: "piece", price: "", discount: "", tax: "" });

export function DocumentEdit({ lang, meta, branches, id, startKind, push, onBack, onSaved, onSettings }: {
  lang: Lang; meta: Meta; branches: Branch[]; id: string | null; startKind: string; push: Push;
  onBack: () => void; onSaved: (id: string) => void; onSettings: (field: string) => void;
}) {
  const t = COPY[lang];
  const exponent = meta.currencies[meta.defaults.currency]?.exponent ?? 2;
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState("");
  const [kind, setKind] = useState(KINDS.includes(startKind as (typeof KINDS)[number]) ? startKind : "invoice");
  const [branch, setBranch] = useState("main");
  const [due, setDue] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [customer, setCustomer] = useState({ name: "", name_ar: "", company: "", phone: "", email: "", registration_number: "", tax_id: "", address: "", address_ar: "" });
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [payMethod, setPayMethod] = useState<(typeof PAY_METHODS)[number]>("cash");
  const [payRef, setPayRef] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState({ en: "", ar: "" });
  const [terms, setTerms] = useState({ en: "", ar: "" });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; field: string; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [savedDoc, setSavedDoc] = useState<Detail | null>(null);
  const [issuing, setIssuing] = useState<null | "issue">(null);
  const touch = useCallback(() => setDirty(true), []);
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };

  const kindInfo = meta.kinds.find((k) => k.key === kind);
  const activeBranches = branches.filter((b) => b.active);

  // An existing draft is read once into the form.
  useEffect(() => {
    if (!id) return;
    let live = true;
    api<{ document: Detail }>(`/api/documents/${id}`)
      .then(({ document: d }) => {
        if (!live) return;
        if (d.status !== "draft") { setLoadError(t.failed); return; }
        setKind(d.kind);
        setBranch(d.branch);
        setDue(d.due_date ?? "");
        setContactId(d.contact_id);
        setCustomer({
          name: d.customer.name ?? "", name_ar: d.customer.name_ar ?? "", company: d.customer.company ?? "",
          phone: d.customer.phone ?? "", email: d.customer.email ?? "",
          registration_number: d.customer.registration_number ?? "", tax_id: d.customer.tax_id ?? "",
          address: d.customer.address ?? "", address_ar: d.customer.address_ar ?? "",
        });
        setLines(d.lines.length ? d.lines.map((l) => ({
          key: nextKey(), description: l.description, description_ar: l.description_ar, sku: l.sku,
          quantity: l.quantity.replace(/\.?0+$/, "") || "1", unit: l.unit, price: inputMoney(l.unit_price_minor, d.currency_exponent),
          discount: l.discount_minor ? inputMoney(l.discount_minor, d.currency_exponent) : "",
          tax: l.tax_rate_bp ? String(l.tax_rate_bp / 100) : "",
        })) : [blankLine()]);
        const p = d.payments[0];
        if (p) {
          if ((PAY_METHODS as readonly string[]).includes(p.method)) setPayMethod(p.method as (typeof PAY_METHODS)[number]);
          setPayRef(p.reference);
          if (d.kind === "deposit_receipt") setDeposit(inputMoney(p.amount_minor, d.currency_exponent));
        }
        setNotes({ en: d.notes.en ?? "", ar: d.notes.ar ?? "" });
        setTerms({ en: d.terms.en ?? "", ar: d.terms.ar ?? "" });
        setSavedDoc(d);
        setLoading(false);
      })
      .catch((error) => { if (live) { setLoadError(sayRefusal(error, lang, fallback)); setLoading(false); } });
    return () => { live = false; };
    // the form reads the draft once; `fallback` and `t` follow the language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Leaving the page with changes asks first (the browser's own question).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── what the lines add up to ──
  const parsed = useMemo(() => lines.map((l) => {
    const milli = parseQuantity(l.quantity);
    const price = parseMoney(l.price, exponent);
    const discount = l.discount.trim() ? parseMoney(l.discount, exponent) : 0;
    const rate = l.tax.trim() ? Math.round(Number(l.tax.replace(",", ".")) * 100) : 0;
    const ok = milli !== null && price !== null && discount !== null && Number.isFinite(rate) && rate >= 0 && rate <= 10000;
    const input: LineInput | null = ok ? { milli: milli!, price: price!, discount: discount!, rateBp: rate } : null;
    return { input, amounts: input ? lineAmounts(input) : null };
  }), [lines, exponent]);
  const rounds = kind === "receipt" || kind === "invoice" || kind === "deposit_receipt";
  const totals = useMemo(
    () => draftTotals(parsed.map((p) => p.input), meta.defaults.cash_rounding_minor, rounds),
    [parsed, meta.defaults.cash_rounding_minor, rounds],
  );
  const m = (minor: number) => written(minor, meta.defaults.currency, exponent, meta.currencies[meta.defaults.currency]?.symbol_ar ?? "", lang);
  const customerName = customer.name.trim() || customer.name_ar.trim();
  const depositMinor = deposit.trim() ? parseMoney(deposit, exponent) : null;
  const missing = missingForIssue({
    kind, needsCustomer: Boolean(kindInfo?.needs_customer), customerName, lineCount: lines.length,
    lineTexts: lines.map((l) => l.description || l.description_ar),
    lineErrors: parsed.some((p) => !p.input || !p.amounts), total: totals.total,
    allowsZero: kind === "delivery_note", paid: depositMinor ?? 0,
    wantsPayment: kindInfo?.payments === "deposit" ? "deposit" : kindInfo?.payments === "full" ? "full" : "none",
  });

  // ── the customer picker ──
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[] | null>(null);
  useEffect(() => {
    if (picked) return;
    const wait = setTimeout(() => {
      api<{ customers: CustomerHit[] }>(`/api/documents/customers?q=${encodeURIComponent(custQuery.trim())}`)
        .then((r) => setCustHits(r.customers)).catch(() => setCustHits([]));
    }, 250);
    return () => clearTimeout(wait);
  }, [custQuery, picked]);

  function pickCustomer(c: CustomerHit) {
    setPicked(c);
    setContactId(c.id);
    setCustomer((cur) => ({ ...cur, name: c.name, phone: c.phone ?? "", email: c.email ?? cur.email }));
    touch();
  }
  function clearCustomer() { setPicked(null); setContactId(null); touch(); }

  // ── the Catalog lines ──
  const [catQuery, setCatQuery] = useState("");
  const [catHits, setCatHits] = useState<CatalogLine[] | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  useEffect(() => {
    if (!catOpen) return;
    const wait = setTimeout(() => {
      const q = new URLSearchParams({ q: catQuery.trim() });
      if (contactId) q.set("contact_id", contactId);
      api<{ lines: CatalogLine[] }>(`/api/documents/catalog-lines?${q.toString()}`)
        .then((r) => setCatHits(r.lines)).catch(() => setCatHits([]));
    }, 250);
    return () => clearTimeout(wait);
  }, [catQuery, catOpen, contactId]);

  function addCatalogLine(c: CatalogLine) {
    const line: LineState = {
      key: nextKey(), description: c.description, description_ar: c.description_ar,
      sku: c.sku || (c.code ? String(c.code) : ""), quantity: "1", unit: c.unit,
      price: inputMoney(c.unit_price_minor, exponent), discount: "", tax: "",
    };
    setLines((cur) => (cur.length === 1 && !cur[0].description && !cur[0].description_ar && !cur[0].price ? [line] : [...cur, line]));
    touch();
  }
  function setLine(key: string, patch: Partial<LineState>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  }

  // ── saving ──
  function body(): DraftBody {
    const rows = lines.map((l, i) => {
      const p = parsed[i].input!;
      return {
        description: l.description.trim(), description_ar: l.description_ar.trim(), sku: l.sku.trim(),
        quantity: quantityText(p.milli), unit: l.unit, unit_price_minor: p.price, discount_minor: p.discount,
        tax_rate_bp: p.rateBp,
      };
    });
    const payments: DraftBody["payments"] = [];
    if (kindInfo?.payments === "full" && totals.total > 0) payments.push({ method: payMethod, amount_minor: totals.total, reference: payRef.trim() });
    if (kindInfo?.payments === "deposit" && depositMinor) payments.push({ method: payMethod, amount_minor: depositMinor, reference: payRef.trim() });
    return {
      kind, branch, due_date: kindInfo?.second_date && due ? due : null,
      customer: Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, v.trim()])),
      contact_id: contactId, lines: rows, payments, notes, terms,
    };
  }

  async function save(): Promise<Detail | null> {
    setTried(true);
    setFailure(null);
    if (parsed.some((p) => !p.input || !p.amounts)) {
      setFailure({ code: "line_amount", field: "", text: t.needs.line_amount });
      return null;
    }
    setBusy(true);
    try {
      const done = id
        ? await api<{ document: Detail }>(`/api/documents/${id}`, "PUT", body() as unknown as Record<string, unknown>)
        : await api<{ document: Detail }>("/api/documents", "POST", body() as unknown as Record<string, unknown>);
      setDirty(false);
      setSavedDoc(done.document);
      return done.document;
    } catch (error) {
      const r = refusalOf(error);
      setFailure({ code: r?.code ?? "", field: r?.field ?? "", text: sayRefusal(error, lang, fallback) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const saved = await save();
    if (saved) { push(t.draftSaved); onSaved(saved.id); }
  }
  async function saveAndIssue() {
    setTried(true);
    if (missing.length) return;
    const saved = await save();
    if (saved) setIssuing("issue");
  }

  function leave() {
    if (dirty) setLeaving(true);
    else onBack();
  }

  if (loading) return <div className="ct dc" lang={lang}><p className="ct-quiet ct-pad" role="status">{t.loading}</p></div>;
  if (loadError) {
    return (
      <div className="ct dc" lang={lang}>
        <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{t.back}</button>
        <p className="ct-alert" role="alert"><Icon name="warn" />{loadError}</p>
      </div>
    );
  }

  const showTax = meta.defaults.tax_enabled;
  const needsDue = Boolean(kindInfo?.second_date);
  return (
    <div className="ct dc dc-edit" lang={lang}>
      <button type="button" className="btn ghost ct-btn dc-back" onClick={leave}><Icon name="start" className="sh-ico ct-flip" />{t.back}</button>
      <header className="sh-head">
        <span className="sh-eyebrow">{id ? t.formTitleEdit : t.formTitleNew}</span>
        <h1>{kindLabel(lang, kind)}</h1>
      </header>

      {leaving && (
        <div className="ct-banner" role="alertdialog" aria-label={t.leaveAsk}>
          <span>{t.unsaved} {t.leaveAsk}</span>
          <span className="dc-ask">
            <button type="button" className="btn small" onClick={() => setLeaving(false)}>{t.leaveStay}</button>
            <button type="button" className="btn small danger" onClick={onBack}>{t.leaveGo}</button>
          </span>
        </div>
      )}
      {failure && <IssueFailure failure={failure} lang={lang} onSettings={onSettings} />}

      <form className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void saveDraft(); }}>
        <fieldset className="dc-kinds">
          <legend className="ct-label">{t.formKind}</legend>
          <div className="ct-chips">
            {KINDS.map((k) => (
              <label key={k} className="ct-chip dc-kindchip" data-on={kind === k}>
                <input type="radio" name="dc-kind" className="ct-sr" checked={kind === k} onChange={() => { setKind(k); touch(); }} />
                {kind === k && <Icon name="check" className="sh-ico ct-chip-tick" />}{kindLabel(lang, k)}
              </label>
            ))}
          </div>
          <p className="ct-hint" aria-live="polite">{t.kindHints[kind]}</p>
        </fieldset>
        {kind === "invoice" && !meta.defaults.has_registration && (
          <p className="ct-banner" role="note">
            <span>{COPY[lang].crMissing}</span>
            <button type="button" className="btn small" onClick={() => onSettings("commercial_registration")}>{t.fixField.registration_needed}</button>
          </p>
        )}

        <section className="ct-sec">
          <h2>{t.formDate}</h2>
          <p className="ct-hint">{t.formDateAuto}</p>
          {needsDue && (
            <Field label={kindInfo?.second_date === "valid_until" ? t.formValid : t.formDue}>
              <input type="date" dir="ltr" value={due} onChange={(e) => { setDue(e.target.value); touch(); }} />
            </Field>
          )}
          {activeBranches.length > 1 && (
            <Field label={t.formBranch}>
              <select value={branch} onChange={(e) => { setBranch(e.target.value); touch(); }}>
                {activeBranches.map((b) => <option key={b.branch_key} value={b.branch_key}>{b.branch_key === "main" ? COPY[lang].branchMain : (lang === "ar" && b.name_ar ? b.name_ar : b.name) || b.branch_key}</option>)}
              </select>
            </Field>
          )}
        </section>

        <section className="ct-sec" aria-labelledby="dc-f-customer">
          <h2 id="dc-f-customer">{t.formCustomer}</h2>
          {picked ? (
            <div className="ct-toggle dc-picked">
              <span className="ct-toggle-text">
                <b dir="auto">{t.formCustomerPicked(picked.name)}</b>
                {picked.price_group && <small>{lang === "ar" ? picked.price_group.name_ar || picked.price_group.name : picked.price_group.name}</small>}
              </span>
              <button type="button" className="btn small ghost" onClick={clearCustomer}>{t.formCustomerClear}</button>
            </div>
          ) : (
            <>
              <Field label={t.formCustomerFind} hint={t.formCustomerFindHint}>
                <input type="search" value={custQuery} dir="auto" autoComplete="off" onChange={(e) => setCustQuery(e.target.value)} />
              </Field>
              {custHits && custHits.length > 0 && (
                <ul className="dc-hits" aria-label={t.formCustomerFind}>
                  {custHits.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="dc-hit" onClick={() => pickCustomer(c)}>
                        <b dir="auto">{c.name}</b>
                        <small dir="ltr">{c.phone ?? ""}</small>
                        <span className="sh-pill dc-pill quiet">{t.formCustomerUse}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {custHits && custHits.length === 0 && custQuery.trim() && <p className="ct-hint">{t.formCustomerNone}</p>}
            </>
          )}
          <div className="ct-grid2 names">
            <Field label={t.name} error={tried && missing.includes("customer") ? t.needs.customer : undefined}>
              <input value={customer.name} dir="auto" maxLength={120} autoComplete="off" onChange={(e) => { setCustomer({ ...customer, name: e.target.value }); touch(); }} />
            </Field>
            <Field label={t.nameAr}>
              <input value={customer.name_ar} dir="rtl" maxLength={120} autoComplete="off" onChange={(e) => { setCustomer({ ...customer, name_ar: e.target.value }); touch(); }} />
            </Field>
          </div>
          <div className="ct-grid2">
            <Field label={t.phoneField}><input type="tel" inputMode="tel" dir="ltr" value={customer.phone} maxLength={40} autoComplete="off" onChange={(e) => { setCustomer({ ...customer, phone: e.target.value }); touch(); }} /></Field>
            <Field label={t.emailField}><input type="email" inputMode="email" dir="ltr" value={customer.email} maxLength={120} autoComplete="off" onChange={(e) => { setCustomer({ ...customer, email: e.target.value }); touch(); }} /></Field>
          </div>
          <Fold title={t.company} summary={customer.company}>
            <Field label={t.company}><input value={customer.company} dir="auto" maxLength={120} onChange={(e) => { setCustomer({ ...customer, company: e.target.value }); touch(); }} /></Field>
            <div className="ct-grid2">
              <Field label={t.registration}><input dir="ltr" value={customer.registration_number} maxLength={40} onChange={(e) => { setCustomer({ ...customer, registration_number: e.target.value }); touch(); }} /></Field>
              <Field label={t.taxId}><input dir="ltr" value={customer.tax_id} maxLength={40} onChange={(e) => { setCustomer({ ...customer, tax_id: e.target.value }); touch(); }} /></Field>
            </div>
            <Field label={t.address}><input value={customer.address} dir="auto" maxLength={300} onChange={(e) => { setCustomer({ ...customer, address: e.target.value }); touch(); }} /></Field>
            <Field label={t.addressAr}><input value={customer.address_ar} dir="rtl" maxLength={300} onChange={(e) => { setCustomer({ ...customer, address_ar: e.target.value }); touch(); }} /></Field>
          </Fold>
        </section>

        <section className="ct-sec" aria-labelledby="dc-f-lines">
          <h2 id="dc-f-lines">{t.formLines}</h2>
          <div className="ct-btnrow">
            <button type="button" className="btn ct-btn" aria-expanded={catOpen} onClick={() => setCatOpen((o) => !o)}>
              <Icon name="search" />{t.formAddFromCatalog}
            </button>
            <button type="button" className="btn ct-btn" onClick={() => { setLines((cur) => [...cur, blankLine()]); touch(); }}>
              <Icon name="plus" />{t.formAddFree}
            </button>
          </div>
          {catOpen && (
            <div className="dc-catalog">
              <Field label={t.formCatalogSearch}>
                <input type="search" value={catQuery} dir="auto" autoComplete="off" data-autofocus onChange={(e) => setCatQuery(e.target.value)} />
              </Field>
              {catHits && catHits.length === 0 && <p className="ct-hint">{t.formCatalogNone}</p>}
              {catHits && catHits.length > 0 && (
                <ul className="dc-hits" aria-label={t.formAddFromCatalog}>
                  {catHits.map((c) => (
                    <li key={`${c.item_id}${c.variant_id ?? ""}`}>
                      <button type="button" className="dc-hit" onClick={() => addCatalogLine(c)}>
                        <b dir="auto">{lang === "ar" ? c.description_ar || c.description : c.description}</b>
                        <small dir="ltr">{c.code !== null ? `#${c.code}` : ""}{c.code !== null && c.sku ? " · " : ""}{c.sku}</small>
                        <span className="num dc-hit-price">
                          <bdi>{m(c.unit_price_minor)}</bdi>
                          {c.group_price && <small> {t.formCatalogGroup}</small>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ol className="dc-linelist">
            {lines.map((l, i) => {
              const p = parsed[i];
              const bad = tried && (!p.input || !p.amounts);
              return (
                <li key={l.key} className={`ct-card-form dc-lineform ${bad ? "bad" : ""}`}>
                  <div className="ct-row-between">
                    <b>{t.formLine(i + 1)}</b>
                    {lines.length > 1 && (
                      <button type="button" className="sh-iconbtn" aria-label={t.lineRemove(i + 1)} onClick={() => { setLines((cur) => cur.filter((x) => x.key !== l.key)); touch(); }}><Icon name="trash" /></button>
                    )}
                  </div>
                  <Field label={t.lineDescription} error={tried && missing.includes("line_text") && !(l.description || l.description_ar).trim() ? t.needs.line_text : undefined}>
                    <input value={l.description} dir="auto" maxLength={300} autoComplete="off" onChange={(e) => setLine(l.key, { description: e.target.value })} />
                  </Field>
                  <Field label={t.lineDescriptionAr}>
                    <input value={l.description_ar} dir="rtl" maxLength={300} autoComplete="off" onChange={(e) => setLine(l.key, { description_ar: e.target.value })} />
                  </Field>
                  <div className="ct-grid2">
                    <Field label={t.lineQuantity}><input inputMode="decimal" dir="ltr" value={l.quantity} autoComplete="off" onChange={(e) => setLine(l.key, { quantity: e.target.value })} /></Field>
                    <Field label={t.lineUnit}>
                      <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })}>
                        {meta.units.map((u) => <option key={u} value={u}>{t.units[u] ?? u}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="ct-grid2">
                    <Field label={t.linePrice}><input inputMode="decimal" dir="ltr" value={l.price} autoComplete="off" onChange={(e) => setLine(l.key, { price: e.target.value })} /></Field>
                    <Field label={t.lineDiscount}><input inputMode="decimal" dir="ltr" value={l.discount} autoComplete="off" onChange={(e) => setLine(l.key, { discount: e.target.value })} /></Field>
                  </div>
                  <div className={showTax ? "ct-grid2" : undefined}>
                    <Field label={t.lineSku}><input dir="ltr" value={l.sku} maxLength={40} autoComplete="off" onChange={(e) => setLine(l.key, { sku: e.target.value })} /></Field>
                    {showTax && <Field label={t.lineTaxRate}><input inputMode="decimal" dir="ltr" value={l.tax} autoComplete="off" onChange={(e) => setLine(l.key, { tax: e.target.value })} /></Field>}
                  </div>
                  {bad && <p className="ct-error" role="alert">{t.lineBad}</p>}
                  {p.amounts && <p className="dc-linetotal num"><bdi>{t.lineTotal(m(p.amounts.total))}</bdi></p>}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="ct-sec" aria-labelledby="dc-f-totals">
          <h2 id="dc-f-totals">{t.formTotals}</h2>
          <dl className="dc-totals dc-totals-live num" aria-live="polite">
            {(totals.discount > 0 || totals.tax > 0 || totals.rounding !== 0) && <div><dt>{t.subtotal}</dt><dd><bdi>{m(totals.gross)}</bdi></dd></div>}
            {totals.discount > 0 && <div><dt>{t.discount}</dt><dd>-<bdi>{m(totals.discount)}</bdi></dd></div>}
            {totals.tax > 0 && <div><dt>{t.taxLabel}</dt><dd><bdi>{m(totals.tax)}</bdi></dd></div>}
            {totals.rounding !== 0 && <div><dt>{t.rounding}</dt><dd>{totals.rounding > 0 ? "+" : "-"}<bdi>{m(Math.abs(totals.rounding))}</bdi></dd></div>}
            <div className="dc-grand"><dt>{t.total}</dt><dd><bdi>{totals.valid ? m(totals.total) : "—"}</bdi></dd></div>
          </dl>
          {kindInfo?.payments === "full" && (
            <div className="ct-stack">
              <p className="ct-hint">{t.formPaidReceipt}</p>
              <div className="ct-grid2">
                <Field label={t.formPaid}>
                  <select value={payMethod} onChange={(e) => { setPayMethod(e.target.value as (typeof PAY_METHODS)[number]); touch(); }}>
                    {PAY_METHODS.map((x) => <option key={x} value={x}>{t.methods[x]}</option>)}
                  </select>
                </Field>
                <Field label={t.paymentReference}><input dir="ltr" value={payRef} maxLength={80} autoComplete="off" onChange={(e) => { setPayRef(e.target.value); touch(); }} /></Field>
              </div>
            </div>
          )}
          {kindInfo?.payments === "deposit" && (
            <div className="ct-stack">
              <p className="ct-hint">{t.formPaidDeposit}</p>
              <div className="ct-grid2">
                <Field label={t.formPaidAmount} error={tried && missing.includes("deposit") ? t.needs.deposit : undefined}>
                  <input inputMode="decimal" dir="ltr" value={deposit} autoComplete="off" onChange={(e) => { setDeposit(e.target.value); touch(); }} />
                </Field>
                <Field label={t.formPaid}>
                  <select value={payMethod} onChange={(e) => { setPayMethod(e.target.value as (typeof PAY_METHODS)[number]); touch(); }}>
                    {PAY_METHODS.map((x) => <option key={x} value={x}>{t.methods[x]}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </section>

        <Fold title={t.formNotes}>
          <p className="ct-hint">{t.formNotesHint}</p>
          <Field label={t.formNotesEn}><textarea value={notes.en} maxLength={600} dir="auto" onChange={(e) => { setNotes({ ...notes, en: e.target.value }); touch(); }} /></Field>
          <Field label={t.formNotesAr}><textarea value={notes.ar} maxLength={600} dir="rtl" onChange={(e) => { setNotes({ ...notes, ar: e.target.value }); touch(); }} /></Field>
          <Field label={t.formTermsEn}><textarea value={terms.en} maxLength={600} dir="auto" onChange={(e) => { setTerms({ ...terms, en: e.target.value }); touch(); }} /></Field>
          <Field label={t.formTermsAr}><textarea value={terms.ar} maxLength={600} dir="rtl" onChange={(e) => { setTerms({ ...terms, ar: e.target.value }); touch(); }} /></Field>
        </Fold>

        {tried && missing.length > 0 && (
          <div className="ct-banner" role="note">
            <span><b>{t.stillNeeded}</b>
              <ul className="dc-needs">{missing.map((code) => <li key={code}>{t.needs[code]}</li>)}</ul>
            </span>
          </div>
        )}
      </form>

      <Layer>
        <div className="dc-bar" role="region" aria-label={t.actions}>
          <button type="button" className="btn ct-btn" onClick={leave}>{t.cancel}</button>
          <span className="ct-grow" />
          <button type="button" className={`btn ct-btn ${meta.access.can_issue ? "" : "volt"}`} disabled={busy} onClick={() => void saveDraft()}>
            {busy ? t.saving : t.saveDraft}
          </button>
          {meta.access.can_issue && (
            <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void saveAndIssue()}><Icon name="lock" />{t.issue}</button>
          )}
        </div>
      </Layer>

      {issuing && savedDoc && (
        <IssueSheet lang={lang} meta={meta} push={push} doc={savedDoc} 
          onClose={() => setIssuing(null)} onSettings={onSettings}
          onReceiptInstead={savedDoc.kind === "invoice" ? () => { setKind("receipt"); setIssuing(null); touch(); } : undefined}
          onIssued={(done) => onSaved(done.id)} />
      )}
    </div>
  );
}

