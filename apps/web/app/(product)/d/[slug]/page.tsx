"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Empty, Frame, Glyph, type Lang } from "../../_customer/Frame";

// The page a customer opens from the link we send with their receipt or invoice (ALY-139).
// `/d/<shop>?t=<token>`: the token is made for this page only, names one document at one shop
// and runs out. The page sends it to the API in the header `X-Order-Link`, never in the address
// of a request, and shows what the API says it may: the document's number, date, lines and
// totals, and a button for the PDF. A link that has expired, was edited or belongs to another
// page shows a calm page that says to ask the shop to send the document again. It opens in the
// document's own lead language (Arabic first for a consumer document), and the customer can
// switch.

type Pair = { en: string; ar: string };
type Line = {
  description: string; description_ar: string; quantity: string; unit: Pair;
  unit_price_minor: number; line_total_minor: number;
};
type Doc = {
  kind: string; title: Pair; number: string; status: "issued" | "void"; issue_date: string;
  currency: string; currency_ar: string; exponent: number; lead: Lang;
  seller: { name: string; name_ar: string };
  lines: Line[];
  totals: {
    gross_minor: number; discount_minor: number; tax_minor: number; rounding_minor: number;
    total_minor: number; paid_minor: number; balance_minor: number;
  };
  payments: { method: Pair; amount_minor: number }[];
  voided_by: string | null; against: string | null;
};
type LinkState = { state: "none" | "ok" | "invalid" | "expired"; message: string; message_ar: string };
type Page = { shop: { name: string; name_ar: string }; document: Doc | null; link: LinkState };

const T = {
  en: {
    context: "Document", download: "Download PDF", preparing: "Preparing the file…",
    downloadFailed: "The file could not be downloaded. Please try again.",
    issued: (date: string) => `Issued ${date}`,
    paid: "Paid", due: (amount: string) => `Balance due ${amount}`, creditNote: "Credit note",
    cancelled: (n: string) => `Cancelled by credit note ${n}`, against: (n: string) => `Against ${n}`,
    lines: "Items", subtotal: "Subtotal", discount: "Discount", tax: "Tax",
    rounding: "Rounding", total: "Total", paidLabel: "Paid", balance: "Balance due", payments: "Paid by",
    expiredTitle: "This link has expired", invalidTitle: "This link is not valid",
    noneTitle: "Open this page from the link we sent you",
    noneText: "The shop sends this link with your receipt or invoice.",
    askAgain: "Ask the shop to send you the document again.",
    notFound: "This page was not found.",
  },
  ar: {
    context: "مستند", download: "تنزيل ملف PDF", preparing: "جارٍ تحضير الملف…",
    downloadFailed: "تعذّر تنزيل الملف. حاول مرة أخرى.",
    issued: (date: string) => `صدر في ${date}`,
    paid: "مدفوع", due: (amount: string) => `المتبقي ${amount}`, creditNote: "إشعار دائن",
    cancelled: (n: string) => `أُلغي بإشعار دائن رقم ${n}`, against: (n: string) => `بخصوص ${n}`,
    lines: "البنود", subtotal: "المجموع", discount: "الخصم", tax: "الضريبة",
    rounding: "التقريب", total: "الإجمالي", paidLabel: "المدفوع", balance: "المتبقي", payments: "طريقة الدفع",
    expiredTitle: "انتهت صلاحية هذا الرابط", invalidTitle: "هذا الرابط غير صالح",
    noneTitle: "افتح هذه الصفحة من الرابط الذي أرسلناه لك",
    noneText: "يرسل المتجر هذا الرابط مع الإيصال أو الفاتورة.",
    askAgain: "اطلب من المتجر إرسال المستند إليك مرة أخرى.",
    notFound: "لم يتم العثور على هذه الصفحة.",
  },
};

/** An amount in the document's own currency and decimals, the way each language writes it:
 *  «QAR 127.00» and «127.00 ر.ق» (Western digits in both). */
function written(minor: number, doc: Doc, lang: Lang): string {
  const sign = minor < 0 ? "-" : "";
  const scale = 10 ** doc.exponent;
  const whole = Math.floor(Math.abs(minor) / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = doc.exponent ? `.${String(Math.abs(minor) % scale).padStart(doc.exponent, "0")}` : "";
  return lang === "ar" ? `${sign}${whole}${frac} ${doc.currency_ar}` : `${doc.currency} ${sign}${whole}${frac}`;
}

function preferred(asked: string | null): Lang {
  if (asked === "ar" || asked === "en") return asked;
  return typeof navigator !== "undefined" && /^ar/i.test(navigator.language) ? "ar" : "en";
}

function DocumentPage() {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const asked = query.get("t");
  // The link goes in a header, not in the address of a request, so no request log of ours holds
  // it. A token is plain ASCII; anything else cannot be a header and cannot be ours, so it is
  // sent as one the API will call invalid.
  const token = asked ? (/^[\w.-]{1,300}$/.test(asked) ? asked : "invalid") : null;
  const [page, setPage] = useState<Page | null>(null);
  const [missing, setMissing] = useState(false);
  const [chosen, setChosen] = useState<Lang | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The link stopped working while the page was open (it expired, say).
  const [stopped, setStopped] = useState<LinkState | null>(null);

  useEffect(() => {
    fetch(`/api/d/${slug}`, { cache: "no-store", headers: token ? { "x-order-link": token } : undefined })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Page) => setPage(data))
      .catch(() => { setMissing(true); });
  }, [slug, token]);

  const lang: Lang = chosen ?? page?.document?.lead ?? preferred(query.get("lang"));
  const t = T[lang];
  if (missing) return <Empty text={t.notFound} />;
  if (!page) return null;
  const toggle = () => setChosen(lang === "en" ? "ar" : "en");
  const shop = lang === "ar" && page.shop.name_ar ? page.shop.name_ar : page.shop.name;
  const doc = page.document;

  async function download() {
    if (!doc || !token) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/d/${slug}/pdf`, { cache: "no-store", headers: { "x-order-link": token } });
      if (response.status === 403) {
        const refusal = (await response.json().catch(() => ({})))?.detail;
        setStopped({
          state: refusal?.code === "expired_link" ? "expired" : "invalid",
          message: refusal?.message ?? "", message_ar: refusal?.message_ar ?? "",
        });
        return;
      }
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${doc.number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // A link that is not good: no document, a calm sentence, and where to turn.
  const problem = stopped ?? (page.link.state !== "ok" ? page.link : null);
  if (problem || !doc) {
    const state = problem?.state ?? "invalid";
    const title = state === "expired" ? t.expiredTitle : state === "none" ? t.noneTitle : t.invalidTitle;
    const text = state === "none" ? t.noneText : t.askAgain;
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="cx-eyebrow">{t.context}</span>
          <h1>{title}</h1>
        </section>
        {text && <p className="cx-warn" role="alert" style={{ "--i": 1 } as React.CSSProperties}>{text}</p>}
      </Frame>
    );
  }

  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-QA-u-nu-latn" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${doc.issue_date}T12:00:00Z`));
  const name = (line: Line) =>
    (lang === "ar" ? line.description_ar || line.description : line.description || line.description_ar);
  const totals = doc.totals;
  const void_ = doc.status === "void";
  const isInvoiceLike = doc.kind === "invoice" || doc.kind === "deposit_receipt";
  const owes = totals.balance_minor > 0 && doc.kind !== "credit_note";
  const rows: [string, number][] = [];
  if (totals.discount_minor || totals.tax_minor || totals.rounding_minor) rows.push([t.subtotal, totals.gross_minor]);
  if (totals.discount_minor) rows.push([t.discount, totals.discount_minor]);
  if (totals.tax_minor) rows.push([t.tax, totals.tax_minor]);
  if (totals.rounding_minor) rows.push([t.rounding, totals.rounding_minor]);

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={doc.title[lang]}>
      <section className="cx-hero" style={{ "--i": 0 } as React.CSSProperties}>
        <span className="cx-eyebrow">{doc.title[lang]}</span>
        <h1 className="num"><bdi dir="ltr">{doc.number}</bdi></h1>
        <span className="num" style={{ color: "var(--ink-2)", fontSize: "var(--ui-body-sm)" }}>{t.issued(date)}</span>
        {void_ ? (
          <span className="cx-status off">{doc.voided_by ? t.cancelled(doc.voided_by) : t.cancelled("")}</span>
        ) : doc.kind === "credit_note" ? (
          <span className="cx-pill">{doc.against ? t.against(doc.against) : t.creditNote}</span>
        ) : owes ? (
          <span className="cx-pill due">{t.due(written(totals.balance_minor, doc, lang))}</span>
        ) : (
          <span className="cx-pill good">{t.paid}</span>
        )}
      </section>

      <section className="cx-section" style={{ "--i": 1 } as React.CSSProperties}>
        <h2>{t.lines}</h2>
        <div className="cx-card">
          {doc.lines.map((line, i) => (
            <div key={i} className="cx-row">
              <div className="cx-row-text">
                <b dir="auto">{name(line)}</b>
                <span className="num">
                  <bdi>{line.quantity.replace(/\.?0+$/, "")} {line.unit[lang]} × {written(line.unit_price_minor, doc, lang)}</bdi>
                </span>
              </div>
              <bdi className="num">{written(line.line_total_minor, doc, lang)}</bdi>
            </div>
          ))}
          {rows.map(([label, minor]) => (
            <div key={label} className="cx-row" style={{ minHeight: 48 }}>
              <div className="cx-row-text"><span>{label}</span></div>
              <bdi className="num">{written(minor, doc, lang)}</bdi>
            </div>
          ))}
          <div className="cx-row">
            <div className="cx-row-text"><b>{t.total}</b></div>
            <b className="num"><bdi>{written(totals.total_minor, doc, lang)}</bdi></b>
          </div>
          {isInvoiceLike && (
            <>
              <div className="cx-row" style={{ minHeight: 48 }}>
                <div className="cx-row-text"><span>{t.paidLabel}</span></div>
                <bdi className="num">{written(totals.paid_minor, doc, lang)}</bdi>
              </div>
              <div className="cx-row" style={{ minHeight: 48 }}>
                <div className="cx-row-text"><b>{t.balance}</b></div>
                <b className="num"><bdi>{written(totals.balance_minor, doc, lang)}</bdi></b>
              </div>
            </>
          )}
        </div>
      </section>

      {doc.payments.length > 0 && (
        <section className="cx-section" style={{ "--i": 2 } as React.CSSProperties}>
          <h2>{t.payments}</h2>
          <div className="cx-card">
            {doc.payments.map((p, i) => (
              <div key={i} className="cx-row" style={{ minHeight: 52 }}>
                <div className="cx-row-text"><b>{p.method[lang]}</b></div>
                <bdi className="num">{written(p.amount_minor, doc, lang)}</bdi>
              </div>
            ))}
          </div>
        </section>
      )}

      {failed && <p className="cx-error" role="alert">{t.downloadFailed}</p>}
      <button className="cx-btn" style={{ "--i": 3 } as React.CSSProperties} onClick={download} disabled={busy || !token}>
        <Glyph name="download" />{busy ? t.preparing : t.download}
      </button>
    </Frame>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocumentPage />
    </Suspense>
  );
}
