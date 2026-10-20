"use client";

// The two steps that are only for "Invoices only" (ALY-141, spec 016): what goes on the owner's
// invoices, and their first invoice. The rest of /start is the same path every business takes
// (sign in, the business, the price, going live). Both steps talk to the Documents API as the
// owner, exactly as the workspace does; nothing here is a second way of making a document.

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat, initialsOf, type ChatMessage } from "./Chat";
import { COPY, type Lang } from "./copy";

type T = (typeof COPY)[Lang];

async function call<R>(url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; data: R }> {
  const response = await fetch(url, {
    method, cache: "no-store",
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as R };
}

/** What the API said when it refused, in the person's language (the Documents API writes both). */
function words(data: unknown, lang: Lang, fallback: string): string {
  const d = (data ?? {}) as { detail?: unknown; message_ar?: string };
  const text = lang === "ar" ? d.message_ar : typeof d.detail === "string" ? d.detail : "";
  return text && text.length < 300 ? text : fallback;
}

type Settings = {
  business_name: string; business_name_ar: string; commercial_registration: string; tax_id: string;
  address: string; phone: string; languages: string; default_audience: string; has_logo: boolean;
  logo_sha256: string | null;
};
const EDITABLE = ["business_name", "business_name_ar", "commercial_registration", "tax_id", "address", "phone"] as const;
const LANGUAGES = ["ar_en", "en_ar", "ar", "en"] as const;

// ── what goes on the invoices ───────────────────────────

export function DetailsStep({ lang, t, shopName, shopNameAr, paper, onPaper, onSaved, onError }: {
  lang: Lang; t: T; shopName: string; shopNameAr: string; paper: string | null; onPaper: (url: string | null) => void;
  onSaved: () => void; onError: (text: string) => void;
}) {
  const d = t.details;
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState({ business_name: shopName, business_name_ar: shopNameAr, commercial_registration: "", tax_id: "", address: "", phone: "", languages: "ar_en", prefix: "INV" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const working = useRef(false);

  const load = useCallback(async () => {
    const answer = await call<{ settings: Settings }>("/api/documents/settings");
    if (answer.ok) {
      const s = answer.data.settings;
      setSaved(s);
      setForm((cur) => ({
        ...cur, business_name: s.business_name || shopName, business_name_ar: s.business_name_ar || shopNameAr,
        commercial_registration: s.commercial_registration, tax_id: s.tax_id, address: s.address, phone: s.phone,
        languages: s.languages,
      }));
    }
    setLoaded(true);
  }, [shopName, shopNameAr]);
  useEffect(() => {
    const first = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(first);
  }, [load]);

  // The settings as typed and not yet saved: what the live sample is drawn from.
  const typed = useCallback(() => {
    const change: Record<string, unknown> = {};
    for (const key of EDITABLE) if (saved && form[key] !== (saved[key] ?? "")) change[key] = form[key];
    if (saved && form.languages !== saved.languages) {
      change.languages = form.languages;
      change.default_audience = form.languages === "en" ? "business" : "consumer";
    }
    return change;
  }, [form, saved]);

  const hasCr = Boolean(form.commercial_registration.trim());
  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    const wait = setTimeout(async () => {
      try {
        const response = await fetch("/api/documents/preview?format=png&width=700", {
          method: "POST", cache: "no-store", signal: controller.signal, headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: hasCr ? "invoice" : "receipt", settings: typed() }),
        });
        if (!response.ok) { setPreviewError(true); return; }
        const url = URL.createObjectURL(await response.blob());
        setPreviewError(false);
        onPaper(url);
      } catch {
        if (!controller.signal.aborted) setPreviewError(true);
      }
    }, 500);
    return () => { clearTimeout(wait); controller.abort(); };
    // the sample follows what is typed; `typed` is rebuilt from `form` and `saved`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, form, saved?.logo_sha256, hasCr]);

  async function chooseLogo(picked: File | undefined) {
    if (!picked) return;
    setLogoBusy(true);
    try {
      const response = await fetch("/api/documents/settings/logo", {
        method: "PUT", cache: "no-store", headers: { "content-type": picked.type || "application/octet-stream" }, body: picked,
      });
      if (!response.ok) onError(words(await response.json().catch(() => ({})), lang, d.failed));
      else await load();
    } finally {
      setLogoBusy(false);
    }
  }

  async function save() {
    if (working.current) return;
    if (!/^[A-Z0-9]{1,8}$/.test(form.prefix)) { onError(d.badPrefix); return; }
    working.current = true;
    setBusy(true);
    onError("");
    try {
      const change = typed();
      if (Object.keys(change).length) {
        const answer = await call("/api/documents/settings", "PUT", change);
        if (!answer.ok) { onError(words(answer.data, lang, d.failed)); return; }
      }
      if (form.prefix !== "INV") {
        const answer = await call("/api/documents/series/invoice/main", "PUT", { prefix: form.prefix });
        if (!answer.ok) { onError(words(answer.data, lang, d.badPrefix)); return; }
      }
      onSaved();
    } catch {
      onError(t.offline);
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form, value: string) => setForm((cur) => ({ ...cur, [key]: value }));
  return (
    <>
      <p className="ob-kicker">{t.steps.details}</p>
      <h1>{d.title}</h1>
      <p className="ob-sub">{d.sub}</p>
      <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="ob-two">
          <label className="ob-field"><span>{d.name}</span><input required value={form.business_name} dir="auto" autoComplete="organization" onChange={(e) => set("business_name", e.target.value)} /></label>
          <label className="ob-field"><span>{d.nameAr}</span><input value={form.business_name_ar} dir="rtl" lang="ar" onChange={(e) => set("business_name_ar", e.target.value)} /></label>
        </div>
        <label className="ob-field">
          <span>{d.registration}</span>
          <input value={form.commercial_registration} dir="ltr" inputMode="numeric" autoComplete="off" maxLength={40} onChange={(e) => set("commercial_registration", e.target.value)} />
          <small>{d.registrationHint}</small>
        </label>
        <details className="ob-fold">
          <summary>{d.more}</summary>
          <div className="ob-fields">
            <label className="ob-field"><span>{d.taxId}</span><input value={form.tax_id} dir="ltr" maxLength={40} autoComplete="off" onChange={(e) => set("tax_id", e.target.value)} /></label>
            <label className="ob-field"><span>{d.address}</span><input value={form.address} dir="auto" maxLength={300} autoComplete="street-address" onChange={(e) => set("address", e.target.value)} /></label>
            <label className="ob-field"><span>{d.phone}</span><input type="tel" value={form.phone} dir="ltr" inputMode="tel" maxLength={40} autoComplete="tel" onChange={(e) => set("phone", e.target.value)} /></label>
            <div className="ob-field">
              <span>{d.logo}</span>
              <div className="ob-logo-row">
                {saved?.has_logo
                  // eslint-disable-next-line @next/next/no-img-element -- the owner's own saved logo
                  ? <img className="ob-logo-img" src={`/api/documents/settings/logo?v=${saved.logo_sha256 ?? ""}`} alt={d.logo} />
                  : null}
                <input ref={file} className="ob-file" type="file" accept="image/png,image/jpeg,image/webp" aria-label={saved?.has_logo ? d.logoChange : d.logoChoose}
                  onChange={(e) => { void chooseLogo(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" className="ob-btn small ghost" disabled={logoBusy} onClick={() => file.current?.click()}>{saved?.has_logo ? d.logoChange : d.logoChoose}</button>
              </div>
              <small>{d.logoHint}</small>
            </div>
          </div>
        </details>
        <fieldset className="ob-field">
          <legend>{d.language}</legend>
          <div className="ob-chips">
            {LANGUAGES.map((l) => (
              <button key={l} type="button" className={`ob-chip ${form.languages === l ? "on" : ""}`} aria-pressed={form.languages === l} onClick={() => set("languages", l)}>{d.languages[l]}</button>
            ))}
          </div>
          <small>{d.languageHint}</small>
        </fieldset>
        <label className="ob-field">
          <span>{d.prefix}</span>
          <input value={form.prefix} dir="ltr" maxLength={8} autoComplete="off" onChange={(e) => set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <small>{d.prefixHint}</small>
        </label>
      </form>
      <details className="ob-fold ob-paper-fold">
        <summary>{d.preview}</summary>
        <PaperPicture url={paper} alt={d.previewAlt} failed={previewError ? d.previewFailed : ""} />
      </details>
      {busy && <p className="ob-sub" role="status">{t.saving}</p>}
    </>
  );
}

export function PaperPicture({ url, alt, failed }: { url: string | null; alt: string; failed?: string }) {
  if (failed) return <p className="ob-muted" role="status">{failed}</p>;
  if (!url) return <div className="ob-paper ob-paper-wait" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- a picture of this business's own sample, made for this step
  return <img className="ob-paper" src={url} alt={alt} />;
}

// ── the first invoice ───────────────────────────────────

type Made = { id: string; number: string; kind: "invoice" | "receipt" };

function freshKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  return `first-${random}`.slice(0, 80);
}

export function FirstStep({ lang, t, shopName, hasCr, made, email, onMade, onError }: {
  lang: Lang; t: T; shopName: string; hasCr: boolean; made: Made | null; email: { ready: boolean; address: string };
  onMade: () => void; onError: (text: string) => void;
}) {
  const f = t.first;
  const receipt = !hasCr;
  const [quick, setQuick] = useState("");
  const [who, setWho] = useState("");
  const [phone, setPhone] = useState("");
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef("");
  const [note, setNote] = useState("");

  async function fill() {
    if (!quick.trim()) return;
    setNote("");
    const answer = await call<{ recognised: boolean; amount_minor?: number | null; description?: string; name?: string; phone?: string; customer?: { name: string; phone: string } | null }>("/api/documents/quick", "POST", { text: quick });
    if (!answer.ok || !answer.data.recognised) { setNote(f.quickNothing); return; }
    const r = answer.data;
    if (r.description) setWhat(r.description);
    if (r.amount_minor) setAmount(String(r.amount_minor / 100));
    const name = r.customer?.name || r.name;
    if (name) setWho(name);
    const number = r.customer?.phone || (r.phone ? `+${r.phone}` : "");
    if (number) setPhone(number);
  }

  async function make() {
    const minor = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!who.trim() || !what.trim() || !Number.isFinite(minor) || minor <= 0) { onError(f.needs); return; }
    setBusy(true);
    onError("");
    // One key for this attempt: the same request sent again (a dropped connection) is the same invoice.
    if (!key.current) key.current = freshKey();
    try {
      let contactId: string | null = null;
      if (phone.trim()) {
        const saved = await call<{ customer?: { id: string } }>("/api/documents/customers", "POST", { name: who.trim(), phone: phone.trim() });
        if (saved.ok) contactId = saved.data.customer?.id ?? null;
        else { onError(words(saved.data, lang, t.offline)); return; }
      }
      const arabic = /[؀-ۿ]/.test(what);
      const body = {
        kind: receipt ? "receipt" : "invoice", issue: true, contact_id: contactId, customer: { name: who.trim(), ...(phone.trim() && !contactId ? { phone: phone.trim() } : {}) },
        lines: [{ description: arabic ? "" : what.trim(), description_ar: arabic ? what.trim() : "", quantity: "1", unit: "piece", unit_price_minor: minor }],
        payments: receipt ? [{ method: "cash", amount_minor: minor, reference: "" }] : [],
      };
      const answer = await call("/api/documents", "POST", body, { "Idempotency-Key": key.current });
      if (!answer.ok) { onError(words(answer.data, lang, t.offline)); return; }
      onMade();
    } catch {
      onError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  if (made) return <MadeCard lang={lang} t={t} shopName={shopName} made={made} email={email} onError={onError} />;
  return (
    <>
      <p className="ob-kicker">{t.steps.first}</p>
      <h1>{receipt ? f.titleReceipt : f.titleInvoice}</h1>
      <p className="ob-sub">{f.sub}</p>
      {receipt && <p className="ob-note">{f.receiptNote}</p>}
      <div className="ob-quick">
        <label className="ob-field">
          <span>{f.quick}</span>
          <input value={quick} dir="auto" placeholder={f.quickPlaceholder} autoComplete="off" enterKeyHint="go"
            onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void fill(); } }} />
        </label>
        <button type="button" className="ob-btn small ghost" disabled={!quick.trim()} onClick={() => void fill()}>{f.quickFill}</button>
      </div>
      {note && <p className="ob-muted" role="status">{note}</p>}
      <form id="ob-form" className="ob-fields" onSubmit={(e) => { e.preventDefault(); void make(); }}>
        <label className="ob-field"><span>{f.who}</span><input required value={who} dir="auto" autoComplete="off" onChange={(e) => setWho(e.target.value)} /></label>
        <label className="ob-field"><span>{f.phone}</span><input type="tel" value={phone} dir="ltr" inputMode="tel" autoComplete="off" onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="ob-field"><span>{f.what}</span><input required value={what} dir="auto" autoComplete="off" onChange={(e) => setWhat(e.target.value)} /></label>
        <label className="ob-field"><span>{f.amount}</span><input required className="ob-bignum" value={amount} dir="ltr" inputMode="decimal" autoComplete="off" enterKeyHint="done" onChange={(e) => setAmount(e.target.value)} /></label>
      </form>
      {busy && <p className="ob-sub" role="status">{t.saving}</p>}
    </>
  );
}

function MadeCard({ lang, t, shopName, made, email, onError }: {
  lang: Lang; t: T; shopName: string; made: Made; email: { ready: boolean; address: string }; onError: (text: string) => void;
}) {
  const f = t.first;
  const [page, setPage] = useState<string | null>(null);
  const [link, setLink] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [tested, setTested] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let live = true;
    let url = "";
    (async () => {
      const response = await fetch(`/api/documents/${made.id}/pdf?format=png&width=700`, { cache: "no-store" });
      if (response.ok && live) { url = URL.createObjectURL(await response.blob()); setPage(url); }
      const shared = await call<{ url: string }>(`/api/documents/${made.id}/link`, "POST");
      if (shared.ok && live) setLink(shared.data.url);
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [made.id]);

  // The test line fills in a moment after the send; look now and then while the card is open.
  useEffect(() => {
    if (!tested) return;
    let live = true;
    const tick = async () => {
      const answer = await call<{ messages: (ChatMessage & { kind?: string; payload?: { filename?: string } })[] }>("/api/onboarding/test-chat");
      if (live && answer.ok) setChat(answer.data.messages);
    };
    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => { live = false; clearInterval(timer); };
  }, [tested]);

  async function test() {
    setBusy("test");
    onError("");
    const answer = await call("/api/onboarding/test-send", "POST", { document_id: made.id, lang });
    setBusy("");
    if (!answer.ok) { onError(words(answer.data, lang, f.testFailed)); return; }
    setTested(true);
  }
  async function mail() {
    setBusy("email");
    onError("");
    const answer = await call("/api/documents/" + made.id + "/send", "POST", { channels: ["email"], email: email.address, language: lang });
    setBusy("");
    if (!answer.ok) { onError(words(answer.data, lang, f.testFailed)); return; }
    setEmailed(true);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(true); }
  }
  const kind = f.kinds[made.kind];
  const wa = link ? `https://wa.me/?text=${encodeURIComponent(lang === "ar" ? `‏${kind} رقم ${made.number} من ${shopName}.\n‏${link} ` : `${kind} ${made.number} from ${shopName}.\n${link} `)}` : "";
  return (
    <>
      <p className="ob-kicker">{t.steps.first}</p>
      <div className="ob-success" role="status">
        <span className="ob-signal" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
        </span>
        <div><h1 className="ob-made">{f.made(kind, made.number)}</h1><small>{f.madeSub}</small></div>
      </div>
      {page && (
        // eslint-disable-next-line @next/next/no-img-element -- a picture of the document just issued
        <img className="ob-paper" src={page} alt={f.paperAlt(kind, made.number)} />
      )}
      <section className="ob-card" aria-labelledby="ob-test-title">
        <h2 id="ob-test-title">{f.testTitle}</h2>
        <p className="ob-muted">{f.testSub}</p>
        <div className="ob-row-btns">
          <button type="button" className="ob-btn small" disabled={busy === "test"} onClick={() => void test()}>{f.testButton}</button>
          {tested && <span className="ob-muted" role="status">{f.testSent}</span>}
        </div>
        {tested && (
          <div className="ob-test-chat">
            <Chat name={f.testChatName} initials={initialsOf(f.testChatName)} messages={chat} live />
          </div>
        )}
      </section>
      <section className="ob-card" aria-labelledby="ob-share-title">
        <h2 id="ob-share-title">{f.shareTitle}</h2>
        <p className="ob-muted">{f.shareSub}</p>
        <div className="ob-row-btns">
          <button type="button" className="ob-btn small ghost" disabled={!link} onClick={() => void copy()}>{copied ? f.copied : f.copyLink}</button>
          {wa && <a className="ob-btn small ghost" href={wa} target="_blank" rel="noopener noreferrer">{f.whatsapp}</a>}
          {email.ready && <button type="button" className="ob-btn small ghost" disabled={busy === "email" || emailed} onClick={() => void mail()}>{emailed ? f.emailSent : f.email}</button>}
          <a className="ob-btn small ghost" href={`/api/documents/${made.id}/pdf?download=true`} download={`${made.number}.pdf`}>{f.download}</a>
        </div>
      </section>
    </>
  );
}
