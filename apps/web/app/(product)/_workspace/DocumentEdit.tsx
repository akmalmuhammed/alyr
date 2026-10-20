"use client";

// Writing a document by hand (ALY-146, spec 015; made quick in ALY-141, spec 016): the form for
// a draft. It can be filled from one line of text ("AC repair 500 for Ahmed 5551 2345"), from the
// last document, or from a customer's page. The customer is found among the shop's own or typed,
// and saved for next time; the lines come from the shop's saved lines, from the Catalog (priced
// for the customer's group) or are written free; the totals are worked out as the engine works
// them, live; saving keeps a draft with no number; issuing gives it its number and locks it.
// The engine checks everything again: this form's job is to say what is missing before, in words.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api, refusalOf, sayRefusal, type Branch, type CatalogLine, type CustomerHit, type CustomerRow,
  type Detail, type DraftBody, type ListAnswer, type Meta, type QuickRead, type SavedLine,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import {
  draftTotals, inputMoney, lineAmounts, missingForIssue, parseMoney, parseQuantity, quantityText,
  written, type LineInput,
} from "./documentsLogic";
import { IssueFailure, IssueSheet, type Push } from "./DocumentSheets";
import { Field, Fold, Icon, Layer, Switch } from "./CatalogUi";
import { STANDALONE } from "./standaloneCopy";
import "./standalone.css";

const KINDS = ["invoice", "quote", "receipt", "delivery_note", "proforma"] as const;
const PAY_METHODS = ["cash", "card", "bank_transfer", "cheque", "other"] as const;
const ARABIC = /[؀-ۿ]/;

type LineState = {
  key: string; description: string; description_ar: string; sku: string; quantity: string; unit: string;
  price: string; discount: string; tax: string;
};
let counter = 0;
const nextKey = () => `l${++counter}`;
const blankLine = (): LineState => ({ key: nextKey(), description: "", description_ar: "", sku: "", quantity: "1", unit: "piece", price: "", discount: "", tax: "" });
const isBlank = (l: LineState) => !l.description && !l.description_ar && !l.price;
const EMPTY_CUSTOMER = { name: "", name_ar: "", company: "", phone: "", email: "", registration_number: "", tax_id: "", address: "", address_ar: "" };

export function DocumentEdit({ lang, meta, branches, id, startKind, push, onBack, onSaved, onSettings }: {
  lang: Lang; meta: Meta; branches: Branch[]; id: string | null; startKind: string; push: Push;
  onBack: () => void; onSaved: (id: string) => void; onSettings: (field: string) => void;
}) {
  const t = COPY[lang];
  const s = STANDALONE[lang];
  const exponent = meta.currencies[meta.defaults.currency]?.exponent ?? 2;
  const hasRegistration = meta.defaults.has_registration;
  // A shop with no commercial registration number issues receipts, not invoices (spec 011): its
  // form starts on a receipt rather than on a kind it would be refused.
  const firstKind = (KINDS as readonly string[]).includes(startKind) ? startKind : hasRegistration ? "invoice" : "receipt";
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState("");
  const [kind, setKind] = useState(firstKind);
  const [branch, setBranch] = useState("main");
  const [due, setDue] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [saveCustomerOn, setSaveCustomerOn] = useState(true);
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
  const m = (minor: number) => written(minor, meta.defaults.currency, exponent, meta.currencies[meta.defaults.currency]?.symbol_ar ?? "", lang);

  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickNote, setQuickNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [quickChoices, setQuickChoices] = useState<CustomerHit[]>([]);

  function pickCustomer(c: CustomerHit) {
    setPicked(c);
    setContactId(c.id);
    setCustomer({
      name: c.name, name_ar: c.name_ar ?? "", company: c.company ?? "", phone: c.phone ?? "", email: c.email ?? "",
      registration_number: c.registration_number ?? "", tax_id: c.tax_id ?? "", address: c.address ?? "", address_ar: c.address_ar ?? "",
    });
    setQuickChoices([]);
    setDirty(true);
  }
  // ── filling the form from a document ──
  // One reader for an existing draft (shown as it is), for "the same as my last one" and for
  // "make another like this" (the lines, the customer and the texts, but not the number, the
  // date or what was paid).
  const applyDetail = useCallback((d: Detail, copy: boolean) => {
    setKind((KINDS as readonly string[]).includes(d.kind) ? d.kind : firstKind);
    if (!copy) { setBranch(d.branch); setDue(d.due_date ?? ""); }
    setContactId(d.contact_id);
    setPicked(d.contact_id ? { id: d.contact_id, name: d.customer.name ?? d.customer.name_ar ?? "", phone: d.customer.phone ?? null, email: d.customer.email ?? "", lang: "en", price_group: null } : null);
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
      if (!copy) setPayRef(p.reference);
      if (!copy && d.kind === "deposit_receipt") setDeposit(inputMoney(p.amount_minor, d.currency_exponent));
    }
    setNotes({ en: d.notes.en ?? "", ar: d.notes.ar ?? "" });
    setTerms({ en: d.terms.en ?? "", ar: d.terms.ar ?? "" });
  }, [firstKind]);

  // An existing draft is read once into the form.
  useEffect(() => {
    if (!id) return;
    let live = true;
    api<{ document: Detail }>(`/api/documents/${id}`)
      .then(({ document: d }) => {
        if (!live) return;
        if (d.status !== "draft") { setLoadError(t.failed); return; }
        applyDetail(d, false);
        setSavedDoc(d);
        setLoading(false);
      })
      .catch((error) => { if (live) { setLoadError(sayRefusal(error, lang, fallback)); setLoading(false); } });
    return () => { live = false; };
    // the form reads the draft once; `fallback` and `t` follow the language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // "Make another like this" (`?copy=<id>`) and "New invoice" from a customer (`?contact=<id>`).
  useEffect(() => {
    if (id) return;
    const query = new URLSearchParams(window.location.search);
    const copy = query.get("copy");
    const contact = query.get("contact");
    let live = true;
    if (copy) {
      api<{ document: Detail }>(`/api/documents/${copy}`)
        .then(({ document: d }) => { if (live) { applyDetail(d, true); push(s.copiedFrom(d.number ?? "")); setDirty(true); } })
        .catch((error) => { if (live) push(sayRefusal(error, lang, fallback), { tone: "bad" }); });
    } else if (contact) {
      api<{ customer: CustomerRow }>(`/api/documents/customers/${contact}`)
        .then(({ customer: c }) => { if (live) pickCustomer({ ...c, phone: c.phone || null, price_group: null }); })
        .catch(() => undefined);
    }
    return () => { live = false; };
    // read once, when the form opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const customerName = customer.name.trim() || customer.name_ar.trim() || customer.company.trim();
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

  function clearCustomer() { setPicked(null); setContactId(null); setCustomer(EMPTY_CUSTOMER); touch(); }

  // ── the one-line box ──

  async function readQuick() {
    const text = quickText.trim();
    if (!text) return;
    setQuickBusy(true);
    setQuickNote(null);
    try {
      const r = await api<QuickRead>("/api/documents/quick", "POST", { text });
      applyQuick(r);
    } catch (error) {
      setQuickNote({ tone: "bad", text: sayRefusal(error, lang, fallback) });
    } finally {
      setQuickBusy(false);
    }
  }
  function applyQuick(r: QuickRead) {
    if (!r.recognised) { setQuickNote({ tone: "bad", text: s.quickNothing }); return; }
    const parts: string[] = [];
    // The kind it asked for, unless the shop cannot issue an invoice: a receipt then.
    if (r.kind === "receipt") setKind("receipt");
    else if (!hasRegistration) setKind("receipt");
    else if (!(KINDS as readonly string[]).includes(kind) || kind === "receipt") setKind("invoice");
    if (r.method && (PAY_METHODS as readonly string[]).includes(r.method)) setPayMethod(r.method as (typeof PAY_METHODS)[number]);
    const description = r.description ?? "";
    const minor = r.amount_minor ?? null;
    if (description || minor !== null) {
      const arabic = ARABIC.test(description);
      const fresh: LineState = {
        ...blankLine(), description: arabic ? "" : description, description_ar: arabic ? description : "",
        price: minor !== null ? inputMoney(minor, exponent) : "",
      };
      setLines((cur) => (cur.length === 1 && isBlank(cur[0]) ? [fresh] : [...cur.filter((l) => !isBlank(l)), fresh]));
      if (description) parts.push(description);
      if (minor !== null) parts.push(m(minor));
    }
    if (r.customer) {
      pickCustomer(r.customer);
      parts.push(s.quickFor(r.customer.name || r.customer.name_ar || ""));
    } else if (r.candidates && r.candidates.length) {
      setQuickChoices(r.candidates);
    } else if (r.name || r.phone) {
      setPicked(null);
      setContactId(null);
      setCustomer((cur) => ({ ...cur, name: r.name ?? cur.name, phone: r.phone ? `+${r.phone}` : cur.phone }));
      if (r.name) parts.push(s.quickFor(r.name));
    }
    setDirty(true);
    const problem = r.problems?.[0];
    if (problem) {
      const say = s.quickProblems[problem];
      setQuickNote({ tone: "bad", text: typeof say === "function" ? say((r.numbers ?? []).join(", ")) : (say ?? s.quickNothing) });
    } else if (r.candidates && r.candidates.length && !r.customer) {
      setQuickNote({ tone: "ok", text: s.quickFilled(parts.join(lang === "ar" ? "، " : ", ")) });
    } else if (r.name && !r.customer && !r.phone && !r.candidates?.length) {
      setQuickNote({ tone: "ok", text: `${s.quickFilled(parts.join(lang === "ar" ? "، " : ", "))} ${s.quickNoCustomer(r.name)}` });
    } else {
      setQuickNote({ tone: "ok", text: s.quickFilled(parts.join(lang === "ar" ? "، " : ", ")) });
    }
    if (!hasRegistration && r.kind !== "receipt") setQuickNote((cur) => (cur ? { ...cur, text: `${cur.text} ${t.crMissing}` } : cur));
  }

  // ── the last one ──
  const [copyBusy, setCopyBusy] = useState(false);
  async function copyLast() {
    setCopyBusy(true);
    try {
      const list = await api<ListAnswer>(`/api/documents?status=issued&kind=${kind}&limit=1&totals=false`);
      const row = list.documents[0];
      if (!row) { push(s.copyLastNone); return; }
      const { document: d } = await api<{ document: Detail }>(`/api/documents/${row.id}`);
      applyDetail(d, true);
      setDirty(true);
      push(s.copiedFrom(d.number ?? ""));
    } catch (error) {
      push(sayRefusal(error, lang, fallback), { tone: "bad" });
    } finally {
      setCopyBusy(false);
    }
  }

  // ── lines: saved lines, then the Catalog ──
  const [focus, setFocus] = useState<string | null>(null);
  const [savedHits, setSavedHits] = useState<SavedLine[]>([]);
  const [catalogHits, setCatalogHits] = useState<CatalogLine[]>([]);
  const [savedMarks, setSavedMarks] = useState<Set<string>>(new Set());
  const usedIds = useRef<Set<string>>(new Set());
  const focusedLine = lines.find((l) => l.key === focus) ?? null;
  const focusedQuery = focusedLine ? (focusedLine.description || focusedLine.description_ar).trim() : "";
  useEffect(() => {
    if (!focus) return;
    const wait = setTimeout(() => {
      api<{ lines: SavedLine[] }>(`/api/documents/saved-lines?q=${encodeURIComponent(focusedQuery)}&limit=5`)
        .then((r) => setSavedHits(r.lines)).catch(() => setSavedHits([]));
      if (meta.defaults.has_catalog && focusedQuery) {
        const q = new URLSearchParams({ q: focusedQuery });
        if (contactId) q.set("contact_id", contactId);
        api<{ lines: CatalogLine[] }>(`/api/documents/catalog-lines?${q.toString()}`)
          .then((r) => setCatalogHits(r.lines.slice(0, 4))).catch(() => setCatalogHits([]));
      } else setCatalogHits([]);
    }, 200);
    return () => clearTimeout(wait);
  }, [focus, focusedQuery, contactId, meta.defaults.has_catalog]);

  const lineKey = (l: LineState) => `${(l.description || l.description_ar).trim().toLowerCase()}|${l.price.trim()}`;
  function chooseSaved(key: string, hit: SavedLine) {
    setLines((cur) => cur.map((l) => (l.key === key ? {
      ...l, description: hit.name, description_ar: hit.name_ar, unit: hit.unit,
      price: hit.price_minor ? inputMoney(hit.price_minor, exponent) : l.price,
    } : l)));
    usedIds.current.add(hit.id);
    setSavedMarks((cur) => new Set(cur).add(`${(hit.name || hit.name_ar).trim().toLowerCase()}|${inputMoney(hit.price_minor, exponent)}`));
    setFocus(null);
    touch();
  }
  function addCatalogLine(key: string | null, c: CatalogLine) {
    const line: LineState = {
      key: key ?? nextKey(), description: c.description, description_ar: c.description_ar,
      sku: c.sku || (c.code ? String(c.code) : ""), quantity: "1", unit: c.unit,
      price: inputMoney(c.unit_price_minor, exponent), discount: "", tax: "",
    };
    setLines((cur) => (key ? cur.map((l) => (l.key === key ? { ...line, quantity: l.quantity || "1" } : l))
      : cur.length === 1 && isBlank(cur[0]) ? [line] : [...cur, line]));
    setFocus(null);
    touch();
  }
  function setLine(key: string, patch: Partial<LineState>) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  }
  async function saveLine(l: LineState, p: { input: LineInput | null }) {
    if (!p.input || !(l.description || l.description_ar).trim()) { push(s.saveLineNeeds, { tone: "bad" }); return; }
    try {
      await api("/api/documents/saved-lines", "POST", {
        name: l.description.trim(), name_ar: l.description_ar.trim(), unit: l.unit, price_minor: p.input.price,
      });
      setSavedMarks((cur) => new Set(cur).add(lineKey(l)));
      push(s.saveLineDone);
    } catch (error) {
      push(sayRefusal(error, lang, fallback), { tone: "bad" });
    }
  }

  // Catalog search for a line the person adds on purpose (a shop that has the Catalog).
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

  /** A customer typed with a phone number is saved for next time (unless the person says not):
   *  the form then writes to the saved customer, who also gets the payment link and the send. */
  async function ensureCustomer(): Promise<string | null | false> {
    if (contactId) return contactId;
    if (!saveCustomerOn || !customerName || !customer.phone.trim()) return null;
    try {
      const made = await api<{ customer: CustomerRow }>("/api/documents/customers", "POST",
        Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, v.trim()])));
      const c = made.customer;
      setContactId(c.id);
      setPicked({ id: c.id, name: c.name, name_ar: c.name_ar, phone: c.phone, email: c.email, lang: c.lang, price_group: null });
      push(s.customerSaved(c.name || c.name_ar || c.company));
      return c.id;
    } catch (error) {
      const r = refusalOf(error);
      setFailure({ code: r?.code ?? "", field: r?.field ?? "", text: sayRefusal(error, lang, fallback) });
      return false;
    }
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
      const saved = await ensureCustomer();
      if (saved === false) return null;
      const payload = { ...body(), contact_id: saved ?? contactId } as unknown as Record<string, unknown>;
      const done = id
        ? await api<{ document: Detail }>(`/api/documents/${id}`, "PUT", payload)
        : savedDoc
          ? await api<{ document: Detail }>(`/api/documents/${savedDoc.id}`, "PUT", payload)
          : await api<{ document: Detail }>("/api/documents", "POST", payload);
      setDirty(false);
      setSavedDoc(done.document);
      if (usedIds.current.size) {
        void api("/api/documents/saved-lines/used", "POST", { ids: [...usedIds.current] }).catch(() => undefined);
        usedIds.current = new Set();
      }
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
  const usualNote = (meta.defaults.notes?.[kind] ?? {})[lang === "ar" ? "ar" : "en"] ?? "";
  const usualTerms = (meta.defaults.terms?.[kind] ?? {})[lang === "ar" ? "ar" : "en"] ?? "";
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

      {!id && (
        <section className="sa-quick" aria-labelledby="sa-quick-title">
          <div className="sa-quick-head">
            <h2 id="sa-quick-title">{s.quickTitle}</h2>
            <button type="button" className="btn small ghost" disabled={copyBusy} onClick={() => void copyLast()}>
              <Icon name="copy" />{copyBusy ? s.copyLastBusy : s.copyLast}
            </button>
          </div>
          <form className="sa-quick-form" onSubmit={(e) => { e.preventDefault(); void readQuick(); }}>
            <Field label={s.quickLabel} hint={s.quickHint} className="sa-quick-field">
              <textarea className="sa-quick-text" rows={2} value={quickText} dir="auto" maxLength={500}
                placeholder={s.quickPlaceholder} enterKeyHint="go" autoComplete="off" spellCheck={false}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void readQuick(); } }} />
            </Field>
            <div className="ct-btnrow">
              <button type="submit" className="btn ct-btn" disabled={quickBusy || !quickText.trim()}>
                <Icon name="edit" />{s.quickFill}
              </button>
              {quickText && <button type="button" className="btn ghost ct-btn" onClick={() => { setQuickText(""); setQuickNote(null); setQuickChoices([]); }}>{s.quickClear}</button>}
            </div>
          </form>
          {quickNote && <p className={quickNote.tone === "bad" ? "ct-alert" : "sa-quick-note"} role={quickNote.tone === "bad" ? "alert" : "status"}>{quickNote.tone === "bad" && <Icon name="warn" />}{quickNote.text}</p>}
          {quickChoices.length > 0 && (
            <div className="sa-choices" role="group" aria-label={s.quickWho}>
              <b>{s.quickWho}</b>
              <ul className="dc-hits">
                {quickChoices.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="dc-hit" onClick={() => pickCustomer(c)}>
                      <b dir="auto">{(lang === "ar" ? c.name_ar || c.name : c.name || c.name_ar) || c.company}</b>
                      <small dir="ltr">{c.phone ?? ""}</small>
                      <span className="sh-pill dc-pill quiet">{t.formCustomerUse}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

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
        {kind === "invoice" && !hasRegistration && (
          <p className="ct-banner" role="note">
            <span>{COPY[lang].crMissing}</span>
            <button type="button" className="btn small" onClick={() => onSettings("commercial_registration")}>{t.fixField.registration_needed}</button>
          </p>
        )}

        <section className="ct-sec" aria-labelledby="dc-f-customer">
          <h2 id="dc-f-customer">{t.formCustomer}</h2>
          {picked ? (
            <div className="ct-toggle dc-picked">
              <span className="ct-toggle-text">
                <b dir="auto">{t.formCustomerPicked(picked.name || picked.name_ar || picked.company || "")}</b>
                {picked.phone && <small dir="ltr">{picked.phone}</small>}
                {picked.price_group && <small>{lang === "ar" ? picked.price_group.name_ar || picked.price_group.name : picked.price_group.name}</small>}
              </span>
              <button type="button" className="btn small ghost" onClick={clearCustomer}>{t.formCustomerClear}</button>
            </div>
          ) : (
            <>
              <Field label={t.formCustomerFind} hint={t.formCustomerFindHint}>
                <input type="search" value={custQuery} dir="auto" autoComplete="off" enterKeyHint="search" onChange={(e) => setCustQuery(e.target.value)} />
              </Field>
              {custHits && custHits.length > 0 && (
                <>
                  {!custQuery.trim() && <p className="sa-sub">{s.customersRecent}</p>}
                  <ul className="dc-hits" aria-label={t.formCustomerFind}>
                    {custHits.slice(0, custQuery.trim() ? 12 : 5).map((c) => (
                      <li key={c.id}>
                        <button type="button" className="dc-hit" onClick={() => pickCustomer(c)}>
                          <b dir="auto">{(lang === "ar" ? c.name_ar || c.name : c.name || c.name_ar) || c.company}</b>
                          <small dir="ltr">{c.phone ?? ""}</small>
                          <span className="sh-pill dc-pill quiet">{t.formCustomerUse}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
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
          {!picked && customerName && (
            <label className="ct-toggle sa-save-customer">
              <span className="ct-toggle-text">
                <b>{s.saveCustomer}</b>
                <small>{customer.phone.trim() ? s.saveCustomerHint : s.saveCustomerNeedsPhone}</small>
              </span>
              <Switch on={saveCustomerOn && Boolean(customer.phone.trim())} label={s.saveCustomer} disabled={!customer.phone.trim()} onChange={setSaveCustomerOn} />
            </label>
          )}
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
          <ol className="dc-linelist">
            {lines.map((l, i) => {
              const p = parsed[i];
              const bad = tried && (!p.input || !p.amounts);
              const typed = (l.description || l.description_ar).trim();
              const savedAlready = savedMarks.has(lineKey(l));
              const showHits = focus === l.key && (savedHits.length > 0 || catalogHits.length > 0);
              return (
                <li key={l.key} className={`ct-card-form dc-lineform ${bad ? "bad" : ""}`}>
                  <div className="ct-row-between">
                    <b>{t.formLine(i + 1)}</b>
                    {lines.length > 1 && (
                      <button type="button" className="sh-iconbtn" aria-label={t.lineRemove(i + 1)} onClick={() => { setLines((cur) => cur.filter((x) => x.key !== l.key)); touch(); }}><Icon name="trash" /></button>
                    )}
                  </div>
                  <Field label={t.lineDescription} error={tried && missing.includes("line_text") && !(l.description || l.description_ar).trim() ? t.needs.line_text : undefined}>
                    <input value={l.description || l.description_ar} dir="auto" maxLength={300} autoComplete="off" enterKeyHint="next"
                      onFocus={() => setFocus(l.key)}
                      onBlur={() => setTimeout(() => setFocus((cur) => (cur === l.key ? null : cur)), 150)}
                      onChange={(e) => {
                        // The words on the invoice: in the Arabic field when that is all the line has, else in the first.
                        const v = e.target.value;
                        if (l.description || (!l.description_ar && !ARABIC.test(v))) setLine(l.key, { description: v });
                        else setLine(l.key, { description_ar: v });
                      }} />
                  </Field>
                  {showHits && (
                    <div className="sa-hits" role="listbox" aria-label={s.savedSuggestions}>
                      {savedHits.length > 0 && <p className="sa-sub">{s.savedSuggestions}</p>}
                      <ul className="dc-hits">
                        {savedHits.map((h) => (
                          <li key={h.id}>
                            <button type="button" className="dc-hit" role="option" aria-selected={false}
                              onMouseDown={(e) => e.preventDefault()} onClick={() => chooseSaved(l.key, h)}>
                              <b dir="auto">{lang === "ar" ? h.name_ar || h.name : h.name || h.name_ar}</b>
                              <small>{t.units[h.unit] ?? h.unit}</small>
                              <span className="num dc-hit-price"><bdi>{m(h.price_minor)}</bdi></span>
                            </button>
                          </li>
                        ))}
                        {catalogHits.length > 0 && <li className="sa-sub-row"><span className="sa-sub">{s.catalogSuggestions}</span></li>}
                        {catalogHits.map((c) => (
                          <li key={`${c.item_id}${c.variant_id ?? ""}`}>
                            <button type="button" className="dc-hit" role="option" aria-selected={false}
                              onMouseDown={(e) => e.preventDefault()} onClick={() => addCatalogLine(l.key, c)}>
                              <b dir="auto">{lang === "ar" ? c.description_ar || c.description : c.description}</b>
                              <small dir="ltr">{c.code !== null ? `#${c.code}` : ""}</small>
                              <span className="num dc-hit-price"><bdi>{m(c.unit_price_minor)}</bdi></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="ct-grid2 sa-numbers">
                    <Field label={t.linePrice}>
                      <input className="ct-bignum" inputMode="decimal" dir="ltr" value={l.price} autoComplete="off" enterKeyHint="done" placeholder="0.00" onChange={(e) => setLine(l.key, { price: e.target.value })} />
                    </Field>
                    <Field label={t.lineQuantity}>
                      <input className="sa-num" inputMode="decimal" dir="ltr" value={l.quantity} autoComplete="off" enterKeyHint="done" onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                    </Field>
                  </div>
                  {bad && <p className="ct-error" role="alert">{t.lineBad}</p>}
                  {p.amounts && <p className="dc-linetotal num"><bdi>{t.lineTotal(m(p.amounts.total))}</bdi></p>}
                  {typed && p.input && p.input.price > 0 && !savedAlready && (
                    <button type="button" className="btn small ghost sa-save-line" onClick={() => void saveLine(l, p)}>
                      <Icon name="tag" />{s.saveLine}
                    </button>
                  )}
                  {typed && savedAlready && <p className="sa-saved"><Icon name="check" className="sh-ico" />{s.saveLineDone}</p>}
                  <Fold title={s.lineMore} summary={s.lineMoreSummary}>
                    <Field label={t.lineDescriptionAr}>
                      <input value={l.description_ar} dir="rtl" maxLength={300} autoComplete="off" onChange={(e) => setLine(l.key, { description_ar: e.target.value })} />
                    </Field>
                    <div className="ct-grid2">
                      <Field label={t.lineUnit}>
                        <select value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })}>
                          {meta.units.map((u) => <option key={u} value={u}>{t.units[u] ?? u}</option>)}
                        </select>
                      </Field>
                      <Field label={t.lineDiscount}><input inputMode="decimal" dir="ltr" value={l.discount} autoComplete="off" onChange={(e) => setLine(l.key, { discount: e.target.value })} /></Field>
                    </div>
                    <div className={showTax ? "ct-grid2" : undefined}>
                      <Field label={t.lineSku}><input dir="ltr" value={l.sku} maxLength={40} autoComplete="off" onChange={(e) => setLine(l.key, { sku: e.target.value })} /></Field>
                      {showTax && <Field label={t.lineTaxRate}><input inputMode="decimal" dir="ltr" value={l.tax} autoComplete="off" onChange={(e) => setLine(l.key, { tax: e.target.value })} /></Field>}
                    </div>
                  </Fold>
                </li>
              );
            })}
          </ol>
          <div className="ct-btnrow">
            <button type="button" className="btn ct-btn" onClick={() => { setLines((cur) => [...cur, blankLine()]); touch(); }}>
              <Icon name="plus" />{t.formAddFree}
            </button>
            {meta.defaults.has_catalog && (
              <button type="button" className="btn ct-btn" aria-expanded={catOpen} onClick={() => setCatOpen((o) => !o)}>
                <Icon name="search" />{t.formAddFromCatalog}
              </button>
            )}
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
                      <button type="button" className="dc-hit" onClick={() => addCatalogLine(null, c)}>
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

        <section className="ct-sec" aria-labelledby="dc-f-date">
          <h2 id="dc-f-date">{t.formDate}</h2>
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

        <Fold title={t.formNotes}>
          <p className="ct-hint">{t.formNotesHint}</p>
          {usualNote && !notes.en && !notes.ar && <p className="ct-hint">{s.usualNote(usualNote)}</p>}
          <Field label={t.formNotesEn}><textarea value={notes.en} maxLength={600} dir="auto" onChange={(e) => { setNotes({ ...notes, en: e.target.value }); touch(); }} /></Field>
          <Field label={t.formNotesAr}><textarea value={notes.ar} maxLength={600} dir="rtl" onChange={(e) => { setNotes({ ...notes, ar: e.target.value }); touch(); }} /></Field>
          {usualTerms && !terms.en && !terms.ar && <p className="ct-hint">{s.usualTerms(usualTerms)}</p>}
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
          <p className="sa-bar-total num" aria-live="polite"><span>{s.totalBar}</span> <b><bdi>{totals.valid ? m(totals.total) : "—"}</bdi></b></p>
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
