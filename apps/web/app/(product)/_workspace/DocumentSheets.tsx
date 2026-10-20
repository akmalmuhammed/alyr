"use client";

// The small forms that sit over a document: share it, record a payment taken by hand, cancel it,
// print it on another paper, issue it (ALY-146, spec 015). Each is a sheet (a bottom sheet on a
// phone, a side panel on a laptop) from the Catalog's parts, so the workspace has one way to
// ask a question. Every word is in `documentsCopy.ts`; every refusal arrives from the API
// already written in both languages.

import { useEffect, useRef, useState } from "react";
import {
  api, newKey, pdfUrl, refusalOf, sayRefusal, type Delivery, type Detail, type Meta, type Series,
} from "./documentsApi";
import { COPY, kindLabel, type Copy, type Lang } from "./documentsCopy";
import { inputMoney, parseMoney, written } from "./documentsLogic";
import { Field, Icon, Sheet, Switch, type Toast } from "./CatalogUi";

export type Push = (text: string, options?: { tone?: Toast["tone"]; undo?: () => void }) => number;

type Common = { lang: Lang; meta: Meta; push: Push; onClose: () => void };

function money(meta: Meta, doc: { currency: string; currency_exponent: number }, minor: number, lang: Lang) {
  const info = meta.currencies[doc.currency];
  return written(minor, doc.currency, doc.currency_exponent, info?.symbol_ar ?? doc.currency, lang);
}

const fallbacks = (t: Copy) => ({ failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone });


/** The next number of a series, for the sentence that says what is about to happen. Only owners
 *  and admins can read the numbering; anyone else is told it gets "the next number". */
async function nextNumberOf(kind: string, branch: string, meta: Meta): Promise<string | null> {
  if (!meta.access.can_manage) return null;
  try {
    const { series } = await api<{ series: Series[] }>("/api/documents/series");
    return series.find((s) => s.kind === kind && s.series_key === branch)?.next_number ?? null;
  } catch {
    return null;
  }
}

// ── share and send ──────────────────────────────────────

export function ShareSheet({ lang, meta, push, onClose, doc, intent, onChanged }: Common & {
  doc: Detail; intent: "share" | "send"; onChanged: () => void;
}) {
  const t = COPY[lang];
  const [link, setLink] = useState<{ url: string; days: number } | null>(null);
  const [linkError, setLinkError] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);
  const [email, setEmail] = useState(true);
  const [language, setLanguage] = useState<"ar" | "en">(doc.languages.startsWith("en") ? "en" : "ar");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState<Delivery[] | null>(null);
  const [history, setHistory] = useState<Delivery[]>([]);
  const box = useRef<HTMLInputElement>(null);

  const canSend = meta.access.can_issue;
  const hasPhone = Boolean(doc.customer.phone) || Boolean(doc.contact_id);
  const hasEmail = Boolean(doc.customer.email);

  useEffect(() => {
    let live = true;
    // The link is made when the sheet opens (and is on the record), so it is ready to copy.
    api<{ url: string; days: number }>(`/api/documents/${doc.id}/link`, "POST")
      .then((made) => { if (live) setLink(made); })
      .catch((error) => { if (live) setLinkError(sayRefusal(error, lang, fallbacks(t)) || t.linkFailed); });
    api<{ deliveries: Delivery[] }>(`/api/documents/${doc.id}/deliveries`)
      .then((found) => { if (live) setHistory(found.deliveries); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [doc.id, lang, t]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      push(t.linkCopied);
    } catch {
      // A browser that refuses the clipboard: select the text so the person can copy it.
      box.current?.select();
      push(t.linkCopied);
    }
  }

  async function send(custom: boolean) {
    setBusy(true);
    setFailure("");
    try {
      const channels: string[] = [];
      const body: Record<string, unknown> = { language };
      if (custom) {
        if (phone.trim()) { channels.push("whatsapp"); body.phone = phone.trim(); }
        if (address.trim()) { channels.push("email"); body.email = address.trim(); }
      } else {
        if (whatsapp && hasPhone) channels.push("whatsapp");
        if (email && hasEmail) channels.push("email");
      }
      body.channels = channels;
      const done = await api<{ deliveries: Delivery[] }>(`/api/documents/${doc.id}/send`, "POST", body);
      setSent(done.deliveries);
      push(t.sent(done.deliveries.length));
      onChanged();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallbacks(t)));
    } finally {
      setBusy(false);
    }
  }

  const sendRow = (
    <section className="ct-sec" aria-labelledby="dc-send-title">
      <h3 id="dc-send-title">{t.sendToCustomer}</h3>
      {!hasPhone && !hasEmail && <p className="ct-hint">{t.nobodyToSend}</p>}
      {(hasPhone || hasEmail) && (
        <div className="ct-stack">
          {hasPhone && (
            <label className="ct-toggle">
              <span className="ct-toggle-text"><b>{t.sendWhatsapp}</b><small dir="ltr">{doc.customer.phone || ""}</small></span>
              <Switch on={whatsapp} label={t.sendWhatsapp} onChange={setWhatsapp} />
            </label>
          )}
          {hasEmail && (
            <label className="ct-toggle">
              <span className="ct-toggle-text"><b>{t.sendEmail}</b><small dir="ltr">{doc.customer.email}</small></span>
              <Switch on={email} label={t.sendEmail} onChange={setEmail} />
            </label>
          )}
        </div>
      )}
      <Field label={t.languageOfSend}>
        <select value={language} onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "ar")}>
          <option value="ar">{t.langArabic}</option>
          <option value="en">{t.langEnglish}</option>
        </select>
      </Field>
      <button type="button" className="btn primary ct-btn" disabled={busy || (!(whatsapp && hasPhone) && !(email && hasEmail))}
        onClick={() => void send(false)}>
        <Icon name="send" />{t.sendNow}
      </button>
    </section>
  );

  const other = meta.access.can_manage && (
    <section className="ct-sec" aria-labelledby="dc-other-title">
      <h3 id="dc-other-title">{t.sendTo}</h3>
      <p className="ct-hint">{t.sendToHint}</p>
      <Field label={t.phone}>
        <input type="tel" inputMode="tel" dir="ltr" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label={t.emailAddress}>
        <input type="email" inputMode="email" dir="ltr" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <button type="button" className="btn ct-btn" disabled={busy || (!phone.trim() && !address.trim())} onClick={() => void send(true)}>
        <Icon name="send" />{t.sendNow}
      </button>
    </section>
  );

  const linkBox = (
    <section className="ct-sec" aria-labelledby="dc-link-title">
      <h3 id="dc-link-title">{t.shareLink}</h3>
      {linkError ? <p className="ct-alert" role="alert"><Icon name="warn" />{linkError}</p> : (
        <>
          <div className="ct-linkrow">
            <input ref={box} className="ct-linkbox" readOnly dir="ltr" value={link?.url ?? "…"} aria-label={t.shareLink}
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn ct-btn" disabled={!link} onClick={() => void copy()}>
              <Icon name="copy" />{t.copyLink}
            </button>
          </div>
          <p className="ct-hint">{t.shareLinkHint(link?.days ?? 90)}</p>
        </>
      )}
    </section>
  );

  const shown = sent ?? history;
  return (
    <Sheet title={intent === "send" ? t.resend : t.shareTitle} subtitle={`${kindLabel(lang, doc.kind)} ${doc.number ?? ""}`}
      onClose={onClose} closeLabel={t.close}
      footer={<button type="button" className="btn ct-btn ct-grow" onClick={onClose}>{t.close}</button>}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      {intent === "send" ? <>{canSend && sendRow}{other}{linkBox}</> : <>{linkBox}{canSend && sendRow}{other}</>}
      {shown.length > 0 && (
        <section className="ct-sec" aria-labelledby="dc-hist-title">
          <h3 id="dc-hist-title">{t.deliveriesTitle}</h3>
          <ul className="dc-deliveries">
            {shown.map((d) => <DeliveryLine key={d.id} d={d} lang={lang} />)}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

export function DeliveryLine({ d, lang }: { d: Delivery; lang: Lang }) {
  const t = COPY[lang];
  const reason = d.reason ? (t.deliveryReasons[d.reason] ?? d.reason) : "";
  const bad = d.state === "failed" || d.state === "blocked" || d.state === "not_delivered";
  return (
    <li>
      <span className="dc-del-main">
        <b>{t.deliveryVia(t.channels[d.channel] ?? d.channel, d.to)}</b>
        <span className={`sh-pill dc-pill ${bad ? "bad" : d.state === "delivered" ? "active" : "quiet"}`}>
          {t.delivery[d.state === "failed" || d.state === "blocked" ? "not_delivered" : d.state] ?? d.state}
        </span>
      </span>
      <small className="ct-quiet">{d.trigger === "auto" ? t.deliveryAuto : t.deliveryStaff(d.requested_by)}</small>
      {reason && <small className="dc-reason">{reason}</small>}
    </li>
  );
}

// ── a payment taken by hand ─────────────────────────────

export function PaySheet({ lang, meta, push, onClose, doc, onDone }: Common & { doc: Detail; onDone: () => void }) {
  const t = COPY[lang];
  const exponent = doc.currency_exponent;
  const owed = doc.now.balance_minor;
  const [amount, setAmount] = useState(inputMoney(owed, exponent));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const key = useRef(newKey("pay"));
  const minor = parseMoney(amount, exponent);
  const bad = minor === null || minor <= 0 || minor > owed;

  async function record() {
    if (minor === null || bad) return;
    setBusy(true);
    setFailure("");
    try {
      const done = await once<{ document: { number: string } | null }>("/api/documents/payments", {
        subject: "invoice", id: doc.id, amount_minor: minor, method, reference: reference.trim(), receipt,
      }, key.current);
      push(done.document ? t.paymentRecordedReceipt(done.document.number) : t.paymentRecorded);
      onDone();
      onClose();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallbacks(t)));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.paymentTitle} subtitle={`${kindLabel(lang, doc.kind)} ${doc.number ?? ""}`} onClose={onClose} closeLabel={t.close}
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancel}</button>
          <button type="submit" form="dc-pay-form" className="btn volt ct-btn ct-grow" disabled={busy || bad}>
            <Icon name="cash" />{busy ? t.saving : t.paymentButton}
          </button>
        </>
      )}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <p className="ct-intro">{t.paymentSub}</p>
      <form id="dc-pay-form" className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void record(); }}>
        <Field label={t.paymentAmount} hint={t.paymentOwed(money(meta, doc, owed, lang))}
          error={amount.trim() && bad ? t.paymentOwed(money(meta, doc, owed, lang)) : undefined}>
          <input inputMode="decimal" dir="ltr" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
        </Field>
        <button type="button" className="btn small ghost dc-fill" onClick={() => setAmount(inputMoney(owed, exponent))}>{t.paymentFull}</button>
        <Field label={t.paymentMethod}>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {(["cash", "bank_transfer", "cheque", "card_terminal"] as const).map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
          </select>
        </Field>
        <Field label={t.paymentReference}>
          <input dir="ltr" maxLength={80} autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="ct-toggle">
          <span className="ct-toggle-text"><b>{t.paymentReceipt}</b><small>{t.paymentReceiptHint}</small></span>
          <Switch on={receipt} label={t.paymentReceipt} onChange={setReceipt} />
        </div>
      </form>
    </Sheet>
  );
}

/** A POST that carries an Idempotency-Key, for the calls that make something once: a retry after
 *  a dropped connection sends the same key and finds what the first made. */
export function once<T>(path: string, body: Record<string, unknown>, key: string): Promise<T> {
  return api<T>(path, "POST", body, { "Idempotency-Key": key });
}

// ── cancel (a credit note) ──────────────────────────────

export function CancelSheet({ lang, meta, push, onClose, doc, onDone }: Common & { doc: Detail; onDone: () => void }) {
  const t = COPY[lang];
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const key = useRef(newKey("cancel"));
  const number = doc.number ?? "";
  useEffect(() => {
    let live = true;
    void nextNumberOf("credit_note", doc.branch, meta).then((n) => { if (live) setNext(n); });
    return () => { live = false; };
  }, [doc.branch, meta]);

  async function cancelIt() {
    setBusy(true);
    setFailure("");
    try {
      const done = await once<{ credit_note: { number: string } }>(
        `/api/documents/${doc.id}/cancel`, { reason: reason.trim(), notify }, key.current);
      push(t.cancelled(done.credit_note.number));
      onDone();
      onClose();
    } catch (error) {
      setFailure(sayRefusal(error, lang, fallbacks(t)));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.cancelTitle} subtitle={`${kindLabel(lang, doc.kind)} ${number}`} onClose={onClose} closeLabel={t.close}
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.cancelKeep}</button>
          <button type="submit" form="dc-cancel-form" className="btn danger ct-btn ct-grow" disabled={busy || reason.trim().length < 3}>
            <Icon name="ban" />{busy ? t.saving : t.cancelButton}
          </button>
        </>
      )}>
      {failure && <p className="ct-alert" role="alert"><Icon name="warn" />{failure}</p>}
      <p className="ct-alert dc-what" role="note"><Icon name="warn" /><span>{t.cancelHappens(number, next ?? kindLabel(lang, "credit_note"))}</span></p>
      <p className="ct-hint">{t.cancelAfter}</p>
      <form id="dc-cancel-form" className="ct-form" noValidate onSubmit={(e) => { e.preventDefault(); void cancelIt(); }}>
        <Field label={t.cancelReason} hint={t.cancelReasonHint}>
          <textarea value={reason} maxLength={300} dir="auto" onChange={(e) => setReason(e.target.value)} data-autofocus />
        </Field>
        {doc.contact_id && (
          <div className="ct-toggle">
            <span className="ct-toggle-text"><b>{t.cancelNotify}</b></span>
            <Switch on={notify} label={t.cancelNotify} onChange={setNotify} />
          </div>
        )}
      </form>
    </Sheet>
  );
}

// ── print on another paper ──────────────────────────────

export function PrintSheet({ lang, onClose, doc }: { lang: Lang; onClose: () => void; doc: Detail }) {
  const t = COPY[lang];
  const [layout, setLayout] = useState(doc.layout);
  return (
    <Sheet title={t.printTitle} subtitle={`${kindLabel(lang, doc.kind)} ${doc.number ?? ""}`} onClose={onClose} closeLabel={t.close}
      footer={(
        <>
          <button type="button" className="btn ct-btn" onClick={onClose}>{t.close}</button>
          <a className="btn primary ct-btn ct-grow" href={pdfUrl(doc.id, { layout: layout === doc.layout ? undefined : layout })}
            target="_blank" rel="noopener noreferrer">
            <Icon name="printer" />{t.printOpen}
          </a>
        </>
      )}>
      <p className="ct-intro">{t.printSub}</p>
      <fieldset className="ct-choices">
        <legend className="ct-sr">{t.printTitle}</legend>
        {(["a4", "a5", "thermal80"] as const).map((value) => (
          <label key={value} className={`ct-choice ${layout === value ? "on" : ""}`}>
            <input type="radio" name="dc-print-layout" checked={layout === value} onChange={() => setLayout(value)} />
            <span className="ct-choice-mark" aria-hidden="true" />
            <span className="ct-choice-text">
              <b>{t.layouts[value]}</b>
              <small>{t.layoutHints[value]}{value === doc.layout ? ` · ${t.printIssued} ${t.layouts[value]}` : ""}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </Sheet>
  );
}

// ── issue ───────────────────────────────────────────────

export function IssueSheet({ lang, meta, push, onClose, doc, onIssued, onSettings, onReceiptInstead }: Common & {
  doc: Detail; onIssued: (issued: Detail) => void; onSettings?: (field: string) => void;
  /** Offered when an invoice is refused for want of a registration number. */
  onReceiptInstead?: () => void;
}) {
  const t = COPY[lang];
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; field: string; text: string } | null>(null);
  const key = useRef(newKey("issue"));
  useEffect(() => {
    let live = true;
    void nextNumberOf(doc.kind, doc.branch, meta).then((n) => { if (live) setNext(n); });
    return () => { live = false; };
  }, [doc.kind, doc.branch, meta]);

  async function issue(withSend: boolean) {
    setBusy(true);
    setFailure(null);
    try {
      const done = await once<{ document: Detail }>(`/api/documents/${doc.id}/issue`, {}, key.current);
      let sentText = "";
      if (withSend && meta.access.can_issue) {
        try {
          await api(`/api/documents/${doc.id}/send`, "POST", { language: done.document.languages.startsWith("en") ? "en" : "ar" });
          sentText = "ok";
        } catch (error) {
          sentText = sayRefusal(error, lang, fallbacks(t));
        }
      }
      const number = done.document.number ?? "";
      push(!withSend ? t.issued(number) : sentText === "ok" ? t.issuedSending(number) : t.issuedNotSent(number, sentText), { tone: sentText && sentText !== "ok" ? "bad" : "ok" });
      onIssued(done.document);
      onClose();
    } catch (error) {
      const r = refusalOf(error);
      setFailure({ code: r?.code ?? "", field: r?.field ?? "", text: sayRefusal(error, lang, fallbacks(t)) });
      setBusy(false);
    }
  }

  const kind = kindLabel(lang, doc.kind);
  return (
    <Sheet title={t.issueTitle} subtitle={kind} onClose={onClose} closeLabel={t.close}
      footer={(
        <div className="dc-foot">
          <button type="button" className="btn volt ct-btn" disabled={busy} onClick={() => void issue(false)}>
            <Icon name="lock" />{busy ? t.saving : t.issueButton}
          </button>
          <button type="button" className="btn ct-btn" disabled={busy} onClick={() => void issue(true)}>
            <Icon name="send" />{t.issueAndSendButton}
          </button>
          <button type="button" className="btn ghost ct-btn" onClick={onClose}>{t.keepEditing}</button>
        </div>
      )}>
      {failure && <IssueFailure failure={failure} lang={lang} onSettings={onSettings && ((field) => { onClose(); onSettings(field); })} />}
      {failure?.code === "registration_needed" && onReceiptInstead && (
        <button type="button" className="btn ct-btn" onClick={() => { onClose(); onReceiptInstead(); }}>{t.receiptInstead}</button>
      )}
      <p className="ct-intro dc-what">{t.issueBody(kind, next)}</p>
    </Sheet>
  );
}

/** A refusal at the moment of issuing: the API's own sentence, and where to put it right. */
export function IssueFailure({ failure, lang, onSettings }: {
  failure: { code: string; field: string; text: string }; lang: Lang; onSettings?: (field: string) => void;
}) {
  const t = COPY[lang];
  const fix = t.fixField[failure.code];
  const field = failure.code === "registration_needed" ? "commercial_registration"
    : failure.code === "arabic_required" ? "languages" : failure.code === "seller_needed" ? "business_name" : "";
  return (
    <div className="ct-alert dc-refusal" role="alert">
      <Icon name="warn" />
      <span>
        {failure.text}
        {fix && (
          <span className="dc-fixrow">
            <a className="dc-fixlink" href={`/app/documents?view=settings&focus=${field}`}
              onClick={(e) => { if (onSettings) { e.preventDefault(); onSettings(field); } }}>{fix}</a>
          </span>
        )}
      </span>
    </div>
  );
}
