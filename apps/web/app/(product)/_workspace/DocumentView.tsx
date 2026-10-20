"use client";

// One document in the workspace (ALY-146, spec 015): what it looks like on paper (the pages of
// the real PDF, drawn as pictures because a phone cannot be trusted to show a PDF inside a page
// and a screen reader gets nothing from one), then the same facts as text, and what can be done
// with it: share it, send it again, record a payment taken by hand, cancel it with a reason,
// print it on another paper. The API decides who may do what; the screen only hides the
// controls the signed-in person cannot use.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api, pageUrl, pdfUrl, sayRefusal, type ActivityRow, type Delivery, type Detail, type Meta,
} from "./documentsApi";
import { COPY, kindLabel, type Lang } from "./documentsCopy";
import { activityLine, dateText, deliveryPill, moneyState, plain, whenText, written } from "./documentsLogic";
import { DeliveryLine, CancelSheet, IssueSheet, PaySheet, PrintSheet, ShareSheet, type Push } from "./DocumentSheets";
import { Announce, Icon } from "./CatalogUi";

type Sheet = null | "share" | "send" | "pay" | "cancel" | "print" | "issue";

export function DocumentView({ lang, meta, id, push, onBack, onOpen, onEdit, onSettings, onChanged }: {
  lang: Lang; meta: Meta; id: string; push: Push; onBack: () => void; onOpen: (id: string) => void;
  onEdit: (id: string) => void; onSettings: (field: string) => void; onChanged: () => void;
}) {
  const t = COPY[lang];
  const [doc, setDoc] = useState<Detail | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [problem, setProblem] = useState("");
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const fallback = { failed: t.failed, offline: t.offline, forbidden: t.forbidden, gone: t.gone };

  const load = useCallback(async () => {
    try {
      const found = await api<{ document: Detail }>(`/api/documents/${id}`);
      setDoc(found.document);
      setProblem("");
      setOffline(false);
      if (found.document.status !== "draft") {
        api<{ deliveries: Delivery[] }>(`/api/documents/${id}/deliveries`).then((d) => setDeliveries(d.deliveries)).catch(() => undefined);
      }
      if (meta.access.can_manage) {
        api<{ activity: ActivityRow[] }>(`/api/documents/${id}/activity`).then((a) => setActivity(a.activity)).catch(() => undefined);
      }
    } catch (error) {
      const text = sayRefusal(error, lang, fallback);
      if (text === t.offline) setOffline(true);
      else setProblem(text);
    }
    // `fallback` is rebuilt every render from `t`, which only changes with the language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang, meta.access.can_manage]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  // Delivery moves on by itself (queued, sent, delivered): look again while the screen is in
  // front and no form is open.
  useEffect(() => {
    if (sheet) return;
    const again = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(again, 20_000);
    document.addEventListener("visibilitychange", again);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", again); };
  }, [load, sheet]);

  if (problem) {
    return (
      <div className="ct dc" lang={lang}>
        <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{t.back}</button>
        <p className="ct-alert" role="alert"><Icon name="warn" />{problem}</p>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="ct dc" lang={lang}>
        <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}><Icon name="start" className="sh-ico ct-flip" />{t.back}</button>
        <p className="ct-quiet ct-pad" role="status">{offline ? t.offline : t.loading}</p>
      </div>
    );
  }

  const info = meta.currencies[doc.currency];
  const m = (minor: number) => written(minor, doc.currency, doc.currency_exponent, info?.symbol_ar ?? doc.currency, lang);
  const kind = kindLabel(lang, doc.kind);
  const kindInfo = meta.kinds.find((k) => k.key === doc.kind);
  const access = meta.access;
  const customerName = (lang === "ar" ? doc.customer.name_ar || doc.customer.name : doc.customer.name || doc.customer.name_ar) || "";
  const lineText = (l: Detail["lines"][number]) => (lang === "ar" ? l.description_ar || l.description : l.description || l.description_ar);
  const row = { kind: doc.kind, status: doc.status, total_minor: doc.totals.total_minor, paid_minor: doc.now.paid_minor, balance_minor: doc.now.balance_minor };
  const state = moneyState(row);
  const owing = doc.status === "issued" && doc.kind === "invoice" && doc.now.balance_minor > 0;
  const canPay = owing && access.can_record_payments;
  const canCancel = doc.status === "issued" && access.can_credit && Boolean(kindInfo?.creditable);
  const isDraft = doc.status === "draft";
  const delivery = deliveryPill(doc.status, doc.delivery.state);
  const expiry = doc.due_date ? (kindInfo?.second_date === "valid_until" ? t.validUntil(dateText(doc.due_date, lang)) : t.dueOn(dateText(doc.due_date, lang))) : "";

  async function discard() {
    setBusy(true);
    try {
      await api(`/api/documents/${id}`, "DELETE");
      push(t.draftDeleted);
      onChanged();
      onBack();
    } catch (error) {
      push(sayRefusal(error, lang, fallback), { tone: "bad" });
      setBusy(false);
    }
  }

  const sources: string[] = [];
  if (doc.source_info?.kind === "order") sources.push(t.fromOrder(doc.source_info.number ?? 0));
  if (doc.source_info?.kind === "booking") sources.push(t.fromBooking(doc.source_info.number ?? 0));
  if (doc.source_info?.kind === "ledger_payment") sources.push(t.fromPayment);

  const relatedRows: { label: string; id: string; text: string }[] = [];
  if (doc.related) {
    relatedRows.push({ label: doc.kind === "credit_note" ? t.relatedAgainst : t.relatedReceiptFor, id: doc.related.id, text: `${kindLabel(lang, doc.related.kind)} ${doc.related.number ?? ""}` });
  }
  if (doc.voided_by) relatedRows.push({ label: t.relatedCredits, id: doc.voided_by.id, text: `${kindLabel(lang, "credit_note")} ${doc.voided_by.number}` });
  for (const c of doc.credit_notes) {
    if (c.id !== doc.voided_by?.id) relatedRows.push({ label: t.relatedCredits, id: c.id, text: `${kindLabel(lang, "credit_note")} ${c.number} · ${m(c.total_minor)}` });
  }
  for (const c of doc.children) {
    relatedRows.push({ label: t.relatedReceipts, id: c.id, text: `${kindLabel(lang, c.kind)} ${c.number ?? ""} · ${m(c.total_minor)}${c.status === "void" ? ` (${t.statuses.void})` : ""}` });
  }

  return (
    <div className="ct dc" lang={lang}>
      <button type="button" className="btn ghost ct-btn dc-back" onClick={onBack}>
        <Icon name="start" className="sh-ico ct-flip" />{t.back}
      </button>

      <header className="sh-head dc-head">
        <span className="sh-eyebrow">{kind}</span>
        <h1 dir="ltr" className="dc-number"><bdi>{doc.number ?? t.draftNumber}</bdi></h1>
        <p className="dc-who" dir="auto">
          {customerName || t.noName}
          {doc.status !== "draft" && doc.issue_date && <> · <bdi>{dateText(doc.issue_date, lang)}</bdi></>}
        </p>
        <div className="dc-pills">
          <span className={`sh-pill dc-pill ${doc.status === "void" ? "bad" : doc.status === "draft" ? "wait" : "quiet"}`}>{t.statuses[doc.status]}</span>
          {state && <span className={`sh-pill dc-pill ${state === "paid" ? "active" : state === "part" ? "wait" : "bad"}`}>{t.money[state]}</span>}
          {delivery && <span className={`sh-pill dc-pill ${delivery === "not_delivered" ? "bad" : delivery === "delivered" ? "active" : "quiet"}`}>{t.delivery[delivery]}</span>}
        </div>
        <p className="dc-amount num">
          <b><bdi>{m(doc.totals.total_minor)}</bdi></b>
          {owing && <span className="dc-owed"> · {t.balance} <bdi>{m(doc.now.balance_minor)}</bdi></span>}
        </p>
        {expiry && <p className="ct-quiet dc-sub"><bdi>{expiry}</bdi></p>}
      </header>

      {doc.status === "void" && (
        <div className="ct-banner bad" role="note">
          <span>{doc.voided_by ? t.relatedCredits : t.statuses.void} {doc.voided_by && <bdi dir="ltr">{doc.voided_by.number}</bdi>}</span>
          {doc.voided_by && <button type="button" className="btn small" onClick={() => onOpen(doc.voided_by!.id)}>{kindLabel(lang, "credit_note")}</button>}
        </div>
      )}
      {isDraft && doc.warnings.length > 0 && (
        <div className="ct-banner" role="note">
          <span><b>{t.warningsTitle}</b><br />{doc.warnings.map((w) => (lang === "ar" ? w.ar : w.en)).join(" ")}</span>
        </div>
      )}

      <div className="ct-actions dc-actions" role="group" aria-label={t.actions}>
        {isDraft && access.can_issue && (
          <button type="button" className="btn volt ct-btn" onClick={() => setSheet("issue")}><Icon name="lock" />{t.issue}</button>
        )}
        {isDraft && (
          <>
            <button type="button" className="btn ct-btn" onClick={() => onEdit(id)}><Icon name="edit" />{t.edit}</button>
            {asking ? (
              <span className="dc-ask" role="alert">
                <span>{t.discardAsk}</span>
                <button type="button" className="btn small" onClick={() => setAsking(false)}>{t.cancelKeep}</button>
                <button type="button" className="btn small danger" disabled={busy} onClick={() => void discard()}>{t.discardButton}</button>
              </span>
            ) : (
              <button type="button" className="btn ghost ct-btn" onClick={() => setAsking(true)}><Icon name="trash" />{t.discard}</button>
            )}
          </>
        )}
        {!isDraft && (
          <>
            {canPay && <button type="button" className="btn volt ct-btn" onClick={() => setSheet("pay")}><Icon name="cash" />{t.recordPayment}</button>}
            <button type="button" className={`btn ct-btn ${canPay ? "" : "volt"}`} onClick={() => setSheet("share")}><Icon name="share" />{t.share}</button>
            {access.can_issue && doc.status === "issued" && <button type="button" className="btn ct-btn" onClick={() => setSheet("send")}><Icon name="send" />{t.resend}</button>}
            <a className="btn ct-btn" href={pdfUrl(id, { download: true })} download={`${doc.number}.pdf`}><Icon name="download" />{t.download}</a>
            <button type="button" className="btn ct-btn" onClick={() => setSheet("print")}><Icon name="printer" />{t.print}</button>
            {canCancel && <button type="button" className="btn danger-line ct-btn" onClick={() => setSheet("cancel")}><Icon name="ban" />{t.cancelDocument}</button>}
          </>
        )}
        {isDraft && !access.can_issue && <p className="ct-hint dc-hint">{t.askOwnerToIssue}</p>}
      </div>

      <div className="dc-body">
        <Paper key={`${doc.id}-${doc.status}-${doc.layout}-${doc.content_hash ?? doc.created_at}`} doc={doc} kind={kind} t={t} />

        <div className="dc-side">
          <section className="ct-sec dc-sec" aria-labelledby="dc-h-customer">
            <h2 id="dc-h-customer">{t.customer}</h2>
            <dl className="dc-facts">
              <div><dt>{t.name}</dt><dd dir="auto">{customerName || "—"}</dd></div>
              {doc.customer.company && <div><dt>{t.company}</dt><dd dir="auto">{doc.customer.company}</dd></div>}
              {doc.customer.phone && <div><dt>{t.phoneField}</dt><dd><bdi>{doc.customer.phone}</bdi></dd></div>}
              {doc.customer.email && <div><dt>{t.emailField}</dt><dd><bdi>{doc.customer.email}</bdi></dd></div>}
              {doc.customer.registration_number && <div><dt>{t.registration}</dt><dd><bdi>{doc.customer.registration_number}</bdi></dd></div>}
              {doc.customer.tax_id && <div><dt>{t.taxId}</dt><dd><bdi>{doc.customer.tax_id}</bdi></dd></div>}
              {(doc.customer.address || doc.customer.address_ar) && (
                <div><dt>{t.address}</dt><dd dir="auto">{lang === "ar" ? doc.customer.address_ar || doc.customer.address : doc.customer.address || doc.customer.address_ar}</dd></div>
              )}
            </dl>
            {sources.length > 0 && <p className="ct-quiet dc-source">{sources.join(" · ")}</p>}
            {doc.issued_by && <p className="ct-quiet dc-source">{t.madeBy(doc.issued_by)}</p>}
          </section>

          <section className="ct-sec dc-sec" aria-labelledby="dc-h-items">
            <h2 id="dc-h-items">{t.items}</h2>
            <ul className="dc-lines">
              {doc.lines.map((l, i) => (
                <li key={i}>
                  <span className="dc-line-text">
                    <b dir="auto">{lineText(l)}</b>
                    <small className="num">
                      <bdi>{l.quantity.replace(/\.?0+$/, "")} {t.units[l.unit] ?? l.unit} × {m(l.unit_price_minor)}</bdi>
                      {l.discount_minor > 0 && <> · {t.discount} <bdi>{m(l.discount_minor)}</bdi></>}
                      {l.sku && <> · <bdi dir="ltr">{l.sku}</bdi></>}
                    </small>
                  </span>
                  <bdi className="num dc-line-total">{m(l.line_total_minor ?? 0)}</bdi>
                </li>
              ))}
            </ul>
            <dl className="dc-totals num">
              {(doc.totals.discount_minor > 0 || doc.totals.tax_minor > 0 || doc.totals.rounding_minor !== 0) && (
                <div><dt>{t.subtotal}</dt><dd><bdi>{m(doc.totals.gross_minor)}</bdi></dd></div>
              )}
              {doc.totals.discount_minor > 0 && <div><dt>{t.discount}</dt><dd>-<bdi>{m(doc.totals.discount_minor)}</bdi></dd></div>}
              {doc.totals.tax_minor > 0 && <div><dt>{t.taxLabel}</dt><dd><bdi>{m(doc.totals.tax_minor)}</bdi></dd></div>}
              {doc.totals.rounding_minor !== 0 && <div><dt>{t.rounding}</dt><dd><bdi dir="ltr">{doc.totals.rounding_minor > 0 ? "+" : "-"}{plain(Math.abs(doc.totals.rounding_minor), doc.currency_exponent)}</bdi></dd></div>}
              <div className="dc-grand"><dt>{t.total}</dt><dd><bdi>{m(doc.totals.total_minor)}</bdi></dd></div>
              {!isDraft && ["invoice", "deposit_receipt", "statement"].includes(doc.kind) && (
                <>
                  <div><dt>{t.paidLabel}</dt><dd><bdi>{m(doc.now.paid_minor)}</bdi></dd></div>
                  <div className="dc-grand"><dt>{t.balance}</dt><dd><bdi>{m(doc.now.balance_minor)}</bdi></dd></div>
                </>
              )}
            </dl>
          </section>

          {(doc.payments.length > 0 || doc.recorded_payments.length > 0 || owing) && (
            <section className="ct-sec dc-sec" aria-labelledby="dc-h-pay">
              <h2 id="dc-h-pay">{t.paymentsTitle}</h2>
              <ul className="dc-lines">
                {doc.payments.map((p, i) => (
                  <li key={`p${i}`}>
                    <span className="dc-line-text"><b>{t.methods[p.method] ?? p.method}</b>{p.reference && <small dir="ltr"><bdi>{p.reference}</bdi></small>}</span>
                    <bdi className="num dc-line-total">{m(p.amount_minor)}</bdi>
                  </li>
                ))}
                {doc.recorded_payments.map((p) => (
                  <li key={p.id}>
                    <span className="dc-line-text">
                      <b>{t.methods[p.method] ?? p.method}</b>
                      <small>{t.recordedBy(p.recorded_by, whenText(p.recorded_at, lang))}{p.reference && <> · <bdi dir="ltr">{p.reference}</bdi></>}</small>
                    </span>
                    <bdi className="num dc-line-total">{m(p.amount_minor)}</bdi>
                  </li>
                ))}
              </ul>
              {doc.payments.length === 0 && doc.recorded_payments.length === 0 && <p className="ct-quiet">{t.noPayments}</p>}
              {doc.kind === "invoice" && doc.source === "order" && <p className="ct-hint">{t.accountNote}</p>}
            </section>
          )}

          {relatedRows.length > 0 && (
            <section className="ct-sec dc-sec" aria-labelledby="dc-h-rel">
              <h2 id="dc-h-rel">{t.related}</h2>
              <ul className="dc-related">
                {relatedRows.map((r, i) => (
                  <li key={`${r.id}${i}`}>
                    <span className="ct-quiet">{r.label}</span>
                    <button type="button" className="ct-linkbtn" onClick={() => onOpen(r.id)}><bdi>{r.text}</bdi></button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isDraft && (
            <section className="ct-sec dc-sec" aria-labelledby="dc-h-del">
              <h2 id="dc-h-del">{t.deliveryTitle}</h2>
              {deliveries.length === 0 ? <p className="ct-quiet">{t.deliveryNone}</p> : (
                <ul className="dc-deliveries">{deliveries.map((d) => <DeliveryLine key={d.id} d={d} lang={lang} />)}</ul>
              )}
            </section>
          )}

          {meta.access.can_manage && activity.length > 0 && (
            <section className="ct-sec dc-sec" aria-labelledby="dc-h-act">
              <h2 id="dc-h-act">{t.activityTitle}</h2>
              <ol className="ct-log dc-log">
                {activity.map((a, i) => {
                  const line = activityLine(a);
                  return <li key={i}><span>{t.activity({ ...line, actor: a.actor })}</span><time dateTime={a.at}>{whenText(a.at, lang)}</time></li>;
                })}
              </ol>
            </section>
          )}
        </div>
      </div>

      {sheet === "share" && <ShareSheet lang={lang} meta={meta} push={push} doc={doc} intent="share" onClose={() => setSheet(null)} onChanged={() => void load()} />}
      {sheet === "send" && <ShareSheet lang={lang} meta={meta} push={push} doc={doc} intent="send" onClose={() => setSheet(null)} onChanged={() => void load()} />}
      {sheet === "pay" && <PaySheet lang={lang} meta={meta} push={push} doc={doc} onClose={() => setSheet(null)} onDone={() => { void load(); onChanged(); }} />}
      {sheet === "cancel" && <CancelSheet lang={lang} meta={meta} push={push} doc={doc} onClose={() => setSheet(null)} onDone={() => { void load(); onChanged(); }} />}
      {sheet === "print" && <PrintSheet lang={lang} doc={doc} onClose={() => setSheet(null)} />}
      {sheet === "issue" && (
        <IssueSheet lang={lang} meta={meta} push={push} doc={doc} onClose={() => setSheet(null)}
          onSettings={onSettings} onIssued={() => { void load(); onChanged(); }} />
      )}
      <Announce text={owing ? `${t.balance} ${m(doc.now.balance_minor)}` : ""} />
    </div>
  );
}

// ── the pages, as pictures ──────────────────────────────

/** The pages of the PDF (an issued document's own, or a draft's preview) as pictures. The first
 *  tells how many there are; the rest follow. Each is a picture of the real file, never a
 *  redrawing, and carries a sentence for a screen reader (the facts are below, as text). */
function Paper({ doc, kind, t }: { doc: Detail; kind: string; t: (typeof COPY)["en"] }) {
  const [pages, setPages] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const urls = useRef<string[]>([]);
  const width = doc.layout === "thermal80" ? 520 : 900;

  useEffect(() => {
    let live = true;
    const made: string[] = [];
    async function fetchPage(page: number): Promise<{ url: string; count: number }> {
      const response = doc.status === "draft"
        ? await fetch(`/api/documents/preview?format=png&page=${page}&width=${width}`, {
          method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft_id: doc.id }),
        })
        : await fetch(pageUrl(doc.id, page, width), { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      made.push(url);
      return { url, count: Number(response.headers.get("x-page-count") ?? "1") || 1 };
    }
    (async () => {
      try {
        const first = await fetchPage(1);
        if (!live) return;
        setPages([first.url]);
        const rest = await Promise.all(Array.from({ length: Math.min(first.count, 12) - 1 }, (_, i) => fetchPage(i + 2)));
        if (live && rest.length) setPages([first.url, ...rest.map((r) => r.url)]);
      } catch {
        if (live) setFailed(true);
      }
    })();
    urls.current = made;
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [doc.id, doc.status, width]);

  return (
    <section className={`dc-paper ${doc.layout}`} aria-labelledby="dc-h-paper">
      <h2 id="dc-h-paper" className="dc-paper-title">{t.paper}</h2>
      {failed && <p className="ct-alert" role="alert"><Icon name="warn" />{t.paperFailed}</p>}
      {!failed && pages.length === 0 && <div className="dc-sheet dc-sheet-wait" role="status"><span className="ct-sr">{t.loading}</span></div>}
      {pages.map((url, i) => (
        <figure key={url} className="dc-page">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture of this shop's own PDF, made for this view */}
          <img src={url} alt={t.paperAlt(kind, doc.number ?? t.draftNumber, i + 1, pages.length)} className="dc-sheet" />
          {pages.length > 1 && <figcaption className="ct-quiet">{t.page(i + 1, pages.length)}</figcaption>}
        </figure>
      ))}
    </section>
  );
}
