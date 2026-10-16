"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Done, Empty, Frame, Glyph, type Lang } from "../../../_customer/Frame";

type Payment = {
  shop: string; shop_ar: string | null; customer: string; amount: number; amount_text: string;
  status: "pending" | "paid"; order_number: number | null; order_id: string | null;
};

const T = {
  en: {
    context: "Payment", eyebrow: "Secure payment", pay: (shop: string) => `Pay ${shop}`,
    standIn: "Test payment page. No money moves. A Qatar payment gateway replaces this before launch.",
    customer: "Customer", for: "For", order: (n: number) => `Order #${n}`, account: "Your account",
    method: "Method", card: "Debit card (NAPS) · test", button: (a: string) => `Pay QAR ${a}`,
    paid: (a: string) => `Paid QAR ${a}`, back: "Thank you. You can go back to WhatsApp; your receipt is there.",
    track: "Track this order", invalid: "This payment link is not valid.",
  },
  ar: {
    context: "دفع", eyebrow: "دفع آمن", pay: (shop: string) => `ادفع إلى ${shop}`,
    standIn: "صفحة دفع تجريبية. لا تُنقل أي أموال. ستحل محلها بوابة دفع قطرية قبل الإطلاق.",
    customer: "العميل", for: "مقابل", order: (n: number) => `الطلب رقم ${n}`, account: "حسابك",
    method: "طريقة الدفع", card: "بطاقة خصم (NAPS) · تجريبي", button: (a: string) => `ادفع ${a} ر.ق`,
    paid: (a: string) => `تم دفع ${a} ر.ق`, back: "شكراً لك. يمكنك العودة إلى واتساب؛ الإيصال هناك.",
    track: "تتبّع هذا الطلب", invalid: "رابط الدفع هذا غير صالح.",
  },
};

export default function PayPage() {
  const { tenant, payment } = useParams<{ tenant: string; payment: string }>();
  const [data, setData] = useState<Payment | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];

  useEffect(() => {
    fetch(`/api/pay/${tenant}/${payment}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setMissing(true));
  }, [tenant, payment]);

  async function pay() {
    setBusy(true);
    const response = await fetch(`/api/pay/${tenant}/${payment}/complete`, { method: "POST" });
    if (response.ok) setData((d) => (d ? { ...d, status: "paid" } : d));
    setBusy(false);
  }

  if (missing) return <Empty text={t.invalid} />;
  if (!data) return null;
  const shop = lang === "ar" && data.shop_ar ? data.shop_ar : data.shop;
  const amount = data.amount_text.replace(/^QAR\s*/, "");
  const toggle = () => setLang(lang === "en" ? "ar" : "en");
  const trackLink = data.order_id ? `/t/${tenant}/${data.order_id}` : null;

  if (data.status === "paid") {
    return (
      <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
        <Done title={t.paid(amount)}>
          {data.order_number && <p>{t.order(data.order_number)}</p>}
          <p>{t.back}</p>
        </Done>
        {trackLink && <a className="cx-btn ink" href={trackLink}>{t.track}<Glyph name="arrow" className="flip" /></a>}
      </Frame>
    );
  }

  return (
    <Frame lang={lang} onLang={toggle} shop={shop} context={t.context} short>
      <p className="cx-warn" style={{ "--i": 0 } as React.CSSProperties}>{t.standIn}</p>
      <section className="cx-card" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="cx-amount">
          <span>{t.pay(shop)}</span>
          <b className="num" dir="ltr">{amount}<small>QAR</small></b>
        </div>
        <div className="cx-kv"><span>{t.customer}</span><b>{data.customer}</b></div>
        <div className="cx-kv"><span>{t.for}</span><b>{data.order_number ? t.order(data.order_number) : t.account}</b></div>
        <div className="cx-kv"><span>{t.method}</span><b className="cx-card-brand"><i aria-hidden="true" />{t.card}</b></div>
      </section>
      <button className="cx-btn" style={{ "--i": 2 } as React.CSSProperties} onClick={pay} disabled={busy}>
        <Glyph name="card" />{t.button(amount)}
      </button>
      {trackLink && (
        <a className="cx-btn ghost" style={{ "--i": 3 } as React.CSSProperties} href={trackLink}>{t.track}</a>
      )}
    </Frame>
  );
}
