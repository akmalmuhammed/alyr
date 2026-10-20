"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Done, Empty, Frame, Glyph } from "../../../_customer/Frame";
import { amount as amountOf, currency, formatPrice, type Lang } from "../../../_customer/price";

// The payment page (ALY-73, ALY-112). A payment link is pending, paid, or expired: a pay-link
// order that was not paid inside its hold (or was cancelled) is released, its items go back
// on the shelf, and the link stops paying. Such a link says so and offers the way back to
// the shop; it never keeps a Pay button that does nothing.

type Payment = {
  shop: string; shop_ar: string | null; slug: string | null; customer: string; amount: number;
  status: "pending" | "paid" | "expired"; order_number: number | null; order_id: string | null; lang: Lang;
  document_number?: string | null;
};

const T = {
  en: {
    context: "Payment", eyebrow: "Secure payment", pay: (shop: string) => `Pay ${shop}`,
    standIn: "Test payment page. No money moves.",
    customer: "Customer", for: "For", order: (n: number) => `Order #${n}`, account: "Your account",
    method: "Method", card: "Debit card (NAPS) · test", button: (a: string) => `Pay ${a}`,
    paid: (a: string) => `Paid ${a}`, back: "Thank you. You can go back to WhatsApp; your receipt is there.",
    track: "Track this order", invalid: "This payment link is not valid.",
    expiredTitle: "This order was released",
    expiredText: "It was not paid in time, so the items were put back for other customers. Nothing was charged.",
    again: "Order again", paying: "Paying…",
    failed: "The payment did not go through. Please try again.",
    invoice: (n: string) => `Invoice ${n}`,
    docBack: (shop: string) => `Thank you. Your receipt will reach you from ${shop}.`,
    docClosedTitle: "This payment link is closed",
    docClosedText: "The invoice was paid, changed or cancelled. Nothing was charged. Ask the shop if you are not sure.",
  },
  ar: {
    context: "دفع", eyebrow: "دفع آمن", pay: (shop: string) => `ادفع إلى ${shop}`,
    standIn: "صفحة دفع تجريبية. لا تُنقل أي أموال.",
    customer: "العميل", for: "مقابل", order: (n: number) => `الطلب رقم ${n}`, account: "حسابك",
    method: "طريقة الدفع", card: "بطاقة خصم (NAPS) · تجريبي", button: (a: string) => `ادفع ${a}`,
    paid: (a: string) => `تم دفع ${a}`, back: "شكراً لك. يمكنك العودة إلى واتساب؛ الإيصال هناك.",
    track: "تتبّع هذا الطلب", invalid: "رابط الدفع هذا غير صالح.",
    expiredTitle: "أُلغي هذا الطلب لانتهاء مهلة الدفع",
    expiredText: "لم يُدفع في الوقت المحدد، فأُعيدت الأصناف إلى القائمة. لم يُخصم أي مبلغ.",
    again: "اطلب مرة أخرى", paying: "جارٍ الدفع…",
    failed: "لم تتم عملية الدفع. حاول مرة أخرى.",
    invoice: (n: string) => `فاتورة ${n}`,
    docBack: (shop: string) => `شكراً لك. سيصلك إيصالك من ${shop}.`,
    docClosedTitle: "رابط الدفع هذا مغلق",
    docClosedText: "الفاتورة دُفعت أو عُدّلت أو أُلغيت. لم يُخصم أي مبلغ. اسأل المتجر إن لم تكن متأكداً.",
  },
};

/** The order page, with the customer's own link if this tab already has it (the order page
 *  keeps it for the tab), else the shop's public page. */
function shopPath(slug: string | null): string | null {
  if (!slug) return null;
  let token = "";
  try { token = sessionStorage.getItem(`alyr-link:${slug}`) ?? ""; } catch { /* no storage */ }
  return `/s/${slug}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}

export default function PayPage() {
  const { tenant, payment } = useParams<{ tenant: string; payment: string }>();
  const [data, setData] = useState<Payment | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [lang, setLang] = useState<Lang | null>(null);

  useEffect(() => {
    fetch(`/api/pay/${tenant}/${payment}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: Payment) => { setData(p); setLang((current) => current ?? (p.lang === "ar" ? "ar" : "en")); })
      .catch(() => setMissing(true));
  }, [tenant, payment]);

  async function pay() {
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/pay/${tenant}/${payment}/complete`, { method: "POST" }).catch(() => null);
    if (response?.ok) setData((d) => (d ? { ...d, status: "paid" } : d));
    // The hold ran out while the page was open: the link is released, and it says so.
    else if (response?.status === 409) setData((d) => (d ? { ...d, status: "expired" } : d));
    else setError(true);
    setBusy(false);
  }

  const t = T[lang ?? "en"];
  if (missing) return <Empty text={t.invalid} />;
  if (!data || !lang) return null;
  const shop = lang === "ar" && data.shop_ar ? data.shop_ar : data.shop;
  const money = formatPrice(data.amount, lang);
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  const trackLink = data.order_id ? `/t/${tenant}/${data.order_id}` : null;

  if (data.status === "paid") {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.paid(money)}>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          {data.document_number && <p>{t.invoice(data.document_number)}</p>}
          <p>{data.document_number ? t.docBack(shop) : t.back}</p>
        </Done>
        {trackLink && <a className="cx-btn ink" href={trackLink}>{t.track}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  if (data.status === "expired") {
    const again = shopPath(data.slug);
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <section className="cx-done" role="status">
          <h1>{data.document_number ? t.docClosedTitle : t.expiredTitle}</h1>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          {data.document_number && <p>{t.invoice(data.document_number)}</p>}
          <p>{data.document_number ? t.docClosedText : t.expiredText}</p>
        </section>
        {again && !data.document_number && <a className="cx-btn" href={again}>{t.again}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
      <p className="cx-warn" style={{ "--i": 0 } as React.CSSProperties}>{t.standIn}</p>
      <section className="cx-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="cx-amount">
          <h1>{t.pay(shop)}</h1>
          <b className="num" dir={lang === "ar" ? undefined : "ltr"}>{amountOf(data.amount)}<small>{currency(lang)}</small></b>
        </div>
        <div className="cx-kv"><span>{t.customer}</span><b>{data.customer}</b></div>
        <div className="cx-kv"><span>{t.for}</span><b>{data.order_number ? t.order(data.order_number) : data.document_number ? t.invoice(data.document_number) : t.account}</b></div>
        <div className="cx-kv"><span>{t.method}</span><b className="cx-card-brand"><i aria-hidden="true" />{t.card}</b></div>
      </section>
      {error && <p className="cx-error" role="alert" style={{ "--i": 2 } as React.CSSProperties}>{t.failed}</p>}
      <button className="cx-btn" style={{ "--i": 2 } as React.CSSProperties} onClick={pay} disabled={busy}>
        <Glyph name="card" />{busy ? t.paying : t.button(money)}
      </button>
      {trackLink && (
        <a className="cx-btn ghost" style={{ "--i": 3 } as React.CSSProperties} href={trackLink}>{t.track}</a>
      )}
    </Frame>
  );
}
